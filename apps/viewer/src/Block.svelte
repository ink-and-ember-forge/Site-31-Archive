<script lang="ts">
  import type { Block as BlockDef } from '@archive/casefile';
  import { isKnownBlock } from '@archive/casefile';
  import type { Content } from './lib/episode';
  import Block from './Block.svelte';
  import Rich from './Rich.svelte';

  let { block, content }: { block: BlockDef; content: Record<string, Content> } = $props();

  const slot = $derived(block.slot ? content[block.slot] : undefined);
  const known = $derived(isKnownBlock(block.block));
  $effect(() => {
    if (!known) console.warn(`Unknown block "${block.block}" skipped`);
  });
  const text = $derived(slot?.kind === 'value' ? slot.value : '');
</script>

{#if block.block === 'stack'}
  <div class="stack">
    {#each block.children ?? [] as child}<Block block={child} {content} />{/each}
  </div>
{:else if block.block === 'columns'}
  <div class="columns">
    {#each block.children ?? [] as child}<Block block={child} {content} />{/each}
  </div>
{:else if block.block === 'title'}
  {#if text}<h2>{text}</h2>{/if}
{:else if block.block === 'paragraph' || block.block === 'table'}
  {#if slot?.kind === 'markdown'}<Rich blocks={slot.blocks} />{/if}
{:else if block.block === 'field-row'}
  <div class="field">
    <span>{block.props?.label ?? ''}</span><strong>{text}</strong>
  </div>
{:else if block.block === 'stamp'}
  <div class="stamp">{block.props?.text ?? text}</div>
{:else if block.block === 'image'}
  {#if slot?.kind === 'image'}<img src={slot.url} alt={slot.alt} draggable="false" />{/if}
{:else if block.block === 'caption'}
  {#if text}<p class="caption">{text}</p>{/if}
{/if}

<style>
  .stack { display: flex; flex-direction: column; }
  .columns { display: flex; gap: 1em; }
  h2 { margin: 0 0 0.8em; font-size: 1.3em; letter-spacing: 0.04em; text-align: center; }
  .field { display: flex; justify-content: space-between; margin-top: 0.6em; }
  .stamp { border: 0.15em solid currentColor; padding: 0.2em 0.6em; transform: rotate(-6deg); align-self: flex-start; opacity: 0.7; }
  img { width: 100%; display: block; }
  .caption { margin: 0.4em 0 0; font-size: 0.85em; text-align: center; }
</style>
