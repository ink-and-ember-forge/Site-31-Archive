import { unzipSync } from 'fflate';

/** Read-only view of a package, whether it is a folder, a zip or in memory. */
export interface PackageSource {
  readBytes(path: string): Promise<Uint8Array | undefined>;
  readText(path: string): Promise<string | undefined>;
  /** Paths (posix, relative to the package root) that start with `prefix`. */
  list(prefix: string): Promise<string[]>;
}

/** Package paths must be relative and stay inside the package. */
export function isSafePath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\\') || /^[a-zA-Z]:/.test(path)) return false;
  return !path.split('/').some((part) => part === '..' || part === '');
}

const decoder = new TextDecoder('utf-8');

function fromBytes(files: Map<string, Uint8Array>): PackageSource {
  return {
    async readBytes(path) {
      return isSafePath(path) ? files.get(path) : undefined;
    },
    async readText(path) {
      const bytes = isSafePath(path) ? files.get(path) : undefined;
      return bytes ? decoder.decode(bytes) : undefined;
    },
    async list(prefix) {
      return [...files.keys()].filter((p) => p.startsWith(prefix)).sort();
    },
  };
}

export function memorySource(files: Record<string, string | Uint8Array>): PackageSource {
  const encoder = new TextEncoder();
  return fromBytes(
    new Map(Object.entries(files).map(([p, c]) => [p, typeof c === 'string' ? encoder.encode(c) : c])),
  );
}

/** Opens a `.casefile` (zip) package. Throws if the bytes are not a valid zip. */
export function zipSource(bytes: Uint8Array): PackageSource {
  const entries = unzipSync(bytes);
  return fromBytes(new Map(Object.entries(entries).filter(([p]) => !p.endsWith('/'))));
}
