import { describe, it, expect } from 'vitest';
import { brandKitToContext, defaultBrandKit } from '@/server/brand';

describe('BrandKit - colori strutturati', () => {
  it('defaultBrandKit ha i 6 ruoli colore con la palette neutra di default', () => {
    const kit = defaultBrandKit();
    expect(kit.brandColors.primary).toBe('#4F46E5');
    expect(kit.brandColors.positive).toBe('#059669');
    expect(kit.brandColors.negative).toBe('#DC2626');
    expect(kit.brandColors.paper).toBe('#FFFFFF');
    expect(kit.brandColors.ink).toBe('#111827');
    expect(kit.brandColors.muted).toBe('#6B7280');
  });

  it('defaultBrandKit ha font Inter (bundled)', () => {
    const kit = defaultBrandKit();
    expect(kit.font.family).toBe('Inter');
    expect(kit.font.source).toBe('bundled');
  });

  it('brandKitToContext include i colori e il font', () => {
    const kit = defaultBrandKit();
    kit.name = 'TestBrand';
    const ctx = brandKitToContext(kit);
    expect(ctx).toContain('TestBrand');
    expect(ctx).toContain('#4F46E5');
    expect(ctx).toContain('Inter');
  });
});
