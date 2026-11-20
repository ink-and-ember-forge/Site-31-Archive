// File work for one episode being edited. No Electron in here, so it can be tested on its own.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { hintFor, type Issue } from '@archive/casefile';
import {
  applyDetails,
  checkDetails,
  isValidId,
  serializeManifest,
  slugify,
  starterEpisodeFiles,
  todayIso,
  type EpisodeDetails,
} from '@archive/casefile/authoring';
import { buildArchive, checkEpisodeFolder, loadThemeFromFs } from '@archive/casefile/node';
import type { Layout } from '@archive/casefile';
import type { EpisodeState, Problem, Result } from '../shared/api';
import { DocumentFiles, templateInfos } from './documents';

export interface Locations {
  /** The shared theme (templates and styles) that ships with the app. */
  themeDir: string;
  /** Where the preview's packaged archive is written. */
  previewDir: string;
}

export const toProblems = (issues: Issue[]): Problem[] =>
  issues.map((i) => ({ severity: i.severity, path: i.path, message: i.message, hint: hintFor(i) }));

export class EpisodeSession {
  private readonly files: DocumentFiles;

  private constructor(
    readonly folder: string,
    readonly id: string,
    private readonly where: Locations,
  ) {
    this.files = new DocumentFiles(folder, () => loadThemeFromFs(where.themeDir).theme.templates);
  }

  /** Creates `<parent>/<id>` from the title, with a valid placeholder document, and opens it. */
  static async create(parent: string, title: string, where: Locations, today = todayIso()): Promise<Result<EpisodeSession>> {
    const id = slugify(title);
    if (!isValidId(id)) return { ok: false, message: 'The title needs at least one letter or number, because the folder is named after it.' };
    const folder = join(parent, id);
    if (existsSync(folder)) return { ok: false, message: `There is already something called "${id}" in that location. Choose another location or change the title.` };
    for (const [file, content] of Object.entries(starterEpisodeFiles(id, title, today))) {
      const target = join(folder, file);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    return { ok: true, value: new EpisodeSession(folder, id, where) };
  }

  /** Opens an existing episode folder. An episode that cannot open at all is refused, with the reasons. */
  static async open(folder: string, where: Locations): Promise<Result<EpisodeSession>> {
    if (!existsSync(join(folder, 'case.json'))) {
      return { ok: false, message: 'That folder is not an episode: it has no case.json file.' };
    }
    const { theme } = loadThemeFromFs(where.themeDir);
    const check = await checkEpisodeFolder(resolve(folder), theme);
    if (!check.casefile) {
      return { ok: false, message: 'This episode has problems that stop it opening. Fix them, then open it again.', problems: toProblems(check.errors) };
    }
    return { ok: true, value: new EpisodeSession(resolve(folder), check.id, where) };
  }

  private manifestPath = () => join(this.folder, 'case.json');

  details(): EpisodeDetails {
    const m = JSON.parse(readFileSync(this.manifestPath(), 'utf8')) as Record<string, unknown>;
    return {
      title: String(m.title ?? ''),
      submissionDate: String(m.submissionDate ?? ''),
      folderLabel: typeof m.folderLabel === 'string' ? m.folderLabel : undefined,
      order: typeof m.order === 'number' ? m.order : undefined,
    };
  }

  /** Saves the form values into case.json, leaving everything else in the file as it was. */
  saveDetails(details: EpisodeDetails): Result<true> {
    const problems = checkDetails(details);
    if (problems.length > 0) return { ok: false, message: problems.join(' ') };
    const manifest = JSON.parse(readFileSync(this.manifestPath(), 'utf8')) as Record<string, unknown>;
    writeFileSync(this.manifestPath(), serializeManifest(applyDetails(manifest, details)));
    return { ok: true, value: true };
  }

  /** Problems found now, in plain English. */
  async problems(): Promise<Problem[]> {
    const { theme } = loadThemeFromFs(this.where.themeDir);
    const check = await checkEpisodeFolder(this.folder, theme);
    return toProblems([...check.errors, ...check.warnings]);
  }

  async state(): Promise<EpisodeState> {
    return {
      folder: this.folder,
      id: this.id,
      details: this.details(),
      documents: this.files.view(),
      templates: templateInfos(loadThemeFromFs(this.where.themeDir).theme.templates),
      problems: await this.problems(),
    };
  }

  // Document changes. Each returns quickly and the caller rebuilds the preview afterwards.
  addDocument = (template: string, name: string) => this.files.add(template, name);
  removeDocument = (id: string) => this.files.remove(id);
  setCentral = (id: string) => this.files.setCentral(id);
  setHidden = (id: string, hidden: boolean) => this.files.setHidden(id, hidden);
  setLayout = (id: string, layout: Layout) => this.files.setLayout(id, layout);
  setSlotText = (id: string, slot: string, text: string) => this.files.setText(id, slot, text);
  importImage = (id: string, slot: string, sourcePath: string) => this.files.importImage(id, slot, sourcePath);
  setImageAlt = (id: string, slot: string, alt: string) => this.files.setImageAlt(id, slot, alt);

  /** Packages the episode exactly as the website does, so the real viewer can show it. */
  async buildPreview(): Promise<void> {
    mkdirSync(this.where.previewDir, { recursive: true });
    await buildArchive({
      episodesDir: join(this.where.previewDir, '.no-episodes'),
      extraEpisodeDirs: [this.folder],
      themeDir: this.where.themeDir,
      outDir: this.where.previewDir,
    });
  }
}
