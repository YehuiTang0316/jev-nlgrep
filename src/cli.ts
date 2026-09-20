import { readFileSync } from 'node:fs';
import { Command, CommanderError, InvalidArgumentError } from 'commander';
import type { Writable } from 'node:stream';
import { DEFAULTS } from './config.js';
import { formatIssue, renderPlan, renderResults, summary } from './output.js';
import { planOutput } from './planner.js';
import { execute, exitCode, prepare, type SearchDependencies } from './search.js';
import { issueFrom, SearchError, type SearchOptions } from './types.js';

export const VERSION: string = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const invalid = (message: string): never => { throw new InvalidArgumentError(message); };
function integer(value: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (!/^\d+$/.test(value)) return invalid('Expected a whole number.');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) return invalid(`Expected an integer from ${min} to ${max}.`);
  return number;
}
export function byteSize(value: string): number {
  const match = /^(\d+)(B|KiB|MiB)?$/i.exec(value);
  if (!match) return invalid('Use an integer followed by B, KiB or MiB.');
  const factor = ({ b: 1, kib: 1024, mib: 1024 * 1024 } as Record<string, number>)[(match[2] ?? 'B').toLowerCase()]!;
  return integer(String(Number(match[1]) * factor), 1);
}
export function parseOptions(argv: string[], cwd: string, stdinTTY: boolean, io: { out: (s: string) => void; err: (s: string) => void }): SearchOptions {
  const command = new Command('nlgrep').description('Find files that satisfy natural-language conditions using Jev.\nQueries and selected source text are sent to TypeSafe. Evidence scope: supplied file/window batch.')
    .version(VERSION).argument('<query>', 'natural-language search condition').argument('[paths...]', 'files, directories, or - for stdin')
    .option('-g, --glob <pattern>', 'include glob or !exclude glob (repeatable)', (value: string, prev: string[]) => [...prev, value], [])
    .option('--hidden', 'include hidden entries', false).option('--no-ignore', 'disable ignore files and built-in generated-directory exclusions')
    .option('--threshold <n>', 'minimum match probability, 0..1', value => {
      if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return invalid('Expected a number from 0 to 1.');
      const n = Number(value); return n >= 0 && n <= 1 ? n : invalid('Expected a number from 0 to 1.');
    }, DEFAULTS.threshold)
    .option('--top <n>', 'maximum files to show; 0 shows all (does not stop scanning)', v => integer(v, 0), DEFAULTS.top)
    .option('-l, --files-with-matches', 'output matching file paths only', false).option('-0, --null', 'NUL-separated paths; requires -l', false)
    .option('--json', 'output a JSON object', false).option('--dry-run', 'show local plan and uncached request count without contacting Jev', false)
    .option('--no-cache', 'do not read or write local decision cache')
    .option('--concurrency <n>', 'maximum concurrent API requests, 1..16', v => integer(v, 1, 16), DEFAULTS.concurrency)
    .option('--max-bytes <size>', 'source byte budget (B/KiB/MiB)', byteSize, DEFAULTS.maxBytes)
    .option('--max-requests <n>', 'HTTP attempt budget including retries; 0 permits cache hits only', v => integer(v, 0), DEFAULTS.maxRequests)
    .option('--model <id>', 'Jev model ID (moving aliases bypass persistent cache)', DEFAULTS.model)
    .addHelpText('after', '\nExamples:\n  nlgrep "retry after a network failure" ./src\n  nlgrep "同一行包含 ERROR 但不包含 health" ./logs --no-ignore\n  nlgrep "order ID: ORD- followed by six digits" . --dry-run\n  tail -n 2000 app.log | nlgrep "database connection failed" -\n\nMatching probabilities are estimates, not regex or static-analysis proofs.\nLocal cache stores scores and hashes, never source text or API keys.\nFiles matching .env*, *.pem, *.key and SSH private-key names are always excluded.')
    .configureOutput({ writeOut: io.out, writeErr: io.err }).exitOverride();
  command.parse(argv, { from: 'user' });
  const raw = command.opts();
  const query = command.args[0]!;
  if (!query.trim() || Buffer.byteLength(query) > 2048) throw new SearchError({ code: 'argument_error', message: 'Query must be nonblank and at most 2 KiB of UTF-8.' });
  const paths = command.args.slice(1);
  if (!paths.length) paths.push(stdinTTY ? '.' : '-');
  if (paths.includes('-') && paths.length > 1) throw new SearchError({ code: 'argument_error', message: 'Standard input (-) cannot be mixed with file paths.' });
  if (raw.json && raw.filesWithMatches) throw new SearchError({ code: 'argument_error', message: '--json and -l are mutually exclusive.' });
  if (raw.null && !raw.filesWithMatches) throw new SearchError({ code: 'argument_error', message: '-0 requires -l.' });
  if (raw.dryRun && (raw.filesWithMatches || raw.null)) throw new SearchError({ code: 'argument_error', message: '--dry-run cannot be combined with -l or -0.' });
  if (paths[0] === '-' && ['glob', 'hidden', 'ignore'].some(key => command.getOptionValueSource(key) === 'cli')) {
    throw new SearchError({ code: 'argument_error', message: 'Path filtering flags cannot be used with standard input.' });
  }
  if ((raw.glob as string[]).some(g => !g || g === '!')) {
    throw new SearchError({ code: 'argument_error', message: 'Glob patterns must not be empty.' });
  }
  if (!String(raw.model).trim()) throw new SearchError({ code: 'argument_error', message: '--model must not be empty.' });
  return { query, paths, cwd, globs: raw.glob, hidden: raw.hidden, noIgnore: !raw.ignore,
    threshold: raw.threshold, top: raw.top, filesOnly: raw.filesWithMatches, nullSeparator: raw.null,
    json: raw.json, dryRun: raw.dryRun, concurrency: raw.concurrency, maxBytes: raw.maxBytes,
    maxRequests: raw.maxRequests, model: raw.model, cache: raw.cache };
}
function write(stream: Writable, text: string): Promise<void> {
  if (!text) return Promise.resolve();
  return new Promise((res, rej) => stream.write(text, error => error ? rej(error) : res()));
}
export async function main(argv = process.argv.slice(2), overrides: SearchDependencies = {}): Promise<void> {
  const controller = new AbortController();
  let options: SearchOptions | undefined;
  let progress = false;
  let lastProgress = 0;
  let pipeClosed = false;
  const onPipeError = (error: NodeJS.ErrnoException) => { if (error.code === 'EPIPE') pipeClosed = true; };
  process.stdout.on('error', onPipeError);
  const onInterrupt = () => { controller.abort(); if (options?.paths[0] === '-') process.stdin.destroy(new DOMException('Cancelled', 'AbortError')); };
  process.on('SIGINT', onInterrupt);
  try {
    options = parseOptions(argv, process.cwd(), Boolean(process.stdin.isTTY), { out: s => process.stdout.write(s), err: s => process.stderr.write(s) });
    const started = performance.now();
    const dependencies: SearchDependencies = { ...overrides, stdin: overrides.stdin ?? process.stdin,
      signal: overrides.signal ? AbortSignal.any([controller.signal, overrides.signal]) : controller.signal,
      onProgress: (done, total, attempts, hits) => {
        overrides.onProgress?.(done, total, attempts, hits);
        if (process.stderr.isTTY && performance.now() - lastProgress >= 150) {
          process.stderr.write(`\rEvaluated ${done}/${total} windows; ${attempts} API attempts; ${hits} cached batches`);
          progress = true;
          lastProgress = performance.now();
        }
      } };
    const { plan, cache } = await prepare(options, dependencies);
    if (options.dryRun) {
      const result = planOutput(plan, options);
      await write(process.stdout, renderPlan(result, options.json));
      for (const error of result.errors) process.stderr.write(formatIssue(error) + '\n');
      process.exitCode = controller.signal.aborted ? 130 : result.complete ? 0 : 2;
      return;
    }
    const result = await execute(plan, options, cache, dependencies);
    result.stats.elapsedMs = Math.round(performance.now() - started);
    if (progress) { process.stderr.write('\n'); progress = false; }
    await write(process.stdout, renderResults(result, options));
    process.stderr.write(summary(result));
    for (const issue of [...result.errors, ...result.warnings]) process.stderr.write(formatIssue(issue) + '\n');
    process.exitCode = exitCode(result);
  } catch (error) {
    if (progress) process.stderr.write('\n');
    if (pipeClosed || (error as NodeJS.ErrnoException).code === 'EPIPE') process.exitCode = 0;
    else if (error instanceof CommanderError) process.exitCode = error.exitCode === 0 ? 0 : 2;
    else { process.stderr.write(formatIssue(issueFrom(error)) + '\n'); process.exitCode = controller.signal.aborted ? 130 : 2; }
  } finally {
    process.off('SIGINT', onInterrupt);
    process.stdout.off('error', onPipeError);
  }
}
