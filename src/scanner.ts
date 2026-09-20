import { constants } from 'node:fs';
import { lstat, open, readdir, readFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import ignore, { type Ignore } from 'ignore';
import picomatch from 'picomatch';
import { makeSource } from './chunker.js';
import { emptyStats, issueFrom, SearchError, type Plan, type SearchOptions, type Source } from './types.js';

type IgnoreLayer = { directory: string; matcher: Ignore };
const BUILTIN_DIRS = new Set(['node_modules', '.venv', 'dist', 'build', 'coverage']);
const posix = (path: string) => path.split(sep).join('/');
const within = (base: string, path: string) => { const r = relative(base, path); return r === '' || (!r.startsWith(`..${sep}`) && r !== '..' && !isAbsolute(r)); };
const forbiddenName = (name: string) => ['.git', '.nlgrep', '.env'].includes(name) || name.startsWith('.env.') ||
  /\.(pem|key)$/i.test(name) || /^id_(rsa|ed25519)/.test(name);
export const fixedExcluded = (path: string): boolean => resolve(path).split(sep).some(forbiddenName);

function invalidText(bytes: Buffer): string | undefined {
  if (bytes.includes(0)) return 'binary';
  try { new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { return 'encoding'; }
  return undefined;
}

export async function readSnapshot(path: string, limit: number, signal?: AbortSignal): Promise<Buffer> {
  signal?.throwIfAborted();
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw new SearchError({ code: 'unsupported_input', message: 'Only regular files are supported.' });
    const parts: Buffer[] = [];
    let length = 0;
    while (true) {
      signal?.throwIfAborted();
      const buf = Buffer.allocUnsafe(Math.min(64 * 1024, Math.max(1, limit - length + 1)));
      const { bytesRead } = await handle.read(buf);
      if (!bytesRead) break;
      length += bytesRead;
      if (length > limit) throw new SearchError({ code: 'byte_budget', message: 'Input exceeds --max-bytes. Narrow paths/globs, use tail, or raise the budget.' });
      parts.push(buf.subarray(0, bytesRead));
    }
    const after = await handle.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
      throw new SearchError({ code: 'source_changed', message: 'The input changed while being read.' });
    }
    return Buffer.concat(parts, length);
  } finally { await handle.close(); }
}

async function ignoreLayers(directory: string): Promise<IgnoreLayer[]> {
  const parts: string[] = [];
  let cursor = directory;
  let foundGit = false;
  while (true) {
    parts.unshift(cursor);
    try { await lstat(join(cursor, '.git')); foundGit = true; break; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  const layers: IgnoreLayer[] = [];
  for (const part of foundGit ? parts : [directory]) layers.push(...await localIgnores(part));
  return layers;
}
async function localIgnores(directory: string): Promise<IgnoreLayer[]> {
  const matcher = ignore({ ignorecase: false });
  for (const name of ['.gitignore', '.nlgrepignore']) {
    const path = join(directory, name);
    try {
      const stat = await lstat(path);
      if (!stat.isFile()) continue;
      if (stat.size > 1024 * 1024) throw new SearchError({ code: 'ignore_error', message: 'An ignore file exceeds 1 MiB.', path });
      matcher.add((await readSnapshot(path, 1024 * 1024)).toString('utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return [{ directory, matcher }];
}
function isIgnored(path: string, directory: boolean, layers: IgnoreLayer[]): boolean {
  let ignored = false;
  for (const layer of layers) {
    if (!within(layer.directory, path) || layer.directory === path) continue;
    const result = layer.matcher.test(posix(relative(layer.directory, path)) + (directory ? '/' : ''));
    if (result.ignored) ignored = true;
    if (result.unignored) ignored = false;
  }
  return ignored;
}
function globMatch(path: string, root: string, globs: string[]): boolean {
  const target = posix(relative(root, path));
  const matches = (g: string) => picomatch(g, { dot: true, basename: !g.includes('/') })(target);
  const positives = globs.filter(g => !g.startsWith('!'));
  const negatives = globs.filter(g => g.startsWith('!')).map(g => g.slice(1));
  return (!positives.length || positives.some(matches)) && !negatives.some(matches);
}

export async function scan(options: SearchOptions, stdin?: AsyncIterable<Uint8Array | string>, signal?: AbortSignal): Promise<Plan> {
  const plan: Plan = { sources: [], batches: [], exclusions: [], stats: emptyStats(), errors: [] };
  const discovered = new Set<string>();
  const included = new Set<string>();
  const excluded = new Set<string>();
  const display = (path: string) => posix(relative(options.cwd, path)) || '.';
  const exclude = (path: string, reason: string) => {
    const id = `${path}\0${reason}`;
    if (excluded.has(id)) return;
    excluded.add(id);
    plan.exclusions.push({ path: display(path), reason });
    plan.stats.excludedByReason[reason] = (plan.stats.excludedByReason[reason] ?? 0) + 1;
  };
  const add = (source: Source) => {
    plan.sources.push(source);
    plan.stats.sourceBytes += source.bytes.length;
    plan.stats.includedFiles++;
  };
  if (options.paths[0] === '-') {
    try {
      const buffers: Buffer[] = [];
      let bytes = 0;
      if (!stdin) throw new SearchError({ code: 'stdin_error', message: 'Standard input is unavailable.' });
      for await (const item of stdin) {
        signal?.throwIfAborted();
        const buf = Buffer.isBuffer(item) ? item : Buffer.from(item);
        bytes += buf.length;
        if (bytes > options.maxBytes) throw new SearchError({ code: 'byte_budget', message: 'Standard input exceeds --max-bytes; provide a finite, smaller input.' });
        buffers.push(buf);
      }
      const buffer = Buffer.concat(buffers, bytes);
      const reason = invalidText(buffer);
      if (reason) throw new SearchError({ code: 'unsupported_input', message: 'Standard input must be UTF-8 text without NUL bytes.' });
      plan.stats.discoveredFiles = 1;
      add(makeSource('<stdin>', buffer));
    } catch (error) { plan.errors.push(issueFrom(error)); }
    return plan;
  }

  async function visit(path: string, root: string, layers: IgnoreLayer[], explicit: boolean): Promise<void> {
    signal?.throwIfAborted();
    if (fixedExcluded(path)) {
      exclude(path, 'fixed');
      if (explicit) throw new SearchError({ code: 'excluded_input', message: 'This input is excluded from upload by a fixed rule.', path: display(path) });
      return;
    }
    const stat = await lstat(path);
    if (stat.isFile() && !discovered.has(path)) { discovered.add(path); plan.stats.discoveredFiles++; }
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
      exclude(path, stat.isSymbolicLink() ? 'symlink' : 'special');
      if (explicit) throw new SearchError({ code: 'unsupported_input', message: 'Explicit inputs must be regular files or directories, without symbolic links.', path: display(path) });
      return;
    }
    const hidden = basename(path).startsWith('.') && path !== root;
    // Explicit hidden inputs still need --hidden; the cwd itself is a scope, not a discovered item.
    const explicitHidden = explicit && basename(path).startsWith('.') && path !== resolve(options.cwd);
    if (!options.hidden && (hidden || explicitHidden)) { exclude(path, 'hidden'); return; }
    if (!options.noIgnore && stat.isDirectory() && BUILTIN_DIRS.has(basename(path))) { exclude(path, 'builtin'); return; }
    if (!options.noIgnore && isIgnored(path, stat.isDirectory(), layers)) { exclude(path, 'ignore'); return; }
    if (stat.isDirectory()) {
      const nextLayers = options.noIgnore || layers.some(l => l.directory === path) ? layers : [...layers, ...await localIgnores(path)];
      for (const entry of (await readdir(path)).sort()) {
        try { await visit(join(path, entry), root, nextLayers, false); }
        catch (error) {
          if (signal?.aborted || (error instanceof SearchError && error.issue.code === 'byte_budget')) throw error;
          plan.errors.push(issueFrom(error, display(join(path, entry))));
        }
      }
      return;
    }
    if (!globMatch(path, root, options.globs)) { exclude(path, 'glob'); return; }
    if (included.has(path)) return;
    // Binary prefix detection avoids loading large obvious binaries just to reject them.
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    let binary: boolean;
    try { const sample = Buffer.alloc(8192); const r = await handle.read(sample); binary = sample.subarray(0, r.bytesRead).includes(0); }
    finally { await handle.close(); }
    if (binary) {
      exclude(path, 'binary');
      if (explicit) throw new SearchError({ code: 'unsupported_input', message: 'Explicit input is binary.', path: display(path) });
      return;
    }
    const bytes = await readSnapshot(path, options.maxBytes - plan.stats.sourceBytes, signal);
    const reason = invalidText(bytes);
    if (reason) {
      exclude(path, reason);
      if (explicit) throw new SearchError({ code: 'unsupported_input', message: 'Explicit input must be UTF-8 text without NUL bytes.', path: display(path) });
      return;
    }
    included.add(path);
    add(makeSource(display(path), bytes, path));
  }
  for (const input of options.paths) {
    const path = resolve(options.cwd, input);
    try {
      // Reject symlinked ancestors too, including an explicitly named descendant.
      let parent = dirname(path);
      while (dirname(parent) !== parent) {
        if ((await lstat(parent)).isSymbolicLink()) throw new SearchError({ code: 'unsupported_input', message: 'Inputs inside symbolic-link directories are not followed.', path: display(path) });
        parent = dirname(parent);
      }
      const stat = await lstat(path);
      // Naming a descendant directly must not bypass hidden/generated ancestors.
      // The working directory itself remains the user's chosen scope.
      const parts = relative(options.cwd, path).split(sep).filter(p => p && p !== '..' && p !== '.');
      if (!options.hidden && parts.some(p => p.startsWith('.')) && !fixedExcluded(path)) {
        exclude(path, 'hidden'); continue;
      }
      const directories = stat.isDirectory() ? parts : parts.slice(0, -1);
      if (!options.noIgnore && directories.some(p => BUILTIN_DIRS.has(p)) && !fixedExcluded(path)) {
        exclude(path, 'builtin'); continue;
      }
      const root = stat.isDirectory() ? path : dirname(path);
      const layers = options.noIgnore ? [] : await ignoreLayers(root);
      await visit(path, root, layers, true);
    } catch (error) {
      plan.errors.push(issueFrom(error, display(path)));
      if (signal?.aborted || (error instanceof SearchError && error.issue.code === 'byte_budget')) break;
    }
  }
  plan.sources.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return plan;
}

export async function changedSources(sources: Source[], signal?: AbortSignal): Promise<Array<{ code: string; message: string; path: string }>> {
  const errors = [];
  for (const source of sources) {
    if (!source.absolutePath) continue;
    signal?.throwIfAborted();
    try {
      const bytes = await readSnapshot(source.absolutePath, source.bytes.length, signal);
      if (makeSource(source.path, bytes).hash !== source.hash) throw new Error('changed');
    } catch {
      if (signal?.aborted) signal.throwIfAborted();
      errors.push({ code: 'source_changed', message: 'The input changed or became unreadable after planning; results describe the scanned snapshot.', path: source.path });
    }
  }
  return errors;
}
