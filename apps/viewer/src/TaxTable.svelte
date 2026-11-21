<script lang="ts">
  import { formatMoney, formatRate } from '@archive/casefile';
  import type { Block } from '@archive/casefile';
  import type { Content } from './lib/episode';
  import { receiptOf, wordOf } from './lib/receipt';

  let { block, content }: { block: Block; content: Record<string, Content> } = $props();

  // One row per tax category that at least one line uses, worked out from the items.
  const receipt = $derived(receiptOf(block, content));
  const rows = $derived(receipt?.totals.categories ?? []);
  const money = (minor: number) => formatMoney(minor, receipt?.currency ?? '');
</script>

{#if receipt && rows.length > 0}
  <table class="taxes">
    <thead>
      <tr><th>{wordOf(block, 'rateLabel', 'RATE')}</th><th>{wordOf(block, 'salesLabel', 'SALES')}</th><th>{wordOf(block, 'taxLabel', 'TAX')}</th></tr>
    </thead>
    <tbody>
      {#each rows as row}
        <tr><td>{row.code} {row.label} {formatRate(row.rate)}%</td><td>{money(row.base)}</td><td>{money(row.tax)}</td></tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  .taxes { width: 100%; border-collapse: collapse; margin: 1.4cqw 0; font-size: 0.92em; }
  th { font-weight: 400; border-bottom: 0.18cqw solid var(--ink); padding-bottom: 0.4cqw; }
  th, td { text-align: right; padding: 0.3cqw 0; }
  th:first-child, td:first-child { text-align: left; }
  td:not(:first-child), th:not(:first-child) { padding-left: 1.6cqw; white-space: nowrap; }
</style>
