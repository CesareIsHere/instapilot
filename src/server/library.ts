import type { Express, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { readLlmConfig, createLlmClient } from '@/llm/client';
import { loadBrandContext } from '@/llm/brandContext';
import { editSlideHtml } from '@/llm/editSlide';
import { renderHtmlStill } from '@/html/renderHtml';
import { theme } from '@/theme';
import { log } from '@/lib/log';

const OUTPUT_DIR = process.env.OUTPUT_DIR ?? path.resolve(process.cwd(), 'output');
const ID_RE = /^(carousel|post)-[a-zA-Z0-9]+$/;

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
  usage?: unknown;
  warnings?: unknown;
  research?: string;
  slides: ManifestSlide[];
}

/** Resolve and validate a content directory from its id, guarding against path traversal. */
function contentDir(id: string): string | null {
  if (!ID_RE.test(id)) return null;
  const dir = path.join(OUTPUT_DIR, id);
  if (!dir.startsWith(OUTPUT_DIR)) return null;
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

async function rerenderSlide(dir: string, slide: ManifestSlide, html: string): Promise<void> {
  fs.writeFileSync(path.join(dir, slide.htmlFile), html, 'utf8');
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
}

const SaveHtmlSchema = z.object({ html: z.string().min(1).max(500_000) });
const AiEditSchema = z.object({ instruction: z.string().min(1).max(4000), model: z.string().optional() });

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
      res.json({ id: req.params.id, ...m, slides: decorateSlides(req.params.id, m) });
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
      await rerenderSlide(dir, slide, html);
      slide.editedAt = new Date().toISOString();
      m.updatedAt = slide.editedAt;
      writeManifest(dir, m);
      log.info('library.slide.saved', { id: req.params.id, slide: idx });
      res.json({ ok: true, imageUrl: `/output/${req.params.id}/${slide.file}`, editedAt: slide.editedAt });
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
      const brand = loadBrandContext(process.env.BRAND_CONTEXT_FILE ?? 'docs/contesto-progetto-finvestire.md');

      let edited;
      try {
        edited = await editSlideHtml({
          client,
          model: model ?? cfg.models.htmlRender ?? cfg.model,
          reasoningEffort: cfg.reasoningEffort,
          currentHtml,
          instruction,
          brandContext: brand,
        });
      } catch (err) {
        const e: Error & { code?: string } = new Error((err as Error).message);
        e.code = 'LLM_FAILURE';
        throw e;
      }

      await rerenderSlide(dir, slide, edited.html);
      slide.editedAt = new Date().toISOString();
      slide.intent = edited.summary;
      m.updatedAt = slide.editedAt;
      writeManifest(dir, m);
      log.info('library.slide.ai_edited', { id: req.params.id, slide: idx });
      res.json({
        ok: true,
        summary: edited.summary,
        html: edited.html,
        imageUrl: `/output/${req.params.id}/${slide.file}`,
        editedAt: slide.editedAt,
      });
    } catch (err) {
      next(err);
    }
  });
}

export { OUTPUT_DIR };
