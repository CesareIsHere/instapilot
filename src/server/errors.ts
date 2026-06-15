import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { log } from '@/lib/log';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'validation', issues: err.issues });
    return;
  }

  const code = (err as { code?: string }).code;

  if (code === 'ASSET_NOT_FOUND') {
    const assetId = (err as { assetId?: string }).assetId;
    res.status(422).json({ error: 'asset_not_found', assetId });
    return;
  }

  if (code === 'INVALID_CODE') {
    const detail = (err as { detail?: string }).detail;
    res.status(422).json({ error: 'invalid_code', detail, message: (err as Error).message });
    return;
  }

  if (code === 'SLIDE_GENERATION_FAILED') {
    const detail = (err as { detail?: Record<string, unknown> }).detail ?? {};
    res.status(422).json({ error: 'slide_generation_failed', ...detail });
    return;
  }

  if (code === 'LLM_FAILURE') {
    log.error('llm.failure', { message: (err as Error).message });
    res.status(500).json({ error: 'llm_failure', message: (err as Error).message });
    return;
  }

  log.error('render.failure', { message: (err as Error).message });
  res.status(500).json({ error: 'render_failure', message: (err as Error).message });
};
