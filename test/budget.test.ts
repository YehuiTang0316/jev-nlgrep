import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { TestBudget } from '../scripts/budget.js';
import { fixture, options, evaluation } from './helpers.js';
import { packSource } from '../src/planner.js';
import { makeSource } from '../src/chunker.js';

test('live-test budget reserves before calls, survives failures/restarts, and stops at its cap', async t => {
  const f = await fixture({}); t.after(f.cleanup);
  const path = join(f.cwd, 'budget.json');
  const request = packSource(makeSource('a', Buffer.from('a')), options(f.cwd))[0]!.request;
  const signal = new AbortController().signal;
  let calls = 0;
  const failed = new TestBudget(path, 2).wrap({ evaluate: async () => { calls++; throw new Error('lost response'); } });
  await assert.rejects(() => failed.evaluate(request, signal));
  const resumed = new TestBudget(path, 2);
  const ok = resumed.wrap({ evaluate: async r => { calls++; return evaluation(r); } });
  await ok.evaluate(request, signal);
  await assert.rejects(() => ok.evaluate(request, signal), /budget reached/);
  assert.equal(calls, 2); assert.equal(resumed.ledger.attempts, 2); assert.equal(resumed.ledger.reservedUSD, 0.02);
  assert.equal(resumed.ledger.successful, 1);
});
