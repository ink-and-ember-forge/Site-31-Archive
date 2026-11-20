<script lang="ts">
  import { untrack } from 'svelte';
  import type { RegistryEntry } from '@archive/casefile';
  import { trapFocus } from './lib/focus';
  import { parseMarkdown } from './lib/markdown';
  import type { RegistryResolver } from './lib/registry';
  import { STRINGS } from './lib/strings';
  import Rich from './Rich.svelte';

  let { startId, resolver, onclose }: { startId: string; resolver: RegistryResolver; onclose: () => void } = $props();

  // Entries are only reached by following hotspots and cross-references, never by free search.
  let trail = $state<string[]>([untrack(() => startId)]);
  const currentId = $derived(trail[trail.length - 1]);

  let typed = $state('');
  let phase = $state<'typing' | 'searching' | 'done'>('typing');
  let entry = $state<RegistryEntry | null>(null);
  let onFile = $state<Record<string, boolean>>({});

  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const body = $derived(entry?.body ? parseMarkdown(entry.body) : []);

  // Each lookup "runs": the query types out, a short search beat, then the record appears.
  $effect(() => {
    const id = currentId;
    let cancelled = false;
    const timers: number[] = [];
    typed = '';
    phase = 'typing';
    entry = null;
    onFile = {};
    const query = `${STRINGS.queryPrefix} ${id}`;
    const lookup = resolver.resolve(id);

    const finish = async () => {
      const found = await lookup;
      if (cancelled) return;
      entry = found;
      phase = 'done';
      for (const ref of found?.references ?? []) {
        void resolver.resolve(ref).then((hit) => {
          if (!cancelled) onFile[ref] = hit !== null;
        });
      }
    };

    if (reduced) {
      typed = query;
      void finish();
    } else {
      let i = 0;
      const type = () => {
        if (cancelled) return;
        typed = query.slice(0, ++i);
        if (i < query.length) timers.push(window.setTimeout(type, 22));
        else {
          phase = 'searching';
          timers.push(window.setTimeout(() => void finish(), 450));
        }
      };
      type();
    }
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <div class="panel" role="dialog" tabindex="-1" aria-modal="true" aria-label={STRINGS.registryTitle} use:trapFocus onclick={(e) => e.stopPropagation()}>
    <header>
      <span class="title">{STRINGS.registryTitle}</span>
      <span class="actions">
        {#if trail.length > 1}
          <button type="button" onclick={() => (trail = trail.slice(0, -1))}>{STRINGS.back}</button>
        {/if}
        <button type="button" data-autofocus onclick={onclose}>{STRINGS.close}</button>
      </span>
    </header>

    <p class="query" aria-live="polite">{typed}{#if phase !== 'done'}<span class="cursor">▌</span>{/if}</p>

    {#if phase === 'searching'}
      <p class="status">{STRINGS.searching}…</p>
    {:else if phase === 'done'}
      {#if entry}
        <article class="record">
          <p class="kind">{entry.kind} · {entry.globalId}</p>
          <h2>{entry.title}</h2>
          {#if entry.fields.length > 0}
            <dl>
              {#each entry.fields as f}<dt>{f.label}</dt><dd>{f.value}</dd>{/each}
            </dl>
          {/if}
          <div class="body"><Rich blocks={body} /></div>
          {#if entry.references.length > 0}
            <h3>{STRINGS.crossRefs}</h3>
            <ul>
              {#each entry.references as ref}
                <li>
                  {#if onFile[ref] === true}
                    <button type="button" class="link" onclick={() => (trail = [...trail, ref])}>{ref}</button>
                  {:else if onFile[ref] === false}
                    <span class="redacted" title={ref}>{STRINGS.notOnFile}</span>
                  {:else}
                    <span class="status">…</span>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </article>
      {:else}
        <p class="status">{STRINGS.noMatch}</p>
      {/if}
    {/if}
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 2000; display: grid; place-items: center; background: rgba(0, 0, 0, 0.7); padding: 1rem; }
  .panel { background: #16130f; color: #e3c987; border: 1px solid #6b5a2f; width: 100%; max-width: 38rem; max-height: 85vh; overflow: auto;
           padding: 1rem 1.4rem 1.4rem; font-family: 'Courier New', monospace; box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.7); }
  header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #6b5a2f; padding-bottom: 0.5rem; margin-bottom: 0.8rem; }
  .title { letter-spacing: 0.15em; font-size: 0.85rem; }
  .actions { display: flex; gap: 0.5rem; }
  button { font: inherit; font-size: 0.85rem; cursor: pointer; padding: 0.15rem 0.6rem; border: 1px solid #6b5a2f; background: transparent; color: inherit; }
  button:hover { background: #2a2314; }
  button:focus-visible { outline: 2px solid #fff; }
  .query { margin: 0 0 0.8rem; word-break: break-all; }
  .cursor { animation: blink 1s steps(2) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  .status { opacity: 0.7; margin: 0; }
  .kind { margin: 0; font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.7; }
  h2 { margin: 0.2rem 0 0.8rem; font-size: 1.15rem; font-weight: normal; }
  h3 { margin: 1.2rem 0 0.4rem; font-size: 0.8rem; letter-spacing: 0.12em; font-weight: normal; opacity: 0.8; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.2rem 1rem; margin: 0 0 0.8rem; }
  dt { opacity: 0.7; }
  dd { margin: 0; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { margin: 0.2rem 0; }
  .link { border: 0; padding: 0; text-decoration: underline; word-break: break-all; }
  .redacted { background: #e3c987; color: #e3c987; user-select: none; padding: 0 0.3rem; }
  .redacted:hover { color: #16130f; }
  @media (prefers-reduced-motion: reduce) { .cursor { animation: none; } }
</style>
