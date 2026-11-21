import { describe, expect, it } from 'vitest';
import type { Block } from '@archive/casefile';
import type { Content } from '../src/lib/episode';
import { receiptOf, wordOf } from '../src/lib/receipt';

const block = (slot: string, props?: Record<string, unknown>): Block => ({ block: 'tender', slot, props });

describe('receiptOf', () => {
  const content: Record<string, Content> = {
    items: { kind: 'items', currency: '£', taxes: [{ code: 'A', rate: 20 }], taxMode: 'added', tender: { method: 'CASH', amount: 20 }, items: [{ name: 'X', price: 10, tax: 'A' }] },
    note: { kind: 'value', value: 'hello' },
  };
  it('works out the figures for the list the block points at', () => {
    const r = receiptOf(block('items'), content);
    expect(r?.currency).toBe('£');
    expect(r?.totals).toMatchObject({ subtotal: 1000, tax: 200, total: 1200, tendered: 2000, change: 800 });
  });
  it('gives nothing for a slot that is not a list, a missing slot, or a block with no slot', () => {
    expect(receiptOf(block('note'), content)).toBeUndefined();
    expect(receiptOf(block('nope'), content)).toBeUndefined();
    expect(receiptOf({ block: 'tender' }, content)).toBeUndefined();
  });
});

describe('wordOf', () => {
  it('uses the template wording when set, else the default', () => {
    expect(wordOf(block('items', { rateLabel: 'TAUX' }), 'rateLabel', 'RATE')).toBe('TAUX');
    expect(wordOf(block('items'), 'rateLabel', 'RATE')).toBe('RATE');
    expect(wordOf(block('items', { rateLabel: 5 }), 'rateLabel', 'RATE')).toBe('RATE');
  });
});
