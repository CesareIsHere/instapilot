import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const DESIGN_SPEC = {
  recipe: 'cover',
  rationale: 'r',
  headline: { text: 'Titolo', coloredSpans: null },
  eyebrow: null,
  bodyElements: [{ type: 'paragraph', text: 'corpo', emphasis: 'none' }],
  colorPlan: 'navy',
  useAssets: ['logo-f'],
  notes: null,
};

function pipelineSuccess(file: string) {
  return {
    ok: true as const,
    file,
    html: '<!DOCTYPE html>',
    intent: 'intent',
    designSpec: DESIGN_SPEC,
    qualityWarnings: [],
    attempts: { design: 1, render: 1 },
    durationMs: { llm: 1, render: 1, total: 2 },
  };
}

vi.mock('@/content/research', () => ({
  researchTopic: vi.fn(async () => 'dossier di ricerca mock'),
}));

vi.mock('@/content/plan', () => ({
  planContent: vi.fn(async () => ({
    title: 'Titolo contenuto',
    angle: 'angolo',
    slides: [
      { role: 'cover', brief: 'brief cover' },
      { role: 'body', brief: 'brief body' },
      { role: 'cta', brief: 'brief cta' },
    ],
  })),
}));

vi.mock('@/content/review', () => ({
  reviewContent: vi.fn(async () => ({ approved: true, generalNotes: null, slideFixes: [] })),
}));

let slideCounter = 0;
vi.mock('@/html/pipeline', () => ({
  runSlidePipeline: vi.fn(async () => pipelineSuccess(`/out/slide-${slideCounter++}.png`)),
}));

vi.mock('@/llm/client', () => ({
  readLlmConfig: vi.fn(() => ({ apiKey: 'k', model: 'm' })),
  createLlmClient: vi.fn(() => ({} as unknown)),
}));

vi.mock('@/llm/brandContext', () => ({
  loadBrandContext: vi.fn(() => 'brand'),
}));

import { mountContentRoutes } from '@/server/routes';
import { errorHandler } from '@/server/errors';

function buildApp() {
  const app = express();
  app.use(express.json());
  mountContentRoutes(app);
  app.use(errorHandler);
  return app;
}

describe('POST /generate/content', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    slideCounter = 0;
  });

  it('generates a carousel: research → plan → slides → review', async () => {
    const res = await request(buildApp())
      .post('/generate/content')
      .send({ topic: 'La leva del tempo', format: 'carousel', slideCount: 3 });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Titolo contenuto');
    expect(res.body.slides).toHaveLength(3);
    expect(res.body.files).toHaveLength(3);
    expect(res.body.slides[0].role).toBe('cover');
    expect(res.body.slides[2].role).toBe('cta');
    expect(res.body.reviewRounds).toBe(1);
  });

  it('passes slideCount to the planner for carousel', async () => {
    const { planContent } = await import('@/content/plan');
    await request(buildApp())
      .post('/generate/content')
      .send({ topic: 'x', format: 'carousel', slideCount: 7 });
    expect((planContent as ReturnType<typeof vi.fn>).mock.calls[0][0].slideCount).toBe(7);
  });

  it('forces slideCount=1 for single format', async () => {
    const { planContent } = await import('@/content/plan');
    await request(buildApp())
      .post('/generate/content')
      .send({ topic: 'x', format: 'single', slideCount: 7 });
    expect((planContent as ReturnType<typeof vi.fn>).mock.calls[0][0].slideCount).toBe(1);
  });

  it('applies editorial fixes and regenerates only the flagged slide', async () => {
    const { reviewContent } = await import('@/content/review');
    const { runSlidePipeline } = await import('@/html/pipeline');

    // First review round rejects slide 1, second approves.
    (reviewContent as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        approved: false,
        generalNotes: null,
        slideFixes: [{ slideIndex: 1, issue: 'troppo astratto', fix: 'aggiungi esempio numerico' }],
      })
      .mockResolvedValueOnce({ approved: true, generalNotes: null, slideFixes: [] });

    const res = await request(buildApp())
      .post('/generate/content')
      .send({ topic: 'x', format: 'carousel', slideCount: 3 });

    expect(res.status).toBe(200);
    expect(res.body.reviewRounds).toBe(2);

    // 3 initial slides + 1 regeneration of the flagged slide = 4 pipeline calls.
    expect((runSlidePipeline as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(4);

    // The regeneration prompt must contain the editorial fix.
    const lastCall = (runSlidePipeline as ReturnType<typeof vi.fn>).mock.calls[3][0];
    expect(lastCall.userPrompt).toContain('aggiungi esempio numerico');
    expect(lastCall.role).toBe('body');
  });

  it('returns 422 slide_generation_failed when a slide pipeline fails', async () => {
    const { runSlidePipeline } = await import('@/html/pipeline');
    (runSlidePipeline as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      code: 'OVERFLOW_UNRESOLVED',
      detail: { attempts: 3 },
    });

    const res = await request(buildApp())
      .post('/generate/content')
      .send({ topic: 'x', format: 'carousel', slideCount: 3 });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('slide_generation_failed');
    expect(res.body.slideIndex).toBe(0);
  });

  it('returns 400 when topic missing', async () => {
    const res = await request(buildApp()).post('/generate/content').send({ format: 'single' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation');
  });
});
