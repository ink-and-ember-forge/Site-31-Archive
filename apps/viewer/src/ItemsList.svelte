<script lang="ts">
  import { computeTotals, formatMoney, formatRate } from '@archive/casefile';
  import type { Block } from '@archive/casefile';
  import type { Content } from './lib/episode';
  import Rich from './Rich.svelte';

  let { block, content }: { block: Block; content: Record<string, Content> } = $props();

  const value = $derived(block.slot ? content[block.slot] : undefined);
  const opts = $derived(block.props ?? {});
  const word = (key: string, fallback: string) => (typeof opts[key] === 'string' ? (opts[key] as string) : fallback);

  // Totals are always worked out here from the items, never read from the file.
  const list = $derived(value?.kind === 'items' ? value : undefined);
  const totals = $derived(list ? computeTotals(list) : undefined);
  const money = (minor: number) => formatMoney(minor, list?.currency ?? '');
  const mark = $derived(word('taxableMark', 'T'));
  // An older receipt marks taxed lines with one mark and explains it; a receipt with categories prints each line's code.
  const legacy = $derived(totals?.categories.length === 1 && totals.categories[0].code === 'T' && !(list?.taxes?.length));
  const anyTaxable = $derived(legacy && !!totals?.lines.some((l) => l.taxable));
  // Tax added on top is part of the sum, so it is always listed before the total. Tax already included in the prices is only
  // information, so a template that prints a tax table can switch these lines off with `includedTaxLines: false`.
  const taxLines = $derived(totals?.taxMode === 'added' || opts.includedTaxLines !== false);
  const markOf = (line: { taxCode?: string }) => (!line.taxCode ? '' : legacy ? mark : line.taxCode);
  // Zero-rate categories add nothing, so they do not clutter the sums (the tax table still lists them).
  const sumRows = $derived((totals?.categories ?? []).filter((c) => c.tax !== 0 || c.rate !== 0));
</script>

{#if value?.kind === 'markdown'}
  <!-- An older receipt written as a Markdown table still shows as it always did. -->
  <Rich blocks={value.blocks} />
{:else if list && totals}
  <div class="items">
    {#each totals.lines as line}
      <div class="line">
        <span class="name">{#if line.code}<small class="code">{line.code}</small>{/if}{line.name}</span>
        <span class="price">{money(line.minor)}</span>
        <i class="mark">{markOf(line)}</i>
        {#if line.quantity !== undefined && line.unitMinor !== undefined}
          <span class="qty">{line.quantity} @ {money(line.unitMinor)}</span>
        {/if}
      </div>
    {/each}
  </div>

  <div class="sums">
    {#if totals.hasTax && taxLines}
      <div class="sum"><span>{word('subtotalLabel', 'SUBTOTAL')}</span><span>{money(totals.subtotal)}</span></div>
      {#each sumRows as row}
        {#if totals.taxMode === 'added'}
          <div class="sum"><span>{row.label} {formatRate(row.rate)}% on {money(row.base)}</span><span>{money(row.tax)}</span></div>
        {:else}
          <div class="sum"><span>{word('includesLabel', 'INCLUDES')} {row.label} {formatRate(row.rate)}%</span><span>{money(row.tax)}</span></div>
        {/if}
      {/each}
    {/if}
    <div class="sum total"><span>{word('totalLabel', 'TOTAL')}</span><span>{money(totals.total)}</span></div>
  </div>
  {#if anyTaxable}<p class="legend">{mark} = {word('taxableLegend', 'taxable item')}</p>{/if}
{/if}

<style>
  .items { margin: 1.4cqw 0; }
  .line { display: grid; grid-template-columns: 1fr auto 2.4cqw; gap: 0 0.8cqw; padding: 0.35cqw 0; }
  .code { margin-right: 1.2cqw; color: color-mix(in srgb, var(--ink) 60%, transparent); font-size: 0.85em; }
  .qty { grid-column: 1 / 3; padding-left: 2.4cqw; font-size: 0.88em; color: color-mix(in srgb, var(--ink) 70%, transparent); }
  .name { overflow-wrap: anywhere; }
  .price { text-align: right; white-space: nowrap; }
  .mark { font-style: normal; color: color-mix(in srgb, var(--ink) 65%, transparent); }
  .sums { margin-top: 1cqw; }
  .sum { display: flex; justify-content: space-between; gap: 1cqw; padding: 0.2cqw 0; }
  .sum span:last-child { white-space: nowrap; }
  .total { font-weight: 700; font-size: 1.18em; border-top: 0.18cqw solid var(--ink); margin-top: 1cqw; padding-top: 1cqw; }
  .legend { margin: 1.4cqw 0 0; font-size: 0.82em; color: color-mix(in srgb, var(--ink) 65%, transparent); }
</style>
