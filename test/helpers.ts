import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DEFAULTS } from '../src/config.js';
import type { Evaluation, EvaluationRequest, SearchOptions } from '../src/types.js';

export async function fixture(files: Record<string, string | Buffer>) {
  const cwd = await mkdtemp(join(await realpath(tmpdir()), 'nlgrep-test-'));
  for (const [name, contents] of Object.entries(files)) {
    await mkdir(dirname(join(cwd, name)), { recursive: true });
    await writeFile(join(cwd, name), contents);
  }
  return { cwd, cleanup: () => rm(cwd, { recursive: true, force: true }) };
}
export function options(cwd: string, overrides: Partial<SearchOptions> = {}): SearchOptions {
  return { ...DEFAULTS, cwd, query: 'network retry', paths: ['.'], globs: [], hidden: false, noIgnore: false,
    filesOnly: false, nullSeparator: false, json: false, dryRun: false, cache: false, ...overrides };
}
export function evaluation(request: EvaluationRequest, probabilities?: number[]): Evaluation {
  return { model: request.model, probabilities: probabilities ?? request.state.windows.map(() => 0.9), usage: { inputTokens: 10, outputTokens: 1 } };
}
