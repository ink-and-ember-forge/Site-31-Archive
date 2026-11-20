import { describe, expect, it } from 'vitest';
import {
  computeTotals,
  formatMoney,
  formatRate,
  MAX_ITEMS,
  normaliseChoices,
  normaliseItems,
  toMinorUnits,
  type ItemLine,
  type TaxSetting,
} from '../src/money';

const totals = (items: ItemLine[], tax?: TaxSetting) => {
  const t = computeTotals({ items, tax });
  return { subtotal: t.subtotal, base: t.taxableBase, tax: t.tax, total: t.total };
};

describe('toMinorUnits (reading a price exactly)', () => {
  it('reads ordinary prices', () => {
    expect(toMinorUnits(4.5)).toBe(450);
    expect(toMinorUnits(12)).toBe(1200);
    expect(toMinorUnits(0)).toBe(0);
    expect(toMinorUnits(0.01)).toBe(1);
    expect(toMinorUnits(19.99)).toBe(1999);
  });
  it('is not fooled by binary floating point', () => {
    expect(toMinorUnits(0.1 + 0.2)).toBe(30); // 0.30000000000000004
    expect(toMinorUnits(1.1 * 3)).toBe(330); // 3.3000000000000003
    expect(toMinorUnits(4.35)).toBe(435); // 4.35 * 100 is 434.99999999999994
    expect(toMinorUnits(1.15)).toBe(115);
  });
  it('rounds a third decimal half away from zero', () => {
    expect(toMinorUnits(1.005)).toBe(101); // 1.005 * 100 is 100.49999999999999
    expect(toMinorUnits(1.004)).toBe(100);
    expect(toMinorUnits(2.675)).toBe(268);
    expect(toMinorUnits(-1.005)).toBe(-101);
    expect(toMinorUnits(-1.004)).toBe(-100);
    expect(toMinorUnits(0.005)).toBe(1);
    expect(toMinorUnits(0.0049)).toBe(0);
  });
  it('reads negatives (discounts)', () => {
    expect(toMinorUnits(-2)).toBe(-200);
    expect(toMinorUnits(-0.5)).toBe(-50);
  });
  it('reads very small numbers written with an exponent as nothing', () => {
    expect(toMinorUnits(1e-7)).toBe(0);
    expect(Object.is(toMinorUnits(-1e-9), 0)).toBe(true); // never negative zero
  });
  it('refuses anything that is not a usable price', () => {
    for (const bad of [NaN, Infinity, -Infinity, 1_000_001, -1_000_001, 1e21]) expect(toMinorUnits(bad)).toBeNull();
    expect(toMinorUnits('4.50' as unknown as number)).toBeNull();
    expect(toMinorUnits(null as unknown as number)).toBeNull();
    expect(toMinorUnits(undefined as unknown as number)).toBeNull();
  });
  it('accepts the largest allowed price', () => {
    expect(toMinorUnits(1_000_000)).toBe(100_000_000);
  });
});

describe('computeTotals', () => {
  const items: ItemLine[] = [
    { name: 'A', price: 4.5, taxable: true },
    { name: 'B', price: 2 },
    { name: 'C', price: 12, taxable: true },
  ];

  it('with no tax setting, the total is the subtotal', () => {
    expect(totals(items)).toEqual({ subtotal: 1850, base: 1650, tax: 0, total: 1850 });
    expect(computeTotals({ items }).hasTax).toBe(false);
  });

  it('tax added on top is charged only on the marked lines', () => {
    expect(totals(items, { mode: 'added', rate: 20 })).toEqual({ subtotal: 1850, base: 1650, tax: 330, total: 2180 });
  });

  it('tax included in the price is the share of the marked lines that is tax, and the total does not change', () => {
    // 16.50 * 20 / 120 = 2.75
    expect(totals(items, { mode: 'included', rate: 20 })).toEqual({ subtotal: 1850, base: 1650, tax: 275, total: 1850 });
  });

  it('an empty list is zero everywhere, with or without tax', () => {
    expect(totals([])).toEqual({ subtotal: 0, base: 0, tax: 0, total: 0 });
    expect(totals([], { mode: 'added', rate: 20 })).toEqual({ subtotal: 0, base: 0, tax: 0, total: 0 });
  });

  it('a tax setting with nothing marked taxable charges nothing but is still reported', () => {
    const t = computeTotals({ items: [{ name: 'A', price: 5 }], tax: { mode: 'added', rate: 20 } });
    expect(t.tax).toBe(0);
    expect(t.hasTax).toBe(true);
  });

  it('a rate of zero charges nothing', () => {
    expect(totals(items, { mode: 'added', rate: 0 }).tax).toBe(0);
    expect(totals(items, { mode: 'included', rate: 0 }).tax).toBe(0);
  });

  it('works with fractional rates exactly', () => {
    // 10.00 at 7.5% is exactly 0.75
    expect(totals([{ name: 'A', price: 10, taxable: true }], { mode: 'added', rate: 7.5 }).tax).toBe(75);
    // 8.00 at 17.25% is exactly 1.38
    expect(totals([{ name: 'A', price: 8, taxable: true }], { mode: 'added', rate: 17.25 }).tax).toBe(138);
  });

  it('rounds the tax half away from zero to the nearest penny', () => {
    // 0.05 at 10% is 0.005: rounds up to 0.01
    expect(totals([{ name: 'A', price: 0.05, taxable: true }], { mode: 'added', rate: 10 }).tax).toBe(1);
    // 0.04 at 10% is 0.004: rounds down to 0
    expect(totals([{ name: 'A', price: 0.04, taxable: true }], { mode: 'added', rate: 10 }).tax).toBe(0);
    // 0.99 at 20% is 0.198: 0.20
    expect(totals([{ name: 'A', price: 0.99, taxable: true }], { mode: 'added', rate: 20 }).tax).toBe(20);
  });

  it('a discount line (negative price) reduces the total, and the tax when it is marked taxable', () => {
    const list: ItemLine[] = [
      { name: 'A', price: 10, taxable: true },
      { name: 'DISCOUNT', price: -2, taxable: true },
    ];
    expect(totals(list, { mode: 'added', rate: 20 })).toEqual({ subtotal: 800, base: 800, tax: 160, total: 960 });
    expect(totals([{ name: 'A', price: 10, taxable: true }, { name: 'D', price: -2 }], { mode: 'added', rate: 20 })).toEqual({
      subtotal: 800,
      base: 1000,
      tax: 200,
      total: 1000,
    });
  });

  it('a negative taxable base gives a negative tax, rounded the same way', () => {
    expect(totals([{ name: 'REFUND', price: -0.05, taxable: true }], { mode: 'added', rate: 10 }).tax).toBe(-1);
  });

  it('adds up many small prices exactly', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ name: `i${i}`, price: 0.1 }));
    expect(totals(many).subtotal).toBe(1000); // not 9.99999999999998
  });

  it('skips a line whose price cannot be used instead of failing', () => {
    const t = computeTotals({ items: [{ name: 'A', price: 1 }, { name: 'B', price: NaN }, { name: 'C', price: 2 }] });
    expect(t.lines).toHaveLength(2);
    expect(t.total).toBe(300);
  });

  it('in added mode the total is always exactly the subtotal plus the tax, for any input', () => {
    let seed = 12345;
    const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let run = 0; run < 300; run++) {
      const list: ItemLine[] = Array.from({ length: 1 + Math.floor(random() * 8) }, () => ({
        name: 'x',
        price: Math.round((random() * 200 - 20) * 100) / 100,
        taxable: random() > 0.5,
      }));
      const rate = Math.round(random() * 3000) / 100;
      const t = computeTotals({ items: list, tax: { mode: 'added', rate } });
      expect(t.total).toBe(t.subtotal + t.tax);
      expect(Number.isInteger(t.total)).toBe(true);
      const inc = computeTotals({ items: list, tax: { mode: 'included', rate } });
      expect(inc.total).toBe(inc.subtotal);
      expect(Math.abs(inc.tax)).toBeLessThanOrEqual(Math.abs(inc.taxableBase));
    }
  });

  it('handles the largest list of the largest prices without losing precision', () => {
    const big = Array.from({ length: MAX_ITEMS }, () => ({ name: 'x', price: 1_000_000, taxable: true }));
    const t = computeTotals({ items: big, tax: { mode: 'added', rate: 100 } });
    expect(t.subtotal).toBe(MAX_ITEMS * 100_000_000);
    expect(t.tax).toBe(t.subtotal);
    expect(Number.isSafeInteger(t.total)).toBe(true);
  });

  it('uses a default tax label, or the given one', () => {
    expect(computeTotals({ items: [], tax: { mode: 'added', rate: 5 } }).taxLabel).toBe('TAX');
    expect(computeTotals({ items: [], tax: { mode: 'added', rate: 5, label: ' VAT ' } }).taxLabel).toBe('VAT');
    expect(computeTotals({ items: [], tax: { mode: 'added', rate: 5, label: '  ' } }).taxLabel).toBe('TAX');
  });
});

describe('formatMoney and formatRate', () => {
  it('shows the symbol before the amount, always with two decimals', () => {
    expect(formatMoney(450, '£')).toBe('£4.50');
    expect(formatMoney(5, '£')).toBe('£0.05');
    expect(formatMoney(0, '£')).toBe('£0.00');
    expect(formatMoney(2180, '€')).toBe('€21.80');
  });
  it('works with no symbol, and with long ones', () => {
    expect(formatMoney(450)).toBe('4.50');
    expect(formatMoney(450, 'US$')).toBe('US$4.50');
  });
  it('puts the sign before the symbol', () => {
    expect(formatMoney(-200, '£')).toBe('-£2.00');
    expect(formatMoney(-5)).toBe('-0.05');
  });
  it('groups thousands', () => {
    expect(formatMoney(123456789, '£')).toBe('£1,234,567.89');
    expect(formatMoney(100000, '£')).toBe('£1,000.00');
    expect(formatMoney(99999, '£')).toBe('£999.99');
  });
  it('shows a rate without trailing zeros', () => {
    expect(formatRate(20)).toBe('20');
    expect(formatRate(7.5)).toBe('7.5');
    expect(formatRate(17.25)).toBe('17.25');
    expect(formatRate(5.0)).toBe('5');
  });
});

describe('normaliseItems (reading a list from a file)', () => {
  it('keeps a good list exactly as written', () => {
    const raw = { kind: 'items', currency: '£', tax: { mode: 'added', rate: 20, label: 'VAT' }, items: [{ name: 'A', price: 1.5, taxable: true }, { name: 'B', price: 2 }] };
    const { content, issues } = normaliseItems(raw);
    expect(issues).toEqual([]);
    expect(content).toEqual({ kind: 'items', currency: '£', tax: { mode: 'added', rate: 20, label: 'VAT' }, items: [{ name: 'A', price: 1.5, taxable: true }, { name: 'B', price: 2 }] });
  });

  it('opens with nothing in it when nothing is given', () => {
    expect(normaliseItems({ kind: 'items' })).toEqual({ content: { kind: 'items', items: [] }, issues: [] });
    expect(normaliseItems(null).content.items).toEqual([]);
    expect(normaliseItems('nonsense').content.items).toEqual([]);
  });

  it('drops a bad item but keeps the others, and says why', () => {
    const { content, issues } = normaliseItems({
      items: [{ name: 'GOOD', price: 1 }, { name: 'BAD PRICE', price: '1.00' }, { price: 2 }, null, 7, { name: 'HUGE', price: 5_000_000 }, { name: 'LAST', price: 3 }],
    });
    expect(content.items.map((i) => i.name)).toEqual(['GOOD', 'LAST']);
    expect(issues).toHaveLength(5);
    expect(issues.join(' | ')).toContain('item 2 ("BAD PRICE") was dropped');
    expect(issues.join(' | ')).toContain('item 3 was dropped: it has no name');
  });

  it('ignores a bad tax setting without losing the items', () => {
    for (const tax of [{ mode: 'sideways', rate: 20 }, { mode: 'added', rate: -1 }, { mode: 'added', rate: 101 }, { mode: 'added', rate: '20' }, { mode: 'added' }, 5, null]) {
      const { content, issues } = normaliseItems({ tax, items: [{ name: 'A', price: 1 }] });
      expect(content.tax).toBeUndefined();
      expect(content.items).toHaveLength(1);
      expect(issues.some((i) => i.includes('tax setting was ignored'))).toBe(true);
    }
  });

  it('accepts the edges of a valid rate', () => {
    expect(normaliseItems({ tax: { mode: 'added', rate: 0 } }).content.tax?.rate).toBe(0);
    expect(normaliseItems({ tax: { mode: 'included', rate: 100 } }).content.tax?.rate).toBe(100);
  });

  it('ignores a bad currency, and drops an empty one', () => {
    expect(normaliseItems({ currency: 5 }).issues).toHaveLength(1);
    expect(normaliseItems({ currency: 'TOOLONGSYMBOL' }).content.currency).toBeUndefined();
    expect(normaliseItems({ currency: '' })).toEqual({ content: { kind: 'items', items: [] }, issues: [] });
  });

  it('ignores a "taxable" that is not true or false, and drops false', () => {
    const { content, issues } = normaliseItems({ items: [{ name: 'A', price: 1, taxable: 'yes' }, { name: 'B', price: 1, taxable: false }, { name: 'C', price: 1, taxable: true }] });
    expect(issues).toHaveLength(1);
    expect(content.items).toEqual([{ name: 'A', price: 1 }, { name: 'B', price: 1 }, { name: 'C', price: 1, taxable: true }]);
  });

  it('uses only the first items of an enormous list, and says so once', () => {
    const { content, issues } = normaliseItems({ items: Array.from({ length: MAX_ITEMS + 50 }, () => ({ name: 'x', price: 1 })) });
    expect(content.items).toHaveLength(MAX_ITEMS);
    expect(issues).toEqual([`only the first ${MAX_ITEMS} items are used`]);
  });

  it('says when the items are not a list', () => {
    expect(normaliseItems({ items: 'none' }).issues).toEqual(['the items must be a list']);
  });

  it('truncates a very long tax label', () => {
    expect(normaliseItems({ tax: { mode: 'added', rate: 5, label: 'x'.repeat(100) } }).content.tax?.label).toHaveLength(20);
  });
});

describe('normaliseChoices', () => {
  it('keeps a list of ids once each', () => {
    expect(normaliseChoices({ kind: 'choices', selected: ['a', 'b', 'a'] }).content.selected).toEqual(['a', 'b']);
  });
  it('opens with nothing ticked when nothing is given', () => {
    expect(normaliseChoices({ kind: 'choices' })).toEqual({ content: { kind: 'choices', selected: [] }, issues: [] });
  });
  it('ignores things that are not text, or not a list, with a reason', () => {
    const a = normaliseChoices({ selected: ['a', 3, null] });
    expect(a.content.selected).toEqual(['a']);
    expect(a.issues).toHaveLength(1);
    const b = normaliseChoices({ selected: 'a' });
    expect(b.content.selected).toEqual([]);
    expect(b.issues).toHaveLength(1);
  });
});

import { parsePriceText, parseRateText } from '../src/money';

describe('parsePriceText (what the author types)', () => {
  it('reads plain prices', () => {
    for (const [text, value] of [['4.50', 4.5], ['4.5', 4.5], ['12', 12], ['0', 0], ['0.05', 0.05], [' 4.50 ', 4.5], ['-2', -2], ['-0.50', -0.5], ['1234.56', 1234.56], ['1 234', 1234]] as const) {
      expect(parsePriceText(text), text).toEqual({ ok: true, value });
    }
  });
  it('accepts a comma as the decimal mark when there is no point', () => {
    expect(parsePriceText('4,50')).toEqual({ ok: true, value: 4.5 });
    expect(parsePriceText('4,5')).toEqual({ ok: true, value: 4.5 });
  });
  it('refuses empty, symbols, words and thousands separators with a reason', () => {
    for (const bad of ['', '   ', '£4.50', '4.50 GBP', 'free', '4.5.0', '1,234.50', '1,234,567', '+4', '--2', '4e3', '.5', '5.', '0x10', 'NaN', 'Infinity']) {
      const r = parsePriceText(bad);
      expect(r.ok, JSON.stringify(bad)).toBe(false);
      if (!r.ok) expect(r.reason.length).toBeGreaterThan(5);
    }
  });
  it('refuses more than two decimals, so what is saved is what was meant', () => {
    expect(parsePriceText('1.005')).toEqual({ ok: false, reason: 'Use at most two decimal places.' });
  });
  it('refuses a price out of range, and accepts the edges', () => {
    expect(parsePriceText('1000001').ok).toBe(false);
    expect(parsePriceText('-1000001').ok).toBe(false);
    expect(parsePriceText('1000000')).toEqual({ ok: true, value: 1_000_000 });
    expect(parsePriceText('-1000000')).toEqual({ ok: true, value: -1_000_000 });
  });
  it('whatever it accepts is a price the totals can use, exactly', () => {
    for (const text of ['0.1', '0.2', '19.99', '4.35', '1.15', '999999.99', '-0.01']) {
      const r = parsePriceText(text);
      if (!r.ok) throw new Error(text);
      expect(toMinorUnits(r.value)).toBe(Math.round(Number(text) * 100));
    }
  });
});

describe('parseRateText', () => {
  it('reads rates from 0 to 100, with an optional percent sign', () => {
    for (const [text, value] of [['20', 20], ['7.5', 7.5], ['17.25', 17.25], ['0', 0], ['100', 100], ['20%', 20], ['7,5', 7.5], [' 5 ', 5]] as const) {
      expect(parseRateText(text), text).toEqual({ ok: true, value });
    }
  });
  it('refuses anything else with a reason', () => {
    for (const bad of ['', '-1', '101', 'abc', '1.234', '1,000', '20 percent', '5.']) {
      const r = parseRateText(bad);
      expect(r.ok, JSON.stringify(bad)).toBe(false);
    }
  });
});
