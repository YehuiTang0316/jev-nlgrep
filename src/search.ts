import { setTimeout as delay } from 'node:timers/promises';
import { applyCache, ResultCache } from './cache.js';
import { splitWindow } from './chunker.js';
import { resolveApiKey } from './config.js';
import { createJevEvaluator, EvaluationError, type Evaluator } from './jev.js';
import { finishPlan, makeCombinedBatch } from './planner.js';
import { PROMPT_VERSION } from './prompt.js';
import { changedSources, scan } from './scanner.js';
import { issueFrom, SearchError, type Batch, type Evaluation, type FileResult, type Plan, type SearchOptions, type SearchOutput } from './types.js';

export interface SearchDependencies {
  evaluator?: Evaluator;
  signal?: AbortSignal;
  stdin?: AsyncIterable<Uint8Array | string>;
  env?: NodeJS.ProcessEnv;
  onProgress?: (evaluated: number, total: number, attempts: number, cacheHits: number) => void;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  batchWindows?: number;
}
export async function prepare(options: SearchOptions, dependencies: SearchDependencies = {}): Promise<{ plan: Plan; cache: ResultCache }> {
  const plan = await scan(options, dependencies.stdin, dependencies.signal);
  try { finishPlan(plan, options, dependencies.batchWindows); }
  catch (error) { plan.errors.push(issueFrom(error)); }
  const cache = new ResultCache(options.cwd, options.cache, options.model);
  await applyCache(plan, options, cache);
  return { plan, cache };
}

export async function execute(plan: Plan, options: SearchOptions, cache: ResultCache, dependencies: SearchDependencies = {}): Promise<SearchOutput> {
  const start = performance.now();
  const stats = plan.stats;
  const output: SearchOutput = { schemaVersion: 2, query: options.query, modelRequested: options.model,
    modelsUsed: [], promptVersion: PROMPT_VERSION, threshold: options.threshold, evidenceScope: 'provided-context',
    complete: false, outputLimited: false, files: [], stats, errors: [...plan.errors], warnings: [] };
  const files = new Map<string, FileResult>();
  const models = new Set<string>();
  const internal = new AbortController();
  const signal = dependencies.signal ? AbortSignal.any([internal.signal, dependencies.signal]) : internal.signal;
  const sleep = dependencies.sleep ?? ((ms, s) => delay(ms, undefined, { signal: s }));
  const collect = (batch: Batch, result: Evaluation, cached: boolean) => {
    if (result.probabilities.length !== batch.items.length || result.probabilities.some(p => !Number.isFinite(p) || p < 0 || p > 1)) {
      throw new SearchError({ code: 'protocol_error', message: 'Jev returned invalid window probabilities.' });
    }
    models.add(result.model);
    stats.evaluatedWindows += batch.items.length;
    if (cached) stats.cachedWindows += batch.items.length;
    else { stats.successfulRequests++; stats.inputTokens += result.usage.inputTokens; stats.outputTokens += result.usage.outputTokens; }
    batch.items.forEach(({ source, window }, index) => {
      const p = result.probabilities[index]!;
      if (p < options.threshold) return;
      const entry = files.get(source.path) ?? { path: source.path, sourceHash: source.hash, rank: 0, matches: [] };
      entry.rank = Math.max(entry.rank, p);
      entry.matches.push({ ...window, matchProbability: p, context: batch.request.state.windows.filter((_, i) => i !== index) });
      files.set(entry.path, entry);
    });
    dependencies.onProgress?.(stats.evaluatedWindows, stats.plannedWindows, stats.attemptedRequests, stats.cacheHits);
  };
  const recordFailure = (error: unknown) => {
    if (internal.signal.aborted || dependencies.signal?.aborted) return;
    output.errors.push(error instanceof EvaluationError ? { code: error.code, message: error.safeMessage } : issueFrom(error));
    internal.abort();
  };
  if (!output.errors.length && !signal.aborted) {
    try {
      for (const batch of plan.batches) if (batch.cached) collect(batch, batch.cached, true);
      let evaluator = dependencies.evaluator;
      if (stats.uncachedRequests && !evaluator) evaluator = createJevEvaluator(await resolveApiKey(options.cwd, dependencies.env));
      const evaluateBatch = async (batch: Batch, split = false): Promise<void> => {
        for (let retry = 0; retry <= 2; retry++) {
          signal.throwIfAborted();
          if (stats.attemptedRequests >= options.maxRequests) throw new SearchError({ code: 'request_budget', message: 'The request budget was exhausted, including retries.' });
          stats.attemptedRequests++;
          try {
            const result = await evaluator!.evaluate(batch.request, signal);
            collect(batch, result, false);
            if (!await cache.put(batch, result) && !output.warnings.some(w => w.code === 'cache_write')) {
              output.warnings.push({ code: 'cache_write', message: 'Could not save local decisions; future runs may need API requests.' });
            }
            return;
          } catch (error) {
            stats.usageComplete = false;
            if (signal.aborted) throw error;
            if (error instanceof EvaluationError && error.contextTooLong && !split) {
              const groups = batch.items.length > 1 ? [batch.items.slice(0, Math.ceil(batch.items.length / 2)), batch.items.slice(Math.ceil(batch.items.length / 2))]
                : splitWindow(batch.items[0]!.source, batch.items[0]!.window).map(window => [{ source: batch.items[0]!.source, window }]);
              if (!groups.length) throw error;
              stats.plannedWindows += groups.reduce((n, g) => n + g.length, 0) - batch.items.length;
              for (const group of groups) await evaluateBatch(makeCombinedBatch(group, options), true);
              return;
            }
            if (!(error instanceof EvaluationError) || !error.retryable || retry === 2) throw error;
            await sleep(error.retryAfterMs ?? Math.round(Math.min(5000, 500 * 2 ** retry) * (0.75 + Math.random() * 0.25)), signal);
          }
        }
      };
      const pending = plan.batches.filter(b => !b.cached);
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(options.concurrency, pending.length) }, async () => {
        while (!signal.aborted) {
          const batch = pending[next++];
          if (!batch) return;
          try { await evaluateBatch(batch); }
          catch (error) { recordFailure(error); return; }
        }
      }));
      if (!dependencies.signal?.aborted) output.errors.push(...await changedSources(plan.sources, dependencies.signal));
    } catch (error) { recordFailure(error); }
  }
  if (dependencies.signal?.aborted && !output.errors.some(e => e.code === 'cancelled')) output.errors.push({ code: 'cancelled', message: 'Search cancelled.' });
  const allFiles = [...files.values()].sort((a, b) => b.rank - a.rank || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const file of allFiles) file.matches.sort((a, b) => a.startByte - b.startByte || a.endByte - b.endByte);
  stats.matchedFiles = allFiles.length;
  output.files = options.top ? allFiles.slice(0, options.top) : allFiles;
  stats.returnedFiles = output.files.length;
  output.outputLimited = output.files.length < allFiles.length;
  output.modelsUsed = [...models].sort();
  output.complete = !output.errors.length && stats.evaluatedWindows === stats.plannedWindows;
  stats.elapsedMs = Math.round(performance.now() - start);
  return output;
}

export async function search(options: SearchOptions, dependencies: SearchDependencies = {}): Promise<SearchOutput> {
  const start = performance.now();
  const { plan, cache } = await prepare(options, dependencies);
  const output = await execute(plan, options, cache, dependencies);
  output.stats.elapsedMs = Math.round(performance.now() - start);
  return output;
}
export function exitCode(output: SearchOutput): number {
  if (output.errors.some(e => e.code === 'cancelled')) return 130;
  if (!output.complete) return 2;
  return output.files.length ? 0 : 1;
}
