<script lang="ts">
  import { FALLBACK_TEMPLATE } from '@archive/casefile';
  import type { LoadedDoc } from './lib/episode';
  import Block from './Block.svelte';
  import Rich from './Rich.svelte';

  let { doc }: { doc: LoadedDoc } = $props();

  const tokens = $derived(doc.style.tokens);
  // Sizes are in container-query units so a document looks identical at any zoom.
  const fontSize = $derived.by(() => {
    const px = parseFloat(String(tokens.fontSize ?? '15'));
    return `${(Number.isFinite(px) ? px : 15) / 6}cqw`;
  });
  const css = $derived(
    `--paper:${tokens.paper ?? '#f4efe1'};--ink:${tokens.ink ?? '#222'};` +
      `font-family:${tokens.fontFamily ?? 'serif'};font-size:${fontSize};` +
      (doc.template.aspect ? `aspect-ratio:${doc.template.aspect};` : ''),
  );
  const isFallback = $derived(doc.template === FALLBACK_TEMPLATE);
</script>

<article class="paper" style={css}>
  {#if isFallback}
    <!-- Unknown template: show every slot as plain content. -->
    {#each Object.values(doc.content) as item}
      {#if item.kind === 'markdown'}<Rich blocks={item.blocks} />
      {:else if item.kind === 'value'}<p>{item.value}</p>
      {:else}<img src={item.url} alt={item.alt} />{/if}
    {/each}
  {:else}
    <Block block={doc.template.layout} content={doc.content} />
  {/if}
</article>

<style>
  .paper {
    background: var(--paper);
    color: var(--ink);
    padding: 6cqw;
    box-sizing: border-box;
    overflow: hidden;
    box-shadow: 0 0.4cqw 2cqw rgba(0, 0, 0, 0.45);
    user-select: none;
  }
  .paper :global(img) { max-width: 100%; }
</style>
