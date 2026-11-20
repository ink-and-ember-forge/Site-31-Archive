// The contract between the app's window and its main process. Types only: no code is shared.
import type { EpisodeDetails } from '@archive/casefile/authoring';
import type { Layout, SlotKind as FormatSlotKind } from '@archive/casefile';

export interface Problem {
  severity: 'error' | 'warning';
  path: string;
  message: string;
  hint?: string;
}

export type SlotKind = FormatSlotKind;

/** A kind of document the author can add (a template from the shared theme). */
export interface TemplateInfo {
  id: string;
  name: string;
  slots: { name: string; kind: SlotKind; required: boolean }[];
}

/** One fillable place in a document, with what is in it now. */
export interface SlotView {
  name: string;
  kind: SlotKind;
  required: boolean;
  /** The text, for a value or markdown slot. */
  text: string;
  /** For an image slot: the file inside the episode, if one has been chosen. */
  image?: { file: string; alt: string };
}

export interface DocumentView {
  id: string;
  template: string;
  /** The template's display name, or the template id if the theme has no such template. */
  templateName: string;
  central: boolean;
  hidden: boolean;
  layout: Layout;
  slots: SlotView[];
  /** False when the document's file could not be read; it is then listed but cannot be edited. */
  readable: boolean;
}

/** Everything the window needs to show about the episode being edited. */
export interface EpisodeState {
  folder: string;
  id: string;
  details: EpisodeDetails;
  documents: DocumentView[];
  templates: TemplateInfo[];
  problems: Problem[];
}

export type Result<T> = { ok: true; value: T } | { ok: false; message: string; problems?: Problem[] };

export interface AuthorApi {
  /** Asks where to save, then creates a new episode folder. Resolves null if the author cancels. */
  newEpisode(title: string): Promise<Result<EpisodeState> | null>;
  /** Asks for an episode folder to open. Resolves null if the author cancels. */
  openEpisode(): Promise<Result<EpisodeState> | null>;
  saveDetails(details: EpisodeDetails): Promise<Result<EpisodeState>>;
  addDocument(template: string, name: string): Promise<Result<EpisodeState>>;
  removeDocument(id: string): Promise<Result<EpisodeState>>;
  setCentral(id: string): Promise<Result<EpisodeState>>;
  setHidden(id: string, hidden: boolean): Promise<Result<EpisodeState>>;
  /** `refresh: false` is for a move made on the preview itself, which already shows the change. */
  setLayout(id: string, layout: Layout, refresh: boolean): Promise<Result<EpisodeState>>;
  setSlotText(id: string, slot: string, text: string): Promise<Result<EpisodeState>>;
  /** Asks for an image file and copies it into the episode. Resolves null if the author cancels. */
  chooseImage(id: string, slot: string): Promise<Result<EpisodeState> | null>;
  setImageAlt(id: string, slot: string, alt: string): Promise<Result<EpisodeState>>;
  revealFolder(): Promise<void>;
  /** Called each time the preview has been rebuilt. Returns a function that stops listening. */
  onPreview(callback: (info: { version: number; id: string }) => void): () => void;
}
