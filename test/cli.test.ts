import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { parseOptions } from '../src/cli.js';
import { resolveApiKey } from '../src/config.js';
import { renderResults } from '../src/output.js';
import { search } from '../src/search.js';
import { options, fixture, evaluation } from './helpers.js';

const io = { out: (_: string) => {}, err: (_: string) => {} };
test('CLI argument defaults, repeated globs, bytes, aliases and invalid combinations', () => {
  assert.deepEqual(parseOptions(['query'], '.', true, io).paths, ['.']);
  assert.deepEqual(parseOptions(['query'], '.', false, io).paths, ['-']);
  const o = parseOptions(['query', 'src', '-g', '*.ts', '-g', '!test*', '-l', '-0', '--max-bytes', '2MiB', '--no-cache'], '.', false, io);
  assert.equal(o.maxBytes, 2 * 1024 * 1024); assert.deepEqual(o.globs, ['*.ts', '!test*']); assert.equal(o.cache, false);
  for (const args of [[''], ['  '], ['a'.repeat(2049)], ['q', '-', 'file'], ['q', '--threshold', 'NaN'], ['q', '--threshold', '1.1'],
    ['q', '--concurrency', '17'], ['q', '--top', '1.2'], ['q', '-0'], ['q', '-l', '--json'], ['q', '-l', '--dry-run'],
    ['q', '-', '--hidden'], ['q', '--max-bytes', '0'], ['q', '--max-bytes', 'Infinity'], ['q', '-g', '!']]) {
    assert.throws(() => parseOptions(args, '.', true, io), `must reject ${args.join(' ')}`);
  }
});
test('key precedence uses existing JEV_KEY and does not mutate the process environment', async t => {
  const f = await fixture({ '.env': 'JEV_KEY=file-jev\nTYPESAFE_API_KEY=file-typesafe\n' }); t.after(f.cleanup);
  assert.equal(await resolveApiKey(f.cwd, { JEV_KEY: 'env-jev', TYPESAFE_API_KEY: 'env-typesafe' }), 'env-jev');
  assert.equal(await resolveApiKey(f.cwd, { JEV_KEY: '', TYPESAFE_API_KEY: 'env-typesafe' }), 'env-typesafe');
  assert.equal(await resolveApiKey(f.cwd, {}), 'file-jev');
});
test('stdout formats retain exact JSON text, escape terminal controls and support raw NUL paths', async t => {
  const f = await fixture({ 'line\nbreak.txt': 'hello\x1b[2J\r\nworld\n' }); t.after(f.cleanup);
  const o = options(f.cwd);
  const result = await search(o, { evaluator: { evaluate: async r => evaluation(r) } });
  const text = renderResults(result, o);
  assert.ok(text.includes('line\\nbreak.txt')); assert.ok(!text.includes('\x1b'));
  const parsed = JSON.parse(renderResults(result, { ...o, json: true }));
  assert.equal(parsed.files[0].matches[0].text, 'hello\x1b[2J\r\nworld\n');
  assert.equal(renderResults(result, { ...o, filesOnly: true, nullSeparator: true }), 'line\nbreak.txt\0');
});
test('real CLI help/version/dry-run and invalid args work without network or key', async t => {
  const f = await fixture({ a: 'sample' }); t.after(f.cleanup);
  const dev = resolve('src/dev.ts');
  const tsx = resolve('node_modules/tsx/dist/loader.mjs');
  const run = (args: string[], input = '') => spawnSync(process.execPath, ['--import', tsx, dev, ...args], { cwd: f.cwd, encoding: 'utf8', env: { PATH: process.env.PATH }, input });
  assert.equal(run(['--help']).status, 0);
  const version = run(['--version']);
  assert.equal(version.status, 0);
  assert.equal(version.stdout.trim(), JSON.parse(await readFile('package.json', 'utf8')).version);
  const plan = run(['query', '.', '--dry-run', '--json']);
  assert.equal(plan.status, 0); assert.equal(JSON.parse(plan.stdout).files[0].path, 'a');
  assert.equal(JSON.parse(plan.stdout).schemaVersion, 2);
  assert.deepEqual(JSON.parse(plan.stdout).files[0].contextFiles, []);
  assert.equal(run(['query', '--top', '-1']).status, 2);
  assert.equal(run(['query', '.', '--max-requests', '0']).status, 2);
  const stdin = run(['query', '-', '--dry-run', '--json'], 'text');
  assert.equal(JSON.parse(stdin.stdout).files[0].path, '<stdin>');
});
test('Ctrl-C while waiting for stdin exits 130 without an API call', async t => {
  const f = await fixture({}); t.after(f.cleanup);
  const child = spawn(process.execPath, ['--import', resolve('node_modules/tsx/dist/loader.mjs'), resolve('src/dev.ts'), 'query', '-', '--json'], { cwd: f.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = ''; child.stdout.on('data', b => { stdout += b; }); child.stderr.resume();
  await new Promise(resolve => setTimeout(resolve, 500));
  child.kill('SIGINT');
  const [code, signal] = await once(child, 'exit');
  assert.equal(signal, null); assert.equal(code, 130);
  assert.equal(JSON.parse(stdout).complete, false);
});
