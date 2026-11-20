<script lang="ts">
  import { untrack } from 'svelte';
  import type { Result, EpisodeState, DocumentView } from '../../src/shared/api';

  type Action = () => Promise<Result<EpisodeState> | null>;
  let { doc, autosave, now, onback }: {
    doc: DocumentView;
    /** Runs an action after a pause in typing. */
    autosave: (key: string, action: Action) => void;
    /** Runs an action straight away. */
    now: (action: Action) => Promise<Result<EpisodeState> | null>;
    onback: () => void;
  } = $props();

  // What is typed here is kept locally so a save finishing never moves the cursor or overwrites typing.
  // The parent re-creates this editor when a different document is chosen.
  let texts = $state<Record<string, string>>(untrack(() => Object.fromEntries(doc.slots.map((s) => [s.name, s.text]))));
  let alts = $state<Record<string, string>>(untrack(() => Object.fromEntries(doc.slots.map((s) => [s.name, s.image?.alt ?? '']))));
  let layout = $state({ x: untrack(() => doc.layout.x), y: untrack(() => doc.layout.y), width: untrack(() => doc.layout.width), rotation: untrack(() => doc.layout.rotation ?? 0) });
  let layoutFocused = $state(false);

  // A document dragged on the preview changes its position; show it here unless the boxes are being typed in.
  $effect(() => {
    const l = doc.layout;
    if (layoutFocused) return;
    layout = { x: l.x, y: l.y, width: l.width, rotation: l.rotation ?? 0 };
  });

  const pretty = (name: string) => name.charAt(0).toUpperCase() + name.slice(1).replace(/[-_]/g, ' ');
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
  <p class="kind">{doc.templateName}{#if doc.central} · main document{/if}{#if doc.hidden} · hidden{/if}</p>

  {#if !doc.readable}
    <p class="alert" role="alert">This document's file has a problem, so it cannot be edited here yet. See Problems, fix the file, then reopen the episode.</p>
  {:else}
    {#each doc.slots as slot (slot.name)}
      {#if slot.kind === 'value'}
        <label>
          <span>{pretty(slot.name)}{slot.required ? '' : ' (optional)'}</span>
          <input bind:value={texts[slot.name]} oninput={() => autosave(`text:${slot.name}`, () => window.author.setSlotText(doc.id, slot.name, texts[slot.name]))} />
        </label>
      {:else if slot.kind === 'markdown'}
        <label>
          <span>{pretty(slot.name)}{slot.required ? '' : ' (optional)'}</span>
          <textarea rows="9" bind:value={texts[slot.name]} oninput={() => autosave(`text:${slot.name}`, () => window.author.setSlotText(doc.id, slot.name, texts[slot.name]))}></textarea>
        </label>
      {:else if slot.kind === 'image'}
        <div class="image">
          <span class="label">{pretty(slot.name)}{slot.required ? '' : ' (optional)'}</span>
          <p class="file">{slot.image ? slot.image.file.replace('media/images/', '') : 'No image chosen yet.'}</p>
          <button onclick={() => now(() => window.author.chooseImage(doc.id, slot.name))}>{slot.image ? 'Choose a different image…' : 'Choose image…'}</button>
          {#if slot.image}
            <label>
              <span>Describe the image (for screen readers)</span>
              <input bind:value={alts[slot.name]} oninput={() => autosave(`alt:${slot.name}`, () => window.author.setImageAlt(doc.id, slot.name, alts[slot.name]))} />
            </label>
          {/if}
        </div>
      {:else}
        <p class="help">{pretty(slot.name)}: this part of the document is edited by a later step of the tool.</p>
      {/if}
    {/each}

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
  h3 { font-size: 0.8rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); font-weight: normal; margin: 1.4rem 0 0.5rem; }
  .kind { color: var(--muted); margin: 0.1rem 0 1rem; }
  .back { margin-bottom: 0.3rem; }
  textarea { font: 0.95rem/1.5 Consolas, 'Courier New', monospace; color: inherit; background: #1a1510; border: 1px solid var(--line); border-radius: 4px; padding: 0.5rem; width: 100%; resize: vertical; }
  .label { display: block; margin-bottom: 0.25rem; color: var(--muted); font-size: 0.85rem; }
  .image { margin-bottom: 0.9rem; }
  .file { margin: 0 0 0.4rem; word-break: break-all; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 0.7rem; }
  .help { color: var(--muted); font-size: 0.85rem; margin: 0.3rem 0 0.7rem; }
  .check { display: flex; gap: 0.5rem; align-items: center; margin: 0.8rem 0 0; }
  .check input { width: auto; }
  .check span { margin: 0; color: var(--ink); font-size: inherit; }
  .danger { border-color: #7a3b32; }
  .alert { background: #3b1f1a; border: 1px solid #7a3b32; border-radius: 4px; padding: 0.6rem 0.8rem; }
</style>
