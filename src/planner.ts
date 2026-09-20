import { chunkSource, splitWindow } from './chunker.js';
import { buildRequest, PROMPT_VERSION } from './prompt.js';
import { SearchError, type Batch, type Plan, type PlanOutput, type SearchOptions, type Source, type Window } from './types.js';

export const BATCH_LIMITS = { windows: 8, bytes: 24 * 1024 };
export function makeBatch(source: Source, windows: Window[], options: Pick<SearchOptions, 'query' | 'model'>): Batch {
  const request = buildRequest(options.query, options.model, source, windows);
  return { source, windows, request, requestBytes: Buffer.byteLength(JSON.stringify(request)) };
}
export function packSource(source: Source, options: Pick<SearchOptions, 'query' | 'model'>, maxWindows = BATCH_LIMITS.windows): Batch[] {
  const batches: Batch[] = [];
  const queue = chunkSource(source);
  let current: Window[] = [];
  for (let i = 0; i < queue.length; i++) {
    const w = queue[i]!;
    const candidate = makeBatch(source, [...current, w], options);
    if (current.length && (candidate.requestBytes > BATCH_LIMITS.bytes || current.length >= maxWindows)) {
      batches.push(makeBatch(source, current, options));
      current = [];
      i--;
    } else if (!current.length && candidate.requestBytes > BATCH_LIMITS.bytes) {
      const children = splitWindow(source, w);
      if (!children.length) throw new SearchError({ code: 'request_too_large', message: 'A query or source item cannot fit the request budget.', path: source.path });
      queue.splice(i, 1, ...children);
      i--;
    } else current.push(w);
  }
  if (current.length) batches.push(makeBatch(source, current, options));
  return batches;
}
export function finishPlan(plan: Plan, options: SearchOptions, maxWindows?: number): Plan {
  for (const source of plan.sources) plan.batches.push(...packSource(source, options, maxWindows));
  plan.stats.plannedWindows = plan.batches.reduce((n, b) => n + b.windows.length, 0);
  plan.stats.plannedRequests = plan.batches.length;
  return plan;
}
export function planOutput(plan: Plan, options: SearchOptions): PlanOutput {
  return { schemaVersion: 1, kind: 'plan', query: options.query, model: options.model, promptVersion: PROMPT_VERSION,
    complete: !plan.errors.length,
    files: plan.sources.map(s => ({ path: s.path, bytes: s.bytes.length,
      windows: plan.batches.filter(b => b.source === s).reduce((n, b) => n + b.windows.length, 0) })),
    exclusions: plan.exclusions, sourceBytes: plan.stats.sourceBytes,
    plannedWindows: plan.stats.plannedWindows, plannedRequests: plan.batches.length,
    plannedRequestBytes: plan.batches.reduce((n, b) => n + b.requestBytes, 0),
    uncachedRequests: plan.stats.uncachedRequests,
    uncachedRequestBytes: plan.batches.filter(b => !b.cached).reduce((n, b) => n + b.requestBytes, 0),
    cacheHits: plan.stats.cacheHits, errors: plan.errors };
}
