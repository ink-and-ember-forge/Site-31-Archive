import { CURRENT_FORMAT_VERSION } from './types';

/**
 * One upgrade step per old format version: UPGRADES[n] turns a version-n manifest
 * into a version-(n+1) manifest. Empty while v1 is the only version.
 */
export const UPGRADES: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

export type UpgradeResult =
  | { ok: true; manifest: Record<string, unknown> }
  | { ok: false; message: string };

export function upgradeManifest(raw: Record<string, unknown>): UpgradeResult {
  let version = raw.formatVersion;
  if (!Number.isInteger(version) || (version as number) < 1) {
    return { ok: false, message: 'formatVersion must be a whole number of 1 or more' };
  }
  if ((version as number) > CURRENT_FORMAT_VERSION) {
    return {
      ok: false,
      message: `formatVersion ${version} is newer than this viewer supports (${CURRENT_FORMAT_VERSION}); update the viewer`,
    };
  }
  let manifest = raw;
  while ((version as number) < CURRENT_FORMAT_VERSION) {
    const step = UPGRADES[version as number];
    if (!step) return { ok: false, message: `no upgrade path from formatVersion ${version}` };
    manifest = { ...step(manifest) };
    version = (version as number) + 1;
    manifest.formatVersion = version;
  }
  return { ok: true, manifest };
}
