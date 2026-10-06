// src/html/brandVars.ts
import { readBrandKit, defaultBrandKit, DEFAULT_CONTENT_LANGUAGE, type BrandColors } from '@/server/brand';

export interface BrandVars {
  name: string;
  fontFamily: string;
  colors: BrandColors;
  /** Language of the reader-facing copy (prompts are in English, output follows this). */
  language: string;
}

/** Fallback brand name used in prompts when the Brand Kit has none. */
export const GENERIC_BRAND_NAME = 'the brand';

export function getBrandVars(): BrandVars {
  const kit = readBrandKit() ?? defaultBrandKit();
  return {
    name: kit.name || GENERIC_BRAND_NAME,
    fontFamily: kit.font.family,
    colors: { ...defaultBrandKit().brandColors, ...kit.brandColors },
    language: kit.language || DEFAULT_CONTENT_LANGUAGE,
  };
}
