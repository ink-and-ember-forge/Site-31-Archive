import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeClickable, newTextHotspot } from '@archive/casefile/authoring';
import { EpisodeSession, type Locations } from '../src/main/episode';

const themeDir = resolve(__dirname, '../../../theme');

async function episode() {
  const dir = mkdtempSync(join(tmpdir(), 'author-registry-'));
  const where: Locations = { themeDir, previewDir: join(dir, 'preview') };
  const made = await EpisodeSession.create(dir, 'Test Episode', where, '2026-01-01');
  if (!made.ok) throw new Error(made.message);
  return { session: made.value, folder: made.value.folder };
}
const read = (folder: string, file: string) => JSON.parse(readFileSync(join(folder, file), 'utf8'));
const entries = async (s: EpisodeSession) => (await s.state()).registry;
const edit = (over: Record<string, unknown> = {}) => ({ kind: 'record', title: 'The Grey Van', fields: [], body: '', references: [], ...over });

describe('adding registry entries', () => {
  it('makes a file named after the title, with a valid starting point', async () => {
    const { session, folder } = await episode();
    expect((await entries(session)).length).toBe(0);
    expect(session.addRegistryEntry('The Grey Van', 'vehicle')).toEqual({ ok: true, value: 'the-grey-van' });
    expect(read(folder, 'registry/the-grey-van.json')).toEqual({ id: 'the-grey-van', kind: 'vehicle', title: 'The Grey Van' });
    expect((await entries(session))[0]).toMatchObject({ id: 'the-grey-van', globalId: 'test-episode/the-grey-van', title: 'The Grey Van', kind: 'vehicle', readable: true });
  });
  it('defaults the kind, and makes a second entry with the same title unique', async () => {
    const { session, folder } = await episode();
    session.addRegistryEntry('Keeper', '');
    expect(session.addRegistryEntry('Keeper', '')).toEqual({ ok: true, value: 'keeper-2' });
    expect(read(folder, 'registry/keeper.json').kind).toBe('record');
  });
  it('refuses an empty or too long title or kind, and writes nothing', async () => {
    const { session, folder } = await episode();
    expect(session.addRegistryEntry('   ', 'record').ok).toBe(false);
    expect(session.addRegistryEntry('x'.repeat(201), 'record').ok).toBe(false);
    expect(session.addRegistryEntry('Fine', 'k'.repeat(41)).ok).toBe(false);
    expect((await entries(session)).length).toBe(0);
    expect(() => readFileSync(join(folder, 'registry/fine.json'))).toThrow();
  });
  it('makes an id even from a title with no usual letters', async () => {
    const { session } = await episode();
    expect(session.addRegistryEntry('!!!', 'record')).toEqual({ ok: true, value: 'entry' });
  });
});

describe('editing registry entries', () => {
  async function withEntry() {
    const e = await episode();
    e.session.addRegistryEntry('The Grey Van', 'record');
    return e;
  }
  it('saves kind, title, fields, text and references in reading order, and reads them back', async () => {
    const { session, folder } = await withEntry();
    const done = session.setRegistryEntry('the-grey-van', edit({ kind: 'vehicle', fields: [{ label: 'First reported', value: '2026-03-14' }], body: 'Text.', references: ['test-episode/keeper', 'other-episode/thing'] }));
    expect(done.ok).toBe(true);
    const saved = read(folder, 'registry/the-grey-van.json');
    expect(Object.keys(saved)).toEqual(['id', 'kind', 'title', 'fields', 'body', 'references']);
    expect(saved).toMatchObject({ kind: 'vehicle', fields: [{ label: 'First reported', value: '2026-03-14' }], references: ['test-episode/keeper', 'other-episode/thing'] });
    expect((await entries(session))[0]).toMatchObject({ body: 'Text.', references: ['test-episode/keeper', 'other-episode/thing'] });
  });
  it('leaves out empty parts instead of saving them empty, and ignores fully blank field rows', async () => {
    const { session, folder } = await withEntry();
    session.setRegistryEntry('the-grey-van', edit({ fields: [{ label: '', value: '' }], body: '   ', references: [] }));
    expect(read(folder, 'registry/the-grey-van.json')).toEqual({ id: 'the-grey-van', kind: 'record', title: 'The Grey Van' });
  });
  it('removes repeated references, and trims', async () => {
    const { session, folder } = await withEntry();
    session.setRegistryEntry('the-grey-van', edit({ references: [' a/b ', 'a/b', 'c/d'] }));
    expect(read(folder, 'registry/the-grey-van.json').references).toEqual(['a/b', 'c/d']);
  });
  it('keeps anything else the file has', async () => {
    const { session, folder } = await withEntry();
    const file = join(folder, 'registry/the-grey-van.json');
    writeFileSync(file, JSON.stringify({ ...read(folder, 'registry/the-grey-van.json'), somethingElse: { keep: true } }));
    session.setRegistryEntry('the-grey-van', edit({ title: 'The Van' }));
    expect(read(folder, 'registry/the-grey-van.json')).toMatchObject({ title: 'The Van', somethingElse: { keep: true } });
  });
  it('never changes the id, and refuses an entry that is not there', async () => {
    const { session, folder } = await withEntry();
    session.setRegistryEntry('the-grey-van', edit({ title: 'A Completely Different Title' }));
    expect(read(folder, 'registry/the-grey-van.json').id).toBe('the-grey-van');
    expect(session.setRegistryEntry('ghost', edit()).ok).toBe(false);
    expect(session.setRegistryEntry('../case', edit()).ok).toBe(false);
  });
  it('refuses what the reader would drop, with a reason, and changes nothing', async () => {
    const { session, folder } = await withEntry();
    const before = readFileSync(join(folder, 'registry/the-grey-van.json'), 'utf8');
    const cases = [
      edit({ title: '  ' }),
      edit({ kind: '' }),
      edit({ references: ['Not An Id'] }),
      edit({ references: ['no-slash'] }),
      edit({ fields: [{ label: '', value: 'orphan value' }] }),
      edit({ fields: Array.from({ length: 51 }, (_, i) => ({ label: `L${i}`, value: 'v' })) }),
      edit({ body: 'x'.repeat(20001) }),
      edit({ references: Array.from({ length: 51 }, (_, i) => `a/b${i}`) }),
    ];
    for (const c of cases) expect(session.setRegistryEntry('the-grey-van', c).ok, JSON.stringify(c).slice(0, 60)).toBe(false);
    expect(readFileSync(join(folder, 'registry/the-grey-van.json'), 'utf8')).toBe(before);
  });
  it('a file that has become unreadable fails the save with a reason instead of throwing', async () => {
    const { session, folder } = await withEntry();
    writeFileSync(join(folder, 'registry/the-grey-van.json'), '{ not json');
    const r = session.setRegistryEntry('the-grey-van', edit());
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).toContain('could not be read');
  });
  it('an edited episode opens in the real loader with nothing dropped', async () => {
    const { session } = await withEntry();
    session.setRegistryEntry('the-grey-van', edit({ fields: [{ label: 'A', value: 'B' }], references: ['elsewhere/entry'] }));
    const problems = (await session.state()).problems.map((p) => p.message).join('|');
    expect(problems).not.toContain('entry dropped');
  });
});

describe('registry entries in use', () => {
  it('shows the hotspots that open an entry and the entries that refer to it', async () => {
    const { session, folder } = await episode();
    session.addRegistryEntry('The Grey Van', 'record');
    session.addRegistryEntry('Keeper', 'person');
    session.setRegistryEntry('keeper', edit({ title: 'Keeper', kind: 'person', references: ['test-episode/the-grey-van'] }));
    session.setSlotText('statement', 'body', 'He saw the grey van.');
    const r = makeClickable('He saw the grey van.', 7, 19);
    if (!r.ok) throw new Error(r.reason);
    const h = newTextHotspot(r.id, 'body');
    h.target = { type: 'registry', entry: 'test-episode/the-grey-van' };
    session.addTextHotspot('statement', 'body', r.text, h);
    const van = (await entries(session)).find((e) => e.id === 'the-grey-van')!;
    expect(van.referencedBy).toEqual([{ type: 'hotspot', id: 'statement', detail: 'the-grey-van' }, { type: 'entry', id: 'keeper', detail: '' }]);
    expect((await entries(session)).find((e) => e.id === 'keeper')!.referencedBy).toEqual([]);
    void folder;
  });
});

describe('removing registry entries', () => {
  it('deletes the file, and refuses one that is not there', async () => {
    const { session, folder } = await episode();
    session.addRegistryEntry('Gone Soon', 'record');
    expect(session.removeRegistryEntry('gone-soon').ok).toBe(true);
    expect((await entries(session)).length).toBe(0);
    expect(() => readFileSync(join(folder, 'registry/gone-soon.json'))).toThrow();
    expect(session.removeRegistryEntry('gone-soon').ok).toBe(false);
    expect(session.removeRegistryEntry('../case').ok).toBe(false);
  });
});

describe('listing is tolerant', () => {
  it('lists a file that cannot be read as unreadable rather than hiding it, and ignores other files', async () => {
    const { session, folder } = await episode();
    mkdirSync(join(folder, 'registry'), { recursive: true });
    writeFileSync(join(folder, 'registry/broken.json'), '{ not json');
    writeFileSync(join(folder, 'registry/notes.txt'), 'ignored');
    writeFileSync(join(folder, 'registry/odd.json'), JSON.stringify({ id: 'odd', kind: 5, title: 7, fields: 'x', references: [1, 'a/b'] }));
    const list = await entries(session);
    expect(list.map((e) => [e.id, e.readable])).toEqual([['broken', false], ['odd', true]]);
    expect(list[1]).toMatchObject({ title: 'odd', kind: '', fields: [], references: ['a/b'] });
  });
});
