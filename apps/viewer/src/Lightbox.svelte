<script lang="ts">
  import type { LightboxContent } from './lib/episode';
  import { trapFocus } from './lib/focus';
  import { STRINGS } from './lib/strings';
  import Rich from './Rich.svelte';

  let { content, onclose }: { content: LightboxContent; onclose: () => void } = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <div class="card" role="dialog" tabindex="-1" aria-modal="true" aria-label={content.title ?? STRINGS.noteTitle} use:trapFocus onclick={(e) => e.stopPropagation()}>
    <header>
      <h2>{content.title ?? STRINGS.noteTitle}</h2>
      <button type="button" data-autofocus onclick={onclose}>{STRINGS.close}</button>
    </header>
    <Rich blocks={content.blocks} />
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; z-index: 2000; display: grid; place-items: center; background: rgba(0, 0, 0, 0.65); padding: 1rem; }
  .card { background: #f4efe1; color: #222; max-width: 32rem; width: 100%; max-height: 80vh; overflow: auto; padding: 1.2rem 1.5rem;
          box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.6); font-family: Georgia, serif; }
  header { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; margin-bottom: 0.8rem; }
  h2 { margin: 0; font-size: 1.1rem; }
  button { font: inherit; cursor: pointer; padding: 0.2rem 0.7rem; border: 1px solid #8a7a5a; background: transparent; color: inherit; border-radius: 0.3rem; }
  button:focus-visible { outline: 2px solid #1d4ed8; }
</style>
