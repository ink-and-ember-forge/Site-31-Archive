// Reading and changing the registry entries of one episode folder. No Electron in here.
// Each change reads the file, changes only what it means to, and writes it back, so anything else in a file is kept.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describeErrors, validateRegistryEntry } from '@archive/casefile';
import { isValidId, serializeJson, slugify, uniqueId } from '@archive/casefile/authoring';
import type { RegistryView, Result } from '../shared/api';

type Json = Record<string, unknown>;
const GLOBAL_ID = /^[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9]+(-[a-z0-9]+)*$/;
export const LIMITS = { title: 200, kind: 40, label: 200, value: 2000, fields: 50, body: 20000, references: 50 };

const fail = (message: string): Result<never> => ({ ok: false, message });
const ok = { ok: true, value: true } as const;

/** What the author edits in an entry. The id is fixed once the entry is made. */
export interface EntryEdit {
  kind: string;
  title: string;
  fields: { label: string; value: string }[];
  body: string;
  references: string[];
}

export class RegistryFiles {
  constructor(
    private readonly folder: string,
    private readonly episodeId: string,
  ) {}

  private dir = () => join(this.folder, 'registry');
  private file = (id: string) => join(this.dir(), `${id}.json`);
  private read = (id: string): Json => JSON.parse(readFileSync(this.file(id), 'utf8')) as Json;
  private ids(): string[] {
    return existsSync(this.dir()) ? readdirSync(this.dir()).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort() : [];
  }

  /** Every hotspot in the episode that opens this entry, and every other entry that refers to it. */
  private usedBy(globalId: string, id: string): RegistryView['referencedBy'] {
    const out: RegistryView['referencedBy'] = [];
    const docs = join(this.folder, 'documents');
    if (existsSync(docs)) {
      for (const f of readdirSync(docs).filter((x) => x.endsWith('.json')).sort()) {
        try {
          const doc = JSON.parse(readFileSync(join(docs, f), 'utf8')) as Json;
          for (const h of Array.isArray(doc.hotspots) ? (doc.hotspots as Json[]) : []) {
            const t = h?.target as Json | undefined;
            if (t?.type === 'registry' && t.entry === globalId) out.push({ type: 'hotspot', id: f.replace(/\.json$/, ''), detail: String(h.id ?? '') });
          }
        } catch {
          /* an unreadable document is reported elsewhere */
        }
      }
    }
    for (const other of this.ids()) {
      if (other === id) continue;
      try {
        const refs = (this.read(other).references as unknown[] | undefined) ?? [];
        if (refs.includes(globalId)) out.push({ type: 'entry', id: other, detail: '' });
      } catch {
        /* reported elsewhere */
      }
    }
    return out;
  }

  /** The entries in the episode, tolerantly: a file that cannot be read is listed as unreadable, never hidden. */
  list(): RegistryView[] {
    return this.ids().map((id) => {
      const globalId = `${this.episodeId}/${id}`;
      try {
        const raw = this.read(id);
        const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
        const fields = Array.isArray(raw.fields)
          ? (raw.fields as Json[]).filter((f) => f && typeof f.label === 'string' && typeof f.value === 'string').map((f) => ({ label: f.label as string, value: f.value as string }))
          : [];
        return {
          id,
          globalId,
          kind: typeof raw.kind === 'string' ? raw.kind : '',
          title: typeof raw.title === 'string' ? raw.title : id,
          fields,
          body: typeof raw.body === 'string' ? raw.body : '',
          references: strings(raw.references),
          referencedBy: this.usedBy(globalId, id),
          readable: true,
        };
      } catch {
        return { id, globalId, kind: '', title: id, fields: [], body: '', references: [], referencedBy: this.usedBy(globalId, id), readable: false };
      }
    });
  }

  /** Makes a new entry from a title. Its id (and so its name in references) is made from the title once, and then fixed. */
  add(title: string, kind: string): Result<string> {
    const t = title.trim();
    if (t === '') return fail('Give the entry a title.');
    if (t.length > LIMITS.title) return fail(`Use at most ${LIMITS.title} characters for the title.`);
    const k = kind.trim() || 'record';
    if (k.length > LIMITS.kind) return fail(`Use at most ${LIMITS.kind} characters for the kind.`);
    const id = uniqueId(slugify(t).slice(0, 60).replace(/-+$/, '') || 'entry', this.ids());
    if (!isValidId(id)) return fail('That title cannot be made into an id.');
    mkdirSync(this.dir(), { recursive: true });
    writeFileSync(this.file(id), serializeJson({ id, kind: k, title: t }));
    return { ok: true, value: id };
  }

  /** Saves an edited entry, checked the way the reader's loader would check it. Anything else in the file is kept. */
  set(id: string, edit: EntryEdit): Result<true> {
    if (!isValidId(id) || !existsSync(this.file(id))) return fail('That entry is not in this episode.');
    const title = typeof edit?.title === 'string' ? edit.title.trim() : '';
    const kind = typeof edit?.kind === 'string' ? edit.kind.trim() : '';
    if (title === '') return fail('Give the entry a title.');
    if (kind === '') return fail('Give the entry a kind, like record or person.');
    if (title.length > LIMITS.title || kind.length > LIMITS.kind) return fail('The title or kind is too long.');
    const fields = (Array.isArray(edit.fields) ? edit.fields : []).map((f) => ({ label: String(f?.label ?? '').trim(), value: String(f?.value ?? '') })).filter((f) => f.label !== '' || f.value.trim() !== '');
    if (fields.length > LIMITS.fields) return fail(`Use at most ${LIMITS.fields} fields.`);
    if (fields.some((f) => f.label === '' || f.label.length > LIMITS.label || f.value.length > LIMITS.value)) return fail('Every field needs a label (at most 200 characters) and a value (at most 2000).');
    const body = typeof edit.body === 'string' ? edit.body : '';
    if (body.length > LIMITS.body) return fail(`Use at most ${LIMITS.body} characters for the text.`);
    const references = [...new Set((Array.isArray(edit.references) ? edit.references : []).map((r) => String(r).trim()).filter(Boolean))];
    if (references.length > LIMITS.references) return fail(`Use at most ${LIMITS.references} references.`);
    const bad = references.find((r) => !GLOBAL_ID.test(r));
    if (bad) return fail(`"${bad}" is not a reference. Write it as episode-id/entry-id, with lowercase letters, numbers and hyphens.`);

    const existing = this.read(id);
    const next: Json = { ...existing, id, kind, title };
    // Written in reading order; empty parts are left out rather than saved as empty.
    const ordered: Json = { id, kind, title };
    if (fields.length > 0) ordered.fields = fields;
    if (body.trim() !== '') ordered.body = body;
    if (references.length > 0) ordered.references = references;
    for (const [key, value] of Object.entries(next)) if (!(key in ordered) && !['fields', 'body', 'references'].includes(key)) ordered[key] = value;
    if (!validateRegistryEntry(ordered)) return fail(`The entry is not valid: ${describeErrors(validateRegistryEntry)}`);
    writeFileSync(this.file(id), serializeJson(ordered));
    return ok;
  }

  remove(id: string): Result<true> {
    if (!isValidId(id) || !existsSync(this.file(id))) return fail('That entry is not in this episode.');
    rmSync(this.file(id));
    return ok;
  }
}
