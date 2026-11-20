import { extractSpanIds } from './markdown';
import { isSafePath, type PackageSource } from './source';
import type {
  Casefile,
  DocumentDef,
  Hotspot,
  Issue,
  LedgerRef,
  LoadResult,
  Manifest,
  RegistryEntry,
  Style,
  Template,
} from './types';
import { describeErrors, validateDocument, validateHotspot, validateLedger, validateManifest, validateRegistryEntry, validateStyle, validateTemplate } from './validate';
import { upgradeManifest } from './version';

export interface LoadOptions {
  /** If given, the manifest id must equal it (the folder or file name). */
  expectedId?: string;
}

async function readJson(source: PackageSource, path: string): Promise<{ value?: unknown; error?: string }> {
  const text = await source.readText(path);
  if (text === undefined) return { error: 'file is missing' };
  try {
    return { value: JSON.parse(text) };
  } catch {
    return { error: 'not valid JSON' };
  }
}

/** Last path segment without `.json`. */
function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.json$/, '');
}

/**
 * Loads and validates one episode. Tolerance rules:
 * - an unreadable or invalid manifest, or a missing central document, fails the episode;
 * - everything else (supporting documents, hotspots, registry, ledger, voiceover,
 *   templates, styles) is dropped with a warning and the episode still opens.
 */
export async function loadCasefile(source: PackageSource, options: LoadOptions = {}): Promise<LoadResult> {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const fail = (path: string, message: string): LoadResult => {
    errors.push({ severity: 'error', path, message });
    return { ok: false, errors, warnings };
  };
  const warn = (path: string, message: string) => warnings.push({ severity: 'warning', path, message });

  // --- manifest (required) ---
  const rawManifest = await readJson(source, 'case.json');
  if (rawManifest.error) return fail('case.json', rawManifest.error);
  if (typeof rawManifest.value !== 'object' || rawManifest.value === null || Array.isArray(rawManifest.value)) {
    return fail('case.json', 'must be a JSON object');
  }
  const upgraded = upgradeManifest(rawManifest.value as Record<string, unknown>);
  if (!upgraded.ok) return fail('case.json', upgraded.message);
  if (!validateManifest(upgraded.manifest)) return fail('case.json', describeErrors(validateManifest));
  const manifest = upgraded.manifest as unknown as Manifest;

  if (options.expectedId && manifest.id !== options.expectedId) {
    return fail('case.json', `id "${manifest.id}" must match its folder name "${options.expectedId}"`);
  }
  const listed = new Set<string>();
  for (const entry of manifest.documents) {
    if (listed.has(entry.id)) return fail('case.json', `document "${entry.id}" is listed twice`);
    listed.add(entry.id);
  }
  if (!listed.has(manifest.centralDocument)) {
    return fail('case.json', `centralDocument "${manifest.centralDocument}" is not in the documents list`);
  }

  // --- episode-level template and style overrides (optional) ---
  const templates: Record<string, Template> = {};
  for (const path of await source.list('templates/')) {
    if (!path.endsWith('.json')) continue;
    const raw = await readJson(source, path);
    if (raw.error || !validateTemplate(raw.value)) {
      warn(path, raw.error ?? describeErrors(validateTemplate));
    } else templates[baseName(path)] = raw.value as unknown as Template;
  }
  const styles: Record<string, Style> = {};
  for (const path of await source.list('styles/')) {
    if (!path.endsWith('.json')) continue;
    const raw = await readJson(source, path);
    if (raw.error || !validateStyle(raw.value)) {
      warn(path, raw.error ?? describeErrors(validateStyle));
    } else styles[baseName(path)] = raw.value as unknown as Style;
  }

  // --- documents ---
  const documents: DocumentDef[] = [];
  const spansByDoc = new Map<string, Map<string, string>>(); // doc id -> slot -> markdown
  const rawHotspotsByDoc = new Map<string, unknown[]>(); // validated once registry entries are known
  for (const entry of manifest.documents) {
    const path = `documents/${entry.id}.json`;
    const raw = await readJson(source, path);
    const isCentral = entry.id === manifest.centralDocument;
    const problem = raw.error ?? (validateDocument(raw.value) ? undefined : describeErrors(validateDocument));
    if (problem) {
      if (isCentral) return fail(path, `central document cannot be loaded: ${problem}`);
      warn(path, `document dropped: ${problem}`);
      continue;
    }
    const value = raw.value as Record<string, unknown>;
    const expectedRole = isCentral ? 'central' : 'supporting';
    if (value.role !== expectedRole) warn(path, `role "${String(value.role)}" disagrees with the manifest; using "${expectedRole}"`);

    // slots: drop ones whose files are missing or unsafe
    const slots: DocumentDef['slots'] = {};
    const markdownBySlot = new Map<string, string>();
    for (const [name, slot] of Object.entries((value.slots ?? {}) as DocumentDef['slots'])) {
      if (slot.kind === 'markdown') {
        let text = slot.text;
        if (text === undefined && slot.file !== undefined) {
          text = isSafePath(slot.file) ? await source.readText(slot.file) : undefined;
          if (text === undefined) {
            warn(path, `slot "${name}" dropped: file "${slot.file}" is missing or unsafe`);
            continue;
          }
        }
        markdownBySlot.set(name, text ?? '');
      } else if (slot.kind === 'image') {
        if (!isSafePath(slot.file) || (await source.readBytes(slot.file)) === undefined) {
          warn(path, `slot "${name}" dropped: image "${slot.file}" is missing or unsafe`);
          continue;
        }
      }
      slots[name] = slot;
    }
    spansByDoc.set(entry.id, markdownBySlot);
    documents.push({
      id: entry.id,
      template: value.template as string,
      style: value.style as string | undefined,
      role: expectedRole,
      slots,
      hotspots: [],
    });
    rawHotspotsByDoc.set(entry.id, Array.isArray(value.hotspots) ? value.hotspots : []);
  }

  // --- registry (optional) ---
  const registry: RegistryEntry[] = [];
  for (const path of await source.list('registry/')) {
    if (!path.endsWith('.json')) continue;
    const raw = await readJson(source, path);
    if (raw.error || !validateRegistryEntry(raw.value)) {
      warn(path, `entry dropped: ${raw.error ?? describeErrors(validateRegistryEntry)}`);
      continue;
    }
    const entry = raw.value as Omit<RegistryEntry, 'globalId'>;
    if (entry.id !== baseName(path)) {
      warn(path, `entry dropped: id "${entry.id}" must match the file name`);
      continue;
    }
    registry.push({
      ...entry,
      globalId: `${manifest.id}/${entry.id}`,
      fields: entry.fields ?? [],
      references: entry.references ?? [],
    });
  }
  const ownEntries = new Set(registry.map((e) => e.globalId));

  // --- hotspots ---
  const reachable = new Set<string>();
  for (const doc of documents) {
    const path = `documents/${doc.id}.json`;
    const rawHotspots = rawHotspotsByDoc.get(doc.id) ?? [];
    const seen = new Set<string>();
    rawHotspots.forEach((raw, index) => {
      const where = `${path} hotspots[${index}]`;
      const drop = (why: string) => warn(where, `hotspot dropped: ${why}`);
      if (!validateHotspot(raw)) return drop(describeErrors(validateHotspot));
      const hotspot = raw as unknown as Hotspot;
      if (seen.has(hotspot.id)) return drop(`duplicate id "${hotspot.id}"`);
      if (hotspot.anchor.type === 'text') {
        const markdown = spansByDoc.get(doc.id)?.get(hotspot.anchor.slot);
        if (markdown === undefined) return drop(`text slot "${hotspot.anchor.slot}" does not exist`);
        if (!extractSpanIds(markdown).includes(hotspot.id)) return drop(`no [text]{#${hotspot.id}} span in slot "${hotspot.anchor.slot}"`);
      }
      const target = hotspot.target;
      if (target.type === 'document') {
        if (!listed.has(target.document)) return drop(`target document "${target.document}" is not in this episode`);
        reachable.add(target.document);
      } else if (target.type === 'registry') {
        const [episode] = target.entry.split('/');
        // Other episodes may be unpublished, so only this episode's own entries are checked.
        if (episode === manifest.id && !ownEntries.has(target.entry)) return drop(`registry entry "${target.entry}" does not exist`);
      } else if (target.file !== undefined && (!isSafePath(target.file))) {
        return drop(`lightbox file "${target.file}" is unsafe`);
      }
      seen.add(hotspot.id);
      doc.hotspots.push(hotspot);
    });
  }
  for (const entry of manifest.documents) {
    if (entry.hidden && !reachable.has(entry.id)) warn('case.json', `hidden document "${entry.id}" is never opened by any hotspot`);
  }

  // --- ledger (optional) ---
  let ledger: LedgerRef[] = [];
  if ((await source.readBytes('ledger.json')) !== undefined) {
    const raw = await readJson(source, 'ledger.json');
    if (raw.error || !validateLedger(raw.value)) warn('ledger.json', `ignored: ${raw.error ?? describeErrors(validateLedger)}`);
    else ledger = (raw.value as { entries: LedgerRef[] }).entries;
  }

  // --- voiceover (optional) ---
  if (manifest.voiceover) {
    const file = manifest.voiceover.file;
    if (!isSafePath(file) || (await source.readBytes(file)) === undefined) {
      warn('case.json', `voiceover dropped: file "${file}" is missing or unsafe`);
      delete manifest.voiceover;
    }
  }

  const casefile: Casefile = { manifest, documents, registry, ledger, templates, styles };
  return { ok: true, casefile, warnings };
}
