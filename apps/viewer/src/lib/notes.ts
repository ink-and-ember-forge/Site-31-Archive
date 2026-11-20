// Where marginal-note callouts go. Pure maths so it can be tested without a browser.
// All numbers are pixels relative to the table.

export const NOTE_WIDTH = 260;
const GAP = 30; // space between the document and its callouts, where the pointer runs
const MARGIN = 8; // keep callouts this far inside the table
const STACK_GAP = 8;

export interface NoteInput {
  key: string;
  /** The highlighted words: left edge of the first line, right edge of the last, and a line's vertical centre. */
  anchor: { left: number; right: number; y: number };
  /** The document the note belongs to. */
  doc: { left: number; right: number };
  /** Rendered height of the callout. */
  height: number;
  /** Callout width; defaults to NOTE_WIDTH. */
  width?: number;
}

export interface NotePlacement {
  key: string;
  side: 'left' | 'right';
  x: number;
  y: number;
  width: number;
  height: number;
  /** Point on the highlighted words that the pointer touches. */
  ax: number;
  ay: number;
  /** The pointer's base, on the callout's near edge. */
  bx: number;
  by1: number;
  by2: number;
  /** Where a single-line connector meets the callout edge (middle of by1..by2). */
  by: number;
  /** The anchor is off the table, so the callout is hidden. */
  hidden: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function placeNotes(inputs: NoteInput[], table: { width: number; height: number }): NotePlacement[] {
  const placed: NotePlacement[] = inputs.map((n) => {
    const width = Math.min(n.width ?? NOTE_WIDTH, table.width * 0.4);
    // Notes go to the right of the document, as in margins; the left is used only if there is no room.
    const roomRight = table.width - n.doc.right - GAP - MARGIN >= width;
    const roomLeft = n.doc.left - GAP - MARGIN >= width;
    const side: 'left' | 'right' = !roomRight && roomLeft ? 'left' : 'right';

    const x = clamp(side === 'right' ? n.doc.right + GAP : n.doc.left - GAP - width, MARGIN, table.width - width - MARGIN);
    const ax = side === 'right' ? n.anchor.right : n.anchor.left;
    const ay = n.anchor.y;
    return {
      key: n.key,
      side,
      x,
      y: clamp(ay - 14, MARGIN, Math.max(MARGIN, table.height - n.height - MARGIN)),
      width,
      height: n.height,
      ax,
      ay,
      bx: side === 'right' ? x : x + width,
      by1: 0,
      by2: 0,
      by: 0,
      hidden: ax < 0 || ax > table.width || ay < 0 || ay > table.height,
    };
  });

  // Notes that would overlap are pushed down, top to bottom.
  const visible = placed.filter((p) => !p.hidden).sort((a, b) => a.y - b.y);
  visible.forEach((p, i) => {
    for (const q of visible.slice(0, i)) {
      const sideBySide = p.x < q.x + q.width && q.x < p.x + p.width;
      if (sideBySide && p.y < q.y + q.height + STACK_GAP && p.y + p.height > q.y) p.y = q.y + q.height + STACK_GAP;
    }
    p.y = Math.min(p.y, Math.max(MARGIN, table.height - p.height - MARGIN));
  });

  for (const p of placed) {
    const half = Math.max(2, Math.min(12, p.height / 2 - 4));
    const centre = clamp(p.ay, p.y + 12, p.y + p.height - 12);
    p.by1 = centre - half;
    p.by2 = centre + half;
    p.by = centre;
  }
  return placed;
}
