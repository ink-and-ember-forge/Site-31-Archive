import { isKnownBlock, slotRefs } from './blocks';
import type { Block, Casefile, Issue, Style, Template } from './types';

/** Shared look and feel (the repo's `theme/` folder). */
export interface Theme {
  templates: Record<string, Template>;
  styles: Record<string, Style>;
}

/** Last-resort rendering when a document names a template or style nobody defines. */
export const FALLBACK_TEMPLATE: Template = {
  id: 'fallback',
  name: 'Plain fallback',
  slots: [],
  layout: { block: 'stack' },
};

export const FALLBACK_STYLE: Style = { id: 'fallback', name: 'Plain fallback', tokens: {} };

/** Episode overrides first, then the shared theme, then the plain fallback. */
export function resolveTemplate(key: string, casefile: Casefile, theme: Theme): Template {
  return casefile.templates[key] ?? theme.templates[key] ?? FALLBACK_TEMPLATE;
}

export function resolveStyle(key: string | undefined, template: Template, casefile: Casefile, theme: Theme): Style {
  const wanted = key ?? template.defaultStyle;
  if (!wanted) return FALLBACK_STYLE;
  return casefile.styles[wanted] ?? theme.styles[wanted] ?? FALLBACK_STYLE;
}

function unknownBlocks(block: Block, found: Set<string> = new Set()): Set<string> {
  if (!isKnownBlock(block.block)) found.add(block.block);
  block.children?.forEach((child) => unknownBlocks(child, found));
  return found;
}

/** Warnings for templates, styles and blocks that will degrade to the fallback. */
export function checkAgainstTheme(casefile: Casefile, theme: Theme): Issue[] {
  const issues: Issue[] = [];
  for (const doc of casefile.documents) {
    const path = `documents/${doc.id}.json`;
    const template = casefile.templates[doc.template] ?? theme.templates[doc.template];
    if (!template) {
      issues.push({ severity: 'warning', path, message: `unknown template "${doc.template}"; will render plain` });
      continue;
    }
    const style = doc.style ?? template.defaultStyle;
    if (style && !casefile.styles[style] && !theme.styles[style]) {
      issues.push({ severity: 'warning', path, message: `unknown style "${style}"; will use the default` });
    }
    for (const name of unknownBlocks(template.layout)) {
      issues.push({ severity: 'warning', path: `templates/${template.id}.json`, message: `unknown block "${name}"; will be skipped` });
    }
    for (const slot of template.slots) {
      if (slot.required && !doc.slots[slot.name]) {
        issues.push({ severity: 'warning', path, message: `template "${template.id}" expects slot "${slot.name}"` });
      }
    }
  }
  return issues;
}

/** Mistakes in a template itself: blocks that refer to slots the template does not define, and duplicate slots. */
export function lintTemplate(template: Template): string[] {
  const problems: string[] = [];
  const names = new Set<string>();
  for (const slot of template.slots) {
    if (names.has(slot.name)) problems.push(`slot "${slot.name}" is defined twice`);
    names.add(slot.name);
  }
  for (const ref of new Set(slotRefs(template.layout))) {
    if (!names.has(ref)) problems.push(`the layout refers to slot "${ref}", which the template does not define`);
  }
  for (const block of walkBlocks(template.layout)) {
    if (!isKnownBlock(block.block)) problems.push(`the layout uses a block that does not exist: "${block.block}"`);
  }
  return problems;
}

function* walkBlocks(block: Block): Generator<Block> {
  yield block;
  for (const child of block.children ?? []) yield* walkBlocks(child);
}
