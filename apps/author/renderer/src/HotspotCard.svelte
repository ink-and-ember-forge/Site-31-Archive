<script lang="ts">
  import { untrack } from 'svelte';
  import type { Hotspot } from '@archive/casefile';
  import type { HotspotView, RegistryView } from '../../src/shared/api';
  import type { Autosave, Now } from './lib/actions';

  let {
    docId,
    hotspot,
    others,
    registry,
    startOpen = false,
    autosave,
    now,
    onremove,
  }: {
    docId: string;
    hotspot: HotspotView;
    others: { id: string; label: string }[];
    registry: RegistryView[];
    startOpen?: boolean;
    autosave: Autosave;
    now: Now;
    onremove: (hotspot: HotspotView) => void;
  } = $props();

  // Whether the card is open is remembered here, so a change elsewhere on the form (another card made) never closes it.
  let isOpen = $state(untrack(() => startOpen));
  // A card made just now opens (it can be made a moment before the form is told so), but nothing here ever closes it.
  $effect(() => {
    if (startOpen) isOpen = true;
  });

  // What is typed lives here, so a save finishing never moves the cursor or overwrites typing.
  const t = untrack(() => hotspot.target);
  let kind = $state<'lightbox' | 'document' | 'registry'>(untrack(() => hotspot.target.type));
  let variant = $state<'formal' | 'note'>(t.type === 'lightbox' && t.variant === 'note' ? 'note' : 'formal');
  let title = $state(t.type === 'lightbox' ? (t.title ?? '') : '');
  let noteText = $state(untrack(() => hotspot.noteText ?? ''));
  let document = $state(t.type === 'document' ? t.document : '');
  let entry = $state(t.type === 'registry' ? t.entry : '');
  let rect = $state(
    untrack(() => (hotspot.anchor.type === 'rect' ? { x: hotspot.anchor.x, y: hotspot.anchor.y, width: hotspot.anchor.width, height: hotspot.anchor.height } : { x: 0, y: 0, width: 0.1, height: 0.1 })),
  );
  const isBox = $derived(hotspot.anchor.type === 'rect');
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  /** What this card's boxes say, as a hotspot. Null while it is not complete (nothing is saved until it is). */
  function build(): Hotspot | null {
    let target: Hotspot['target'];
    if (kind === 'lightbox') {
      target = { type: 'lightbox', variant, ...(title.trim() ? { title: title.trim() } : {}), text: noteText };
    } else if (kind === 'document') {
      if (!document) return null;
      target = { type: 'document', document };
    } else {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9]+(-[a-z0-9]+)*$/.test(entry.trim())) return null;
      target = { type: 'registry', entry: entry.trim() };
    }
    const anchor = hotspot.anchor.type === 'rect' ? { type: 'rect' as const, x: num(rect.x), y: num(rect.y), width: num(rect.width), height: num(rect.height) } : $state.snapshot(hotspot.anchor);
    return { id: hotspot.id, anchor, target };
  }

  const changed = () =>
    autosave(`hotspot:${hotspot.id}`, () => {
      const built = build();
      return built ? window.author.setHotspot(docId, built) : undefined; // held until the target is complete
    });

  const incomplete = $derived(build() === null);
  const known = $derived(registry.some((r) => r.globalId === entry.trim()));
  const summary = $derived(
    kind === 'lightbox' ? (variant === 'note' ? 'Handwritten note' : 'Marginal note') : kind === 'document' ? 'Opens a document' : 'Opens a registry entry',
  );
</script>

<details class="card" open={isOpen} ontoggle={(e) => (isOpen = e.currentTarget.open)} data-hotspot={hotspot.id}>
  <summary>
    <span class="what">{isBox ? 'Box on the page' : hotspot.words !== undefined ? `“${hotspot.words}”` : hotspot.id}</span>
    <span class="kind">{summary}</span>
  </summary>

  {#if !hotspot.valid}
    <p class="alert" role="alert">This clickable part's file entry is not valid, so the reader would skip it. Choose what it opens below to repair it.</p>
  {:else if !isBox && hotspot.words === undefined}
    <p class="alert" role="alert">The marked words are no longer in the text, so this will not work. Put the words back, or remove this clickable part.</p>
  {/if}

  <label>
    <span>What it opens</span>
    <select aria-label="What {hotspot.id} opens" bind:value={kind} onchange={changed}>
      <option value="lightbox">A marginal note beside the document</option>
      <option value="document">Another document on the table</option>
      <option value="registry">A registry entry (the archive answers)</option>
    </select>
  </label>

  {#if kind === 'lightbox'}
    <label>
      <span>Style</span>
      <select aria-label="Note style for {hotspot.id}" bind:value={variant} onchange={changed}>
        <option value="formal">Formal: a slim typed card</option>
        <option value="note">Handwritten, on the table</option>
      </select>
    </label>
    <label>
      <span>Title (optional)</span>
      <input aria-label="Note title for {hotspot.id}" bind:value={title} oninput={changed} />
    </label>
    <label>
      <span>Note</span>
      <textarea rows="4" aria-label="Note text for {hotspot.id}" bind:value={noteText} oninput={changed}></textarea>
    </label>
  {:else if kind === 'document'}
    <label>
      <span>Document</span>
      <select aria-label="Document opened by {hotspot.id}" bind:value={document} onchange={changed}>
        <option value="">Choose a document…</option>
        {#each others as d (d.id)}<option value={d.id}>{d.label}</option>{/each}
      </select>
    </label>
    <p class="help">Usually a hidden document: it stays off the table until this opens it. Hide one from its own page.</p>
  {:else}
    <label>
      <span>Registry entry</span>
      <select aria-label="Registry entry opened by {hotspot.id}" value={known ? entry.trim() : ''} onchange={(e) => { if (e.currentTarget.value) { entry = e.currentTarget.value; changed(); } }}>
        <option value="">Choose from this episode…</option>
        {#each registry as r (r.globalId)}<option value={r.globalId}>{r.title}</option>{/each}
      </select>
    </label>
    <label>
      <span>Or type another episode's entry, as episode-id/entry-id</span>
      <input aria-label="Registry entry id for {hotspot.id}" bind:value={entry} oninput={changed} placeholder="episode-id/entry-id" />
    </label>
    {#if entry.trim() !== '' && incomplete}<p class="alert" role="alert">Write it as episode-id/entry-id, using lowercase letters, numbers and hyphens.</p>{/if}
    <p class="help">An entry that is not published yet is fine: the reader sees a redacted “no record on file”.</p>
  {/if}

  {#if isBox}
    <div class="box">
      <label><span>Left</span><input type="number" step="0.01" min="0" max="1" aria-label="Box left for {hotspot.id}" bind:value={rect.x} oninput={changed} /></label>
      <label><span>Top</span><input type="number" step="0.01" min="0" max="1" aria-label="Box top for {hotspot.id}" bind:value={rect.y} oninput={changed} /></label>
      <label><span>Width</span><input type="number" step="0.01" min="0.01" max="1" aria-label="Box width for {hotspot.id}" bind:value={rect.width} oninput={changed} /></label>
      <label><span>Height</span><input type="number" step="0.01" min="0.01" max="1" aria-label="Box height for {hotspot.id}" bind:value={rect.height} oninput={changed} /></label>
    </div>
    <p class="help">Fractions of the document: 0 is the left or top edge, 1 the right or bottom.</p>
  {/if}

  <button class="danger" onclick={() => onremove(hotspot)}>Remove this clickable part…</button>
</details>

<style>
  .card { border: 1px solid var(--line); border-radius: 4px; padding: 0.4rem 0.7rem 0.7rem; margin: 0 0 0.6rem; background: #241d17; }
  summary { cursor: pointer; display: flex; justify-content: space-between; gap: 0.6rem; align-items: baseline; padding: 0.2rem 0; }
  .what { font-weight: 600; overflow-wrap: anywhere; }
  .kind { color: var(--muted); font-size: 0.78rem; white-space: nowrap; }
  select, textarea { font: inherit; color: inherit; background: #1a1510; border: 1px solid var(--line); border-radius: 4px; padding: 0.4rem 0.5rem; width: 100%; }
  textarea { resize: vertical; }
  .box { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.4rem; }
  .help { color: var(--muted); font-size: 0.82rem; margin: 0.3rem 0 0.7rem; }
  .alert { color: var(--warn); font-size: 0.85rem; margin: 0.4rem 0; }
  .danger { margin-top: 0.4rem; }
</style>
