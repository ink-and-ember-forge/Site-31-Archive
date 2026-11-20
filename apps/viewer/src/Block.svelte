<script lang="ts">
  import type { Block as BlockDef } from '@archive/casefile';
  import { isKnownBlock } from '@archive/casefile';
  import type { Content } from './lib/episode';
  import Barcode from './Barcode.svelte';
  import Block from './Block.svelte';
  import FieldGrid from './FieldGrid.svelte';
  import ItemsList from './ItemsList.svelte';
  import Letterhead from './Letterhead.svelte';
  import Rich from './Rich.svelte';
  import RuledLines from './RuledLines.svelte';
  import StampBlock from './StampBlock.svelte';

  let { block, content }: { block: BlockDef; content: Record<string, Content> } = $props();

  const slot = $derived(block.slot ? content[block.slot] : undefined);
  const opts = $derived(block.props ?? {});
  const known = $derived(isKnownBlock(block.block));
  $effect(() => {
    if (!known) console.warn(`Unknown block "${block.block}" skipped`);
  });
  const textOf = (c: Content | undefined) => (c?.kind === 'value' ? c.value : '');
  const text = $derived(textOf(slot));
  const slotText = (key: string) => (typeof opts[key] === 'string' ? textOf(content[opts[key] as string]) : '');
  const align = $derived(opts.align === 'center' || opts.align === 'left' || opts.align === 'right' ? (opts.align as string) : undefined);
  const tone = $derived(opts.tone === 'grey' || opts.tone === 'plain' ? (opts.tone as string) : 'black');
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
  {#if text}
    <h2 class:large={opts.size === 'large'}>{text}</h2>
    {#if slotText('subtitle')}<p class="subtitle">{slotText('subtitle')}</p>{/if}
  {/if}
{:else if block.block === 'paragraph' || block.block === 'table'}
  {#if slot?.kind === 'markdown'}<div class="para" style:text-align={align}><Rich blocks={slot.blocks} /></div>{/if}
{:else if block.block === 'field-row'}
  <div class="field">
    <span>{opts.label ?? ''}</span><strong>{text}</strong>
  </div>
{:else if block.block === 'split-row'}
  <div class="split"><span>{slotText('left')}</span><span>{slotText('right')}</span></div>
{:else if block.block === 'rule'}
  <hr class="rule" />
{:else if block.block === 'section-bar'}
  <div class="bar {tone}">{typeof opts.text === 'string' ? opts.text : text}</div>
{:else if block.block === 'letterhead'}
  <Letterhead {block} {content} />
{:else if block.block === 'field-grid'}
  <FieldGrid {block} {content} />
{:else if block.block === 'ruled-lines'}
  <RuledLines {block} {content} />
{:else if block.block === 'items-list'}
  <ItemsList {block} {content} />
{:else if block.block === 'stamp'}
  <StampBlock {block} {content} />
{:else if block.block === 'barcode'}
  <Barcode {block} {content} />
{:else if block.block === 'image'}
  {#if slot?.kind === 'image'}<img src={slot.url} alt={slot.alt} draggable="false" />{/if}
{:else if block.block === 'caption'}
  {#if text}<p class="caption" style:text-align={align}>{text}</p>{/if}
{/if}

<style>
  .stack { display: flex; flex-direction: column; }
  .columns { display: flex; gap: 1em; }
  h2 { margin: 0 0 0.8em; font-size: 1.3em; letter-spacing: 0.04em; text-align: center; }
  h2.large { font-size: 1.55em; letter-spacing: 0.08em; margin-bottom: 0.3em; }
  .subtitle { margin: 0 0 1.6cqw; text-align: center; font-size: 0.78em; color: color-mix(in srgb, var(--ink) 70%, transparent); }
  .field { display: flex; justify-content: space-between; margin-top: 0.6em; }
  .split { display: flex; justify-content: space-between; gap: 1em; }
  .rule { border: 0; border-top: 0.18cqw dashed var(--line, #777); margin: 1.6cqw 0; }
  .para :global(p) { margin: 0 0 0.3em; }
  .bar { text-align: center; font: 600 2.1cqw var(--print-font); letter-spacing: 0.1em; padding: 0.5cqw 0; background: var(--bar-bg); color: var(--bar-ink); }
  .bar.grey { background: var(--grey-bg); color: var(--ink); border: 0.18cqw solid var(--line); }
  .bar.plain { background: transparent; color: var(--ink); border-bottom: 0.18cqw solid var(--line); }
  img { width: 100%; display: block; }
  .caption { margin: 0.4em 0 0; font-size: 0.85em; text-align: center; }
</style>
