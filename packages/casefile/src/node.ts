// Node-only helpers: reading folders and building the archive.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { zipSync } from 'fflate';
import { loadCasefile } from './loader';
import { isSafePath, type PackageSource } from './source';
import { checkAgainstTheme, type Theme } from './theme';
import type { ArchiveIndex, ArchiveIndexEntry, Issue, Style, Template } from './types';
import { CURRENT_FORMAT_VERSION } from './types';
import { describeErrors, validateStyle, validateTemplate } from './validate';

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

/** Files directly relevant to a package; dotfiles such as .gitkeep are ignored. */
function packageFiles(root: string): string[] {
  return walk(root)
    .map((file) => relative(root, file).split(sep).join('/'))
    .filter((path) => !path.split('/').some((part) => part.startsWith('.')))
    .sort();
}

export function fsSource(root: string): PackageSource {
  const decoder = new TextDecoder();
  return {
    async readBytes(path) {
      if (!isSafePath(path)) return undefined;
      const full = join(root, path);
      return existsSync(full) && statSync(full).isFile() ? new Uint8Array(readFileSync(full)) : undefined;
    },
    async readText(path) {
      const bytes = await this.readBytes(path);
      return bytes ? decoder.decode(bytes) : undefined;
    },
    async list(prefix) {
      return packageFiles(root).filter((p) => p.startsWith(prefix));
    },
  };
}

/** Zips a package folder deterministically (same input gives the same bytes). */
export function zipFolder(root: string): Uint8Array {
  const when = new Date('2000-01-01T00:00:00Z');
  const entries: Record<string, [Uint8Array, { mtime: Date }]> = {};
  for (const path of packageFiles(root)) entries[path] = [new Uint8Array(readFileSync(join(root, path))), { mtime: when }];
  return zipSync(entries, { level: 6 });
}

export interface ThemeLoad {
  theme: Theme;
  issues: Issue[];
}

export function loadThemeFromFs(themeDir: string): ThemeLoad {
  const theme: Theme = { templates: {}, styles: {} };
  const issues: Issue[] = [];
  const read = <T>(sub: string, validate: typeof validateTemplate | typeof validateStyle, into: Record<string, T>) => {
    for (const file of walk(join(themeDir, sub)).filter((f) => f.endsWith('.json')).sort()) {
      const path = `theme/${sub}/${file.slice(file.lastIndexOf(sep) + 1)}`;
      try {
        const value = JSON.parse(readFileSync(file, 'utf8')) as { id?: string };
        if (!validate(value)) issues.push({ severity: 'error', path, message: describeErrors(validate) });
        else into[value.id as string] = value as T;
      } catch {
        issues.push({ severity: 'error', path, message: 'not valid JSON' });
      }
    }
  };
  read<Template>('templates', validateTemplate, theme.templates);
  read<Style>('styles', validateStyle, theme.styles);
  return { theme, issues };
}

export interface BuildOptions {
  episodesDir: string;
  themeDir: string;
  outDir: string;
  /** Extra episode folders to include (for example the placeholder sample). */
  extraEpisodeDirs?: string[];
}

export interface BuildResult {
  index: ArchiveIndex;
  errors: Issue[];
  warnings: Issue[];
}

/**
 * Builds the publishable archive: one `<id>.casefile` per episode folder, an
 * `index.json` generated from each `case.json`, and `theme.json` plus theme assets.
 * Errors (an episode that cannot load, duplicate ids, a broken theme) mean the build should fail.
 */
export async function buildArchive(options: BuildOptions): Promise<BuildResult> {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];

  const themeLoad = loadThemeFromFs(options.themeDir);
  errors.push(...themeLoad.issues);

  const folders = [
    ...(existsSync(options.episodesDir) ? readdirSync(options.episodesDir, { withFileTypes: true }) : [])
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
      .map((e) => join(options.episodesDir, e.name)),
    ...(options.extraEpisodeDirs ?? []),
  ].sort();

  rmSync(options.outDir, { recursive: true, force: true });
  mkdirSync(options.outDir, { recursive: true });

  const entries: ArchiveIndexEntry[] = [];
  const seen = new Set<string>();
  for (const folder of folders) {
    const id = folder.slice(folder.lastIndexOf(sep) + 1);
    const tag = (issue: Issue): Issue => ({ ...issue, path: `${id}/${issue.path}` });
    const result = await loadCasefile(fsSource(folder), { expectedId: id });
    if (!result.ok) {
      errors.push(...result.errors.map(tag));
      warnings.push(...result.warnings.map(tag));
      continue;
    }
    warnings.push(...result.warnings.map(tag), ...checkAgainstTheme(result.casefile, themeLoad.theme).map(tag));
    if (seen.has(id)) {
      errors.push({ severity: 'error', path: id, message: 'duplicate episode id' });
      continue;
    }
    seen.add(id);
    const bytes = zipFolder(folder);
    const file = `${id}.casefile`;
    writeFileSync(join(options.outDir, file), bytes);
    const m = result.casefile.manifest;
    entries.push({
      id,
      title: m.title,
      submissionDate: m.submissionDate,
      ...(m.folderLabel !== undefined && { folderLabel: m.folderLabel }),
      ...(m.order !== undefined && { order: m.order }),
      file,
      bytes: bytes.length,
    });
  }

  entries.sort(
    (a, b) =>
      (a.order ?? Infinity) - (b.order ?? Infinity) ||
      a.submissionDate.localeCompare(b.submissionDate) ||
      a.id.localeCompare(b.id),
  );
  const index: ArchiveIndex = { formatVersion: CURRENT_FORMAT_VERSION, episodes: entries };
  writeFileSync(join(options.outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  writeFileSync(join(options.outDir, 'theme.json'), JSON.stringify(themeLoad.theme, null, 2) + '\n');
  if (existsSync(join(options.themeDir, 'assets'))) cpSync(join(options.themeDir, 'assets'), join(options.outDir, 'theme-assets'), { recursive: true });

  return { index, errors, warnings };
}
