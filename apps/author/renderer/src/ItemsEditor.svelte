<script lang="ts">
  import { untrack } from 'svelte';
  import { computeTotals, formatMoney, formatRate } from '@archive/casefile/money';
  import type { SlotView } from '../../src/shared/api';
  import type { Autosave, Now } from './lib/actions';
  import { buildContent, draftFrom, moveRow, newRow, type Draft } from './lib/items';

  let { docId, slot, label, autosave, now }: { docId: string; slot: SlotView; label: string; autosave: Autosave; now: Now } = $props();

  // The working copy lives here; it is saved only when every box in it is valid.
  let draft = $state<Draft>(untrack(() => draftFrom(slot.items)));
  const legacy = $derived(slot.legacyText !== undefined && slot.items === undefined);
  let replaced = $state(false);
  const showEditor = $derived(!legacy || replaced);

  const built = $derived(buildContent(draft));
  const totals = $derived(built.content ? computeTotals(built.content) : undefined);
  const money = (minor: number) => formatMoney(minor, draft.currency.trim());

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
      <label>
        <span>Tax</span>
        <select aria-label="Tax" bind:value={draft.taxMode} onchange={changed}>
          <option value="none">No tax</option>
          <option value="added">Added on top of the marked items</option>
          <option value="included">Already included in the prices</option>
        </select>
      </label>
    </div>
    {#if draft.taxMode !== 'none'}
      <div class="settings">
        <label class="narrow">
          <span>Rate (%)</span>
          <input aria-label="Tax rate" bind:value={draft.rateText} inputmode="decimal" oninput={changed} aria-invalid={built.rateError ? 'true' : undefined} />
        </label>
        <label>
          <span>Word on the receipt</span>
          <input aria-label="Tax name" bind:value={draft.labelText} maxlength="20" placeholder="TAX" oninput={changed} />
        </label>
      </div>
      {#if built.rateError}<p class="error" role="alert">{built.rateError}</p>{/if}
    {/if}
    {#if built.currencyError}<p class="error" role="alert">{built.currencyError}</p>{/if}

    <table>
      <thead>
        <tr><th>Item</th><th class="price">Price</th>{#if draft.taxMode !== 'none'}<th class="tick">Taxed</th>{/if}<th></th></tr>
      </thead>
      <tbody>
        {#each draft.rows as row, i (row.key)}
          <tr>
            <td><input aria-label="Item {i + 1} name" bind:value={row.name} oninput={changed} /></td>
            <td class="price"><input aria-label="Item {i + 1} price" inputmode="decimal" bind:value={row.priceText} oninput={changed} aria-invalid={built.rowErrors[row.key] ? 'true' : undefined} /></td>
            {#if draft.taxMode !== 'none'}
              <td class="tick"><input type="checkbox" aria-label="Item {i + 1} is taxed" bind:checked={row.taxable} onchange={changed} /></td>
            {/if}
            <td class="ops">
              <button class="small" aria-label="Move item {i + 1} up" disabled={i === 0} onclick={() => move(row.key, -1)}>↑</button>
              <button class="small" aria-label="Move item {i + 1} down" disabled={i === draft.rows.length - 1} onclick={() => move(row.key, 1)}>↓</button>
              <button class="small" aria-label="Remove item {i + 1}" onclick={() => removeRow(row.key)}>×</button>
            </td>
          </tr>
          {#if built.rowErrors[row.key]}
            <tr class="rowerror"><td colspan="4"><span role="alert">Item {i + 1}: {built.rowErrors[row.key]}</span></td></tr>
          {/if}
        {/each}
      </tbody>
    </table>
    <button onclick={addRow}>Add item</button>
    {#if built.held > 0}<p class="held">Not saved yet: finish the item{built.held === 1 ? '' : 's'} marked above. Nothing is lost, and it saves as soon as {built.held === 1 ? 'it is' : 'they are'} valid.</p>{/if}

    {#if totals}
      <dl class="totals" aria-label="Totals, worked out for you">
        {#if totals.hasTax}
          <dt>Subtotal</dt><dd>{money(totals.subtotal)}</dd>
          <dt>{totals.taxLabel} {formatRate(totals.taxRate ?? 0)}%{totals.taxMode === 'included' ? ' (included)' : ''}</dt><dd>{money(totals.tax)}</dd>
        {/if}
        <dt class="total">Total</dt><dd class="total">{money(totals.total)}</dd>
      </dl>
      <p class="help">Totals are worked out for you and shown on the receipt the same way.</p>
    {/if}
  {/if}
</section>

<style>
  .items { margin: 0 0 1rem; }
  h4 { margin: 0 0 0.5rem; font-size: 0.85rem; font-weight: 600; }
  .settings { display: flex; gap: 0.6rem; }
  .settings label { flex: 1; }
  .settings .narrow { flex: 0 0 6.5rem; }
  select { font: inherit; color: inherit; background: #1a1510; border: 1px solid var(--line); border-radius: 4px; padding: 0.4rem 0.5rem; width: 100%; }
  table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; }
  th { text-align: left; font-size: 0.75rem; font-weight: normal; color: var(--muted); padding: 0 0.2rem 0.2rem; }
  td { padding: 0.15rem 0.2rem; vertical-align: middle; }
  .price { width: 5.5rem; }
  .tick { width: 3rem; text-align: center; }
  td input[type='checkbox'] { width: auto; }
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
  .totals { display: grid; grid-template-columns: 1fr auto; gap: 0.15rem 1rem; margin: 0.8rem 0 0; padding: 0.5rem 0.7rem; background: #2c241c; border-radius: 4px; }
  .totals dt, .totals dd { margin: 0; }
  .totals dd { text-align: right; }
  .total { font-weight: 700; border-top: 1px solid var(--line); padding-top: 0.2rem; margin-top: 0.2rem; }
</style>
