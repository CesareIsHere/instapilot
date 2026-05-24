import type { Express, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { primitives } from '@/primitives';
import { layouts } from '@/layouts';
import { theme } from '@/theme';
import { listAssets } from '@/assets';
import { SlideSpecSchema } from '@/schema/slideSpec';
import { renderSlideStill } from '@/lib/render';

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
