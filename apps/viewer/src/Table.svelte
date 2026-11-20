<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import type { Hotspot } from '@archive/casefile';
  import type { LightboxContent, LoadedDoc } from './lib/episode';
  import type { RegistryResolver } from './lib/registry';
  import DocumentView from './DocumentView.svelte';
  import Lightbox from './Lightbox.svelte';
  import Registry from './Registry.svelte';

  let { title, date, docs, resolver, onback }: {
    title: string;
    date: string;
    docs: LoadedDoc[];
    resolver: RegistryResolver;
    onback: () => void;
  } = $props();

  interface State {
    x: number;
    y: number;
    zoom: number;
    z: number;
    entered: boolean;
    /** Hidden documents only exist on the table once a hotspot reveals them. */
    revealed: boolean;
    /** Where the document starts from when it enters (percent of the table). */
    fromLeft: number;
    fromTop: number;
  }

  const all = untrack(() => docs);
  const byId = Object.fromEntries(all.map((d) => [d.id, d]));
  const opening = all.filter((d) => !d.hidden); // these come out of the folder in turn
  const order = Object.fromEntries(opening.map((d, i) => [d.id, i]));
  let states = $state<Record<string, State>>(
    Object.fromEntries(
      all.map((d, i) => [
        d.id,
        { x: d.layout.x, y: d.layout.y, zoom: 1, z: i + 1, entered: false, revealed: !d.hidden, fromLeft: 50, fromTop: 0 },
      ]),
    ),
  );

  let tw = $state(1000);
  let th = $state(700);
  let focused = $state<string | null>(null);
  let folderOpen = $state(false);
  let folderGone = $state(false);
  let settled = $state(false);
  let topZ = all.length + 1;
  let dragging = $state<string | null>(null);
  let drag: { id: string; el: HTMLElement; pid: number; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null = null;

  type Overlay = { type: 'lightbox'; content: LightboxContent } | { type: 'registry'; id: string };
  let overlay = $state<Overlay | null>(null);

  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  onMount(() => {
    const timers: number[] = [];
    if (reduced) {
      folderGone = settled = true;
      opening.forEach((d) => (states[d.id].entered = true));
    } else {
      // The folder opens, then each document slides out onto the table in turn.
      timers.push(window.setTimeout(() => (folderOpen = true), 150));
      timers.push(window.setTimeout(() => opening.forEach((d) => (states[d.id].entered = true)), 800));
      timers.push(window.setTimeout(() => (folderGone = true), 1400));
      timers.push(window.setTimeout(() => (settled = true), 800 + opening.length * 180 + 800));
    }
    // Esc closes an open overlay first, otherwise puts a focused document back.
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (overlay) overlay = null;
      else focused = null;
    };
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
    drag = { id, el: e.currentTarget as HTMLElement, pid: e.pointerId, sx: e.clientX, sy: e.clientY, ox: states[id].x, oy: states[id].y, moved: false };
  }
  function move(e: PointerEvent) {
    if (!drag || focused) return;
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) > 4) {
      drag.moved = true;
      dragging = drag.id;
      // Capture only once a real drag starts, so plain clicks still reach hotspots.
      drag.el.setPointerCapture(drag.pid);
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

  /** A supplementary document slides onto the table from the document that mentioned it. */
  async function reveal(targetId: string, sourceId: string) {
    const target = states[targetId];
    if (!target) return;
    target.z = ++topZ;
    if (target.revealed) return;
    const src = states[sourceId];
    target.fromLeft = (src.x + byId[sourceId].layout.width / 2) * 100;
    target.fromTop = src.y * 100 + 8;
    target.revealed = true;
    if (reduced) {
      target.entered = true;
      return;
    }
    await tick();
    requestAnimationFrame(() => requestAnimationFrame(() => (target.entered = true)));
  }

  function activate(sourceId: string, h: Hotspot) {
    const t = h.target;
    if (t.type === 'lightbox') {
      const content = byId[sourceId].lightboxes[h.id];
      if (content) overlay = { type: 'lightbox', content };
    } else if (t.type === 'document') void reveal(t.document, sourceId);
    else overlay = { type: 'registry', id: t.entry };
  }

  function boxStyle(d: LoadedDoc): string {
    const s = states[d.id];
    const delay = settled ? 0 : (order[d.id] ?? 0) * 180;
    const base = `transition-delay:${delay}ms;z-index:${s.z};`;
    if (!s.entered) {
      return `${base}left:${s.fromLeft}%;top:${s.fromTop}%;width:${d.layout.width * 100}%;transform:translate(-50%,-50%) scale(0.1);opacity:0;`;
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

    {#each all as d (d.id)}
      {#if states[d.id].revealed}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div
          class="doc"
          class:dragging={dragging === d.id}
          class:aside={focused !== null && focused !== d.id}
          style={boxStyle(d)}
          onpointerdown={(e) => down(e, d.id)}
          onpointermove={move}
          onpointerup={up}
          onpointercancel={up}
          onwheel={(e) => wheel(e, d.id)}
          ondblclick={() => toggleFocus(d.id)}
          onclick={(e) => e.stopPropagation()}
        >
          <DocumentView doc={d} onhotspot={(h) => activate(d.id, h)} />
        </div>
      {/if}
    {/each}

    <p class="hint">Drag to move · scroll to zoom · double-click to focus · click highlighted text to look closer · Esc to go back</p>
  </div>
</div>

{#if overlay?.type === 'lightbox'}
  <Lightbox content={overlay.content} onclose={() => (overlay = null)} />
{:else if overlay?.type === 'registry'}
  <Registry startId={overlay.id} {resolver} onclose={() => (overlay = null)} />
{/if}

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
