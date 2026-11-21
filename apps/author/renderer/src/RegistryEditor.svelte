<script lang="ts">
  import { untrack } from 'svelte';
  import type { RegistryView } from '../../src/shared/api';
  import type { Autosave, Now } from './lib/actions';
  import { buildEntry, describeReference, draftFromEntry, KIND_SUGGESTIONS, moveItem, newField, newReference } from './lib/registry';

  let {
    entry,
    entries,
    documentLabels,
    autosave,
    now,
    onback,
    onselectentry,
    onselectdoc,
  }: {
    entry: RegistryView;
    entries: RegistryView[];
    /** Document ids, so a hotspot that opens this entry can be named. */
    documentLabels: Record<string, string>;
    autosave: Autosave;
    now: Now;
    onback: () => void;
    onselectentry: (id: string) => void;
    onselectdoc: (id: string) => void;
  } = $props();

  // What is typed lives here, so a save finishing never moves the cursor or overwrites typing.
  let draft = $state(untrack(() => draftFromEntry(entry)));
  const built = $derived(buildEntry(draft));
  const kinds = $derived([...new Set([...entries.map((e) => e.kind).filter(Boolean), ...KIND_SUGGESTIONS])]);
  const others = $derived(entries.filter((e) => e.id !== entry.id));
  let pick = $state('');

  const changed = () =>
    autosave(`registry:${entry.id}`, () => {
      const result = buildEntry(draft);
      return result.edit ? window.author.setRegistryEntry(entry.id, result.edit) : undefined; // held until valid
    });

  const addField = () => draft.fields.push(newField());
  function removeField(key: number) {
    draft.fields = draft.fields.filter((f) => f.key !== key);
    changed();
  }
  function moveField(key: number, by: -1 | 1) {
    draft.fields = moveItem(draft.fields, key, by);
    changed();
  }
  const addReference = () => draft.references.push(newReference());
  function addPicked() {
    if (!pick) return;
    if (!draft.references.some((r) => r.text.trim() === pick)) draft.references.push(newReference(pick));
    pick = '';
    changed();
  }
  function removeReference(key: number) {
    draft.references = draft.references.filter((r) => r.key !== key);
    changed();
  }

  async function remove() {
    const n = entry.referencedBy.length;
    const warning = n > 0 ? ` It is opened or linked to in ${n} place${n === 1 ? '' : 's'}, which will then show “no record on file”.` : '';
    if (!confirm(`Remove “${entry.title}”? Its file is deleted from the episode folder. This cannot be undone.${warning}`)) return;
    const result = await now(() => window.author.removeRegistryEntry(entry.id));
    if (result?.ok) onback();
  }
</script>

<div class="editor">
  <button class="back" onclick={onback}>← Episode</button>
  <h2>{entry.title}</h2>
  <p class="kind">Registry entry · <code>{entry.globalId}</code></p>

  {#if !entry.readable}
    <p class="alert" role="alert">This entry's file has a problem, so it cannot be edited here yet. See Problems, fix the file, then reopen the episode.</p>
  {:else}
    <p class="help">The archive answering back: what a reader sees when something opens this entry. The id above is fixed, because other entries and episodes refer to it.</p>

    <label>
      <span>Title</span>
      <input aria-label="Entry title" bind:value={draft.title} oninput={changed} aria-invalid={built.titleError ? 'true' : undefined} />
    </label>
    {#if built.titleError}<p class="error" role="alert">{built.titleError}</p>{/if}
    <label>
      <span>Kind</span>
      <input aria-label="Entry kind" list="kinds" bind:value={draft.kind} oninput={changed} aria-invalid={built.kindError ? 'true' : undefined} />
      <datalist id="kinds">{#each kinds as k}<option value={k}></option>{/each}</datalist>
    </label>
    {#if built.kindError}<p class="error" role="alert">{built.kindError}</p>{/if}

    <h3>Fields</h3>
    <p class="help">Labelled facts, like a database record: First reported, 2026-03-14.</p>
    {#each draft.fields as f, i (f.key)}
      <div class="row">
        <input class="label" aria-label="Field {i + 1} label" placeholder="Label" bind:value={f.label} oninput={changed} aria-invalid={built.fieldErrors[f.key] ? 'true' : undefined} />
        <input class="value" aria-label="Field {i + 1} value" placeholder="Value" bind:value={f.value} oninput={changed} />
        <button class="small" aria-label="Move field {i + 1} up" disabled={i === 0} onclick={() => moveField(f.key, -1)}>↑</button>
        <button class="small" aria-label="Move field {i + 1} down" disabled={i === draft.fields.length - 1} onclick={() => moveField(f.key, 1)}>↓</button>
        <button class="small" aria-label="Remove field {i + 1}" onclick={() => removeField(f.key)}>×</button>
      </div>
      {#if built.fieldErrors[f.key]}<p class="error" role="alert">Field {i + 1}: {built.fieldErrors[f.key]}</p>{/if}
    {/each}
    <button onclick={addField}>Add field</button>

    <h3>Text</h3>
    <label>
      <span class="sr">Entry text</span>
      <textarea rows="7" aria-label="Entry text" bind:value={draft.body} oninput={changed}></textarea>
    </label>

    <h3>Links to other entries</h3>
    <p class="help">The reader follows these from inside the overlay. An entry from an episode that is not published yet is fine: it shows as a redacted “no record on file”.</p>
    {#each draft.references as r, i (r.key)}
      <div class="row">
        <input class="value" aria-label="Reference {i + 1}" placeholder="episode-id/entry-id" bind:value={r.text} oninput={changed} aria-invalid={built.referenceErrors[r.key] ? 'true' : undefined} />
        <button class="small" aria-label="Remove reference {i + 1}" onclick={() => removeReference(r.key)}>×</button>
      </div>
      <p class="resolved">{r.text.trim() ? describeReference(r.text, entries) : ''}</p>
      {#if built.referenceErrors[r.key]}<p class="error" role="alert">Reference {i + 1}: {built.referenceErrors[r.key]}</p>{/if}
    {/each}
    <div class="row">
      <select aria-label="Add a reference from this episode" bind:value={pick} onchange={addPicked}>
        <option value="">Add an entry from this episode…</option>
        {#each others as o (o.globalId)}<option value={o.globalId}>{o.title}</option>{/each}
      </select>
      <button onclick={addReference}>Type another</button>
    </div>
    {#if built.held > 0}<p class="held">Not saved yet: finish what is marked above. Nothing is lost, and it saves as soon as it is valid.</p>{/if}

    <h3>Used by</h3>
    {#if entry.referencedBy.length === 0}
      <p class="help">Nothing opens or links to this entry yet. Make words clickable in a document and choose this entry, or link to it from another entry.</p>
    {:else}
      <ul class="used">
        {#each entry.referencedBy as u}
          <li>
            {#if u.type === 'hotspot'}
              Clickable part “{u.detail}” in <button class="link" onclick={() => onselectdoc(u.id)}>{documentLabels[u.id] ?? u.id}</button>
            {:else}
              Linked from <button class="link" onclick={() => onselectentry(u.id)}>{entries.find((e) => e.id === u.id)?.title ?? u.id}</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {/if}

  <h3>Remove</h3>
  <button class="danger" onclick={remove}>Remove this entry…</button>
</div>

<style>
  h2 { margin: 0.6rem 0 0; font-size: 1.1rem; }
  h3 { font-size: 0.8rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); font-weight: normal; margin: 1.4rem 0 0.5rem; }
  .kind { color: var(--muted); margin: 0 0 0.8rem; }
  .row { display: flex; gap: 0.4rem; align-items: center; margin: 0 0 0.35rem; }
  .row .label { flex: 0 0 8rem; }
  .row .value { flex: 1; min-width: 0; }
  .row input, .row select { padding: 0.3rem 0.4rem; }
  select, textarea { font: inherit; color: inherit; background: #1a1510; border: 1px solid var(--line); border-radius: 4px; width: 100%; }
  textarea { padding: 0.5rem; resize: vertical; font: 0.95rem/1.5 Consolas, 'Courier New', monospace; }
  .help { color: var(--muted); font-size: 0.85rem; margin: 0.3rem 0 0.7rem; }
  .resolved { color: var(--muted); font-size: 0.78rem; margin: -0.2rem 0 0.4rem 0.2rem; }
  .error { color: var(--error); font-size: 0.8rem; margin: 0 0 0.6rem; }
  .held { color: var(--warn); font-size: 0.8rem; margin: 0.5rem 0; }
  .alert { color: var(--warn); }
  input[aria-invalid='true'] { border-color: var(--error); }
  .sr { position: absolute; left: -9999px; }
  .used { list-style: none; margin: 0; padding: 0; font-size: 0.9rem; }
  .used li { margin-bottom: 0.3rem; }
  .link { background: none; border: 0; color: inherit; text-decoration: underline; padding: 0; cursor: pointer; font: inherit; }
</style>
