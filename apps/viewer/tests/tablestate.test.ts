import { describe, expect, it } from 'vitest';
import { MOVE_TOLERANCE, syncStates, type DocInfo, type Seen, type TableState } from '../src/lib/tablestate';

const doc = (id: string, over: Partial<DocInfo> & { x?: number; y?: number } = {}): DocInfo => ({
  id,
  hidden: over.hidden ?? false,
  layout: { x: over.x ?? 0.1, y: over.y ?? 0.1, width: 0.3 },
});
const state = (over: Partial<TableState> = {}): TableState => ({ x: 0.1, y: 0.1, zoom: 1, z: 1, entered: true, revealed: true, fromLeft: 50, fromTop: 0, ...over });
const seenOf = (docs: DocInfo[]): Record<string, Seen> => Object.fromEntries(docs.map((d) => [d.id, { x: d.layout.x, y: d.layout.y, hidden: d.hidden }]));

describe('syncStates (edits must not reset the table)', () => {
  it('keeps where a document was dragged and how far it was zoomed when nothing moved in the file', () => {
    const docs = [doc('a')];
    const prev = { a: state({ x: 0.55, y: 0.4, zoom: 2.2, z: 9 }) };
    const out = syncStates(prev, seenOf(docs), docs, 9);
    expect(out.states.a).toMatchObject({ x: 0.55, y: 0.4, zoom: 2.2, z: 9 });
  });

  it('keeps everything when the same episode is simply loaded again', () => {
    const docs = [doc('a'), doc('b', { x: 0.6 })];
    const prev = { a: state({ x: 0.3, zoom: 1.5 }), b: state({ x: 0.7, zoom: 0.8, z: 4 }) };
    const out = syncStates(prev, seenOf(docs), docs, 4);
    expect(out.states).toEqual(prev);
    expect(out.topZ).toBe(4);
  });

  it('follows a position typed in the tool', () => {
    const before = [doc('a', { x: 0.1, y: 0.1 })];
    const after = [doc('a', { x: 0.6, y: 0.3 })];
    const out = syncStates({ a: state({ zoom: 1.7, z: 5 }) }, seenOf(before), after, 5);
    expect(out.states.a).toMatchObject({ x: 0.6, y: 0.3, zoom: 1.7, z: 5 }); // moved, but still zoomed and in place in the stack
  });

  it('does not make a document jump when the tool saves the position the author just dragged it to', () => {
    const before = [doc('a', { x: 0.1, y: 0.1 })];
    const after = [doc('a', { x: 0.456, y: 0.2 })]; // saved, rounded to three decimals
    const prev = { a: state({ x: 0.4561234, y: 0.2000321 }) };
    const out = syncStates(prev, seenOf(before), after, 1);
    expect(out.states.a.x).toBe(0.4561234);
    expect(out.states.a.y).toBe(0.2000321);
    expect(Math.abs(0.4561234 - 0.456)).toBeLessThan(MOVE_TOLERANCE);
  });

  it('a change to width or tilt alone does not move the document', () => {
    const before = [doc('a')];
    const after = [{ ...doc('a'), layout: { x: 0.1, y: 0.1, width: 0.5, rotation: 4 } }];
    const out = syncStates({ a: state({ x: 0.33 }) }, seenOf(before), after, 1);
    expect(out.states.a.x).toBe(0.33);
  });

  it('a position the file did not change is left alone even if the document was dragged elsewhere', () => {
    const docs = [doc('a', { x: 0.1, y: 0.1 })];
    const out = syncStates({ a: state({ x: 0.9, y: 0.8 }) }, seenOf(docs), docs, 1);
    expect(out.states.a).toMatchObject({ x: 0.9, y: 0.8 });
  });

  it('adds a new document where its layout says, in front of the others, already in place', () => {
    const before = [doc('a')];
    const after = [doc('a'), doc('b', { x: 0.5, y: 0.2 })];
    const out = syncStates({ a: state({ z: 3 }) }, seenOf(before), after, 3);
    expect(out.states.b).toMatchObject({ x: 0.5, y: 0.2, zoom: 1, entered: true, revealed: true });
    expect(out.states.b.z).toBeGreaterThan(3);
    expect(out.topZ).toBe(out.states.b.z);
  });

  it('a new hidden document is not shown', () => {
    const out = syncStates({}, {}, [doc('h', { hidden: true })], 0);
    expect(out.states.h.revealed).toBe(false);
  });

  it('drops a document that was deleted', () => {
    const before = [doc('a'), doc('b')];
    const out = syncStates({ a: state(), b: state() }, seenOf(before), [doc('a')], 2);
    expect(Object.keys(out.states)).toEqual(['a']);
    expect(Object.keys(out.seen)).toEqual(['a']);
  });

  it('hides a document the file now hides, and shows one it now shows', () => {
    const before = [doc('a'), doc('b', { hidden: true })];
    const after = [doc('a', { hidden: true }), doc('b', { hidden: false })];
    const out = syncStates({ a: state(), b: state({ revealed: false, entered: false }) }, seenOf(before), after, 2);
    expect(out.states.a.revealed).toBe(false);
    expect(out.states.b).toMatchObject({ revealed: true, entered: true });
  });

  it('a hidden document that something revealed stays revealed while the file still hides it', () => {
    const docs = [doc('h', { hidden: true })];
    const out = syncStates({ h: state({ revealed: true }) }, seenOf(docs), docs, 1);
    expect(out.states.h.revealed).toBe(true);
  });

  it('records what the file said, ready for the next load', () => {
    const docs = [doc('a', { x: 0.2 })];
    const out = syncStates({ a: state() }, {}, docs, 1);
    expect(out.seen.a).toEqual({ x: 0.2, y: 0.1, hidden: false });
  });

  it('never changes what it was given', () => {
    const docs = [doc('a', { x: 0.9 })];
    const prev = { a: state({ x: 0.1 }) };
    const frozen = JSON.stringify(prev);
    syncStates(prev, seenOf([doc('a', { x: 0.1 })]), docs, 1);
    expect(JSON.stringify(prev)).toBe(frozen);
  });
});
