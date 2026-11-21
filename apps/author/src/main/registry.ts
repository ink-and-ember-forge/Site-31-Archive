// Reading and changing the registry entries of one episode folder. No Electron in here.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RegistryView } from '../shared/api';

export class RegistryFiles {
  constructor(
    private readonly folder: string,
    private readonly episodeId: string,
  ) {}

  private dir = () => join(this.folder, 'registry');

  /** The entries in the episode, tolerantly: a file that cannot be read is listed as unreadable, never hidden. */
  list(): RegistryView[] {
    if (!existsSync(this.dir())) return [];
    return readdirSync(this.dir())
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((file) => {
        const id = file.replace(/\.json$/, '');
        const globalId = `${this.episodeId}/${id}`;
        try {
          const raw = JSON.parse(readFileSync(join(this.dir(), file), 'utf8')) as Record<string, unknown>;
          return { id, globalId, kind: typeof raw.kind === 'string' ? raw.kind : '', title: typeof raw.title === 'string' ? raw.title : id, readable: true };
        } catch {
          return { id, globalId, kind: '', title: id, readable: false };
        }
      });
  }
}
