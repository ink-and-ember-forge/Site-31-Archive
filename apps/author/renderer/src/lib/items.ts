// The item-list editor's working copy and how it becomes a saved list. Pure functions, so every rule is tested
// without a window. Nothing is saved unless the whole list is valid: a half-typed price must never quietly drop a row.
import {
  LEGACY_TAX_CODE,
  MAX_CURRENCY_LENGTH,
  MAX_CATEGORIES,
  MAX_CODE_LENGTH,
  MAX_ITEMS,
  MAX_METHOD_LENGTH,
  MAX_TAX_CODE_LENGTH,
  MAX_TAX_LABEL_LENGTH,
  lineMinor,
  parsePriceText,
  parseQuantityText,
  parseRateText,
  resolveTaxes,
  type ItemLine,
  type ItemsContent,
  type TaxCategory,
  type TaxMode,
  type Tender,
} from '@archive/casefile/money';

export interface Row {
  /** Identifies the row in the editor, not saved. */
  key: number;
  name: string;
  code: string;
  priceText: string;
  quantityText: string;
  unitPriceText: string;
  /** The code of the row's tax category, or '' for not taxed. */
  taxCode: string;
}

export interface CategoryRow {
  key: number;
  code: string;
  label: string;
  rateText: string;
}

export interface Draft {
  currency: string;
  /** Whether tax is added on top of the prices or already included in them. Only matters when there are categories. */
  taxMode: TaxMode;
  categories: CategoryRow[];
  rows: Row[];
  /** Blank amount means no tender. */
  tenderMethod: string;
  tenderAmount: string;
}

let nextKey = 1;
export const newRow = (over: Partial<Row> = {}): Row => ({
  key: nextKey++,
  name: '',
  code: '',
  priceText: '',
  quantityText: '',
  unitPriceText: '',
  taxCode: '',
  ...over,
});
export const newCategory = (over: Partial<CategoryRow> = {}): CategoryRow => ({ key: nextKey++, code: '', label: '', rateText: '', ...over });

/** An amount as the author would type it: no trailing zeros beyond two decimals. */
const amountToText = (minor: number): string => (minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2));

export function draftFrom(content?: ItemsContent): Draft {
  // An older receipt with a single tax setting opens as one category, "T", so nothing about it is lost on the next save.
  const { categories, mode } = content ? resolveTaxes(content) : { categories: [] as TaxCategory[], mode: 'added' as TaxMode };
  const legacy = !!content && !content.taxes?.length && !!content.tax;
  return {
    currency: content?.currency ?? '',
    taxMode: mode,
    categories: categories.map((c) => newCategory({ code: c.code, label: c.label ?? '', rateText: String(c.rate) })),
    rows: (content?.items ?? []).map((i) => {
      const priced = i.quantity !== undefined && i.unitPrice !== undefined;
      const minor = lineMinor(i) ?? 0;
      return newRow({
        name: i.name,
        code: i.code ?? '',
        // A quantity line shows its unit price and leaves the price to be worked out.
        priceText: priced ? '' : amountToText(minor),
        quantityText: priced ? String(i.quantity) : '',
        unitPriceText: priced ? amountToText(Math.round((i.unitPrice as number) * 100)) : '',
        taxCode: i.tax ?? (legacy && i.taxable ? LEGACY_TAX_CODE : ''),
      });
    }),
    tenderMethod: content?.tender?.method ?? '',
    tenderAmount: content?.tender ? amountToText(Math.round(content.tender.amount * 100)) : '',
  };
}

/** Does any row use the extra columns? Decides whether the editor opens with them showing. */
export const usesDetails = (draft: Draft): boolean => draft.rows.some((r) => r.code !== '' || r.quantityText !== '' || r.unitPriceText !== '');

export interface Built {
  /** The list to save, or null while anything is still being typed or is wrong. */
  content: ItemsContent | null;
  /** Reasons, by row key, for rows that cannot be saved yet. */
  rowErrors: Record<number, string>;
  /** Reasons, by category key. */
  categoryErrors: Record<number, string>;
  currencyError?: string;
  tenderError?: string;
  /** Rows, categories or a tender that hold something but cannot be saved yet. */
  held: number;
}

const isBlank = (r: Row) =>
  [r.name, r.code, r.priceText, r.quantityText, r.unitPriceText].every((t) => t.trim() === '');
const isBlankCategory = (c: CategoryRow) => c.code.trim() === '' && c.label.trim() === '' && c.rateText.trim() === '';

export function buildContent(draft: Draft): Built {
  const rowErrors: Record<number, string> = {};
  const categoryErrors: Record<number, string> = {};
  let held = 0;

  // ---- tax categories
  const categories: TaxCategory[] = [];
  for (const c of draft.categories) {
    if (isBlankCategory(c)) continue;
    const code = c.code.trim();
    const label = c.label.trim();
    const rate = parseRateText(c.rateText);
    let error: string | undefined;
    if (code === '' || code.length > MAX_TAX_CODE_LENGTH) error = `Give it a short code of 1 to ${MAX_TAX_CODE_LENGTH} characters, like A.`;
    else if (categories.some((k) => k.code === code)) error = `Another category already uses the code ${code}.`;
    else if (!rate.ok) error = rate.reason;
    else if (label.length > MAX_TAX_LABEL_LENGTH) error = `Use at most ${MAX_TAX_LABEL_LENGTH} characters for the name.`;
    if (error || !rate.ok) {
      categoryErrors[c.key] = error ?? 'Check this category.';
      held++;
    } else categories.push({ code, ...(label ? { label } : {}), rate: rate.value });
  }
  if (draft.categories.filter((c) => !isBlankCategory(c)).length > MAX_CATEGORIES) held++;
  const known = new Set(categories.map((c) => c.code));

  // ---- items
  const items: ItemLine[] = [];
  for (const row of draft.rows) {
    if (isBlank(row)) continue; // an empty row is just space to type in
    const item: ItemLine = { name: row.name.trim() };
    const code = row.code.trim();
    if (code.length > MAX_CODE_LENGTH) {
      rowErrors[row.key] = `Use at most ${MAX_CODE_LENGTH} characters for the product code.`;
      held++;
      continue;
    }
    if (code) item.code = code;

    const hasQty = row.quantityText.trim() !== '';
    const hasUnit = row.unitPriceText.trim() !== '';
    if (hasQty !== hasUnit) {
      rowErrors[row.key] = 'Fill in both the quantity and the unit price, or leave both empty and just give a price.';
      held++;
      continue;
    }
    if (hasQty && hasUnit) {
      const q = parseQuantityText(row.quantityText);
      const u = parsePriceText(row.unitPriceText);
      if (!q.ok || !u.ok) {
        rowErrors[row.key] = !q.ok ? q.reason : (u as { reason: string }).reason;
        held++;
        continue;
      }
      item.quantity = q.value;
      item.unitPrice = u.value;
    } else {
      const price = parsePriceText(row.priceText);
      if (!price.ok) {
        rowErrors[row.key] = price.reason;
        held++;
        continue;
      }
      item.price = price.value;
    }
    if (lineMinor(item) === null) {
      rowErrors[row.key] = 'This line comes to more than the largest price allowed.';
      held++;
      continue;
    }
    // A category that no longer exists simply means "not taxed".
    if (row.taxCode !== '' && known.has(row.taxCode)) item.tax = row.taxCode;
    items.push(item);
  }
  if (items.length > MAX_ITEMS) held++;

  // ---- currency and tender
  const currency = draft.currency.trim();
  const currencyError = currency.length > MAX_CURRENCY_LENGTH ? `Use at most ${MAX_CURRENCY_LENGTH} characters.` : undefined;

  let tender: Tender | undefined;
  let tenderError: string | undefined;
  if (draft.tenderAmount.trim() !== '') {
    const amount = parsePriceText(draft.tenderAmount);
    const method = draft.tenderMethod.trim();
    if (!amount.ok) tenderError = amount.reason;
    else if (amount.value < 0) tenderError = 'The amount handed over cannot be negative.';
    else if (method.length > MAX_METHOD_LENGTH) tenderError = `Use at most ${MAX_METHOD_LENGTH} characters for the payment method.`;
    else tender = { ...(method ? { method } : {}), amount: amount.value };
  }

  const blocked = held > 0 || currencyError || tenderError;
  const content: ItemsContent = {
    kind: 'items',
    ...(currency ? { currency } : {}),
    ...(categories.length > 0 ? { taxes: categories, taxMode: draft.taxMode } : {}),
    ...(tender ? { tender } : {}),
    items,
  };
  return {
    content: blocked ? null : content,
    rowErrors,
    categoryErrors,
    ...(currencyError ? { currencyError } : {}),
    ...(tenderError ? { tenderError } : {}),
    held: held + (tenderError ? 1 : 0),
  };
}

/** Moves a row up (-1) or down (1). Returns the same list if it cannot move. */
export function moveRow(rows: Row[], key: number, by: -1 | 1): Row[] {
  const from = rows.findIndex((r) => r.key === key);
  const to = from + by;
  if (from < 0 || to < 0 || to >= rows.length) return rows;
  const next = [...rows];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
