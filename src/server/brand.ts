import type { Express, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { loadBrandContext } from '@/llm/brandContext';
import { log } from '@/lib/log';

/** Language of the generated, reader-facing copy when the Brand Kit does not set one. */
export const DEFAULT_CONTENT_LANGUAGE = 'Italian';

const BRAND_KIT_FILE = process.env.BRAND_KIT_FILE ?? path.resolve(process.cwd(), 'data', 'brand-kit.json');

export interface BrandColors {
  primary: string;
  positive: string;
  negative: string;
  paper: string;
  ink: string;
  muted: string;
}

export interface BrandFont {
  family: string;
  source: 'bundled' | 'custom';
}

export interface BrandKit {
  name: string;
  tagline: string;
  audience: string;
  tone: string;
  /** Language of the generated copy (e.g. "Italian", "English"). Prompts are in English; output follows this. */
  language: string;
  brandColors: BrandColors;
  font: BrandFont;
  logoPath?: string;
  hashtags: string[];
  ctas: string[];
  dos: string;
  donts: string;
  notes: string;
}

const BrandColorsSchema = z.object({
  primary: z.string().max(30).default('#4F46E5'),
  positive: z.string().max(30).default('#059669'),
  negative: z.string().max(30).default('#DC2626'),
  paper: z.string().max(30).default('#FFFFFF'),
  ink: z.string().max(30).default('#111827'),
  muted: z.string().max(30).default('#6B7280'),
});

const BrandFontSchema = z.object({
  family: z.string().max(80).default('Inter'),
  source: z.enum(['bundled', 'custom']).default('bundled'),
});

const BrandKitSchema = z.object({
  name: z.string().max(120).default(''),
  tagline: z.string().max(280).default(''),
  audience: z.string().max(500).default(''),
  tone: z.string().max(500).default(''),
  language: z.string().max(60).default(DEFAULT_CONTENT_LANGUAGE),
  brandColors: BrandColorsSchema.default({}),
  font: BrandFontSchema.default({}),
  logoPath: z.string().max(500).optional(),
  hashtags: z.array(z.string().max(80)).max(40).default([]),
  ctas: z.array(z.string().max(200)).max(20).default([]),
  dos: z.string().max(2000).default(''),
  donts: z.string().max(2000).default(''),
  notes: z.string().max(4000).default(''),
});

export function defaultBrandKit(): BrandKit {
  return BrandKitSchema.parse({});
}

export function readBrandKit(): BrandKit | null {
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(BRAND_KIT_FILE, 'utf8'));
    // Fill defaults for fields added after the kit was saved (e.g. `language`).
    const parsed = BrandKitSchema.safeParse(raw);
    return parsed.success ? parsed.data : (raw as BrandKit);
  } catch {
    return null;
  }
}

function writeBrandKit(kit: BrandKit): void {
  fs.mkdirSync(path.dirname(BRAND_KIT_FILE), { recursive: true });
  fs.writeFileSync(BRAND_KIT_FILE, JSON.stringify(kit, null, 2), 'utf8');
}

/** Render a saved brand kit into the plain-text context string injected into prompts. */
export function brandKitToContext(kit: BrandKit): string {
  const lines: string[] = ['# BRAND CONTEXT'];
  if (kit.name) lines.push(`Name: ${kit.name}`);
  if (kit.tagline) lines.push(`Tagline: ${kit.tagline}`);
  if (kit.audience) lines.push(`Target audience: ${kit.audience}`);
  if (kit.tone) lines.push(`Tone of voice: ${kit.tone}`);
  lines.push(`Content language: ${kit.language || DEFAULT_CONTENT_LANGUAGE}`);
  const c = kit.brandColors;
  lines.push(`Colors (semantic roles): primary ${c.primary}, positive ${c.positive}, negative ${c.negative}, background ${c.paper}, text ${c.ink}, secondary ${c.muted}`);
  lines.push(`Font: ${kit.font.family}`);
  if (kit.hashtags.length) lines.push(`Recurring hashtags: ${kit.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')}`);
  if (kit.ctas.length) lines.push(`Preferred calls to action:\n${kit.ctas.map((c) => `- ${c}`).join('\n')}`);
  if (kit.dos) lines.push(`Do:\n${kit.dos}`);
  if (kit.donts) lines.push(`Don't:\n${kit.donts}`);
  if (kit.notes) lines.push(`Additional notes:\n${kit.notes}`);
  return lines.join('\n');
}

/**
 * Resolve the brand context used across generation, slide edits and captions:
 * explicit override → saved brand kit → legacy markdown file fallback.
 */
export function resolveBrandContext(override?: string): string {
  if (override) return override;
  const kit = readBrandKit();
  if (kit) return brandKitToContext(kit);
  return loadBrandContext(process.env.BRAND_CONTEXT_FILE ?? 'docs/brand-context.example.md');
}

export function mountBrandRoutes(app: Express): void {
  app.get('/api/brand', (_req, res) => {
    const kit = readBrandKit();
    res.json({ kit: kit ?? defaultBrandKit(), saved: kit !== null });
  });

  app.put('/api/brand', (req: Request, res: Response, next: NextFunction) => {
    try {
      const kit = BrandKitSchema.parse(req.body ?? {});
      writeBrandKit(kit);
      log.info('brand.saved', { name: kit.name });
      res.json({ ok: true, kit });
    } catch (err) {
      next(err);
    }
  });
}
