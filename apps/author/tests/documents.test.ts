import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EpisodeSession, type Locations } from '../src/main/episode';

const themeDir = resolve(__dirname, '../../../theme');

async function episode() {
  const dir = mkdtempSync(join(tmpdir(), 'author-docs-'));
  const where: Locations = { themeDir, previewDir: join(dir, 'preview') };
  const made = await EpisodeSession.create(dir, 'Test Episode', where, '2026-01-01');
  if (!made.ok) throw new Error(made.message);
  return { dir, session: made.value, folder: made.value.folder };
}
const read = (folder: string, file: string) => JSON.parse(readFileSync(join(folder, file), 'utf8'));
const ids = (folder: string) => read(folder, 'case.json').documents.map((d: { id: string }) => d.id);

describe('viewing documents', () => {
  it('lists the starter document with the slots its template defines, in order', async () => {
    const { session } = await episode();
    const { documents, templates } = await session.state();
    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({ id: 'statement', central: true, hidden: false, readable: true, templateName: 'Typed page' });
    expect(documents[0].slots.map((s) => [s.name, s.kind])).toEqual([['title', 'value'], ['body', 'markdown']]);
    expect(documents[0].slots[1].text).toContain('PLACEHOLDER');
    expect(templates.map((t) => t.id).sort()).toEqual(['handwritten', 'photograph', 'receipt', 'typed', 'witness-statement']);
    expect(templates.every((t) => !t.name.includes('PLACEHOLDER'))).toBe(true);
  });

  it('lists a document whose file is broken without failing, and marks it unreadable', async () => {
    const { session, folder } = await episode();
    session.addDocument('receipt', 'Till roll');
    writeFileSync(join(folder, 'documents', 'till-roll.json'), '{ nope');
    const { documents } = await session.state();
    expect(documents.find((d) => d.id === 'till-roll')).toMatchObject({ readable: false });
  });
});

describe('adding a document', () => {
  it('creates its files, places it on the table and opens with no problems', async () => {
    const { session, folder } = await episode();
    const added = session.addDocument('receipt', 'Till roll');
    expect(added).toEqual({ ok: true, value: 'till-roll' });
    expect(ids(folder)).toEqual(['statement', 'till-roll']);
    expect(read(folder, 'documents/till-roll.json')).toMatchObject({ template: 'receipt', role: 'supporting' });
    // A receipt's items are an itemised list kept in the document file, not a Markdown file.
    expect(read(folder, 'documents/till-roll.json').slots.items).toEqual({ kind: 'items', items: [] });
    expect(existsSync(join(folder, 'documents', 'till-roll.items.md'))).toBe(false);
    expect(existsSync(join(folder, 'documents', 'till-roll.address.md'))).toBe(true);
    const layout = read(folder, 'case.json').documents[1].layout;
    expect(layout.x).toBeGreaterThan(0);
    expect(await session.problems()).toEqual([]);
  });

  it('numbers a repeated name instead of overwriting', async () => {
    const { session, folder } = await episode();
    session.addDocument('typed', 'Note');
    session.addDocument('typed', 'Note');
    expect(ids(folder)).toEqual(['statement', 'note', 'note-2']);
  });

  it('refuses an unknown document type', async () => {
    const { session, folder } = await episode();
    expect(session.addDocument('hologram', 'x').ok).toBe(false);
    expect(ids(folder)).toEqual(['statement']);
  });

  it('turns a hostile name into a safe id', async () => {
    const { session, folder } = await episode();
    const added = session.addDocument('typed', '../../etc/passwd');
    expect(added).toEqual({ ok: true, value: 'etc-passwd' });
    expect(existsSync(join(folder, 'documents', 'etc-passwd.json'))).toBe(true);
  });
});

describe('editing content', () => {
  it('saves a value and text, and leaves hotspots and unknown fields alone', async () => {
    const { session, folder } = await episode();
    const docPath = join(folder, 'documents', 'statement.json');
    const doc = read(folder, 'documents/statement.json');
    doc.hotspots = [{ id: 'h1', anchor: { type: 'rect', x: 0.1, y: 0.1, width: 0.2, height: 0.1 }, target: { type: 'lightbox', text: 'KEEP' } }];
    doc.someFutureField = 'kept';
    writeFileSync(docPath, JSON.stringify(doc));

    expect(session.setSlotText('statement', 'title', 'A NEW TITLE').ok).toBe(true);
    expect(session.setSlotText('statement', 'body', 'First paragraph.\n\nSecond paragraph.').ok).toBe(true);

    const after = read(folder, 'documents/statement.json');
    expect(after.slots.title.value).toBe('A NEW TITLE');
    expect(after.hotspots).toEqual(doc.hotspots);
    expect(after.someFutureField).toBe('kept');
    expect(readFileSync(join(folder, 'documents', 'statement.md'), 'utf8')).toBe('First paragraph.\n\nSecond paragraph.');
    const state = await session.state();
    expect(state.documents[0].slots.map((s) => s.text)).toEqual(['A NEW TITLE', 'First paragraph.\n\nSecond paragraph.']);
  });

  it('keeps text that is written inline in the document file inline', async () => {
    const { session, folder } = await episode();
    const docPath = join(folder, 'documents', 'statement.json');
    const doc = read(folder, 'documents/statement.json');
    doc.slots.body = { kind: 'markdown', text: 'inline text' };
    writeFileSync(docPath, JSON.stringify(doc));
    session.setSlotText('statement', 'body', 'changed');
    expect(read(folder, 'documents/statement.json').slots.body).toEqual({ kind: 'markdown', text: 'changed' });
  });

  it('refuses to write through a file path that leaves the episode folder', async () => {
    const { dir, session, folder } = await episode();
    const docPath = join(folder, 'documents', 'statement.json');
    const doc = read(folder, 'documents/statement.json');
    doc.slots.body = { kind: 'markdown', file: '../../escaped.md' };
    writeFileSync(docPath, JSON.stringify(doc));
    expect(session.setSlotText('statement', 'body', 'ATTACK').ok).toBe(false);
    expect(existsSync(join(dir, 'escaped.md'))).toBe(false);
    expect(existsSync(resolve(folder, '..', '..', 'escaped.md'))).toBe(false);
  });

  it('refuses ids and slot names that are not what they seem', async () => {
    const { session, folder } = await episode();
    const before = readFileSync(join(folder, 'case.json'), 'utf8');
    expect(session.setSlotText('../case', 'body', 'x').ok).toBe(false);
    expect(session.setSlotText('statement', '../body', 'x').ok).toBe(false);
    expect(session.removeDocument('../case').ok).toBe(false);
    expect(readFileSync(join(folder, 'case.json'), 'utf8')).toBe(before);
  });
});

describe('images', () => {
  async function withPhoto() {
    const ctx = await episode();
    ctx.session.addDocument('photograph', 'Still');
    const source = join(ctx.dir, 'Scene Photo.PNG');
    writeFileSync(source, 'not really a png');
    return { ...ctx, source };
  }

  it('copies the image into the episode and points the slot at it', async () => {
    const { session, folder, source } = await withPhoto();
    expect(session.importImage('still', 'image', source).ok).toBe(true);
    expect(read(folder, 'documents/still.json').slots.image).toEqual({ kind: 'image', file: 'media/images/scene-photo.png' });
    expect(existsSync(join(folder, 'media', 'images', 'scene-photo.png'))).toBe(true);
    expect(existsSync(source)).toBe(true); // the original is left alone
    const view = (await session.state()).documents.find((d) => d.id === 'still')!;
    expect(view.slots.find((s) => s.name === 'image')!.image).toEqual({ file: 'media/images/scene-photo.png', alt: '' });
  });

  it('never overwrites an image that is already there', async () => {
    const { session, folder, source } = await withPhoto();
    session.importImage('still', 'image', source);
    session.importImage('still', 'image', source);
    expect(existsSync(join(folder, 'media', 'images', 'scene-photo-2.png'))).toBe(true);
  });

  it('refuses things that are not images, or not an image slot', async () => {
    const { dir, session, source } = await withPhoto();
    const text = join(dir, 'notes.txt');
    writeFileSync(text, 'hello');
    expect(session.importImage('still', 'image', text).ok).toBe(false);
    expect(session.importImage('statement', 'title', source).ok).toBe(false);
    expect(session.importImage('still', 'image', join(dir, 'missing.png')).ok).toBe(false);
  });

  it('sets and clears the description of an image', async () => {
    const { session, folder, source } = await withPhoto();
    expect(session.setImageAlt('still', 'image', 'x').ok).toBe(false); // nothing chosen yet
    session.importImage('still', 'image', source);
    session.setImageAlt('still', 'image', 'A grey van');
    expect(read(folder, 'documents/still.json').slots.image.alt).toBe('A grey van');
    session.setImageAlt('still', 'image', '  ');
    expect(read(folder, 'documents/still.json').slots.image).not.toHaveProperty('alt');
  });
});

describe('main, hidden and placement', () => {
  it('moves the main document to another, keeping every role in agreement', async () => {
    const { session, folder } = await episode();
    session.addDocument('typed', 'Second');
    expect(session.setHidden('second', true).ok).toBe(true);
    expect(session.setCentral('second').ok).toBe(true);
    const manifest = read(folder, 'case.json');
    expect(manifest.centralDocument).toBe('second');
    expect(manifest.documents.find((d: { id: string }) => d.id === 'second')).not.toHaveProperty('hidden');
    expect(read(folder, 'documents/second.json').role).toBe('central');
    expect(read(folder, 'documents/statement.json').role).toBe('supporting');
    expect((await session.problems()).filter((p) => p.severity === 'error')).toEqual([]);
  });

  it('will not hide the main document', async () => {
    const { session } = await episode();
    expect(session.setHidden('statement', true).ok).toBe(false);
  });

  it('warns that a hidden document nothing opens can never be seen', async () => {
    const { session } = await episode();
    session.addDocument('typed', 'Second');
    session.setHidden('second', true);
    const problems = await session.problems();
    expect(problems.some((p) => p.message.includes('never opened'))).toBe(true);
    session.setHidden('second', false);
    expect(await session.problems()).toEqual([]);
  });

  it('moves one document and changes nothing else', async () => {
    const { session, folder } = await episode();
    session.addDocument('typed', 'Second');
    const before = read(folder, 'case.json');
    session.setLayout('second', { x: 5, y: 0.4, width: 0.25, rotation: -3 });
    const after = read(folder, 'case.json');
    expect(after.documents[1].layout).toEqual({ x: 1, y: 0.4, width: 0.25, rotation: -3 });
    expect(after.documents[0]).toEqual(before.documents[0]);
    expect(after.title).toBe(before.title);
  });
});

describe('removing a document', () => {
  it('deletes its files and its place on the table, but leaves images', async () => {
    const { dir, session, folder } = await episode();
    session.addDocument('photograph', 'Still');
    const source = join(dir, 'pic.png');
    writeFileSync(source, 'x');
    session.importImage('still', 'image', source);
    session.addDocument('typed', 'Second');
    expect(session.removeDocument('second').ok).toBe(true);
    expect(session.removeDocument('still').ok).toBe(true);
    expect(ids(folder)).toEqual(['statement']);
    expect(existsSync(join(folder, 'documents', 'second.json'))).toBe(false);
    expect(existsSync(join(folder, 'documents', 'second.body.md'))).toBe(false);
    expect(existsSync(join(folder, 'media', 'images', 'pic.png'))).toBe(true);
    expect(await session.problems()).toEqual([]);
  });

  it('refuses to remove the main document', async () => {
    const { session, folder } = await episode();
    expect(session.removeDocument('statement').ok).toBe(false);
    expect(ids(folder)).toEqual(['statement']);
  });

  it('removing a document that a hotspot opens leaves the episode valid, with a warning', async () => {
    const { session, folder } = await episode();
    session.addDocument('typed', 'Second');
    const doc = read(folder, 'documents/statement.json');
    doc.slots.body = { kind: 'markdown', text: 'See [the second]{#go}.' };
    doc.hotspots = [{ id: 'go', anchor: { type: 'text', slot: 'body' }, target: { type: 'document', document: 'second' } }];
    writeFileSync(join(folder, 'documents', 'statement.json'), JSON.stringify(doc));
    expect(session.removeDocument('second').ok).toBe(true);
    const problems = await session.problems();
    expect(problems.some((p) => p.severity === 'error')).toBe(false);
    expect(problems.some((p) => p.message.includes('not in this episode'))).toBe(true);
  });
});

describe('unusual episodes', () => {
  it('shows the slots of a document whose template is not in the theme', async () => {
    const { session, folder } = await episode();
    const doc = read(folder, 'documents/statement.json');
    doc.template = 'mystery';
    writeFileSync(join(folder, 'documents', 'statement.json'), JSON.stringify(doc));
    const view = (await session.state()).documents[0];
    expect(view.templateName).toBe('mystery');
    expect(view.slots.map((s) => s.name)).toEqual(['title', 'body']);
  });

  it('survives a manifest with no documents list', async () => {
    const { session, folder } = await episode();
    const manifest = read(folder, 'case.json');
    delete manifest.documents;
    writeFileSync(join(folder, 'case.json'), JSON.stringify(manifest));
    mkdirSync(join(folder, 'media'), { recursive: true });
    expect((await session.state()).documents).toEqual([]);
    expect(session.addDocument('typed', 'x').ok).toBe(true);
  });
});
