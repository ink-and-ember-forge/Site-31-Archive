<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { LoadedDoc } from './lib/episode';
  import DocumentView from './DocumentView.svelte';

  let { title, date, docs, onback }: { title: string; date: string; docs: LoadedDoc[]; onback: () => void } = $props();

  interface State { x: number; y: number; zoom: number; z: number; entered: boolean }
  // Hidden documents are revealed by hotspots, which come in a later build step.
  const shown = untrack(() => docs.filter((d) => !d.hidden));
  let states = $state<Record<string, State>>(
    Object.fromEntries(shown.map((d, i) => [d.id, { x: d.layout.x, y: d.layout.y, zoom: 1, z: i + 1, entered: false }])),
  );

  let tw = $state(1000);
  let th = $state(700);
  let focused = $state<string | null>(null);
  let folderOpen = $state(false);
  let folderGone = $state(false);
  let settled = $state(false);
  let topZ = shown.length + 1;
  let dragging = $state<string | null>(null);
  let drag: { id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null = null;

  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  onMount(() => {
    const timers: number[] = [];
    if (reduced) {
      folderGone = settled = true;
      shown.forEach((d) => (states[d.id].entered = true));
      return;
    }
    // The folder opens, then each document slides out onto the table in turn.
    timers.push(window.setTimeout(() => (folderOpen = true), 150));
    timers.push(window.setTimeout(() => shown.forEach((d) => (states[d.id].entered = true)), 800));
    timers.push(window.setTimeout(() => (folderGone = true), 1400));
    timers.push(window.setTimeout(() => (settled = true), 800 + shown.length * 180 + 800));
    const key = (e: KeyboardEvent) => e.key === 'Escape' && (focused = null);
    window.addEventListener('keydown', key);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('keydown', key);
    };
  });

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  function down(e: PointerEvent, id: string) {
    if (focused && focused !== id) return;
    states[id].z = ++topZ;
    drag = { id, sx: e.clientX, sy: e.clientY, ox: states[id].x, oy: states[id].y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!drag || focused) return;
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) > 4) {
      drag.moved = true;
      dragging = drag.id;
    }
    if (drag.moved) {
      states[drag.id].x = clamp(drag.ox + dx / tw, -0.2, 1);
      states[drag.id].y = clamp(drag.oy + dy / th, -0.2, 1);
    }
  }
  function up() {
    drag = null;
    dragging = null;
  }
  function wheel(e: WheelEvent, id: string) {
    e.preventDefault();
    states[id].zoom = clamp(states[id].zoom * Math.exp(-e.deltaY * 0.0015), 0.5, 3);
  }
  function toggleFocus(id: string) {
    focused = focused === id ? null : id;
    if (focused) states[id].z = ++topZ;
  }

  function boxStyle(d: LoadedDoc, i: number): string {
    const s = states[d.id];
    const delay = settled ? 0 : i * 180;
    const base = `transition-delay:${delay}ms;z-index:${s.z};`;
    if (!s.entered) {
      // Starting point: tucked into the folder at the top centre of the table.
      return `${base}left:50%;top:0%;width:${d.layout.width * 100}%;transform:translate(-50%,0) scale(0.1);opacity:0;`;
    }
    if (focused === d.id) {
      const aspect = d.template.aspect ?? 0.75;
      const widthPx = Math.min(0.88 * th * aspect, 0.8 * tw);
      return `${base}left:50%;top:50%;width:${(widthPx / tw) * 100}%;transform:translate(-50%,-50%) scale(${s.zoom});z-index:1000;`;
    }
    let tx = 0;
    let opacity = 1;
    let scale = s.zoom;
    if (focused) {
      // Move aside: slide toward the nearer side edge and dim.
      const centre = s.x + d.layout.width / 2;
      tx = (centre < 0.5 ? -1 : 1) * tw * 0.25;
      opacity = 0.35;
      scale *= 0.85;
    }
    return `${base}left:${s.x * 100}%;top:${s.y * 100}%;width:${d.layout.width * 100}%;opacity:${opacity};` +
      `transform:translate(${tx}px,0) rotate(${d.layout.rotation ?? 0}deg) scale(${scale});`;
  }
</script>

<div class="screen">
  <header>
    <button onclick={onback}>← Archive</button>
    <span class="name">{title}</span>
    <span class="date">{date}</span>
  </header>

  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="table" bind:clientWidth={tw} bind:clientHeight={th} onclick={() => (focused = null)}>
    {#if !folderGone}
      <div class="folder-open" class:open={folderOpen} aria-hidden="true">
        <div class="back"></div>
        <div class="flap"></div>
      </div>
    {/if}

    {#each shown as d, i (d.id)}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div
        class="doc"
        class:dragging={dragging === d.id}
        class:aside={focused !== null && focused !== d.id}
        style={boxStyle(d, i)}
        onpointerdown={(e) => down(e, d.id)}
        onpointermove={move}
        onpointerup={up}
        onpointercancel={up}
        onwheel={(e) => wheel(e, d.id)}
        ondblclick={() => toggleFocus(d.id)}
        onclick={(e) => e.stopPropagation()}
      >
        <DocumentView doc={d} />
      </div>
    {/each}

    <p class="hint">Drag to move · scroll to zoom · double-click to focus · Esc to put back</p>
  </div>
</div>

<style>
  .screen { display: flex; flex-direction: column; height: 100vh; }
  header { display: flex; align-items: center; gap: 1rem; padding: 0.6rem 1rem; background: #1f1814; color: #d9cdb4; }
  header button { all: unset; cursor: pointer; padding: 0.3rem 0.7rem; border: 1px solid #6b5d4a; border-radius: 0.3rem; }
  header button:focus-visible { outline: 2px solid #fff; }
  .name { font-weight: bold; }
  .date { margin-left: auto; opacity: 0.7; font-size: 0.85rem; }
  .table { position: relative; flex: 1; overflow: hidden; touch-action: none;
           background: radial-gradient(ellipse at center, #5b4636 0%, #3b2d22 100%); }
  .doc { position: absolute; container-type: inline-size; cursor: grab; transform-origin: center;
         transition: left 0.7s ease, top 0.7s ease, width 0.6s ease, transform 0.7s ease, opacity 0.5s ease; }
  .doc.dragging { cursor: grabbing; transition: none; }
  .doc.aside { pointer-events: none; }
  .hint { position: absolute; bottom: 0.6rem; width: 100%; text-align: center; margin: 0; font-size: 0.8rem; color: #b8a98f; pointer-events: none; }

  .folder-open { position: absolute; left: 50%; top: 0; width: 14rem; height: 10rem; transform: translateX(-50%); perspective: 800px; transition: opacity 0.4s ease; }
  .back { position: absolute; inset: 0; background: #cda658; border-radius: 0.4rem; }
  .flap { position: absolute; inset: 0; background: linear-gradient(#e8c981, #dcb86b); border-radius: 0.4rem; transform-origin: top; transition: transform 0.6s ease; }
  .open .flap { transform: rotateX(-160deg); }
  @media (prefers-reduced-motion: reduce) { .doc, .flap { transition: none; } }
</style>
