import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeSource, sliceWindow } from '../src/chunker.js';
import { DEFAULTS } from '../src/config.js';
import type { Evaluator } from '../src/jev.js';
import { makeBatch, packSource } from '../src/planner.js';
import type { Batch, Evaluation } from '../src/types.js';

export interface Probe { name: string; purpose: string; expectedMatch: boolean; batches: Batch[] }
export async function supplementalPlan(root: string): Promise<Probe[]> {
  const load = async (name: string) => makeSource(`eval/corpus/supplemental/${name}`, await readFile(join(root, 'eval/corpus/supplemental', name)));
  const sample = await load('batch.log');
  const opts = { query: 'A log record stating that an order request timed out and a retry was scheduled, excluding health checks', model: DEFAULTS.model };
  const batched = packSource(sample, opts);
  // Internal experiment only: non-overlapping 20-line windows. Production limits remain fixed.
  const windows = [];
  let start = 0, lines = 0;
  for (let i = 0; i < sample.bytes.length; i++) if (sample.bytes[i] === 10 && ++lines % 20 === 0) {
    windows.push(sliceWindow(sample, start, i + 1)); start = i + 1;
  }
  if (start < sample.bytes.length) windows.push(sliceWindow(sample, start, sample.bytes.length));
  const probes: Probe[] = [
    { name: '40-lines-batched', purpose: '40 lines / overlap 8 / up to 8 windows per request', expectedMatch: true, batches: batched },
    { name: '40-lines-single', purpose: 'Same production windows, one question per request', expectedMatch: true, batches: packSource(sample, opts, 1) },
    { name: '20-lines-batched', purpose: '20 lines / no overlap / one request; exploratory, not a controlled overlap comparison', expectedMatch: true, batches: [makeBatch(sample, windows, opts)] },
  ];
  const query = 'A handler function that reads a user profile without checking whether the caller is logged in';
  for (const name of ['a.ts', 'b.ts']) {
    const source = await load(name);
    probes.push({ name: `context-${name}`, purpose: name === 'a.ts' ? 'No login check in the complete long function' : 'Login check before the read, outside the final window', expectedMatch: name === 'a.ts', batches: packSource(source, { query, model: DEFAULTS.model }) });
  }
  const latency = await load('latency.txt');
  for (let i = 1; i <= 5; i++) probes.push({ name: `latency-${i}`, purpose: 'Identical one-window input; cache bypassed to measure API latency', expectedMatch: true,
    batches: packSource(latency, { query: 'A subscription that automatically renews unless cancelled', model: DEFAULTS.model }) });
  return probes;
}
export async function runSupplemental(probes: Probe[], evaluator: Evaluator, signal: AbortSignal) {
  const rows = [];
  for (const probe of probes) {
    const started = performance.now();
    const responses: Array<{ windows: Array<{ startLine: number; endLine: number }>; requestBytes: number; result: Evaluation }> = [];
    for (const batch of probe.batches) {
      const result = await evaluator.evaluate(batch.request, signal);
      responses.push({ windows: batch.windows.map(w => ({ startLine: w.startLine, endLine: w.endLine })), requestBytes: batch.requestBytes, result });
    }
    const rank = Math.max(...responses.flatMap(r => r.result.probabilities));
    rows.push({ name: probe.name, purpose: probe.purpose, expectedMatch: probe.expectedMatch,
      matched: rank >= DEFAULTS.threshold, rank, elapsedMs: Math.round(performance.now() - started), responses });
  }
  return { threshold: DEFAULTS.threshold, rows };
}
