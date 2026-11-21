<script lang="ts">
  import { untrack } from 'svelte';
  import { computeTotals, formatMoney, formatRate, lineMinor, parsePriceText, parseQuantityText, printedDiffers } from '@archive/casefile/money';
  import type { SlotView } from '../../src/shared/api';
  import type { Autosave, Now } from './lib/actions';
  import { buildContent, draftFrom, moveRow, newCategory, newDiscount, newRow, usesDetails, type Draft, type Row } from './lib/items';

  let { docId, slot, label, autosave, now }: { docId: string; slot: SlotView; label: string; autosave: Autosave; now: Now } = $props();

  // The working copy lives here; it is saved only when every box in it is valid.
  let draft = $state<Draft>(untrack(() => draftFrom(slot.items)));
  let details = $state(untrack(() => usesDetails(draftFrom(slot.items))));
  const legacy = $derived(slot.legacyText !== undefined && slot.items === undefined);
  let replaced = $state(false);
  const showEditor = $derived(!legacy || replaced);

  const built = $derived(buildContent(draft));
  const totals = $derived(built.content ? computeTotals(built.content) : undefined);
  const money = (minor: number) => formatMoney(minor, draft.currency.trim());
  // The categories a row can pick from: the ones that have a code.
  const pickable = $derived(draft.categories.filter((c) => c.code.trim() !== ''));

  /** For a row with a quantity and a unit price, the price worked out from them. */
  function worked(row: Row): string {
    const q = parseQuantityText(row.quantityText);
    const u = parsePriceText(row.unitPriceText);
    if (!q.ok || !u.ok) return '';
    const minor = lineMinor({ quantity: q.value, unitPrice: u.value });
    return minor === null ? '' : money(minor).replace(draft.currency.trim(), '');
  }
  const fromQuantity = (row: Row) => row.quantityText.trim() !== '' && row.unitPriceText.trim() !== '';

  function addDiscount(row: Row) {
    row.discounts.push(newDiscount());
    // an empty discount is only space to type in, so there is nothing to save yet
  }
  function removeDiscount(row: Row, key: number) {
    row.discounts = row.discounts.filter((d) => d.key !== key);
    changed();
  }

  /** The note under a figure that has printed text: what it differs from, or that it matches. */
  function noteFor(printed: string, minor: number | undefined): { differs: boolean; text: string } | undefined {
    const text = printed.trim();
    if (text === '' || minor === undefined) return undefined;
    return printedDiffers(text, minor)
      ? { differs: true, text: `Printed differs from the worked-out ${money(minor)}. That is fine if it is deliberate.` }
      : { differs: false, text: 'Same as the worked-out figure.' };
  }

  const changed = () =>
    autosave(`items:${slot.name}`, () => {
      const result = buildContent(draft);
      if (!result.content) return undefined; // held back: something is still being typed
      return window.author.setItems(docId, slot.name, result.content);
    });

  function addRow() {
    draft.rows.push(newRow());
    // a new empty row is only space to type in, so there is nothing to save yet
  }
  function removeRow(key: number) {
    draft.rows = draft.rows.filter((r) => r.key !== key);
    changed();
  }
  function move(key: number, by: -1 | 1) {
    draft.rows = moveRow(draft.rows, key, by);
    changed();
  }
  function addCategory() {
    draft.categories.push(newCategory());
  }
  function removeCategory(key: number) {
    const gone = draft.categories.find((c) => c.key === key)?.code.trim();
    draft.categories = draft.categories.filter((c) => c.key !== key);
    if (gone) delete draft.overrides.tax[gone];
    // Items that used it become untaxed, which is what the saved receipt would do anyway.
    if (gone) for (const r of draft.rows) if (r.taxCode === gone) r.taxCode = '';
    changed();
  }
  // Renaming a category's code keeps the items that used it pointing at it.
  function recode(key: number, before: string) {
    const after = draft.categories.find((c) => c.key === key)?.code.trim() ?? '';
    if (before && after && before !== after) {
      for (const r of draft.rows) if (r.taxCode === before) r.taxCode = after;
      if (before in draft.overrides.tax) {
        draft.overrides.tax[after] = draft.overrides.tax[before];
        delete draft.overrides.tax[before];
      }
    }
    changed();
  }
  let codeBefore = '';
  async function replaceLegacy() {
    if (!confirm('Replace the old table with an item list? The old table is removed from this receipt and cannot be brought back.')) return;
    const result = await now(() => window.author.setItems(docId, slot.name, { kind: 'items', items: [] }));
    if (result?.ok) {
      draft = draftFrom(undefined);
      replaced = true;
    }
  }
</script>

<section class="items" aria-label={label}>
  <h4>{label}</h4>

  {#if legacy && !replaced}
    <p class="help">This receipt's items are written as an older table, so they cannot be edited as a list.</p>
    <pre>{slot.legacyText}</pre>
    <button onclick={replaceLegacy}>Replace with an item list…</button>
  {/if}

  {#if showEditor}
    <div class="settings">
      <label class="narrow">
        <span>Currency symbol</span>
        <input aria-label="Currency symbol" bind:value={draft.currency} maxlength="5" placeholder="£" oninput={changed} aria-invalid={built.currencyError ? 'true' : undefined} />
      </label>
    </div>
    {#if built.currencyError}<p class="error" role="alert">{built.currencyError}</p>{/if}

    <h5>Tax categories</h5>
    <p class="help">Add a category for each rate on the receipt, like A at 20%. Then pick one for each item. Leave this empty for no tax.</p>
    {#each draft.categories as cat, i (cat.key)}
      <div class="cat">
        <input class="code" aria-label="Tax category {i + 1} code" placeholder="A" maxlength="3" bind:value={cat.code} onfocus={() => (codeBefore = cat.code.trim())} oninput={() => recode(cat.key, codeBefore)} aria-invalid={built.categoryErrors[cat.key] ? 'true' : undefined} />
        <input class="name" aria-label="Tax category {i + 1} name" placeholder="VAT" maxlength="20" bind:value={cat.label} oninput={changed} />
        <input class="rate" aria-label="Tax category {i + 1} rate" placeholder="20" inputmode="decimal" bind:value={cat.rateText} oninput={changed} aria-invalid={built.categoryErrors[cat.key] ? 'true' : undefined} />
        <span class="pct">%</span>
        <button class="small" aria-label="Remove tax category {i + 1}" onclick={() => removeCategory(cat.key)}>×</button>
      </div>
      {#if built.categoryErrors[cat.key]}<p class="error" role="alert">Tax category {i + 1}: {built.categoryErrors[cat.key]}</p>{/if}
    {/each}
    <button onclick={addCategory}>Add tax category</button>
    {#if draft.categories.length > 0}
      <label class="mode">
        <span>How the tax works</span>
        <select aria-label="Tax mode" bind:value={draft.taxMode} onchange={changed}>
          <option value="added">Added on top of the prices</option>
          <option value="included">Already included in the prices</option>
        </select>
      </label>
    {/if}

    <h5>Items</h5>
    <label class="check"><input type="checkbox" aria-label="Show codes and quantities" bind:checked={details} /><span>Show more for each item: codes, quantities, discounts and printed text</span></label>
    <table>
      <thead>
        <tr><th>Item</th><th class="price">Price</th>{#if pickable.length > 0}<th class="taxcol">Tax</th>{/if}<th></th></tr>
      </thead>
      <tbody>
        {#each draft.rows as row, i (row.key)}
          <tr>
            <td><input aria-label="Item {i + 1} name" bind:value={row.name} oninput={changed} /></td>
            <td class="price">
              {#if fromQuantity(row)}
                <input aria-label="Item {i + 1} price" value={worked(row)} readonly title="Worked out from the quantity and unit price" />
              {:else}
                <input aria-label="Item {i + 1} price" inputmode="decimal" bind:value={row.priceText} oninput={changed} aria-invalid={built.rowErrors[row.key] ? 'true' : undefined} />
              {/if}
            </td>
            {#if pickable.length > 0}
              <td class="taxcol">
                <select aria-label="Item {i + 1} tax" bind:value={row.taxCode} onchange={changed}>
                  <option value="">None</option>
                  {#each pickable as cat (cat.key)}<option value={cat.code.trim()}>{cat.code.trim()}</option>{/each}
                </select>
              </td>
            {/if}
            <td class="ops">
              <button class="small" aria-label="Move item {i + 1} up" disabled={i === 0} onclick={() => move(row.key, -1)}>↑</button>
              <button class="small" aria-label="Move item {i + 1} down" disabled={i === draft.rows.length - 1} onclick={() => move(row.key, 1)}>↓</button>
              <button class="small" aria-label="Remove item {i + 1}" onclick={() => removeRow(row.key)}>×</button>
            </td>
          </tr>
          {#if details}
            <tr class="extra">
              <td colspan="4">
                <div class="detail">
                  <label><span>Product code</span><input aria-label="Item {i + 1} product code" bind:value={row.code} maxlength="20" oninput={changed} /></label>
                  <label><span>Quantity</span><input aria-label="Item {i + 1} quantity" inputmode="decimal" bind:value={row.quantityText} oninput={changed} aria-invalid={built.rowErrors[row.key] ? 'true' : undefined} /></label>
                  <label><span>Unit price</span><input aria-label="Item {i + 1} unit price" inputmode="decimal" bind:value={row.unitPriceText} oninput={changed} aria-invalid={built.rowErrors[row.key] ? 'true' : undefined} /></label>
                </div>
                {#each row.discounts as d, di (d.key)}
                  <div class="detail discount">
                    <label><span>Discount {di + 1}</span><input aria-label="Item {i + 1} discount {di + 1} label" placeholder="MULTIBUY" maxlength="30" bind:value={d.label} oninput={changed} /></label>
                    <label class="amount"><span>Amount off</span><input aria-label="Item {i + 1} discount {di + 1} amount" inputmode="decimal" bind:value={d.amountText} oninput={changed} aria-invalid={built.rowErrors[row.key] ? 'true' : undefined} /></label>
                    <button class="small" aria-label="Remove discount {di + 1} from item {i + 1}" onclick={() => removeDiscount(row, d.key)}>×</button>
                  </div>
                {/each}
                <div class="detail">
                  <button class="small wide" aria-label="Add a discount to item {i + 1}" onclick={() => addDiscount(row)}>Add discount</button>
                  <label><span>Printed as (optional)</span><input aria-label="Item {i + 1} printed as" placeholder="Leave empty to print the real amount" maxlength="30" bind:value={row.printed} oninput={changed} /></label>
                </div>
              </td>
            </tr>
          {/if}
          {#if built.rowErrors[row.key]}
            <tr class="rowerror"><td colspan="4"><span role="alert">Item {i + 1}: {built.rowErrors[row.key]}</span></td></tr>
          {/if}
        {/each}
      </tbody>
    </table>
    <button onclick={addRow}>Add item</button>

    <h5>Payment</h5>
    <p class="help">Optional. What was handed over; any amount above the total is shown as change.</p>
    <div class="settings">
      <label>
        <span>Method</span>
        <input aria-label="Payment method" list="methods-{slot.name}" bind:value={draft.tenderMethod} maxlength="20" placeholder="CASH" oninput={changed} />
        <datalist id="methods-{slot.name}"><option value="CASH"></option><option value="CARD"></option><option value="DEBIT"></option></datalist>
      </label>
      <label class="narrow">
        <span>Amount</span>
        <input aria-label="Amount handed over" inputmode="decimal" bind:value={draft.tenderAmount} oninput={changed} aria-invalid={built.tenderError ? 'true' : undefined} />
      </label>
    </div>
    {#if built.tenderError}<p class="error" role="alert">{built.tenderError}</p>{/if}

    {#if built.held > 0}<p class="held">Not saved yet: finish what is marked above. Nothing is lost, and it saves as soon as it is valid.</p>{/if}

    {#if totals}
      <table class="totals" aria-label="Totals, worked out for you">
        <thead><tr><th></th><th class="num">Worked out</th><th>Printed as (optional)</th></tr></thead>
        <tbody>
          {#if totals.hasTax}
            <tr>
              <th scope="row">Subtotal</th><td class="num">{money(totals.subtotal)}</td>
              <td><input aria-label="Printed subtotal" maxlength="30" bind:value={draft.overrides.subtotal} oninput={changed} /></td>
            </tr>
            {#if noteFor(draft.overrides.subtotal, totals.subtotal)}{@const n = noteFor(draft.overrides.subtotal, totals.subtotal)!}<tr class="note" class:differs={n.differs}><td colspan="3">{n.text}</td></tr>{/if}
            {#each totals.categories as row (row.code)}
              <tr>
                <th scope="row">{row.code} · {row.label} {formatRate(row.rate)}%{totals.taxMode === 'included' ? ' (included)' : ''}</th>
                <td class="num">{money(row.tax)}</td>
                <td><input aria-label="Printed tax for {row.code}" maxlength="30" value={draft.overrides.tax[row.code] ?? ''} oninput={(e) => { draft.overrides.tax[row.code] = e.currentTarget.value; changed(); }} /></td>
              </tr>
              {#if noteFor(draft.overrides.tax[row.code] ?? '', row.tax)}{@const n = noteFor(draft.overrides.tax[row.code] ?? '', row.tax)!}<tr class="note" class:differs={n.differs}><td colspan="3">{n.text}</td></tr>{/if}
            {/each}
          {/if}
          <tr class="total">
            <th scope="row">Total</th><td class="num">{money(totals.total)}</td>
            <td><input aria-label="Printed total" maxlength="30" bind:value={draft.overrides.total} oninput={changed} /></td>
          </tr>
          {#if noteFor(draft.overrides.total, totals.total)}{@const n = noteFor(draft.overrides.total, totals.total)!}<tr class="note" class:differs={n.differs}><td colspan="3">{n.text}</td></tr>{/if}
          {#if totals.savings > 0 || draft.overrides.savings.trim() !== ''}
            <tr>
              <th scope="row">Total savings</th><td class="num">{money(totals.savings)}</td>
              <td><input aria-label="Printed savings" maxlength="30" bind:value={draft.overrides.savings} oninput={changed} /></td>
            </tr>
            {#if noteFor(draft.overrides.savings, totals.savings)}{@const n = noteFor(draft.overrides.savings, totals.savings)!}<tr class="note" class:differs={n.differs}><td colspan="3">{n.text}</td></tr>{/if}
          {/if}
          {#if totals.tendered !== undefined}
            <tr><th scope="row">{totals.tenderMethod ?? 'Handed over'}</th><td class="num">{money(totals.tendered)}</td><td></td></tr>
            <tr>
              <th scope="row">Change due</th><td class="num">{money(totals.change ?? 0)}</td>
              <td><input aria-label="Printed change" maxlength="30" bind:value={draft.overrides.change} oninput={changed} /></td>
            </tr>
            {#if noteFor(draft.overrides.change, totals.change ?? 0)}{@const n = noteFor(draft.overrides.change, totals.change ?? 0)!}<tr class="note" class:differs={n.differs}><td colspan="3">{n.text}</td></tr>{/if}
          {/if}
        </tbody>
      </table>
      {#if built.overrideError}<p class="error" role="alert">{built.overrideError}</p>{/if}
      <p class="help">Totals are worked out for you and shown on the receipt the same way. Anything you type under "Printed as" is printed instead, exactly as typed, but the worked-out figure is still used for change and everything else.</p>
    {/if}
  {/if}
</section>

<style>
  .items { margin: 0 0 1rem; }
  h4 { margin: 0 0 0.5rem; font-size: 0.85rem; font-weight: 600; }
  .settings { display: flex; gap: 0.6rem; }
  .settings label { flex: 1; }
  .settings .narrow { flex: 0 0 6.5rem; }
  h5 { margin: 1.1rem 0 0.3rem; font-size: 0.8rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); font-weight: normal; }
  .cat { display: flex; gap: 0.4rem; align-items: center; margin: 0 0 0.3rem; }
  .cat input { padding: 0.3rem 0.4rem; }
  .cat .code { flex: 0 0 3.2rem; text-align: center; }
  .cat .name { flex: 1; min-width: 0; }
  .cat .rate { flex: 0 0 3.6rem; text-align: right; }
  .pct { color: var(--muted); }
  .mode { display: block; margin-top: 0.6rem; }
  .check { display: flex; gap: 0.5rem; align-items: center; margin: 0 0 0.4rem; font-size: 0.85rem; }
  .check input { width: auto; }
  .taxcol { width: 4.2rem; }
  .taxcol select { padding: 0.3rem 0.2rem; }
  .detail { display: flex; gap: 0.4rem; padding: 0 0 0.4rem 0.2rem; }
  .detail label { flex: 1; min-width: 0; }
  .detail span { font-size: 0.7rem; color: var(--muted); }
  .detail input { padding: 0.25rem 0.4rem; }
  .extra td { padding-top: 0; }
  .price input[readonly] { opacity: 0.75; }
  select { font: inherit; color: inherit; background: #1a1510; border: 1px solid var(--line); border-radius: 4px; padding: 0.4rem 0.5rem; width: 100%; }
  table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; }
  th { text-align: left; font-size: 0.75rem; font-weight: normal; color: var(--muted); padding: 0 0.2rem 0.2rem; }
  td { padding: 0.15rem 0.2rem; vertical-align: middle; }
  .price { width: 5.5rem; }
  td input { padding: 0.3rem 0.4rem; }
  .price input { text-align: right; }
  .ops { white-space: nowrap; width: 5.4rem; }
  .small { padding: 0.15rem 0.45rem; }
  input[aria-invalid='true'] { border-color: var(--error); }
  .rowerror td { color: var(--error); font-size: 0.8rem; padding-bottom: 0.3rem; }
  .error { color: var(--error); font-size: 0.8rem; margin: 0 0 0.6rem; }
  .held { color: var(--warn); font-size: 0.8rem; margin: 0.5rem 0; }
  .help { color: var(--muted); font-size: 0.85rem; margin: 0.3rem 0 0.7rem; }
  pre { background: #1a1510; padding: 0.5rem; border-radius: 4px; white-space: pre-wrap; font-size: 0.8rem; max-height: 8rem; overflow: auto; }
  .totals { width: 100%; border-collapse: collapse; margin: 0.8rem 0 0; background: #2c241c; border-radius: 4px; }
  .totals th, .totals td { padding: 0.25rem 0.5rem; font-weight: normal; text-align: left; vertical-align: middle; }
  .totals thead th { font-size: 0.72rem; color: var(--muted); }
  .totals .num { text-align: right; white-space: nowrap; }
  .totals td input { padding: 0.25rem 0.4rem; }
  .totals .total th, .totals .total td { font-weight: 700; border-top: 1px solid var(--line); }
  .totals .note td { font-size: 0.78rem; color: var(--muted); padding-top: 0; }
  .totals .note.differs td { color: var(--warn); }
  .discount .amount { flex: 0 0 6rem; }
  .discount button { align-self: flex-end; }
  .wide { white-space: nowrap; align-self: flex-end; }
</style>
