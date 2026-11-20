<script lang="ts">
  import type { Block } from '@archive/casefile';
  import type { Content } from './lib/episode';
  import { barcodeBars } from './lib/barcode';

  let { block, content }: { block: Block; content: Record<string, Content> } = $props();

  const seedSlot = $derived(typeof block.props?.seed === 'string' ? content[block.props.seed] : undefined);
  const bars = $derived(barcodeBars(seedSlot?.kind === 'value' ? seedSlot.value : ''));
</script>

<!-- Decorative only: a pattern made from the reference, not a real code. -->
<svg class="barcode" viewBox="0 0 96 12" preserveAspectRatio="none" aria-hidden="true">
  {#each bars as bar}<rect x={bar.x} y="0" width={bar.width} height="12" />{/each}
</svg>

<style>
  .barcode { display: block; width: 78%; height: 8cqw; margin: 3cqw auto 1cqw; }
  rect { fill: var(--ink); }
</style>
