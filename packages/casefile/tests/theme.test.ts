import { describe, expect, it } from 'vitest';
import { loadCasefile } from '../src/loader';
import { fsSource } from '../src/node';
import { checkAgainstTheme, FALLBACK_STYLE, FALLBACK_TEMPLATE, resolveStyle, resolveTemplate } from '../src/theme';
import { loadThemeFromFs, repoTheme, samplePath, sampleJson, sampleWith } from './helpers';

async function loadSample(changes: Record<string, unknown> = {}) {
  const r = await loadCasefile(await sampleWith(changes));
  if (!r.ok) throw new Error('should load');
  return r.casefile;
}

describe('theme', () => {
  it('the repo starter theme is valid and covers the sample', async () => {
    const { theme, issues } = loadThemeFromFs(repoTheme);
    expect(issues).toEqual([]);
    expect(Object.keys(theme.templates).sort()).toEqual(['handwritten', 'photograph', 'receipt', 'typed', 'witness-statement']);
    const casefile = (await loadCasefile(fsSource(samplePath)) as any).casefile;
    expect(checkAgainstTheme(casefile, theme)).toEqual([]);
  });

  it('warns about unknown templates, styles and blocks, which still render via fallbacks', async () => {
    const { theme } = loadThemeFromFs(repoTheme);
    const doc = await sampleJson<any>('documents/still.json');
    const casefile = await loadSample({
      'documents/still.json': { ...doc, template: 'mystery', style: 'nonexistent' },
      'documents/receipt.json': { ...(await sampleJson<any>('documents/receipt.json')), style: 'nonexistent' },
      'templates/witness-statement.json': { id: 'witness-statement', slots: [], layout: { block: 'hologram' } },
    });
    const text = checkAgainstTheme(casefile, theme).map((i) => i.message).join(' | ');
    expect(text).toContain('unknown template "mystery"');
    expect(text).toContain('unknown style "nonexistent"');
    expect(text).toContain('unknown block "hologram"');
    const template = resolveTemplate('mystery', casefile, theme);
    expect(template).toBe(FALLBACK_TEMPLATE);
    expect(resolveStyle('nonexistent', template, casefile, theme)).toBe(FALLBACK_STYLE);
  });

  it('episode overrides take precedence over the shared theme', async () => {
    const { theme } = loadThemeFromFs(repoTheme);
    const casefile = await loadSample({
      'templates/typed.json': { id: 'typed', name: 'override', slots: [], layout: { block: 'stack' } },
    });
    expect(resolveTemplate('typed', casefile, theme).name).toBe('override');
    expect(resolveTemplate('receipt', casefile, theme).id).toBe('receipt');
  });
});

import { lintTemplate } from '../src/theme';

describe('the shared theme itself', () => {
  it('every template refers only to slots it defines, and only to blocks that exist', () => {
    const { theme, issues } = loadThemeFromFs(repoTheme);
    expect(issues).toEqual([]);
    for (const template of Object.values(theme.templates)) expect(lintTemplate(template), template.id).toEqual([]);
  });

  it('lintTemplate finds a layout that refers to a missing slot, a duplicate slot, and an unknown block', () => {
    const template = {
      id: 'broken',
      slots: [{ name: 'a', kind: 'value' as const }, { name: 'a', kind: 'value' as const }],
      layout: {
        block: 'stack',
        children: [
          { block: 'title', slot: 'missing' },
          { block: 'letterhead', props: { name: 'a', crest: 'nope' } },
          { block: 'field-grid', props: { rows: [[{ slot: 'gone' }]] } },
          { block: 'hologram' },
        ],
      },
    };
    const problems = lintTemplate(template).join(' | ');
    expect(problems).toContain('"a" is defined twice');
    expect(problems).toContain('slot "missing"');
    expect(problems).toContain('slot "nope"');
    expect(problems).toContain('slot "gone"');
    expect(problems).toContain('"hologram"');
  });

  it('lintTemplate finds a block in a section the template does not define, and a duplicate section', () => {
    const template = {
      id: 'sectioned',
      slots: [{ name: 'a', kind: 'value' as const }],
      sections: [{ id: 'one', name: 'One' }, { id: 'one', name: 'Again' }],
      layout: { block: 'stack', children: [{ block: 'title', slot: 'a', section: 'one' }, { block: 'title', slot: 'a', section: 'ghost' }] },
    };
    const problems = lintTemplate(template).join(' | ');
    expect(problems).toContain('section "one" is defined twice');
    expect(problems).toContain('section "ghost"');
    expect(lintTemplate({ ...template, sections: [{ id: 'one', name: 'One' }], layout: { block: 'title', slot: 'a', section: 'one' } })).toEqual([]);
  });

  it('the build fails on a theme template that refers to a slot it does not have', async () => {
    const { mkdirSync, mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'theme-lint-'));
    mkdirSync(join(dir, 'templates'));
    writeFileSync(join(dir, 'templates', 'bad.json'), JSON.stringify({ id: 'bad', slots: [], layout: { block: 'title', slot: 'nope' } }));
    const { issues } = loadThemeFromFs(dir);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('slot "nope"');
  });
});
