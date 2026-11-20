<script lang="ts">
  import { setContext } from 'svelte';
  import { FALLBACK_TEMPLATE, type Hotspot } from '@archive/casefile';
  import type { LoadedDoc } from './lib/episode';
  import { HOTSPOTS } from './lib/hotspots';
  import { STRINGS } from './lib/strings';
  import Block from './Block.svelte';
  import Rich from './Rich.svelte';

  let { doc, onhotspot }: { doc: LoadedDoc; onhotspot: (h: Hotspot) => void } = $props();

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
  const rects = $derived(doc.def.hotspots.filter((h) => h.anchor.type === 'rect'));

  // Text spans find their hotspot through context; rectangle hotspots are drawn below.
  setContext(HOTSPOTS, {
    has: (id: string) => doc.def.hotspots.some((h) => h.id === id && h.anchor.type === 'text'),
    activate: (id: string) => {
      const h = doc.def.hotspots.find((x) => x.id === id);
      if (h) onhotspot(h);
    },
  });
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

  {#each rects as h (h.id)}
    {#if h.anchor.type === 'rect'}
      <button
        type="button"
        class="rect"
        aria-label={h.label ?? STRINGS.noteTitle}
        style="left:{h.anchor.x * 100}%;top:{h.anchor.y * 100}%;width:{h.anchor.width * 100}%;height:{h.anchor.height * 100}%"
        onclick={() => onhotspot(h)}
      ></button>
    {/if}
  {/each}
</article>

<style>
  .paper {
    position: relative;
    background: var(--paper);
    color: var(--ink);
    padding: 6cqw;
    box-sizing: border-box;
    overflow: hidden;
    box-shadow: 0 0.4cqw 2cqw rgba(0, 0, 0, 0.45);
    user-select: none;
  }
  .paper :global(img) { max-width: 100%; }
  .rect {
    position: absolute; padding: 0; cursor: pointer; background: color-mix(in srgb, #d6a21a 18%, transparent);
    border: 0.3cqw dashed #b88a10;
  }
  .rect:hover { background: color-mix(in srgb, #d6a21a 40%, transparent); }
  .rect:focus-visible { outline: 2px solid #1d4ed8; }
</style>
