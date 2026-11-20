import { describe, expect, it } from 'vitest';
import { applyDetails, checkDetails, isValidId, serializeManifest, slugify, starterEpisodeFiles, todayIso } from '../src/authoring';
import { loadCasefile } from '../src/loader';
import { memorySource } from '../src/source';
import { checkAgainstTheme } from '../src/theme';
import { loadThemeFromFs, repoTheme } from './helpers';

describe('slugify', () => {
  it('makes lowercase hyphenated ids', () => {
    expect(slugify('The Lighthouse Statement')).toBe('the-lighthouse-statement');
  });
  it('drops accents and punctuation', () => {
    expect(slugify("  Café Müller: the 'second' visit!  ")).toBe('cafe-muller-the-second-visit');
  });
  it('gives an empty id when nothing usable is left', () => {
    expect(slugify('???')).toBe('');
    expect(slugify('')).toBe('');
  });
  it('always produces a valid id (or an empty one)', () => {
    for (const t of ['A', 'a--b', '9 lives', 'Ünï', 'x'.repeat(200), 'word '.repeat(40)]) {
      const s = slugify(t);
      expect(s === '' || isValidId(s)).toBe(true);
      expect(s.length).toBeLessThanOrEqual(60);
    }
  });
  it('cuts long titles at a word boundary', () => {
    const s = slugify('alpha '.repeat(30));
    expect(s.endsWith('-')).toBe(false);
    expect(s.split('-').every((w) => w === 'alpha')).toBe(true);
  });
});

describe('details', () => {
  it('rejects an empty title and a bad date', () => {
    expect(checkDetails({ title: '  ', submissionDate: '2026-01-01' })).toHaveLength(1);
    expect(checkDetails({ title: 'x', submissionDate: '' })).toHaveLength(1);
    expect(checkDetails({ title: 'x', submissionDate: '2026-01-01' })).toEqual([]);
  });

  it('formats today as a plain date', () => {
    expect(todayIso(new Date(2026, 2, 4))).toBe('2026-03-04');
  });

  it('applies the form values and leaves every other field alone', () => {
    const manifest = { formatVersion: 1, id: 'x', title: 'Old', submissionDate: '2000-01-01', folderLabel: 'OLD', order: 3, centralDocument: 'a', documents: [{ id: 'a' }], someFutureField: true };
    const next = applyDetails(manifest, { title: ' New title ', submissionDate: '2026-02-02', folderLabel: 'Case 4', order: 1 });
    expect(next).toMatchObject({ title: 'New title', submissionDate: '2026-02-02', folderLabel: 'Case 4', order: 1, centralDocument: 'a', someFutureField: true });
    expect(next.documents).toEqual([{ id: 'a' }]);
  });

  it('removes an emptied label or order instead of saving blanks', () => {
    const next = applyDetails({ title: 'x', folderLabel: 'L', order: 2 }, { title: 'x', submissionDate: '2026-01-01', folderLabel: '  ' });
    expect('folderLabel' in next).toBe(false);
    expect('order' in next).toBe(false);
  });
});

describe('serializeManifest', () => {
  it('writes fields in a stable order, unknown ones last, and round-trips', () => {
    const text = serializeManifest({ documents: [], zzz: 1, title: 'T', id: 'x', formatVersion: 1, centralDocument: 'a', submissionDate: '2026-01-01' });
    expect(Object.keys(JSON.parse(text))).toEqual(['formatVersion', 'id', 'title', 'submissionDate', 'centralDocument', 'documents', 'zzz']);
    expect(text.endsWith('\n')).toBe(true);
    expect(serializeManifest(JSON.parse(text))).toBe(text);
  });
});

describe('starterEpisodeFiles', () => {
  it('is a valid episode with no warnings, and is marked as placeholder', async () => {
    const files = starterEpisodeFiles('my-episode', 'My Episode', '2026-03-14');
    const result = await loadCasefile(memorySource(files), { expectedId: 'my-episode' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([]);
    expect(checkAgainstTheme(result.casefile, loadThemeFromFs(repoTheme).theme)).toEqual([]);
    expect(files['documents/statement.md']).toContain('PLACEHOLDER');
    expect(result.casefile.manifest).toMatchObject({ title: 'My Episode', submissionDate: '2026-03-14', centralDocument: 'statement' });
  });
});
