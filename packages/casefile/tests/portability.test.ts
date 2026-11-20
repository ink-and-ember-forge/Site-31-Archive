import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repo = resolve(__dirname, '../../..');

function sources(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === 'node_modules' || name === 'dist' || name === 'release') return [];
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|mjs|cjs|svelte)$/.test(name) ? [full] : [];
  });
}

describe('Windows portability', () => {
  it('no source turns a file URL into a path with .pathname (it gives "/D:/..." on Windows)', () => {
    const offenders = ['packages', 'apps']
      .flatMap((d) => sources(join(repo, d)))
      .filter((file) => !file.includes(`${join('tests', 'portability')}`))
      .filter((file) => /new URL\([^)]*import\.meta\.url[^)]*\)\.pathname/.test(readFileSync(file, 'utf8')));
    expect(offenders.map((f) => f.slice(repo.length + 1))).toEqual([]);
  });

  it('the archive command finds the repository however it is started', () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'cli-cwd-'));
    const out = join(mkdtempSync(join(tmpdir(), 'cli-out-')), 'archive');
    const run = (args: string[]) =>
      execFileSync(join(repo, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx'), [join(repo, 'packages/casefile/src/cli.ts'), ...args], {
        cwd: elsewhere,
        encoding: 'utf8',
        shell: process.platform === 'win32',
      });
    expect(run(['--samples', '--out', out])).toContain('Archive built: 1 episode(s).');
    expect(existsSync(join(out, 'index.json'))).toBe(true);
  });
});
