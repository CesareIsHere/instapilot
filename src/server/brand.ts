import type { Express, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { loadBrandContext } from '@/llm/brandContext';
import { log } from '@/lib/log';

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
  primary: z.string().max(30).default('#012A78'),
  positive: z.string().max(30).default('#00B373'),
  negative: z.string().max(30).default('#DC2626'),
  paper: z.string().max(30).default('#FFFFFF'),
  ink: z.string().max(30).default('#101010'),
  muted: z.string().max(30).default('#767676'),
});

const BrandFontSchema = z.object({
  family: z.string().max(80).default('Montserrat'),
  source: z.enum(['bundled', 'custom']).default('bundled'),
});

const BrandKitSchema = z.object({
  name: z.string().max(120).default(''),
  tagline: z.string().max(280).default(''),
  audience: z.string().max(500).default(''),
  tone: z.string().max(500).default(''),
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
    return JSON.parse(fs.readFileSync(BRAND_KIT_FILE, 'utf8')) as BrandKit;
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
  const lines: string[] = ['# CONTESTO BRAND'];
  if (kit.name) lines.push(`Nome: ${kit.name}`);
  if (kit.tagline) lines.push(`Tagline: ${kit.tagline}`);
  if (kit.audience) lines.push(`Pubblico target: ${kit.audience}`);
  if (kit.tone) lines.push(`Tono di voce: ${kit.tone}`);
  const c = kit.brandColors;
  lines.push(`Colori (ruoli semantici): primario ${c.primary}, positivo ${c.positive}, negativo ${c.negative}, sfondo ${c.paper}, testo ${c.ink}, secondario ${c.muted}`);
  lines.push(`Font: ${kit.font.family}`);
  if (kit.hashtags.length) lines.push(`Hashtag ricorrenti: ${kit.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')}`);
  if (kit.ctas.length) lines.push(`Call-to-action preferite:\n${kit.ctas.map((c) => `- ${c}`).join('\n')}`);
  if (kit.dos) lines.push(`Da fare:\n${kit.dos}`);
  if (kit.donts) lines.push(`Da evitare:\n${kit.donts}`);
  if (kit.notes) lines.push(`Note aggiuntive:\n${kit.notes}`);
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
