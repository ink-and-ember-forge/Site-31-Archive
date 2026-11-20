// How the table's state (where each document sits, its zoom, whether it is shown) survives the episode being
// loaded again while it is on screen: the authoring tool does this after every edit. Pure, so it can be tested.

export interface TableState {
  x: number;
  y: number;
  zoom: number;
  z: number;
  entered: boolean;
  /** Hidden documents only exist on the table once something reveals them. */
  revealed: boolean;
  /** Where the document starts from when it enters (percent of the table). */
  fromLeft: number;
  fromTop: number;
  /** The document's real width over height, measured when it is focused. */
  shape?: number;
}

export interface DocInfo {
  id: string;
  hidden: boolean;
  layout: { x: number; y: number; width: number; rotation?: number };
}

/** What the file said about a document the last time it was loaded. */
export interface Seen {
  x: number;
  y: number;
  hidden: boolean;
}

/** Moves smaller than this (a fraction of the table) are rounding, not an edit, so they do not make a document jump. */
export const MOVE_TOLERANCE = 0.002;

export interface Synced {
  states: Record<string, TableState>;
  seen: Record<string, Seen>;
  topZ: number;
}

/**
 * Brings the table's state in line with a freshly loaded list of documents, keeping what the reader (or author) has
 * done on the table:
 * - a document still there keeps its position, zoom and stacking, unless its position was changed in the file;
 * - a new document appears where its layout says, in front;
 * - a deleted document goes;
 * - hiding or showing a document in the file hides or shows it.
 */
export function syncStates(prev: Record<string, TableState>, seen: Record<string, Seen>, docs: DocInfo[], topZ: number): Synced {
  const states: Record<string, TableState> = {};
  const nextSeen: Record<string, Seen> = {};
  let z = topZ;

  for (const d of docs) {
    const before = prev[d.id];
    const was = seen[d.id];
    if (!before) {
      states[d.id] = { x: d.layout.x, y: d.layout.y, zoom: 1, z: ++z, entered: true, revealed: !d.hidden, fromLeft: 50, fromTop: 0 };
    } else {
      const s: TableState = { ...before };
      // Follow the file only when the file's own position changed (typed in the tool). Width and tilt changes leave a
      // dragged document where it is, and a drag that the tool has since saved lands within the tolerance and does not move.
      if (was && Math.abs(was.x - d.layout.x) > MOVE_TOLERANCE && Math.abs(s.x - d.layout.x) > MOVE_TOLERANCE) s.x = d.layout.x;
      if (was && Math.abs(was.y - d.layout.y) > MOVE_TOLERANCE && Math.abs(s.y - d.layout.y) > MOVE_TOLERANCE) s.y = d.layout.y;
      if (was && was.hidden !== d.hidden) {
        s.revealed = !d.hidden;
        if (s.revealed) s.entered = true;
      }
      states[d.id] = s;
    }
    nextSeen[d.id] = { x: d.layout.x, y: d.layout.y, hidden: d.hidden };
  }
  return { states, seen: nextSeen, topZ: z };
}
