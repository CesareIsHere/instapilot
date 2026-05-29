import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const VALID_HTML = {
  intent: 'mock cover intent',
  bodyHtml: '<div class="cover"><h1>Titolo</h1></div>',
  css: '.canvas .cover { display: flex; flex-direction: column; width: 1080px; height: 1350px; }',
};

const OVERFLOW_HTML = {
  intent: 'mock overflow intent',
  bodyHtml: '<div class="overflow">x</div>',
  css: '.canvas .overflow { display: flex; flex-direction: column; width: 1080px; height: 1350px; }',
};

vi.mock('@/html/generateHtml', () => ({
  generateSlideHtml: vi.fn(async () => VALID_HTML),
}));
vi.mock('@/llm/client', () => ({
  readLlmConfig: vi.fn(() => ({ baseURL: 'http://mock', apiKey: 'k', model: 'm' })),
  createLlmClient: vi.fn(() => ({} as unknown)),
}));
vi.mock('@/html/renderHtml', () => ({
  renderHtmlStill: vi.fn(async () => ({
    ok: true,
    file: '/abs/output/HtmlSlide-mock.png',
    durationMs: 100,
  })),
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

  it('returns 200 with file, intent, html, attempts on success', async () => {
    const res = await request(buildApp())
      .post('/render/html')
      .send({ prompt: 'Slide cover La leva del tempo' });
    expect(res.status).toBe(200);
    expect(res.body.file).toBe('/abs/output/HtmlSlide-mock.png');
    expect(res.body.intent).toBe('mock cover intent');
    expect(res.body.html).toContain('<!DOCTYPE html>');
    expect(res.body.attempts).toBe(1);
    expect(typeof res.body.durationMs).toBe('number');
    expect(typeof res.body.llmDurationMs).toBe('number');
    expect(typeof res.body.renderDurationMs).toBe('number');
  });

  it('returns 400 when prompt is missing', async () => {
    const res = await request(buildApp()).post('/render/html').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation');
  });

  it('returns 422 invalid_html when generated HTML contains <script>', async () => {
    const { generateSlideHtml } = await import('@/html/generateHtml');
    (generateSlideHtml as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...VALID_HTML,
      bodyHtml: '<script>alert(1)</script>',
    });
    const res = await request(buildApp()).post('/render/html').send({ prompt: 'bad' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('invalid_html');
  });

  it('returns 500 llm_failure when LLM throws', async () => {
    const { generateSlideHtml } = await import('@/html/generateHtml');
    (generateSlideHtml as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('llm_empty_response'));
    const res = await request(buildApp()).post('/render/html').send({ prompt: 'fail' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('llm_failure');
  });

  it('retries when first attempt overflows and succeeds on second', async () => {
    const { generateSlideHtml } = await import('@/html/generateHtml');
    const { renderHtmlStill } = await import('@/html/renderHtml');

    // Second LLM call returns valid HTML
    (generateSlideHtml as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(OVERFLOW_HTML)
      .mockResolvedValueOnce(VALID_HTML);

    // First render overflows, second is ok
    (renderHtmlStill as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: false,
        overflow: { x: false, y: true, scrollWidth: 1080, scrollHeight: 1530 },
        durationMs: 80,
      })
      .mockResolvedValueOnce({
        ok: true,
        file: '/abs/output/HtmlSlide-mock.png',
        durationMs: 90,
      });

    const res = await request(buildApp()).post('/render/html').send({ prompt: 'test retry' });
    expect(res.status).toBe(200);
    expect(res.body.attempts).toBe(2);
    expect(res.body.file).toBe('/abs/output/HtmlSlide-mock.png');

    // Second LLM call should have received overflow feedback
    const secondCall = (generateSlideHtml as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(secondCall.overflowFeedback).toContain('180px taller');
    expect(secondCall.previousOutput).toEqual(OVERFLOW_HTML);
  });

  it('returns 422 overflow_unresolved when all attempts overflow', async () => {
    const { generateSlideHtml } = await import('@/html/generateHtml');
    const { renderHtmlStill } = await import('@/html/renderHtml');

    (generateSlideHtml as ReturnType<typeof vi.fn>).mockResolvedValue(OVERFLOW_HTML);
    (renderHtmlStill as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      overflow: { x: false, y: true, scrollWidth: 1080, scrollHeight: 1500 },
      durationMs: 80,
    });

    const res = await request(buildApp()).post('/render/html').send({ prompt: 'always overflow' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('overflow_unresolved');
    expect(res.body.overflow).toBeDefined();
  });
});
