// src/html/brandVars.ts
import { readBrandKit, defaultBrandKit, type BrandColors } from '@/server/brand';

export interface BrandVars {
  name: string;
  fontFamily: string;
  colors: BrandColors;
}

export function getBrandVars(): BrandVars {
  const kit = readBrandKit() ?? defaultBrandKit();
  return {
    name: kit.name || 'il brand',
    fontFamily: kit.font.family,
    colors: { ...defaultBrandKit().brandColors, ...kit.brandColors },
  };
}
