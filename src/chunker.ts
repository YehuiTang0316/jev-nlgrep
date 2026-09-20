import { createHash } from 'node:crypto';
import type { Source, Window } from './types.js';

export const CHUNK_LIMITS = { lines: 40, bytes: 8 * 1024, overlapLines: 8, overlapBytes: 2 * 1024, fragmentOverlap: 256 };

export function makeSource(path: string, bytes: Buffer, absolutePath?: string): Source {
  let lineCount = bytes.length ? 1 : 0;
  for (let i = 0; i < bytes.length - 1; i++) if (bytes[i] === 10) lineCount++;
  return { path, bytes, lineCount, hash: createHash('sha256').update(bytes).digest('hex'),
    ...(absolutePath ? { absolutePath } : {}) };
}

function utf8Boundary(bytes: Buffer, position: number): number {
  while (position > 0 && position < bytes.length && (bytes[position]! & 0xc0) === 0x80) position--;
  return position;
}

export function sliceWindow(source: Source, startByte: number, endByte: number, fragment = false): Window {
  let startLine = 1;
  for (let i = 0; i < startByte; i++) if (source.bytes[i] === 10) startLine++;
  let endLine = startLine;
  for (let i = startByte; i < endByte - 1; i++) if (source.bytes[i] === 10) endLine++;
  return { startLine, endLine, startByte, endByte, fragment, text: source.bytes.subarray(startByte, endByte).toString('utf8') };
}

export function splitWindow(source: Source, window: Window): Window[] {
  const mid = utf8Boundary(source.bytes, window.startByte + Math.floor((window.endByte - window.startByte) / 2));
  if (mid <= window.startByte || mid >= window.endByte) return [];
  return [sliceWindow(source, window.startByte, mid, true), sliceWindow(source, mid, window.endByte, true)];
}

export function chunkSource(source: Source): Window[] {
  const { bytes } = source;
  const limits = CHUNK_LIMITS;
  // A piece is either one whole source line or a UTF-8-safe fragment of a long line.
  const pieces: Array<{ start: number; end: number; line: number; fragment: boolean }> = [];
  let start = 0;
  let line = 1;
  while (start < bytes.length) {
    const newline = bytes.indexOf(10, start);
    const end = newline < 0 ? bytes.length : newline + 1;
    if (end - start <= limits.bytes) pieces.push({ start, end, line, fragment: false });
    else {
      let cursor = start;
      while (cursor < end) {
        const partEnd = utf8Boundary(bytes, Math.min(cursor + limits.bytes, end));
        pieces.push({ start: cursor, end: partEnd, line, fragment: true });
        if (partEnd === end) break;
        cursor = utf8Boundary(bytes, partEnd - limits.fragmentOverlap);
      }
    }
    start = end;
    line++;
  }
  const windows: Window[] = [];
  let index = 0;
  while (index < pieces.length) {
    const first = pieces[index]!;
    let stop = index + 1;
    if (!first.fragment) {
      while (stop < pieces.length && !pieces[stop]!.fragment && stop - index < limits.lines &&
          pieces[stop]!.end - first.start <= limits.bytes) stop++;
    }
    const last = pieces[stop - 1]!;
    windows.push({ startLine: first.line, endLine: last.line, startByte: first.start, endByte: last.end,
      fragment: first.fragment, text: bytes.subarray(first.start, last.end).toString('utf8') });
    if (stop === pieces.length) break;
    let next = stop;
    if (!first.fragment && !pieces[stop]!.fragment) {
      while (next > index + 1 && stop - (next - 1) <= limits.overlapLines &&
          last.end - pieces[next - 1]!.start <= limits.overlapBytes) next--;
    }
    index = next;
  }
  return windows;
}
