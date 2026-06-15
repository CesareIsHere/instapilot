import type { Express, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { readStoredConfig, writeStoredConfig, toPublicConfig } from '@/config/store';
import { log } from '@/lib/log';

const ConfigPatchSchema = z
  .object({
    baseURL: z.string().max(500).optional(),
    apiKey: z.string().max(500).optional(),
    model: z.string().max(120).optional(),
    reasoningEffort: z.enum(['minimal', 'low', 'medium', 'high']).optional(),
    models: z.record(z.string(), z.string().max(120)).optional(),
  })
  .strict();

export function mountConfigRoutes(app: Express): void {
  app.get('/api/config', (_req, res) => {
    res.json(toPublicConfig(readStoredConfig()));
  });

  app.put('/api/config', (req: Request, res: Response, next: NextFunction) => {
    try {
      const patch = ConfigPatchSchema.parse(req.body ?? {});
      const merged = writeStoredConfig(patch);
      log.info('config.saved', { hasApiKey: Boolean(merged.apiKey), model: merged.model });
      res.json(toPublicConfig(merged));
    } catch (err) {
      next(err);
    }
  });
}
