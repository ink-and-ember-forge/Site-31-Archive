// Pure helpers the authoring tool uses to create and update an episode's files.
// Kept here, next to the format, so the tool and the format cannot drift apart.
import { CURRENT_FORMAT_VERSION } from './types';

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
