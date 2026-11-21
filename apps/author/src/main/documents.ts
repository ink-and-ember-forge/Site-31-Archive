// Reading and changing the documents of one episode folder. No Electron in here.
// Every change reads the file, changes only what it means to, and writes it back, so anything the
// author (or a later step) has added, such as hotspots, is left exactly as it was.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { isSafePath, normaliseItems, type ItemsContent, type Layout, type Template } from '@archive/casefile';
import {
  addDocumentToManifest,
  clampLayout,
  defaultLayout,
  editorPlan,
  imageFileName,
  isValidId,
  newDocumentFiles,
  removeDocumentFromManifest,
  serializeJson,
  serializeManifest,
  setCentralInManifest,
  setHiddenInManifest,
  setLayoutInManifest,
  slugify,
  uniqueId,
} from '@archive/casefile/authoring';
import type { DocumentView, Result, SlotView, TemplateInfo } from '../shared/api';

type Json = Record<string, unknown>;
const SLOT_NAME = /^[A-Za-z0-9_-]+$/;
const IMAGE_TYPES = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
export const IMAGE_EXTENSIONS = IMAGE_TYPES;

const fail = (message: string): Result<never> => ({ ok: false, message });
const ok = { ok: true, value: true } as const;

export function templateInfos(templates: Record<string, Template>): TemplateInfo[] {
  return Object.values(templates)
    .map((t) => ({
      id: t.id,
      name: (t.name ?? t.id).replace(/\s*\(PLACEHOLDER starter\)\s*$/i, ''),
      slots: t.slots.map((s) => ({ name: s.name, kind: s.kind, required: s.required === true })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export class DocumentFiles {
  constructor(
    private readonly folder: string,
    private readonly templates: () => Record<string, Template>,
  ) {}

  private manifestPath = () => join(this.folder, 'case.json');
  private docPath = (id: string) => join(this.folder, 'documents', `${id}.json`);
  private readJson = (path: string): Json => JSON.parse(readFileSync(path, 'utf8')) as Json;
  private readManifest = () => this.readJson(this.manifestPath());
  private writeManifest = (m: Json) => writeFileSync(this.manifestPath(), serializeManifest(m));
  private writeDoc = (id: string, doc: Json) => writeFileSync(this.docPath(id), serializeJson(doc));
  private ids = (m: Json) => ((m.documents as { id: string }[] | undefined) ?? []).map((d) => d.id);

  /** Reads a package-relative file path, only if it is safe and inside the episode. */
  private resolveFile(relative: string): string | null {
    return isSafePath(relative) ? join(this.folder, relative) : null;
  }

  // ---------------------------------------------------------------- reading

  view(): DocumentView[] {
    const manifest = this.readManifest();
    const templates = this.templates();
    const entries = (manifest.documents as { id: string; layout: Layout; hidden?: boolean }[] | undefined) ?? [];
    return entries.map((entry) => {
      const base = { id: entry.id, central: manifest.centralDocument === entry.id, hidden: entry.hidden === true, layout: entry.layout };
      let doc: Json;
      try {
        doc = this.readJson(this.docPath(entry.id));
      } catch {
        return { ...base, template: '?', templateName: 'Unreadable document', slots: [], plan: [], readable: false };
      }
      const template = templates[String(doc.template)];
      const slotsJson = (doc.slots as Record<string, Json> | undefined) ?? {};
      // The template decides which slots exist and in what order; any extra ones already in the file follow.
      const defs = template
        ? template.slots.map((s) => ({ name: s.name, kind: s.kind, required: s.required === true, label: s.label ?? '', ...(s.maxLength ? { maxLength: s.maxLength } : {}) }))
        : [];
      for (const name of Object.keys(slotsJson)) {
        if (!defs.some((d) => d.name === name)) defs.push({ name, kind: (slotsJson[name].kind as SlotView['kind']) ?? 'value', required: false, label: '' });
      }
      const slots: SlotView[] = defs.map((def) => {
        const slot = slotsJson[def.name];
        const view: SlotView = { ...def, text: '' };
        if (!slot) return view;
        if (def.kind === 'value') view.text = typeof slot.value === 'string' ? slot.value : '';
        else if (def.kind === 'markdown') {
          if (slot.kind === 'value') view.text = typeof slot.value === 'string' ? slot.value : ''; // an older one-line value in a text part
          else if (typeof slot.text === 'string') view.text = slot.text;
          else if (typeof slot.file === 'string') {
            const file = this.resolveFile(slot.file);
            if (file && existsSync(file)) view.text = readFileSync(file, 'utf8');
          }
        } else if (def.kind === 'image') {
          if (typeof slot.file === 'string') view.image = { file: slot.file, alt: typeof slot.alt === 'string' ? slot.alt : '' };
        } else if (def.kind === 'items') {
          if (slot.kind === 'items') view.items = normaliseItems(slot).content;
          else if (slot.kind === 'markdown') view.legacyText = typeof slot.text === 'string' ? slot.text : this.readMarkdownFile(slot.file);
        }
        return view;
      });
      return {
        ...base,
        template: String(doc.template),
        templateName: (template && templateInfos({ [template.id]: template })[0].name) || String(doc.template),
        slots,
        plan: template ? editorPlan(template) : [],
        readable: true,
      };
    });
  }

  private readMarkdownFile(file: unknown): string {
    const path = typeof file === 'string' ? this.resolveFile(file) : null;
    return path && existsSync(path) ? readFileSync(path, 'utf8') : '';
  }

  // ---------------------------------------------------------------- adding and removing

  add(templateId: string, name: string): Result<string> {
    const template = this.templates()[templateId];
    if (!template) return fail(`There is no document type called "${templateId}".`);
    const manifest = this.readManifest();
    const id = uniqueId(slugify(name) || templateId, this.ids(manifest));
    if (!isValidId(id)) return fail('That name cannot be used.');
    const { document, files } = newDocumentFiles(id, template);
    for (const [path, content] of Object.entries(files)) {
      const target = join(this.folder, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    this.writeDoc(id, document);
    this.writeManifest(addDocumentToManifest(manifest, id, defaultLayout(template.aspect, this.ids(manifest).length, template.defaultWidth)));
    return { ok: true, value: id };
  }

  remove(id: string): Result<true> {
    if (!isValidId(id)) return fail('That is not a document.');
    const manifest = this.readManifest();
    if (!this.ids(manifest).includes(id)) return fail('That document is not in this episode.');
    if (manifest.centralDocument === id) return fail('The main document cannot be removed. Make another document the main one first.');
    // Delete the document's own text files. Images stay, since other documents may use them.
    try {
      const doc = this.readJson(this.docPath(id));
      for (const slot of Object.values((doc.slots as Record<string, Json> | undefined) ?? {})) {
        if (slot.kind === 'markdown' && typeof slot.file === 'string' && slot.file.startsWith(`documents/${id}.`)) {
          const file = this.resolveFile(slot.file);
          if (file) rmSync(file, { force: true });
        }
      }
    } catch {
      /* an unreadable document file is still removed below */
    }
    rmSync(this.docPath(id), { force: true });
    this.writeManifest(removeDocumentFromManifest(manifest, id));
    return ok;
  }

  // ---------------------------------------------------------------- main, hidden, placement

  setCentral(id: string): Result<true> {
    const manifest = this.readManifest();
    if (!this.ids(manifest).includes(id)) return fail('That document is not in this episode.');
    const previous = String(manifest.centralDocument);
    if (previous === id) return ok;
    // The document file's role must agree with the manifest.
    for (const [docId, role] of [[previous, 'supporting'], [id, 'central']] as const) {
      if (!existsSync(this.docPath(docId))) continue;
      const doc = this.readJson(this.docPath(docId));
      doc.role = role;
      this.writeDoc(docId, doc);
    }
    this.writeManifest(setCentralInManifest(manifest, id));
    return ok;
  }

  setHidden(id: string, hidden: boolean): Result<true> {
    const manifest = this.readManifest();
    if (!this.ids(manifest).includes(id)) return fail('That document is not in this episode.');
    if (hidden && manifest.centralDocument === id) return fail('The main document cannot be hidden.');
    this.writeManifest(setHiddenInManifest(manifest, id, hidden));
    return ok;
  }

  setLayout(id: string, layout: Layout): Result<true> {
    const manifest = this.readManifest();
    if (!this.ids(manifest).includes(id)) return fail('That document is not in this episode.');
    this.writeManifest(setLayoutInManifest(manifest, id, clampLayout(layout)));
    return ok;
  }

  // ---------------------------------------------------------------- content

  private editableSlot(id: string, slotName: string): Result<{ doc: Json; slots: Record<string, Json> }> {
    if (!isValidId(id) || !existsSync(this.docPath(id))) return fail('That document is not in this episode.');
    if (!SLOT_NAME.test(slotName)) return fail('That is not a part of the document.');
    const doc = this.readJson(this.docPath(id));
    const slots = (doc.slots as Record<string, Json> | undefined) ?? {};
    doc.slots = slots;
    return { ok: true, value: { doc, slots } };
  }

  setText(id: string, slotName: string, text: string): Result<true> {
    const found = this.editableSlot(id, slotName);
    if (!found.ok) return found;
    const { doc, slots } = found.value;
    const kind = this.slotKind(String(doc.template), slotName, slots[slotName]);
    const limit = this.templates()[String(doc.template)]?.slots.find((x) => x.name === slotName)?.maxLength;
    if (limit && text.length > limit) return fail(`This part can hold at most ${limit} characters.`);
    if (kind === 'value') {
      slots[slotName] = { ...(slots[slotName] ?? {}), kind: 'value', value: text };
      this.writeDoc(id, doc);
    } else if (kind === 'markdown') {
      const existing = slots[slotName];
      if (existing?.kind === 'value') {
        slots[slotName] = { kind: 'markdown', text }; // the part used to hold a one-line value; it becomes text
        this.writeDoc(id, doc);
      } else if (existing && typeof existing.text === 'string') {
        existing.text = text; // text kept inline in the document file stays inline
        this.writeDoc(id, doc);
      } else {
        const relative = typeof existing?.file === 'string' ? existing.file : `documents/${id}.${slotName}.md`;
        const file = this.resolveFile(relative);
        if (!file) return fail('This part of the document points at a file outside the episode, so it cannot be edited here.');
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, text);
        if (!existing || existing.file !== relative) {
          slots[slotName] = { ...(existing ?? {}), kind: 'markdown', file: relative };
          this.writeDoc(id, doc);
        }
      }
    } else return fail('That part of the document is an image, not text.');
    return ok;
  }

  private slotKind(templateId: string, slotName: string, slot?: Json): SlotView['kind'] | undefined {
    const fromTemplate = this.templates()[templateId]?.slots.find((s) => s.name === slotName)?.kind;
    return fromTemplate ?? (slot?.kind as SlotView['kind'] | undefined);
  }

  /** Copies an image into the episode's media/images folder and points the slot at it. */
  importImage(id: string, slotName: string, sourcePath: string): Result<true> {
    const found = this.editableSlot(id, slotName);
    if (!found.ok) return found;
    const { doc, slots } = found.value;
    if (this.slotKind(String(doc.template), slotName, slots[slotName]) !== 'image') return fail('That part of the document is not an image.');
    const extension = basename(sourcePath).split('.').pop()?.toLowerCase() ?? '';
    if (!IMAGE_TYPES.includes(extension)) return fail(`Images must be one of: ${IMAGE_TYPES.join(', ')}.`);
    if (!existsSync(sourcePath)) return fail('That file could not be found.');
    const dir = join(this.folder, 'media', 'images');
    mkdirSync(dir, { recursive: true });
    const name = imageFileName(basename(sourcePath), readdirSync(dir));
    copyFileSync(sourcePath, join(dir, name));
    slots[slotName] = { ...(slots[slotName] ?? {}), kind: 'image', file: `media/images/${name}` };
    this.writeDoc(id, doc);
    return ok;
  }

  /**
   * Saves an itemised list. It is checked again here, strictly: anything the reader would drop is refused instead,
   * so what the author sees is what is saved.
   */
  setItems(id: string, slotName: string, content: unknown): Result<true> {
    const found = this.editableSlot(id, slotName);
    if (!found.ok) return found;
    const { doc, slots } = found.value;
    if (this.slotKind(String(doc.template), slotName, slots[slotName]) !== 'items') return fail('That part of the document is not an item list.');
    const checked = normaliseItems(content);
    if (checked.issues.length > 0) return fail(`The list could not be saved: ${checked.issues.join('; ')}.`);
    slots[slotName] = { ...checked.content }; // kind, currency, tax, items: written in that order
    this.writeDoc(id, doc);
    return ok;
  }

  setImageAlt(id: string, slotName: string, alt: string): Result<true> {
    const found = this.editableSlot(id, slotName);
    if (!found.ok) return found;
    const { doc, slots } = found.value;
    const slot = slots[slotName];
    if (!slot || slot.kind !== 'image') return fail('Choose an image first.');
    if (alt.trim() === '') delete slot.alt;
    else slot.alt = alt;
    this.writeDoc(id, doc);
    return ok;
  }
}
