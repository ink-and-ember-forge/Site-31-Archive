// Pure helpers the authoring tool uses to create and update an episode's files.
// Kept here, next to the format, so the tool and the format cannot drift apart.
import { CURRENT_FORMAT_VERSION, type Block, type Hotspot, type Layout, type SlotKind } from './types';

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

/**
 * The files of a new, valid episode: one central document, clearly marked as placeholder. With a template it is a
 * document of that template (the author's main form); without one it is a plain typed page.
 */
export function starterEpisodeFiles(id: string, title: string, submissionDate: string, template?: TemplateLike): Record<string, string> {
  const manifest = (layout: Layout) =>
    serializeManifest({
      formatVersion: CURRENT_FORMAT_VERSION,
      id,
      title: title.trim(),
      submissionDate,
      centralDocument: 'statement',
      documents: [{ id: 'statement', layout }],
    });

  if (template) {
    const { document, files } = newDocumentFiles('statement', template);
    const slots = document.slots as Record<string, { kind: string; value?: string; file?: string }>;
    // Placeholder wording for the parts every form has, so a new episode is never blank and never mistaken for real content.
    if (slots.title?.kind === 'value') slots.title.value = 'PLACEHOLDER: FORM TITLE';
    if (slots.agency?.kind === 'value') slots.agency.value = 'PLACEHOLDER AGENCY';
    const bodyFile = slots.body?.file;
    if (bodyFile) files[bodyFile] = 'PLACEHOLDER: write the text of the main document here.\n';
    return {
      'case.json': manifest(clampLayout({ x: 0.33, y: 0.04, width: template.defaultWidth ?? 0.32 })),
      'documents/statement.json': serializeJson({ ...document, role: 'central' }),
      ...files,
    };
  }

  return {
    'case.json': manifest({ x: 0.33, y: 0.04, width: 0.32 }),
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

// ---------------------------------------------------------------------------------------------
// Turning a template into the shape of its form in the tool
// ---------------------------------------------------------------------------------------------

export interface PlanCell {
  slot: string;
  /** Relative width, as on the paper. */
  width: number;
  /** An "office use only" box. */
  shaded: boolean;
}

export type PlanItem =
  /** A heading, from a section bar on the paper. */
  | { type: 'bar'; text: string }
  /** Rows of labelled boxes arranged as they are on the paper. */
  | { type: 'grid'; rows: PlanCell[][] }
  /** Slots listed one under another, optionally under a title. `tall` is for the long text set on ruled lines. */
  | { type: 'slots'; title?: string; slots: string[]; tall?: boolean }
  /** A named group of the form (a template section), shown collapsible. Holds the same kinds of item. */
  | { type: 'section'; id: string; title: string; open?: boolean; items: PlanItem[] };

/** Every slot name a plan item shows, however deeply it is nested. */
export function planSlots(item: PlanItem): string[] {
  if (item.type === 'grid') return item.rows.flat().map((c) => c.slot);
  if (item.type === 'slots') return item.slots;
  if (item.type === 'section') return item.items.flatMap(planSlots);
  return [];
}

/**
 * The order and arrangement of a template's form in the tool, taken from its layout so the form on the left mirrors the
 * paper on the right. Every slot appears exactly once: any the layout does not use are gathered at the end.
 *
 * A template may name `sections`, and a block may join one with `section` (it is inherited by the block's children).
 * Each section becomes one group of the form, in the order the template lists them, holding what its blocks show.
 */
export function editorPlan(template: { slots: { name: string }[]; layout: Block; sections?: { id: string; name: string; open?: boolean }[] }): PlanItem[] {
  const known = new Set(template.slots.map((s) => s.name));
  const used = new Set<string>();
  const sectionDefs = template.sections ?? [];
  const sectionItems = new Map<string, PlanItem[]>(sectionDefs.map((d) => [d.id, []]));
  const plan: PlanItem[] = [];
  // Where the next items go: the section the block belongs to, or the top level.
  let target: PlanItem[] = plan;

  const take = (names: unknown[]): string[] => {
    const out: string[] = [];
    for (const n of names) {
      if (typeof n === 'string' && known.has(n) && !used.has(n)) {
        used.add(n);
        out.push(n);
      }
    }
    return out;
  };
  const prop = (block: Block, key: string) => block.props?.[key];
  const addSlots = (title: string | undefined, names: unknown[], tall = false) => {
    const slots = take(names);
    if (slots.length > 0) target.push({ type: 'slots', ...(title ? { title } : {}), slots, ...(tall ? { tall: true } : {}) });
  };

  const walk = (block: Block, inherited?: string) => {
    const own = block.section !== undefined && sectionItems.has(block.section) ? block.section : inherited;
    target = own !== undefined ? (sectionItems.get(own) as PlanItem[]) : plan;
    switch (block.block) {
      case 'stack':
      case 'columns':
        (block.children ?? []).forEach((child) => walk(child, own));
        return;
      case 'section-bar':
        if (typeof prop(block, 'text') === 'string') target.push({ type: 'bar', text: prop(block, 'text') as string });
        return;
      case 'field-grid': {
        const raw = prop(block, 'rows');
        const rows: PlanCell[][] = [];
        for (const row of Array.isArray(raw) ? raw : []) {
          const cells: PlanCell[] = [];
          for (const cell of Array.isArray(row) ? (row as Record<string, unknown>[]) : []) {
            const [slot] = take([cell?.slot]);
            if (slot) cells.push({ slot, width: typeof cell.width === 'number' && cell.width > 0 ? cell.width : 1, shaded: cell.shaded === true });
          }
          if (cells.length > 0) rows.push(cells);
        }
        if (rows.length > 0) target.push({ type: 'grid', rows });
        return;
      }
      case 'letterhead':
        addSlots('Letterhead', ['crest', 'name', 'lines', 'reference', 'revision'].map((k) => prop(block, k)));
        return;
      case 'title':
        addSlots('Title', [block.slot, prop(block, 'subtitle')]);
        return;
      case 'stamp':
        addSlots('Stamp', [prop(block, 'text'), prop(block, 'date')]);
        return;
      case 'split-row': {
        const cells: PlanCell[] = take([prop(block, 'left'), prop(block, 'right')]).map((slot) => ({ slot, width: 1, shaded: false }));
        if (cells.length > 0) target.push({ type: 'grid', rows: [cells] });
        return;
      }
      case 'ruled-lines':
        addSlots(undefined, [block.slot], true);
        return;
      default:
        if (block.slot) addSlots(undefined, [block.slot]);
        addSlots(undefined, [prop(block, 'seed'), prop(block, 'number'), prop(block, 'caption')]);
    }
  };
  walk(template.layout);

  // Anything outside a section comes first, then each section in the order the template lists them.
  const out: PlanItem[] = [...plan];
  for (const def of sectionDefs) {
    const items = sectionItems.get(def.id) as PlanItem[];
    if (items.length > 0) out.push({ type: 'section', id: def.id, title: def.name, ...(def.open ? { open: true } : {}), items });
  }

  const rest = template.slots.map((s) => s.name).filter((n) => !used.has(n));
  if (rest.length > 0) out.push({ type: 'slots', title: 'Other parts', slots: rest });
  return out;
}

// ---------------------------------------------------------------- hotspots

const SPAN_PATTERN = /\[([^\]]+)\]\{#([a-z0-9]+(?:-[a-z0-9]+)*)\}/g;

export interface SpanInfo {
  id: string;
  /** The clickable words, without the marks around them. */
  words: string;
  /** Where the whole mark `[words]{#id}` starts and ends in the text. */
  start: number;
  end: number;
}

/** The clickable spans in a piece of text, in order. */
export function spansIn(text: string): SpanInfo[] {
  return [...text.matchAll(SPAN_PATTERN)].map((m) => ({ id: m[2], words: m[1], start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
}

export type MakeClickableResult = { ok: true; text: string; id: string; words: string } | { ok: false; reason: string };

/**
 * Wraps the selected words in a clickable mark, `[words]{#id}`, and gives it an id made from the words (made unique among
 * `taken`). Spaces at the ends of the selection are left outside. The selection must be one line, must not already be (or
 * overlap) a clickable part, and must not contain the characters the mark is made of.
 */
export function makeClickable(text: string, start: number, end: number, taken: Iterable<string> = []): MakeClickableResult {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > text.length || start >= end) {
    return { ok: false, reason: 'Select the words first, then press the button.' };
  }
  let from = start;
  let to = end;
  while (from < to && /\s/.test(text[from])) from++;
  while (to > from && /\s/.test(text[to - 1])) to--;
  if (from >= to) return { ok: false, reason: 'Select some words, not just spaces.' };
  const words = text.slice(from, to);
  if (/[\r\n]/.test(words)) return { ok: false, reason: 'Select words on one line. A clickable part cannot run across a new line.' };
  if (/[[\]{}]/.test(words)) return { ok: false, reason: 'The selection contains a bracket, which is used to mark clickable words. Select just the words.' };
  if (spansIn(text).some((s) => from < s.end && to > s.start)) return { ok: false, reason: 'That part of the text is already clickable.' };
  if (text.slice(to, to + 2) === '](') return { ok: false, reason: 'That text is already the words of a Markdown link, and marking it would break the link.' };
  // Ids already marked in the text count as taken too, even when their hotspot is gone, so two spans never share one.
  const id = uniqueId(slugify(words).slice(0, 40).replace(/-+$/, '') || 'hotspot', [...taken, ...spansIn(text).map((sp) => sp.id)]);
  return { ok: true, text: `${text.slice(0, from)}[${words}]{#${id}}${text.slice(to)}`, id, words };
}

/** Takes the clickable mark off a span, leaving the words. */
export function removeSpan(text: string, id: string): string {
  return text.replace(SPAN_PATTERN, (whole, words: string, spanId: string) => (spanId === id ? words : whole));
}

/** A new clickable part's starting point: a plain marginal note, with nothing written in it yet. */
export function newTextHotspot(id: string, slot: string): Hotspot {
  return { id, anchor: { type: 'text', slot }, target: { type: 'lightbox', variant: 'formal', text: '' } };
}

/** A new box on a picture or receipt, where there are no words to mark. */
export function newRectHotspot(id: string): Hotspot {
  return { id, anchor: { type: 'rect', x: 0.1, y: 0.1, width: 0.3, height: 0.1 }, target: { type: 'lightbox', variant: 'formal', text: '' } };
}

/** Keeps a box inside the document (fractions from 0 to 1) and gives it a size. */
export function clampRect(r: { x: number; y: number; width: number; height: number }) {
  const width = round(clamp(Number.isFinite(r.width) ? r.width : 0.1, 0.01, 1));
  const height = round(clamp(Number.isFinite(r.height) ? r.height : 0.1, 0.01, 1));
  return {
    type: 'rect' as const,
    x: round(clamp(Number.isFinite(r.x) ? r.x : 0, 0, 1 - width)),
    y: round(clamp(Number.isFinite(r.y) ? r.y : 0, 0, 1 - height)),
    width,
    height,
  };
}
