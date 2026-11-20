// Usage: tsx src/cli.ts --episodes <dir> --theme <dir> --out <dir> [--samples | --samples-if-empty]
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArchive } from './node';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const sample = resolve(here, '../fixtures/valid/sample-placeholder');
const samples = args.includes('--samples') ? [sample] : [];
// Shows the labelled placeholder only while the real archive is empty.
const fallback = args.includes('--samples-if-empty') ? [sample] : [];

const result = await buildArchive({
  episodesDir: resolve(flag('episodes') ?? `${root}/episodes`),
  themeDir: resolve(flag('theme') ?? `${root}/theme`),
  outDir: resolve(flag('out') ?? `${root}/apps/viewer/public/archive`),
  extraEpisodeDirs: samples,
  fallbackEpisodeDirs: fallback,
});

for (const w of result.warnings) console.warn(`warning: ${w.path}: ${w.message}`);
for (const e of result.errors) console.error(`error: ${e.path}: ${e.message}`);
console.log(`Archive built: ${result.index.episodes.length} episode(s).`);
if (result.errors.length > 0) process.exit(1);
