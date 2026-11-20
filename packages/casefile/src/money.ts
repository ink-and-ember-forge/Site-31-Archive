// Itemised lists (receipts): reading prices exactly, and working out subtotal, tax and total.
//
// Money is held as whole pence or cents, never as floating point, so 0.1 + 0.2 is exactly 0.30 and
// the total can never be a fraction of a penny out. Nothing computed here is ever stored in an episode:
// totals are worked out each time the receipt is shown, so they cannot disagree with the items.

export type TaxMode = 'added' | 'included';

export interface ItemLine {
  name: string;
  /** In currency units, for example 4.5 for four pounds fifty. Optional when quantity and unitPrice are given. */
  price?: number;
  /** A product code printed beside the name. */
  code?: string;
  /** How many (or how much, for a weight). With `unitPrice` the line total is quantity x unitPrice. */
  quantity?: number;
  unitPrice?: number;
  /** The code of one of the receipt's tax categories. No code means the line is not taxed. */
  tax?: string;
  /** Older receipts only: marked lines are taxed by the single `tax` setting. */
  taxable?: boolean;
}

/** An older receipt's single tax setting. Still read; it behaves as one category with the code "T". */
export interface TaxSetting {
  mode: TaxMode;
  /** A percentage, for example 20. */
  rate: number;
  /** The word printed on the tax line. */
  label?: string;
}

export interface TaxCategory {
  /** The short code printed beside an item, for example "A". */
  code: string;
  /** The word printed on the tax line, for example "VAT". */
  label?: string;
  /** A percentage, for example 20. */
  rate: number;
}

export interface Tender {
  /** Printed as written: CASH, DEBIT, CARD. */
  method?: string;
  /** What was handed over, in currency units. Above the total, the difference is the change. */
  amount: number;
}

export interface ItemsContent {
  kind: 'items';
  /** One symbol for the whole list, shown before each amount. */
  currency?: string;
  /** Older receipts: one tax setting for the marked lines. Ignored when `taxes` is present. */
  tax?: TaxSetting;
  taxes?: TaxCategory[];
  /** For every category on the receipt: added on top of the prices, or already included in them. Default added. */
  taxMode?: TaxMode;
  tender?: Tender;
  items: ItemLine[];
}

export const MAX_PRICE = 1_000_000;
export const MAX_QUANTITY = 10_000;
export const MAX_ITEMS = 1000;
export const MAX_CATEGORIES = 10;
export const MAX_CURRENCY_LENGTH = 5;
export const MAX_TAX_LABEL_LENGTH = 20;
export const MAX_TAX_CODE_LENGTH = 3;
export const MAX_CODE_LENGTH = 20;
export const MAX_METHOD_LENGTH = 20;
export const DEFAULT_TAX_LABEL = 'TAX';
/** The category an older receipt's single tax setting becomes. */
export const LEGACY_TAX_CODE = 'T';

/** A number as whole units of 10^-decimals, rounded half away from zero, read from its shortest written form. */
function scaled(value: number, decimals: number): number {
  const text = String(value);
  if (/e/i.test(text)) return Math.round(value * 10 ** decimals) || 0; // only very small numbers, which round to nothing
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace('-', '').split('.');
  let n = Number(whole) * 10 ** decimals + Number((fraction + '0'.repeat(decimals)).slice(0, decimals));
  if (fraction.length > decimals && Number(fraction[decimals]) >= 5) n += 1;
  return negative ? -n : n;
}

/**
 * A price in currency units as whole pence or cents, rounded half away from zero at two decimal places.
 * Works from the number's shortest written form ("1.005"), not its binary value, so 1.005 becomes 1.01.
 * Returns null for anything that is not a usable price.
 */
export function toMinorUnits(price: number): number | null {
  if (typeof price !== 'number' || !Number.isFinite(price) || Math.abs(price) > MAX_PRICE) return null;
  return scaled(price, 2);
}

/** A quantity as thousandths (so 0.452 kg is exact), or null if it is not usable. Must be above zero. */
function toThousandths(quantity: number): number | null {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) return null;
  const n = scaled(quantity, 3);
  return n > 0 ? n : null;
}

/** Integer division rounded half away from zero. `d` must be positive. */
function roundDiv(n: number, d: number): number {
  const sign = n < 0 ? -1 : 1;
  return sign * Math.floor((2 * Math.abs(n) + d) / (2 * d));
}

/**
 * The total for one line in whole pence: quantity x unit price when both are usable, otherwise the price.
 * Null when there is nothing usable, or the line is bigger than the largest allowed price (which keeps the
 * arithmetic below exactly representable).
 */
export function lineMinor(item: Pick<ItemLine, 'price' | 'quantity' | 'unitPrice'>): number | null {
  let minor: number | null = null;
  if (item.quantity !== undefined && item.unitPrice !== undefined) {
    const unit = toMinorUnits(item.unitPrice);
    const qty = toThousandths(item.quantity);
    if (unit !== null && qty !== null) minor = roundDiv(unit * qty, 1000);
  }
  if (minor === null && item.price !== undefined) minor = toMinorUnits(item.price);
  return minor !== null && Math.abs(minor) <= MAX_PRICE * 100 ? minor : null;
}

/** The tax categories and mode a receipt works with: its own, or the single older setting as category "T". */
export function resolveTaxes(content: Pick<ItemsContent, 'tax' | 'taxes' | 'taxMode'>): { categories: TaxCategory[]; mode: TaxMode } {
  if (content.taxes && content.taxes.length > 0) return { categories: content.taxes, mode: content.taxMode ?? 'added' };
  if (content.tax) {
    return { categories: [{ code: LEGACY_TAX_CODE, label: content.tax.label, rate: content.tax.rate }], mode: content.tax.mode };
  }
  return { categories: [], mode: content.taxMode ?? 'added' };
}

export interface PricedLine {
  name: string;
  minor: number;
  /** True when the line carries a tax category. */
  taxable: boolean;
  code?: string;
  /** Present only when the line is quantity x unit price. */
  quantity?: number;
  unitMinor?: number;
  /** The category code, when taxed. */
  taxCode?: string;
}

export interface TaxLine {
  code: string;
  label: string;
  rate: number;
  /** The sum of the lines in this category. */
  base: number;
  tax: number;
}

export interface Totals {
  lines: PricedLine[];
  subtotal: number;
  /** The part of the subtotal that is taxed. */
  taxableBase: number;
  /** All the tax, summed over categories. */
  tax: number;
  total: number;
  taxMode?: TaxMode;
  /** The first category's rate as written, for receipts with a single rate. */
  taxRate?: number;
  taxLabel: string;
  /** True when the receipt has any tax category, even if it works out to nothing. */
  hasTax: boolean;
  /** One entry per category that at least one line uses, in the order the categories are listed. */
  categories: TaxLine[];
  /** Only when a tender is given. */
  tendered?: number;
  tenderMethod?: string;
  /** What is handed back: the amount tendered above the total, never below zero. */
  change?: number;
}

/** Subtotal, tax (per category) and total for a list. Lines with nothing usable to price them are skipped. */
export function computeTotals(content: Pick<ItemsContent, 'items' | 'tax' | 'taxes' | 'taxMode' | 'tender'>): Totals {
  const { categories, mode } = resolveTaxes(content);
  const known = new Set(categories.map((c) => c.code));
  const lines: PricedLine[] = [];
  for (const item of content.items) {
    const minor = lineMinor(item);
    if (minor === null) continue;
    const code = item.tax !== undefined ? item.tax : item.taxable === true && !content.taxes?.length ? LEGACY_TAX_CODE : undefined;
    const taxCode = code !== undefined && known.has(code) ? code : undefined;
    const line: PricedLine = { name: item.name, minor, taxable: taxCode !== undefined };
    if (item.code) line.code = item.code;
    if (item.quantity !== undefined && item.unitPrice !== undefined && toThousandths(item.quantity) !== null && toMinorUnits(item.unitPrice) !== null) {
      line.quantity = item.quantity;
      line.unitMinor = toMinorUnits(item.unitPrice) as number;
    }
    if (taxCode !== undefined) line.taxCode = taxCode;
    lines.push(line);
  }
  const subtotal = lines.reduce((sum, l) => sum + l.minor, 0);

  const taxLines: TaxLine[] = [];
  for (const category of categories) {
    const used = lines.filter((l) => l.taxCode === category.code);
    if (used.length === 0) continue;
    const base = used.reduce((sum, l) => sum + l.minor, 0);
    const rateBp = Math.round(category.rate * 100); // basis points, so a rate such as 7.5% is exact
    const tax = mode === 'added' ? roundDiv(base * rateBp, 10_000) : roundDiv(base * rateBp, 10_000 + rateBp);
    taxLines.push({ code: category.code, label: category.label?.trim() || DEFAULT_TAX_LABEL, rate: category.rate, base, tax });
  }
  const tax = taxLines.reduce((sum, t) => sum + t.tax, 0);
  const total = mode === 'added' ? subtotal + tax : subtotal;

  const result: Totals = {
    lines,
    subtotal,
    taxableBase: taxLines.reduce((sum, t) => sum + t.base, 0),
    tax,
    total,
    taxLabel: categories[0]?.label?.trim() || DEFAULT_TAX_LABEL,
    hasTax: categories.length > 0,
    categories: taxLines,
  };
  if (categories.length > 0) {
    result.taxMode = mode;
    result.taxRate = categories[0].rate;
  }
  const tendered = content.tender ? toMinorUnits(content.tender.amount) : null;
  if (content.tender && tendered !== null && tendered >= 0) {
    result.tendered = tendered;
    if (content.tender.method?.trim()) result.tenderMethod = content.tender.method.trim();
    result.change = Math.max(0, tendered - total);
  }
  return result;
}

/** An amount for display: a sign if negative, the symbol, thousands separators and two decimals. */
export function formatMoney(minor: number, currency = ''): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${currency}${whole}.${String(abs % 100).padStart(2, '0')}`;
}

/** A rate for display without trailing zeros: 20, 7.5, 17.25. */
export const formatRate = (rate: number): string => String(Math.round(rate * 100) / 100);

export interface Normalised<T> {
  content: T;
  /** Plain-English reasons anything was dropped or ignored. */
  issues: string[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function normaliseCategories(raw: unknown, issues: string[]): TaxCategory[] {
  if (!Array.isArray(raw)) {
    issues.push('the tax categories were ignored: they must be a list');
    return [];
  }
  if (raw.length > MAX_CATEGORIES) issues.push(`only the first ${MAX_CATEGORIES} tax categories are used`);
  const kept: TaxCategory[] = [];
  raw.slice(0, MAX_CATEGORIES).forEach((entry, index) => {
    const where = `tax category ${index + 1}`;
    if (!isRecord(entry)) return void issues.push(`${where} was dropped: it is not a category`);
    const code = typeof entry.code === 'string' ? entry.code.trim() : '';
    if (code === '' || code.length > MAX_TAX_CODE_LENGTH) {
      return void issues.push(`${where} was dropped: its code must be 1 to ${MAX_TAX_CODE_LENGTH} characters, like "A"`);
    }
    if (kept.some((c) => c.code === code)) return void issues.push(`${where} ("${code}") was dropped: another category already uses that code`);
    const rateOk = typeof entry.rate === 'number' && Number.isFinite(entry.rate) && entry.rate >= 0 && entry.rate <= 100;
    if (!rateOk) return void issues.push(`${where} ("${code}") was dropped: the rate must be a number from 0 to 100`);
    const label = typeof entry.label === 'string' ? entry.label.slice(0, MAX_TAX_LABEL_LENGTH) : undefined;
    kept.push({ code, ...(label ? { label } : {}), rate: entry.rate as number });
  });
  return kept;
}

/**
 * Cleans an `items` slot read from a file. Bad items are dropped, and a bad currency, tax setting or tender is
 * ignored, each with a reason, so a receipt with one typo still opens with everything else.
 */
export function normaliseItems(raw: unknown): Normalised<ItemsContent> {
  const issues: string[] = [];
  const source = isRecord(raw) ? raw : {};
  let currency: string | undefined;
  let taxSetting: TaxSetting | undefined;
  let taxes: TaxCategory[] | undefined;
  let taxMode: TaxMode | undefined;
  let tender: Tender | undefined;
  const kept: ItemLine[] = [];

  if (source.currency !== undefined) {
    if (typeof source.currency === 'string' && source.currency.length <= MAX_CURRENCY_LENGTH) {
      if (source.currency !== '') currency = source.currency;
    } else issues.push(`the currency symbol was ignored: it must be text of at most ${MAX_CURRENCY_LENGTH} characters`);
  }

  if (source.taxes !== undefined) {
    const list = normaliseCategories(source.taxes, issues);
    if (list.length > 0) taxes = list;
  }
  if (source.taxMode !== undefined) {
    if (source.taxMode === 'added' || source.taxMode === 'included') taxMode = source.taxMode;
    else issues.push('the tax mode was ignored: it must be "added" or "included"');
  }
  if (source.tax !== undefined) {
    const t = source.tax as Record<string, unknown> | null;
    const modeOk = t?.mode === 'added' || t?.mode === 'included';
    const rateOk = typeof t?.rate === 'number' && Number.isFinite(t.rate) && t.rate >= 0 && t.rate <= 100;
    if (taxes) issues.push('the single tax setting was ignored because the receipt lists tax categories');
    else if (t && typeof t === 'object' && modeOk && rateOk) {
      const label = typeof t.label === 'string' ? t.label.slice(0, MAX_TAX_LABEL_LENGTH) : undefined;
      taxSetting = { mode: t.mode as TaxMode, rate: t.rate as number, ...(label ? { label } : {}) };
    } else issues.push('the tax setting was ignored: it needs a mode of "added" or "included" and a rate from 0 to 100');
  }
  const known = new Set((taxes ?? (taxSetting ? [{ code: LEGACY_TAX_CODE }] : [])).map((c) => c.code));

  if (source.tender !== undefined) {
    const t = source.tender;
    const amountOk = isRecord(t) && typeof t.amount === 'number' && toMinorUnits(t.amount) !== null && t.amount >= 0;
    if (isRecord(t) && amountOk) {
      const method = typeof t.method === 'string' ? t.method.trim().slice(0, MAX_METHOD_LENGTH) : '';
      tender = { ...(method ? { method } : {}), amount: t.amount as number };
    } else issues.push(`the tender was ignored: it needs an amount from 0 to ${MAX_PRICE}`);
  }

  if (source.items !== undefined && !Array.isArray(source.items)) issues.push('the items must be a list');
  const list = Array.isArray(source.items) ? source.items : [];
  if (list.length > MAX_ITEMS) issues.push(`only the first ${MAX_ITEMS} items are used`);
  list.slice(0, MAX_ITEMS).forEach((entry, index) => {
    const where = `item ${index + 1}`;
    const item = entry as Record<string, unknown> | null;
    if (typeof item !== 'object' || item === null) return void issues.push(`${where} was dropped: it is not an item`);
    if (typeof item.name !== 'string') return void issues.push(`${where} was dropped: it has no name`);
    const label = `${where} ("${item.name}")`;
    const clean: ItemLine = { name: item.name };

    if (item.code !== undefined) {
      if (typeof item.code === 'string' && item.code.length <= MAX_CODE_LENGTH) {
        if (item.code !== '') clean.code = item.code;
      } else issues.push(`${label}: the product code was ignored because it must be text of at most ${MAX_CODE_LENGTH} characters`);
    }
    // Quantity and unit price only mean something together.
    const hasQty = item.quantity !== undefined;
    const hasUnit = item.unitPrice !== undefined;
    if (hasQty && hasUnit) {
      const q = typeof item.quantity === 'number' ? toThousandths(item.quantity) : null;
      const u = typeof item.unitPrice === 'number' ? toMinorUnits(item.unitPrice) : null;
      if (q !== null && u !== null && Math.abs(roundDiv(u * q, 1000)) <= MAX_PRICE * 100) {
        clean.quantity = item.quantity as number;
        clean.unitPrice = item.unitPrice as number;
      } else issues.push(`${label}: the quantity and unit price were ignored because the quantity must be above 0 and at most ${MAX_QUANTITY}, and the unit price a number between -${MAX_PRICE} and ${MAX_PRICE}`);
    } else if (hasQty || hasUnit) {
      issues.push(`${label}: the quantity and unit price were ignored because an item needs both`);
    }
    const badPrice = item.price !== undefined && !(typeof item.price === 'number' && toMinorUnits(item.price) !== null);
    if (item.price !== undefined && !badPrice) clean.price = item.price as number;
    if (lineMinor(clean) === null) {
      return void issues.push(
        badPrice
          ? `${where} ("${item.name}") was dropped: the price must be a number between -${MAX_PRICE} and ${MAX_PRICE}`
          : `${where} ("${item.name}") was dropped: it needs a price, or a quantity and unit price`,
      );
    }
    if (badPrice) issues.push(`${label}: the price was ignored because it must be a number between -${MAX_PRICE} and ${MAX_PRICE}`);

    if (item.tax !== undefined) {
      if (typeof item.tax !== 'string') issues.push(`${label}: the tax category was ignored because it must be text`);
      else if (!known.has(item.tax)) issues.push(`${label}: the tax category "${item.tax}" does not exist, so the item is not taxed`);
      else clean.tax = item.tax;
    }
    if (item.taxable !== undefined) {
      if (typeof item.taxable !== 'boolean') issues.push(`${label}: "taxable" was ignored because it must be true or false`);
      else if (item.taxable && !taxes) clean.taxable = true;
    }
    kept.push(clean);
  });
  // Written in reading order, so saved files are tidy and changes show up as small diffs.
  const content: ItemsContent = {
    kind: 'items',
    ...(currency ? { currency } : {}),
    ...(taxes ? { taxes, ...(taxMode ? { taxMode } : {}) } : taxSetting ? { tax: taxSetting } : {}),
    ...(tender ? { tender } : {}),
    items: kept,
  };
  return { content, issues };
}

export interface ChoicesContent {
  kind: 'choices';
  /** Ids of the ticked options. The options themselves are defined by the template. */
  selected: string[];
}

/** Cleans a `choices` slot: anything that is not a list of text ids is dropped, with a reason. */
export function normaliseChoices(raw: unknown): Normalised<ChoicesContent> {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const issues: string[] = [];
  let selected: string[] = [];
  if (source.selected !== undefined) {
    if (Array.isArray(source.selected)) {
      selected = [...new Set(source.selected.filter((s): s is string => typeof s === 'string'))];
      if (selected.length !== new Set(source.selected).size || source.selected.some((s) => typeof s !== 'string')) {
        issues.push('some ticked choices were ignored: each must be text');
      }
    } else issues.push('the ticked choices were ignored: they must be a list');
  }
  return { content: { kind: 'choices', selected }, issues };
}

export type NumberParse = { ok: true; value: number } | { ok: false; reason: string };

/**
 * Reads a price typed by the author. Strict on purpose: it must be a plain number with at most two decimals, so
 * what is saved is exactly what was meant. A comma is accepted as the decimal mark ("4,50") when there is no point.
 */
export function parsePriceText(text: string): NumberParse {
  const raw = text.trim().replace(/\s+/g, '');
  if (raw === '') return { ok: false, reason: 'Enter a price, like 4.50.' };
  const t = !raw.includes('.') && (raw.match(/,/g) ?? []).length === 1 ? raw.replace(',', '.') : raw;
  if (!/^-?\d+(\.\d+)?$/.test(t)) return { ok: false, reason: 'Type just the number, like 4.50, or -2 for a discount. The currency symbol is set once for the whole list.' };
  if ((t.split('.')[1]?.length ?? 0) > 2) return { ok: false, reason: 'Use at most two decimal places.' };
  const value = Number(t);
  if (toMinorUnits(value) === null) return { ok: false, reason: `Use a price between -${MAX_PRICE.toLocaleString('en')} and ${MAX_PRICE.toLocaleString('en')}.` };
  return { ok: true, value };
}

/** Reads a tax rate typed by the author: 0 to 100, at most two decimals. */
export function parseRateText(text: string): NumberParse {
  const raw = text.trim().replace(/\s+/g, '').replace(/%$/, '');
  if (raw === '') return { ok: false, reason: 'Enter a rate from 0 to 100, like 20.' };
  const t = !raw.includes('.') && (raw.match(/,/g) ?? []).length === 1 ? raw.replace(',', '.') : raw;
  if (!/^\d+(\.\d+)?$/.test(t)) return { ok: false, reason: 'Type just the number, like 20 or 7.5.' };
  if ((t.split('.')[1]?.length ?? 0) > 2) return { ok: false, reason: 'Use at most two decimal places.' };
  const value = Number(t);
  if (value > 100) return { ok: false, reason: 'The rate cannot be more than 100.' };
  return { ok: true, value };
}
