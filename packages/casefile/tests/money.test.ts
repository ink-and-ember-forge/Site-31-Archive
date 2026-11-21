import { describe, expect, it } from 'vitest';
import {
  computeTotals,
  formatMoney,
  formatRate,
  MAX_ITEMS,
  normaliseChoices,
  grossMinor,
  lineMinor,
  acceptedDiscounts,
  printedDiffers,
  normaliseItems,
  parseQuantityText,
  resolveTaxes,
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
    expect(totals(items)).toEqual({ subtotal: 1850, base: 0, tax: 0, total: 1850 }); // nothing to tax, so no taxed base
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

describe('tax categories', () => {
  const taxes = [
    { code: 'A', label: 'VAT', rate: 20 },
    { code: 'B', label: 'VAT', rate: 0 },
    { code: 'C', label: 'LUXURY', rate: 5 },
  ];
  const items: ItemLine[] = [
    { name: 'X', price: 4.5, tax: 'A' },
    { name: 'Y', price: 2, tax: 'B' },
    { name: 'Z', price: 12, tax: 'A' },
    { name: 'PLAIN', price: 1 },
  ];

  it('works out tax per category, and the added tax is summed into the total', () => {
    const t = computeTotals({ items, taxes, taxMode: 'added' });
    expect(t.subtotal).toBe(1950);
    expect(t.categories).toEqual([
      { code: 'A', label: 'VAT', rate: 20, base: 1650, tax: 330 },
      { code: 'B', label: 'VAT', rate: 0, base: 200, tax: 0 },
    ]); // C is unused, so it has no row
    expect(t.tax).toBe(330);
    expect(t.total).toBe(2280);
    expect(t.taxableBase).toBe(1850);
  });

  it('included tax is the share of each category, and the total does not change', () => {
    const t = computeTotals({ items, taxes, taxMode: 'included' });
    expect(t.categories[0].tax).toBe(275); // 16.50 * 20 / 120
    expect(t.total).toBe(1950);
  });

  it('defaults to tax added on top', () => {
    expect(computeTotals({ items, taxes }).taxMode).toBe('added');
  });

  it('rounds each category on its own, so the printed table adds up to the printed tax', () => {
    const many: ItemLine[] = [{ name: 'a', price: 0.1, tax: 'A' }, { name: 'b', price: 0.1, tax: 'A' }, { name: 'c', price: 0.1, tax: 'B' }];
    const t = computeTotals({ items: many, taxes: [{ code: 'A', rate: 17.5 }, { code: 'B', rate: 17.5 }], taxMode: 'added' });
    expect(t.categories.map((c) => c.tax)).toEqual([4, 2]); // 0.035 -> 4p, 0.0175 -> 2p
    expect(t.tax).toBe(6);
    expect(t.total).toBe(36);
  });

  it('a line that names an unknown category is not taxed', () => {
    const t = computeTotals({ items: [{ name: 'a', price: 1, tax: 'Q' }], taxes });
    expect(t.tax).toBe(0);
    expect(t.lines[0].taxable).toBe(false);
  });

  it('an older single tax setting still works, as category T', () => {
    const t = computeTotals({ items: [{ name: 'a', price: 10, taxable: true }, { name: 'b', price: 5 }], tax: { mode: 'added', rate: 20, label: 'VAT' } });
    expect(t.categories).toEqual([{ code: 'T', label: 'VAT', rate: 20, base: 1000, tax: 200 }]);
    expect(t.total).toBe(1700);
    expect(resolveTaxes({ tax: { mode: 'included', rate: 5 } }).categories[0].code).toBe('T');
  });

  it('categories take over from the older setting, and "taxable" is then ignored', () => {
    const t = computeTotals({ items: [{ name: 'a', price: 10, taxable: true }], tax: { mode: 'added', rate: 50 }, taxes: [{ code: 'A', rate: 10 }] });
    expect(t.tax).toBe(0);
  });
});

describe('quantity at unit price', () => {
  it('the line is quantity x unit price, rounded half away from zero to the penny', () => {
    expect(lineMinor({ quantity: 3, unitPrice: 1.5 })).toBe(450);
    expect(lineMinor({ quantity: 0.452, unitPrice: 2.99 })).toBe(135); // 1.35148
    expect(lineMinor({ quantity: 0.5, unitPrice: 0.01 })).toBe(1); // 0.005 -> 0.01
    expect(lineMinor({ quantity: 3, unitPrice: -1.5 })).toBe(-450);
  });
  it('is exact where floating point is not', () => {
    expect(lineMinor({ quantity: 3, unitPrice: 1.1 })).toBe(330); // 3 * 1.1 is 3.3000000000000003
    expect(lineMinor({ quantity: 0.3, unitPrice: 0.1 })).toBe(3);
  });
  it('quantity x unit price wins over a price, and a price alone still works', () => {
    expect(lineMinor({ price: 99, quantity: 2, unitPrice: 1 })).toBe(200);
    expect(lineMinor({ price: 5 })).toBe(500);
    expect(lineMinor({ quantity: 2 })).toBeNull();
    expect(lineMinor({ unitPrice: 2 })).toBeNull();
    expect(lineMinor({})).toBeNull();
  });
  it('refuses unusable quantities and lines that are too large', () => {
    for (const quantity of [0, -1, NaN, 10_001]) expect(lineMinor({ quantity, unitPrice: 1 })).toBeNull();
    expect(lineMinor({ quantity: 10_000, unitPrice: 1_000_000 })).toBeNull(); // 10,000,000,000 is over the limit
  });
  it('is carried on the priced line for display', () => {
    const t = computeTotals({ items: [{ name: 'APPLES', code: '4011', quantity: 2, unitPrice: 1.5 }] });
    expect(t.lines[0]).toMatchObject({ minor: 300, quantity: 2, unitMinor: 150, code: '4011' });
    expect(t.subtotal).toBe(300);
  });
});

describe('tender and change', () => {
  const items: ItemLine[] = [{ name: 'A', price: 18.5 }];
  it('change is what is handed over above the total', () => {
    const t = computeTotals({ items, tender: { method: 'CASH', amount: 20 } });
    expect(t).toMatchObject({ tendered: 2000, tenderMethod: 'CASH', change: 150 });
  });
  it('change is worked out against the total including added tax', () => {
    const t = computeTotals({ items: [{ name: 'A', price: 10, tax: 'A' }], taxes: [{ code: 'A', rate: 20 }], tender: { amount: 20 } });
    expect(t.total).toBe(1200);
    expect(t.change).toBe(800);
  });
  it('an exact or short payment gives no change, and nothing is invented', () => {
    expect(computeTotals({ items, tender: { amount: 18.5 } }).change).toBe(0);
    expect(computeTotals({ items, tender: { amount: 10 } })).toMatchObject({ tendered: 1000, change: 0 });
  });
  it('no tender, no tender fields', () => {
    const t = computeTotals({ items });
    expect(t.tendered).toBeUndefined();
    expect(t.change).toBeUndefined();
  });
  it('an unusable amount is ignored', () => {
    expect(computeTotals({ items, tender: { amount: NaN } }).tendered).toBeUndefined();
    expect(computeTotals({ items, tender: { amount: -5 } }).tendered).toBeUndefined();
  });
});

describe('normaliseItems with categories, item fields and tender', () => {
  it('keeps a full, valid receipt exactly, in reading order', () => {
    const raw = {
      kind: 'items',
      currency: '£',
      taxes: [{ code: 'A', label: 'VAT', rate: 20 }, { code: 'B', rate: 0 }],
      taxMode: 'included',
      tender: { method: 'CARD', amount: 10 },
      items: [
        { name: 'TEA', code: '123', quantity: 2, unitPrice: 1.5, tax: 'A' },
        { name: 'BREAD', price: 1, tax: 'B' },
      ],
    };
    const { content, issues } = normaliseItems(raw);
    expect(issues).toEqual([]);
    expect(content).toEqual(raw);
    expect(Object.keys(content)).toEqual(['kind', 'currency', 'taxes', 'taxMode', 'tender', 'items']);
    expect(Object.keys(content.items[0])).toEqual(['name', 'code', 'quantity', 'unitPrice', 'tax']);
  });

  it('drops a bad category with a reason and keeps the rest', () => {
    const { content, issues } = normaliseItems({
      taxes: [{ code: 'A', rate: 20 }, { code: 'A', rate: 5 }, { code: '', rate: 1 }, { code: 'TOOLONG', rate: 1 }, { code: 'B', rate: 101 }, { code: 'C', rate: '5' }, null, { code: ' D ', rate: 5 }],
      items: [],
    });
    expect(content.taxes?.map((c) => c.code)).toEqual(['A', 'D']);
    expect(issues).toHaveLength(6);
    expect(issues.join(' | ')).toContain('another category already uses that code');
  });

  it('too many categories, and a non-list, are handled', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ code: `C${i}`, rate: 1 }));
    expect(normaliseItems({ taxes: many }).content.taxes).toHaveLength(10);
    const r = normaliseItems({ taxes: 'A', items: [{ name: 'x', price: 1 }] });
    expect(r.content.taxes).toBeUndefined();
    expect(r.content.items).toHaveLength(1);
    expect(r.issues[0]).toContain('must be a list');
  });

  it('ignores a bad tax mode, and the older setting when categories are present', () => {
    expect(normaliseItems({ taxMode: 'sideways', taxes: [{ code: 'A', rate: 1 }] }).issues[0]).toContain('tax mode was ignored');
    const r = normaliseItems({ taxes: [{ code: 'A', rate: 1 }], tax: { mode: 'added', rate: 20 }, items: [{ name: 'x', price: 1, taxable: true }] });
    expect(r.content.tax).toBeUndefined();
    expect(r.content.items[0].taxable).toBeUndefined();
    expect(r.issues.join('|')).toContain('single tax setting was ignored');
  });

  it('an item that names a missing category is kept untaxed, with a reason', () => {
    const { content, issues } = normaliseItems({ taxes: [{ code: 'A', rate: 1 }], items: [{ name: 'x', price: 1, tax: 'Z' }, { name: 'y', price: 1, tax: 7 }] });
    expect(content.items.map((i) => i.tax)).toEqual([undefined, undefined]);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain('does not exist');
  });

  it('an item needs a price, or both a quantity and a unit price', () => {
    const { content, issues } = normaliseItems({ items: [{ name: 'a' }, { name: 'b', quantity: 2 }, { name: 'c', quantity: 2, unitPrice: 1 }, { name: 'd', price: 3, quantity: 2 }] });
    expect(content.items.map((i) => i.name)).toEqual(['c', 'd']);
    expect(content.items[1].quantity).toBeUndefined(); // the half pair is ignored, the price kept
    expect(issues).toHaveLength(4);
  });

  it('ignores bad quantity pairs and product codes without losing the item', () => {
    const { content, issues } = normaliseItems({ items: [{ name: 'a', price: 2, quantity: 0, unitPrice: 1 }, { name: 'b', price: 2, code: 7 }, { name: 'c', price: 2, code: 'X'.repeat(21) }] });
    expect(content.items).toEqual([{ name: 'a', price: 2 }, { name: 'b', price: 2 }, { name: 'c', price: 2 }]);
    expect(issues).toHaveLength(3);
  });

  it('a bad price is ignored when a quantity and unit price can stand in', () => {
    const { content, issues } = normaliseItems({ items: [{ name: 'a', price: 'x', quantity: 2, unitPrice: 1 }] });
    expect(content.items).toEqual([{ name: 'a', quantity: 2, unitPrice: 1 }]);
    expect(issues).toHaveLength(1);
  });

  it('reads a tender, and ignores a bad one with a reason', () => {
    expect(normaliseItems({ tender: { method: '  cash ', amount: 5 } }).content.tender).toEqual({ method: 'cash', amount: 5 });
    expect(normaliseItems({ tender: { amount: 0 } }).content.tender).toEqual({ amount: 0 });
    for (const tender of [{ method: 'CASH' }, { amount: -1 }, { amount: '5' }, { amount: 2_000_000 }, 5, null, []]) {
      const r = normaliseItems({ tender, items: [] });
      expect(r.content.tender).toBeUndefined();
      expect(r.issues[0]).toContain('tender was ignored');
    }
  });

  it('never loses the items, whatever else is wrong', () => {
    const r = normaliseItems({ currency: 5, taxes: 3, taxMode: 1, tender: 'x', items: [{ name: 'keep', price: 1 }] });
    expect(r.content.items).toEqual([{ name: 'keep', price: 1 }]);
    expect(r.issues).toHaveLength(4);
  });
});

describe('parseQuantityText', () => {
  it('reads plain numbers, with a comma as the decimal mark', () => {
    expect(parseQuantityText('2')).toEqual({ ok: true, value: 2 });
    expect(parseQuantityText(' 0,452 ')).toEqual({ ok: true, value: 0.452 });
    expect(parseQuantityText('10000')).toEqual({ ok: true, value: 10000 });
  });
  it('refuses anything else, with a reason', () => {
    for (const bad of ['', 'x', '-1', '0', '0.000', '1.2345', '10001', '1e3', '2 kg']) expect(parseQuantityText(bad).ok, bad).toBe(false);
    expect((parseQuantityText('1.2345') as { reason: string }).reason).toContain('three decimal');
  });
});

describe('discounts on an item', () => {
  it('take money off the line, and the line is what is taxed', () => {
    const t = computeTotals({
      taxes: [{ code: 'A', rate: 20 }],
      taxMode: 'added',
      items: [{ name: 'X', price: 10, tax: 'A', discounts: [{ label: 'MULTIBUY', amount: 2.5 }, { amount: 0.5 }] }, { name: 'Y', price: 5 }],
    });
    expect(t.lines[0]).toMatchObject({ grossMinor: 1000, minor: 700, discounts: [{ label: 'MULTIBUY', minor: 250 }, { minor: 50 }] });
    expect(t.subtotal).toBe(1200);
    expect(t.categories[0]).toMatchObject({ base: 700, tax: 140 }); // 20% of 7.00, not of 10.00
    expect(t.total).toBe(1340);
    expect(t.savings).toBe(300);
  });
  it('work on a quantity line', () => {
    const line: ItemLine = { name: 'a', quantity: 3, unitPrice: 1.5, discounts: [{ amount: 1 }] };
    expect(lineMinor(line)).toBe(350);
    expect(grossMinor(line)).toBe(450);
  });
  it('only count if they fit: never below zero, never on a free or negative line', () => {
    expect(acceptedDiscounts({ price: 5, discounts: [{ amount: 3 }, { amount: 3 }, { amount: 2 }] }).map((d) => d.minor)).toEqual([300, 200]);
    expect(acceptedDiscounts({ price: 5, discounts: [{ amount: 5 }] }).map((d) => d.minor)).toEqual([500]);
    expect(acceptedDiscounts({ price: 0, discounts: [{ amount: 1 }] })).toEqual([]);
    expect(acceptedDiscounts({ price: -2, discounts: [{ amount: 1 }] })).toEqual([]);
    expect(lineMinor({ price: 5, discounts: [{ amount: 6 }] })).toBe(500);
  });
  it('ignore amounts that are not a price above zero', () => {
    for (const amount of [0, -1, NaN, 2_000_000, '1' as unknown as number]) expect(acceptedDiscounts({ price: 5, discounts: [{ amount }] }), String(amount)).toEqual([]);
  });
  it('are exact where floating point is not', () => {
    expect(lineMinor({ price: 0.3, discounts: [{ amount: 0.1 }, { amount: 0.1 }] })).toBe(10);
  });
  it('a receipt with none has no savings', () => {
    expect(computeTotals({ items: [{ name: 'a', price: 1 }] }).savings).toBe(0);
  });
  it('included tax is also taken from the discounted line', () => {
    const t = computeTotals({ taxes: [{ code: 'A', rate: 20 }], taxMode: 'included', items: [{ name: 'a', price: 12, tax: 'A', discounts: [{ amount: 2 }] }] });
    expect(t.total).toBe(1000);
    expect(t.categories[0].tax).toBe(167); // 10.00 * 20 / 120
  });
});

describe('overrides (printed text in place of a figure)', () => {
  it('are passed through exactly as written, and the real figures are untouched', () => {
    const t = computeTotals({
      taxes: [{ code: 'A', rate: 20 }],
      items: [{ name: 'a', price: 10, tax: 'A', printed: ' 1O.00 ' }],
      overrides: { total: 'VOID', change: '--.--', tax: { A: '2.0O', Z: 'ignored' } },
    });
    expect(t.lines[0].printed).toBe('1O.00');
    expect(t.printed).toEqual({ total: 'VOID', change: '--.--', tax: { A: '2.0O', Z: 'ignored' } });
    expect(t.total).toBe(1200);
    expect(t.tax).toBe(200);
  });
  it('change is worked out from the real total, not the printed one', () => {
    const t = computeTotals({ items: [{ name: 'a', price: 10 }], tender: { amount: 20 }, overrides: { total: '5.00' } });
    expect(t.change).toBe(1000);
  });
  it('blank or non-text overrides are not printed', () => {
    const t = computeTotals({ items: [], overrides: { total: '  ', subtotal: 5 as unknown as string } });
    expect(t.printed).toEqual({ tax: {} });
  });
});

describe('printedDiffers (is the printed text really a different figure?)', () => {
  it('matches the same amount however it is written', () => {
    for (const text of ['18.50', '18.5', '£18.50', ' $18.50 ', '18,50']) expect(printedDiffers(text, 1850), text).toBe(false);
    expect(printedDiffers('1,234.50', 123450)).toBe(false);
    expect(printedDiffers('-1.00', -100)).toBe(false);
  });
  it('flags a different amount, words, and look-alike characters', () => {
    for (const text of ['18.51', '19', 'VOID', '--.--', '18.5O', '', '£']) expect(printedDiffers(text, 1850), text).toBe(true);
  });
});

describe('normaliseItems with discounts and overrides', () => {
  it('keeps valid ones exactly, in reading order', () => {
    const raw = {
      kind: 'items',
      taxes: [{ code: 'A', rate: 20 }],
      overrides: { total: 'VOID', tax: { A: '1.0O' } },
      items: [{ name: 'X', price: 10, discounts: [{ label: 'SAVE', amount: 1 }, { amount: 2 }], tax: 'A', printed: '1O' }],
    };
    const { content, issues } = normaliseItems(raw);
    expect(issues).toEqual([]);
    expect(content).toEqual(raw);
    expect(Object.keys(content.items[0])).toEqual(['name', 'price', 'discounts', 'tax', 'printed']);
    expect(Object.keys(content)).toEqual(['kind', 'taxes', 'overrides', 'items']);
  });
  it('drops a discount that does not fit or is not a price, with a reason, and keeps the item', () => {
    const { content, issues } = normaliseItems({ items: [{ name: 'X', price: 5, discounts: [{ amount: 3 }, { amount: 3 }, { amount: -1 }, 'x', { amount: 1, label: 5 }] }] });
    expect(content.items[0].discounts).toEqual([{ amount: 3 }, { amount: 1 }]);
    expect(issues).toHaveLength(4);
    expect(issues.join('|')).toContain('cannot take more than the line');
  });
  it('ignores discounts that are not a list, extra ones, and discounts on a free line', () => {
    expect(normaliseItems({ items: [{ name: 'X', price: 5, discounts: 'lots' }] }).issues[0]).toContain('must be a list');
    const many = Array.from({ length: 7 }, () => ({ amount: 0.1 }));
    const r = normaliseItems({ items: [{ name: 'X', price: 5, discounts: many }] });
    expect(r.content.items[0].discounts).toHaveLength(5);
    expect(r.issues[0]).toContain('only the first 5');
    expect(normaliseItems({ items: [{ name: 'X', price: 0, discounts: [{ amount: 1 }] }] }).content.items[0].discounts).toBeUndefined();
  });
  it('ignores bad printed text and bad overrides, each with a reason, never losing items', () => {
    const r = normaliseItems({
      taxes: [{ code: 'A', rate: 1 }],
      overrides: { total: '', change: 5, savings: 'x'.repeat(31), subtotal: 'ok', tax: { A: '', Q: 'x' } },
      items: [{ name: 'a', price: 1, printed: 5 }, { name: 'b', price: 1, printed: 'x'.repeat(31) }],
    });
    expect(r.content.overrides).toEqual({ subtotal: 'ok' });
    expect(r.content.items).toHaveLength(2);
    expect(r.content.items.every((i) => i.printed === undefined)).toBe(true);
    expect(r.issues).toHaveLength(7);
    expect(normaliseItems({ overrides: 'x' }).issues[0]).toContain('must be an object');
    expect(normaliseItems({ overrides: { tax: 'x' } }).issues[0]).toContain('category code');
  });
  it('an older receipt is read exactly as before', () => {
    const raw = { kind: 'items', tax: { mode: 'added', rate: 20 }, items: [{ name: 'a', price: 1, taxable: true }] };
    expect(normaliseItems(raw)).toEqual({ content: raw, issues: [] });
  });
});
