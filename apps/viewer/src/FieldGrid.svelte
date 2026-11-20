<script lang="ts">
  import { getContext } from 'svelte';
  import type { Block } from '@archive/casefile';
  import type { Content } from './lib/episode';
  import { LABELS, type LabelsContext } from './lib/labels';
  import Rich from './Rich.svelte';

  let { block, content }: { block: Block; content: Record<string, Content> } = $props();
  const getLabels = getContext<LabelsContext | undefined>(LABELS);
  const labels = $derived(getLabels?.() ?? {});

  interface Cell { slot: string; width: number; shaded: boolean; script: boolean }

  // Rows come from the template. Anything malformed is skipped, never thrown.
  const rows = $derived.by((): Cell[][] => {
    const raw = block.props?.rows;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(Array.isArray)
      .map((row) =>
        (row as Record<string, unknown>[])
          .filter((cell) => cell && typeof cell.slot === 'string')
          .map((cell) => ({
            slot: cell.slot as string,
            width: typeof cell.width === 'number' && cell.width > 0 ? cell.width : 1,
            shaded: cell.shaded === true,
            script: cell.voice === 'script',
          })),
      )
      .filter((row) => row.length > 0);
  });
</script>

<div class="grid">
  {#each rows as row}
    <div class="row" style="grid-template-columns: {row.map((c) => `${c.width}fr`).join(' ')}">
      {#each row as cell}
        {@const value = content[cell.slot]}
        <div class="cell" class:shaded={cell.shaded}>
          {#if labels[cell.slot]}<small>{labels[cell.slot]}</small>{/if}
          {#if value?.kind === 'value' && value.value}
            <span class="entry" class:script={cell.script}>{value.value}</span>
          {:else if value?.kind === 'markdown'}
            <span class="entry"><Rich blocks={value.blocks} /></span>
          {/if}
        </div>
      {/each}
    </div>
  {/each}
</div>

<style>
  .grid { border-left: 0.18cqw solid var(--line); border-right: 0.18cqw solid var(--line); font-family: var(--print-font); }
  .row { display: grid; }
  .cell { border-bottom: 0.18cqw solid var(--line); border-right: 0.18cqw solid var(--line); padding: 0.8cqw 1.3cqw 1cqw; min-height: 7.2cqw; }
  .cell:last-child { border-right: 0; }
  .shaded { background: var(--grey-bg); }
  small { display: block; font-size: 1.58cqw; font-weight: 700; color: var(--ink); line-height: 1.25; }
  .entry { display: block; margin-top: 0.5cqw; font-family: var(--entry-font); font-size: var(--entry-size); color: var(--entry-ink); overflow-wrap: break-word; line-height: 1.3; }
  .entry :global(p) { margin: 0; line-height: 1.3; }
  .entry.script { font-family: var(--script-font); font-size: 3.4cqw; font-style: italic; line-height: 1.1; margin-top: 0.1cqw; }
</style>
