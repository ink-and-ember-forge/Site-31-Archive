<script lang="ts">
  import type { Block } from '@archive/casefile';
  import type { Content } from './lib/episode';
  import { barcodeBars } from './lib/barcode';

  let { block, content }: { block: Block; content: Record<string, Content> } = $props();

  const seedSlot = $derived(typeof block.props?.seed === 'string' ? content[block.props.seed] : undefined);
  const numberSlot = $derived(typeof block.props?.number === 'string' ? content[block.props.number] : undefined);
  const number = $derived(numberSlot?.kind === 'value' ? numberSlot.value.trim() : '');
  // The bars follow the printed number when there is one, so changing the number changes the pattern.
  const bars = $derived(barcodeBars(number || (seedSlot?.kind === 'value' ? seedSlot.value : '')));
</script>

<!-- Decorative only: a pattern made from the reference, not a real code. -->
<svg class="barcode" viewBox="0 0 96 12" preserveAspectRatio="none" aria-hidden="true">
  {#each bars as bar}<rect x={bar.x} y="0" width={bar.width} height="12" />{/each}
</svg>
{#if number}<p class="number">{number}</p>{/if}

<style>
  .barcode { display: block; width: 78%; height: 8cqw; margin: 3cqw auto 1cqw; }
  .number { margin: 0 0 1cqw; text-align: center; font-size: 0.85em; letter-spacing: 0.12em; }
  rect { fill: var(--ink); }
</style>
