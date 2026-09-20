import { mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { DEFAULTS, resolveApiKey } from '../src/config.js';
import { createJevEvaluator, type Evaluator } from '../src/jev.js';
import { PROMPT_VERSION } from '../src/prompt.js';
import { prepare, search } from '../src/search.js';
import type { SearchOptions } from '../src/types.js';
import { MAX_TEST_USD, TestBudget } from './budget.js';
import { groupedMetrics, metrics, type CaseResult, type EvalCase } from './metrics.js';
import { runSupplemental, supplementalPlan } from './supplemental.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: {
  live: { type: 'boolean', default: false },
  split: { type: 'string', default: 'development' },
  limit: { type: 'string' },
  threshold: { type: 'string', default: String(DEFAULTS.threshold) },
  report: { type: 'string' },
  supplemental: { type: 'boolean', default: false },
  context: { type: 'boolean', default: false },
  'max-attempts': { type: 'string', default: '200' },
} });
if (!['development', 'holdout', 'all'].includes(values.split!)) throw new Error('Invalid --split.');
const threshold = Number(values.threshold);
const limit = values.limit === undefined ? Infinity : Number(values.limit);
if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1 || !(limit > 0) || (limit !== Infinity && !Number.isSafeInteger(limit))) throw new Error('Invalid evaluation options.');
const cases = (JSON.parse(await readFile(join(root, values.context ? 'eval/context-cases.json' : 'eval/cases.json'), 'utf8')) as EvalCase[])
  .filter(c => !values.supplemental && (values.context || values.split === 'all' || c.split === values.split)).slice(0, limit);
const probes = values.supplemental ? await supplementalPlan(root) : [];
if (cases.some(c => c.paths.some(p => !p.startsWith('eval/corpus/') || p.includes('..')))) throw new Error('Only the synthetic evaluation corpus may be sent.');
const options = (c: EvalCase): SearchOptions => ({ ...DEFAULTS, query: c.query, paths: c.paths, cwd: root,
  globs: [], hidden: false, noIgnore: false, threshold: 0, top: 0, filesOnly: false, nullSeparator: false,
  json: true, dryRun: false, concurrency: 2, maxBytes: 1024 * 1024, maxRequests: 8, cache: true });
if (!values.live) {
  let requests = 0, hits = 0;
  for (const c of cases) {
    const { plan } = await prepare(options(c));
    if (plan.errors.length) throw new Error(`Cannot plan ${c.id}: ${plan.errors.map(e => e.code).join(', ')}`);
    requests += plan.stats.uncachedRequests; hits += plan.stats.cacheHits;
  }
  console.log(JSON.stringify({ mode: 'dry-run', cases: cases.length, supplementalProbes: probes.length,
    uncachedRequests: requests + probes.reduce((n, p) => n + p.batches.length, 0), cachedBatches: hits,
    testBudgetUSD: MAX_TEST_USD, note: 'No network calls. Use --live to evaluate with the cumulative budget guard.' }, null, 2));
} else {
  await mkdir(join(root, '.nlgrep'), { recursive: true, mode: 0o700 });
  const lockPath = join(root, '.nlgrep/eval.lock');
  // An existing lock is fail-closed. Never auto-remove it after a crash: another process may still be running.
  const lock = await open(lockPath, 'wx', 0o600).catch(() => { throw new Error('Another live evaluation holds .nlgrep/eval.lock. No requests sent.'); });
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.on('SIGINT', interrupt);
  try {
    await lock.writeFile(String(process.pid));
    const budget = new TestBudget(join(root, '.nlgrep/eval-budget.json'), Number(values['max-attempts']));
    let underlying: Evaluator | undefined;
    const evaluator = budget.wrap({ evaluate: async (request, signal) => {
      underlying ??= createJevEvaluator(await resolveApiKey(root));
      return underlying.evaluate(request, signal);
    } });
    const rows: CaseResult[] = [];
    const report = resolve(root, values.report ?? `eval/results/${values.supplemental ? 'supplemental' : values.context ? 'context' : values.split}.json`);
    await mkdir(dirname(report), { recursive: true });
    if (probes.length) {
      const result = await runSupplemental(probes, evaluator, controller.signal);
      await writeFile(report, JSON.stringify({ generatedAt: new Date().toISOString(), promptVersion: PROMPT_VERSION, budget: budget.ledger, ...result }, null, 2) + '\n');
      console.log(JSON.stringify({ probes: result.rows.map(({ responses, ...row }) => row), budget: budget.ledger, report }, null, 2));
    }
    for (const c of cases) {
      const output = await search(options(c), { evaluator, signal: controller.signal });
      rows.push({ case: c, output });
      const matched = output.files.filter(f => f.rank >= threshold).map(f => f.path);
      console.log(JSON.stringify({ id: c.id, complete: output.complete, matched, expected: c.expected,
        attempts: output.stats.attemptedRequests, cacheHits: output.stats.cacheHits,
        ...(output.errors.length ? { errors: output.errors } : {}) }));
      await writeFile(report, JSON.stringify({ generatedAt: new Date().toISOString(), model: DEFAULTS.model,
        promptVersion: PROMPT_VERSION, threshold, wholeFileBytes: 12288, windowLines: 40, windowBytes: 8192, batchWindows: 8,
        batchBytes: 24576, concurrency: 2, budget: budget.ledger,
        metrics: metrics(rows, threshold), groups: groupedMetrics(rows, threshold), rows }, null, 2) + '\n');
      if (!output.complete) { process.exitCode = controller.signal.aborted ? 130 : 2; break; }
    }
    if (!probes.length) console.log(JSON.stringify({ metrics: metrics(rows, threshold), budget: budget.ledger, report }, null, 2));
  } finally {
    process.off('SIGINT', interrupt);
    await lock.close();
    await unlink(lockPath);
  }
}
