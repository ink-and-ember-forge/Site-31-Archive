<script lang="ts">
  import type { Inline, MdBlock } from './lib/markdown';
  let { blocks }: { blocks: MdBlock[] } = $props();
</script>

{#snippet inline(parts: Inline[])}
  {#each parts as part}
    {#if part.t === 'span'}
      <!-- Hotspot: shown but not yet interactive (hotspots and the registry overlay are later build steps). -->
      <mark class="hotspot">{part.text}</mark>
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
  p { margin: 0 0 0.9em; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; margin: 0.5em 0; }
  th, td { text-align: left; padding: 0.15em 0; border-bottom: 1px dashed currentColor; }
  .hotspot {
    background: color-mix(in srgb, #d6a21a 35%, transparent);
    color: inherit;
    padding: 0 0.1em;
    border-bottom: 1px solid #b88a10;
  }
</style>
