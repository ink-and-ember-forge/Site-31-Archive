<script lang="ts">
  import { untrack } from 'svelte';
  import type { SlotView } from '../../src/shared/api';
  import { labelOf, type Autosave, type Now } from './lib/actions';
  import ItemsEditor from './ItemsEditor.svelte';

  let { docId, slot, tall = false, autosave, now }: { docId: string; slot: SlotView; tall?: boolean; autosave: Autosave; now: Now } = $props();

  // What is typed is kept here so a save finishing never moves the cursor or overwrites typing.
  let text = $state(untrack(() => slot.text));
  let alt = $state(untrack(() => slot.image?.alt ?? ''));
  const label = $derived(labelOf(slot));
</script>

{#if slot.kind === 'value'}
  <label>
    <span>{label}</span>
    <input bind:value={text} oninput={() => autosave(`text:${slot.name}`, () => window.author.setSlotText(docId, slot.name, text))} />
  </label>
{:else if slot.kind === 'markdown'}
  <label>
    <span>{label}</span>
    <textarea rows={tall ? 12 : 3} bind:value={text} oninput={() => autosave(`text:${slot.name}`, () => window.author.setSlotText(docId, slot.name, text))}></textarea>
  </label>
{:else if slot.kind === 'image'}
  <div class="image">
    <span class="label">{label}</span>
    <p class="file">{slot.image ? slot.image.file.replace('media/images/', '') : 'No image chosen yet.'}</p>
    <button onclick={() => now(() => window.author.chooseImage(docId, slot.name))}>{slot.image ? 'Choose a different image…' : 'Choose image…'}</button>
    {#if slot.image}
      <label>
        <span>Describe the image (for screen readers)</span>
        <input bind:value={alt} oninput={() => autosave(`alt:${slot.name}`, () => window.author.setImageAlt(docId, slot.name, alt))} />
      </label>
    {/if}
  </div>
{:else if slot.kind === 'items'}
  <ItemsEditor {docId} {slot} {label} {autosave} {now} />
{:else}
  <p class="help">{label}: this part of the document is not edited in the tool yet.</p>
{/if}

<style>
  textarea { font: 0.95rem/1.5 Consolas, 'Courier New', monospace; color: inherit; background: #1a1510; border: 1px solid var(--line); border-radius: 4px; padding: 0.5rem; width: 100%; resize: vertical; }
  .label { display: block; margin-bottom: 0.25rem; color: var(--muted); font-size: 0.85rem; }
  .image { margin-bottom: 0.9rem; }
  .file { margin: 0 0 0.4rem; word-break: break-all; }
  .help { color: var(--muted); font-size: 0.85rem; margin: 0.3rem 0 0.7rem; }
</style>
