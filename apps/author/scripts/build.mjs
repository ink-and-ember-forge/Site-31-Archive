// Builds the whole app into dist/: the main process, the window, the real viewer and the theme.
// Nothing here is manual. `npm run dev` and `npm run package` both start from this script.
import { execFileSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import { build as vite } from 'vite';

const app = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const repo = resolve(app, '../..');
const dist = resolve(app, 'dist');

rmSync(dist, { recursive: true, force: true });

// Main process: bundled with the shared casefile package so the packaged app needs no node_modules.
await esbuild({
  entryPoints: [resolve(app, 'src/main/main.ts')],
  outfile: resolve(dist, 'main.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'warning',
});
cpSync(resolve(app, 'src/preload.cjs'), resolve(dist, 'preload.cjs'));

// The window.
await vite({ configFile: resolve(app, 'renderer/vite.config.ts'), logLevel: 'warn' });

// The real viewer, built for the root of its own origin (the website build uses a sub-path instead).
execFileSync('npm', ['run', 'build', '-w', '@archive/viewer'], {
  cwd: repo,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, BASE_PATH: '/' },
});
cpSync(resolve(repo, 'apps/viewer/dist'), resolve(dist, 'viewer'), { recursive: true });
// The preview serves its own archive, so the website's sample archive is not needed.
rmSync(resolve(dist, 'viewer/archive'), { recursive: true, force: true });

// The shared look and feel the viewer and the forms use.
cpSync(resolve(repo, 'theme'), resolve(dist, 'theme'), { recursive: true });
console.log('Built the authoring tool into', dist);
