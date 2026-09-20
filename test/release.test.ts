import assert from 'node:assert/strict';
import test from 'node:test';
import { releaseDecision } from '../scripts/release.js';

const pkg = { name: 'nlgrep', version: '0.1.0' };
const respond = (status: number, body: unknown = {}): typeof fetch => async () => new Response(JSON.stringify(body), { status });
test('release accepts a new package or a higher unpublished version', async () => {
  assert.equal(await releaseDecision(pkg, respond(404)), true);
  assert.equal(await releaseDecision({ ...pkg, version: '0.2.0' }, respond(200, { name: pkg.name, versions: { '0.1.0': {} }, 'dist-tags': { latest: '0.1.0' } })), true);
});
test('release reruns skip a version already on npm', async () => {
  assert.equal(await releaseDecision(pkg, respond(200, { name: pkg.name, versions: { '0.1.0': {} }, 'dist-tags': { latest: '0.2.0' } })), false);
});
test('release refuses registry errors, invalid metadata and network failures', async () => {
  for (const status of [401, 403, 429, 500]) await assert.rejects(releaseDecision(pkg, respond(status)), /refusing to publish/);
  await assert.rejects(releaseDecision(pkg, respond(200)), /Invalid registry metadata/);
  await assert.rejects(releaseDecision(pkg, async () => { throw new Error('network unavailable'); }), /network unavailable/);
});
test('release cannot silently downgrade latest or publish prereleases as stable', async () => {
  await assert.rejects(releaseDecision(pkg, respond(200, { name: pkg.name, versions: { '0.2.0': {} }, 'dist-tags': { latest: '0.2.0' } })), /must be greater/);
  await assert.rejects(releaseDecision({ ...pkg, version: '0.2.0-beta.1' }, respond(404)), /stable x.y.z/);
});
