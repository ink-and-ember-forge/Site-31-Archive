import type { Issue } from './types';

export interface EpisodeReport {
  id: string;
  errors: Issue[];
  warnings: Issue[];
}

/** A plain-English suggestion for the most common problems, or undefined if there is nothing useful to add. */
export function hintFor(issue: Issue): string | undefined {
  const m = issue.message;
  if (m.includes('not valid JSON')) return 'Look for a missing or extra comma, quote or bracket near where you last edited.';
  if (m.includes('file is missing')) return 'Check the file name and that the file is inside this episode folder.';
  if (m.includes('must match its folder name')) return 'The "id" in case.json must be exactly the same as the episode folder name.';
  if (m.includes('is not in the documents list')) return 'Add the document to the "documents" list in case.json, or fix the id.';
  if (m.includes('newer than this viewer supports')) return 'This episode was made with a newer format than the viewer understands. Update the viewer.';
  if (m.includes('is missing or unsafe')) return 'Paths are relative to the episode folder and cannot use "..".';
  if (m.includes('span in slot')) return 'Wrap the words in the text like [the words]{#hotspot-id}, or remove the hotspot.';
  if (m.includes('unknown template')) return 'Use a template that exists in the theme/ folder, or add a new template there.';
  if (m.includes('unknown style')) return 'Use a style that exists in the theme/ folder, or add a new style there.';
  if (m.includes('never opened by any hotspot')) return 'Add a hotspot that opens this document, or remove "hidden": true.';
  if (m.includes('expects slot')) return 'This type of document has a part that is not filled in yet. Fill it in, or choose it in the document form.';
  if (m.includes('must have required property')) return 'A required field is missing. See docs/writing-an-episode.md.';
  return undefined;
}

function line(mark: string, issue: Issue): string[] {
  const out = [`    ${mark} ${issue.path}`, `        ${issue.message}`];
  const hint = hintFor(issue);
  if (hint) out.push(`        Hint: ${hint}`);
  return out;
}

/** Human-readable report for the terminal. */
export function formatReport(themeIssues: Issue[], reports: EpisodeReport[]): string {
  const out: string[] = [];
  if (themeIssues.length > 0) {
    out.push('Theme', ...themeIssues.flatMap((i) => line('✗', i)), '');
  }
  if (reports.length === 0) out.push('No episodes found in episodes/.', '');
  for (const r of reports) {
    const status = r.errors.length > 0 ? '✗ cannot open' : r.warnings.length > 0 ? '⚠ opens, with warnings' : '✓ ok';
    out.push(`${r.id}: ${status}`);
    for (const e of r.errors) out.push(...line('✗', e));
    for (const w of r.warnings) out.push(...line('⚠', w));
    out.push('');
  }
  const errorCount = themeIssues.length + reports.reduce((n, r) => n + r.errors.length, 0);
  const warningCount = reports.reduce((n, r) => n + r.warnings.length, 0);
  out.push(reports.length === 0 && errorCount === 0 ? 'Nothing to check yet.' : errorCount > 0 ? `${errorCount} error(s) to fix, ${warningCount} warning(s).` : warningCount > 0 ? `No errors. ${warningCount} warning(s) to look at.` : 'All good.');
  return out.join('\n');
}
