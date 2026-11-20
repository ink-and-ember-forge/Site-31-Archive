import { describe, expect, it } from 'vitest';
import type { ItemsContent } from '@archive/casefile';
import { computeTotals, normaliseItems } from '@archive/casefile';
import { buildContent, draftFrom, moveRow, newRow, type Draft } from '../renderer/src/lib/items';

const draft = (over: Partial<Draft> = {}): Draft => ({ currency: '', taxMode: 'none', rateText: '20', labelText: '', rows: [], ...over });

describe('draftFrom (opening a saved list for editing)', () => {
  it('starts an empty receipt with no tax, a sensible rate ready, and no rows', () => {
    const d = draftFrom(undefined);
    expect(d).toMatchObject({ currency: '', taxMode: 'none', rateText: '20', rows: [] });
  });

  it('shows prices as they would be typed', () => {
    const d = draftFrom({ kind: 'items', items: [{ name: 'A', price: 4.5 }, { name: 'B', price: 12 }, { name: 'C', price: 0.05 }, { name: 'D', price: -2.5 }] });
    expect(d.rows.map((r) => r.priceText)).toEqual(['4.50', '12', '0.05', '-2.50']);
  });

  it('carries the currency, tax and taxable marks', () => {
    const d = draftFrom({ kind: 'items', currency: '£', tax: { mode: 'included', rate: 7.5, label: 'VAT' }, items: [{ name: 'A', price: 1, taxable: true }, { name: 'B', price: 2 }] });
    expect(d).toMatchObject({ currency: '£', taxMode: 'included', rateText: '7.5', labelText: 'VAT' });
    expect(d.rows.map((r) => r.taxable)).toEqual([true, false]);
  });
});

describe('buildContent (what is saved)', () => {
  it('builds the list in reading order', () => {
    const built = buildContent(
      draft({ currency: ' £ ', taxMode: 'added', rateText: '20%', labelText: ' VAT ', rows: [newRow({ name: ' Tea ', priceText: '4,50', taxable: true }), newRow({ name: 'Biscuits', priceText: '2' })] }),
    );
    expect(built.content).toEqual({ kind: 'items', currency: '£', tax: { mode: 'added', rate: 20, label: 'VAT' }, items: [{ name: 'Tea', price: 4.5, taxable: true }, { name: 'Biscuits', price: 2 }] });
    expect(Object.keys(built.content!)).toEqual(['kind', 'currency', 'tax', 'items']);
    expect(built.held).toBe(0);
  });

  it('leaves out an empty currency, no tax, and blank rows', () => {
    const built = buildContent(draft({ rows: [newRow(), newRow({ name: 'A', priceText: '1' }), newRow({ name: '  ', priceText: ' ' })] }));
    expect(built.content).toEqual({ kind: 'items', items: [{ name: 'A', price: 1 }] });
  });

  it('keeps taxable marks even while tax is off, so switching it back on loses nothing', () => {
    const built = buildContent(draft({ taxMode: 'none', rows: [newRow({ name: 'A', priceText: '1', taxable: true })] }));
    expect(built.content?.items).toEqual([{ name: 'A', price: 1, taxable: true }]);
    expect(built.content?.tax).toBeUndefined();
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

  it('holds the save for a bad rate, but only when tax is on', () => {
    const rows = [newRow({ name: 'A', priceText: '1' })];
    const off = buildContent(draft({ taxMode: 'none', rateText: 'nonsense', rows }));
    expect(off.content).not.toBeNull();
    const on = buildContent(draft({ taxMode: 'added', rateText: 'nonsense', rows }));
    expect(on.content).toBeNull();
    expect(on.rateError).toContain('Type just the number');
    expect(buildContent(draft({ taxMode: 'added', rateText: '101', rows })).rateError).toContain('more than 100');
  });

  it('holds the save for a currency or tax label that is too long', () => {
    expect(buildContent(draft({ currency: 'TOOLONG' })).currencyError).toBeTruthy();
    expect(buildContent(draft({ taxMode: 'added', labelText: 'x'.repeat(30) })).labelError).toBeTruthy();
    expect(buildContent(draft({ currency: 'US$' })).content).not.toBeNull();
  });

  it('everything it builds is accepted by the checker the file layer uses, with nothing dropped', () => {
    const cases: Draft[] = [
      draft(),
      draft({ currency: '£', rows: [newRow({ name: 'A', priceText: '0.1' }), newRow({ name: 'B', priceText: '0.2' })] }),
      draft({ currency: '€', taxMode: 'included', rateText: '7.5', rows: [newRow({ name: 'A', priceText: '-1.25', taxable: true })] }),
      draft({ taxMode: 'added', rateText: '0', labelText: 'GST', rows: [newRow({ name: 'A', priceText: '1000000' })] }),
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
    const original: ItemsContent = { kind: 'items', currency: '£', tax: { mode: 'added', rate: 17.5, label: 'VAT' }, items: [{ name: 'A', price: 4.35, taxable: true }, { name: 'B', price: 2 }, { name: 'C', price: -0.5 }] };
    expect(buildContent(draftFrom(original)).content).toEqual(original);
  });

  it('the totals the editor shows come from the same code as the viewer, so they cannot disagree', () => {
    const built = buildContent(
      draft({ currency: '£', taxMode: 'added', rateText: '20', rows: [newRow({ name: 'A', priceText: '4.50', taxable: true }), newRow({ name: 'B', priceText: '2' }), newRow({ name: 'C', priceText: '12', taxable: true })] }),
    );
    const totals = computeTotals(built.content!);
    expect([totals.subtotal, totals.taxableBase, totals.tax, totals.total]).toEqual([1850, 1650, 330, 2180]);
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
