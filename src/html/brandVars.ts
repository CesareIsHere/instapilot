// src/html/brandVars.ts
import { readBrandKit, defaultBrandKit } from '@/server/brand';

export interface BrandVars {
  name: string;
  fontFamily: string;
}

export function getBrandVars(): BrandVars {
  const kit = readBrandKit() ?? defaultBrandKit();
  return {
    name: kit.name || 'il brand',
    fontFamily: kit.font.family,
  };
}
