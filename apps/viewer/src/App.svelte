<script lang="ts">
  import { onMount } from 'svelte';
  import type { ArchiveIndexEntry, Theme } from '@archive/casefile';
  import { loadIndex, loadRegistryEntries, loadTheme, openEpisode, type OpenEpisode } from './lib/episode';
  import { createRegistryResolver, type RegistryResolver } from './lib/registry';
  import Wall from './Wall.svelte';
  import Table from './Table.svelte';

  let episodes = $state<ArchiveIndexEntry[]>([]);
  let theme: Theme = { templates: {}, styles: {} };
  let status = $state<'loading' | 'ready' | 'error'>('loading');
  let error = $state('');
  let open = $state<{ entry: ArchiveIndexEntry; episode: OpenEpisode; resolver: RegistryResolver } | null>(null);
  let opening = $state(false);

  const idFromHash = () => decodeURIComponent(location.hash.replace(/^#\/?/, ''));

  async function show(id: string) {
    if (open) open.episode.dispose();
    open = null;
    error = '';
    const entry = episodes.find((e) => e.id === id);
    if (!id || !entry) return;
    opening = true;
    try {
      const episode = await openEpisode(entry, theme);
      open = { entry, episode, resolver: createRegistryResolver(episodes, episode.casefile, loadRegistryEntries) };
    } catch (e) {
      error = `This case file could not be opened. ${e instanceof Error ? e.message : ''}`;
      location.hash = '';
    } finally {
      opening = false;
    }
  }

  onMount(() => {
    (async () => {
      try {
        [{ episodes }, theme] = await Promise.all([loadIndex(), loadTheme()]);
        status = 'ready';
        await show(idFromHash());
      } catch (e) {
        status = 'error';
        error = `The archive could not be loaded. ${e instanceof Error ? e.message : ''}`;
      }
    })();
    const onHash = () => void show(idFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  });
</script>

{#if status === 'loading'}
  <p class="note">Opening the archive…</p>
{:else if status === 'error'}
  <p class="note" role="alert">{error}</p>
{:else if open}
  {#key open.entry.id}
    <Table
      title={open.episode.casefile.manifest.title}
      date={open.episode.casefile.manifest.submissionDate}
      docs={open.episode.docs}
      resolver={open.resolver}
      onback={() => (location.hash = '')}
    />
  {/key}
{:else}
  {#if error}<p class="note" role="alert">{error}</p>{/if}
  {#if opening}<p class="note">Opening folder…</p>{/if}
  <Wall {episodes} onselect={(e) => (location.hash = `/${e.id}`)} />
{/if}

<style>
  :global(body) { margin: 0; background: #2b221b; color: #d9cdb4; font-family: Georgia, serif; }
  .note { text-align: center; padding: 1rem; margin: 0; }
</style>
