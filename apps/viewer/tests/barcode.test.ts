import { describe, expect, it } from 'vitest';
import { barcodeBars } from '../src/lib/barcode';

describe('barcodeBars (decorative only)', () => {
  it('gives the same bars for the same seed, so a receipt never changes between views', () => {
    expect(barcodeBars('Till 1 · 000001')).toEqual(barcodeBars('Till 1 · 000001'));
  });

  it('gives different bars for different seeds', () => {
    expect(barcodeBars('000001')).not.toEqual(barcodeBars('000002'));
  });

  it('stays inside its width, in order, with whole-number widths of one to three', () => {
    for (const seed of ['', 'a', 'PLACEHOLDER', '日本語', 'x'.repeat(500)]) {
      const bars = barcodeBars(seed, 96);
      expect(bars.length).toBeGreaterThan(5);
      let end = -1;
      for (const bar of bars) {
        expect(bar.x).toBeGreaterThan(end); // in order, with a gap before each bar
        expect(bar.width).toBeGreaterThanOrEqual(1);
        expect(bar.width).toBeLessThanOrEqual(3);
        expect(Number.isInteger(bar.x) && Number.isInteger(bar.width)).toBe(true);
        end = bar.x + bar.width;
        expect(end).toBeLessThanOrEqual(96);
      }
    }
  });

  it('does something sensible with no seed', () => {
    expect(barcodeBars('').length).toBeGreaterThan(5);
  });
});
