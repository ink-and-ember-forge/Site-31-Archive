import {
  loadCasefile,
  resolveStyle,
  resolveTemplate,
  zipSource,
  type ArchiveIndex,
  type ChoicesContent,
  type ItemsContent,
  type ArchiveIndexEntry,
  type Casefile,
  type DocumentDef,
  type Issue,
  type Layout,
  type NoteVariant,
  type PackageSource,
  type RegistryEntry,
  type Style,
  type Template,
  type Theme,
} from '@archive/casefile';
import { parseMarkdown, type MdBlock } from './markdown';

const base = import.meta.env.BASE_URL;

export type Content =
  | { kind: 'markdown'; blocks: MdBlock[] }
  | { kind: 'image'; url: string; alt: string }
  | { kind: 'value'; value: string }
  | ItemsContent
  | ChoicesContent;

export interface LightboxContent {
  variant: NoteVariant;
  title?: string;
  blocks: MdBlock[];
}

export interface LoadedDoc {
  id: string;
  def: DocumentDef;
  template: Template;
  style: Style;
  layout: Layout;
  hidden: boolean;
  content: Record<string, Content>;
  /** Light-box content by hotspot id. */
  lightboxes: Record<string, LightboxContent>;
}

export interface OpenEpisode {
  casefile: Casefile;
  docs: LoadedDoc[];
  warnings: Issue[];
  /** Release blob URLs created for images. */
  dispose: () => void;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const loadIndex = () => getJson<ArchiveIndex>('archive/index.json');
export const loadTheme = () => getJson<Theme>('archive/theme.json');

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

async function readContent(source: PackageSource, def: DocumentDef, urls: string[]): Promise<Record<string, Content>> {
  const content: Record<string, Content> = {};
  for (const [name, slot] of Object.entries(def.slots)) {
    if (slot.kind === 'value') content[name] = { kind: 'value', value: slot.value };
    else if (slot.kind === 'items' || slot.kind === 'choices') content[name] = slot; // drawn by the blocks that use them
    else if (slot.kind === 'markdown') {
      const text = slot.text ?? (slot.file ? await source.readText(slot.file) : undefined) ?? '';
      content[name] = { kind: 'markdown', blocks: parseMarkdown(text) };
    } else {
      const bytes = await source.readBytes(slot.file);
      if (!bytes) continue;
      const ext = slot.file.split('.').pop()?.toLowerCase() ?? '';
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: MIME[ext] ?? 'application/octet-stream' }));
      urls.push(url);
      content[name] = { kind: 'image', url, alt: slot.alt ?? '' };
    }
  }
  return content;
}

async function fetchCasefile(entry: ArchiveIndexEntry) {
  const res = await fetch(`${base}archive/${entry.file}`);
  if (!res.ok) throw new Error(`${entry.file}: HTTP ${res.status}`);
  const source = zipSource(new Uint8Array(await res.arrayBuffer()));
  const result = await loadCasefile(source, { expectedId: entry.id });
  if (!result.ok) throw new Error(result.errors.map((e) => `${e.path}: ${e.message}`).join('; '));
  return { source, casefile: result.casefile, warnings: result.warnings };
}

/** Registry entries of another episode, for cross-references. */
export async function loadRegistryEntries(entry: ArchiveIndexEntry): Promise<RegistryEntry[]> {
  return (await fetchCasefile(entry)).casefile.registry;
}

async function readLightboxes(source: PackageSource, def: DocumentDef): Promise<Record<string, LightboxContent>> {
  const out: Record<string, LightboxContent> = {};
  for (const h of def.hotspots) {
    if (h.target.type !== 'lightbox') continue;
    const text = h.target.text ?? (h.target.file ? await source.readText(h.target.file) : undefined) ?? '';
    out[h.id] = { variant: h.target.variant ?? 'formal', title: h.target.title, blocks: parseMarkdown(text) };
  }
  return out;
}

export async function openEpisode(entry: ArchiveIndexEntry, theme: Theme): Promise<OpenEpisode> {
  const { source, casefile, warnings } = await fetchCasefile(entry);
  const urls: string[] = [];
  const docs: LoadedDoc[] = [];
  for (const item of casefile.manifest.documents) {
    const def = casefile.documents.find((d) => d.id === item.id);
    if (!def) continue; // dropped by the loader, which already warned
    const template = resolveTemplate(def.template, casefile, theme);
    docs.push({
      id: def.id,
      def,
      template,
      style: resolveStyle(def.style, template, casefile, theme),
      layout: item.layout,
      hidden: item.hidden === true,
      content: await readContent(source, def, urls),
      lightboxes: await readLightboxes(source, def),
    });
  }
  for (const w of warnings) console.warn(`${entry.id}/${w.path}: ${w.message}`);
  return { casefile, docs, warnings, dispose: () => urls.forEach((u) => URL.revokeObjectURL(u)) };
}
