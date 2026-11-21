// The contract between the app's window and its main process. Types only: no code is shared.
import type { EpisodeDetails } from '@archive/casefile/authoring';
import type { Anchor, Hotspot, ItemsContent, Layout, SlotKind as FormatSlotKind, Target } from '@archive/casefile';
import type { PlanItem } from '@archive/casefile/authoring';

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
  /** The label printed on the form for this part (from the template), or empty if it has none. */
  label: string;
  /** The most characters the template allows in this part, if it limits them. */
  maxLength?: number;
  /** The text, for a value or markdown slot. */
  text: string;
  /** For an image slot: the file inside the episode, if one has been chosen. */
  image?: { file: string; alt: string };
  /** For an items slot: the list, cleaned. */
  items?: ItemsContent;
  /** An items slot whose file still holds an older Markdown table: its text, so it can be shown and replaced. */
  legacyText?: string;
}

/** One clickable part of a document, as the form shows it. */
export interface HotspotView {
  id: string;
  anchor: Anchor;
  target: Target;
  /** For a hotspot on words: the words, or undefined if the marked words are no longer in the text. */
  words?: string;
  /** For a marginal note: its text, wherever it is kept. */
  noteText?: string;
  /** False when the file's version would be dropped by the reader (so it needs fixing in the file). */
  valid: boolean;
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
  /** How the template's form is arranged, so the tool can mirror the paper. Empty for an unknown template. */
  plan: PlanItem[];
  hotspots: HotspotView[];
  /** False when the document's file could not be read; it is then listed but cannot be edited. */
  readable: boolean;
}

/** One registry entry, as listed. */
export interface RegistryView {
  id: string;
  /** `<episode-id>/<entry-id>`, which is what a hotspot or another entry refers to. */
  globalId: string;
  kind: string;
  title: string;
  /** False when the entry's file could not be read. */
  readable: boolean;
}

/** Everything the window needs to show about the episode being edited. */
export interface EpisodeState {
  folder: string;
  id: string;
  details: EpisodeDetails;
  documents: DocumentView[];
  registry: RegistryView[];
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
  /** Saves an itemised list. The list is checked again before it is written. */
  setItems(id: string, slot: string, items: ItemsContent): Promise<Result<EpisodeState>>;
  /** Makes words clickable: saves the text with the words marked and adds the hotspot together. */
  addTextHotspot(id: string, slot: string, text: string, hotspot: Hotspot): Promise<Result<EpisodeState>>;
  /** Adds a box on a picture or receipt. */
  addRectHotspot(id: string, hotspot: Hotspot): Promise<Result<EpisodeState>>;
  /** Replaces a hotspot (same id) with an edited one. */
  setHotspot(id: string, hotspot: Hotspot): Promise<Result<EpisodeState>>;
  /** Removes a hotspot. `text` is the text as the author has it now, so the mark on the words comes off with it. */
  removeHotspot(id: string, hotspotId: string, text?: string): Promise<Result<EpisodeState>>;
  revealFolder(): Promise<void>;
  /** Called each time the preview has been rebuilt. Returns a function that stops listening. */
  onPreview(callback: (info: { version: number; id: string }) => void): () => void;
}
