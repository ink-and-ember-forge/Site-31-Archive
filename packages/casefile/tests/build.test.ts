import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCasefile } from '../src/loader';
import { buildArchive, fsSource } from '../src/node';
import { zipSource } from '../src/source';
import type { ArchiveIndex } from '../src/types';
import { minimalPath, repoTheme, samplePath } from './helpers';

function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'archive-test-'));
  const episodesDir = join(dir, 'episodes');
  mkdirSync(episodesDir);
  return { dir, episodesDir, outDir: join(dir, 'out') };
}

describe('archive build', () => {
  it('builds an empty archive when there are no episodes', async () => {
    const { episodesDir, outDir } = workspace();
    writeFileSync(join(episodesDir, '.gitkeep'), '');
    const result = await buildArchive({ episodesDir, themeDir: repoTheme, outDir });
    expect(result.errors).toEqual([]);
    expect(JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8')).episodes).toEqual([]);
  });

  it('generates the index from each case.json, ordered, and packages each episode', async () => {
    const { episodesDir, outDir } = workspace();
    cpSync(samplePath, join(episodesDir, 'sample-placeholder'), { recursive: true });
    cpSync(minimalPath, join(episodesDir, 'minimal'), { recursive: true });
    const result = await buildArchive({ episodesDir, themeDir: repoTheme, outDir });
    expect(result.errors).toEqual([]);

    const index = JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8')) as ArchiveIndex;
    expect(index.episodes.map((e) => e.id)).toEqual(['sample-placeholder', 'minimal']); // order 0, then by date
    expect(index.episodes[0]).toMatchObject({
      title: 'PLACEHOLDER: Sample Case File',
      submissionDate: '2000-01-01',
      folderLabel: 'PLACEHOLDER',
      file: 'sample-placeholder.casefile',
    });
    expect(existsSync(join(outDir, 'theme.json'))).toBe(true);

    const packaged = new Uint8Array(readFileSync(join(outDir, 'sample-placeholder.casefile')));
    expect((await loadCasefile(zipSource(packaged))).ok).toBe(true);
  });

  it('adding an episode is just adding a folder', async () => {
    const { episodesDir, outDir } = workspace();
    cpSync(minimalPath, join(episodesDir, 'minimal'), { recursive: true });
    const before = await buildArchive({ episodesDir, themeDir: repoTheme, outDir });
    cpSync(samplePath, join(episodesDir, 'sample-placeholder'), { recursive: true });
    const after = await buildArchive({ episodesDir, themeDir: repoTheme, outDir });
    expect(after.index.episodes.length).toBe(before.index.episodes.length + 1);
  });

  it('fails the build for an invalid episode but still builds the others', async () => {
    const { episodesDir, outDir } = workspace();
    cpSync(minimalPath, join(episodesDir, 'minimal'), { recursive: true });
    mkdirSync(join(episodesDir, 'broken'));
    writeFileSync(join(episodesDir, 'broken', 'case.json'), '{ nope');
    const result = await buildArchive({ episodesDir, themeDir: repoTheme, outDir });
    expect(result.errors.map((e) => e.path)).toEqual(['broken/case.json']);
    expect(result.index.episodes.map((e) => e.id)).toEqual(['minimal']);
  });

  it('fails when a folder name does not match the manifest id', async () => {
    const { episodesDir, outDir } = workspace();
    cpSync(minimalPath, join(episodesDir, 'renamed'), { recursive: true });
    const result = await buildArchive({ episodesDir, themeDir: repoTheme, outDir });
    expect(result.errors).toHaveLength(1);
  });

  it('reports a broken theme as an error', async () => {
    const { dir, episodesDir, outDir } = workspace();
    const themeDir = join(dir, 'theme');
    mkdirSync(join(themeDir, 'templates'), { recursive: true });
    writeFileSync(join(themeDir, 'templates', 'bad.json'), '{}');
    const result = await buildArchive({ episodesDir, themeDir, outDir });
    expect(result.errors).toHaveLength(1);
  });

  it('uses the fallback sample only while there are no real episodes', async () => {
    const empty = workspace();
    const withFallback = await buildArchive({ ...empty, themeDir: repoTheme, fallbackEpisodeDirs: [samplePath] });
    expect(withFallback.index.episodes.map((e) => e.id)).toEqual(['sample-placeholder']);

    const real = workspace();
    cpSync(minimalPath, join(real.episodesDir, 'minimal'), { recursive: true });
    const withReal = await buildArchive({ ...real, themeDir: repoTheme, fallbackEpisodeDirs: [samplePath] });
    expect(withReal.index.episodes.map((e) => e.id)).toEqual(['minimal']);
  });

  it('the folder source and zip source agree on file listing', async () => {
    const fromFolder = await fsSource(samplePath).list('');
    const zip = (await import('../src/node')).zipFolder(samplePath);
    expect(await zipSource(zip).list('')).toEqual(fromFolder);
  });
});
