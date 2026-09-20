import assert from 'node:assert/strict';
import test from 'node:test';
import { CHUNK_LIMITS, chunkSource, makeSource } from '../src/chunker.js';
import { BATCH_LIMITS, packSource } from '../src/planner.js';
import { options } from './helpers.js';

for (const [name, text] of Object.entries({
  empty: '', one: 'first', newline: '\n', crlf: 'first\r\n中文\r\nlast', bom: '\uFEFF你好\n世界\n',
  lines: Array.from({ length: 130 }, (_, i) => `line ${i + 1} 中文\n`).join(''),
  long: `prefix\n${'中🙂'.repeat(5000)}\nlast`,
  escaped: '\\"'.repeat(5000),
})) {
  test(`chunking preserves exact bytes and line positions: ${name}`, () => {
    const source = makeSource(name, Buffer.from(text));
    const windows = chunkSource(source);
    const covered = new Uint8Array(source.bytes.length);
    for (const w of windows) {
      assert.equal(w.text, source.bytes.subarray(w.startByte, w.endByte).toString('utf8'));
      assert.equal(Buffer.byteLength(w.text), w.endByte - w.startByte);
      assert.ok(!w.text.includes('\uFFFD'));
      assert.ok(w.endByte > w.startByte);
      assert.ok(w.endByte - w.startByte <= CHUNK_LIMITS.bytes);
      assert.ok(w.endLine - w.startLine < CHUNK_LIMITS.lines);
      assert.equal(w.startLine, 1 + [...source.bytes.subarray(0, w.startByte)].filter(b => b === 10).length);
      assert.equal(w.endLine, 1 + [...source.bytes.subarray(0, w.endByte - 1)].filter(b => b === 10).length);
      covered.fill(1, w.startByte, w.endByte);
    }
    assert.ok(covered.every(b => b === 1));
    if (!text) assert.equal(windows.length, 0);
  });
}
test('normal windows overlap but advance and request packing respects full serialized bytes', () => {
  const source = makeSource('a.ts', Buffer.from(Array.from({ length: 100 }, (_, i) => `${i}\n`).join('')));
  const windows = chunkSource(source);
  assert.deepEqual(windows.map(w => [w.startLine, w.endLine]), [[1, 40], [33, 72], [65, 100]]);
  const weird = makeSource('weird', Buffer.from('\x01'.repeat(8192)));
  const batches = packSource(weird, options('.'));
  assert.ok(batches.length > 1, 'escaped JSON must be measured, not original text bytes');
  assert.ok(batches.every(b => b.requestBytes <= BATCH_LIMITS.bytes));
  const bytes = new Uint8Array(weird.bytes.length);
  for (const b of batches) for (const { window: w } of b.items) bytes.fill(1, w.startByte, w.endByte);
  assert.ok(bytes.every(Boolean));
});
