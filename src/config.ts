import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'dotenv';
import { SearchError } from './types.js';

export const DEFAULTS = { threshold: 0.8, top: 20, concurrency: 4, maxBytes: 20 * 1024 * 1024,
  maxRequests: 1000, model: 'jev-1.13.0' } as const;

export async function resolveApiKey(cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const nonEmpty = (s: string | undefined) => s?.trim() || undefined;
  const fromEnv = nonEmpty(env.JEV_KEY) ?? nonEmpty(env.TYPESAFE_API_KEY);
  if (fromEnv) return fromEnv;
  let values: Record<string, string> = {};
  try { values = parse(await readFile(join(cwd, '.env'))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new SearchError({ code: 'config_error', message: 'Could not read .env in the working directory.' });
    }
  }
  const key = nonEmpty(values.JEV_KEY) ?? nonEmpty(values.TYPESAFE_API_KEY);
  if (!key) throw new SearchError({ code: 'missing_key', message: 'Set JEV_KEY or TYPESAFE_API_KEY in the environment or working-directory .env.' });
  return key;
}
