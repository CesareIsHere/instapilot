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
  app.get('/llmfail', (_req, _res, next) => {
    const e: Error & { code?: string } = new Error('llm_empty_response');
    e.code = 'LLM_FAILURE';
    next(e);
  });
  app.get('/badcode', (_req, _res, next) => {
    const e: Error & { code?: string; detail?: string } = new Error('invalid_code');
    e.code = 'INVALID_CODE';
    e.detail = 'unexpected token';
    next(e);
  });
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

  it('maps LLM_FAILURE to 500 with error=llm_failure', async () => {
    const res = await request(buildApp()).get('/llmfail');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('llm_failure');
  });

  it('maps INVALID_CODE to 422 with error=invalid_code and detail', async () => {
    const res = await request(buildApp()).get('/badcode');
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('invalid_code');
    expect(res.body.detail).toBe('unexpected token');
  });
});
