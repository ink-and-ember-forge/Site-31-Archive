// The item-list editor's working copy and how it becomes a saved list. Pure functions, so every rule is tested
// without a window. Nothing is saved unless the whole list is valid: a half-typed price must never quietly drop a row.
import { MAX_CURRENCY_LENGTH, MAX_ITEMS, MAX_TAX_LABEL_LENGTH, parsePriceText, parseRateText, type ItemLine, type ItemsContent } from '@archive/casefile/money';

export type TaxChoice = 'none' | 'added' | 'included';

export interface Row {
  /** Identifies the row in the editor, not saved. */
  key: number;
  name: string;
  priceText: string;
  taxable: boolean;
}

export interface Draft {
  currency: string;
  taxMode: TaxChoice;
  rateText: string;
  labelText: string;
  rows: Row[];
}

let nextKey = 1;
export const newRow = (over: Partial<Row> = {}): Row => ({ key: nextKey++, name: '', priceText: '', taxable: false, ...over });

/** A price as the author would type it: no trailing zeros beyond two decimals. */
const priceToText = (price: number): string => {
  const minor = Math.round(price * 100);
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
};

export function draftFrom(content?: ItemsContent): Draft {
  return {
    currency: content?.currency ?? '',
    taxMode: content?.tax?.mode ?? 'none',
    rateText: content?.tax ? String(content.tax.rate) : '20',
    labelText: content?.tax?.label ?? '',
    rows: (content?.items ?? []).map((i) => newRow({ name: i.name, priceText: priceToText(i.price), taxable: i.taxable === true })),
  };
}

export interface Built {
  /** The list to save, or null while anything is still being typed or is wrong. */
  content: ItemsContent | null;
  /** Reasons, by row key, for rows that cannot be saved yet. */
  rowErrors: Record<number, string>;
  rateError?: string;
  currencyError?: string;
  labelError?: string;
  /** Rows that hold something but cannot be saved yet. */
  held: number;
}

const isBlank = (r: Row) => r.name.trim() === '' && r.priceText.trim() === '';

export function buildContent(draft: Draft): Built {
  const rowErrors: Record<number, string> = {};
  const items: ItemLine[] = [];
  let held = 0;

  for (const row of draft.rows) {
    if (isBlank(row)) continue; // an empty row is just space to type in
    const price = parsePriceText(row.priceText);
    if (!price.ok) {
      rowErrors[row.key] = price.reason;
      held++;
      continue;
    }
    items.push({ name: row.name.trim(), price: price.value, ...(row.taxable ? { taxable: true } : {}) });
  }
  if (items.length > MAX_ITEMS) {
    held++;
  }

  const currency = draft.currency.trim();
  const currencyError = currency.length > MAX_CURRENCY_LENGTH ? `Use at most ${MAX_CURRENCY_LENGTH} characters.` : undefined;

  let tax: ItemsContent['tax'];
  let rateError: string | undefined;
  let labelError: string | undefined;
  if (draft.taxMode !== 'none') {
    const rate = parseRateText(draft.rateText);
    if (!rate.ok) rateError = rate.reason;
    const label = draft.labelText.trim();
    if (label.length > MAX_TAX_LABEL_LENGTH) labelError = `Use at most ${MAX_TAX_LABEL_LENGTH} characters.`;
    if (rate.ok && !labelError) tax = { mode: draft.taxMode, rate: rate.value, ...(label ? { label } : {}) };
  }

  const blocked = held > 0 || currencyError || rateError || labelError;
  return {
    content: blocked ? null : { kind: 'items', ...(currency ? { currency } : {}), ...(tax ? { tax } : {}), items },
    rowErrors,
    ...(rateError ? { rateError } : {}),
    ...(currencyError ? { currencyError } : {}),
    ...(labelError ? { labelError } : {}),
    held,
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
