/** Types for the case file package format v1. See docs/package-format-proposal.md. */

export const CURRENT_FORMAT_VERSION = 1;

export interface Layout {
  x: number;
  y: number;
  width: number;
  rotation?: number;
}

export interface ManifestDocument {
  id: string;
  layout: Layout;
  /** Hidden documents only appear when a hotspot with a `document` target opens them. */
  hidden?: boolean;
}

export interface Manifest {
  formatVersion: number;
  id: string;
  title: string;
  submissionDate: string;
  folderLabel?: string;
  order?: number;
  centralDocument: string;
  documents: ManifestDocument[];
  voiceover?: { file: string; transcript?: string };
}

export type Slot =
  | { kind: 'markdown'; file?: string; text?: string }
  | { kind: 'image'; file: string; alt?: string }
  | { kind: 'value'; value: string };

export type Anchor =
  | { type: 'text'; slot: string }
  | { type: 'rect'; x: number; y: number; width: number; height: number };

/** How a marginal note looks: `formal` (typed, institutional) or `note` (handwritten). Defaults to `formal`. */
export type NoteVariant = 'formal' | 'note';

export type Target =
  | { type: 'lightbox'; variant?: NoteVariant; title?: string; text?: string; file?: string }
  | { type: 'document'; document: string }
  | { type: 'registry'; entry: string };

export interface Hotspot {
  id: string;
  label?: string;
  anchor: Anchor;
  target: Target;
}

export interface DocumentDef {
  id: string;
  template: string;
  style?: string;
  role: 'central' | 'supporting';
  slots: Record<string, Slot>;
  hotspots: Hotspot[];
}

export interface RegistryEntry {
  /** Local id (matches the file name). */
  id: string;
  /** Global id: `<episode-id>/<entry-id>`. */
  globalId: string;
  kind: string;
  title: string;
  fields: { label: string; value: string }[];
  body?: string;
  /** Global ids, possibly pointing at episodes that are not published. */
  references: string[];
}

export type LedgerLayer = 'main' | 'marginalia' | 'supplementary' | 'registry';

export interface LedgerRef {
  element: string;
  layer: LedgerLayer;
}

export interface Block {
  block: string;
  slot?: string;
  props?: Record<string, unknown>;
  children?: Block[];
}

export interface Template {
  id: string;
  name?: string;
  placeholder?: boolean;
  defaultStyle?: string;
  aspect?: number;
  slots: { name: string; kind: 'markdown' | 'image' | 'value'; required?: boolean }[];
  layout: Block;
}

export interface Style {
  id: string;
  name?: string;
  placeholder?: boolean;
  tokens: Record<string, string | number>;
  fonts?: { family: string; file?: string }[];
}

export interface Issue {
  severity: 'error' | 'warning';
  /** Path of the file or field the issue concerns, e.g. `documents/statement.json`. */
  path: string;
  message: string;
}

/** A loaded, validated episode. Content files are read on demand through `source`. */
export interface Casefile {
  manifest: Manifest;
  /** In manifest order. */
  documents: DocumentDef[];
  registry: RegistryEntry[];
  ledger: LedgerRef[];
  /** Episode-level overrides; take precedence over the shared theme. */
  templates: Record<string, Template>;
  styles: Record<string, Style>;
}

export type LoadResult =
  | { ok: true; casefile: Casefile; warnings: Issue[] }
  | { ok: false; errors: Issue[]; warnings: Issue[] };

export interface ArchiveIndexEntry {
  id: string;
  title: string;
  submissionDate: string;
  folderLabel?: string;
  order?: number;
  /** File name of the packaged episode, relative to index.json. */
  file: string;
  bytes: number;
}

export interface ArchiveIndex {
  formatVersion: number;
  episodes: ArchiveIndexEntry[];
}
