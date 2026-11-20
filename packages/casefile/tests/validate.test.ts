import { cpSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildArchive, validateEpisodes } from '../src/node';
import { formatReport, hintFor } from '../src/report';
import { minimalPath, repoTheme, samplePath } from './helpers';

function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'validate-test-'));
  const episodesDir = join(dir, 'episodes');
  mkdirSync(episodesDir);
  return { dir, episodesDir, outDir: join(dir, 'out') };
}

describe('validateEpisodes', () => {
  it('reports a clean episode as ok', async () => {
    const { episodesDir } = workspace();
    cpSync(minimalPath, join(episodesDir, 'minimal'), { recursive: true });
    const r = await validateEpisodes({ episodesDir, themeDir: repoTheme });
    expect(r.themeIssues).toEqual([]);
    expect(r.episodes.map((e) => [e.id, e.errors.length, e.warnings.length])).toEqual([['minimal', 0, 0]]);
    expect(formatReport(r.themeIssues, r.episodes)).toContain('minimal: ✓ ok');
  });

  it('can check just one named folder', async () => {
    const { episodesDir } = workspace();
    cpSync(minimalPath, join(episodesDir, 'minimal'), { recursive: true });
    cpSync(samplePath, join(episodesDir, 'sample-placeholder'), { recursive: true });
    const r = await validateEpisodes({ episodesDir, themeDir: repoTheme, only: [join(episodesDir, 'minimal')] });
    expect(r.episodes.map((e) => e.id)).toEqual(['minimal']);
  });

  it('reports a broken episode with the file, the cause and a hint', async () => {
    const { episodesDir } = workspace();
    cpSync(minimalPath, join(episodesDir, 'minimal'), { recursive: true });
    writeFileSync(join(episodesDir, 'minimal', 'documents', 'main.json'), '{ "template": ');
    const r = await validateEpisodes({ episodesDir, themeDir: repoTheme });
    expect(r.episodes[0].errors).toHaveLength(1);
    const text = formatReport(r.themeIssues, r.episodes);
    expect(text).toContain('minimal: ✗ cannot open');
    expect(text).toContain('documents/main.json');
    expect(text).toContain('Hint:');
    expect(text).toContain('1 error(s) to fix');
  });

  it('says so when there is nothing to check', async () => {
    const { episodesDir } = workspace();
    const r = await validateEpisodes({ episodesDir, themeDir: repoTheme });
    expect(formatReport(r.themeIssues, r.episodes)).toContain('Nothing to check yet.');
  });
});

describe('hints', () => {
  it('has a hint for common mistakes and none for unknown ones', () => {
    const issue = (message: string) => ({ severity: 'error' as const, path: 'x', message });
    expect(hintFor(issue('not valid JSON'))).toBeTruthy();
    expect(hintFor(issue('unknown template "reciept"; will render plain'))).toContain('theme/');
    expect(hintFor(issue('something nobody anticipated'))).toBeUndefined();
  });
});

describe('rebuilding in place', () => {
  it('overwrites the output folder without deleting it, and removes packages of episodes that were deleted', async () => {
    const { episodesDir, outDir } = workspace();
    cpSync(minimalPath, join(episodesDir, 'minimal'), { recursive: true });
    cpSync(samplePath, join(episodesDir, 'sample-placeholder'), { recursive: true });
    await buildArchive({ episodesDir, themeDir: repoTheme, outDir });
    expect(existsSync(join(outDir, 'sample-placeholder.casefile'))).toBe(true);

    // A marker file stands in for a dev server watching the folder: it must survive a rebuild.
    writeFileSync(join(outDir, 'marker.txt'), 'still here');
    const { rmSync } = await import('node:fs');
    rmSync(join(episodesDir, 'sample-placeholder'), { recursive: true });
    await buildArchive({ episodesDir, themeDir: repoTheme, outDir });

    expect(existsSync(join(outDir, 'sample-placeholder.casefile'))).toBe(false);
    expect(existsSync(join(outDir, 'minimal.casefile'))).toBe(true);
    expect(existsSync(join(outDir, 'marker.txt'))).toBe(true);
  });
});
