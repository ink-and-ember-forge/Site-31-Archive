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
  const anyTaxable = $derived(!!totals?.hasTax && totals.lines.some((l) => l.taxable));
</script>

{#if value?.kind === 'markdown'}
  <!-- An older receipt written as a Markdown table still shows as it always did. -->
  <Rich blocks={value.blocks} />
{:else if list && totals}
  <div class="items">
    {#each totals.lines as line}
      <div class="line">
        <span class="name">{line.name}</span>
        <span class="price">{money(line.minor)}</span>
        <i class="mark">{totals.hasTax && line.taxable ? mark : ''}</i>
      </div>
    {/each}
  </div>

  <div class="sums">
    {#if totals.hasTax}
      <div class="sum"><span>{word('subtotalLabel', 'SUBTOTAL')}</span><span>{money(totals.subtotal)}</span></div>
      {#if totals.taxMode === 'added'}
        <div class="sum"><span>{totals.taxLabel} {formatRate(totals.taxRate ?? 0)}% on {money(totals.taxableBase)}</span><span>{money(totals.tax)}</span></div>
      {:else}
        <div class="sum"><span>{word('includesLabel', 'INCLUDES')} {totals.taxLabel} {formatRate(totals.taxRate ?? 0)}%</span><span>{money(totals.tax)}</span></div>
      {/if}
    {/if}
    <div class="sum total"><span>{word('totalLabel', 'TOTAL')}</span><span>{money(totals.total)}</span></div>
  </div>
  {#if anyTaxable}<p class="legend">{mark} = {word('taxableLegend', 'taxable item')}</p>{/if}
{/if}

<style>
  .items { margin: 1.4cqw 0; }
  .line { display: grid; grid-template-columns: 1fr auto 2.4cqw; gap: 0.8cqw; padding: 0.35cqw 0; }
  .name { overflow-wrap: anywhere; }
  .price { text-align: right; white-space: nowrap; }
  .mark { font-style: normal; color: color-mix(in srgb, var(--ink) 65%, transparent); }
  .sums { margin-top: 1cqw; }
  .sum { display: flex; justify-content: space-between; gap: 1cqw; padding: 0.2cqw 0; }
  .sum span:last-child { white-space: nowrap; }
  .total { font-weight: 700; font-size: 1.18em; border-top: 0.18cqw solid var(--ink); margin-top: 1cqw; padding-top: 1cqw; }
  .legend { margin: 1.4cqw 0 0; font-size: 0.82em; color: color-mix(in srgb, var(--ink) 65%, transparent); }
</style>
