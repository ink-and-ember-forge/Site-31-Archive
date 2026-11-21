import { describe, expect, it } from 'vitest';
import { MAX_QR_MESSAGE, qrMatrix } from '../src/lib/qr';

describe('qrMatrix', () => {
  it('makes a square matrix with the three finder patterns in the corners', () => {
    const m = qrMatrix('PLACEHOLDER HIDDEN MESSAGE')!;
    expect(m.length).toBeGreaterThanOrEqual(21);
    expect(m.every((row) => row.length === m.length)).toBe(true);
    const n = m.length;
    // each finder pattern is a 7x7 ring with a 3x3 centre
    for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      expect(m[r0][c0]).toBe(true);
      expect(m[r0 + 3][c0 + 3]).toBe(true);
      expect(m[r0 + 1][c0 + 1]).toBe(false);
      expect(m[r0 + 6][c0 + 6]).toBe(true);
    }
  });
  it('is the same every time, and different for a different message', () => {
    expect(qrMatrix('abc')).toEqual(qrMatrix('abc'));
    expect(qrMatrix('abc')).not.toEqual(qrMatrix('abd'));
  });
  it('grows for a longer message and accepts the longest allowed, in any language', () => {
    expect(qrMatrix('x'.repeat(200))!.length).toBeGreaterThan(qrMatrix('x')!.length);
    expect(qrMatrix('é'.repeat(MAX_QR_MESSAGE))).not.toBeNull();
    expect(qrMatrix('日本語のメッセージ')).not.toBeNull();
  });
  it('gives nothing for an empty message or one that is too long', () => {
    expect(qrMatrix('')).toBeNull();
    expect(qrMatrix('   ')).toBeNull();
    expect(qrMatrix('x'.repeat(MAX_QR_MESSAGE + 1))).toBeNull();
  });
});
