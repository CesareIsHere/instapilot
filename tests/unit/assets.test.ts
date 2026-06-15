import { describe, it, expect } from 'vitest';
import { resolveAsset, listAssets, assetExists } from '@/assets';

describe('assets', () => {
  it('resolves known assetId to absolute-ish path', () => {
    const p = resolveAsset('logo-f');
    expect(p).toContain('brand/logo.png');
  });

  it('throws on unknown assetId', () => {
    expect(() => resolveAsset('does-not-exist')).toThrow(/asset_not_found/);
  });

  it('reports asset existence without throwing', () => {
    expect(assetExists('logo-f')).toBe(true);
    expect(assetExists('does-not-exist')).toBe(false);
  });

  it('lists all assets with metadata', () => {
    const all = listAssets();
    expect(all['logo-f']).toMatchObject({ path: expect.stringContaining('brand/logo.png') });
  });
});
