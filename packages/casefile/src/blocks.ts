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
  // Parts for forms and receipts
  'letterhead',
  'section-bar',
  'field-grid',
  'ruled-lines',
  'items-list',
  'tax-table',
  'tender',
  'barcode',
  'qr-code',
  'rule',
  'split-row',
] as const;

export type KnownBlock = (typeof KNOWN_BLOCKS)[number];

export function isKnownBlock(name: string): name is KnownBlock {
  return (KNOWN_BLOCKS as readonly string[]).includes(name);
}

/** For each block, which of its `props` hold the name of a slot (besides `block.slot` itself). */
const SLOT_PROPS: Partial<Record<string, string[]>> = {
  title: ['subtitle'],
  letterhead: ['crest', 'name', 'lines', 'reference', 'revision'],
  stamp: ['text', 'date'],
  barcode: ['seed', 'number'],
  'qr-code': ['caption'],
  'split-row': ['left', 'right'],
};

/** Every slot name a block (and its children) refers to, so a template can be checked against its own slots. */
export function slotRefs(block: { block: string; slot?: string; props?: Record<string, unknown>; children?: unknown[] }): string[] {
  const refs: string[] = [];
  if (block.slot) refs.push(block.slot);
  for (const key of SLOT_PROPS[block.block] ?? []) {
    const value = block.props?.[key];
    if (typeof value === 'string') refs.push(value);
  }
  if (block.block === 'field-grid' && Array.isArray(block.props?.rows)) {
    for (const row of block.props.rows as unknown[]) {
      if (!Array.isArray(row)) continue;
      for (const cell of row as { slot?: unknown }[]) if (typeof cell?.slot === 'string') refs.push(cell.slot);
    }
  }
  for (const child of (block.children ?? []) as (typeof block)[]) refs.push(...slotRefs(child));
  return refs;
}
