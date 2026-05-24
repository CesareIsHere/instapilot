import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('@/llm/generate', () => ({
  generateSlideCode: vi.fn(async (args: { userPrompt: string }) => {
    if (args.userPrompt === 'EMPTY') throw new Error('llm_empty_response: x');
    if (args.userPrompt === 'BADJSON') throw new Error('llm_invalid_response: x');
    return { intent: 'mock intent', code: 'const Slide = () => null;' };
  }),
}));
vi.mock('@/llm/client', () => ({
  readLlmConfig: vi.fn(() => ({ baseURL: 'http://mock', apiKey: 'k', model: 'm' })),
  createLlmClient: vi.fn(() => ({} as unknown)),
}));
vi.mock('@/lib/render', () => ({
  renderSlideStill: vi.fn(),
  renderDynamicStill: vi.fn(async () => ({ file: '/abs/output/Slide-dyn-mock.png', durationMs: 100 })),
  assertAssetsResolvable: vi.fn(),
}));

import { mountDynamicRoutes } from '@/server/routes';
import { errorHandler } from '@/server/errors';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.locals.serveUrl = 'http://mock';
  mountDynamicRoutes(app);
  app.use(errorHandler);
  return app;
}

describe('POST /render/dynamic', () => {
  it('returns 200 with file + intent + code on success', async () => {
    const res = await request(buildApp())
      .post('/render/dynamic')
      .send({ prompt: 'Crea slide titolo' });
    expect(res.status).toBe(200);
    expect(res.body.file).toBe('/abs/output/Slide-dyn-mock.png');
    expect(res.body.intent).toBe('mock intent');
    expect(res.body.code).toContain('const Slide');
    expect(typeof res.body.durationMs).toBe('number');
    expect(typeof res.body.llmDurationMs).toBe('number');
    expect(typeof res.body.renderDurationMs).toBe('number');
  });

  it('returns 400 when prompt is missing', async () => {
    const res = await request(buildApp()).post('/render/dynamic').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation');
  });

  it('returns 500 with llm_failure when LLM throws', async () => {
    const res = await request(buildApp())
      .post('/render/dynamic')
      .send({ prompt: 'EMPTY' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('llm_failure');
  });

  it('returns 422 invalid_code when generated TSX does not parse', async () => {
    const { generateSlideCode } = await import('@/llm/generate');
    (generateSlideCode as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      intent: 'broken', code: 'const Slide = () => <div;',
    });
    const res = await request(buildApp())
      .post('/render/dynamic')
      .send({ prompt: 'broken' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('invalid_code');
  });
});
