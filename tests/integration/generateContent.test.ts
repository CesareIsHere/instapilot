import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.OUTPUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'instapilot-test-'));

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
    warnings: [] as never[],
    attempts: { design: 1, render: 1 },
    durationMs: { llm: 1, render: 1, total: 2 },
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, calls: 4 },
  };
}

vi.mock('@/content/research', () => ({
  researchTopic: vi.fn(async () => 'dossier di ricerca mock'),
}));

vi.mock('@/content/plan', () => ({
  planContent: vi.fn(async () => ({
    title: 'Titolo contenuto',
    framework: 'SWIPE',
    angle: 'angolo',
    slides: [
      { role: 'cover', narrativeFunction: 'hook', brief: 'brief cover' },
      { role: 'body', narrativeFunction: 'inform', brief: 'brief body' },
      { role: 'cta', narrativeFunction: 'cta', brief: 'brief cta' },
    ],
  })),
}));

vi.mock('@/content/researchReview', () => ({
  reviewResearch: vi.fn(async () => ({ approved: true, issues: [] })),
}));

vi.mock('@/content/planReview', () => ({
  reviewPlan: vi.fn(async () => ({ approved: true, issues: [], planFeedback: null })),
}));

vi.mock('@/content/review', () => ({
  reviewContent: vi.fn(async () => ({ approved: true, generalNotes: null, slideFixes: [] })),
}));

let slideCounter = 0;
vi.mock('@/html/pipeline', () => ({
  runSlidePipeline: vi.fn(async () => pipelineSuccess(`/out/slide-${slideCounter++}.png`)),
}));

vi.mock('@/llm/client', () => ({
  readLlmConfig: vi.fn(() => ({ apiKey: 'k', model: 'm', models: { research: 'm', researchReview: 'm', plan: 'm', planReview: 'm', designPlan: 'm', designReview: 'm', htmlRender: 'm', qualityReview: 'm', editorialReview: 'm', dynamic: 'm' } })),
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
    expect(res.body.usage.totalTokens).toBeGreaterThan(0);
    expect(res.body.carouselId).toBeTruthy();
    const manifestPath = path.join(res.body.carouselDir, 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.slides).toHaveLength(3);
    expect(manifest.slides[0].htmlFile).toBe('slide-01.html');
    expect(manifest.framework).toBe('SWIPE');
    expect(manifest.slides[0].narrativeFunction).toBe('hook');
    expect(manifest.slides[2].narrativeFunction).toBe('cta');
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

  it('returns 422 slide_generation_failed when a slide pipeline fails (non-LLM)', async () => {
    const { runSlidePipeline } = await import('@/html/pipeline');
    (runSlidePipeline as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      code: 'RENDER_FAILURE',
      detail: { reason: 'browser crash' },
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

  it('disables the swipe arrow on the last carousel slide', async () => {
    const { runSlidePipeline } = await import('@/html/pipeline');
    await request(buildApp())
      .post('/generate/content')
      .send({ topic: 'x', format: 'carousel', slideCount: 3 });
    const calls = (runSlidePipeline as ReturnType<typeof vi.fn>).mock.calls;
    const lastSlideArg = (calls[2] as unknown[])[0] as { showCtaArrow?: boolean };
    expect(lastSlideArg.showCtaArrow).toBe(false);
    const firstSlideArg = (calls[0] as unknown[])[0] as { showCtaArrow?: boolean };
    expect(firstSlideArg.showCtaArrow).toBe(true);
  });
});
