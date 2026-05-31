import { describe, it, expect, vi, beforeEach } from 'vitest';

const SPEC = {
  recipe: 'cover', rationale: 'r',
  headline: { text: 'T', coloredSpans: null },
  eyebrow: null, bodyElements: [], colorPlan: 'navy', useAssets: ['logo-f'], notes: null,
};

const {
  planSlideDesign,
  reviewSlideDesign,
  generateSlideHtml,
  reviewRenderedSlide,
  renderHtmlStill,
  validateGeneratedHtml: _validateGeneratedHtml,
} = vi.hoisted(() => ({
  planSlideDesign: vi.fn(),
  reviewSlideDesign: vi.fn(),
  generateSlideHtml: vi.fn(),
  reviewRenderedSlide: vi.fn(),
  renderHtmlStill: vi.fn(),
  validateGeneratedHtml: vi.fn(() => null),
}));

vi.mock('@/html/designSpec', () => ({ planSlideDesign, reviewSlideDesign }));
vi.mock('@/html/generateHtml', () => ({ generateSlideHtml }));
vi.mock('@/html/qualityReview', () => ({ reviewRenderedSlide }));
vi.mock('@/html/renderHtml', () => ({ renderHtmlStill }));
vi.mock('@/html/validate', () => ({ validateGeneratedHtml: _validateGeneratedHtml }));
vi.mock('@/html/template', () => ({ buildHtmlDocument: vi.fn(() => '<html>doc</html>') }));
vi.mock('@/html/htmlSystemPrompt', () => ({ buildHtmlSystemPrompt: vi.fn(() => 'sys') }));

import { runSlidePipeline } from '@/html/pipeline';
import { validateGeneratedHtml } from '@/html/validate';

const baseArgs = {
  client: {} as never, model: 'm', brandContext: 'b', userPrompt: 'p', outputId: 'id1',
};
const GENERATED = { intent: 'i', bodyHtml: '<div></div>', css: '.canvas{}' };

// Helper: wrap a resolved value in an impl that also records to meter so usage.calls > 0.
type MeterArg = { meter?: { record: (label: string, usage: null) => void } };
function withMeter<T>(label: string, value: T) {
  return (args: MeterArg) => { args?.meter?.record(label, null); return Promise.resolve(value); };
}

beforeEach(() => {
  vi.clearAllMocks();
  planSlideDesign.mockImplementation(withMeter('design.plan', SPEC));
  reviewSlideDesign.mockImplementation(withMeter('design.review', { approved: true, issues: [] }));
  generateSlideHtml.mockImplementation(withMeter('html.generate', GENERATED));
  renderHtmlStill.mockResolvedValue({ ok: true, file: '/out/x.png', durationMs: 5 });
  reviewRenderedSlide.mockImplementation(withMeter('quality.review', { approved: true, issues: [], rendererFeedback: null }));
  (validateGeneratedHtml as ReturnType<typeof vi.fn>).mockReturnValue(null);
});

describe('runSlidePipeline — best effort', () => {
  it('returns ok with no warnings on the happy path + usage present', async () => {
    const res = await runSlidePipeline(baseArgs as never);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.warnings).toEqual([]);
    expect(res.usage.calls).toBeGreaterThan(0);
  });

  it('ships best-effort with a design-review warning when Agent 2 never approves', async () => {
    reviewSlideDesign.mockResolvedValue({ approved: false, issues: ['recipe mismatch'] });
    const res = await runSlidePipeline(baseArgs as never);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.warnings.some((w) => w.kind === 'design-review')).toBe(true);
    expect(res.file).toBe('/out/x.png');
  });

  it('forces a render and warns when overflow never resolves', async () => {
    renderHtmlStill
      .mockResolvedValueOnce({ ok: false, overflow: { x: false, y: true, scrollWidth: 1080, scrollHeight: 1500 }, durationMs: 5 })
      .mockResolvedValueOnce({ ok: false, overflow: { x: false, y: true, scrollWidth: 1080, scrollHeight: 1500 }, durationMs: 5 })
      .mockResolvedValueOnce({ ok: false, overflow: { x: false, y: true, scrollWidth: 1080, scrollHeight: 1500 }, durationMs: 5 })
      .mockResolvedValueOnce({ ok: false, overflow: { x: false, y: true, scrollWidth: 1080, scrollHeight: 1500 }, durationMs: 5 })
      .mockResolvedValueOnce({ ok: true, file: '/out/forced.png', durationMs: 5, overflow: { x: false, y: true, scrollWidth: 1080, scrollHeight: 1500 } });
    const res = await runSlidePipeline(baseArgs as never);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.file).toBe('/out/forced.png');
    expect(res.warnings.some((w) => w.kind === 'overflow')).toBe(true);
    // Last attempt must request a forced render.
    const lastCall = renderHtmlStill.mock.calls[renderHtmlStill.mock.calls.length - 1];
    expect(lastCall[2]).toMatchObject({ force: true });
  });

  it('treats invalid HTML as retry feedback, not a hard failure', async () => {
    (validateGeneratedHtml as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({ code: 'INVALID_HTML', detail: '<script> tag not allowed' })
      .mockReturnValue(null);
    const res = await runSlidePipeline(baseArgs as never);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // second generate attempt produced valid html → clean success
    expect(generateSlideHtml).toHaveBeenCalledTimes(2);
  });

  it('returns LLM_FAILURE only when an LLM call throws', async () => {
    planSlideDesign.mockRejectedValue(new Error('network down'));
    const res = await runSlidePipeline(baseArgs as never);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('LLM_FAILURE');
  });

  it('passes output dir/fileName through to the renderer', async () => {
    await runSlidePipeline({ ...baseArgs, output: { dir: '/out/carousel-1', fileName: 'slide-01.png' } } as never);
    expect(renderHtmlStill.mock.calls[0][2]).toMatchObject({ dir: '/out/carousel-1', fileName: 'slide-01.png' });
  });
});
