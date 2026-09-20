import { chunkSource, sliceWindow, splitWindow } from './chunker.js';
import { buildRequest, PROMPT_VERSION } from './prompt.js';
import { SearchError, type Batch, type BatchItem, type Plan, type PlanOutput, type SearchOptions, type Source, type Window } from './types.js';

export const BATCH_LIMITS = { windows: 8, bytes: 24 * 1024, wholeFileBytes: 12 * 1024 };
type RequestOptions = Pick<SearchOptions, 'query' | 'model'>;
export function makeCombinedBatch(items: BatchItem[], options: RequestOptions): Batch {
  const request = buildRequest(options.query, options.model, items);
  return { items, request, requestBytes: Buffer.byteLength(JSON.stringify(request)) };
}
export function makeBatch(source: Source, windows: Window[], options: RequestOptions): Batch {
  return makeCombinedBatch(windows.map(window => ({ source, window })), options);
}
function initialWindows(source: Source, options: RequestOptions): Window[] {
  if (!source.bytes.length) return [];
  if (source.bytes.length <= BATCH_LIMITS.wholeFileBytes) {
    const window = sliceWindow(source, 0, source.bytes.length);
    if (makeBatch(source, [window], options).requestBytes <= BATCH_LIMITS.bytes) return [window];
  }
  return chunkSource(source);
}
export function packSources(sources: Source[], options: RequestOptions, maxWindows = BATCH_LIMITS.windows): Batch[] {
  const batches: Batch[] = [];
  const queue = sources.flatMap(source => initialWindows(source, options).map(window => ({ source, window })));
  let current: BatchItem[] = [];
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i]!;
    const candidate = makeCombinedBatch([...current, item], options);
    if (current.length && (candidate.requestBytes > BATCH_LIMITS.bytes || current.length >= maxWindows)) {
      batches.push(makeCombinedBatch(current, options));
      current = [];
      i--;
    } else if (!current.length && candidate.requestBytes > BATCH_LIMITS.bytes) {
      const children = splitWindow(item.source, item.window);
      if (!children.length) throw new SearchError({ code: 'request_too_large', message: 'A query or source item cannot fit the request budget.', path: item.source.path });
      queue.splice(i, 1, ...children.map(window => ({ source: item.source, window })));
      i--;
    } else current.push(item);
  }
  if (current.length) batches.push(makeCombinedBatch(current, options));
  return batches;
}
export function packSource(source: Source, options: RequestOptions, maxWindows = BATCH_LIMITS.windows): Batch[] {
  return packSources([source], options, maxWindows);
}
export function finishPlan(plan: Plan, options: SearchOptions, maxWindows?: number): Plan {
  plan.batches.push(...packSources(plan.sources, options, maxWindows));
  plan.stats.plannedWindows = plan.batches.reduce((n, b) => n + b.items.length, 0);
  plan.stats.plannedRequests = plan.batches.length;
  return plan;
}
export function planOutput(plan: Plan, options: SearchOptions): PlanOutput {
  return { schemaVersion: 2, kind: 'plan', query: options.query, model: options.model, promptVersion: PROMPT_VERSION,
    complete: !plan.errors.length,
    files: plan.sources.map(s => {
      const batches = plan.batches.filter(b => b.items.some(item => item.source === s));
      return { path: s.path, bytes: s.bytes.length,
        windows: batches.reduce((n, b) => n + b.items.filter(item => item.source === s).length, 0),
        contextFiles: [...new Set(batches.flatMap(b => b.items.filter(item => item.source !== s).map(item => item.source.path)))],
      };
    }),
    exclusions: plan.exclusions, sourceBytes: plan.stats.sourceBytes,
    plannedWindows: plan.stats.plannedWindows, plannedRequests: plan.batches.length,
    plannedRequestBytes: plan.batches.reduce((n, b) => n + b.requestBytes, 0),
    uncachedRequests: plan.stats.uncachedRequests,
    uncachedRequestBytes: plan.batches.filter(b => !b.cached).reduce((n, b) => n + b.requestBytes, 0),
    cacheHits: plan.stats.cacheHits, errors: plan.errors };
}
