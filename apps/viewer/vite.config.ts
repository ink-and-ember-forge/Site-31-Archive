import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, normalizePath, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '../..');

/**
 * Dev only: builds the archive from episodes/ and theme/ when the server starts, rebuilds whenever
 * a file in either folder is saved, and refreshes the browser. Mistakes show as a readable overlay.
 * (Production builds run the same archive build from the `prebuild` script.)
 */
function archiveDev(): Plugin {
  const episodesDir = resolve(repoRoot, 'episodes');
  const themeDir = resolve(repoRoot, 'theme');
  const outDir = resolve(here, 'public/archive');
  const sample = resolve(repoRoot, 'packages/casefile/fixtures/valid/sample-placeholder');

  return {
    name: 'archive-dev',
    apply: 'serve',
    async configureServer(server) {
      // Loaded here, not imported at the top, and through tsx: the workspace package is TypeScript, and tools
      // that read this config with plain Node (such as the Svelte preprocessor behind `svelte-check`) cannot import it.
      const { tsImport } = await import('tsx/esm/api');
      const { formatReport } = (await tsImport('@archive/casefile', import.meta.url)) as typeof import('@archive/casefile');
      const { buildArchive, validateEpisodes } = (await tsImport('@archive/casefile/node', import.meta.url)) as typeof import('@archive/casefile/node');

      const rebuild = async (reload: boolean) => {
        const result = await buildArchive({ episodesDir, themeDir, outDir, fallbackEpisodeDirs: [sample] });
        if (result.errors.length === 0 && result.warnings.length === 0) {
          if (reload) server.ws.send({ type: 'full-reload' });
          return;
        }
        // Re-check with the friendlier report so the writer gets hints, not raw error lines.
        const report = await validateEpisodes({ episodesDir, themeDir });
        const text = formatReport(report.themeIssues, report.episodes);
        if (result.errors.length > 0) {
          server.config.logger.error(`\n${text}\n`);
          server.ws.send({ type: 'error', err: { message: text, stack: '', plugin: 'archive' } });
        } else {
          server.config.logger.warn(`\n${text}\n`);
          if (reload) server.ws.send({ type: 'full-reload' });
        }
      };

      await rebuild(false);

      let timer: NodeJS.Timeout | undefined;
      let running = false;
      let again = false;
      const run = async () => {
        if (running) return void (again = true);
        running = true;
        try {
          await rebuild(true);
        } finally {
          running = false;
          if (again) {
            again = false;
            void run();
          }
        }
      };
      server.watcher.add([episodesDir, themeDir]);
      // The watcher reports paths with forward slashes on every system, but resolve() gives backslashes on
      // Windows, so compare normalised paths or nothing would rebuild there.
      const watched = [normalizePath(episodesDir), normalizePath(themeDir)];
      server.watcher.on('all', (_event, changed) => {
        const file = normalizePath(changed);
        const inScope = watched.some((dir) => file === dir || file.startsWith(`${dir}/`));
        if (!inScope || file.split('/').some((part) => part.startsWith('.'))) return;
        clearTimeout(timer);
        timer = setTimeout(() => void run(), 250); // saving several files at once rebuilds once
      });
    },
  };
}

// BASE_PATH is set by the Pages workflow so the site works under
// https://<owner>.github.io/<repo>/ . Locally it defaults to "/".
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [svelte(), archiveDev()],
});
