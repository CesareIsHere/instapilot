import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { errorHandler } from '@/server/errors';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.get('/validation', (_req, _res, next) => {
    try { z.object({ x: z.number() }).parse({}); }
    catch (e) { next(e); }
  });
  app.get('/asset', (_req, _res, next) => {
    const err: Error & { code?: string; assetId?: string } = new Error('asset_not_found:foo');
    err.code = 'ASSET_NOT_FOUND';
    err.assetId = 'foo';
    next(err);
  });
  app.get('/boom', (_req, _res, next) => next(new Error('kaboom')));
  app.use(errorHandler);
  return app;
}

describe('error handler', () => {
  it('maps ZodError to 400', async () => {
    const res = await request(buildApp()).get('/validation');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation');
    expect(Array.isArray(res.body.issues)).toBe(true);
  });

  it('maps ASSET_NOT_FOUND to 422', async () => {
    const res = await request(buildApp()).get('/asset');
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('asset_not_found');
    expect(res.body.assetId).toBe('foo');
  });

  it('maps generic errors to 500', async () => {
    const res = await request(buildApp()).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('render_failure');
  });
});
