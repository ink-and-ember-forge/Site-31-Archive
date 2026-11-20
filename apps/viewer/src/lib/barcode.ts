/**
 * A decorative barcode: a repeatable pattern of bars made from a seed, for the look of a receipt.
 * It does not encode anything and is not a real barcode standard, so it can never be scanned into a
 * real code by accident.
 */
export interface Bar {
  x: number;
  width: number;
}

/** FNV-1a: a small, stable hash so the same seed always gives the same bars. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function barcodeBars(seed: string, total = 96): Bar[] {
  let state = hash(seed || 'placeholder') || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
  const bars: Bar[] = [];
  let x = 0;
  while (x < total) {
    const width = 1 + Math.floor(next() * 3); // bars one to three units wide
    const gap = 1 + Math.floor(next() * 3);
    if (x + width > total) break;
    bars.push({ x, width });
    x += width + gap;
  }
  return bars;
}
