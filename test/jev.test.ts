import assert from 'node:assert/strict';
import test from 'node:test';
import { makeSource } from '../src/chunker.js';
import { packSource } from '../src/planner.js';
import { createJevEvaluator, EvaluationError, parseEvaluation } from '../src/jev.js';
import { options } from './helpers.js';

const request = packSource(makeSource('sample.ts', Buffer.from('fetch(url)')), options('.'))[0]!.request;
test('SDK sends one exact bounded request, includes auth only in headers, disables debug and automatic retries', async () => {
  let calls = 0;
  const evaluator = createJevEvaluator('test-key-not-real', async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-key-not-real');
    assert.equal(init?.body, JSON.stringify(request));
    assert.ok(!String(init?.body).includes('test-key-not-real'));
    return new Response(JSON.stringify({ model: 'jev-1.13.0', answers: { w0: { type: 'noul', noul: 0.87 } }, usage: { input_tokens: 30, output_tokens: 1 } }), { headers: { 'content-type': 'application/json' } });
  });
  assert.deepEqual((await evaluator.evaluate(request, new AbortController().signal)).probabilities, [0.87]);
  assert.equal(calls, 1);
});
test('missing, wrong-type, nonfinite and out-of-range answers fail validation', () => {
  for (const answer of [undefined, { type: 'score', score: 1 }, { type: 'noul', noul: -0.1 }, { type: 'noul', noul: 2 }, { type: 'noul', noul: NaN }]) {
    assert.throws(() => parseEvaluation({ model: 'jev-1.13.0', answers: { w0: answer }, usage: { input_tokens: 1, output_tokens: 1 } }, request));
  }
});
test('API failure uses safe text, retains retry-after and does not retry inside SDK', async () => {
  let calls = 0;
  const evaluator = createJevEvaluator('a-key', async () => {
    calls++; return new Response(JSON.stringify({ error: 'private echoed request and a-key' }), { status: 429, headers: { 'retry-after': '2', 'content-type': 'application/json' } });
  });
  await assert.rejects(() => evaluator.evaluate(request, new AbortController().signal), error => {
    assert.ok(error instanceof EvaluationError); assert.equal(error.retryAfterMs, 2000); assert.ok(!error.message.includes('private')); return true;
  });
  assert.equal(calls, 1);
});
