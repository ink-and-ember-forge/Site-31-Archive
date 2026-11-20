<script lang="ts">
  import { onMount } from 'svelte';
  import { slugify } from '@archive/casefile/authoring';
  import type { EpisodeDetails } from '@archive/casefile/authoring';
  import type { EpisodeState, Problem, Result } from '../../src/shared/api';

  let episode = $state<EpisodeState | null>(null);
  let form = $state<EpisodeDetails>({ title: '', submissionDate: '' });
  // Held as text so the box can be emptied; converted to a number (or nothing) on save.
  let orderText = $state('');
  let newTitle = $state('');
  let message = $state('');
  let problems = $state<Problem[]>([]);
  let saveState = $state<'saved' | 'saving' | 'failed'>('saved');
  let previewSrc = $state('');
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  const folderName = $derived(slugify(newTitle));

  function load(state: EpisodeState) {
    episode = state;
    form = { ...state.details };
    orderText = state.details.order === undefined ? '' : String(state.details.order);
    problems = state.problems;
    saveState = 'saved';
    message = '';
  }

  function handle(result: Result<EpisodeState> | null) {
    if (result === null) return; // the author cancelled the folder dialog
    if (result.ok) {
      load(result.value);
      newTitle = '';
    } else {
      message = result.message;
      problems = result.problems ?? [];
    }
  }

  const createEpisode = async () => handle(await window.author.newEpisode(newTitle));
  const openEpisode = async () => handle(await window.author.openEpisode());

  function changed() {
    saveState = 'saving';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400); // wait for a pause in typing
  }

  async function save() {
    const trimmed = orderText.trim();
    const details: EpisodeDetails = {
      title: form.title,
      submissionDate: form.submissionDate,
      folderLabel: form.folderLabel,
      order: trimmed === '' || Number.isNaN(Number(trimmed)) ? undefined : Number(trimmed),
    };
    const result = await window.author.saveDetails(details);
    if (result.ok) {
      problems = result.value.problems;
      saveState = 'saved';
      message = '';
    } else {
      saveState = 'failed';
      message = result.message;
    }
  }

  onMount(() =>
    window.author.onPreview(({ version, id }) => {
      // The viewer opens straight onto this episode's table, without the opening animation, so edits appear at once.
      // The version stops it showing a cached copy.
      previewSrc = `app://viewer/?instant&v=${version}#/${id}`;
    }),
  );
</script>

{#if !episode}
  <main class="welcome">
    <h1>Archive Author</h1>
    <p class="lead">Build an episode without editing any files by hand. Your work is saved as you go, and the preview is the real viewer.</p>

    <section>
      <h2>Start a new episode</h2>
      <label>
        <span>Episode title</span>
        <input bind:value={newTitle} placeholder="For example: The lighthouse statement" onkeydown={(e) => e.key === 'Enter' && folderName && createEpisode()} />
      </label>
      {#if newTitle && folderName}<p class="note">Its folder will be called <code>{folderName}</code>.</p>{/if}
      <button class="primary" disabled={!folderName} onclick={createEpisode}>Create episode…</button>
    </section>

    <section>
      <h2>Or continue one</h2>
      <button onclick={openEpisode}>Open an episode folder…</button>
    </section>

    {#if message}
      <div class="alert" role="alert">
        <p>{message}</p>
        {#each problems as p}
          <p class="problem"><strong>{p.path}</strong><br />{p.message}{#if p.hint}<br /><em>{p.hint}</em>{/if}</p>
        {/each}
      </div>
    {/if}
  </main>
{:else}
  <div class="shell">
    <aside>
      <header>
        <div>
          <strong>{episode.id}</strong>
          <small title={episode.folder}>{episode.folder}</small>
        </div>
        <span class="save {saveState}" role="status">{saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : 'Not saved'}</span>
      </header>

      <div class="actions">
        <button onclick={() => (episode = null)}>New</button>
        <button onclick={openEpisode}>Open…</button>
        <button onclick={() => window.author.revealFolder()}>Show folder</button>
      </div>

      <form onsubmit={(e) => e.preventDefault()}>
        <h2>Episode</h2>
        <label><span>Title</span><input bind:value={form.title} oninput={changed} /></label>
        <label><span>Date of submission</span><input type="date" bind:value={form.submissionDate} oninput={changed} /></label>
        <label><span>Folder label (on the tab)</span><input bind:value={form.folderLabel} oninput={changed} /></label>
        <label><span>Order on the wall (optional)</span><input inputmode="numeric" bind:value={orderText} oninput={changed} /></label>
      </form>

      {#if message}<div class="alert" role="alert">{message}</div>{/if}

      <section class="problems">
        <h2>Problems</h2>
        {#if problems.length === 0}
          <p class="ok">None. This episode opens cleanly.</p>
        {:else}
          <ul>
            {#each problems as p}
              <li class={p.severity}>
                <strong>{p.severity === 'error' ? 'Must fix' : 'Look at'}: {p.path}</strong>
                <span>{p.message}</span>
                {#if p.hint}<em>{p.hint}</em>{/if}
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <p class="publish">To publish: drag this folder into <code>episodes/</code> in the repository on GitHub, open a pull request and merge it.</p>
    </aside>

    <section class="preview" aria-label="Preview">
      {#if previewSrc}
        <iframe title="Preview of the episode, exactly as a reader sees it" src={previewSrc} sandbox="allow-scripts allow-same-origin"></iframe>
      {:else}
        <p class="note">Building the preview…</p>
      {/if}
    </section>
  </div>
{/if}

<style>
  .welcome { max-width: 36rem; margin: 0 auto; padding: 3rem 1.5rem; }
  h1 { font-weight: normal; letter-spacing: 0.12em; text-transform: uppercase; font-size: 1.3rem; margin: 0 0 0.5rem; }
  h2 { font-size: 0.8rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); font-weight: normal; margin: 0 0 0.7rem; }
  .lead { color: var(--muted); margin: 0 0 2rem; }
  .welcome section { margin-bottom: 2rem; }
  .note { color: var(--muted); margin: 0.2rem 0 0.7rem; }
  code { background: #1a1510; padding: 0.05rem 0.3rem; border-radius: 3px; }
  .alert { background: #3b1f1a; border: 1px solid #7a3b32; border-radius: 4px; padding: 0.6rem 0.8rem; margin: 1rem 0; }
  .alert p { margin: 0.2rem 0; }
  .problem { margin-top: 0.6rem; }

  .shell { display: grid; grid-template-columns: 22rem 1fr; height: 100%; }
  aside { background: var(--panel); border-right: 1px solid var(--line); padding: 1rem; overflow: auto; }
  aside header { display: flex; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.8rem; }
  aside header small { display: block; color: var(--muted); max-width: 15rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; }
  .save { font-size: 0.8rem; color: var(--muted); white-space: nowrap; }
  .save.failed { color: var(--error); }
  .actions { display: flex; gap: 0.4rem; margin-bottom: 1.2rem; flex-wrap: wrap; }
  .problems ul { list-style: none; margin: 0; padding: 0; }
  .problems li { border-left: 3px solid var(--warn); padding: 0.3rem 0.6rem; margin-bottom: 0.6rem; background: #2c241c; }
  .problems li.error { border-color: var(--error); }
  .problems li span, .problems li em { display: block; }
  .problems li em { color: var(--muted); }
  .ok { color: var(--muted); }
  .publish { color: var(--muted); font-size: 0.85rem; margin-top: 1.5rem; }
  .preview { background: #1a1510; min-width: 0; }
  iframe { width: 100%; height: 100%; border: 0; display: block; }
  .preview .note { padding: 1rem; }
</style>
