/** Lets text spans inside a document find and activate that document's hotspots. */
export interface HotspotContext {
  has(id: string): boolean;
  activate(id: string): void;
}
export const HOTSPOTS = Symbol('hotspots');
