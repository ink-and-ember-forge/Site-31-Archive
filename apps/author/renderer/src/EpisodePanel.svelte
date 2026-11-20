<script lang="ts">
  import type { EpisodeDetails } from '@archive/casefile/authoring';
  import type { EpisodeState } from '../../src/shared/api';

  let { episode, form = $bindable(), orderText = $bindable(), onchange, onselect, onadd }: {
    episode: EpisodeState;
    form: EpisodeDetails;
    orderText: string;
    onchange: () => void;
    onselect: (id: string) => void;
    onadd: (template: string, name: string) => void;
  } = $props();

  let template = $state('');
  let name = $state('');
  // The first available type is chosen until the author picks another.
  const chosen = $derived(template || episode.templates[0]?.id || '');
</script>

<form onsubmit={(e) => e.preventDefault()}>
  <h2>Episode</h2>
  <label><span>Title</span><input aria-label="Title" bind:value={form.title} oninput={onchange} /></label>
  <label><span>Date of submission</span><input aria-label="Date of submission" type="date" bind:value={form.submissionDate} oninput={onchange} /></label>
  <label><span>Folder label (on the tab)</span><input aria-label="Folder label (on the tab)" bind:value={form.folderLabel} oninput={onchange} /></label>
  <label><span>Order on the wall (optional)</span><input aria-label="Order on the wall (optional)" inputmode="numeric" bind:value={orderText} oninput={onchange} /></label>
</form>

<section class="documents">
  <h2>Documents</h2>
  <ul>
    {#each episode.documents as doc (doc.id)}
      <li>
        <button class="doc" onclick={() => onselect(doc.id)}>
          <strong>{doc.id}</strong>
          <span>{doc.templateName}</span>
          {#if doc.central}<em class="badge">Main</em>{/if}
          {#if doc.hidden}<em class="badge">Hidden</em>{/if}
        </button>
      </li>
    {/each}
  </ul>

  <div class="add">
    <h3>Add a document</h3>
    <label>
      <span>Type</span>
      <select aria-label="Document type" value={chosen} onchange={(e) => (template = e.currentTarget.value)}>
        {#each episode.templates as t}<option value={t.id}>{t.name}</option>{/each}
      </select>
    </label>
    <label><span>Name</span><input aria-label="Document name" bind:value={name} placeholder="For example: Shopping receipt" onkeydown={(e) => e.key === 'Enter' && onadd(chosen, name)} /></label>
    <button class="primary" disabled={!chosen} onclick={() => { onadd(chosen, name); name = ''; }}>Add document</button>
  </div>
</section>

<style>
  h2 { font-size: 0.8rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); font-weight: normal; margin: 0 0 0.7rem; }
  h3 { font-size: 0.85rem; margin: 1rem 0 0.5rem; font-weight: 600; }
  .documents { margin: 1.4rem 0; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { margin-bottom: 0.4rem; }
  .doc { width: 100%; text-align: left; display: flex; flex-wrap: wrap; gap: 0.2rem 0.6rem; align-items: baseline; }
  .doc span { color: var(--muted); font-size: 0.85rem; }
  .badge { font-style: normal; font-size: 0.7rem; background: #4a3d31; padding: 0.05rem 0.4rem; border-radius: 3px; }
  select { font: inherit; color: inherit; background: #1a1510; border: 1px solid var(--line); border-radius: 4px; padding: 0.4rem 0.5rem; width: 100%; }
</style>
