import { describe, expect, it } from 'vitest';
import type { ItemsContent } from '@archive/casefile';
import { computeTotals, normaliseItems } from '@archive/casefile';
import { buildContent, draftFrom, emptyOverrides, moveRow, newCategory, newDiscount, newRow, usesDetails, type Draft } from '../renderer/src/lib/items';

const draft = (over: Partial<Draft> = {}): Draft => ({ currency: '', taxMode: 'added', categories: [], rows: [], tenderMethod: '', tenderAmount: '', overrides: emptyOverrides(), ...over });
const cats = () => [newCategory({ code: 'A', label: 'VAT', rateText: '20' }), newCategory({ code: 'B', label: 'VAT', rateText: '0' })];

describe('draftFrom (opening a saved list for editing)', () => {
  it('starts an empty receipt with no categories, no tender and no rows', () => {
    expect(draftFrom(undefined)).toMatchObject({ currency: '', taxMode: 'added', categories: [], rows: [], tenderMethod: '', tenderAmount: '' });
  });

  it('shows prices as they would be typed', () => {
    const d = draftFrom({ kind: 'items', items: [{ name: 'A', price: 4.5 }, { name: 'B', price: 12 }, { name: 'C', price: 0.05 }, { name: 'D', price: -2.5 }] });
    expect(d.rows.map((r) => r.priceText)).toEqual(['4.50', '12', '0.05', '-2.50']);
  });

  it('carries categories, the mode, each item\'s category, codes, quantities and the tender', () => {
    const d = draftFrom({
      kind: 'items',
      currency: '£',
      taxes: [{ code: 'A', label: 'VAT', rate: 7.5 }],
      taxMode: 'included',
      tender: { method: 'CASH', amount: 20 },
      items: [{ name: 'A', code: '12', quantity: 2.5, unitPrice: 1.2, tax: 'A' }, { name: 'B', price: 2 }],
    });
    expect(d).toMatchObject({ currency: '£', taxMode: 'included', tenderMethod: 'CASH', tenderAmount: '20' });
    expect(d.categories.map((c) => [c.code, c.label, c.rateText])).toEqual([['A', 'VAT', '7.5']]);
    expect(d.rows[0]).toMatchObject({ code: '12', quantityText: '2.5', unitPriceText: '1.20', priceText: '', taxCode: 'A' });
    expect(d.rows[1]).toMatchObject({ priceText: '2', taxCode: '' });
  });

  it('opens an older single-rate receipt as one category, "T", so a save keeps its tax', () => {
    const original: ItemsContent = { kind: 'items', currency: '£', tax: { mode: 'added', rate: 20, label: 'VAT' }, items: [{ name: 'A', price: 10, taxable: true }, { name: 'B', price: 5 }] };
    const d = draftFrom(original);
    expect(d.categories.map((c) => c.code)).toEqual(['T']);
    expect(d.rows.map((r) => r.taxCode)).toEqual(['T', '']);
    const saved = buildContent(d).content!;
    expect(saved.taxes).toEqual([{ code: 'T', label: 'VAT', rate: 20 }]);
    expect(computeTotals(saved)).toMatchObject({ subtotal: 1500, tax: 200, total: 1700 }); // the same figures as before
  });

  it('says whether any row uses codes or quantities', () => {
    expect(usesDetails(draft({ rows: [newRow({ name: 'A', priceText: '1' })] }))).toBe(false);
    expect(usesDetails(draft({ rows: [newRow({ name: 'A', code: '1', priceText: '1' })] }))).toBe(true);
  });
});

describe('buildContent (what is saved)', () => {
  it('builds the list in reading order', () => {
    const built = buildContent(
      draft({
        currency: ' £ ',
        taxMode: 'included',
        categories: [newCategory({ code: ' A ', label: ' VAT ', rateText: '20%' })],
        tenderMethod: ' cash ',
        tenderAmount: '10,50',
        rows: [newRow({ name: ' Tea ', code: ' 123 ', priceText: '4,50', taxCode: 'A' }), newRow({ name: 'Biscuits', priceText: '2' })],
      }),
    );
    expect(built.content).toEqual({
      kind: 'items',
      currency: '£',
      taxes: [{ code: 'A', label: 'VAT', rate: 20 }],
      taxMode: 'included',
      tender: { method: 'cash', amount: 10.5 },
      items: [{ name: 'Tea', code: '123', price: 4.5, tax: 'A' }, { name: 'Biscuits', price: 2 }],
    });
    expect(Object.keys(built.content!)).toEqual(['kind', 'currency', 'taxes', 'taxMode', 'tender', 'items']);
    expect(Object.keys(built.content!.items[0])).toEqual(['name', 'code', 'price', 'tax']);
    expect(built.held).toBe(0);
  });

  it('leaves out an empty currency, no categories, no tender, and blank rows or categories', () => {
    const built = buildContent(draft({ categories: [newCategory()], rows: [newRow(), newRow({ name: 'A', priceText: '1' }), newRow({ name: '  ', priceText: ' ' })] }));
    expect(built.content).toEqual({ kind: 'items', items: [{ name: 'A', price: 1 }] });
  });

  it('a quantity and unit price replace the price, which is not saved', () => {
    const built = buildContent(draft({ rows: [newRow({ name: 'Apples', quantityText: '0,452', unitPriceText: '2.99', priceText: '99' })] }));
    expect(built.content?.items).toEqual([{ name: 'Apples', quantity: 0.452, unitPrice: 2.99 }]);
    expect(Object.keys(built.content!.items[0])).toEqual(['name', 'quantity', 'unitPrice']);
  });

  it('holds the save when a quantity has no unit price, or the other way round', () => {
    const rows = [newRow({ name: 'A', quantityText: '2', priceText: '1' }), newRow({ name: 'B', unitPriceText: '2', priceText: '1' })];
    const built = buildContent(draft({ rows }));
    expect(built.content).toBeNull();
    expect(built.held).toBe(2);
    expect(built.rowErrors[rows[0].key]).toContain('both the quantity and the unit price');
  });

  it('holds the save for a bad quantity or unit price, with the reason', () => {
    const rows = [newRow({ name: 'A', quantityText: '0', unitPriceText: '1' }), newRow({ name: 'B', quantityText: '1.2345', unitPriceText: '1' }), newRow({ name: 'C', quantityText: '1', unitPriceText: '£1' })];
    const built = buildContent(draft({ rows }));
    expect(built.rowErrors[rows[0].key]).toContain('above 0');
    expect(built.rowErrors[rows[1].key]).toContain('three decimal');
    expect(built.rowErrors[rows[2].key]).toContain('currency symbol');
  });

  it('holds a line that is too large, and a product code that is too long', () => {
    const big = buildContent(draft({ rows: [newRow({ name: 'A', quantityText: '10000', unitPriceText: '1000000' })] }));
    expect(big.content).toBeNull();
    expect(Object.values(big.rowErrors)[0]).toContain('largest price');
    expect(buildContent(draft({ rows: [newRow({ name: 'A', code: 'x'.repeat(21), priceText: '1' })] })).content).toBeNull();
  });

  it('holds the whole save while any row has a name but no valid price, and says which', () => {
    const rows = [newRow({ name: 'Good', priceText: '1' }), newRow({ name: 'Unfinished', priceText: '' }), newRow({ name: 'Bad', priceText: '£4' }), newRow({ name: '', priceText: '3' })];
    const built = buildContent(draft({ rows }));
    expect(built.content).toBeNull(); // nothing is saved, so nothing is silently dropped
    expect(built.held).toBe(2);
    expect(Object.keys(built.rowErrors).map(Number)).toEqual([rows[1].key, rows[2].key]);
    expect(built.rowErrors[rows[1].key]).toContain('Enter a price');
    expect(built.rowErrors[rows[2].key]).toContain('currency symbol');
  });

  it('a row with a price but no name is fine', () => {
    expect(buildContent(draft({ rows: [newRow({ priceText: '3' })] })).content?.items).toEqual([{ name: '', price: 3 }]);
  });

  it('holds the save for a bad category, with a reason, and only for categories that hold something', () => {
    const bad = [newCategory({ code: '', label: 'VAT', rateText: '20' }), newCategory({ code: 'A', rateText: 'x' }), newCategory({ code: 'B', rateText: '101' }), newCategory({ code: 'TOOLONG', rateText: '1' })];
    const built = buildContent(draft({ categories: bad }));
    expect(built.content).toBeNull();
    expect(Object.keys(built.categoryErrors)).toHaveLength(4);
    expect(built.categoryErrors[bad[0].key]).toContain('short code');
    expect(built.categoryErrors[bad[2].key]).toContain('more than 100');
    expect(buildContent(draft({ categories: [newCategory()] })).content).not.toBeNull();
  });

  it('holds the save when two categories share a code', () => {
    const c = [newCategory({ code: 'A', rateText: '1' }), newCategory({ code: 'A', rateText: '2' })];
    const built = buildContent(draft({ categories: c }));
    expect(built.content).toBeNull();
    expect(built.categoryErrors[c[1].key]).toContain('already uses');
  });

  it('an item whose category is gone is simply not taxed', () => {
    const built = buildContent(draft({ categories: cats(), rows: [newRow({ name: 'A', priceText: '1', taxCode: 'Z' })] }));
    expect(built.content?.items).toEqual([{ name: 'A', price: 1 }]);
  });

  it('an item cannot be taxed while no category exists', () => {
    expect(buildContent(draft({ rows: [newRow({ name: 'A', priceText: '1', taxCode: 'A' })] })).content?.items).toEqual([{ name: 'A', price: 1 }]);
  });

  it('holds the save for a bad tender amount, but a method alone is just a note-to-self', () => {
    expect(buildContent(draft({ tenderAmount: 'lots' })).tenderError).toContain('Type just the number');
    expect(buildContent(draft({ tenderAmount: '-5' })).tenderError).toContain('negative');
    expect(buildContent(draft({ tenderAmount: '5', tenderMethod: 'x'.repeat(30) })).tenderError).toContain('at most 20');
    const method = buildContent(draft({ tenderMethod: 'CASH' }));
    expect(method.content?.tender).toBeUndefined();
    expect(method.content).not.toBeNull();
  });

  it('holds the save for a currency that is too long', () => {
    expect(buildContent(draft({ currency: 'TOOLONG' })).currencyError).toBeTruthy();
    expect(buildContent(draft({ currency: 'US$' })).content).not.toBeNull();
  });

  it('everything it builds is accepted by the checker the file layer uses, with nothing dropped', () => {
    const cases: Draft[] = [
      draft(),
      draft({ currency: '£', rows: [newRow({ name: 'A', priceText: '0.1' }), newRow({ name: 'B', priceText: '0.2' })] }),
      draft({ currency: '€', taxMode: 'included', categories: [newCategory({ code: 'A', rateText: '7.5' })], rows: [newRow({ name: 'A', priceText: '-1.25', taxCode: 'A' })] }),
      draft({ categories: [newCategory({ code: 'G', label: 'GST', rateText: '0' })], tenderMethod: 'CARD', tenderAmount: '0', rows: [newRow({ name: 'A', priceText: '1000000' })] }),
      draft({ categories: cats(), rows: [newRow({ name: 'A', code: '9', quantityText: '2.35', unitPriceText: '1.99', taxCode: 'B' })] }),
    ];
    for (const d of cases) {
      const { content } = buildContent(d);
      expect(content).not.toBeNull();
      const checked = normaliseItems(content);
      expect(checked.issues).toEqual([]);
      expect(checked.content).toEqual(content);
    }
  });

  it('a list opened for editing and saved again without changes is exactly what it was', () => {
    const original: ItemsContent = {
      kind: 'items',
      currency: '£',
      taxes: [{ code: 'A', label: 'VAT', rate: 17.5 }, { code: 'B', rate: 0 }],
      taxMode: 'included',
      tender: { method: 'CASH', amount: 20 },
      items: [
        { name: 'A', code: '77', price: 4.35, tax: 'A' },
        { name: 'B', quantity: 0.452, unitPrice: 2.99, tax: 'B' },
        { name: 'C', price: -0.5 },
      ],
    };
    expect(buildContent(draftFrom(original)).content).toEqual(original);
  });

  it('the totals the editor shows come from the same code as the viewer, so they cannot disagree', () => {
    const built = buildContent(
      draft({
        currency: '£',
        categories: [newCategory({ code: 'A', rateText: '20' })],
        tenderAmount: '25',
        rows: [newRow({ name: 'A', priceText: '4.50', taxCode: 'A' }), newRow({ name: 'B', priceText: '2' }), newRow({ name: 'C', priceText: '12', taxCode: 'A' })],
      }),
    );
    const totals = computeTotals(built.content!);
    expect([totals.subtotal, totals.taxableBase, totals.tax, totals.total, totals.change]).toEqual([1850, 1650, 330, 2180, 320]);
  });

  it('a list with discounts, printed text and overrides opened for editing and saved again is exactly what it was', () => {
    const original: ItemsContent = {
      kind: 'items',
      currency: '£',
      taxes: [{ code: 'A', rate: 20 }],
      taxMode: 'added',
      overrides: { total: 'VOID', tax: { A: '1.0O' } },
      items: [{ name: 'A', price: 10, discounts: [{ label: 'SAVE', amount: 1 }, { amount: 0.5 }], tax: 'A', printed: '1O' }, { name: 'B', price: 2 }],
    };
    const d = draftFrom(original);
    expect(d.rows[0].discounts.map((x) => [x.label, x.amountText])).toEqual([['SAVE', '1'], ['', '0.50']]);
    expect(d.overrides).toMatchObject({ total: 'VOID', tax: { A: '1.0O' } });
    expect(buildContent(d).content).toEqual(original);
  });

  it('shows the price before discounts when a row is opened for editing', () => {
    expect(draftFrom({ kind: 'items', items: [{ name: 'A', price: 10, discounts: [{ amount: 1 }] }] }).rows[0].priceText).toBe('10');
  });

  it('builds discounts on an item, in reading order, trimming labels', () => {
    const built = buildContent(draft({ rows: [newRow({ name: 'A', priceText: '10', discounts: [newDiscount({ label: ' MULTIBUY ', amountText: '2,50' }), newDiscount({ amountText: '1' })] })] }));
    expect(built.content?.items).toEqual([{ name: 'A', price: 10, discounts: [{ label: 'MULTIBUY', amount: 2.5 }, { amount: 1 }] }]);
    expect(computeTotals(built.content!)).toMatchObject({ subtotal: 650, savings: 350 });
  });

  it('ignores an empty discount row, and a row that is only a discount is not blank', () => {
    const built = buildContent(draft({ rows: [newRow({ name: 'A', priceText: '5', discounts: [newDiscount()] })] }));
    expect(built.content?.items).toEqual([{ name: 'A', price: 5 }]);
  });

  it('holds the save for a bad discount, with the reason', () => {
    const bad = (d: Partial<Parameters<typeof newDiscount>[0]>, price = '5') => buildContent(draft({ rows: [newRow({ name: 'A', priceText: price, discounts: [newDiscount(d)] })] }));
    expect(bad({ amountText: 'lots' }).content).toBeNull();
    expect(Object.values(bad({ amountText: '0' }).rowErrors)[0]).toContain('above 0');
    expect(Object.values(bad({ amountText: '-1' }).rowErrors)[0]).toContain('above 0');
    expect(Object.values(bad({ amountText: '6' }).rowErrors)[0]).toContain('more than the line');
    expect(Object.values(bad({ amountText: '1' }, '0').rowErrors)[0]).toContain('free or negative');
    expect(Object.values(bad({ amountText: '1', label: 'x'.repeat(31) }).rowErrors)[0]).toContain('label');
    expect(bad({ label: 'only a label' }).content).toBeNull();
    const six = buildContent(draft({ rows: [newRow({ name: 'A', priceText: '5', discounts: Array.from({ length: 6 }, () => newDiscount({ amountText: '0.1' })) })] }));
    expect(Object.values(six.rowErrors)[0]).toContain('at most 5');
  });

  it('discounts work on a quantity line', () => {
    const built = buildContent(draft({ rows: [newRow({ name: 'A', quantityText: '3', unitPriceText: '1.5', discounts: [newDiscount({ amountText: '1' })] })] }));
    expect(computeTotals(built.content!).subtotal).toBe(350);
    const tooMuch = buildContent(draft({ rows: [newRow({ name: 'A', quantityText: '3', unitPriceText: '1.5', discounts: [newDiscount({ amountText: '4.6' })] })] }));
    expect(tooMuch.content).toBeNull();
  });

  it('printed text on an item and on figures is kept as typed, trimmed, and blank means none', () => {
    const built = buildContent(
      draft({
        categories: [newCategory({ code: 'A', rateText: '20' })],
        overrides: { subtotal: ' 9.9O ', total: 'VOID', change: '', savings: '  ', tax: { A: '0.0O', Z: 'gone', B: '' } },
        rows: [newRow({ name: 'A', priceText: '5', taxCode: 'A', printed: ' 5.0O ' }), newRow({ name: 'B', priceText: '1', printed: '  ' })],
      }),
    );
    expect(built.content?.items).toEqual([{ name: 'A', price: 5, tax: 'A', printed: '5.0O' }, { name: 'B', price: 1 }]);
    expect(built.content?.overrides).toEqual({ subtotal: '9.9O', total: 'VOID', tax: { A: '0.0O' } });
  });

  it('holds the save when printed text is too long', () => {
    const long = 'x'.repeat(31);
    expect(buildContent(draft({ rows: [newRow({ name: 'A', priceText: '1', printed: long })] })).content).toBeNull();
    const o = buildContent(draft({ overrides: { ...emptyOverrides(), total: long } }));
    expect(o.content).toBeNull();
    expect(o.overrideError).toContain('printed total');
  });

  it('a row that only has discount or printed text counts as using the extra columns', () => {
    expect(usesDetails(draft({ rows: [newRow({ name: 'A', priceText: '1', discounts: [newDiscount()] })] }))).toBe(true);
    expect(usesDetails(draft({ rows: [newRow({ name: 'A', priceText: '1', printed: 'x' })] }))).toBe(true);
  });

  it('removing a category from the list leaves nothing behind in the saved file', () => {
    const d = draft({ categories: [], rows: [newRow({ name: 'A', priceText: '1', taxCode: 'A' })] });
    const { content } = buildContent(d);
    expect(content?.taxes).toBeUndefined();
    expect(content?.taxMode).toBeUndefined();
  });
});

describe('moveRow', () => {
  const rows = [newRow({ name: 'a' }), newRow({ name: 'b' }), newRow({ name: 'c' })];
  it('swaps a row with its neighbour', () => {
    expect(moveRow(rows, rows[1].key, -1).map((r) => r.name)).toEqual(['b', 'a', 'c']);
    expect(moveRow(rows, rows[1].key, 1).map((r) => r.name)).toEqual(['a', 'c', 'b']);
  });
  it('does nothing at the ends or for a row that is not there', () => {
    expect(moveRow(rows, rows[0].key, -1)).toBe(rows);
    expect(moveRow(rows, rows[2].key, 1)).toBe(rows);
    expect(moveRow(rows, 99999, 1)).toBe(rows);
  });
});
