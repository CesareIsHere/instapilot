import type { Express, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { primitives } from '@/primitives';
import { layouts } from '@/layouts';
import { theme } from '@/theme';
import { listAssets } from '@/assets';
import { SlideSpecSchema } from '@/schema/slideSpec';
import { renderSlideStill, renderDynamicStill, shortId } from '@/lib/render';
import { generateSlideCode } from '@/llm/generate';
import { createLlmClient, readLlmConfig } from '@/llm/client';
import { buildSystemPrompt } from '@/llm/systemPrompt';
import { loadBrandContext } from '@/llm/brandContext';
import { validateTsx } from '@/dynamic/compile';
import { runSlidePipeline } from '@/html/pipeline';
import { generateContent } from '@/content/orchestrate';
import { log } from '@/lib/log';

export function mountDiscoveryRoutes(app: Express): void {
  app.get('/compositions', (_req, res) => {
    res.json({
      compositions: [{ id: 'Slide', width: 1080, height: 1350, fps: 30 }],
    });
  });

  app.get('/primitives', (_req, res) => {
    const out: Record<string, { schema: unknown }> = {};
    for (const [name, entry] of Object.entries(primitives)) {
      out[name] = { schema: zodToJsonSchema(entry.schema, name) };
    }
    res.json(out);
  });

  app.get('/layouts', (_req, res) => {
    const out: Record<string, { description: string; slots: string[] }> = {};
    for (const [id, entry] of Object.entries(layouts)) {
      out[id] = { description: entry.meta.description, slots: entry.meta.slots };
    }
    res.json(out);
  });

  app.get('/theme', (_req, res) => {
    res.json(theme);
  });

  app.get('/assets', (_req, res) => {
    res.json(listAssets());
  });
}

const StillBodySchema = z.object({ slide: SlideSpecSchema });
const CarouselBodySchema = z.object({ slides: z.array(SlideSpecSchema).min(1) });

export function mountRenderRoutes(app: Express): void {
  app.post('/render/still', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { slide } = StillBodySchema.parse(req.body);
      const serveUrl = req.app.locals.serveUrl as string;
      const result = await renderSlideStill({ serveUrl, slide });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post('/render/carousel', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { slides } = CarouselBodySchema.parse(req.body);
      const serveUrl = req.app.locals.serveUrl as string;
      const start = Date.now();
      const files: string[] = [];
      for (const slide of slides) {
        const r = await renderSlideStill({ serveUrl, slide });
        files.push(r.file);
      }
      res.json({ files, durationMs: Date.now() - start });
    } catch (err) {
      next(err);
    }
  });
}

const DynamicBodySchema = z.object({
  prompt: z.string().min(1).max(8000),
  brandContext: z.string().optional(),
  model: z.string().optional(),
});

const HtmlBodySchema = z.object({
  prompt: z.string().min(1).max(8000),
  brandContext: z.string().optional(),
  model: z.string().optional(),
  role: z.enum(['cover', 'body', 'cta']).optional(),
});

export function mountDynamicRoutes(app: Express): void {
  app.post('/render/dynamic', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = DynamicBodySchema.parse(req.body);
      const cfg = readLlmConfig();
      const client = createLlmClient(cfg);
      const brand = body.brandContext
        ?? loadBrandContext(process.env.BRAND_CONTEXT_FILE ?? 'docs/brand-context.example.md');
      const systemPrompt = buildSystemPrompt(brand);

      const llmStart = Date.now();
      let generated;
      try {
        generated = await generateSlideCode({
          client, model: body.model ?? cfg.models?.dynamic ?? cfg.model, systemPrompt, userPrompt: body.prompt,
          reasoningEffort: cfg.reasoningEffort,
        });
      } catch (err) {
        const e: Error & { code?: string } = new Error((err as Error).message);
        e.code = 'LLM_FAILURE';
        throw e;
      }
      const llmDurationMs = Date.now() - llmStart;

      const syntaxErr = validateTsx(generated.code);
      if (syntaxErr) {
        const e: Error & { code?: string; detail?: string } = new Error('invalid_code: generated TSX does not parse');
        e.code = 'INVALID_CODE';
        e.detail = syntaxErr;
        throw e;
      }

      const serveUrl = req.app.locals.serveUrl as string;
      const renderStart = Date.now();
      const result = await renderDynamicStill({ serveUrl, tsxCode: generated.code });
      const renderDurationMs = Date.now() - renderStart;

      res.json({
        file: result.file,
        durationMs: llmDurationMs + renderDurationMs,
        llmDurationMs,
        renderDurationMs,
        code: generated.code,
        intent: generated.intent,
      });
    } catch (err) {
      next(err);
    }
  });
}

export function mountHtmlRoutes(app: Express): void {
  app.post('/render/html', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = HtmlBodySchema.parse(req.body);
      const cfg = readLlmConfig();
      const client = createLlmClient(cfg);
      const brand = body.brandContext
        ?? loadBrandContext(process.env.BRAND_CONTEXT_FILE ?? 'docs/brand-context.example.md');

      const result = await runSlidePipeline({
        client,
        model: body.model ?? cfg.model,
        reasoningEffort: cfg.reasoningEffort,
        brandContext: brand,
        userPrompt: body.prompt,
        role: body.role,
        outputId: shortId(),
        showCtaArrow: false,
        models: body.model ? undefined : cfg.models,
      });

      if (!result.ok) {
        const e: Error & { code?: string; detail?: unknown } = new Error(result.code.toLowerCase());
        e.code = result.code;
        e.detail = result.detail;
        throw e;
      }

      res.json({
        file: result.file,
        intent: result.intent,
        html: result.html,
        designSpec: result.designSpec,
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
        attempts: result.attempts,
        usage: result.usage,
        durationMs: result.durationMs.total,
        llmDurationMs: result.durationMs.llm,
        renderDurationMs: result.durationMs.render,
      });
    } catch (err) {
      next(err);
    }
  });
}

const ContentBodySchema = z
  .object({
    topic: z.string().min(1).max(2000),
    instructions: z.string().max(4000).optional(),
    format: z.enum(['single', 'carousel']),
    // Permissive bound: carousel values are silently clamped to 6-9 in the transform below (not rejected).
    slideCount: z.number().int().min(1).max(20).optional(),
    brandContext: z.string().optional(),
    model: z.string().optional(),
  })
  .transform((b) => ({
    ...b,
    // Carousel defaults to 7 slides (clamped 6-9); single is always 1.
    slideCount: b.format === 'carousel' ? Math.min(9, Math.max(6, b.slideCount ?? 7)) : 1,
  }));

export function mountContentRoutes(app: Express): void {
  app.post('/generate/content', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = ContentBodySchema.parse(req.body);
      const cfg = readLlmConfig();
      const client = createLlmClient(cfg);
      const brand = body.brandContext
        ?? loadBrandContext(process.env.BRAND_CONTEXT_FILE ?? 'docs/brand-context.example.md');

      const result = await generateContent({
        client,
        model: body.model ?? cfg.model,
        reasoningEffort: cfg.reasoningEffort,
        brandContext: brand,
        topic: body.topic,
        instructions: body.instructions,
        format: body.format,
        slideCount: body.slideCount,
        models: body.model ? undefined : cfg.models,
      });

      if (!result.ok) {
        const e: Error & { code?: string; detail?: unknown } = new Error(result.code.toLowerCase());
        e.code = result.code;
        e.detail = result.detail;
        throw e;
      }

      res.json({
        carouselId: result.carouselId,
        carouselDir: result.carouselDir,
        topic: result.topic,
        format: result.format,
        title: result.title,
        angle: result.angle,
        framework: result.framework,
        files: result.slides.map((s) => s.file),
        slides: result.slides,
        reviewRounds: result.reviewRounds,
        contentWarnings: result.contentWarnings,
        usage: result.usage,
        durationMs: result.durationMs,
      });
    } catch (err) {
      next(err);
    }
  });
}
