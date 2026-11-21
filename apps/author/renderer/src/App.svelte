<script lang="ts">
  import { onMount } from 'svelte';
  import type { EpisodeDetails } from '@archive/casefile/authoring';
  import type { EpisodeState, Problem, Result } from '../../src/shared/api';
  import DocumentEditor from './DocumentEditor.svelte';
  import EpisodePanel from './EpisodePanel.svelte';
  import Problems from './Problems.svelte';
  import Welcome from './Welcome.svelte';
  import type { Action } from './lib/actions';

  let episode = $state<EpisodeState | null>(null);
  let selected = $state<string | null>(null); // the document being edited, or null for the episode view
  let form = $state<EpisodeDetails>({ title: '', submissionDate: '' });
  // Held as text so the box can be emptied; converted to a number (or nothing) on save.
  let orderText = $state('');
  let message = $state('');
  let welcomeProblems = $state<Problem[]>([]);
  let saveState = $state<'saved' | 'saving' | 'waiting' | 'failed'>('saved');
  let previewSrc = $state('');
  let previewId = ''; // the episode the preview frame was opened on
  let viewerReady = false; // the viewer has told us its table is on screen
  let focusWanted: string | null = null; // the document the preview should be showing in front, if any
  let previewFrame = $state<HTMLIFrameElement>();
  const timers: Record<string, ReturnType<typeof setTimeout>> = {};

  const selectedDoc = $derived(episode?.documents.find((d) => d.id === selected));

  function load(state: EpisodeState) {
    episode = state;
    selected = null;
    focusWanted = null;
    form = { ...state.details };
    orderText = state.details.order === undefined ? '' : String(state.details.order);
    saveState = 'saved';
    message = '';
  }

  /** Applies a result that opens an episode (new or open). Returns whether one was opened. */
  function opened(result: Result<EpisodeState> | null): boolean {
    if (result === null) return false; // the author cancelled the folder dialog
    if (result.ok) {
      load(result.value);
      return true;
    }
    message = result.message;
    welcomeProblems = result.problems ?? [];
    return false;
  }

  // ---- saving ---------------------------------------------------------------------------------

  function finish(result: Result<EpisodeState> | null | undefined) {
    if (result === undefined) {
      saveState = 'waiting'; // held back until what is being typed is valid
      return;
    }
    if (result === null) return; // cancelled
    if (result.ok) {
      episode = result.value;
      saveState = 'saved';
      message = '';
    } else {
      saveState = 'failed';
      message = result.message;
    }
  }

  async function now(action: Action) {
    saveState = 'saving';
    const result = await action();
    finish(result);
    if (result === null) saveState = 'saved';
    return result;
  }

  /** Runs an action after a pause in typing, so each keystroke is not a save. */
  function autosave(key: string, action: Action) {
    saveState = 'saving';
    clearTimeout(timers[key]);
    timers[key] = setTimeout(async () => finish(await action()), 400);
  }

  const saveDetails = () =>
    autosave('details', () => {
      const trimmed = orderText.trim();
      return window.author.saveDetails({
        title: form.title,
        submissionDate: form.submissionDate,
        folderLabel: form.folderLabel,
        order: trimmed === '' || Number.isNaN(Number(trimmed)) ? undefined : Number(trimmed),
      });
    });

  // ---- the preview -------------------------------------------------------------------------------

  /** Sends a command to the viewer in the preview frame. Only that frame, and only from this window, is trusted. */
  function toViewer(command: { type: 'reload' } | { type: 'focus'; doc: string | null }) {
    previewFrame?.contentWindow?.postMessage({ source: 'archive-author', ...command }, 'app://viewer');
  }

  /** Brings a document to the front of the preview (or puts everything back with null), now or as soon as the viewer is ready. */
  function focusDoc(id: string | null) {
    focusWanted = id;
    if (viewerReady) toViewer({ type: 'focus', doc: id });
  }

  /** Editing a document's content brings it forward so the author can see the edit; editing its position puts the table back so they can see the move. */
  const editAutosave = (key: string, action: Action) => {
    if (key === 'layout') focusDoc(null);
    else if (selected) focusDoc(selected);
    autosave(key, action);
  };

  function select(id: string | null) {
    selected = id;
    focusDoc(id);
  }

  async function addDocument(template: string, name: string) {
    const before = new Set(episode?.documents.map((d) => d.id));
    const result = await now(() => window.author.addDocument(template, name));
    // Go straight to the new document so the author can start filling it in.
    if (result?.ok) select(result.value.documents.find((d) => !before.has(d.id))?.id ?? null);
  }

  // ---- the preview ----------------------------------------------------------------------------

  onMount(() => {
    const stopPreview = window.author.onPreview(({ version, id }) => {
      if (!previewSrc || previewId !== id) {
        // A new episode: open the viewer on it, without the opening animation. The version stops a cached copy showing.
        previewId = id;
        viewerReady = false;
        previewSrc = `app://viewer/?instant&v=${version}#/${id}`;
      } else {
        // The same episode: leave the frame alone and have the viewer reload quietly, so the author's zoom, positions and
        // focus are kept and they can see what the edit did.
        toViewer({ type: 'reload' });
      }
    });

    // The viewer tells us what the author did on the table: clicked a document, or dropped one somewhere new.
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== 'app://viewer' || event.source !== previewFrame?.contentWindow) return;
      const m = event.data as { source?: string; type?: string; doc?: unknown; x?: unknown; y?: unknown };
      if (m?.source !== 'archive-viewer') return;
      if (m.type === 'ready') {
        viewerReady = true;
        toViewer({ type: 'focus', doc: focusWanted });
        return;
      }
      if (typeof m.doc !== 'string' || !episode) return;
      const doc = episode.documents.find((d) => d.id === m.doc);
      if (!doc) return;
      if (m.type === 'select') selected = doc.id;
      else if (m.type === 'layout' && typeof m.x === 'number' && typeof m.y === 'number') {
        // The viewer already shows the move, so the preview is not rebuilt.
        void now(() => window.author.setLayout(doc.id, { ...doc.layout, x: m.x as number, y: m.y as number }, false));
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      stopPreview();
      window.removeEventListener('message', onMessage);
    };
  });
</script>

{#if !episode}
  <Welcome
    {message}
    problems={welcomeProblems}
    onnew={async (title) => opened(await window.author.newEpisode(title))}
    onopen={async () => opened(await window.author.openEpisode())}
  />
{:else}
  <div class="shell">
    <aside>
      <header>
        <div>
          <strong>{episode.id}</strong>
          <small title={episode.folder}>{episode.folder}</small>
        </div>
        <span class="save {saveState}" role="status">{saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : saveState === 'waiting' ? 'Not saved yet' : 'Not saved'}</span>
      </header>

      <div class="actions">
        <button onclick={() => (episode = null)}>New</button>
        <button onclick={async () => opened(await window.author.openEpisode())}>Open…</button>
        <button onclick={() => window.author.revealFolder()}>Show folder</button>
      </div>

      {#if message}<div class="alert" role="alert">{message}</div>{/if}

      {#if selectedDoc}
        {#key selectedDoc.id}
          <DocumentEditor doc={selectedDoc} others={episode.documents.filter((d) => d.id !== selectedDoc.id).map((d) => ({ id: d.id, label: d.hidden ? `${d.id} (hidden)` : d.id }))} registry={episode.registry} autosave={editAutosave} {now} onback={() => select(null)} />
        {/key}
      {:else}
        <EpisodePanel {episode} bind:form bind:orderText onchange={saveDetails} onselect={select} onadd={addDocument} />
      {/if}

      <Problems problems={episode.problems} />

      <p class="publish">To publish: drag this folder into <code>episodes/</code> in the repository on GitHub, open a pull request and merge it.</p>
    </aside>

    <section class="preview" aria-label="Preview">
      {#if previewSrc}
        <iframe bind:this={previewFrame} title="Preview of the episode, exactly as a reader sees it" src={previewSrc} sandbox="allow-scripts allow-same-origin"></iframe>
      {:else}
        <p class="note">Building the preview…</p>
      {/if}
    </section>
  </div>
{/if}

<style>
  .shell { display: grid; grid-template-columns: 29rem 1fr; height: 100%; }
  aside { background: var(--panel); border-right: 1px solid var(--line); padding: 1rem; overflow: auto; }
  aside header { display: flex; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.8rem; }
  aside header small { display: block; color: var(--muted); max-width: 21rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; }
  .save { font-size: 0.8rem; color: var(--muted); white-space: nowrap; }
  .save.failed { color: var(--error); }
  .save.waiting { color: var(--warn); }
  .actions { display: flex; gap: 0.4rem; margin-bottom: 1.2rem; flex-wrap: wrap; }
  .alert { background: #3b1f1a; border: 1px solid #7a3b32; border-radius: 4px; padding: 0.6rem 0.8rem; margin: 0 0 1rem; }
  .publish { color: var(--muted); font-size: 0.85rem; margin-top: 1.5rem; }
  .preview { background: #1a1510; min-width: 0; }
  iframe { width: 100%; height: 100%; border: 0; display: block; }
  .preview .note { padding: 1rem; color: var(--muted); }
</style>
