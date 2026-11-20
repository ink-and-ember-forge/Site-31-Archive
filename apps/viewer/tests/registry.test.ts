import { describe, expect, it, vi } from 'vitest';
import type { ArchiveIndexEntry, Casefile, RegistryEntry } from '@archive/casefile';
import { createRegistryResolver } from '../src/lib/registry';

const entry = (episode: string, id: string): RegistryEntry => ({
  id,
  globalId: `${episode}/${id}`,
  kind: 'record',
  title: `PLACEHOLDER ${id}`,
  fields: [],
  references: [],
});

const index = (id: string): ArchiveIndexEntry => ({ id, title: id, submissionDate: '2000-01-01', file: `${id}.casefile`, bytes: 0 });
const current = { manifest: { id: 'one' }, registry: [entry('one', 'a')] } as unknown as Casefile;

describe('registry resolver', () => {
  it('resolves entries of the open episode without loading anything', async () => {
    const load = vi.fn();
    const r = createRegistryResolver([index('one')], current, load);
    expect((await r.resolve('one/a'))?.title).toBe('PLACEHOLDER a');
    expect(load).not.toHaveBeenCalled();
  });

  it('loads another episode on first use and caches it', async () => {
    const load = vi.fn(async () => [entry('two', 'z')]);
    const r = createRegistryResolver([index('one'), index('two')], current, load);
    expect((await r.resolve('two/z'))?.globalId).toBe('two/z');
    await r.resolve('two/z');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('returns null for an unpublished episode, without loading', async () => {
    const load = vi.fn();
    const r = createRegistryResolver([index('one')], current, load);
    expect(await r.resolve('ghost/x')).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('returns null for a missing entry in a known episode', async () => {
    const r = createRegistryResolver([index('one')], current, vi.fn());
    expect(await r.resolve('one/nope')).toBeNull();
  });

  it('returns null, not an error, when loading another episode fails', async () => {
    const load = vi.fn(async () => {
      throw new Error('network');
    });
    const r = createRegistryResolver([index('one'), index('two')], current, load);
    expect(await r.resolve('two/z')).toBeNull();
  });
});
