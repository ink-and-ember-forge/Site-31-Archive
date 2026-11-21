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

describe('starterEpisodeFiles from a template', () => {
  it('starts from the main form: a valid episode with no problems, marked as placeholder', async () => {
    const { theme } = loadThemeFromFs(repoTheme);
    const files = starterEpisodeFiles('my-episode', 'My Episode', '2026-03-14', theme.templates['witness-statement']);
    const result = await loadCasefile(memorySource(files), { expectedId: 'my-episode' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([]);
    expect(checkAgainstTheme(result.casefile, theme)).toEqual([]);
    const doc = result.casefile.documents[0];
    expect(doc).toMatchObject({ id: 'statement', template: 'witness-statement', role: 'central' });
    expect(doc.slots.title).toEqual({ kind: 'value', value: 'PLACEHOLDER: FORM TITLE' });
    expect(files['documents/statement.body.md']).toContain('PLACEHOLDER');
    expect(Object.keys(doc.slots).length).toBeGreaterThan(15); // every part of the form exists, empty
  });
  it('without a template it is still the plain typed page', async () => {
    const files = starterEpisodeFiles('x', 'X', '2026-01-01');
    expect(JSON.parse(files['documents/statement.json']).template).toBe('typed');
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

import {
  addDocumentToManifest,
  clampLayout,
  defaultLayout,
  imageFileName,
  newDocumentFiles,
  removeDocumentFromManifest,
  setCentralInManifest,
  setHiddenInManifest,
  setLayoutInManifest,
  uniqueId,
} from '../src/authoring';

describe('uniqueId', () => {
  it('keeps a free id and numbers a taken one', () => {
    expect(uniqueId('receipt', [])).toBe('receipt');
    expect(uniqueId('receipt', ['receipt'])).toBe('receipt-2');
    expect(uniqueId('receipt', ['receipt', 'receipt-2'])).toBe('receipt-3');
  });
});

describe('layout', () => {
  it('keeps values inside what the format allows and drops a zero rotation', () => {
    expect(clampLayout({ x: -1, y: 2, width: 5, rotation: 0 })).toEqual({ x: 0, y: 1, width: 1 });
    expect(clampLayout({ x: 0.5, y: 0.5, width: 0, rotation: 400 })).toEqual({ x: 0.5, y: 0.5, width: 0.05, rotation: 180 });
    expect(clampLayout({ x: NaN, y: NaN, width: NaN })).toEqual({ x: 0, y: 0, width: 0.2 });
  });
  it('sizes new documents by their shape and staggers them', () => {
    const tall = defaultLayout(0.45, 0);
    const wide = defaultLayout(1.33, 0);
    expect(tall.width).toBeLessThan(wide.width);
    expect(wide.width).toBeLessThanOrEqual(0.3);
    expect(defaultLayout(0.7, 1).x).toBeGreaterThan(defaultLayout(0.7, 0).x);
    expect(defaultLayout(undefined, 0).width).toBeGreaterThan(0);
  });
});

describe('newDocumentFiles', () => {
  const template = { id: 'receipt', slots: [{ name: 'store', kind: 'value' as const }, { name: 'items', kind: 'markdown' as const }, { name: 'logo', kind: 'image' as const }] };
  it('makes empty slots for text and values, and leaves images to be chosen', () => {
    const { document, files } = newDocumentFiles('till-roll', template);
    expect(document).toEqual({
      template: 'receipt',
      role: 'supporting',
      slots: { store: { kind: 'value', value: '' }, items: { kind: 'markdown', file: 'documents/till-roll.items.md' } },
    });
    expect(files).toEqual({ 'documents/till-roll.items.md': '' });
  });
  it('makes a document the loader accepts', async () => {
    const { document, files } = newDocumentFiles('till-roll', template);
    const base = starterEpisodeFiles('ep', 'Ep', '2026-01-01');
    const manifest = JSON.parse(base['case.json']);
    const updated = addDocumentToManifest(manifest, 'till-roll', defaultLayout(0.45, 1));
    const result = await loadCasefile(
      memorySource({ ...base, 'case.json': serializeManifest(updated), 'documents/till-roll.json': JSON.stringify(document), ...files }),
      { expectedId: 'ep' },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warnings).toEqual([]);
  });
});

describe('newDocumentFiles for the new kinds', () => {
  it('starts an itemised list empty and a set of choices with nothing ticked', () => {
    const { document, files } = newDocumentFiles('form-1', {
      id: 'form',
      slots: [{ name: 'lines', kind: 'items' as const }, { name: 'ticks', kind: 'choices' as const }, { name: 'name', kind: 'value' as const, label: 'Name:' }],
    });
    expect((document as { slots: unknown }).slots).toEqual({
      lines: { kind: 'items', items: [] },
      ticks: { kind: 'choices', selected: [] },
      name: { kind: 'value', value: '' },
    });
    expect(files).toEqual({});
  });
});

describe('manifest edits', () => {
  const base = {
    formatVersion: 1,
    id: 'x',
    centralDocument: 'a',
    documents: [
      { id: 'a', layout: { x: 0.1, y: 0.1, width: 0.3 } },
      { id: 'b', layout: { x: 0.5, y: 0.1, width: 0.2 }, hidden: true },
    ],
    extra: 'kept',
  };
  it('adds and removes a document, leaving everything else alone', () => {
    const added = addDocumentToManifest(base, 'c', { x: 0.2, y: 0.2, width: 0.2 });
    expect((added.documents as { id: string }[]).map((d) => d.id)).toEqual(['a', 'b', 'c']);
    expect(added.extra).toBe('kept');
    expect((removeDocumentFromManifest(added, 'b').documents as { id: string }[]).map((d) => d.id)).toEqual(['a', 'c']);
  });
  it('making a hidden document the main one also un-hides it', () => {
    const next = setCentralInManifest(base, 'b');
    expect(next.centralDocument).toBe('b');
    expect((next.documents as { id: string; hidden?: boolean }[]).find((d) => d.id === 'b')).not.toHaveProperty('hidden');
  });
  it('never hides the main document, and can show a hidden one again', () => {
    expect(setHiddenInManifest(base, 'a', true)).toBe(base);
    const hidden = setHiddenInManifest(base, 'a', true);
    expect(hidden).toEqual(base);
    const shown = setHiddenInManifest(base, 'b', false);
    expect((shown.documents as { id: string }[]).find((d) => d.id === 'b')).not.toHaveProperty('hidden');
    const hiddenA = setHiddenInManifest({ ...base, centralDocument: 'x' }, 'a', true);
    expect((hiddenA.documents as { id: string; hidden?: boolean }[])[0].hidden).toBe(true);
  });
  it('changes only the one document layout, clamped', () => {
    const next = setLayoutInManifest(base, 'a', { x: 3, y: 0.3, width: 0.4 });
    expect((next.documents as { layout: unknown }[])[0].layout).toEqual({ x: 1, y: 0.3, width: 0.4 });
    expect((next.documents as { layout: unknown }[])[1].layout).toEqual({ x: 0.5, y: 0.1, width: 0.2 });
  });
});

describe('imageFileName', () => {
  it('makes a safe lowercase name and never overwrites', () => {
    expect(imageFileName('Photo From Scene #2.JPG', [])).toBe('photo-from-scene-2.jpg');
    expect(imageFileName('scan.png', ['scan.png'])).toBe('scan-2.png');
    expect(imageFileName('???.png', [])).toBe('image.png');
    expect(imageFileName('noextension', [])).toBe('noextension');
    expect(imageFileName('../../etc/passwd.txt', [])).toBe('etc-passwd.txt');
  });
});

import { editorPlan, planSlots } from '../src/authoring';

describe('editorPlan (the tool\'s form follows the paper)', () => {
  const slots = (...names: string[]) => names.map((name) => ({ name }));

  it('follows the layout in order, and every slot appears exactly once', () => {
    const template = {
      slots: slots('crest', 'name', 'title', 'subtitle', 'a', 'b', 'c', 'body', 'note', 'orphan'),
      layout: {
        block: 'stack',
        children: [
          { block: 'letterhead', props: { crest: 'crest', name: 'name' } },
          { block: 'title', slot: 'title', props: { subtitle: 'subtitle' } },
          { block: 'section-bar', props: { text: 'GENERAL' } },
          { block: 'field-grid', props: { rows: [[{ slot: 'a', width: 2 }, { slot: 'b' }], [{ slot: 'c', shaded: true }]] } },
          { block: 'ruled-lines', slot: 'body' },
          { block: 'caption', slot: 'note' },
        ],
      },
    };
    const plan = editorPlan(template);
    expect(plan).toEqual([
      { type: 'slots', title: 'Letterhead', slots: ['crest', 'name'] },
      { type: 'slots', title: 'Title', slots: ['title', 'subtitle'] },
      { type: 'bar', text: 'GENERAL' },
      { type: 'grid', rows: [[{ slot: 'a', width: 2, shaded: false }, { slot: 'b', width: 1, shaded: false }], [{ slot: 'c', width: 1, shaded: true }]] },
      { type: 'slots', slots: ['body'], tall: true },
      { type: 'slots', slots: ['note'] },
      { type: 'slots', title: 'Other parts', slots: ['orphan'] },
    ]);
    const all = plan.flatMap((p) => (p.type === 'grid' ? p.rows.flat().map((c) => c.slot) : p.type === 'slots' ? p.slots : []));
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual(template.slots.map((s) => s.name).sort());
  });

  it('a slot used twice in the layout is shown once, at its first use', () => {
    const plan = editorPlan({ slots: slots('ref'), layout: { block: 'stack', children: [{ block: 'field-row', slot: 'ref' }, { block: 'barcode', props: { seed: 'ref' } }] } });
    expect(plan).toEqual([{ type: 'slots', slots: ['ref'] }]);
  });

  it('ignores references to slots the template does not have, and malformed grids', () => {
    const plan = editorPlan({
      slots: slots('a'),
      layout: { block: 'stack', children: [{ block: 'field-grid', props: { rows: 'nope' } }, { block: 'field-grid', props: { rows: [[{ slot: 'ghost' }, null, 5], 'x', [{ slot: 'a', width: -3 }]] } }, { block: 'title', slot: 'ghost' }] },
    });
    expect(plan).toEqual([{ type: 'grid', rows: [[{ slot: 'a', width: 1, shaded: false }]] }]);
  });

  it('puts the two parts of a split row side by side', () => {
    const plan = editorPlan({ slots: slots('date', 'time'), layout: { block: 'split-row', props: { left: 'date', right: 'time' } } });
    expect(plan).toEqual([{ type: 'grid', rows: [[{ slot: 'date', width: 1, shaded: false }, { slot: 'time', width: 1, shaded: false }]] }]);
  });

  it('gives a template with no layout use of its slots a plain list', () => {
    expect(editorPlan({ slots: slots('a', 'b'), layout: { block: 'stack' } })).toEqual([{ type: 'slots', title: 'Other parts', slots: ['a', 'b'] }]);
  });

  it('groups blocks into the template\'s sections, in the template\'s order, and unsectioned ones come first', () => {
    const plan = editorPlan({
      slots: slots('store', 'date', 'time', 'payment', 'notes', 'barcodeNo', 'seed', 'free'),
      sections: [{ id: 'footer', name: 'Footer' }, { id: 'heading', name: 'Heading', open: true }, { id: 'empty', name: 'Never used' }],
      layout: {
        block: 'stack',
        children: [
          { block: 'title', slot: 'store', section: 'heading' },
          { block: 'split-row', props: { left: 'date', right: 'time' }, section: 'heading' },
          { block: 'paragraph', slot: 'payment', section: 'footer' },
          { block: 'paragraph', slot: 'free' },
          { block: 'barcode', props: { seed: 'seed', number: 'barcodeNo' }, section: 'footer' },
        ],
      },
    });
    expect(plan).toEqual([
      { type: 'slots', slots: ['free'] },
      { type: 'section', id: 'footer', title: 'Footer', items: [{ type: 'slots', slots: ['payment'] }, { type: 'slots', slots: ['seed', 'barcodeNo'] }] },
      {
        type: 'section',
        id: 'heading',
        title: 'Heading',
        open: true,
        items: [
          { type: 'slots', title: 'Title', slots: ['store'] },
          { type: 'grid', rows: [[{ slot: 'date', width: 1, shaded: false }, { slot: 'time', width: 1, shaded: false }]] },
        ],
      },
      { type: 'slots', title: 'Other parts', slots: ['notes'] },
    ]);
  });

  it('a block inherits its parent\'s section, and an unknown section means no section', () => {
    const plan = editorPlan({
      slots: slots('a', 'b', 'c'),
      sections: [{ id: 's', name: 'S' }],
      layout: { block: 'stack', children: [{ block: 'columns', section: 's', children: [{ block: 'paragraph', slot: 'a' }, { block: 'paragraph', slot: 'b' }] }, { block: 'paragraph', slot: 'c', section: 'ghost' }] },
    });
    expect(plan).toEqual([{ type: 'slots', slots: ['c'] }, { type: 'section', id: 's', title: 'S', items: [{ type: 'slots', slots: ['a'] }, { type: 'slots', slots: ['b'] }] }]);
  });

  it('shows the number and caption under a barcode or QR code as form parts', () => {
    expect(editorPlan({ slots: slots('ref', 'no'), layout: { block: 'barcode', props: { seed: 'ref', number: 'no' } } })).toEqual([{ type: 'slots', slots: ['ref', 'no'] }]);
    expect(editorPlan({ slots: slots('qr', 'cap'), layout: { block: 'qr-code', slot: 'qr', props: { caption: 'cap' } } })).toEqual([{ type: 'slots', slots: ['qr'] }, { type: 'slots', slots: ['cap'] }]);
  });

  it('covers every slot of the real theme templates, once each', async () => {
    const { theme } = loadThemeFromFs(repoTheme);
    for (const template of Object.values(theme.templates)) {
      const plan = editorPlan(template);
      const all = plan.flatMap(planSlots);
      expect([...all].sort(), template.id).toEqual(template.slots.map((s) => s.name).sort());
    }
  });
});
