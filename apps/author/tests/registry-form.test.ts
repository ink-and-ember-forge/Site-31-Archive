import { describe, expect, it } from 'vitest';
import { buildEntry, describeReference, draftFromEntry, moveItem, newField, newReference, targetOfPath, type EntryDraft } from '../renderer/src/lib/registry';

const draft = (over: Partial<EntryDraft> = {}): EntryDraft => ({ kind: 'record', title: 'The Grey Van', fields: [], body: '', references: [], ...over });

describe('draftFromEntry', () => {
  it('opens a saved entry for editing', () => {
    const d = draftFromEntry({ kind: 'vehicle', title: 'Van', fields: [{ label: 'A', value: 'B' }], body: 'Text', references: ['x/y'] });
    expect(d).toMatchObject({ kind: 'vehicle', title: 'Van', body: 'Text' });
    expect(d.fields[0]).toMatchObject({ label: 'A', value: 'B' });
    expect(d.references[0].text).toBe('x/y');
  });
});

describe('buildEntry (what is saved)', () => {
  it('builds the entry, trimming title, kind, labels and references', () => {
    const b = buildEntry(draft({ title: ' Van ', kind: ' vehicle ', fields: [newField({ label: ' A ', value: 'B' })], references: [newReference(' a/b ')], body: 'Text' }));
    expect(b.edit).toEqual({ kind: 'vehicle', title: 'Van', fields: [{ label: 'A', value: 'B' }], body: 'Text', references: ['a/b'] });
    expect(b.held).toBe(0);
  });
  it('ignores blank rows, which are just space to type in', () => {
    const b = buildEntry(draft({ fields: [newField(), newField({ label: 'A', value: 'B' })], references: [newReference(''), newReference('  ')] }));
    expect(b.edit?.fields).toEqual([{ label: 'A', value: 'B' }]);
    expect(b.edit?.references).toEqual([]);
  });
  it('holds the save for an empty title or kind, with the reason', () => {
    expect(buildEntry(draft({ title: ' ' })).edit).toBeNull();
    expect(buildEntry(draft({ title: ' ' })).titleError).toContain('title');
    expect(buildEntry(draft({ kind: '' })).kindError).toContain('kind');
    expect(buildEntry(draft({ title: 'x'.repeat(201) })).titleError).toContain('200');
  });
  it('holds the save for a field with a value but no label, naming the row', () => {
    const f = newField({ value: 'orphan' });
    const b = buildEntry(draft({ fields: [f] }));
    expect(b.edit).toBeNull();
    expect(b.fieldErrors[f.key]).toContain('label');
    expect(b.held).toBe(1);
  });
  it('holds the save for a reference that is not an id, and for a half-typed one', () => {
    const bad = newReference('Not An Id');
    const half = newReference('episode-id/');
    const b = buildEntry(draft({ references: [bad, half, newReference('ok/fine')] }));
    expect(b.edit).toBeNull();
    expect(Object.keys(b.referenceErrors).map(Number)).toEqual([bad.key, half.key]);
    expect(b.held).toBe(2);
  });
  it('saves a repeated reference once, and says so', () => {
    const a = newReference('a/b');
    const dup = newReference('a/b');
    const b = buildEntry(draft({ references: [a, dup] }));
    expect(b.edit?.references).toEqual(['a/b']);
    expect(b.referenceErrors[dup.key]).toContain('only saved once');
    expect(b.held).toBe(0);
  });
  it('holds the save for too much text or too many fields', () => {
    expect(buildEntry(draft({ body: 'x'.repeat(20001) })).edit).toBeNull();
    expect(buildEntry(draft({ fields: Array.from({ length: 51 }, (_, i) => newField({ label: `L${i}`, value: 'v' })) })).edit).toBeNull();
    expect(buildEntry(draft({ references: Array.from({ length: 51 }, (_, i) => newReference(`a/b${i}`)) })).edit).toBeNull();
  });
  it('a list opened for editing and saved again is exactly what it was', () => {
    const original = { kind: 'record', title: 'T', fields: [{ label: 'A', value: 'B' }, { label: 'C', value: '' }], body: 'Body\nwith lines', references: ['a/b', 'c/d'] };
    expect(buildEntry(draftFromEntry(original)).edit).toEqual(original);
  });
});

describe('moveItem', () => {
  const rows = [newField({ label: 'a' }), newField({ label: 'b' }), newField({ label: 'c' })];
  it('swaps a row with its neighbour, and does nothing at the ends', () => {
    expect(moveItem(rows, rows[1].key, -1).map((r) => r.label)).toEqual(['b', 'a', 'c']);
    expect(moveItem(rows, rows[0].key, -1)).toBe(rows);
    expect(moveItem(rows, rows[2].key, 1)).toBe(rows);
    expect(moveItem(rows, 99999, 1)).toBe(rows);
  });
});

describe('describeReference', () => {
  const entries = [{ globalId: 'ep/van', title: 'The Van' }];
  it('names an entry in this episode by its title, and others as redacted', () => {
    expect(describeReference('ep/van', entries)).toBe('The Van');
    expect(describeReference(' ep/van ', entries)).toBe('The Van');
    expect(describeReference('other/thing', entries)).toContain('redacted');
  });
});

describe('targetOfPath (where "Go to it" goes)', () => {
  it('finds the document, entry or episode a problem is about', () => {
    expect(targetOfPath('documents/statement.json hotspots[0]')).toEqual({ type: 'document', id: 'statement' });
    expect(targetOfPath('documents/statement.json')).toEqual({ type: 'document', id: 'statement' });
    expect(targetOfPath('documents/till-roll.body.md')).toEqual({ type: 'document', id: 'till-roll' });
    expect(targetOfPath('registry/grey-van.json')).toEqual({ type: 'registry', id: 'grey-van' });
    expect(targetOfPath('case.json')).toEqual({ type: 'episode' });
  });
  it('gives nothing for paths it does not know', () => {
    expect(targetOfPath('theme/templates/typed.json')).toBeUndefined();
    expect(targetOfPath('')).toBeUndefined();
    expect(targetOfPath('media/images/x.png')).toBeUndefined();
  });
});
