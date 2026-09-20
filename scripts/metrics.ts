import type { SearchOutput } from '../src/types.js';

export interface EvalCase {
  id: string;
  category: string;
  language: string;
  split: string;
  scenario: string;
  query: string;
  paths: string[];
  expected: string[];
  expectedLines: Record<string, [number, number]>;
}
export interface CaseResult { case: EvalCase; output: SearchOutput }
export function metrics(rows: CaseResult[], threshold: number) {
  const positives = rows.filter(r => r.case.expected.length);
  const negatives = rows.filter(r => !r.case.expected.length);
  let recall = 0, precision = 0, falseAlarms = 0, windows = 0, supportedWindows = 0;
  let conditionHits = 0, conditionViolations = 0;
  for (const row of rows) {
    const found = row.output.files.filter(f => f.rank >= threshold).slice(0, 10);
    const relevant = found.filter(f => row.case.expected.includes(f.path));
    if (row.case.expected.length) {
      recall += relevant.length / row.case.expected.length;
      precision += found.length ? relevant.length / found.length : 0;
    } else if (found.length) falseAlarms++;
    if (['Q01', 'Q02', 'Q04', 'Q05', 'Q06', 'Q07', 'Q08', 'Q09'].includes(row.case.scenario)) {
      conditionHits += found.length;
      conditionViolations += found.length - relevant.length;
    }
    for (const file of found) for (const match of file.matches.filter(m => m.matchProbability >= threshold)) {
      windows++;
      const range = row.case.expectedLines[file.path];
      if (range && match.startLine <= range[1] && match.endLine >= range[0]) supportedWindows++;
    }
  }
  return {
    queries: rows.length, completeQueries: rows.filter(r => r.output.complete).length,
    positiveQueries: positives.length, negativeQueries: negatives.length,
    recallAt10: positives.length ? recall / positives.length : null,
    precisionAt10: positives.length ? precision / positives.length : null,
    noMatchFalsePositiveRate: negatives.length ? falseAlarms / negatives.length : null,
    conditionViolations, conditionHits,
    conditionViolationRate: conditionHits ? conditionViolations / conditionHits : null,
    evidenceOverlapPrecision: windows ? supportedWindows / windows : null,
    windows, supportedWindows,
  };
}
export function groupedMetrics(rows: CaseResult[], threshold: number) {
  return Object.fromEntries(['split', 'category', 'language', 'scenario'].map(field => {
    const key = field as 'split' | 'category' | 'language' | 'scenario';
    return [key, Object.fromEntries([...new Set(rows.map(r => r.case[key]))].sort()
      .map(value => [value, metrics(rows.filter(r => r.case[key] === value), threshold)]))];
  }));
}
