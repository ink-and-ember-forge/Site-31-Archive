<script lang="ts">
  import { untrack } from 'svelte';
  import type { PlanCell } from '@archive/casefile/authoring';
  import type { SlotView } from '../../src/shared/api';
  import { labelOf, type Autosave } from './lib/actions';

  let { docId, rows, slots, autosave }: { docId: string; rows: PlanCell[][]; slots: Record<string, SlotView>; autosave: Autosave } = $props();

  // Typed text is kept here, by part, so a save finishing never moves the cursor.
  let texts = $state<Record<string, string>>(untrack(() => Object.fromEntries(Object.values(slots).map((s) => [s.name, s.text]))));
</script>

<!-- The same rows and relative widths as the printed form. Boxes wrap when the panel is too narrow for them. -->
<div class="grid">
  {#each rows as row}
    <div class="row">
      {#each row as cell}
        {@const slot = slots[cell.slot]}
        {#if slot && (slot.kind === 'value' || slot.kind === 'markdown')}
          <label class="cell" class:shaded={cell.shaded} style="flex: {cell.width} 1 9.5rem">
            <span>{labelOf(slot)}{cell.shaded ? ' (office use)' : ''}</span>
            <input bind:value={texts[slot.name]} oninput={() => autosave(`text:${slot.name}`, () => window.author.setSlotText(docId, slot.name, texts[slot.name]))} />
          </label>
        {/if}
      {/each}
    </div>
  {/each}
</div>

<style>
  .grid { border: 1px solid var(--line); margin-bottom: 1rem; }
  .row { display: flex; flex-wrap: wrap; border-bottom: 1px solid var(--line); }
  .row:last-child { border-bottom: 0; }
  .cell { margin: 0; padding: 0.35rem 0.5rem 0.5rem; border-right: 1px solid var(--line); min-width: 0; }
  .cell:last-child { border-right: 0; }
  .cell span { font-size: 0.75rem; }
  .shaded { background: #2a251e; }
  input { padding: 0.3rem 0.4rem; }
</style>
