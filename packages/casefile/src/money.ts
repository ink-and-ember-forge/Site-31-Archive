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
  /** Money off this line, printed beneath it. The tax category applies to the line after discounts. */
  discounts?: Discount[];
  /** The code of one of the receipt's tax categories. No code means the line is not taxed. */
  tax?: string;
  /** Text printed in place of this line's amount (a misprint, a smudge). The real amount is still used in the sums. */
  printed?: string;
  /** Older receipts only: marked lines are taxed by the single `tax` setting. */
  taxable?: boolean;
}

export interface Discount {
  /** Printed beside the amount, for example MULTIBUY. */
  label?: string;
  /** Positive: how much is taken off. Printed as a negative line. */
  amount: number;
}

/** Text printed in place of a worked-out figure. Each is shown exactly as written. */
export interface Overrides {
  subtotal?: string;
  total?: string;
  change?: string;
  savings?: string;
  /** By tax category code: the tax printed for that category. */
  tax?: Record<string, string>;
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
  overrides?: Overrides;
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
export const MAX_DISCOUNTS = 5;
export const MAX_LABEL_LENGTH = 30;
export const MAX_PRINTED_LENGTH = 30;
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
 * The amount for one line before discounts, in whole pence: quantity x unit price when both are usable, otherwise
 * the price. Null when there is nothing usable, or the line is bigger than the largest allowed price (which keeps
 * the arithmetic below exactly representable).
 */
export function grossMinor(item: Pick<ItemLine, 'price' | 'quantity' | 'unitPrice'>): number | null {
  let minor: number | null = null;
  if (item.quantity !== undefined && item.unitPrice !== undefined) {
    const unit = toMinorUnits(item.unitPrice);
    const qty = toThousandths(item.quantity);
    if (unit !== null && qty !== null) minor = roundDiv(unit * qty, 1000);
  }
  if (minor === null && item.price !== undefined) minor = toMinorUnits(item.price);
  return minor !== null && Math.abs(minor) <= MAX_PRICE * 100 ? minor : null;
}

export interface AcceptedDiscount {
  label?: string;
  minor: number;
}

/**
 * The discounts on a line that count, in whole pence. A discount counts only if its amount is a usable price above
 * zero and it fits: together they may not take more than the line, and a line that is not above zero takes none.
 */
export function acceptedDiscounts(item: Pick<ItemLine, 'price' | 'quantity' | 'unitPrice' | 'discounts'>): AcceptedDiscount[] {
  const gross = grossMinor(item);
  const out: AcceptedDiscount[] = [];
  if (gross === null || gross <= 0) return out;
  let taken = 0;
  for (const d of (item.discounts ?? []).slice(0, MAX_DISCOUNTS)) {
    const minor = d && typeof d === 'object' ? toMinorUnits(d.amount) : null;
    if (minor === null || minor <= 0 || taken + minor > gross) continue;
    taken += minor;
    out.push({ ...(typeof d.label === 'string' && d.label.trim() ? { label: d.label.trim() } : {}), minor });
  }
  return out;
}

/** The amount for one line after its discounts, in whole pence. Null when the line has no usable amount. */
export function lineMinor(item: Pick<ItemLine, 'price' | 'quantity' | 'unitPrice' | 'discounts'>): number | null {
  const gross = grossMinor(item);
  if (gross === null) return null;
  return gross - acceptedDiscounts(item).reduce((sum, d) => sum + d.minor, 0);
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
  /** The amount before discounts (the same as `minor` when there are none). */
  grossMinor: number;
  /** The discounts that count, each printed as a negative line under the line. */
  discounts: AcceptedDiscount[];
  /** Text to print in place of the amount, if the line has an override. */
  printed?: string;
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
  /** The sum of all discounts that count. */
  savings: number;
  /** Text printed in place of a figure, when the receipt overrides it. The figures above are always the real ones. */
  printed: { subtotal?: string; total?: string; change?: string; savings?: string; tax: Record<string, string> };
}

const printedText = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, MAX_PRINTED_LENGTH) : undefined;

function printedFigures(overrides: Overrides | undefined): Totals['printed'] {
  const tax: Record<string, string> = {};
  if (overrides?.tax && typeof overrides.tax === 'object') {
    for (const [code, text] of Object.entries(overrides.tax)) {
      const t = printedText(text);
      if (t) tax[code] = t;
    }
  }
  const out: Totals['printed'] = { tax };
  for (const key of ['subtotal', 'total', 'change', 'savings'] as const) {
    const t = printedText(overrides?.[key]);
    if (t) out[key] = t;
  }
  return out;
}

/**
 * Whether text printed in place of a figure is different from the figure. Compares only the digits and sign, so
 * "£18.50", "18.5" and "18.50" all match 1850, and "VOID" or "18.5O" do not.
 */
export function printedDiffers(printed: string, minor: number): boolean {
  const cleaned = printed.replace(/[^0-9.,-]/g, '').replace(/,(?=\d{3}\b)/g, '');
  const value = Number(cleaned.replace(',', '.'));
  if (cleaned === '' || !Number.isFinite(value)) return true;
  return toMinorUnits(value) !== minor || /[A-Za-z]/.test(printed.replace(/[£$€¥]/g, '').replace(/[^A-Za-z]/g, ''));
}

/** Subtotal, tax (per category) and total for a list. Lines with nothing usable to price them are skipped. */
export function computeTotals(content: Pick<ItemsContent, 'items' | 'tax' | 'taxes' | 'taxMode' | 'tender' | 'overrides'>): Totals {
  const { categories, mode } = resolveTaxes(content);
  const known = new Set(categories.map((c) => c.code));
  const lines: PricedLine[] = [];
  for (const item of content.items) {
    const minor = lineMinor(item);
    if (minor === null) continue;
    const code = item.tax !== undefined ? item.tax : item.taxable === true && !content.taxes?.length ? LEGACY_TAX_CODE : undefined;
    const taxCode = code !== undefined && known.has(code) ? code : undefined;
    const gross = grossMinor(item) as number;
    const line: PricedLine = { name: item.name, minor, taxable: taxCode !== undefined, grossMinor: gross, discounts: acceptedDiscounts(item) };
    if (typeof item.printed === 'string' && item.printed.trim()) line.printed = item.printed.trim().slice(0, MAX_PRINTED_LENGTH);
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
    savings: lines.reduce((sum, l) => sum + l.discounts.reduce((a, d) => a + d.minor, 0), 0),
    printed: printedFigures(content.overrides),
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
  let overrides: Overrides | undefined;
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

  if (source.overrides !== undefined) {
    const o = source.overrides;
    if (!isRecord(o)) issues.push('the printed overrides were ignored: they must be an object');
    else {
      const clean: Overrides = {};
      for (const key of ['subtotal', 'total', 'change', 'savings'] as const) {
        if (o[key] === undefined) continue;
        if (typeof o[key] === 'string' && (o[key] as string).trim() !== '' && (o[key] as string).length <= MAX_PRINTED_LENGTH) clean[key] = (o[key] as string).trim();
        else issues.push(`the printed ${key} was ignored: it must be text of 1 to ${MAX_PRINTED_LENGTH} characters`);
      }
      if (o.tax !== undefined) {
        if (!isRecord(o.tax)) issues.push('the printed tax was ignored: it must list a category code and its text');
        else {
          const tax: Record<string, string> = {};
          for (const [code, text] of Object.entries(o.tax)) {
            if (!known.has(code)) issues.push(`the printed tax for "${code}" was ignored: there is no such tax category`);
            else if (typeof text === 'string' && text.trim() !== '' && text.length <= MAX_PRINTED_LENGTH) tax[code] = text.trim();
            else issues.push(`the printed tax for "${code}" was ignored: it must be text of 1 to ${MAX_PRINTED_LENGTH} characters`);
          }
          if (Object.keys(tax).length > 0) clean.tax = tax;
        }
      }
      if (Object.keys(clean).length > 0) overrides = clean;
    }
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

    if (item.discounts !== undefined) {
      if (!Array.isArray(item.discounts)) issues.push(`${label}: the discounts were ignored because they must be a list`);
      else {
        if (item.discounts.length > MAX_DISCOUNTS) issues.push(`${label}: only the first ${MAX_DISCOUNTS} discounts are used`);
        const gross = grossMinor(clean) as number;
        let taken = 0;
        const accepted: Discount[] = [];
        item.discounts.slice(0, MAX_DISCOUNTS).forEach((entry, di) => {
          const d = entry as Record<string, unknown> | null;
          const dl = `${label}: discount ${di + 1}`;
          const minor = isRecord(d) && typeof d.amount === 'number' ? toMinorUnits(d.amount) : null;
          if (!isRecord(d) || minor === null || minor <= 0) return void issues.push(`${dl} was ignored: the amount must be a price above 0`);
          if (gross <= 0 || taken + minor > gross) return void issues.push(`${dl} was ignored: together the discounts cannot take more than the line`);
          const dlabel = d.label === undefined ? undefined : typeof d.label === 'string' ? d.label.trim() : null;
          if (dlabel === null || (dlabel !== undefined && dlabel.length > MAX_LABEL_LENGTH)) {
            issues.push(`${dl}: the label was ignored because it must be text of at most ${MAX_LABEL_LENGTH} characters`);
            taken += minor;
            return void accepted.push({ amount: d.amount as number });
          }
          taken += minor;
          accepted.push({ ...(dlabel ? { label: dlabel } : {}), amount: d.amount as number });
        });
        if (accepted.length > 0) clean.discounts = accepted;
      }
    }
    if (item.tax !== undefined) {
      if (typeof item.tax !== 'string') issues.push(`${label}: the tax category was ignored because it must be text`);
      else if (!known.has(item.tax)) issues.push(`${label}: the tax category "${item.tax}" does not exist, so the item is not taxed`);
      else clean.tax = item.tax;
    }
    if (item.taxable !== undefined) {
      if (typeof item.taxable !== 'boolean') issues.push(`${label}: "taxable" was ignored because it must be true or false`);
      else if (item.taxable && !taxes) clean.taxable = true;
    }
    if (item.printed !== undefined) {
      if (typeof item.printed === 'string' && item.printed.trim() !== '' && item.printed.length <= MAX_PRINTED_LENGTH) clean.printed = item.printed.trim();
      else issues.push(`${label}: the printed text was ignored because it must be text of 1 to ${MAX_PRINTED_LENGTH} characters`);
    }
    kept.push(clean);
  });
  // Written in reading order, so saved files are tidy and changes show up as small diffs.
  const content: ItemsContent = {
    kind: 'items',
    ...(currency ? { currency } : {}),
    ...(taxes ? { taxes, ...(taxMode ? { taxMode } : {}) } : taxSetting ? { tax: taxSetting } : {}),
    ...(tender ? { tender } : {}),
    ...(overrides ? { overrides } : {}),
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

/** Reads a quantity typed by the author: above 0, at most 3 decimals (so a weight such as 0.452 is exact). */
export function parseQuantityText(text: string): NumberParse {
  const raw = text.trim().replace(/\s+/g, '');
  if (raw === '') return { ok: false, reason: 'Enter a quantity, like 2 or 0.452.' };
  const t = !raw.includes('.') && (raw.match(/,/g) ?? []).length === 1 ? raw.replace(',', '.') : raw;
  if (!/^\d+(\.\d+)?$/.test(t)) return { ok: false, reason: 'Type just the number, like 2 or 0.452.' };
  if ((t.split('.')[1]?.length ?? 0) > 3) return { ok: false, reason: 'Use at most three decimal places.' };
  const value = Number(t);
  if (value <= 0) return { ok: false, reason: 'The quantity must be above 0.' };
  if (value > MAX_QUANTITY) return { ok: false, reason: `The quantity cannot be more than ${MAX_QUANTITY.toLocaleString('en')}.` };
  return { ok: true, value };
}
