/** Lets text spans inside a document find and activate that document's hotspots. */
export interface HotspotContext {
  has(id: string): boolean;
  activate(id: string): void;
  /** Whether this hotspot's note is open; undefined for hotspots that don't open a note. */
  expanded(id: string): boolean | undefined;
}
export const HOTSPOTS = Symbol('hotspots');
