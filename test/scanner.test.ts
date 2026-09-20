import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { scan } from '../src/scanner.js';
import { options, fixture } from './helpers.js';

test('recursive discovery, binary/encoding exclusions and explicit unsupported inputs', async t => {
  const f = await fixture({ 'a.ts': 'code', 'nested/b.md': 'docs', 'c.log': 'logs', 'empty': '',
    'nul.bin': Buffer.from([1, 0, 2]), 'bad.txt': Buffer.from([0xff]), '.hidden/file': 'secret' });
  t.after(f.cleanup);
  const plan = await scan(options(f.cwd));
  assert.deepEqual(plan.sources.map(s => s.path), ['a.ts', 'c.log', 'empty', 'nested/b.md']);
  assert.equal(plan.stats.excludedByReason.binary, 1);
  assert.equal(plan.stats.excludedByReason.encoding, 1);
  assert.equal(plan.errors.length, 0);
  for (const path of ['nul.bin', 'bad.txt', 'missing']) assert.equal((await scan(options(f.cwd, { paths: [path] }))).errors.length, 1);
});

test('fixed exclusions win over hidden, no-ignore and positive globs', async t => {
  const f = await fixture({ '.env': 'do-not-upload', '.env.example': 'do-not-upload', 'private.pem': 'secret',
    'private.key': 'secret', 'id_rsa.pub': 'secret', '.git/config': 'secret', '.nlgrep/cache-v1/file': 'secret', 'ok.txt': 'ok' });
  t.after(f.cleanup);
  const plan = await scan(options(f.cwd, { hidden: true, noIgnore: true, globs: ['**/*'] }));
  assert.deepEqual(plan.sources.map(s => s.path), ['ok.txt']);
  assert.equal(plan.errors.length, 0);
  assert.equal((await scan(options(f.cwd, { paths: ['.env'], hidden: true, noIgnore: true }))).errors[0]?.code, 'excluded_input');
});

test('nested ignore negation, ancestor git rules, default directories and glob precedence', async t => {
  const f = await fixture({ '.git/HEAD': 'ref: refs/heads/main', '.gitignore': '*.log\nignored/\n', '.nlgrepignore': '*.tmp\n',
    'a.ts': 'a', 'a.md': 'a', 'a.log': 'a', 'a.tmp': 'a', 'src/.gitignore': '!keep.log\n*.md\n',
    'src/keep.log': 'keep', 'src/no.log': 'no', 'src/a.ts': 'a', 'src/a.md': 'md',
    'ignored/.gitignore': '!yes.log\n', 'ignored/yes.log': 'no', 'node_modules/test.js': 'no' });
  t.after(f.cleanup);
  assert.deepEqual((await scan(options(f.cwd))).sources.map(s => s.path), ['a.md', 'a.ts', 'src/a.ts', 'src/keep.log']);
  assert.deepEqual((await scan(options(f.cwd, { paths: ['src'] }))).sources.map(s => s.path), ['src/a.ts', 'src/keep.log']);
  assert.deepEqual((await scan(options(f.cwd, { globs: ['*.ts', '*.md', '!src/**'] }))).sources.map(s => s.path), ['a.md', 'a.ts']);
  assert.ok((await scan(options(f.cwd, { noIgnore: true }))).sources.some(s => s.path === 'node_modules/test.js'));
  assert.equal((await scan(options(f.cwd, { paths: ['a.log'] }))).sources.length, 0);
});

test('overlapping roots deduplicate and symlinks are never followed', async t => {
  const f = await fixture({ 'src/a.ts': 'a', 'b.ts': 'b' });
  t.after(f.cleanup);
  await symlink(join(f.cwd, 'src'), join(f.cwd, 'link'));
  const plan = await scan(options(f.cwd, { paths: ['.', 'src', 'src/a.ts'] }));
  assert.deepEqual(plan.sources.map(s => s.path), ['b.ts', 'src/a.ts']);
  assert.equal(plan.stats.excludedByReason.symlink, 1);
  assert.equal((await scan(options(f.cwd, { paths: ['link/a.ts'] }))).errors.length, 1);
});

test('byte budget fails before partial prefix can be evaluated; stdin obeys the same budget', async t => {
  const f = await fixture({ a: '12345', b: '67890' });
  t.after(f.cleanup);
  const plan = await scan(options(f.cwd, { maxBytes: 6 }));
  assert.equal(plan.errors[0]?.code, 'byte_budget');
  const input = await scan(options(f.cwd, { paths: ['-'], maxBytes: 4 }), Readable.from(['abc', 'def']));
  assert.equal(input.errors[0]?.code, 'byte_budget');
  const good = await scan(options(f.cwd, { paths: ['-'] }), Readable.from(['中文\r\n', 'last']));
  assert.equal(good.sources[0]?.path, '<stdin>');
  assert.equal(good.sources[0]?.lineCount, 2);
});

test('ignore configuration errors and cancelled scanning are not no-match success', async t => {
  const f = await fixture({ '.gitignore': 'x'.repeat(1024 * 1024 + 1), 'a': 'a' });
  t.after(f.cleanup);
  assert.equal((await scan(options(f.cwd))).errors[0]?.code, 'ignore_error');
  const controller = new AbortController(); controller.abort();
  assert.equal((await scan(options(f.cwd, { noIgnore: true }), undefined, controller.signal)).errors[0]?.code, 'cancelled');
});
test('explicit descendants respect hidden and built-in parent exclusions', async t => {
  const f = await fixture({ '.hidden/a.txt': 'a', 'node_modules/pkg/a.txt': 'a' }); t.after(f.cleanup);
  const paths = ['.hidden/a.txt', 'node_modules/pkg/a.txt'];
  const normal = await scan(options(f.cwd, { paths }));
  assert.equal(normal.sources.length, 0);
  assert.equal(normal.errors.length, 0);
  const included = await scan(options(f.cwd, { paths, hidden: true, noIgnore: true }));
  assert.equal(included.sources.length, 2);
});
