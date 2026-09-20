import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { metrics, type CaseResult, type EvalCase } from '../scripts/metrics.js';
import { emptyStats, type SearchOutput } from '../src/types.js';

test('evaluation corpus is balanced, disjoint, and has valid evidence labels', async () => {
  const rows = JSON.parse(await readFile('eval/cases.json', 'utf8')) as EvalCase[];
  assert.equal(rows.length, 40);
  assert.equal(new Set(rows.map(r => r.id)).size, 40);
  assert.equal(rows.filter(r => !r.expected.length).length, 8);
  for (const category of ['code', 'docs', 'logs', 'text']) {
    const group = rows.filter(r => r.category === category);
    assert.equal(group.length, 10); assert.equal(group.filter(r => r.language === 'zh').length, 5);
    assert.equal(group.filter(r => r.split === 'holdout').length, 5);
  }
  for (const row of rows) for (const path of row.paths) {
    const text = await readFile(path, 'utf8');
    if (row.expected.includes(path)) {
      const range = row.expectedLines[path]!;
      assert.ok(range[0] >= 1 && range[1] >= range[0] && range[1] <= text.split('\n').length);
    }
  }
});
test('metrics count empty positive results, false alarms and condition violations', () => {
  const make = (expected: string[], found: string[]): CaseResult => ({
    case: { id: 'sample', category: 'text', language: 'en', split: 'development', scenario: 'Q02', query: 'condition', paths: ['a', 'b'], expected, expectedLines: { a: [1, 1] } },
    output: { schemaVersion: 2, query: 'condition', modelRequested: 'test', modelsUsed: [], promptVersion: 'test', threshold: 0,
      evidenceScope: 'provided-context', complete: true, outputLimited: false, stats: emptyStats(), errors: [], warnings: [],
      files: found.map(path => ({ path, rank: 0.9, sourceHash: '', matches: [{ startLine: 1, endLine: 1, startByte: 0, endByte: 1, fragment: false, text: 'x', matchProbability: 0.9, context: [] }] })) } satisfies SearchOutput,
  });
  const result = metrics([make(['a'], ['a', 'b']), make(['a'], []), make([], ['b'])], 0.7);
  assert.equal(result.recallAt10, 0.5); assert.equal(result.precisionAt10, 0.25);
  assert.equal(result.noMatchFalsePositiveRate, 1); assert.equal(result.conditionViolationRate, 2 / 3);
  assert.equal(result.evidenceOverlapPrecision, 1 / 3);
});
