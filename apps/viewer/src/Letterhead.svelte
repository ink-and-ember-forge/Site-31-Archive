<script lang="ts">
  import type { Block } from '@archive/casefile';
  import type { Content } from './lib/episode';
  import Rich from './Rich.svelte';

  let { block, content }: { block: Block; content: Record<string, Content> } = $props();

  const opts = $derived(block.props ?? {});
  const slotOf = (key: string): Content | undefined => (typeof opts[key] === 'string' ? content[opts[key] as string] : undefined);
  const textOf = (c: Content | undefined) => (c?.kind === 'value' ? c.value.trim() : '');

  const crest = $derived(slotOf('crest'));
  const name = $derived(textOf(slotOf('name')));
  const lines = $derived(slotOf('lines'));
  const reference = $derived(textOf(slotOf('reference')));
  const revision = $derived(textOf(slotOf('revision')));
  const referenceLabel = $derived(typeof opts.referenceLabel === 'string' ? opts.referenceLabel : 'FORM');
  const revisionLabel = $derived(typeof opts.revisionLabel === 'string' ? opts.revisionLabel : 'Rev.');
</script>

<header class="letterhead">
  {#if crest?.kind === 'image'}<img class="crest" src={crest.url} alt={crest.alt} draggable="false" />{/if}
  <div class="org">
    {#if name}<strong>{name}</strong>{/if}
    {#if lines?.kind === 'markdown'}<div class="lines"><Rich blocks={lines.blocks} /></div>
    {:else if lines?.kind === 'value' && lines.value}<div class="lines"><p>{lines.value}</p></div>{/if}
  </div>
  {#if reference || revision}
    <div class="ref">
      {#if reference}<span>{referenceLabel} <b>{reference}</b></span>{/if}
      {#if revision}<small>{revisionLabel} {revision}</small>{/if}
    </div>
  {/if}
</header>

<style>
  .letterhead { display: flex; align-items: center; gap: 2.4cqw; margin-bottom: 2.6cqw; font-family: var(--print-font); }
  .crest { width: 13cqw; height: 13cqw; object-fit: contain; flex: none; }
  .org { flex: 1; min-width: 0; line-height: 1.35; color: var(--ink); }
  .org strong { display: block; font-size: 2.3cqw; letter-spacing: 0.04em; }
  .lines { font-size: 1.85cqw; color: color-mix(in srgb, var(--ink) 80%, transparent); }
  .lines :global(p) { margin: 0; line-height: 1.35; }
  .ref { text-align: right; font-size: 1.7cqw; line-height: 1.5; flex: none; color: color-mix(in srgb, var(--ink) 85%, transparent); }
  .ref span { display: block; }
  .ref b { display: inline-block; border: 0.17cqw solid var(--ink); padding: 0.1cqw 1cqw; font-size: 2cqw; }
  .ref small { display: block; font-size: 1.6cqw; }
</style>
