<script lang="ts">
  import type { Problem } from '../../src/shared/api';
  import { targetOfPath } from './lib/registry';
  let { problems, onjump }: { problems: Problem[]; onjump?: (target: ReturnType<typeof targetOfPath>) => void } = $props();
</script>

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
          {#if onjump && targetOfPath(p.path)}<button class="small go" onclick={() => onjump(targetOfPath(p.path))}>Go to it</button>{/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  h2 { font-size: 0.8rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); font-weight: normal; margin: 0 0 0.7rem; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { border-left: 3px solid var(--warn); padding: 0.3rem 0.6rem; margin-bottom: 0.6rem; background: #2c241c; }
  li.error { border-color: var(--error); }
  li span, li em { display: block; }
  li em { color: var(--muted); }
  .go { margin-top: 0.3rem; }
  .ok { color: var(--muted); margin: 0; }
</style>
