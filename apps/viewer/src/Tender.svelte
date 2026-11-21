<script lang="ts">
  import { formatMoney } from '@archive/casefile';
  import type { Block } from '@archive/casefile';
  import type { Content } from './lib/episode';
  import { receiptOf, wordOf } from './lib/receipt';

  let { block, content }: { block: Block; content: Record<string, Content> } = $props();

  // What was paid and what is handed back, worked out against the receipt's total.
  const receipt = $derived(receiptOf(block, content));
  const totals = $derived(receipt?.totals);
  const money = (minor: number) => formatMoney(minor, receipt?.currency ?? '');
</script>

{#if totals && totals.tendered !== undefined}
  <div class="tender">
    <div class="row"><span>{totals.tenderMethod ?? wordOf(block, 'tenderLabel', 'TENDER')}</span><span>{money(totals.tendered)}</span></div>
    {#if (totals.change ?? 0) > 0}
      <div class="row"><span>{wordOf(block, 'changeLabel', 'CHANGE DUE')}</span><span>{money(totals.change ?? 0)}</span></div>
    {/if}
  </div>
{/if}

<style>
  .tender { margin: 1cqw 0; }
  .row { display: flex; justify-content: space-between; gap: 1cqw; padding: 0.2cqw 0; }
  .row span:last-child { white-space: nowrap; }
</style>
