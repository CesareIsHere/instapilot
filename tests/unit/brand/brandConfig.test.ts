import { describe, it, expect } from 'vitest';
import { brandKitToContext, defaultBrandKit } from '@/server/brand';

describe('BrandKit - colori strutturati', () => {
  it('defaultBrandKit ha i 6 ruoli colore con i valori Finvestire', () => {
    const kit = defaultBrandKit();
    expect(kit.brandColors.primary).toBe('#012A78');
    expect(kit.brandColors.positive).toBe('#00B373');
    expect(kit.brandColors.negative).toBe('#DC2626');
    expect(kit.brandColors.paper).toBe('#FFFFFF');
    expect(kit.brandColors.ink).toBe('#101010');
    expect(kit.brandColors.muted).toBe('#767676');
  });

  it('defaultBrandKit ha font Montserrat', () => {
    const kit = defaultBrandKit();
    expect(kit.font.family).toBe('Montserrat');
    expect(kit.font.source).toBe('bundled');
  });

  it('brandKitToContext include i colori e il font', () => {
    const kit = defaultBrandKit();
    kit.name = 'TestBrand';
    const ctx = brandKitToContext(kit);
    expect(ctx).toContain('TestBrand');
    expect(ctx).toContain('#012A78');
    expect(ctx).toContain('Montserrat');
  });
});
