import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: here,
  base: './',
  plugins: [svelte({ configFile: resolve(here, '../svelte.config.js') })],
  build: { outDir: resolve(here, '../dist/renderer'), emptyOutDir: true },
});
