import type { ArchiveIndexEntry, Casefile, RegistryEntry } from '@archive/casefile';

export type EntryLoader = (episode: ArchiveIndexEntry) => Promise<RegistryEntry[]>;

export interface RegistryResolver {
  /** Finds an entry by global id (`episode/entry`). Null if the episode or entry is not on file. */
  resolve(globalId: string): Promise<RegistryEntry | null>;
}

/**
 * Resolves registry entries across episodes. The open episode is already loaded; others are
 * fetched the first time one of their entries is needed, then cached. An unpublished episode,
 * a missing entry or a failed load all resolve to null, never an error.
 */
export function createRegistryResolver(index: ArchiveIndexEntry[], current: Casefile, load: EntryLoader): RegistryResolver {
  const cache = new Map<string, Promise<RegistryEntry[]>>();
  cache.set(current.manifest.id, Promise.resolve(current.registry));

  return {
    async resolve(globalId) {
      const episodeId = globalId.split('/')[0];
      let entries = cache.get(episodeId);
      if (!entries) {
        const episode = index.find((e) => e.id === episodeId);
        if (!episode) return null;
        entries = load(episode).catch(() => []);
        cache.set(episodeId, entries);
      }
      return (await entries).find((e) => e.globalId === globalId) ?? null;
    },
  };
}
