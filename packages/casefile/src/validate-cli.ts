// Usage: npm run validate [-- <episode folder or id> ...]
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatReport } from './report';
import { validateEpisodes } from './node';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const episodesDir = resolve(`${root}/episodes`);
// npm runs workspace scripts from the package folder; INIT_CWD is where the author typed the command.
const cwd = process.env.INIT_CWD ?? process.cwd();

const only = process.argv.slice(2).filter((a) => !a.startsWith('-')).map((arg) => {
  const asPath = resolve(cwd, arg);
  if (existsSync(asPath)) return asPath;
  const byId = resolve(episodesDir, arg); // a bare episode id such as "my-episode"
  return existsSync(byId) ? byId : asPath;
});

const result = await validateEpisodes({ episodesDir, themeDir: resolve(`${root}/theme`), ...(only.length > 0 && { only }) });
console.log(formatReport(result.themeIssues, result.episodes));
const failed = result.themeIssues.length > 0 || result.episodes.some((e) => e.errors.length > 0);
process.exit(failed ? 1 : 0);
