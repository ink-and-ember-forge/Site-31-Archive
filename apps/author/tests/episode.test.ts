import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCasefile, zipSource } from '@archive/casefile';
import { EpisodeSession, type Locations } from '../src/main/episode';

const themeDir = resolve(__dirname, '../../../theme');

function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'author-test-'));
  const where: Locations = { themeDir, previewDir: join(dir, 'preview') };
  return { dir, where };
}

async function created(title = 'The Lighthouse Statement') {
  const { dir, where } = workspace();
  const result = await EpisodeSession.create(dir, title, where, '2026-03-14');
  if (!result.ok) throw new Error(result.message);
  return { dir, where, session: result.value };
}

describe('creating an episode', () => {
  it('makes a folder named after the title that opens with no problems', async () => {
    const { dir, session } = await created();
    expect(session.id).toBe('the-lighthouse-statement');
    expect(session.folder).toBe(join(dir, 'the-lighthouse-statement'));
    const state = await session.state();
    expect(state.problems).toEqual([]);
    expect(state.details).toMatchObject({ title: 'The Lighthouse Statement', submissionDate: '2026-03-14' });
  });

  it('refuses a title with nothing usable in it', async () => {
    const { dir, where } = workspace();
    const result = await EpisodeSession.create(dir, '???', where);
    expect(result.ok).toBe(false);
  });

  it('never overwrites an existing folder', async () => {
    const { dir, where } = await created();
    writeFileSync(join(dir, 'the-lighthouse-statement', 'documents', 'statement.md'), 'MY WORK');
    const again = await EpisodeSession.create(dir, 'The Lighthouse Statement', where);
    expect(again.ok).toBe(false);
    expect(readFileSync(join(dir, 'the-lighthouse-statement', 'documents', 'statement.md'), 'utf8')).toBe('MY WORK');
  });
});

describe('opening an episode', () => {
  it('reopens one it created, with the same details', async () => {
    const { where, session } = await created();
    const reopened = await EpisodeSession.open(session.folder, where);
    expect(reopened.ok).toBe(true);
    if (reopened.ok) expect(reopened.value.details()).toEqual(session.details());
  });

  it('refuses a folder that is not an episode', async () => {
    const { dir, where } = workspace();
    const result = await EpisodeSession.open(dir, where);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('no case.json');
  });

  it('refuses an episode that cannot open, and explains why with a hint', async () => {
    const { where, session } = await created();
    writeFileSync(join(session.folder, 'documents', 'statement.json'), '{ "template": ');
    const result = await EpisodeSession.open(session.folder, where);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems?.[0].path).toBe('documents/statement.json');
      expect(result.problems?.[0].hint).toBeTruthy();
    }
  });

  it('refuses a folder whose name does not match the episode id', async () => {
    const { dir, where, session } = await created();
    const renamed = join(dir, 'renamed');
    cpSync(session.folder, renamed, { recursive: true });
    const result = await EpisodeSession.open(renamed, where);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems?.[0].hint).toContain('folder name');
  });
});

describe('saving details', () => {
  it('writes the form values and leaves the rest of case.json alone', async () => {
    const { session } = await created();
    const before = JSON.parse(readFileSync(join(session.folder, 'case.json'), 'utf8'));
    const saved = session.saveDetails({ title: 'A New Title', submissionDate: '2026-05-01', folderLabel: 'Case 4', order: 2 });
    expect(saved.ok).toBe(true);
    const after = JSON.parse(readFileSync(join(session.folder, 'case.json'), 'utf8'));
    expect(after).toMatchObject({ title: 'A New Title', submissionDate: '2026-05-01', folderLabel: 'Case 4', order: 2 });
    expect(after.id).toBe(before.id); // the id never changes
    expect(after.documents).toEqual(before.documents);
    expect(after.centralDocument).toBe(before.centralDocument);
  });

  it('refuses bad values without touching the file', async () => {
    const { session } = await created();
    const before = readFileSync(join(session.folder, 'case.json'), 'utf8');
    expect(session.saveDetails({ title: '   ', submissionDate: '2026-05-01' }).ok).toBe(false);
    expect(session.saveDetails({ title: 'x', submissionDate: 'tomorrow' }).ok).toBe(false);
    expect(readFileSync(join(session.folder, 'case.json'), 'utf8')).toBe(before);
  });

  it('removes a label that has been cleared', async () => {
    const { session } = await created();
    session.saveDetails({ title: 'x', submissionDate: '2026-05-01', folderLabel: 'L' });
    session.saveDetails({ title: 'x', submissionDate: '2026-05-01', folderLabel: '' });
    expect(JSON.parse(readFileSync(join(session.folder, 'case.json'), 'utf8'))).not.toHaveProperty('folderLabel');
  });

  it('keeps edits made by hand to other parts of the episode', async () => {
    const { session } = await created();
    const manifestPath = join(session.folder, 'case.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.documents[0].layout.x = 0.5;
    writeFileSync(manifestPath, JSON.stringify(manifest));
    session.saveDetails({ title: 'Changed', submissionDate: '2026-05-01' });
    expect(JSON.parse(readFileSync(manifestPath, 'utf8')).documents[0].layout.x).toBe(0.5);
  });
});

describe('problems', () => {
  it('reports a template that does not exist as a warning with a hint', async () => {
    const { session } = await created();
    const docPath = join(session.folder, 'documents', 'statement.json');
    const doc = JSON.parse(readFileSync(docPath, 'utf8'));
    doc.template = 'reciept';
    writeFileSync(docPath, JSON.stringify(doc));
    const problems = await session.problems();
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ severity: 'warning', path: 'documents/statement.json' });
    expect(problems[0].hint).toContain('theme/');
  });
});

describe('preview', () => {
  it('packages the episode exactly as the website would, so the real viewer can load it', async () => {
    const { where, session } = await created();
    await session.buildPreview();
    const index = JSON.parse(readFileSync(join(where.previewDir, 'index.json'), 'utf8'));
    expect(index.episodes.map((e: { id: string }) => e.id)).toEqual(['the-lighthouse-statement']);
    expect(existsSync(join(where.previewDir, 'theme.json'))).toBe(true);

    const bytes = new Uint8Array(readFileSync(join(where.previewDir, 'the-lighthouse-statement.casefile')));
    const loaded = await loadCasefile(zipSource(bytes), { expectedId: 'the-lighthouse-statement' });
    expect(loaded.ok).toBe(true);
  });

  it('shows a change the next time it is rebuilt', async () => {
    const { where, session } = await created();
    await session.buildPreview();
    session.saveDetails({ title: 'Renamed Episode', submissionDate: '2026-03-14' });
    await session.buildPreview();
    const index = JSON.parse(readFileSync(join(where.previewDir, 'index.json'), 'utf8'));
    expect(index.episodes[0].title).toBe('Renamed Episode');
  });

  it('only ever shows the open episode, never leftovers from an earlier one', async () => {
    const { dir, where } = workspace();
    mkdirSync(where.previewDir, { recursive: true });
    const first = await EpisodeSession.create(dir, 'First One', where);
    const second = await EpisodeSession.create(dir, 'Second One', where);
    if (!first.ok || !second.ok) throw new Error('setup failed');
    await first.value.buildPreview();
    await second.value.buildPreview();
    const index = JSON.parse(readFileSync(join(where.previewDir, 'index.json'), 'utf8'));
    expect(index.episodes.map((e: { id: string }) => e.id)).toEqual(['second-one']);
    expect(existsSync(join(where.previewDir, 'first-one.casefile'))).toBe(false);
  });
});
