import type { Express, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { readLlmConfig, createLlmClient } from '@/llm/client';
import { editSlideHtml } from '@/llm/editSlide';
import { generateCaption } from '@/llm/generateCaption';
import { renderHtmlStill } from '@/html/renderHtml';
import { createZip, type ZipEntry } from '@/lib/zip';
import { readPricing, estimateCost } from '@/lib/pricing';
import { resolveBrandContext } from './brand';
import { getBrandVars } from '@/html/brandVars';
import { theme } from '@/theme';
import { log } from '@/lib/log';

const OUTPUT_DIR = process.env.OUTPUT_DIR ?? path.resolve(process.cwd(), 'output');
const ID_RE = /^(carousel|post)-[a-zA-Z0-9]+$/;

interface SlideHistoryEntry {
  id: string;
  at: string;
  htmlFile: string;
  file: string;
  label: string;
}

interface UsageLike {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
}

interface ManifestSlide {
  index: number;
  role: string;
  narrativeFunction?: string;
  file: string;
  htmlFile: string;
  intent?: string;
  designSpec?: unknown;
  attempts?: unknown;
  warnings?: unknown;
  usage?: unknown;
  editedAt?: string;
  lastEditSummary?: string;
  history?: SlideHistoryEntry[];
}

const MAX_HISTORY = 8;

interface Caption {
  text: string;
  hashtags: string[];
  generatedAt: string;
}

interface Manifest {
  carouselId: string;
  topic: string;
  format: 'single' | 'carousel';
  framework?: string;
  title: string;
  angle?: string;
  createdAt: string;
  updatedAt?: string;
  usage?: UsageLike;
  warnings?: unknown;
  research?: string;
  caption?: Caption;
  slides: ManifestSlide[];
}

/** Strip HTML to readable plain text for feeding the caption model. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1500);
}

/** Resolve and validate a content directory from its id, guarding against path traversal. */
function contentDir(id: string): string | null {
  if (!ID_RE.test(id)) return null;
  const dir = path.join(OUTPUT_DIR, id);
  
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) return null;
  return dir;
}

function readManifest(dir: string): Manifest {
  return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as Manifest;
}

function writeManifest(dir: string, manifest: Manifest): void {
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
}

function listContent() {
  if (!fs.existsSync(OUTPUT_DIR)) return [];
  const entries = fs
    .readdirSync(OUTPUT_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && ID_RE.test(e.name));

  const pricing = readPricing();
  const items = [];
  for (const e of entries) {
    const dir = path.join(OUTPUT_DIR, e.name);
    const manifestPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const m = readManifest(dir);
      const cover = m.slides?.[0]?.file;
      items.push({
        id: e.name,
        title: m.title,
        topic: m.topic,
        format: m.format,
        framework: m.framework,
        slideCount: m.slides?.length ?? 0,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        coverUrl: cover ? `/output/${e.name}/${cover}` : null,
        totalTokens: m.usage?.totalTokens ?? 0,
        cost: estimateCost(m.usage, pricing),
      });
    } catch (err) {
      log.warn('library.manifest_read_error', { dir: e.name, message: (err as Error).message });
    }
  }
  return items.sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
}

/** Attach absolute-from-root URLs to each slide so the UI can load images/html directly. */
function decorateSlides(id: string, m: Manifest) {
  return m.slides.map((s) => ({
    ...s,
    imageUrl: `/output/${id}/${s.file}`,
    htmlUrl: `/output/${id}/${s.htmlFile}`,
  }));
}

/** The bottom-right swipe arrow is baked into the stored HTML; detect it so the re-render reserves its zone. */
function hasCtaArrow(html: string): boolean {
  return html.includes("content: '→'") || html.includes('content: "→"');
}

/** Re-render a slide's PNG from HTML. Returns the number of (best-effort) layout warnings. */
async function rerenderSlide(dir: string, slide: ManifestSlide, html: string): Promise<number> {
  // Render first (force = best effort): if the browser throws we keep the previous
  // HTML+PNG intact instead of leaving an edited HTML with a stale image.
  const outcome = await renderHtmlStill(html, slide.file.replace(/\.png$/, ''), {
    force: true,
    dir,
    fileName: slide.file,
    ctaArrow: hasCtaArrow(html),
  });
  if (!outcome.ok) {
    const err: Error & { code?: string; detail?: unknown } = new Error('render_failed');
    err.code = 'RENDER_FAILURE';
    err.detail = outcome.issues;
    throw err;
  }
  fs.writeFileSync(path.join(dir, slide.htmlFile), html, 'utf8');
  return outcome.issues.length;
}

/**
 * Snapshot the slide's CURRENT html+png into a `history/` folder before it is
 * overwritten, so an edit can be reverted. Mutates `slide.history` (caller persists
 * the manifest); trims to MAX_HISTORY and deletes the dropped files.
 */
function snapshotSlide(dir: string, slide: ManifestSlide, label: string): void {
  const historyDir = path.join(dir, 'history');
  const srcHtml = path.join(dir, slide.htmlFile);
  const srcPng = path.join(dir, slide.file);
  if (!fs.existsSync(srcHtml)) return; // nothing to snapshot

  fs.mkdirSync(historyDir, { recursive: true });
  const ts = Date.now();
  const base = slide.file.replace(/\.png$/, '');
  const histHtml = `history/${base}-${ts}.html`;
  const histPng = `history/${base}-${ts}.png`;
  fs.copyFileSync(srcHtml, path.join(dir, histHtml));
  if (fs.existsSync(srcPng)) fs.copyFileSync(srcPng, path.join(dir, histPng));

  const entry: SlideHistoryEntry = { id: String(ts), at: new Date().toISOString(), htmlFile: histHtml, file: histPng, label };
  slide.history = [entry, ...(slide.history ?? [])];

  // Trim oldest beyond the cap, removing their backing files.
  for (const dropped of slide.history.slice(MAX_HISTORY)) {
    for (const f of [dropped.htmlFile, dropped.file]) {
      try { fs.rmSync(path.join(dir, f), { force: true }); } catch { /* best effort */ }
    }
  }
  slide.history = slide.history.slice(0, MAX_HISTORY);
}

const SaveHtmlSchema = z.object({ html: z.string().min(1).max(500_000) });
const AiEditSchema = z.object({ instruction: z.string().min(1).max(4000), model: z.string().optional() });
const RevertSchema = z.object({ id: z.string().min(1).max(40) });

export function mountLibraryRoutes(app: Express): void {
  // Serve generated artifacts (PNG + HTML) statically.
  // express.static is added in index.ts at /output.

  app.get('/api/meta', (_req, res) => {
    const cfg = (() => {
      try {
        return readLlmConfig();
      } catch {
        return null;
      }
    })();
    res.json({
      defaultModel: cfg?.model ?? null,
      colors: theme.colors,
      formats: ['single', 'carousel'],
      slideCount: { min: 6, max: 9, default: 7 },
      pricing: readPricing(),
    });
  });

  app.get('/api/library', (_req, res, next) => {
    try {
      res.json({ items: listContent() });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/library/:id', (req, res, next) => {
    try {
      const dir = contentDir(req.params.id);
      if (!dir) {
        res.status(404).json({ error: 'content_not_found' });
        return;
      }
      const m = readManifest(dir);
      const pricing = readPricing();
      res.json({
        id: req.params.id,
        ...m,
        cost: estimateCost(m.usage, pricing),
        currency: pricing.currency,
        slides: decorateSlides(req.params.id, m),
      });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/library/:id', (req, res, next) => {
    try {
      const dir = contentDir(req.params.id);
      if (!dir) {
        res.status(404).json({ error: 'content_not_found' });
        return;
      }
      fs.rmSync(dir, { recursive: true, force: true });
      log.info('library.deleted', { id: req.params.id });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Download all artifacts (PNGs + HTML + manifest + caption) as a single ZIP.
  app.get('/api/library/:id/export', (req, res, next) => {
    try {
      const dir = contentDir(req.params.id);
      if (!dir) {
        res.status(404).json({ error: 'content_not_found' });
        return;
      }
      const m = readManifest(dir);
      const entries: ZipEntry[] = [];
      for (const slide of m.slides) {
        const png = path.join(dir, slide.file);
        if (fs.existsSync(png)) entries.push({ name: `images/${slide.file}`, data: fs.readFileSync(png) });
        const htmlPath = path.join(dir, slide.htmlFile);
        if (fs.existsSync(htmlPath)) entries.push({ name: `html/${slide.htmlFile}`, data: fs.readFileSync(htmlPath) });
      }
      entries.push({ name: 'manifest.json', data: Buffer.from(JSON.stringify(m, null, 2), 'utf8') });
      if (m.caption) {
        const tags = m.caption.hashtags.map((h) => `#${h}`).join(' ');
        const captionTxt = `${m.caption.text}\n\n${tags}\n`;
        entries.push({ name: 'caption.txt', data: Buffer.from(captionTxt, 'utf8') });
      }

      const zip = createZip(entries);
      const safeTitle = (m.title || m.topic || req.params.id)
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || req.params.id;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.zip"`);
      res.setHeader('Content-Length', String(zip.length));
      log.info('library.exported', { id: req.params.id, files: entries.length });
      res.end(zip);
    } catch (err) {
      next(err);
    }
  });

  // Generate (or regenerate) an Instagram caption from the content of the slides.
  app.post('/api/library/:id/caption', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dir = contentDir(req.params.id);
      if (!dir) {
        res.status(404).json({ error: 'content_not_found' });
        return;
      }
      const m = readManifest(dir);
      const slidesText = m.slides.map((s) => {
        try {
          return htmlToText(fs.readFileSync(path.join(dir, s.htmlFile), 'utf8'));
        } catch {
          return s.intent ?? '';
        }
      });

      const cfg = readLlmConfig();
      const client = createLlmClient(cfg);
      const brand = resolveBrandContext();

      let generated;
      try {
        generated = await generateCaption({
          client,
          model: cfg.models.editorialReview ?? cfg.model,
          reasoningEffort: cfg.reasoningEffort,
          topic: m.topic,
          title: m.title,
          angle: m.angle,
          slidesText,
          brandContext: brand,
          language: getBrandVars().language,
        });
      } catch (err) {
        const e: Error & { code?: string } = new Error((err as Error).message);
        e.code = 'LLM_FAILURE';
        throw e;
      }

      const caption: Caption = {
        text: generated.caption,
        hashtags: generated.hashtags.map((h) => h.replace(/^#/, '')),
        generatedAt: new Date().toISOString(),
      };
      m.caption = caption;
      m.updatedAt = caption.generatedAt;
      writeManifest(dir, m);
      log.info('library.caption.generated', { id: req.params.id });
      res.json({ ok: true, caption });
    } catch (err) {
      next(err);
    }
  });

  // Raw HTML of one slide (for the editor).
  app.get('/api/library/:id/slides/:n/html', (req, res, next) => {
    try {
      const dir = contentDir(req.params.id);
      if (!dir) {
        res.status(404).json({ error: 'content_not_found' });
        return;
      }
      const m = readManifest(dir);
      const slide = m.slides[Number(req.params.n)];
      if (!slide) {
        res.status(404).json({ error: 'slide_not_found' });
        return;
      }
      const html = fs.readFileSync(path.join(dir, slide.htmlFile), 'utf8');
      res.type('text/plain').send(html);
    } catch (err) {
      next(err);
    }
  });

  // Save manually-edited HTML and re-render the PNG.
  app.put('/api/library/:id/slides/:n/html', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dir = contentDir(req.params.id);
      if (!dir) {
        res.status(404).json({ error: 'content_not_found' });
        return;
      }
      const m = readManifest(dir);
      const idx = Number(req.params.n);
      const slide = m.slides[idx];
      if (!slide) {
        res.status(404).json({ error: 'slide_not_found' });
        return;
      }
      const { html } = SaveHtmlSchema.parse(req.body);
      snapshotSlide(dir, slide, slide.lastEditSummary ?? 'Versione precedente');
      const warnings = await rerenderSlide(dir, slide, html);
      slide.editedAt = new Date().toISOString();
      slide.lastEditSummary = 'Modifica manuale HTML';
      m.updatedAt = slide.editedAt;
      writeManifest(dir, m);
      log.info('library.slide.saved', { id: req.params.id, slide: idx, warnings });
      res.json({ ok: true, imageUrl: `/output/${req.params.id}/${slide.file}`, editedAt: slide.editedAt, warnings });
    } catch (err) {
      next(err);
    }
  });

  // AI-driven surgical edit of one slide.
  app.post('/api/library/:id/slides/:n/ai-edit', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dir = contentDir(req.params.id);
      if (!dir) {
        res.status(404).json({ error: 'content_not_found' });
        return;
      }
      const m = readManifest(dir);
      const idx = Number(req.params.n);
      const slide = m.slides[idx];
      if (!slide) {
        res.status(404).json({ error: 'slide_not_found' });
        return;
      }
      const { instruction, model } = AiEditSchema.parse(req.body);
      const currentHtml = fs.readFileSync(path.join(dir, slide.htmlFile), 'utf8');

      const cfg = readLlmConfig();
      const client = createLlmClient(cfg);
      const brand = resolveBrandContext();

      let edited;
      try {
        edited = await editSlideHtml({
          client,
          model: model ?? cfg.models.htmlRender ?? cfg.model,
          reasoningEffort: cfg.reasoningEffort,
          currentHtml,
          instruction,
          brandContext: brand,
          language: getBrandVars().language,
        });
      } catch (err) {
        const e: Error & { code?: string } = new Error((err as Error).message);
        e.code = 'LLM_FAILURE';
        throw e;
      }

      snapshotSlide(dir, slide, slide.lastEditSummary ?? 'Versione precedente');
      const warnings = await rerenderSlide(dir, slide, edited.html);
      slide.editedAt = new Date().toISOString();
      // Keep the original design `intent`; record the edit summary separately so
      // repeated AI edits don't clobber the slide's design intent in the manifest.
      slide.lastEditSummary = edited.summary;
      m.updatedAt = slide.editedAt;
      writeManifest(dir, m);
      log.info('library.slide.ai_edited', { id: req.params.id, slide: idx, warnings });
      res.json({
        ok: true,
        summary: edited.summary,
        html: edited.html,
        imageUrl: `/output/${req.params.id}/${slide.file}`,
        editedAt: slide.editedAt,
        warnings,
      });
    } catch (err) {
      next(err);
    }
  });

  // Version history of a slide (previous html+png snapshots, newest first).
  app.get('/api/library/:id/slides/:n/history', (req, res, next) => {
    try {
      const dir = contentDir(req.params.id);
      if (!dir) {
        res.status(404).json({ error: 'content_not_found' });
        return;
      }
      const m = readManifest(dir);
      const slide = m.slides[Number(req.params.n)];
      if (!slide) {
        res.status(404).json({ error: 'slide_not_found' });
        return;
      }
      const versions = (slide.history ?? []).map((h) => ({
        id: h.id,
        at: h.at,
        label: h.label,
        imageUrl: `/output/${req.params.id}/${h.file}`,
        htmlUrl: `/output/${req.params.id}/${h.htmlFile}`,
      }));
      res.json({ versions });
    } catch (err) {
      next(err);
    }
  });

  // Restore a slide to a previous version. Snapshots the current state first so
  // the revert is itself undoable, then re-renders from the stored HTML.
  app.post('/api/library/:id/slides/:n/revert', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dir = contentDir(req.params.id);
      if (!dir) {
        res.status(404).json({ error: 'content_not_found' });
        return;
      }
      const m = readManifest(dir);
      const idx = Number(req.params.n);
      const slide = m.slides[idx];
      if (!slide) {
        res.status(404).json({ error: 'slide_not_found' });
        return;
      }
      const { id: versionId } = RevertSchema.parse(req.body);
      const entry = (slide.history ?? []).find((h) => h.id === versionId);
      if (!entry) {
        res.status(404).json({ error: 'version_not_found' });
        return;
      }
      const html = fs.readFileSync(path.join(dir, entry.htmlFile), 'utf8');
      snapshotSlide(dir, slide, slide.lastEditSummary ?? 'Versione precedente');
      const warnings = await rerenderSlide(dir, slide, html);
      slide.editedAt = new Date().toISOString();
      slide.lastEditSummary = `Ripristino: ${entry.label}`;
      m.updatedAt = slide.editedAt;
      writeManifest(dir, m);
      log.info('library.slide.reverted', { id: req.params.id, slide: idx, version: versionId });
      res.json({ ok: true, imageUrl: `/output/${req.params.id}/${slide.file}`, editedAt: slide.editedAt, warnings });
    } catch (err) {
      next(err);
    }
  });
}

export { OUTPUT_DIR };
