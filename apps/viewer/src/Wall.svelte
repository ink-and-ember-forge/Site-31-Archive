<script lang="ts">
  import type { ArchiveIndexEntry } from '@archive/casefile';
  let { episodes, onselect }: { episodes: ArchiveIndexEntry[]; onselect: (e: ArchiveIndexEntry) => void } = $props();
</script>

<main class="wall">
  <h1>Site 31 Archive</h1>
  {#if episodes.length === 0}
    <p class="empty">The archive is empty.</p>
  {:else}
    <ul>
      {#each episodes as ep (ep.id)}
        <li>
          <button class="folder" onclick={() => onselect(ep)}>
            <span class="tab">{ep.folderLabel ?? ''}</span>
            <span class="face">
              <span class="title">{ep.title}</span>
              <span class="date">Submitted {ep.submissionDate}</span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</main>

<style>
  .wall { min-height: 100vh; padding: 2rem 1.5rem 4rem; box-sizing: border-box; }
  h1 { margin: 0 0 2rem; font-weight: normal; letter-spacing: 0.15em; text-transform: uppercase; font-size: 1.1rem; text-align: center; color: #d9cdb4; }
  .empty { text-align: center; color: #a89c85; }
  ul { list-style: none; margin: 0 auto; padding: 0; display: grid; gap: 2rem 1.5rem; max-width: 70rem;
       grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); }
  .folder { all: unset; cursor: pointer; display: block; width: 100%; position: relative; padding-top: 1.4rem; }
  .folder:focus-visible .face { outline: 3px solid #fff; }
  .tab { position: absolute; top: 0; left: 8%; min-width: 38%; max-width: 60%; height: 1.4rem; box-sizing: border-box; padding: 0.15rem 0.6rem;
         background: #dcb86b; border-radius: 0.4rem 0.4rem 0 0; font-size: 0.7rem; color: #5a4520; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .face { display: flex; flex-direction: column; justify-content: space-between; aspect-ratio: 3 / 4; padding: 1rem; box-sizing: border-box;
          background: linear-gradient(#e8c981, #dcb86b); border-radius: 0 0.4rem 0.4rem 0.4rem; color: #3a2d12; box-shadow: 0 0.4rem 1rem rgba(0, 0, 0, 0.5);
          transition: transform 0.2s ease; }
  .folder:hover .face { transform: translateY(-0.4rem) rotate(-1deg); }
  .title { font-weight: bold; line-height: 1.25; }
  .date { font-size: 0.8rem; opacity: 0.8; }
  @media (prefers-reduced-motion: reduce) { .face { transition: none; } .folder:hover .face { transform: none; } }
</style>
