// The contract between the app's window and its main process. Types only: no code is shared.
import type { EpisodeDetails } from '@archive/casefile/authoring';

export interface Problem {
  severity: 'error' | 'warning';
  path: string;
  message: string;
  hint?: string;
}

/** Everything the window needs to show about the episode being edited. */
export interface EpisodeState {
  folder: string;
  id: string;
  details: EpisodeDetails;
  problems: Problem[];
}

export type Result<T> = { ok: true; value: T } | { ok: false; message: string; problems?: Problem[] };

export interface AuthorApi {
  /** Asks where to save, then creates a new episode folder. Resolves null if the author cancels. */
  newEpisode(title: string): Promise<Result<EpisodeState> | null>;
  /** Asks for an episode folder to open. Resolves null if the author cancels. */
  openEpisode(): Promise<Result<EpisodeState> | null>;
  saveDetails(details: EpisodeDetails): Promise<Result<EpisodeState>>;
  revealFolder(): Promise<void>;
  /** Called each time the preview has been rebuilt. Returns a function that stops listening. */
  onPreview(callback: (info: { version: number; id: string }) => void): () => void;
}
