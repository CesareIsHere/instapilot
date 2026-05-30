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
import { generateSlideHtml } from '@/html/generateHtml';
import { buildHtmlSystemPrompt } from '@/html/htmlSystemPrompt';
import { validateGeneratedHtml } from '@/html/validate';
import { buildHtmlDocument } from '@/html/template';
import { renderHtmlStill } from '@/html/renderHtml';
import type { GeneratedHtml, OverflowResult } from '@/html/schema';
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
        ?? loadBrandContext(process.env.BRAND_CONTEXT_FILE ?? 'docs/contesto-progetto-finvestire.md');
      const systemPrompt = buildSystemPrompt(brand);

      const llmStart = Date.now();
      let generated;
      try {
        generated = await generateSlideCode({
          client, model: body.model ?? cfg.model, systemPrompt, userPrompt: body.prompt,
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

const HTML_MAX_ATTEMPTS = Number(process.env.HTML_MAX_ATTEMPTS ?? 3);

export function mountHtmlRoutes(app: Express): void {
  app.post('/render/html', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = HtmlBodySchema.parse(req.body);
      const cfg = readLlmConfig();
      const client = createLlmClient(cfg);
      const brand = body.brandContext
        ?? loadBrandContext(process.env.BRAND_CONTEXT_FILE ?? 'docs/contesto-progetto-finvestire.md');
      const systemPrompt = buildHtmlSystemPrompt(brand, body.role);
      const outputId = shortId();

      let totalLlmMs = 0;
      let totalRenderMs = 0;
      let attempts = 0;
      let lastGenerated: GeneratedHtml | null = null;
      let lastOverflow: OverflowResult | null = null;
      let overflowFeedback: string | undefined;

      for (let attempt = 1; attempt <= HTML_MAX_ATTEMPTS; attempt++) {
        attempts = attempt;

        // LLM generation
        const llmStart = Date.now();
        let generated: GeneratedHtml;
        try {
          generated = await generateSlideHtml({
            client,
            model: body.model ?? cfg.model,
            systemPrompt,
            userPrompt: body.prompt,
            reasoningEffort: cfg.reasoningEffort,
            overflowFeedback: attempt > 1 ? overflowFeedback : undefined,
            previousOutput: attempt > 1 && lastGenerated ? lastGenerated : undefined,
          });
        } catch (err) {
          const e: Error & { code?: string } = new Error((err as Error).message);
          e.code = 'LLM_FAILURE';
          throw e;
        }
        totalLlmMs += Date.now() - llmStart;
        lastGenerated = generated;

        // Validate
        const validationErr = validateGeneratedHtml(generated.bodyHtml, generated.css);
        if (validationErr) {
          const e: Error & { code?: string; detail?: string } = new Error('invalid_html');
          e.code = 'INVALID_HTML';
          e.detail = validationErr.detail;
          throw e;
        }

        // Build HTML document
        const html = buildHtmlDocument(generated.bodyHtml, generated.css);

        // Render + overflow check
        const renderStart = Date.now();
        const outcome = await renderHtmlStill(html, outputId);
        totalRenderMs += Date.now() - renderStart;

        if (outcome.ok) {
          return res.json({
            file: outcome.file,
            intent: generated.intent,
            html,
            attempts,
            durationMs: totalLlmMs + totalRenderMs,
            llmDurationMs: totalLlmMs,
            renderDurationMs: totalRenderMs,
          });
        }

        // Overflow — prepare feedback for next attempt
        lastOverflow = outcome.overflow;
        const axes: string[] = [];
        if (outcome.overflow.y) axes.push(`${outcome.overflow.scrollHeight - 1350}px taller than the 1350px canvas (scrollHeight: ${outcome.overflow.scrollHeight})`);
        if (outcome.overflow.x) axes.push(`${outcome.overflow.scrollWidth - 1080}px wider than the 1080px canvas (scrollWidth: ${outcome.overflow.scrollWidth})`);
        overflowFeedback = `The previous attempt overflowed: ${axes.join(' and ')}. You MUST fit everything inside exactly 1080×1350px. Strategies: reduce content quantity, decrease spacing, or use a more compact layout recipe. Do NOT reduce font sizes below the minimums in the design rules. Regenerate the full slide now.`;
        log.warn('render.html.retry', { attempt, ...outcome.overflow });
      }

      // All attempts exhausted — return 422 with last overflow info
      const e: Error & { code?: string; detail?: unknown } = new Error('overflow_unresolved');
      e.code = 'OVERFLOW_UNRESOLVED';
      e.detail = {
        overflow: lastOverflow,
        html: lastGenerated
          ? buildHtmlDocument(lastGenerated.bodyHtml, lastGenerated.css)
          : null,
        intent: lastGenerated?.intent ?? null,
        attempts,
      };
      throw e;
    } catch (err) {
      next(err);
    }
  });
}
