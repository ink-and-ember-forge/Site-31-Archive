<script lang="ts">
  import type { Block } from '@archive/casefile';
  import type { Content } from './lib/episode';
  import { qrMatrix } from './lib/qr';

  let { block, content }: { block: Block; content: Record<string, Content> } = $props();

  const message = $derived(block.slot && content[block.slot]?.kind === 'value' ? (content[block.slot] as { value: string }).value : '');
  const caption = $derived.by(() => {
    const c = typeof block.props?.caption === 'string' ? content[block.props.caption] : undefined;
    return c?.kind === 'value' ? c.value.trim() : '';
  });
  const matrix = $derived(qrMatrix(message));
  const quiet = 4; // the blank border a scanner needs
  const size = $derived(matrix ? matrix.length + quiet * 2 : 0);
  // One path for every dark square keeps the drawing light and the squares exact.
  const path = $derived(
    matrix ? matrix.flatMap((row, y) => row.map((dark, x) => (dark ? `M${x + quiet} ${y + quiet}h1v1h-1z` : ''))).join('') : '',
  );
  const width = $derived(typeof block.props?.width === 'string' ? (block.props.width as string) : '30%');
</script>

{#if matrix}
  <figure class="qr" style:width>
    <!-- A real QR code: a phone camera pointed at the screen reads the author's message. -->
    <svg viewBox="0 0 {size} {size}" shape-rendering="crispEdges" role="img" aria-label={caption || 'QR code'}>
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#111" />
    </svg>
    {#if caption}<figcaption>{caption}</figcaption>{/if}
  </figure>
{/if}

<style>
  .qr { margin: 2cqw auto 1cqw; }
  svg { display: block; width: 100%; height: auto; }
  figcaption { text-align: center; font-size: 0.85em; letter-spacing: 0.08em; margin-top: 0.6cqw; }
</style>
