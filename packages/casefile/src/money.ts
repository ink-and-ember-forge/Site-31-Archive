// Itemised lists (receipts): reading prices exactly, and working out subtotal, tax and total.
//
// Money is held as whole pence or cents, never as floating point, so 0.1 + 0.2 is exactly 0.30 and
// the total can never be a fraction of a penny out. Nothing computed here is ever stored in an episode:
// totals are worked out each time the receipt is shown, so they cannot disagree with the items.

export type TaxMode = 'added' | 'included';

export interface ItemLine {
  name: string;
  /** In currency units, for example 4.5 for four pounds fifty. */
  price: number;
  /** Marked lines are taxed; unmarked lines are not. */
  taxable?: boolean;
}

export interface TaxSetting {
  mode: TaxMode;
  /** A percentage, for example 20. */
  rate: number;
  /** The word printed on the tax line. */
  label?: string;
}

export interface ItemsContent {
  kind: 'items';
  /** One symbol for the whole list, shown before each amount. */
  currency?: string;
  tax?: TaxSetting;
  items: ItemLine[];
}

export const MAX_PRICE = 1_000_000;
export const MAX_ITEMS = 1000;
export const MAX_CURRENCY_LENGTH = 5;
export const MAX_TAX_LABEL_LENGTH = 20;
export const DEFAULT_TAX_LABEL = 'TAX';

/**
 * A price in currency units as whole pence or cents, rounded half away from zero at two decimal places.
 * Works from the number's shortest written form ("1.005"), not its binary value, so 1.005 becomes 1.01.
 * Returns null for anything that is not a usable price.
 */
export function toMinorUnits(price: number): number | null {
  if (typeof price !== 'number' || !Number.isFinite(price) || Math.abs(price) > MAX_PRICE) return null;
  const text = String(price);
  if (/e/i.test(text)) return Math.round(price * 100) || 0; // only very small numbers, which round to nothing
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace('-', '').split('.');
  let minor = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  if (fraction.length > 2 && Number(fraction[2]) >= 5) minor += 1;
  return negative ? -minor : minor;
}

/** Integer division rounded half away from zero. `d` must be positive. */
function roundDiv(n: number, d: number): number {
  const sign = n < 0 ? -1 : 1;
  return sign * Math.floor((2 * Math.abs(n) + d) / (2 * d));
}

export interface PricedLine {
  name: string;
  minor: number;
  taxable: boolean;
}

export interface Totals {
  lines: PricedLine[];
  subtotal: number;
  /** The part of the subtotal that is taxed. */
  taxableBase: number;
  tax: number;
  total: number;
  taxMode?: TaxMode;
  /** The rate as written, for example 20 or 7.5. */
  taxRate?: number;
  taxLabel: string;
  /** True when a tax setting exists, even if it works out to nothing. */
  hasTax: boolean;
}

/** Subtotal, tax and total for a list. Lines with an unusable price are skipped. */
export function computeTotals(content: Pick<ItemsContent, 'items' | 'tax'>): Totals {
  const lines: PricedLine[] = [];
  for (const item of content.items) {
    const minor = toMinorUnits(item.price);
    if (minor !== null) lines.push({ name: item.name, minor, taxable: item.taxable === true });
  }
  const subtotal = lines.reduce((sum, l) => sum + l.minor, 0);
  const taxableBase = lines.filter((l) => l.taxable).reduce((sum, l) => sum + l.minor, 0);

  const tax = content.tax;
  if (!tax) return { lines, subtotal, taxableBase, tax: 0, total: subtotal, taxLabel: DEFAULT_TAX_LABEL, hasTax: false };

  const rateBp = Math.round(tax.rate * 100); // basis points, so a rate such as 7.5% is exact
  const amount =
    tax.mode === 'added' ? roundDiv(taxableBase * rateBp, 10_000) : roundDiv(taxableBase * rateBp, 10_000 + rateBp);
  return {
    lines,
    subtotal,
    taxableBase,
    tax: amount,
    total: tax.mode === 'added' ? subtotal + amount : subtotal,
    taxMode: tax.mode,
    taxRate: tax.rate,
    taxLabel: tax.label?.trim() || DEFAULT_TAX_LABEL,
    hasTax: true,
  };
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

/**
 * Cleans an `items` slot read from a file. Bad items are dropped, and a bad currency or tax setting is
 * ignored, each with a reason, so a receipt with one typo still opens with everything else.
 */
export function normaliseItems(raw: unknown): Normalised<ItemsContent> {
  const issues: string[] = [];
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const content: ItemsContent = { kind: 'items', items: [] };

  if (source.currency !== undefined) {
    if (typeof source.currency === 'string' && source.currency.length <= MAX_CURRENCY_LENGTH) {
      if (source.currency !== '') content.currency = source.currency;
    } else issues.push(`the currency symbol was ignored: it must be text of at most ${MAX_CURRENCY_LENGTH} characters`);
  }

  if (source.tax !== undefined) {
    const t = source.tax as Record<string, unknown> | null;
    const modeOk = t?.mode === 'added' || t?.mode === 'included';
    const rateOk = typeof t?.rate === 'number' && Number.isFinite(t.rate) && t.rate >= 0 && t.rate <= 100;
    if (t && typeof t === 'object' && modeOk && rateOk) {
      const label = typeof t.label === 'string' ? t.label.slice(0, MAX_TAX_LABEL_LENGTH) : undefined;
      content.tax = { mode: t.mode as TaxMode, rate: t.rate as number, ...(label ? { label } : {}) };
    } else issues.push('the tax setting was ignored: it needs a mode of "added" or "included" and a rate from 0 to 100');
  }

  if (source.items !== undefined && !Array.isArray(source.items)) issues.push('the items must be a list');
  const list = Array.isArray(source.items) ? source.items : [];
  if (list.length > MAX_ITEMS) issues.push(`only the first ${MAX_ITEMS} items are used`);
  list.slice(0, MAX_ITEMS).forEach((entry, index) => {
    const where = `item ${index + 1}`;
    const item = entry as Record<string, unknown> | null;
    if (typeof item !== 'object' || item === null) return void issues.push(`${where} was dropped: it is not an item`);
    if (typeof item.name !== 'string') return void issues.push(`${where} was dropped: it has no name`);
    if (typeof item.price !== 'number' || toMinorUnits(item.price) === null) {
      return void issues.push(`${where} ("${item.name}") was dropped: the price must be a number between -${MAX_PRICE} and ${MAX_PRICE}`);
    }
    const clean: ItemLine = { name: item.name, price: item.price };
    if (item.taxable !== undefined) {
      if (typeof item.taxable === 'boolean') {
        if (item.taxable) clean.taxable = true;
      } else issues.push(`${where} ("${item.name}"): "taxable" was ignored because it must be true or false`);
    }
    content.items.push(clean);
  });
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
