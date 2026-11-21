<script lang="ts">
  import { untrack } from 'svelte';
  import type { DocumentView, SlotView } from '../../src/shared/api';
  import type { Autosave, Now } from './lib/actions';
  import FieldGridForm from './FieldGridForm.svelte';
  import SlotField from './SlotField.svelte';

  let { doc, autosave, now, onback }: { doc: DocumentView; autosave: Autosave; now: Now; onback: () => void } = $props();

  const slotMap = $derived<Record<string, SlotView>>(Object.fromEntries(doc.slots.map((s) => [s.name, s])));
  let layout = $state({ x: untrack(() => doc.layout.x), y: untrack(() => doc.layout.y), width: untrack(() => doc.layout.width), rotation: untrack(() => doc.layout.rotation ?? 0) });
  let layoutFocused = $state(false);

  // A document dragged on the preview changes its position; show it here unless the boxes are being typed in.
  $effect(() => {
    const l = doc.layout;
    if (layoutFocused) return;
    layout = { x: l.x, y: l.y, width: l.width, rotation: l.rotation ?? 0 };
  });

  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  function saveLayout() {
    autosave('layout', () => window.author.setLayout(doc.id, { x: num(layout.x), y: num(layout.y), width: num(layout.width), rotation: num(layout.rotation) || undefined }, true));
  }

  async function remove() {
    if (!confirm(`Remove "${doc.id}"? Its files are deleted from the episode folder. This cannot be undone.`)) return;
    const result = await now(() => window.author.removeDocument(doc.id));
    if (result?.ok) onback();
  }
</script>

<div class="editor">
  <button class="back" onclick={onback}>← Episode</button>
  <h2>{doc.id}</h2>
  <p class="kind">{doc.templateName}{#if doc.central}{' · main document'}{/if}{#if doc.hidden}{' · hidden'}{/if}</p>

  {#if !doc.readable}
    <p class="alert" role="alert">This document's file has a problem, so it cannot be edited here yet. See Problems, fix the file, then reopen the episode.</p>
  {:else}
    <!-- The form follows the paper: the same sections and rows as the printed document. -->
    {#if doc.plan.length > 0}
      {#each doc.plan as item}
        {#if item.type === 'bar'}
          <h3 class="bar">{item.text}</h3>
        {:else if item.type === 'grid'}
          <FieldGridForm docId={doc.id} rows={item.rows} slots={slotMap} {autosave} />
        {:else if item.collapsible}
          <!-- Parts most documents leave empty: closed to keep the form short, open when something is already written. -->
          <details class="section" open={untrack(() => item.slots.some((n) => slotMap[n]?.text || slotMap[n]?.image))}>
            <summary>{item.title}</summary>
            {#each item.slots as name (name)}
              {#if slotMap[name]}<SlotField docId={doc.id} slot={slotMap[name]} {autosave} {now} />{/if}
            {/each}
          </details>
        {:else}
          {#if item.title}<h3>{item.title}</h3>{/if}
          {#each item.slots as name (name)}
            {#if slotMap[name]}<SlotField docId={doc.id} slot={slotMap[name]} tall={item.tall} {autosave} {now} />{/if}
          {/each}
        {/if}
      {/each}
    {:else}
      {#each doc.slots as slot (slot.name)}<SlotField docId={doc.id} {slot} {autosave} {now} />{/each}
    {/if}

    <h3>On the table</h3>
    <p class="help">Drag the document on the preview, or type exact positions. They are fractions of the table: 0 is the left or top edge, 1 the right or bottom.</p>
    <div class="grid" onfocusin={() => (layoutFocused = true)} onfocusout={() => (layoutFocused = false)}>
      <label><span>Left</span><input type="number" step="0.01" min="0" max="1" bind:value={layout.x} oninput={saveLayout} /></label>
      <label><span>Top</span><input type="number" step="0.01" min="0" max="1" bind:value={layout.y} oninput={saveLayout} /></label>
      <label><span>Width</span><input type="number" step="0.01" min="0.05" max="1" bind:value={layout.width} oninput={saveLayout} /></label>
      <label><span>Tilt (degrees)</span><input type="number" step="1" min="-180" max="180" bind:value={layout.rotation} oninput={saveLayout} /></label>
    </div>

    <h3>Role</h3>
    {#if doc.central}
      <p class="help">This is the main document of the episode.</p>
    {:else}
      <button onclick={() => now(() => window.author.setCentral(doc.id))}>Make this the main document</button>
      <label class="check">
        <input type="checkbox" checked={doc.hidden} onchange={(e) => now(() => window.author.setHidden(doc.id, e.currentTarget.checked))} />
        <span>Hidden until a clickable note opens it</span>
      </label>
      <p class="help">A hidden document is not on the table at the start, so it is not shown in the preview.</p>
    {/if}

    <h3>Remove</h3>
    <button class="danger" disabled={doc.central} onclick={remove}>Remove this document…</button>
    {#if doc.central}<p class="help">The main document cannot be removed. Make another document the main one first.</p>{/if}
  {/if}
</div>

<style>
  h2 { margin: 0.6rem 0 0; font-size: 1.1rem; }
  .section { margin: 0.9rem 0; border-top: 1px solid var(--line); padding-top: 0.5rem; }
  .section summary { cursor: pointer; font-size: 0.8rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin-bottom: 0.5rem; }
  h3.bar { background: #0d0d0d; color: #fff; letter-spacing: 0.1em; text-align: center; padding: 0.15rem 0; margin: 1.2rem 0 0.5rem; font-size: 0.72rem; }
  h3 { font-size: 0.8rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); font-weight: normal; margin: 1.4rem 0 0.5rem; }
  .kind { color: var(--muted); margin: 0.1rem 0 1rem; }
  .back { margin-bottom: 0.3rem; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 0.7rem; }
  .help { color: var(--muted); font-size: 0.85rem; margin: 0.3rem 0 0.7rem; }
  .check { display: flex; gap: 0.5rem; align-items: center; margin: 0.8rem 0 0; }
  .check input { width: auto; }
  .check span { margin: 0; color: var(--ink); font-size: inherit; }
  .danger { border-color: #7a3b32; }
  .alert { background: #3b1f1a; border: 1px solid #7a3b32; border-radius: 4px; padding: 0.6rem 0.8rem; }
</style>
