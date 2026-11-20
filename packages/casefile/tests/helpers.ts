import { resolve } from 'node:path';
import { fsSource, loadThemeFromFs } from '../src/node';
import { memorySource, type PackageSource } from '../src/source';

export const fixtures = resolve(__dirname, '../fixtures');
export const samplePath = `${fixtures}/valid/sample-placeholder`;
export const minimalPath = `${fixtures}/valid/minimal`;
export const repoTheme = resolve(__dirname, '../../../theme');

/** Reads a folder package into a plain object so tests can break it in memory. */
export async function readAll(path: string): Promise<Record<string, Uint8Array>> {
  const source = fsSource(path);
  const files: Record<string, Uint8Array> = {};
  for (const file of await source.list('')) files[file] = (await source.readBytes(file))!;
  return files;
}

const encoder = new TextEncoder();

/** Sample package with some files replaced (string or JSON value) or removed (undefined). */
export async function sampleWith(changes: Record<string, unknown>): Promise<PackageSource> {
  const files = await readAll(samplePath);
  for (const [path, value] of Object.entries(changes)) {
    if (value === undefined) delete files[path];
    else files[path] = encoder.encode(typeof value === 'string' ? value : JSON.stringify(value));
  }
  return memorySource(files);
}

export async function sampleJson<T>(path: string): Promise<T> {
  return JSON.parse(new TextDecoder().decode((await readAll(samplePath))[path])) as T;
}

export { loadThemeFromFs };
