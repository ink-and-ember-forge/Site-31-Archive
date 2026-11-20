// Pure helpers the authoring tool uses to create and update an episode's files.
// Kept here, next to the format, so the tool and the format cannot drift apart.
import { CURRENT_FORMAT_VERSION, type Layout, type SlotKind } from './types';

/** The episode-level fields the author edits in the form. */
export interface EpisodeDetails {
  title: string;
  submissionDate: string;
  folderLabel?: string;
  order?: number;
}

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_ID_LENGTH = 60;

export const isValidId = (id: string) => ID_PATTERN.test(id);

/** An episode id from a title: lowercase words joined by hyphens, no accents or punctuation. */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= MAX_ID_LENGTH) return slug;
  // Cut at a word boundary so the id doesn't end mid-word.
  const cut = slug.slice(0, MAX_ID_LENGTH);
  return cut.slice(0, Math.max(cut.lastIndexOf('-'), 1)).replace(/-+$/, '');
}

export const todayIso = (now: Date = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

/** Plain-English problems with the form values, or an empty list if they are fine to save. */
export function checkDetails(d: EpisodeDetails): string[] {
  const problems: string[] = [];
  if (d.title.trim() === '') problems.push('The title cannot be empty.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.submissionDate)) problems.push('The submission date must be a full date.');
  if (d.order !== undefined && !Number.isFinite(d.order)) problems.push('The order must be a number.');
  return problems;
}

// Fields are written in this order so saved files stay tidy and changes show up as small diffs.
const MANIFEST_ORDER = ['formatVersion', 'id', 'title', 'submissionDate', 'folderLabel', 'order', 'centralDocument', 'documents', 'voiceover'];

export function serializeJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}

/** Serialises a manifest with a stable field order; unknown fields keep their place at the end. */
export function serializeManifest(manifest: Record<string, unknown>): string {
  const ordered: Record<string, unknown> = {};
  for (const key of MANIFEST_ORDER) if (key in manifest) ordered[key] = manifest[key];
  for (const key of Object.keys(manifest)) if (!(key in ordered)) ordered[key] = manifest[key];
  return serializeJson(ordered);
}

/** Applies the form values to a manifest. Everything else in it is left exactly as it was. */
export function applyDetails(manifest: Record<string, unknown>, d: EpisodeDetails): Record<string, unknown> {
  const next: Record<string, unknown> = { ...manifest, title: d.title.trim(), submissionDate: d.submissionDate };
  const label = d.folderLabel?.trim();
  if (label) next.folderLabel = label;
  else delete next.folderLabel;
  if (d.order !== undefined && Number.isFinite(d.order)) next.order = d.order;
  else delete next.order;
  return next;
}

/** The files of a new, valid episode: one central typed document, clearly marked as placeholder. */
export function starterEpisodeFiles(id: string, title: string, submissionDate: string): Record<string, string> {
  return {
    'case.json': serializeManifest({
      formatVersion: CURRENT_FORMAT_VERSION,
      id,
      title: title.trim(),
      submissionDate,
      centralDocument: 'statement',
      documents: [{ id: 'statement', layout: { x: 0.33, y: 0.04, width: 0.32 } }],
    }),
    'documents/statement.json': serializeJson({
      template: 'typed',
      role: 'central',
      slots: {
        title: { kind: 'value', value: 'PLACEHOLDER: DOCUMENT TITLE' },
        body: { kind: 'markdown', file: 'documents/statement.md' },
      },
    }),
    'documents/statement.md': 'PLACEHOLDER: write the text of the main document here.\n',
  };
}

// ---------------------------------------------------------------------------------------------
// Documents on the table
// ---------------------------------------------------------------------------------------------
export interface TemplateSlot {
  name: string;
  kind: SlotKind;
  required?: boolean;
  label?: string;
}

/** The parts of a template the tool needs to build a form and a new document. */
export interface TemplateLike {
  id: string;
  aspect?: number;
  defaultWidth?: number;
  slots: TemplateSlot[];
}

/** `base`, or `base-2`, `base-3`... if that is taken. */
export function uniqueId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v * 1000) / 1000;

/** Keeps a layout inside what the format allows. A rotation of zero is left out. */
export function clampLayout(l: Layout): Layout {
  const out: Layout = {
    x: round(clamp(Number.isFinite(l.x) ? l.x : 0, 0, 1)),
    y: round(clamp(Number.isFinite(l.y) ? l.y : 0, 0, 1)),
    width: round(clamp(Number.isFinite(l.width) ? l.width : 0.2, 0.05, 1)),
  };
  if (l.rotation !== undefined && Number.isFinite(l.rotation) && l.rotation !== 0) out.rotation = round(clamp(l.rotation, -180, 180));
  return out;
}

/**
 * Where a new document goes: sized so it is about half the height of the table, and each new one steps
 * down and across a little so they do not land exactly on top of each other.
 */
export function defaultLayout(aspect: number | undefined, index: number, preferredWidth?: number): Layout {
  const width = preferredWidth ?? clamp((0.55 * (aspect ?? 0.75)) / 1.7, 0.12, 0.3);
  const step = index % 6;
  return clampLayout({ x: 0.08 + step * 0.05, y: 0.08 + step * 0.04, width });
}

/** The files for a new, empty document of a template. Images are chosen afterwards, so none are made here. */
export function newDocumentFiles(id: string, template: TemplateLike): { document: Record<string, unknown>; files: Record<string, string> } {
  const slots: Record<string, unknown> = {};
  const files: Record<string, string> = {};
  for (const slot of template.slots) {
    if (slot.kind === 'value') slots[slot.name] = { kind: 'value', value: '' };
    else if (slot.kind === 'items') slots[slot.name] = { kind: 'items', items: [] };
    else if (slot.kind === 'choices') slots[slot.name] = { kind: 'choices', selected: [] };
    else if (slot.kind === 'markdown') {
      const file = `documents/${id}.${slot.name}.md`;
      slots[slot.name] = { kind: 'markdown', file };
      files[file] = '';
    }
  }
  return { document: { template: template.id, role: 'supporting', slots }, files };
}

type Manifest = Record<string, unknown>;
type ManifestDocument = { id: string; layout: Layout; hidden?: boolean };
const documentsOf = (m: Manifest) => (Array.isArray(m.documents) ? (m.documents as ManifestDocument[]) : []);

export function addDocumentToManifest(m: Manifest, id: string, layout: Layout): Manifest {
  return { ...m, documents: [...documentsOf(m), { id, layout: clampLayout(layout) }] };
}

export function removeDocumentFromManifest(m: Manifest, id: string): Manifest {
  return { ...m, documents: documentsOf(m).filter((d) => d.id !== id) };
}

/** Makes a document the main one. The main document can never be hidden. */
export function setCentralInManifest(m: Manifest, id: string): Manifest {
  const documents = documentsOf(m).map((d) => {
    if (d.id !== id) return d;
    const { hidden: _hidden, ...rest } = d;
    return rest as ManifestDocument;
  });
  return { ...m, centralDocument: id, documents };
}

/** Hides a document until a hotspot reveals it. Ignored for the main document. */
export function setHiddenInManifest(m: Manifest, id: string, hidden: boolean): Manifest {
  if (m.centralDocument === id) return m;
  return {
    ...m,
    documents: documentsOf(m).map((d) => {
      if (d.id !== id) return d;
      const { hidden: _hidden, ...rest } = d;
      return (hidden ? { ...rest, hidden: true } : rest) as ManifestDocument;
    }),
  };
}

export function setLayoutInManifest(m: Manifest, id: string, layout: Layout): Manifest {
  return { ...m, documents: documentsOf(m).map((d) => (d.id === id ? { ...d, layout: clampLayout(layout) } : d)) };
}

/** A safe file name for an imported image: lowercase words, the original extension, never overwriting. */
export function imageFileName(original: string, taken: Iterable<string>): string {
  const dot = original.lastIndexOf('.');
  const ext = dot > 0 ? original.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const stem = slugify(dot > 0 ? original.slice(0, dot) : original) || 'image';
  const used = new Set(taken);
  const make = (n: number) => `${stem}${n > 1 ? `-${n}` : ''}${ext ? `.${ext}` : ''}`;
  let n = 1;
  while (used.has(make(n))) n++;
  return make(n);
}
