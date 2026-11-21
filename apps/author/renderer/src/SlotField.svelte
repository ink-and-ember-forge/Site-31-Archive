<script lang="ts">
  import { untrack } from 'svelte';
  import type { SlotView } from '../../src/shared/api';
  import { labelOf, type Autosave, type Now } from './lib/actions';
  import { makeClickable, newTextHotspot } from '@archive/casefile/authoring';
  import ItemsEditor from './ItemsEditor.svelte';

  let {
    docId,
    slot,
    tall = false,
    takenIds = [],
    autosave,
    now,
    resync = 0,
    onhotspot,
  }: { docId: string; slot: SlotView; tall?: boolean; takenIds?: string[]; resync?: number; autosave: Autosave; now: Now; onhotspot?: (id: string) => void } = $props();

  // What is typed is kept here so a save finishing never moves the cursor or overwrites typing.
  let text = $state(untrack(() => slot.text));
  let area = $state<HTMLTextAreaElement>();
  let clickableMessage = $state('');
  // When a change made elsewhere has altered this text (a clickable part removed, so its marks come off the words), the
  // form says so by bumping `resync`. Only then is the text taken from the document again, never on an ordinary refresh,
  // which could be a moment behind what is being typed.
  let lastResync = untrack(() => resync);
  $effect(() => {
    if (resync !== lastResync) {
      lastResync = resync;
      untrack(() => (text = slot.text));
    }
  });

  async function makeSelectionClickable() {
    clickableMessage = '';
    if (!area) return;
    const result = makeClickable(text, area.selectionStart, area.selectionEnd, takenIds);
    if (!result.ok) {
      clickableMessage = result.reason;
      return;
    }
    const saved = await now(() => window.author.addTextHotspot(docId, slot.name, result.text, newTextHotspot(result.id, slot.name)));
    if (saved?.ok) {
      text = result.text;
      onhotspot?.(result.id);
    }
  }
  let alt = $state(untrack(() => slot.image?.alt ?? ''));
  const label = $derived(labelOf(slot));
</script>

{#if slot.kind === 'value'}
  <label>
    <span>{label}</span>
    <input bind:value={text} maxlength={slot.maxLength} oninput={() => autosave(`text:${slot.name}`, () => window.author.setSlotText(docId, slot.name, text))} />
    {#if slot.maxLength}<small class="count">{text.length} of {slot.maxLength} characters</small>{/if}
  </label>
{:else if slot.kind === 'markdown'}
  <label>
    <span>{label}</span>
    <textarea bind:this={area} rows={tall ? 12 : 3} bind:value={text} oninput={() => autosave(`text:${slot.name}`, () => window.author.setSlotText(docId, slot.name, text))}></textarea>
  </label>
  <div class="clickable">
    <!-- Keeps the selection in the text box when the button is pressed. -->
    <button class="small" aria-label="Make the selected words in {label} clickable" onmousedown={(e) => e.preventDefault()} onclick={makeSelectionClickable}>Make selected words clickable</button>
    {#if clickableMessage}<span class="reason" role="alert">{clickableMessage}</span>{/if}
  </div>
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
  .clickable { margin: -0.4rem 0 0.9rem; display: flex; gap: 0.6rem; align-items: baseline; flex-wrap: wrap; }
  .reason { color: var(--warn); font-size: 0.82rem; }
  .count { display: block; margin-top: 0.2rem; color: var(--muted); font-size: 0.75rem; }
  .label { display: block; margin-bottom: 0.25rem; color: var(--muted); font-size: 0.85rem; }
  .image { margin-bottom: 0.9rem; }
  .file { margin: 0 0 0.4rem; word-break: break-all; }
  .help { color: var(--muted); font-size: 0.85rem; margin: 0.3rem 0 0.7rem; }
</style>
