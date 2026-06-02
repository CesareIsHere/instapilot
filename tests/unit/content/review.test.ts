import { describe, it, expect, vi, beforeEach } from 'vitest';

const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }));
vi.mock('node:fs', () => ({ promises: { readFile } }));

import { reviewContent, type ReviewableSlide } from '@/content/review';

const SPEC = {
  recipe: 'cover' as const, rationale: 'r',
  headline: { text: 'Titolo', coloredSpans: null },
  eyebrow: null, bodyElements: [{ type: 'paragraph' as const, text: 'corpo', emphasis: 'none' as const }],
  colorPlan: 'navy', useAssets: ['logo-f'], notes: null,
};

function slide(index: number, file: string): ReviewableSlide {
  return { index, role: index === 0 ? 'cover' : 'body', brief: `brief ${index}`, intent: 'i', designSpec: SPEC, file };
}

type CreateArgs = [{ messages: Array<{ content: Array<{ type: string; text?: string }> }> }];

function fakeClient(review: unknown) {
  const create = vi.fn(async (..._args: CreateArgs) => ({
    choices: [{ message: { content: JSON.stringify(review) } }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }));
  return { client: { chat: { completions: { create } } } as never, create };
}

beforeEach(() => {
  vi.clearAllMocks();
  readFile.mockResolvedValue(Buffer.from('PNGDATA'));
});

describe('reviewContent — multimodal whole-carousel review', () => {
  it('attaches one image part per slide alongside its metadata', async () => {
    const { client, create } = fakeClient({ approved: true, generalNotes: null, slideFixes: [] });
    await reviewContent({
      client, model: 'm', topic: 't', title: 'T', angle: 'a',
      slides: [slide(0, '/out/s1.png'), slide(1, '/out/s2.png')],
    });

    const content = create.mock.calls[0][0].messages[1].content as Array<{ type: string }>;
    const images = content.filter((p) => p.type === 'image_url');
    expect(images).toHaveLength(2);
    expect(readFile).toHaveBeenCalledTimes(2);
  });

  it('falls back to a text placeholder when a slide PNG is unreadable', async () => {
    readFile.mockRejectedValue(new Error('ENOENT'));
    const { client, create } = fakeClient({ approved: true, generalNotes: null, slideFixes: [] });
    await reviewContent({
      client, model: 'm', topic: 't', title: 'T', angle: 'a',
      slides: [slide(0, '/missing.png')],
    });

    const content = create.mock.calls[0][0].messages[1].content as Array<{ type: string; text?: string }>;
    expect(content.some((p) => p.type === 'image_url')).toBe(false);
    expect(content.some((p) => p.type === 'text' && p.text?.includes('immagine non disponibile'))).toBe(true);
  });

  it('returns the parsed review with slide fixes', async () => {
    const { client } = fakeClient({
      approved: false, generalNotes: 'note',
      slideFixes: [{ slideIndex: 1, issue: 'overlap', fix: 'sistema la box' }],
    });
    const res = await reviewContent({
      client, model: 'm', topic: 't', title: 'T', angle: 'a',
      slides: [slide(0, '/out/s1.png'), slide(1, '/out/s2.png')],
    });
    expect(res.approved).toBe(false);
    expect(res.slideFixes).toHaveLength(1);
    expect(res.slideFixes[0].slideIndex).toBe(1);
  });
});
