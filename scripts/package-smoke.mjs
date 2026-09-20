import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
execFileSync(npm, ['run', 'build'], {cwd: root, stdio: 'inherit'});
mkdirSync(path.join(root, '.release'), {recursive: true});
const [packed] = JSON.parse(execFileSync(npm, ['pack', '--ignore-scripts', '--json', '--pack-destination', '.release'], {cwd: root, encoding: 'utf8'}));
assert.equal(packed.name, pkg.name);
assert.equal(packed.version, pkg.version);
const allowedRoot = new Set(['package.json', 'README.md', 'LICENSE']);
for (const {path: entry} of packed.files) {
  assert.ok(allowedRoot.has(entry) || /^(?:bin|dist)\//.test(entry), `Unexpected packed file: ${entry}`);
  assert.ok(!entry.split('/').some(part => part.startsWith('.')), `Hidden file in package: ${entry}`);
}
for (const required of ['bin/nlgrep.js', 'dist/cli.js', 'dist/index.js', 'dist/index.d.ts', 'LICENSE']) {
  assert.ok(packed.files.some(file => file.path === required), `Missing packed file: ${required}`);
}
const tarball = path.join(root, '.release', packed.filename);
const sandbox = mkdtempSync(path.join(tmpdir(), 'nlgrep-package-'));
try {
  writeFileSync(path.join(sandbox, 'package.json'), JSON.stringify({private: true, type: 'module'}));
  execFileSync(npm, ['install', '--prefix', sandbox, '--ignore-scripts', '--no-audit', '--no-fund', tarball], {cwd: sandbox, stdio: 'inherit'});
  const installed = path.join(sandbox, 'node_modules', pkg.name);
  const binary = path.join(installed, 'bin/nlgrep.js');
  const fixture = path.join(sandbox, 'fixture');
  mkdirSync(fixture);
  writeFileSync(path.join(fixture, 'sample.txt'), 'A network request is retried after a timeout.\n');
  const options = {cwd: fixture, encoding: 'utf8', env: {...process.env, JEV_KEY: '', TYPESAFE_API_KEY: ''}};
  assert.equal(execFileSync(process.execPath, [binary, '--version'], options).trim(), pkg.version);
  assert.match(execFileSync(process.execPath, [binary, '--help'], options), /Usage: nlgrep/);
  if (process.platform !== 'win32') {
    assert.equal(execFileSync(path.join(sandbox, 'node_modules/.bin/nlgrep'), ['--version'], options).trim(), pkg.version);
  }
  const plan = JSON.parse(execFileSync(process.execPath, [binary, 'Retry after timeout', '.', '--dry-run', '--json'], options));
  assert.equal(plan.files.length, 1);
  assert.equal(plan.files[0].path, 'sample.txt');
  execFileSync(process.execPath, ['--input-type=module', '-e', `import assert from 'node:assert/strict'; import {search, prepare} from ${JSON.stringify(pkg.name)}; assert.equal(typeof search, 'function'); assert.equal(typeof prepare, 'function');`], {cwd: sandbox, stdio: 'inherit'});
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tarball=.release/${packed.filename}\n`);
  console.log(`Package verified: ${pkg.name}@${pkg.version}; ${packed.files.length} files; ${packed.size} bytes. No Jev calls.`);
  console.log(`Tarball: ${tarball}`);
} finally {
  rmSync(sandbox, {recursive: true, force: true});
}
