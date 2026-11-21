import { computeTotals, type Totals } from '@archive/casefile';
import type { Block } from '@archive/casefile';
import type { Content } from './episode';

/** The worked-out figures for the item list a block points at, or nothing if the slot is not an item list. */
export function receiptOf(block: Block, content: Record<string, Content>): { currency: string; totals: Totals } | undefined {
  const value = block.slot ? content[block.slot] : undefined;
  if (value?.kind !== 'items') return undefined;
  return { currency: value.currency ?? '', totals: computeTotals(value) };
}

/** A printed label: the template's own wording if it set one, otherwise a default. */
export const wordOf = (block: Block, key: string, fallback: string): string =>
  typeof block.props?.[key] === 'string' ? (block.props[key] as string) : fallback;
