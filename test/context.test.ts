import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { makeSource } from '../src/chunker.js';
import { BATCH_LIMITS, packSources, planOutput } from '../src/planner.js';
import { prepare, search } from '../src/search.js';
import { createJevEvaluator } from '../src/jev.js';
import { evaluation, fixture, options } from './helpers.js';

test('a long function fits whole, with checks and reads in the same model input', async () => {
  const sources = await Promise.all(['a.ts', 'b.ts'].map(async name =>
    makeSource(name, await readFile(`eval/corpus/supplemental/${name}`))));
  const batches = packSources(sources, options('.'));
  assert.equal(batches.length, 1);
  assert.equal(batches[0]!.items.length, 2);
  for (let i = 0; i < sources.length; i++) {
    const window = batches[0]!.request.state.windows[i]!;
    assert.equal(window.wholeFile, true);
    assert.equal(window.startLine, 1);
    assert.equal(window.endLine, sources[i]!.lineCount);
    assert.equal(window.text, sources[i]!.bytes.toString('utf8'));
  }
});

test('cross-file context reaches the SDK and scores map to their own snapshots', async t => {
  const f = await fixture({
    'handler.ts': 'import { run } from "./shell.js";\nexport const handler = req => run(req.query.cmd);',
    'shell.ts': 'import { exec } from "node:child_process";\nexport const run = cmd => exec(cmd);',
  }); t.after(f.cleanup);
  let calls = 0;
  const evaluator = createJevEvaluator('synthetic-key', async (_, init) => {
    calls++;
    const request = JSON.parse(String(init?.body));
    assert.deepEqual(request.state.files.map((x: { path: string }) => x.path), ['handler.ts', 'shell.ts']);
    assert.ok(request.state.windows[1].text.includes('exec(cmd)'));
    return new Response(JSON.stringify({ model: 'jev-1.13.0', answers: { w0: { type: 'noul', noul: 0.95 }, w1: { type: 'noul', noul: 0.1 } }, usage: { input_tokens: 30, output_tokens: 1 } }), { headers: { 'content-type': 'application/json' } });
  });
  const opts = options(f.cwd);
  const { plan } = await prepare(opts);
  assert.deepEqual(planOutput(plan, opts).files[0]!.contextFiles, ['shell.ts']);
  const result = await search(opts, { evaluator });
  assert.equal(calls, 1);
  assert.deepEqual(result.files.map(x => x.path), ['handler.ts']);
  const match = result.files[0]!.matches[0]!;
  assert.ok(match.text.startsWith('import { run }'));
  assert.equal(match.context[0]!.path, 'shell.ts');
  assert.ok(match.context[0]!.text.includes('exec(cmd)'));
  assert.equal(match.context[0]!.sourceHash, plan.sources[1]!.hash);
});

test('editing support context invalidates its batch while unrelated batches remain cached', async t => {
  const f = await fixture(Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`${String(i).padStart(2, '0')}.ts`, `const x${i} = ${i};`]))); t.after(f.cleanup);
  const opts = options(f.cwd, { cache: true });
  const evaluator = { evaluate: async (r: Parameters<typeof evaluation>[0]) => evaluation(r) };
  const first = await search(opts, { evaluator });
  assert.equal(first.stats.attemptedRequests, 2);
  const cached = await search({ ...opts, maxRequests: 0 }, { env: {} });
  assert.equal(cached.stats.cacheHits, 2);
  await writeFile(join(f.cwd, '01.ts'), 'const x1 = "changed support";');
  const next = await search(opts, { evaluator });
  assert.equal(next.stats.attemptedRequests, 1);
  assert.equal(next.stats.cacheHits, 1);
  assert.ok(next.files.find(x => x.path === '00.ts')!.matches[0]!.context.some(x => x.text.includes('changed support')));
});

test('large files retain every byte and all requests obey serialized limits', () => {
  const sources = [makeSource('large.ts', Buffer.from('const x = "中🙂";\n'.repeat(2000))),
    makeSource('escaped.txt', Buffer.from('\x01'.repeat(12000)))];
  const batches = packSources(sources, options('.'));
  assert.ok(batches.every(b => b.requestBytes <= BATCH_LIMITS.bytes && b.items.length <= BATCH_LIMITS.windows));
  for (const source of sources) {
    const coverage = new Uint8Array(source.bytes.length);
    for (const batch of batches) for (const item of batch.items.filter(i => i.source === source)) {
      coverage.fill(1, item.window.startByte, item.window.endByte);
      assert.equal(item.window.text, source.bytes.subarray(item.window.startByte, item.window.endByte).toString('utf8'));
    }
    assert.ok(coverage.every(Boolean));
  }
  assert.ok(batches.flatMap(b => b.request.state.windows).every(w => !w.wholeFile));
});

test('context splitting retains file identities and reports only the context actually sent', async t => {
  const f = await fixture({ a: 'first', b: 'second', c: 'third' }); t.after(f.cleanup);
  const { EvaluationError } = await import('../src/jev.js');
  let calls = 0;
  const result = await search(options(f.cwd), { evaluator: { evaluate: async r => {
    calls++;
    if (calls === 1) throw new EvaluationError('api_422', 'Too long.', false, undefined, true);
    return evaluation(r);
  } } });
  assert.equal(result.complete, true);
  assert.equal(calls, 3);
  assert.deepEqual(result.files.map(f => f.path), ['a', 'b', 'c']);
  assert.deepEqual(result.files[0]!.matches[0]!.context.map(w => w.path), ['b']);
  assert.deepEqual(result.files[2]!.matches[0]!.context, []);
});
