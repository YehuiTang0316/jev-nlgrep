import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile, writeFile, symlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { search, prepare, execute, exitCode } from '../src/search.js';
import { EvaluationError } from '../src/jev.js';
import { cacheKey, ResultCache } from '../src/cache.js';
import { evaluation, fixture, options } from './helpers.js';

test('all candidates are evaluated before top; threshold includes equality and ties use paths', async t => {
  const f = await fixture({ a: 'unrelated wording', b: 'synonymous retry', c: 'below', d: 'strongest' });
  t.after(f.cleanup);
  let calls = 0;
  const evaluator = { evaluate: async (r: Parameters<typeof evaluation>[0]) => { calls++; return evaluation(r, [{ a: 0.7, b: 0.7, c: 0.69999, d: 0.9 }[r.state.file.path]!]); } };
  const a = await search(options(f.cwd, { top: 1, threshold: 0.7 }), { evaluator });
  assert.equal(calls, 4); assert.equal(a.stats.matchedFiles, 3); assert.deepEqual(a.files.map(f => f.path), ['d']);
  assert.equal(a.outputLimited, true); assert.equal(exitCode(a), 0);
  const b = await search(options(f.cwd, { top: 0, threshold: 0.7 }), { evaluator });
  assert.deepEqual(b.files.map(f => f.path), ['d', 'a', 'b']);
  assert.equal(a.stats.plannedRequests, b.stats.plannedRequests);
});

test('failed response after partial matches remains incomplete and retries consume budget', async t => {
  const f = await fixture({ a: 'a', b: 'b' }); t.after(f.cleanup);
  let calls = 0;
  const output = await search(options(f.cwd, { concurrency: 1, maxRequests: 3 }), {
    evaluator: { evaluate: async r => { calls++; if (r.state.file.path === 'b') throw new EvaluationError('api_429', 'Rate limited.', true); return evaluation(r); } },
    sleep: async () => {},
  });
  assert.equal(calls, 3); assert.equal(exitCode(output), 2); assert.equal(output.complete, false);
  assert.equal(output.errors[0]?.code, 'request_budget'); assert.equal(output.stats.usageComplete, false);
  assert.deepEqual(output.files.map(f => f.path), ['a']);
});

test('preflight failures use zero API calls, including request and byte budgets', async t => {
  const f = await fixture({ a: 'a', b: 'b' }); t.after(f.cleanup);
  let calls = 0;
  const evaluator = { evaluate: async (r: Parameters<typeof evaluation>[0]) => { calls++; return evaluation(r); } };
  for (const override of [{ maxRequests: 1 }, { maxBytes: 1 }, { paths: ['a', 'missing'] }]) {
    assert.equal(exitCode(await search(options(f.cwd, override), { evaluator })), 2);
  }
  assert.equal(calls, 0);
});

test('no match, empty inputs and no files are complete without an API key when unnecessary', async t => {
  const f = await fixture({ empty: '', a: 'a' }); t.after(f.cleanup);
  const absent = await search(options(f.cwd), { evaluator: { evaluate: async r => evaluation(r, [0.1]) } });
  assert.equal(exitCode(absent), 1); assert.equal(absent.complete, true);
  assert.equal(exitCode(await search(options(f.cwd, { globs: ['*.no'] }), { env: {} })), 1);
  assert.equal(exitCode(await search(options(f.cwd, { paths: ['empty'] }), { env: {} })), 1);
  assert.equal((await search(options(f.cwd), { env: {} })).errors[0]?.code, 'missing_key');
});

test('persistent cache saves only scores, reuses thresholds/top, and invalidates changed content/query', async t => {
  const f = await fixture({ a: 'private source marker' }); t.after(f.cleanup);
  let calls = 0;
  const evaluator = { evaluate: async (r: Parameters<typeof evaluation>[0]) => { calls++; return evaluation(r); } };
  const first = await search(options(f.cwd, { cache: true }), { evaluator });
  assert.equal(first.stats.attemptedRequests, 1);
  const hit = await search(options(f.cwd, { cache: true, top: 0, threshold: 0.99, maxRequests: 0 }), { env: {} });
  assert.equal(exitCode(hit), 1); assert.equal(hit.stats.cacheHits, 1); assert.equal(hit.stats.inputTokens, 0);
  for (const file of await readdir(join(f.cwd, '.nlgrep/cache-v1'))) {
    const data = await readFile(join(f.cwd, '.nlgrep/cache-v1', file), 'utf8');
    assert.ok(!data.includes('private source marker')); assert.ok(!data.includes('network retry'));
  }
  await writeFile(join(f.cwd, 'a'), 'changed source');
  await search(options(f.cwd, { cache: true }), { evaluator });
  await search(options(f.cwd, { cache: true, query: 'another query' }), { evaluator });
  assert.equal(calls, 3);
});

test('moving aliases, --no-cache and symlinked cache directories do not serve persistent results', async t => {
  const f = await fixture({ a: 'a' }); t.after(f.cleanup);
  let calls = 0;
  const evaluator = { evaluate: async (r: Parameters<typeof evaluation>[0]) => { calls++; return evaluation(r); } };
  for (let i = 0; i < 2; i++) await search(options(f.cwd, { model: 'jev-latest', cache: true }), { evaluator });
  assert.equal(calls, 2);
  await mkdir(join(f.cwd, 'outside'));
  await symlink(join(f.cwd, 'outside'), join(f.cwd, '.nlgrep'));
  const output = await search(options(f.cwd, { paths: ['a'], cache: true }), { evaluator });
  assert.equal(output.warnings[0]?.code, 'cache_write');
  assert.deepEqual(await readdir(join(f.cwd, 'outside')), []);
});

test('file changes after planning invalidate completeness even if scores are available', async t => {
  const f = await fixture({ a: 'old' }); t.after(f.cleanup);
  const o = options(f.cwd);
  const { plan, cache } = await prepare(o);
  await writeFile(join(f.cwd, 'a'), 'new');
  const output = await execute(plan, o, cache, { evaluator: { evaluate: async r => evaluation(r) } });
  assert.equal(exitCode(output), 2); assert.equal(output.errors[0]?.code, 'source_changed');
  assert.equal(output.files[0]?.matches[0]?.text, 'old');
});

test('concurrency is bounded and cancellation stops queued work', async t => {
  const f = await fixture(Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`${i}.txt`, 'text']))); t.after(f.cleanup);
  let active = 0, max = 0, calls = 0;
  const controller = new AbortController();
  const output = await search(options(f.cwd, { concurrency: 2 }), { signal: controller.signal, evaluator: {
    evaluate: async (r, signal) => {
      calls++; active++; max = Math.max(max, active);
      await new Promise<void>(resolve => setTimeout(resolve, 10));
      controller.abort(); active--; signal.throwIfAborted(); return evaluation(r);
    },
  } });
  assert.equal(max, 2); assert.equal(calls, 2); assert.equal(exitCode(output), 130);
});

test('context errors split once without dropping bytes and honor budget', async t => {
  const f = await fixture({ a: Array.from({ length: 90 }, (_, i) => `${i}\n`).join('') }); t.after(f.cleanup);
  let calls = 0;
  const output = await search(options(f.cwd, { concurrency: 1 }), { evaluator: {
    evaluate: async r => { calls++; if (calls === 1) throw new EvaluationError('api_422', 'Too long.', false, undefined, true); return evaluation(r); },
  } });
  assert.equal(calls, 3); assert.equal(output.complete, true);
  assert.equal(output.stats.evaluatedWindows, output.stats.plannedWindows);
  assert.ok(output.files[0]!.matches.some(w => w.endLine === 90));
});

test('fixed excluded source text never reaches an evaluator or output even with permissive flags', async t => {
  const secret = 'synthetic-secret-never-upload';
  const f = await fixture({ '.env': `JEV_KEY=${secret}`, '.env.local': secret, 'private.pem': secret,
    '.git/config': secret, '.nlgrep/other': secret, 'readme.txt': 'retry the request' }); t.after(f.cleanup);
  let calls = 0;
  const output = await search(options(f.cwd, { hidden: true, noIgnore: true }), {
    evaluator: { evaluate: async r => {
      calls++; assert.equal(JSON.stringify(r).includes(secret), false); return evaluation(r);
    } },
  });
  assert.equal(calls, 1); assert.equal(output.complete, true);
  assert.equal(JSON.stringify(output).includes(secret), false);
});

test('missing window scores after successful matches fail instead of becoming no-match', async t => {
  const f = await fixture({ a: 'match', b: 'missing answer' }); t.after(f.cleanup);
  const output = await search(options(f.cwd, { concurrency: 1 }), { evaluator: {
    evaluate: async r => evaluation(r, r.state.file.path === 'a' ? [0.9] : []),
  } });
  assert.equal(exitCode(output), 2); assert.equal(output.complete, false);
  assert.equal(output.errors[0]?.code, 'protocol_error');
  assert.deepEqual(output.files.map(f => f.path), ['a']);
});

test('corrupt or wrong-model cache entries require evaluation, not fabricated scores', async t => {
  const f = await fixture({ a: 'example' }); t.after(f.cleanup);
  const opts = options(f.cwd, { cache: true });
  const { plan, cache } = await prepare(opts);
  const batch = plan.batches[0]!;
  await cache.put(batch, evaluation(batch.request));
  const path = join(f.cwd, '.nlgrep/cache-v1', `${cacheKey(batch)}.json`);
  for (const entry of [
    { version: 1, key: cacheKey(batch), model: opts.model, probabilities: [2] },
    { version: 1, key: cacheKey(batch), model: 'jev-0.0.0', probabilities: [0.9] },
  ]) {
    await writeFile(path, JSON.stringify(entry));
    let calls = 0;
    const output = await search(opts, { evaluator: { evaluate: async r => { calls++; return evaluation(r); } } });
    assert.equal(calls, 1); assert.equal(output.stats.cacheHits, 0); assert.equal(output.complete, true);
  }
});
