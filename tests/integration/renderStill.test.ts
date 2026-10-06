import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('@/lib/render', () => ({
  renderSlideStill: vi.fn(async () => ({ file: '/abs/output/Slide-mock.png', durationMs: 42 })),
  assertAssetsResolvable: vi.fn(),
}));

import { mountRenderRoutes } from '@/server/routes';
import { errorHandler } from '@/server/errors';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.locals.serveUrl = 'http://mock';
  mountRenderRoutes(app);
  app.use(errorHandler);
  return app;
}

const validSlide = {
  compositionId: 'Slide',
  format: 'post-portrait',
  layout: 'headline-body-illustration',
  background: 'paper',
  chrome: { showLogo: true, showCarouselNav: true, pageIndex: 3 },
  blocks: [
    { type: 'Headline', text: 'x', size: 'xl' },
    { type: 'RichText', content: [{ kind: 'paragraph', text: 'p' }] },
    { type: 'Illustration', assetId: 'growth-steps' },
  ],
};

describe('POST /render/still', () => {
  it('returns 200 with file path for valid slide', async () => {
    const res = await request(buildApp()).post('/render/still').send({ slide: validSlide });
    expect(res.status).toBe(200);
    expect(res.body.file).toBe('/abs/output/Slide-mock.png');
    expect(typeof res.body.durationMs).toBe('number');
  });

  it('returns 400 for invalid slide', async () => {
    const res = await request(buildApp()).post('/render/still').send({ slide: { ...validSlide, blocks: [] } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation');
  });

  it('returns 400 if body missing slide key', async () => {
    const res = await request(buildApp()).post('/render/still').send({});
    expect(res.status).toBe(400);
  });
});
