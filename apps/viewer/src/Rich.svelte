<script lang="ts">
  import { getContext } from 'svelte';
  import { HOTSPOTS, type HotspotContext } from './lib/hotspots';
  import type { Inline, MdBlock } from './lib/markdown';

  let { blocks }: { blocks: MdBlock[] } = $props();
  // Present inside a document; absent in light-boxes and the registry, where spans stay plain.
  const hotspots = getContext<HotspotContext | undefined>(HOTSPOTS);
</script>

{#snippet inline(parts: Inline[])}
  {#each parts as part}
    {#if part.t === 'span'}
      {#if hotspots?.has(part.id)}
        <button
          type="button"
          class="hotspot"
          data-hs={part.id}
          aria-expanded={hotspots.expanded(part.id)}
          onclick={() => hotspots.activate(part.id)}>{part.text}</button>
      {:else}
        <mark class="plain">{part.text}</mark>
      {/if}
    {:else}{part.text}{/if}
  {/each}
{/snippet}

{#each blocks as block}
  {#if block.t === 'p'}
    <p>{@render inline(block.inline)}</p>
  {:else}
    <table>
      <thead><tr>{#each block.head as cell}<th>{@render inline(cell)}</th>{/each}</tr></thead>
      <tbody>
        {#each block.rows as row}
          <tr>{#each row as cell}<td>{@render inline(cell)}</td>{/each}</tr>
        {/each}
      </tbody>
    </table>
  {/if}
{/each}

<style>
  p { margin: 0 0 0.9em; line-height: 1.5; white-space: pre-line; }
  table { width: 100%; border-collapse: collapse; margin: 0.5em 0; }
  th, td { text-align: left; padding: 0.15em 0; border-bottom: 1px dashed currentColor; }
  .plain { background: none; color: inherit; }
  .hotspot {
    font: inherit; color: inherit; cursor: pointer; padding: 0 0.1em; border: 0;
    border-bottom: 1px solid #b88a10;
    background: color-mix(in srgb, #d6a21a 35%, transparent);
    text-align: inherit;
  }
  .hotspot:hover { background: color-mix(in srgb, #d6a21a 60%, transparent); }
  .hotspot:focus-visible { outline: 2px solid #1d4ed8; outline-offset: 1px; }
</style>
