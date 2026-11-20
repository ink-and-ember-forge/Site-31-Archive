/** Svelte action for dialogs: moves focus in, keeps Tab inside, and restores focus on close. */
export function trapFocus(node: HTMLElement) {
  const previous = document.activeElement as HTMLElement | null;
  const focusables = () =>
    [...node.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])')];
  (node.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0] ?? node).focus();

  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const items = focusables();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  node.addEventListener('keydown', onKey);
  return {
    destroy() {
      node.removeEventListener('keydown', onKey);
      previous?.focus?.();
    },
  };
}
