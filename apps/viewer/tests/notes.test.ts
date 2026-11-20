import { describe, expect, it } from 'vitest';
import { NOTE_WIDTH, placeNotes, type NoteInput } from '../src/lib/notes';

const table = { width: 1200, height: 700 };
const note = (key: string, over: Partial<NoteInput> = {}): NoteInput => ({
  key,
  anchor: { left: 650, right: 700, y: 200 },
  doc: { left: 400, right: 720 },
  height: 100,
  ...over,
});

describe('placeNotes', () => {
  it('puts the note to the right of the document, pointing at the end of the words', () => {
    const [p] = placeNotes([note('a')], table);
    expect(p.side).toBe('right');
    expect(p.x).toBeGreaterThan(720);
    expect(p.ax).toBe(700); // pointer touches the right end of the words
    expect(p.bx).toBe(p.x); // and meets the callout's near edge
  });

  it('uses the left side only when there is no room on the right', () => {
    const [p] = placeNotes([note('a', { doc: { left: 400, right: 1100 }, anchor: { left: 1000, right: 1050, y: 200 } })], table);
    expect(p.side).toBe('left');
    expect(p.x + p.width).toBeLessThan(400);
    expect(p.ax).toBe(1000); // pointer touches the left end of the words
  });

  it('keeps callouts inside the table', () => {
    const [p] = placeNotes([note('a', { anchor: { left: 650, right: 700, y: 690 }, height: 120 })], table);
    expect(p.y + p.height).toBeLessThanOrEqual(table.height);
    expect(p.y).toBeGreaterThanOrEqual(0);
  });

  it('stacks notes that would overlap instead of covering each other', () => {
    const [a, b] = placeNotes([note('a'), note('b', { anchor: { left: 650, right: 700, y: 215 } })], table);
    const overlap = a.y < b.y + b.height && b.y < a.y + a.height;
    expect(overlap).toBe(false);
  });

  it('hides a note whose words are dragged off the table', () => {
    const [p] = placeNotes([note('a', { anchor: { left: 1300, right: 1350, y: 200 } })], table);
    expect(p.hidden).toBe(true);
  });

  it('never makes a callout wider than 40% of a narrow table', () => {
    const [p] = placeNotes([note('a')], { width: 500, height: 700 });
    expect(p.width).toBeLessThanOrEqual(200);
    expect(NOTE_WIDTH).toBe(260);
  });

  it('honours a per-note width and meets the callout edge at a single point', () => {
    const [p] = placeNotes([note('a', { width: 200 })], table);
    expect(p.width).toBe(200);
    expect(p.by).toBeGreaterThanOrEqual(p.y);
    expect(p.by).toBeLessThanOrEqual(p.y + p.height);
  });

  it('gives the pointer a base on the callout edge', () => {
    const [p] = placeNotes([note('a')], table);
    expect(p.by2).toBeGreaterThan(p.by1);
    expect(p.by1).toBeGreaterThanOrEqual(p.y);
    expect(p.by2).toBeLessThanOrEqual(p.y + p.height);
  });
});
