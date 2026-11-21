import { planSlots } from '@archive/casefile/authoring';
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
    expect(documents[0]).toMatchObject({ id: 'statement', central: true, hidden: false, readable: true, templateName: 'Witness statement form' });
    const body = documents[0].slots.find((s) => s.name === 'body')!;
    expect(body).toMatchObject({ kind: 'markdown', label: 'Statement', required: true });
    expect(body.text).toContain('PLACEHOLDER');
    expect(documents[0].slots.find((s) => s.name === 'witnessName')).toMatchObject({ kind: 'value', label: 'Witness Name:' });
    expect(documents[0].slots.find((s) => s.name === 'crest')).toMatchObject({ kind: 'image' });
    // the form's arrangement comes with it, so the tool can mirror the paper
    expect(documents[0].plan.some((p) => p.type === 'grid')).toBe(true);
    expect(documents[0].plan.some((p) => p.type === 'bar' && p.text === 'STATEMENT')).toBe(true);
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
    expect(readFileSync(join(folder, 'documents', 'statement.body.md'), 'utf8')).toBe('First paragraph.\n\nSecond paragraph.');
    const state = await session.state();
    expect(state.documents[0].slots.filter((s) => ['title', 'body'].includes(s.name)).map((s) => s.text)).toEqual(['A NEW TITLE', 'First paragraph.\n\nSecond paragraph.']);
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

  it('shows an older one-line value in a text part, and a save turns it into text', async () => {
    const { session, folder } = await episode();
    session.addDocument('receipt', 'Till roll');
    const doc = read(folder, 'documents/till-roll.json');
    doc.slots.payment = { kind: 'value', value: 'CARD ****0000' };
    writeFileSync(join(folder, 'documents', 'till-roll.json'), JSON.stringify(doc));
    const slot = (await session.state()).documents.find((d) => d.id === 'till-roll')!.slots.find((s) => s.name === 'payment')!;
    expect(slot.kind).toBe('markdown');
    expect(slot.text).toBe('CARD ****0000');
    session.setSlotText('till-roll', 'payment', 'CARD ****0000\nAPPROVAL 000000');
    expect(read(folder, 'documents/till-roll.json').slots.payment).toEqual({ kind: 'markdown', text: 'CARD ****0000\nAPPROVAL 000000' });
  });

  it('refuses text longer than the template allows for a part (the QR message), and says how long it may be', async () => {
    const { session, folder } = await episode();
    session.addDocument('receipt', 'Till roll');
    const slot = (await session.state()).documents.find((d) => d.id === 'till-roll')!.slots.find((x) => x.name === 'qr')!;
    expect(slot.maxLength).toBe(300);
    expect(session.setSlotText('till-roll', 'qr', 'x'.repeat(300)).ok).toBe(true);
    const tooLong = session.setSlotText('till-roll', 'qr', 'x'.repeat(301));
    expect(tooLong.ok).toBe(false);
    expect(JSON.stringify(tooLong)).toContain('300');
    expect(read(folder, 'documents/till-roll.json').slots.qr.value).toHaveLength(300);
  });

  it('keeps categories, codes, quantities and the tender when a list is saved and read back', async () => {
    const { session, folder } = await episode();
    session.addDocument('receipt', 'Till roll');
    const list = {
      kind: 'items',
      currency: '£',
      taxes: [{ code: 'A', label: 'VAT', rate: 20 }],
      taxMode: 'included',
      tender: { method: 'CASH', amount: 10 },
      items: [{ name: 'PLACEHOLDER', code: '12', quantity: 2, unitPrice: 1.5, tax: 'A' }],
    };
    expect(session.setItems('till-roll', 'items', list).ok).toBe(true);
    expect(read(folder, 'documents/till-roll.json').slots.items).toEqual(list);
    const slot = (await session.state()).documents.find((d) => d.id === 'till-roll')!.slots.find((s) => s.name === 'items')!;
    expect(slot.items).toEqual(list);
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
    expect(view.plan).toEqual([]);
    expect(view.slots.map((s) => s.name)).toContain('title');
    expect(view.slots.map((s) => s.name)).toContain('body');
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


describe('item lists (receipts)', () => {
  const good = { kind: 'items', currency: '£', tax: { mode: 'added', rate: 20, label: 'VAT' }, items: [{ name: 'Tea', price: 4.5, taxable: true }, { name: 'Biscuits', price: 2 }] };

  it('a new receipt starts with an empty list the tool can fill in', async () => {
    const { session } = await episode();
    session.addDocument('receipt', 'Till roll');
    const view = (await session.state()).documents.find((d) => d.id === 'till-roll')!;
    const items = view.slots.find((s) => s.name === 'items')!;
    expect(items).toMatchObject({ kind: 'items', label: 'Items', required: true });
    expect(items.items).toEqual({ kind: 'items', items: [] });
    expect(view.plan.flatMap(planSlots)).toContain('items');
    expect(view.plan.filter((p) => p.type === 'section').map((p) => (p as { title: string }).title)).toEqual(['Heading', 'Top line', 'Main body', 'Footer']);
  });

  it('saves a list exactly, in a stable order, and reads it back', async () => {
    const { session, folder } = await episode();
    session.addDocument('receipt', 'Till roll');
    expect(session.setItems('till-roll', 'items', good).ok).toBe(true);
    const saved = read(folder, 'documents/till-roll.json').slots.items;
    expect(Object.keys(saved)).toEqual(['kind', 'currency', 'tax', 'items']);
    expect(saved).toEqual(good);
    const view = (await session.state()).documents.find((d) => d.id === 'till-roll')!;
    expect(view.slots.find((s) => s.name === 'items')!.items).toEqual(good);
    expect(await session.problems()).toEqual([]);
  });

  it('refuses a list the viewer would have to cut down, and saves nothing', async () => {
    const { session, folder } = await episode();
    session.addDocument('receipt', 'Till roll');
    session.setItems('till-roll', 'items', good);
    const before = readFileSync(join(folder, 'documents', 'till-roll.json'), 'utf8');
    for (const bad of [
      { kind: 'items', items: [{ name: 'A', price: 'free' }] },
      { kind: 'items', items: [{ name: 'A', price: 1 }], tax: { mode: 'sideways', rate: 5 } },
      { kind: 'items', items: [{ name: 'A', price: 1 }], currency: 'WAYTOOLONG' },
      { kind: 'items', items: 'none' },
    ]) {
      const result = session.setItems('till-roll', 'items', bad);
      expect(result.ok, JSON.stringify(bad)).toBe(false);
    }
    expect(readFileSync(join(folder, 'documents', 'till-roll.json'), 'utf8')).toBe(before);
  });

  it('refuses a list for a part of the document that is not a list, or a document that is not there', async () => {
    const { session } = await episode();
    session.addDocument('receipt', 'Till roll');
    expect(session.setItems('till-roll', 'store', good).ok).toBe(false);
    expect(session.setItems('ghost', 'items', good).ok).toBe(false);
    expect(session.setItems('../case', 'items', good).ok).toBe(false);
  });

  it('shows an older receipt written as a Markdown table, so it can be seen and replaced', async () => {
    const { session, folder } = await episode();
    session.addDocument('receipt', 'Old roll');
    const docPath = join(folder, 'documents', 'old-roll.json');
    const doc = read(folder, 'documents/old-roll.json');
    doc.slots.items = { kind: 'markdown', text: '| Item | Price |\n| --- | --- |\n| Tea | 2.00 |' };
    writeFileSync(docPath, JSON.stringify(doc));
    const slot = (await session.state()).documents.find((d) => d.id === 'old-roll')!.slots.find((s) => s.name === 'items')!;
    expect(slot.items).toBeUndefined();
    expect(slot.legacyText).toContain('| Tea | 2.00 |');
    // replacing it with a list is a normal save
    expect(session.setItems('old-roll', 'items', good).ok).toBe(true);
    expect(read(folder, 'documents/old-roll.json').slots.items.kind).toBe('items');
  });

  it('keeps everything else in the document when the list is saved', async () => {
    const { session, folder } = await episode();
    session.addDocument('receipt', 'Till roll');
    session.setSlotText('till-roll', 'store', 'PLACEHOLDER STORE');
    const doc = read(folder, 'documents/till-roll.json');
    doc.hotspots = [{ id: 'h', anchor: { type: 'rect', x: 0, y: 0, width: 0.1, height: 0.1 }, target: { type: 'lightbox', text: 'KEEP' } }];
    writeFileSync(join(folder, 'documents', 'till-roll.json'), JSON.stringify(doc));
    session.setItems('till-roll', 'items', good);
    const after = read(folder, 'documents/till-roll.json');
    expect(after.hotspots).toEqual(doc.hotspots);
    expect(after.slots.store.value).toBe('PLACEHOLDER STORE');
  });
});

import { makeClickable, newRectHotspot, newTextHotspot } from '@archive/casefile/authoring';

describe('hotspots', () => {
  async function withText(text = 'He saw the grey van outside.') {
    const e = await episode();
    e.session.setSlotText('statement', 'body', text);
    return e;
  }
  const clickable = (text: string, words: string) => {
    const i = text.indexOf(words);
    const r = makeClickable(text, i, i + words.length);
    if (!r.ok) throw new Error(r.reason);
    return r;
  };
  const view = async (session: EpisodeSession, id = 'statement') => (await session.state()).documents.find((d) => d.id === id)!;

  it('making words clickable saves the marked text and the hotspot together', async () => {
    const { session, folder } = await withText();
    const r = clickable('He saw the grey van outside.', 'the grey van');
    expect(session.addTextHotspot('statement', 'body', r.text, newTextHotspot(r.id, 'body')).ok).toBe(true);
    const doc = read(folder, 'documents/statement.json');
    expect(doc.hotspots).toEqual([{ id: 'the-grey-van', anchor: { type: 'text', slot: 'body' }, target: { type: 'lightbox', variant: 'formal', text: '' } }]);
    const slot = (await view(session)).slots.find((s) => s.name === 'body')!;
    expect(slot.text).toBe('He saw [the grey van]{#the-grey-van} outside.');
    const h = (await view(session)).hotspots[0];
    expect(h).toMatchObject({ id: 'the-grey-van', words: 'the grey van', noteText: '', valid: true });
  });

  it('the result opens in the real loader with no warning about the hotspot', async () => {
    const { session } = await withText();
    const r = clickable('He saw the grey van outside.', 'the grey van');
    session.addTextHotspot('statement', 'body', r.text, newTextHotspot(r.id, 'body'));
    const problems = (await session.state()).problems.map((p) => p.message).join('|');
    expect(problems).not.toContain('dropped');
    expect(problems).not.toContain('span in slot');
  });

  it('refuses a hotspot whose words are not marked in the text, or that is on another slot, or whose id is taken', async () => {
    const { session, folder } = await withText();
    const r = clickable('He saw the grey van outside.', 'the grey van');
    expect(session.addTextHotspot('statement', 'body', 'no marks here', newTextHotspot(r.id, 'body')).ok).toBe(false);
    expect(session.addTextHotspot('statement', 'body', r.text, newTextHotspot(r.id, 'title')).ok).toBe(false);
    expect(read(folder, 'documents/statement.json').hotspots ?? []).toEqual([]);
    expect(session.addTextHotspot('statement', 'body', r.text, newTextHotspot(r.id, 'body')).ok).toBe(true);
    expect(session.addTextHotspot('statement', 'body', r.text, newTextHotspot(r.id, 'body')).ok).toBe(false);
    expect(read(folder, 'documents/statement.json').hotspots).toHaveLength(1);
  });

  it('refuses clickable words on a part of the document that is not written text', async () => {
    const { session } = await episode();
    session.addDocument('receipt', 'Till roll');
    expect(session.addTextHotspot('till-roll', 'store', '[x]{#x}', newTextHotspot('x', 'store')).ok).toBe(false);
  });

  it('a bad hotspot is refused with a reason, and nothing is written', async () => {
    const { session, folder } = await withText();
    const before = readFileSync(join(folder, 'documents/statement.json'), 'utf8');
    const bad = session.addRectHotspot('statement', { id: 'Bad Id', anchor: { type: 'rect', x: 0, y: 0, width: 1, height: 1 }, target: { type: 'lightbox', text: '' } });
    expect(bad.ok).toBe(false);
    expect(readFileSync(join(folder, 'documents/statement.json'), 'utf8')).toBe(before);
  });

  it('adds a box hotspot, keeping it inside the document', async () => {
    const { session, folder } = await episode();
    const box = newRectHotspot('the-corner');
    box.anchor = { type: 'rect', x: 0.9, y: 0.9, width: 0.5, height: 0.5 };
    expect(session.addRectHotspot('statement', box).ok).toBe(true);
    expect(read(folder, 'documents/statement.json').hotspots[0].anchor).toEqual({ type: 'rect', x: 0.5, y: 0.5, width: 0.5, height: 0.5 });
  });

  it('edits what a hotspot opens: a note, another document, or a registry entry', async () => {
    const { session, folder } = await withText();
    session.addDocument('typed', 'Ticket');
    const r = clickable('He saw the grey van outside.', 'the grey van');
    session.addTextHotspot('statement', 'body', r.text, newTextHotspot(r.id, 'body'));
    const h = (await view(session)).hotspots[0];
    expect(session.setHotspot('statement', { id: h.id, anchor: h.anchor, target: { type: 'lightbox', variant: 'note', title: 'Seen', text: 'A grey van.' } }).ok).toBe(true);
    expect(read(folder, 'documents/statement.json').hotspots[0].target).toEqual({ type: 'lightbox', variant: 'note', title: 'Seen', text: 'A grey van.' });
    expect((await view(session)).hotspots[0].noteText).toBe('A grey van.');
    expect(session.setHotspot('statement', { id: h.id, anchor: h.anchor, target: { type: 'document', document: 'ticket' } }).ok).toBe(true);
    expect(session.setHotspot('statement', { id: h.id, anchor: h.anchor, target: { type: 'registry', entry: 'test-episode/grey-van' } }).ok).toBe(true);
    expect(read(folder, 'documents/statement.json').hotspots[0].target).toEqual({ type: 'registry', entry: 'test-episode/grey-van' });
  });

  it('refuses a hotspot that opens a document that is not there, or the document it is on', async () => {
    const { session } = await withText();
    const r = clickable('He saw the grey van outside.', 'the grey van');
    session.addTextHotspot('statement', 'body', r.text, newTextHotspot(r.id, 'body'));
    const h = (await view(session)).hotspots[0];
    expect(session.setHotspot('statement', { id: h.id, anchor: h.anchor, target: { type: 'document', document: 'ghost' } }).ok).toBe(false);
    expect(session.setHotspot('statement', { id: h.id, anchor: h.anchor, target: { type: 'document', document: 'statement' } }).ok).toBe(false);
    expect(session.setHotspot('statement', { id: 'nope', anchor: h.anchor, target: { type: 'lightbox', text: 'x' } }).ok).toBe(false);
  });

  it('the words a hotspot is on cannot be changed through an edit', async () => {
    const { session } = await withText();
    const r = clickable('He saw the grey van outside.', 'the grey van');
    session.addTextHotspot('statement', 'body', r.text, newTextHotspot(r.id, 'body'));
    const h = (await view(session)).hotspots[0];
    expect(session.setHotspot('statement', { id: h.id, anchor: { type: 'text', slot: 'title' }, target: h.target }).ok).toBe(false);
  });

  it('a note kept in its own file is rewritten in that file', async () => {
    const { session, folder } = await withText();
    const r = clickable('He saw the grey van outside.', 'the grey van');
    session.addTextHotspot('statement', 'body', r.text, newTextHotspot(r.id, 'body'));
    const doc = read(folder, 'documents/statement.json');
    mkdirSync(join(folder, 'documents'), { recursive: true });
    writeFileSync(join(folder, 'documents/van-note.md'), 'old note');
    doc.hotspots[0].target = { type: 'lightbox', file: 'documents/van-note.md' };
    writeFileSync(join(folder, 'documents/statement.json'), JSON.stringify(doc));
    const h = (await view(session)).hotspots[0];
    expect(h.noteText).toBe('old note');
    expect(session.setHotspot('statement', { id: h.id, anchor: h.anchor, target: { type: 'lightbox', text: 'new note' } }).ok).toBe(true);
    expect(readFileSync(join(folder, 'documents/van-note.md'), 'utf8')).toBe('new note');
    expect(read(folder, 'documents/statement.json').hotspots[0].target).toEqual({ type: 'lightbox', file: 'documents/van-note.md' });
  });

  it('a note that points outside the episode is not written through', async () => {
    const { session, folder } = await withText();
    const r = clickable('He saw the grey van outside.', 'the grey van');
    session.addTextHotspot('statement', 'body', r.text, newTextHotspot(r.id, 'body'));
    const doc = read(folder, 'documents/statement.json');
    doc.hotspots[0].target = { type: 'lightbox', file: '../../escaped.md' };
    writeFileSync(join(folder, 'documents/statement.json'), JSON.stringify(doc));
    const h = (await view(session)).hotspots[0];
    expect(session.setHotspot('statement', { id: h.id, anchor: h.anchor, target: { type: 'lightbox', text: 'x' } }).ok).toBe(false);
  });

  it('removing a hotspot on words takes the mark off the words', async () => {
    const { session, folder } = await withText();
    const r = clickable('He saw the grey van outside.', 'the grey van');
    session.addTextHotspot('statement', 'body', r.text, newTextHotspot(r.id, 'body'));
    expect(session.removeHotspot('statement', 'the-grey-van').ok).toBe(true);
    expect(read(folder, 'documents/statement.json').hotspots).toEqual([]);
    expect((await view(session)).slots.find((s) => s.name === 'body')!.text).toBe('He saw the grey van outside.');
  });

  it('removing uses the text as the author has it now, which may be ahead of the saved text', async () => {
    const { session } = await withText();
    const r = clickable('He saw the grey van outside.', 'the grey van');
    session.addTextHotspot('statement', 'body', r.text, newTextHotspot(r.id, 'body'));
    expect(session.removeHotspot('statement', 'the-grey-van', 'He saw [the grey van]{#the-grey-van} outside, then more.').ok).toBe(true);
    expect((await view(session)).slots.find((s) => s.name === 'body')!.text).toBe('He saw the grey van outside, then more.');
  });

  it('removing a box hotspot, or one that is not there', async () => {
    const { session, folder } = await episode();
    session.addRectHotspot('statement', newRectHotspot('box'));
    expect(session.removeHotspot('statement', 'box').ok).toBe(true);
    expect(read(folder, 'documents/statement.json').hotspots).toEqual([]);
    expect(session.removeHotspot('statement', 'box').ok).toBe(false);
  });

  it('keeps everything else in the document file when a hotspot changes', async () => {
    const { session, folder } = await withText();
    const doc = read(folder, 'documents/statement.json');
    doc.somethingElse = { keep: true };
    writeFileSync(join(folder, 'documents/statement.json'), JSON.stringify(doc));
    session.addRectHotspot('statement', newRectHotspot('box'));
    expect(read(folder, 'documents/statement.json').somethingElse).toEqual({ keep: true });
  });

  it('shows a hotspot the file has but the reader would drop as not valid, so it can be seen', async () => {
    const { session, folder } = await withText();
    const doc = read(folder, 'documents/statement.json');
    doc.hotspots = [{ id: 'odd', anchor: { type: 'rect', x: 5, y: 0, width: 1, height: 1 }, target: { type: 'lightbox', text: 'x' } }];
    writeFileSync(join(folder, 'documents/statement.json'), JSON.stringify(doc));
    expect((await view(session)).hotspots[0]).toMatchObject({ id: 'odd', valid: false });
  });

  it('keeps other keys on a hotspot (such as a label) when what it opens is edited', async () => {
    const { session, folder } = await withText();
    const r = clickable('He saw the grey van outside.', 'the grey van');
    session.addTextHotspot('statement', 'body', r.text, newTextHotspot(r.id, 'body'));
    const doc = read(folder, 'documents/statement.json');
    doc.hotspots[0].label = 'Grey van';
    writeFileSync(join(folder, 'documents/statement.json'), JSON.stringify(doc));
    const h = (await view(session)).hotspots[0];
    session.setHotspot('statement', { id: h.id, anchor: h.anchor, target: { type: 'lightbox', text: 'changed' } });
    expect(read(folder, 'documents/statement.json').hotspots[0]).toMatchObject({ label: 'Grey van', target: { type: 'lightbox', text: 'changed' } });
  });

  it('shows a hotspot with no anchor or target with safe defaults, so the form can repair it', async () => {
    const { session, folder } = await withText();
    const doc = read(folder, 'documents/statement.json');
    doc.hotspots = [{ id: 'bare' }, { id: 'half', anchor: { type: 'rect', x: 0, y: 0, width: 0.1, height: 0.1 } }];
    writeFileSync(join(folder, 'documents/statement.json'), JSON.stringify(doc));
    const hs = (await view(session)).hotspots;
    expect(hs.map((h) => h.valid)).toEqual([false, false]);
    expect(hs[0].target).toEqual({ type: 'lightbox', text: '' });
    expect(hs[0].anchor.type).toBe('rect');
    expect(session.setHotspot('statement', { id: 'half', anchor: hs[1].anchor, target: { type: 'lightbox', text: 'fixed' } }).ok).toBe(true);
    expect((await view(session)).hotspots[1].valid).toBe(true);
  });

  it('removing a hotspot whose text cannot be written changes nothing', async () => {
    const { session, folder } = await withText();
    const r = clickable('He saw the grey van outside.', 'the grey van');
    session.addTextHotspot('statement', 'body', r.text, newTextHotspot(r.id, 'body'));
    const doc = read(folder, 'documents/statement.json');
    doc.slots.body = { kind: 'markdown', file: '../../escaped.md' };
    writeFileSync(join(folder, 'documents/statement.json'), JSON.stringify(doc));
    expect(session.removeHotspot('statement', 'the-grey-van', r.text).ok).toBe(false);
    expect(read(folder, 'documents/statement.json').hotspots).toHaveLength(1);
  });
});
