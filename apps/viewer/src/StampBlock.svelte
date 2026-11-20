<script lang="ts">
  import type { Block } from '@archive/casefile';
  import type { Content } from './lib/episode';

  let { block, content }: { block: Block; content: Record<string, Content> } = $props();

  const opts = $derived(block.props ?? {});
  const valueOf = (key: string) => {
    const name = opts[key];
    const c = typeof name === 'string' ? content[name] : undefined;
    return c?.kind === 'value' ? c.value.trim() : '';
  };
  // The words come from a slot, so a stamp the author leaves empty is simply not drawn.
  const text = $derived(valueOf('text'));
  const date = $derived(valueOf('date'));
  const css = (key: string) => (typeof opts[key] === 'string' ? `${key}:${opts[key]};` : '');
  const style = $derived(`${css('top')}${css('right')}${css('left')}${css('bottom')}transform:rotate(${typeof opts.tilt === 'number' ? opts.tilt : -8}deg);`);
</script>

{#if text}
  <div class="stamp" {style} aria-label={text}>
    {text}
    {#if date}<small>{date}</small>{/if}
  </div>
{/if}

<style>
  .stamp {
    position: absolute;
    border: 0.5cqw solid var(--accent, rgba(170, 35, 35, 0.78));
    color: var(--accent, rgba(170, 35, 35, 0.78));
    font: 700 2.7cqw var(--print-font);
    letter-spacing: 0.14em;
    padding: 0.5cqw 1.8cqw;
    text-align: center;
    line-height: 1.2;
    mix-blend-mode: multiply;
    pointer-events: none;
    text-transform: uppercase;
  }
  small { display: block; font-size: 1.6cqw; letter-spacing: 0.1em; font-weight: 600; }
</style>
