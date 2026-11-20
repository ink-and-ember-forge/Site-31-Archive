/**
 * Building blocks the viewer knows how to render. Templates are data that arrange
 * these. Adding a block is a deliberate viewer change (see the format spec, section 4).
 */
export const KNOWN_BLOCKS = [
  'stack',
  'columns',
  'title',
  'paragraph',
  'field-row',
  'table',
  'stamp',
  'image',
  'caption',
] as const;

export type KnownBlock = (typeof KNOWN_BLOCKS)[number];

export function isKnownBlock(name: string): name is KnownBlock {
  return (KNOWN_BLOCKS as readonly string[]).includes(name);
}
