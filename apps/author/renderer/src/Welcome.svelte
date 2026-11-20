<script lang="ts">
  import { slugify } from '@archive/casefile/authoring';
  import type { Problem } from '../../src/shared/api';

  let { message, problems, onnew, onopen }: {
    message: string;
    problems: Problem[];
    onnew: (title: string) => void;
    onopen: () => void;
  } = $props();

  let title = $state('');
  const folderName = $derived(slugify(title));
</script>

<main class="welcome">
  <h1>Archive Author</h1>
  <p class="lead">Build an episode without editing any files by hand. Your work is saved as you go, and the preview is the real viewer.</p>

  <section>
    <h2>Start a new episode</h2>
    <label>
      <span>Episode title</span>
      <input bind:value={title} placeholder="For example: The lighthouse statement" onkeydown={(e) => e.key === 'Enter' && folderName && onnew(title)} />
    </label>
    {#if title && folderName}<p class="note">Its folder will be called <code>{folderName}</code>.</p>{/if}
    <button class="primary" disabled={!folderName} onclick={() => onnew(title)}>Create episode…</button>
  </section>

  <section>
    <h2>Or continue one</h2>
    <button onclick={onopen}>Open an episode folder…</button>
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

<style>
  .welcome { max-width: 36rem; margin: 0 auto; padding: 3rem 1.5rem; }
  h1 { font-weight: normal; letter-spacing: 0.12em; text-transform: uppercase; font-size: 1.3rem; margin: 0 0 0.5rem; }
  h2 { font-size: 0.8rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); font-weight: normal; margin: 0 0 0.7rem; }
  .lead { color: var(--muted); margin: 0 0 2rem; }
  section { margin-bottom: 2rem; }
  .note { color: var(--muted); margin: 0.2rem 0 0.7rem; }
  .alert { background: #3b1f1a; border: 1px solid #7a3b32; border-radius: 4px; padding: 0.6rem 0.8rem; margin: 1rem 0; }
  .alert p { margin: 0.2rem 0; }
  .problem { margin-top: 0.6rem; }
</style>
