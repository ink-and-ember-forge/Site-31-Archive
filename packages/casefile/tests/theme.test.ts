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
    expect(Object.keys(theme.templates).sort()).toEqual(['handwritten', 'photograph', 'receipt', 'typed']);
    const casefile = (await loadCasefile(fsSource(samplePath)) as any).casefile;
    expect(checkAgainstTheme(casefile, theme)).toEqual([]);
  });

  it('warns about unknown templates, styles and blocks, which still render via fallbacks', async () => {
    const { theme } = loadThemeFromFs(repoTheme);
    const doc = await sampleJson<any>('documents/still.json');
    const casefile = await loadSample({
      'documents/still.json': { ...doc, template: 'mystery', style: 'nonexistent' },
      'documents/receipt.json': { ...(await sampleJson<any>('documents/receipt.json')), style: 'nonexistent' },
      'templates/typed.json': { id: 'typed', slots: [], layout: { block: 'hologram' } },
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
