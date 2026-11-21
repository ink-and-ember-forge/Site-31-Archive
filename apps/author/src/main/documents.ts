// Reading and changing the documents of one episode folder. No Electron in here.
// Every change reads the file, changes only what it means to, and writes it back, so anything the
// author (or a later step) has added, such as hotspots, is left exactly as it was.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { isSafePath, normaliseItems, validateHotspot, describeErrors, type Hotspot, type ItemsContent, type Layout, type Template } from '@archive/casefile';
import {
  addDocumentToManifest,
  clampLayout,
  clampRect,
  defaultLayout,
  editorPlan,
  imageFileName,
  isValidId,
  newDocumentFiles,
  removeSpan,
  spansIn,
  removeDocumentFromManifest,
  serializeJson,
  serializeManifest,
  setCentralInManifest,
  setHiddenInManifest,
  setLayoutInManifest,
  slugify,
  uniqueId,
} from '@archive/casefile/authoring';
import type { DocumentView, HotspotView, Result, SlotView, TemplateInfo } from '../shared/api';

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
        return { ...base, template: '?', templateName: 'Unreadable document', slots: [], plan: [], hotspots: [], readable: false };
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
        hotspots: this.hotspotViews(doc, slots),
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

  // ---------------------------------------------------------------- hotspots

  /** The document's hotspots as the form shows them: the words a text hotspot is on, and a note's text. */
  private hotspotViews(doc: Json, slots: SlotView[]): HotspotView[] {
    const raw = Array.isArray(doc.hotspots) ? (doc.hotspots as unknown[]) : [];
    const out: HotspotView[] = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object' || typeof (entry as Json).id !== 'string') continue;
      const h = entry as unknown as Hotspot;
      // A hotspot a hand edit left without an anchor or target still gets a safe one, so the form can show it and repair it.
      const anchor = h.anchor && typeof h.anchor === 'object' && typeof (h.anchor as { type?: unknown }).type === 'string' ? h.anchor : ({ type: 'rect', x: 0, y: 0, width: 0.1, height: 0.1 } as const);
      const target = h.target && typeof h.target === 'object' && typeof (h.target as { type?: unknown }).type === 'string' ? h.target : ({ type: 'lightbox', text: '' } as const);
      const view: HotspotView = { id: h.id, anchor, target, valid: validateHotspot(entry) };
      if (anchor.type === 'text') {
        const text = slots.find((s) => s.name === anchor.slot)?.text ?? '';
        view.words = spansIn(text).find((sp) => sp.id === h.id)?.words;
      }
      if (target.type === 'lightbox') {
        view.noteText = target.text ?? (target.file && this.resolveFile(target.file) && existsSync(join(this.folder, target.file)) ? readFileSync(join(this.folder, target.file), 'utf8') : '');
      }
      out.push(view);
    }
    return out;
  }

  private hotspotList(doc: Json): Hotspot[] {
    if (!Array.isArray(doc.hotspots)) doc.hotspots = [];
    return doc.hotspots as unknown as Hotspot[];
  }

  /** Checks a hotspot the way the reader's loader would, plus what only this episode can know. */
  private checkHotspot(hotspot: unknown, doc: Json, others: Hotspot[]): Result<Hotspot> {
    if (!validateHotspot(hotspot)) return fail(`That clickable part is not valid: ${describeErrors(validateHotspot)}`);
    const h = hotspot as unknown as Hotspot;
    if (others.some((o) => o.id === h.id)) return fail(`There is already a clickable part called "${h.id}" in this document.`);
    const t = h.target;
    if (t.type === 'document') {
      if (t.document === String(doc.id ?? '')) return fail('A clickable part cannot open the document it is on.');
      if (!this.ids(this.readManifest()).includes(t.document)) return fail(`There is no document called "${t.document}" in this episode.`);
    }
    return { ok: true, value: h };
  }

  /**
   * Makes words clickable: writes the text (which now holds the marked words) and adds the hotspot in one step, so the
   * words and the hotspot can never be saved without each other.
   */
  addTextHotspot(id: string, slotName: string, newText: string, hotspot: unknown): Result<true> {
    const found = this.editableSlot(id, slotName);
    if (!found.ok) return found;
    const { doc, slots } = found.value;
    if (this.slotKind(String(doc.template), slotName, slots[slotName]) !== 'markdown') return fail('Only written text can have clickable words.');
    const list = this.hotspotList(doc);
    const checked = this.checkHotspot(hotspot, { ...doc, id }, list);
    if (!checked.ok) return checked;
    const h = checked.value;
    if (h.anchor.type !== 'text' || h.anchor.slot !== slotName) return fail('That clickable part is not on this text.');
    if (!spansIn(newText).some((sp) => sp.id === h.id)) return fail('The text does not have the marked words for this clickable part.');
    const wrote = this.setText(id, slotName, newText);
    if (!wrote.ok) return wrote;
    const again = this.editableSlot(id, slotName);
    if (!again.ok) return again;
    this.hotspotList(again.value.doc).push(h);
    this.writeDoc(id, again.value.doc);
    return ok;
  }

  /** Adds a box hotspot, for a picture or receipt where there are no words to mark. */
  addRectHotspot(id: string, hotspot: unknown): Result<true> {
    const found = this.editableSlot(id, 'x');
    if (!found.ok) return found;
    const { doc } = found.value;
    const h = hotspot as Hotspot;
    if (!h || h.anchor?.type !== 'rect') return fail('That is not a box.');
    const clean = { ...h, anchor: clampRect(h.anchor) };
    const list = this.hotspotList(doc);
    const checked = this.checkHotspot(clean, { ...doc, id }, list);
    if (!checked.ok) return checked;
    list.push(checked.value);
    this.writeDoc(id, doc);
    return ok;
  }

  /**
   * Replaces a hotspot with an edited one (same id). A note whose text lives in its own file keeps that file, so the file
   * is rewritten instead of the text being moved into the document.
   */
  setHotspot(id: string, hotspot: unknown): Result<true> {
    const found = this.editableSlot(id, 'x');
    if (!found.ok) return found;
    const { doc } = found.value;
    const list = this.hotspotList(doc);
    const h = hotspot as Hotspot;
    const at = list.findIndex((o) => o.id === (h as { id?: unknown })?.id);
    if (at < 0) return fail('That clickable part is not in this document.');
    const before = list[at];
    let next = h;
    if (h.anchor?.type === 'rect') next = { ...h, anchor: clampRect(h.anchor) };
    // The anchor is fixed once made: only what it opens and its label change here.
    if (JSON.stringify(next.anchor) !== JSON.stringify(before.anchor) && before.anchor?.type === 'text') return fail('The words a clickable part is on cannot be changed here.');
    let files: { path: string; text: string } | undefined;
    if (next.target?.type === 'lightbox' && before.target?.type === 'lightbox' && before.target.file) {
      const path = this.resolveFile(before.target.file);
      if (!path) return fail('This note points at a file outside the episode, so it cannot be edited here.');
      files = { path, text: next.target.text ?? '' };
      const { text: _gone, ...rest } = next.target;
      next = { ...next, target: { ...rest, file: before.target.file } };
    }
    const checked = this.checkHotspot(next, { ...doc, id }, list.filter((_, i) => i !== at));
    if (!checked.ok) return checked;
    if (files) {
      mkdirSync(dirname(files.path), { recursive: true });
      writeFileSync(files.path, files.text);
    }
    // Only the anchor and target come from the form; anything else the file has on this hotspot (such as a label) is kept.
    list[at] = { ...before, ...checked.value };
    this.writeDoc(id, doc);
    return ok;
  }

  /**
   * Removes a hotspot. For one on words, the mark is taken off the words and the text is saved without it, so no mark is
   * left behind. `newText` is the text as the author has it now, which may be ahead of what is saved.
   */
  removeHotspot(id: string, hotspotId: string, newText?: string): Result<true> {
    const found = this.editableSlot(id, 'x');
    if (!found.ok) return found;
    const { doc } = found.value;
    const list = this.hotspotList(doc);
    const at = list.findIndex((o) => o.id === hotspotId);
    if (at < 0) return fail('That clickable part is not in this document.');
    const gone = list[at];
    // The mark comes off the words first: if that cannot be written, nothing has changed and the hotspot is still there.
    if (gone.anchor?.type === 'text') {
      const slot = gone.anchor.slot;
      const current = newText ?? this.slotText(id, slot);
      if (current !== undefined && SLOT_NAME.test(slot)) {
        const wrote = this.setText(id, slot, removeSpan(current, hotspotId));
        if (!wrote.ok) return wrote;
      }
    }
    const again = this.editableSlot(id, 'x');
    if (!again.ok) return again;
    const latest = this.hotspotList(again.value.doc);
    again.value.doc.hotspots = latest.filter((o) => o.id !== hotspotId);
    this.writeDoc(id, again.value.doc);
    return ok;
  }

  /** The saved text of a text slot, wherever it lives. */
  private slotText(id: string, slotName: string): string | undefined {
    const found = this.editableSlot(id, slotName);
    if (!found.ok) return undefined;
    const slot = found.value.slots[slotName];
    if (!slot) return undefined;
    if (typeof slot.text === 'string') return slot.text;
    if (typeof slot.file === 'string') {
      const file = this.resolveFile(slot.file);
      if (file && existsSync(file)) return readFileSync(file, 'utf8');
    }
    return undefined;
  }

}
