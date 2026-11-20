import type { EpisodeState, Result } from '../../../src/shared/api';

/**
 * What a form control runs to save. `null` means the author cancelled a dialog (nothing to report);
 * `undefined` means the save is being held back because something is still being typed.
 */
export type Action = () => Promise<Result<EpisodeState> | null | undefined> | Result<EpisodeState> | null | undefined;
export type Autosave = (key: string, action: Action) => void;
export type Now = (action: Action) => Promise<Result<EpisodeState> | null | undefined>;

/** A part's label as printed on the form, without its trailing colon, or a readable version of its name. */
export function labelOf(slot: { label: string; name: string }): string {
  if (slot.label) return slot.label.replace(/\s*:\s*$/, '');
  const spaced = slot.name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
