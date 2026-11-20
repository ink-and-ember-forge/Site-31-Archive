import { describe, expect, it } from 'vitest';
import { loadCasefile } from '../src/loader';
import { fsSource, zipFolder } from '../src/node';
import { zipSource } from '../src/source';
import { minimalPath, sampleJson, samplePath, sampleWith } from './helpers';

const messages = (issues: { message: string }[]) => issues.map((i) => i.message).join(' | ');

describe('valid packages', () => {
  it('loads the placeholder sample with no warnings', async () => {
    const result = await loadCasefile(fsSource(samplePath), { expectedId: 'sample-placeholder' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([]);
    const { casefile } = result;
    expect(casefile.documents.map((d) => d.id)).toEqual(['statement', 'receipt', 'still', 'ticket']);
    expect(casefile.documents.find((d) => d.id === 'statement')!.hotspots).toHaveLength(3);
    expect(casefile.registry.map((e) => e.globalId)).toEqual([
      'sample-placeholder/placeholder-entry-a',
      'sample-placeholder/placeholder-entry-b',
    ]);
    expect(casefile.ledger).toHaveLength(2);
  });

  it('opens with every optional layer absent', async () => {
    const result = await loadCasefile(fsSource(minimalPath), { expectedId: 'minimal' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([]);
    expect(result.casefile.registry).toEqual([]);
    expect(result.casefile.documents[0].hotspots).toEqual([]);
  });

  it('loads identically from a zipped .casefile', async () => {
    const fromFolder = await loadCasefile(fsSource(samplePath));
    const fromZip = await loadCasefile(zipSource(zipFolder(samplePath)));
    expect(fromZip).toEqual(fromFolder);
  });

  it('zips deterministically', () => {
    expect(zipFolder(samplePath)).toEqual(zipFolder(samplePath));
  });

  it('tolerates unknown extra fields (additive changes are non-breaking)', async () => {
    const manifest = await sampleJson<Record<string, unknown>>('case.json');
    const source = await sampleWith({ 'case.json': { ...manifest, someFutureField: true } });
    expect((await loadCasefile(source)).ok).toBe(true);
  });
});

describe('episode-level failures (only that episode fails)', () => {
  it('fails when case.json is missing', async () => {
    const r = await loadCasefile(await sampleWith({ 'case.json': undefined }));
    expect(r.ok).toBe(false);
  });

  it('fails when case.json is not JSON', async () => {
    const r = await loadCasefile(await sampleWith({ 'case.json': '{ not json' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(messages(r.errors)).toContain('not valid JSON');
  });

  it('fails clearly on a newer formatVersion', async () => {
    const manifest = await sampleJson<Record<string, unknown>>('case.json');
    const r = await loadCasefile(await sampleWith({ 'case.json': { ...manifest, formatVersion: 99 } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(messages(r.errors)).toContain('newer than this viewer supports');
  });

  it('fails when required manifest fields are missing', async () => {
    const manifest = await sampleJson<Record<string, unknown>>('case.json');
    const { title: _title, ...withoutTitle } = manifest;
    const r = await loadCasefile(await sampleWith({ 'case.json': withoutTitle }));
    expect(r.ok).toBe(false);
  });

  it('fails when the id does not match the folder name', async () => {
    const r = await loadCasefile(await sampleWith({}), { expectedId: 'something-else' });
    expect(r.ok).toBe(false);
  });

  it('fails when the central document is not listed', async () => {
    const manifest = await sampleJson<Record<string, unknown>>('case.json');
    const r = await loadCasefile(await sampleWith({ 'case.json': { ...manifest, centralDocument: 'nope' } }));
    expect(r.ok).toBe(false);
  });

  it('fails when the central document file is missing or malformed', async () => {
    expect((await loadCasefile(await sampleWith({ 'documents/statement.json': undefined }))).ok).toBe(false);
    expect((await loadCasefile(await sampleWith({ 'documents/statement.json': '{ nope' }))).ok).toBe(false);
  });
});

describe('partial packages degrade gracefully', () => {
  it('drops a missing supporting document and keeps the rest', async () => {
    const r = await loadCasefile(await sampleWith({ 'documents/receipt.json': undefined }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.casefile.documents.map((d) => d.id)).toEqual(['statement', 'still', 'ticket']);
    expect(messages(r.warnings)).toContain('document dropped');
  });

  it('drops a slot whose image is missing', async () => {
    const r = await loadCasefile(await sampleWith({ 'media/images/placeholder-still.svg': undefined }));
    if (!r.ok) throw new Error('should load');
    expect(r.casefile.documents.find((d) => d.id === 'still')!.slots.image).toBeUndefined();
    expect(messages(r.warnings)).toContain('slot "image" dropped');
  });

  it('refuses slot paths that escape the package', async () => {
    const doc = await sampleJson<any>('documents/still.json');
    doc.slots.image.file = '../../etc/passwd';
    const r = await loadCasefile(await sampleWith({ 'documents/still.json': doc }));
    if (!r.ok) throw new Error('should load');
    expect(messages(r.warnings)).toContain('missing or unsafe');
  });

  it('drops a malformed hotspot but keeps the others', async () => {
    const doc = await sampleJson<any>('documents/statement.json');
    doc.hotspots[0] = { id: 'note-1', anchor: { type: 'banana' } };
    const r = await loadCasefile(await sampleWith({ 'documents/statement.json': doc }));
    if (!r.ok) throw new Error('should load');
    expect(r.casefile.documents[0].hotspots.map((h) => h.id)).toEqual(['ref-1', 'ticket-1']);
    expect(messages(r.warnings)).toContain('hotspot dropped');
  });

  it('drops a text hotspot whose span is not in the text', async () => {
    const r = await loadCasefile(await sampleWith({ 'documents/statement.md': 'no spans here' }));
    if (!r.ok) throw new Error('should load');
    expect(r.casefile.documents[0].hotspots).toEqual([]);
    // three dropped hotspots, plus the hidden "ticket" document is now unreachable
    expect(r.warnings.length).toBe(4);
    expect(messages(r.warnings)).toContain('hidden document "ticket" is never opened');
  });

  it('accepts note variants and drops a hotspot with an unknown variant', async () => {
    const ok = await loadCasefile(fsSource(samplePath));
    if (!ok.ok) throw new Error('should load');
    const variants = ok.casefile.documents.flatMap((d) => d.hotspots).flatMap((h) => (h.target.type === 'lightbox' ? [h.target.variant] : []));
    expect(variants.sort()).toEqual(['formal', 'note']);

    const doc = await sampleJson<any>('documents/statement.json');
    doc.hotspots[0].target.variant = 'sparkly';
    const r = await loadCasefile(await sampleWith({ 'documents/statement.json': doc }));
    if (!r.ok) throw new Error('should load');
    expect(r.casefile.documents[0].hotspots.map((h) => h.id)).toEqual(['ref-1', 'ticket-1']);
    expect(messages(r.warnings)).toContain('hotspot dropped');
  });

  it('drops duplicate hotspot ids', async () => {
    const doc = await sampleJson<any>('documents/statement.json');
    doc.hotspots.push(doc.hotspots[0]);
    const r = await loadCasefile(await sampleWith({ 'documents/statement.json': doc }));
    if (!r.ok) throw new Error('should load');
    expect(r.casefile.documents[0].hotspots).toHaveLength(3);
    expect(messages(r.warnings)).toContain('duplicate id');
  });

  it('keeps a registry hotspot that points at another, unpublished episode', async () => {
    const doc = await sampleJson<any>('documents/statement.json');
    doc.hotspots[1].target.entry = 'placeholder-other-episode/placeholder-entry-z';
    const r = await loadCasefile(await sampleWith({ 'documents/statement.json': doc }));
    if (!r.ok) throw new Error('should load');
    expect(r.warnings).toEqual([]);
    expect(r.casefile.documents[0].hotspots).toHaveLength(3);
  });

  it('drops a registry hotspot that points at a missing entry of this episode', async () => {
    const r = await loadCasefile(await sampleWith({ 'registry/placeholder-entry-a.json': undefined }));
    if (!r.ok) throw new Error('should load');
    expect(r.casefile.documents[0].hotspots.map((h) => h.id)).toEqual(['note-1', 'ticket-1']);
  });

  it('drops a document hotspot pointing at an unknown document', async () => {
    const doc = await sampleJson<any>('documents/statement.json');
    doc.hotspots[2].target.document = 'ghost';
    const r = await loadCasefile(await sampleWith({ 'documents/statement.json': doc }));
    if (!r.ok) throw new Error('should load');
    expect(messages(r.warnings)).toContain('not in this episode');
  });

  it('warns about a hidden document that no hotspot opens', async () => {
    const r = await loadCasefile(await sampleWith({ 'documents/statement.md': 'x [a]{#note-1} [b]{#ref-1}' }));
    if (!r.ok) throw new Error('should load');
    expect(messages(r.warnings)).toContain('hidden document "ticket" is never opened');
  });

  it('drops a malformed registry entry and ignores a malformed ledger', async () => {
    const r = await loadCasefile(
      await sampleWith({ 'registry/placeholder-entry-b.json': '{ nope', 'ledger.json': { entries: 'wrong' } }),
    );
    if (!r.ok) throw new Error('should load');
    expect(r.casefile.registry.map((e) => e.id)).toEqual(['placeholder-entry-a']);
    expect(r.casefile.ledger).toEqual([]);
    expect(r.warnings.length).toBe(2);
  });

  it('drops a registry entry whose id does not match its file name', async () => {
    const entry = await sampleJson<any>('registry/placeholder-entry-b.json');
    const r = await loadCasefile(await sampleWith({ 'registry/placeholder-entry-b.json': { ...entry, id: 'other' } }));
    if (!r.ok) throw new Error('should load');
    expect(r.casefile.registry).toHaveLength(1);
  });

  it('drops a voiceover whose audio file is missing', async () => {
    const manifest = await sampleJson<Record<string, unknown>>('case.json');
    const r = await loadCasefile(await sampleWith({ 'case.json': { ...manifest, voiceover: { file: 'media/audio/none.mp3' } } }));
    if (!r.ok) throw new Error('should load');
    expect(r.casefile.manifest.voiceover).toBeUndefined();
    expect(messages(r.warnings)).toContain('voiceover dropped');
  });

  it('ignores an invalid episode-level template without failing', async () => {
    const r = await loadCasefile(await sampleWith({ 'templates/bad.json': '{}' }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toHaveLength(1);
  });
});
