// The registry entry editor's working copy and how it becomes a saved entry. Pure functions, so every rule is tested
// without a window. Nothing is saved until the whole entry is valid, so a half-typed reference never loses anything.
import type { RegistryEdit, RegistryView } from '../../../src/shared/api';

export const GLOBAL_ID = /^[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9]+(-[a-z0-9]+)*$/;
export const KIND_SUGGESTIONS = ['record', 'person', 'place', 'object', 'organisation', 'event', 'vehicle', 'document'];

export interface FieldRow {
  key: number;
  label: string;
  value: string;
}
export interface ReferenceRow {
  key: number;
  text: string;
}
export interface EntryDraft {
  kind: string;
  title: string;
  fields: FieldRow[];
  body: string;
  references: ReferenceRow[];
}

let nextKey = 1;
export const newField = (over: Partial<FieldRow> = {}): FieldRow => ({ key: nextKey++, label: '', value: '', ...over });
export const newReference = (text = ''): ReferenceRow => ({ key: nextKey++, text });

export function draftFromEntry(entry: Pick<RegistryView, 'kind' | 'title' | 'fields' | 'body' | 'references'>): EntryDraft {
  return {
    kind: entry.kind,
    title: entry.title,
    fields: entry.fields.map((f) => newField(f)),
    body: entry.body,
    references: entry.references.map(newReference),
  };
}

export interface BuiltEntry {
  /** The entry to save, or null while anything is still being typed or is wrong. */
  edit: RegistryEdit | null;
  titleError?: string;
  kindError?: string;
  /** Reasons by field row key and by reference row key. */
  fieldErrors: Record<number, string>;
  referenceErrors: Record<number, string>;
  held: number;
}

const isBlankField = (f: FieldRow) => f.label.trim() === '' && f.value.trim() === '';

export function buildEntry(draft: EntryDraft): BuiltEntry {
  const fieldErrors: Record<number, string> = {};
  const referenceErrors: Record<number, string> = {};
  let held = 0;
  const title = draft.title.trim();
  const kind = draft.kind.trim();
  const titleError = title === '' ? 'Give the entry a title.' : title.length > 200 ? 'Use at most 200 characters.' : undefined;
  const kindError = kind === '' ? 'Give the entry a kind, like record or person.' : kind.length > 40 ? 'Use at most 40 characters.' : undefined;
  if (titleError) held++;
  if (kindError) held++;

  const fields: { label: string; value: string }[] = [];
  for (const f of draft.fields) {
    if (isBlankField(f)) continue; // an empty row is just space to type in
    if (f.label.trim() === '') fieldErrors[f.key] = 'Give this field a label.';
    else if (f.label.length > 200) fieldErrors[f.key] = 'Use at most 200 characters for the label.';
    else if (f.value.length > 2000) fieldErrors[f.key] = 'Use at most 2000 characters for the value.';
    if (fieldErrors[f.key]) held++;
    else fields.push({ label: f.label.trim(), value: f.value });
  }
  if (fields.length > 50) held++;

  const references: string[] = [];
  const seen = new Set<string>();
  for (const r of draft.references) {
    const text = r.text.trim();
    if (text === '') continue;
    if (!GLOBAL_ID.test(text)) {
      referenceErrors[r.key] = 'Write it as episode-id/entry-id, using lowercase letters, numbers and hyphens.';
      held++;
    } else if (seen.has(text)) {
      referenceErrors[r.key] = 'This reference is already in the list, so it is only saved once.';
    } else {
      seen.add(text);
      references.push(text);
    }
  }
  if (references.length > 50) held++;
  if (draft.body.length > 20000) held++;

  const blocked = held > 0;
  return {
    edit: blocked ? null : { kind, title, fields, body: draft.body, references },
    ...(titleError ? { titleError } : {}),
    ...(kindError ? { kindError } : {}),
    fieldErrors,
    referenceErrors,
    held,
  };
}

/** Moves a row up (-1) or down (1). Returns the same list if it cannot move. */
export function moveItem<T extends { key: number }>(rows: T[], key: number, by: -1 | 1): T[] {
  const from = rows.findIndex((r) => r.key === key);
  const to = from + by;
  if (from < 0 || to < 0 || to >= rows.length) return rows;
  const next = [...rows];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** What to call a reference in the form: the entry's title if it is in this episode, otherwise as written. */
export function describeReference(text: string, entries: Pick<RegistryView, 'globalId' | 'title'>[]): string {
  const found = entries.find((e) => e.globalId === text.trim());
  return found ? found.title : 'Another episode (shown redacted until it is published)';
}

/** Where a problem's path points: a document, a registry entry, or the episode itself. */
export type Target = { type: 'document' | 'registry'; id: string } | { type: 'episode' };
export function targetOfPath(path: string): Target | undefined {
  const doc = /^documents\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\.[A-Za-z0-9_-]+)?\.(?:json|md)\b/.exec(path);
  if (doc) return { type: 'document', id: doc[1] };
  const reg = /^registry\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json\b/.exec(path);
  if (reg) return { type: 'registry', id: reg[1] };
  if (/^case\.json\b/.test(path)) return { type: 'episode' };
  return undefined;
}
