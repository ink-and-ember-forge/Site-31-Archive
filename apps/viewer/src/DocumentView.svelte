<script lang="ts">
  import { setContext } from 'svelte';
  import { FALLBACK_TEMPLATE, type Hotspot } from '@archive/casefile';
  import type { LoadedDoc } from './lib/episode';
  import { HOTSPOTS } from './lib/hotspots';
  import { LABELS, type LabelsContext } from './lib/labels';
  import { STRINGS } from './lib/strings';
  import Block from './Block.svelte';
  import Rich from './Rich.svelte';

  let { doc, openNotes, onhotspot }: { doc: LoadedDoc; openNotes: string[]; onhotspot: (h: Hotspot) => void } = $props();

  const tokens = $derived(doc.style.tokens);
  // Sizes are in container-query units so a document looks identical at any zoom.
  const fontSize = $derived.by(() => {
    const px = parseFloat(String(tokens.fontSize ?? '15'));
    return `${(Number.isFinite(px) ? px : 15) / 6}cqw`;
  });
  const px = (v: unknown, fallback: number) => {
    const n = parseFloat(String(v ?? ''));
    return Number.isFinite(n) ? n : fallback;
  };
  const token = (key: string, fallback: string) => (tokens[key] !== undefined && String(tokens[key]) !== '' ? String(tokens[key]) : fallback);
  // A style's tokens become the paper, the printed ink and fonts, and the "entry" voice used for what is
  // filled in (typed or handwritten). Sizes are in container units so a document looks the same at any zoom.
  const css = $derived(
    `--paper:${token('paper', '#f4efe1')};--paper-to:${token('paperTo', token('paper', '#f4efe1'))};` +
      `--ink:${token('ink', '#222')};--font:${token('fontFamily', 'serif')};` +
      `--print-font:${token('printFont', token('fontFamily', 'serif'))};` +
      `--entry-font:${token('entryFont', token('fontFamily', 'serif'))};--entry-ink:${token('entryInk', token('ink', '#222'))};` +
      `--entry-size:${px(tokens.entrySize, px(tokens.fontSize, 15)) / 6}cqw;` +
      `--script-font:${token('scriptFont', "'Segoe Script','Brush Script MT',cursive")};` +
      `--bar-bg:${token('barBg', '#0d0d0d')};--bar-ink:${token('barInk', '#fff')};--grey-bg:${token('greyBg', '#e3e3e3')};` +
      `--line:${token('line', '#2a2a2a')};--accent:${token('accent', 'rgba(170,35,35,.78)')};` +
      `font-family:var(--font);font-size:${fontSize};` +
      // The template's shape is a minimum height, not a fixed one, so a longer statement or receipt grows the page.
      (doc.template.aspect ? `min-height:calc(100cqw / ${doc.template.aspect});` : ''),
  );
  const torn = $derived(tokens.edge === 'torn');
  const grain = $derived(tokens.grain === 'fine');
  const isFallback = $derived(doc.template === FALLBACK_TEMPLATE);
  const rects = $derived(doc.def.hotspots.filter((h) => h.anchor.type === 'rect'));

  // The printed labels of the template's slots, for blocks that draw labelled boxes.
  setContext(LABELS, (() => Object.fromEntries(doc.template.slots.filter((s) => s.label).map((s) => [s.name, s.label as string]))) satisfies LabelsContext);

  // Text spans find their hotspot through context; rectangle hotspots are drawn below.
  const isNote = (id: string) => doc.def.hotspots.some((h) => h.id === id && h.target.type === 'lightbox');

  setContext(HOTSPOTS, {
    expanded: (id: string) => (isNote(id) ? openNotes.includes(id) : undefined),
    has: (id: string) => doc.def.hotspots.some((h) => h.id === id && h.anchor.type === 'text'),
    activate: (id: string) => {
      const h = doc.def.hotspots.find((x) => x.id === id);
      if (h) onhotspot(h);
    },
  });
</script>

<article class="paper" class:torn class:grain style={css}>
  {#if isFallback}
    <!-- Unknown template: show every slot as plain content. -->
    {#each Object.values(doc.content) as item}
      {#if item.kind === 'markdown'}<Rich blocks={item.blocks} />
      {:else if item.kind === 'value'}<p>{item.value}</p>
      {:else if item.kind === 'image'}<img src={item.url} alt={item.alt} />{/if}
    {/each}
  {:else}
    <Block block={doc.template.layout} content={doc.content} />
  {/if}

  {#each rects as h (h.id)}
    {#if h.anchor.type === 'rect'}
      <button
        type="button"
        class="rect"
        data-hs={h.id}
        aria-expanded={isNote(h.id) ? openNotes.includes(h.id) : undefined}
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
    background: linear-gradient(var(--paper), var(--paper-to));
    color: var(--ink);
    padding: 6cqw;
    box-sizing: border-box;
    overflow: hidden;
    box-shadow: 0 0.4cqw 2cqw rgba(0, 0, 0, 0.45);
    user-select: none;
  }
  .paper :global(img) { max-width: 100%; }
  /* A faint grain over the paper, like a printed sheet. */
  .grain::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.012) 0 1px, transparent 1px 3px); }
  /* A receipt torn off a roll: a zigzag along the bottom edge. */
  .torn { padding-bottom: 8cqw; clip-path: polygon(0 0, 100% 0, 100% calc(100% - 2cqw), 96% 100%, 92% calc(100% - 2cqw), 88% 100%, 84% calc(100% - 2cqw), 80% 100%, 76% calc(100% - 2cqw), 72% 100%, 68% calc(100% - 2cqw), 64% 100%, 60% calc(100% - 2cqw), 56% 100%, 52% calc(100% - 2cqw), 48% 100%, 44% calc(100% - 2cqw), 40% 100%, 36% calc(100% - 2cqw), 32% 100%, 28% calc(100% - 2cqw), 24% 100%, 20% calc(100% - 2cqw), 16% 100%, 12% calc(100% - 2cqw), 8% 100%, 4% calc(100% - 2cqw), 0 100%); }
  .rect {
    position: absolute; padding: 0; cursor: pointer; background: color-mix(in srgb, #d6a21a 18%, transparent);
    border: 0.3cqw dashed #b88a10;
  }
  .rect:hover { background: color-mix(in srgb, #d6a21a 40%, transparent); }
  .rect:focus-visible { outline: 2px solid #1d4ed8; }
</style>
