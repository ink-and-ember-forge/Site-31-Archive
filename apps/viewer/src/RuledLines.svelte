<script lang="ts">
  import type { Block } from '@archive/casefile';
  import type { Content } from './lib/episode';
  import Rich from './Rich.svelte';

  let { block, content }: { block: Block; content: Record<string, Content> } = $props();

  const value = $derived(block.slot ? content[block.slot] : undefined);
  // The form always shows at least this many lines, empty or not. A longer statement adds lines.
  const lines = $derived(typeof block.props?.lines === 'number' && block.props.lines > 0 ? Math.min(Math.floor(block.props.lines), 60) : 12);
</script>

<div class="ruled" style="--lines: {lines}">
  {#if value?.kind === 'markdown'}<Rich blocks={value.blocks} />
  {:else if value?.kind === 'value' && value.value}<p>{value.value}</p>{/if}
</div>

<style>
  .ruled {
    --rule-h: 4.5cqw;
    --rule-w: max(1px, 0.18cqw);
    border: var(--rule-w) solid var(--line);
    border-top: 0;
    padding: 0 2cqw;
    min-height: calc(var(--lines) * var(--rule-h));
    background: repeating-linear-gradient(to bottom, transparent 0, transparent calc(var(--rule-h) - var(--rule-w)), var(--line) calc(var(--rule-h) - var(--rule-w)), var(--line) var(--rule-h));
    background-origin: border-box;
    font-family: var(--entry-font);
    font-size: var(--entry-size);
    color: var(--entry-ink);
  }
  /* Snap the line spacing to whole pixels where the browser can, so thin lines stay crisp instead of fading. */
  @supports (width: round(1px, 1px)) {
    .ruled { --rule-h: round(4.5cqw, 1px); }
  }
  /* Every line of text sits on a ruled line: the line height is the rule spacing and paragraphs add no gap. */
  .ruled :global(p) { margin: 0; line-height: var(--rule-h); }
  .ruled :global(.hotspot) { line-height: inherit; }
</style>
