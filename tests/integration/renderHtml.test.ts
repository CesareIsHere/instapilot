import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const MOCK_DESIGN_SPEC = {
  recipe: 'cover',
  rationale: 'Bold single-concept cover slide.',
  headline: { text: 'La Leva del Tempo', coloredSpans: null },
  eyebrow: null,
  bodyElements: [],
  colorPlan: 'navy titles, green logo',
  useAssets: ['logo-f'],
  notes: null,
};

const MOCK_SUCCESS = {
  ok: true as const,
  file: '/abs/output/HtmlSlide-mock.png',
  html: '<!DOCTYPE html><html><head></head><body><div class="canvas"></div></body></html>',
  intent: 'mock cover intent',
  designSpec: MOCK_DESIGN_SPEC,
  qualityWarnings: [],
  attempts: { design: 1, render: 1 },
  durationMs: { llm: 200, render: 80, total: 280 },
};

vi.mock('@/html/pipeline', () => ({
  runSlidePipeline: vi.fn(async () => MOCK_SUCCESS),
}));

vi.mock('@/llm/client', () => ({
  readLlmConfig: vi.fn(() => ({ baseURL: 'http://mock', apiKey: 'k', model: 'm' })),
  createLlmClient: vi.fn(() => ({} as unknown)),
}));

vi.mock('@/llm/brandContext', () => ({
  loadBrandContext: vi.fn(() => 'mock brand context'),
}));

import { mountHtmlRoutes } from '@/server/routes';
import { errorHandler } from '@/server/errors';

function buildApp() {
  const app = express();
  app.use(express.json());
  mountHtmlRoutes(app);
  app.use(errorHandler);
  return app;
}

describe('POST /render/html', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with file, intent, html, designSpec, attempts', async () => {
    const res = await request(buildApp())
      .post('/render/html')
      .send({ prompt: 'Slide cover La leva del tempo' });
    expect(res.status).toBe(200);
    expect(res.body.file).toBe('/abs/output/HtmlSlide-mock.png');
    expect(res.body.intent).toBe('mock cover intent');
    expect(res.body.html).toContain('<!DOCTYPE html>');
    expect(res.body.designSpec.recipe).toBe('cover');
    expect(res.body.attempts).toEqual({ design: 1, render: 1 });
    expect(typeof res.body.durationMs).toBe('number');
    expect(typeof res.body.llmDurationMs).toBe('number');
    expect(typeof res.body.renderDurationMs).toBe('number');
  });

  it('omits qualityWarnings field when empty', async () => {
    const res = await request(buildApp()).post('/render/html').send({ prompt: 'x' });
    expect(res.status).toBe(200);
    expect(res.body.qualityWarnings).toBeUndefined();
  });

  it('includes qualityWarnings when present', async () => {
    const { runSlidePipeline } = await import('@/html/pipeline');
    (runSlidePipeline as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...MOCK_SUCCESS,
      qualityWarnings: [{ category: 'brand-color', description: 'Hardcoded hex', suggestion: 'Use CSS vars' }],
    });
    const res = await request(buildApp()).post('/render/html').send({ prompt: 'x' });
    expect(res.status).toBe(200);
    expect(res.body.qualityWarnings).toHaveLength(1);
  });

  it('returns 400 when prompt is missing', async () => {
    const res = await request(buildApp()).post('/render/html').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation');
  });

  it('returns 422 invalid_html when pipeline reports INVALID_HTML', async () => {
    const { runSlidePipeline } = await import('@/html/pipeline');
    (runSlidePipeline as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      code: 'INVALID_HTML',
      detail: 'script_tag_forbidden',
    });
    const res = await request(buildApp()).post('/render/html').send({ prompt: 'bad' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('invalid_html');
  });

  it('returns 500 llm_failure when pipeline reports LLM_FAILURE', async () => {
    const { runSlidePipeline } = await import('@/html/pipeline');
    (runSlidePipeline as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      code: 'LLM_FAILURE',
      detail: 'llm_empty_response',
    });
    const res = await request(buildApp()).post('/render/html').send({ prompt: 'fail' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('llm_failure');
  });

  it('returns 422 overflow_unresolved when pipeline exhausts render retries', async () => {
    const { runSlidePipeline } = await import('@/html/pipeline');
    (runSlidePipeline as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      code: 'OVERFLOW_UNRESOLVED',
      detail: { overflow: { x: false, y: true, scrollWidth: 1080, scrollHeight: 1530 }, attempts: 3 },
    });
    const res = await request(buildApp()).post('/render/html').send({ prompt: 'overflow' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('overflow_unresolved');
  });

  it('returns 422 design_review_failed when Agent 2 rejects design', async () => {
    const { runSlidePipeline } = await import('@/html/pipeline');
    (runSlidePipeline as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      code: 'DESIGN_REVIEW_FAILED',
      detail: { issues: ['Recipe does not match content'] },
    });
    const res = await request(buildApp()).post('/render/html').send({ prompt: 'bad design' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('design_review_failed');
  });

  it('forwards role to pipeline', async () => {
    const { runSlidePipeline } = await import('@/html/pipeline');
    await request(buildApp())
      .post('/render/html')
      .send({ prompt: 'Cover slide', role: 'cover' });
    expect((runSlidePipeline as ReturnType<typeof vi.fn>).mock.calls[0][0].role).toBe('cover');
  });
});
