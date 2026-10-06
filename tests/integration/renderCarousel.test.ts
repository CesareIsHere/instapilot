import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

let callCount = 0;
vi.mock('@/lib/render', () => ({
  renderSlideStill: vi.fn(async () => {
    callCount += 1;
    return { file: `/abs/output/Slide-${callCount}.png`, durationMs: 10 };
  }),
  assertAssetsResolvable: vi.fn(),
}));

import { mountRenderRoutes } from '@/server/routes';
import { errorHandler } from '@/server/errors';

function buildApp() {
  callCount = 0;
  const app = express();
  app.use(express.json());
  app.locals.serveUrl = 'http://mock';
  mountRenderRoutes(app);
  app.use(errorHandler);
  return app;
}

const slide = {
  compositionId: 'Slide',
  format: 'post-portrait',
  layout: 'headline-body-illustration',
  background: 'paper',
  chrome: { showLogo: true, showCarouselNav: true },
  blocks: [
    { type: 'Headline', text: 'x', size: 'md' },
    { type: 'RichText', content: [{ kind: 'paragraph', text: 'p' }] },
    { type: 'Illustration', assetId: 'growth-steps' },
  ],
};

describe('POST /render/carousel', () => {
  it('renders N slides and returns N files', async () => {
    const res = await request(buildApp())
      .post('/render/carousel')
      .send({ slides: [slide, slide, slide] });
    expect(res.status).toBe(200);
    expect(res.body.files).toHaveLength(3);
    expect(typeof res.body.durationMs).toBe('number');
  });

  it('returns 400 if any slide invalid', async () => {
    const bad = { ...slide, blocks: [] };
    const res = await request(buildApp())
      .post('/render/carousel')
      .send({ slides: [slide, bad] });
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty slides array', async () => {
    const res = await request(buildApp())
      .post('/render/carousel')
      .send({ slides: [] });
    expect(res.status).toBe(400);
  });
});
