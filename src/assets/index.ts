import path from 'node:path';
import { manifest, type AssetEntry } from './manifest';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

export function resolveAsset(assetId: string): string {
  const entry = manifest[assetId];
  if (!entry) {
    throw new Error(`asset_not_found:${assetId}`);
  }
  return path.join(PUBLIC_DIR, entry.path);
}

export function assetExists(assetId: string): boolean {
  return Boolean(manifest[assetId]);
}

export function listAssets(): Record<string, AssetEntry & { absolutePath: string }> {
  return Object.fromEntries(
    Object.entries(manifest).map(([id, entry]) => [
      id,
      { ...entry, absolutePath: path.join(PUBLIC_DIR, entry.path) },
    ]),
  );
}

export { manifest };
