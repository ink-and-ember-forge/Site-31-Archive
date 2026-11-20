import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const renderer = resolve(__dirname, '../renderer/src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.(ts|svelte)$/.test(name) ? [full] : [];
  });
}

describe("the app's window", () => {
  it('only imports the small, browser-safe parts of the format package, never the whole of it', () => {
    // The whole package builds its validators as code when it loads, which the window's security policy forbids.
    // Importing it would leave the window blank. Only types (erased at build time) may come from the main entry.
    const offenders: string[] = [];
    for (const file of files(renderer)) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        const match = line.match(/^\s*import\s+(?!type\b)[^;]*from\s+'@archive\/casefile'/);
        if (match) offenders.push(`${file.slice(renderer.length + 1)}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the window's security policy does not allow code generation", () => {
    const html = readFileSync(resolve(__dirname, '../renderer/index.html'), 'utf8');
    expect(html).toContain("script-src 'self'");
    expect(html).not.toContain('unsafe-eval');
  });
});
