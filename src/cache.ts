import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PROMPT_VERSION } from './prompt.js';
import type { Batch, Evaluation, Plan, SearchOptions } from './types.js';

export function cacheKey(batch: Batch): string {
  return createHash('sha256').update(PROMPT_VERSION).update('\0').update(JSON.stringify(batch.request)).digest('hex');
}
export class ResultCache {
  private readonly directory: string;
  readonly enabled: boolean;
  constructor(private readonly cwd: string, enabled: boolean, model: string) {
    this.directory = join(cwd, '.nlgrep', 'cache-v1');
    // Moving aliases must not silently reuse judgements from a previous model version.
    this.enabled = enabled && /^jev-\d+\.\d+\.\d+$/.test(model);
  }
  private async safeDirectory(create: boolean): Promise<boolean> {
    for (const dir of [join(this.cwd, '.nlgrep'), this.directory]) {
      try {
        const stat = await lstat(dir);
        if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return false;
        if (!create) return false;
        try { await mkdir(dir, { mode: 0o700 }); }
        catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') return false; }
        try {
          const stat = await lstat(dir);
          if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
        } catch { return false; }
      }
    }
    return true;
  }
  async get(batch: Batch): Promise<Evaluation | undefined> {
    if (!this.enabled || !await this.safeDirectory(false)) return;
    try {
      const key = cacheKey(batch);
      const path = join(this.directory, `${key}.json`);
      const stat = await lstat(path);
      if (!stat.isFile() || stat.size > 64 * 1024) return;
      const entry = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
      if (entry.version !== 1 || entry.key !== key || entry.model !== batch.request.model || !Array.isArray(entry.probabilities) ||
          entry.probabilities.length !== batch.windows.length || !entry.probabilities.every(p => typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1)) return;
      return { model: entry.model, probabilities: entry.probabilities as number[], usage: { inputTokens: 0, outputTokens: 0 } };
    } catch { return; } // A corrupt/unreadable cache is a miss, never a fabricated no-match.
  }
  async put(batch: Batch, evaluation: Evaluation): Promise<boolean> {
    if (!this.enabled) return true;
    if (!await this.safeDirectory(true)) return false;
    const key = cacheKey(batch);
    const temp = join(this.directory, `${key}.${randomUUID()}.tmp`);
    try {
      // No original text, query, path, key, or request body is persisted.
      await writeFile(temp, JSON.stringify({ version: 1, key, model: evaluation.model, probabilities: evaluation.probabilities }), { flag: 'wx', mode: 0o600 });
      await rename(temp, join(this.directory, `${key}.json`));
      return true;
    } catch { await unlink(temp).catch(() => {}); return false; }
  }
}

export async function applyCache(plan: Plan, options: SearchOptions, cache: ResultCache): Promise<void> {
  for (const batch of plan.batches) {
    const hit = await cache.get(batch);
    if (hit) { batch.cached = hit; plan.stats.cacheHits++; }
  }
  plan.stats.uncachedRequests = plan.batches.filter(b => !b.cached).length;
  if (plan.stats.uncachedRequests > options.maxRequests) plan.errors.push({ code: 'request_budget',
    message: 'Uncached requests exceed --max-requests. Narrow paths/globs or raise the budget.' });
}
