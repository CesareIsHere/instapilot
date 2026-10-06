import { describe, it, expect } from 'vitest';
import { SlideSpecSchema } from '@/schema/slideSpec';

const validSlide = {
  compositionId: 'Slide',
  format: 'post-portrait',
  layout: 'headline-body-illustration',
  background: 'paper',
  chrome: { showLogo: true, showCarouselNav: true, pageIndex: 3 },
  blocks: [
    { type: 'Headline', text: "Il potere dell'1%", size: 'xl', color: 'brand-primary' },
    { type: 'RichText', content: [
      { kind: 'paragraph', text: 'Per Giulia...' },
      { kind: 'bullets', items: ['x', 'y'] },
    ]},
    { type: 'Illustration', assetId: 'growth-steps', caption: 'Tempo' },
  ],
};

describe('SlideSpec schema', () => {
  it('accepts the example slide', () => {
    const r = SlideSpecSchema.safeParse(validSlide);
    if (!r.success) console.error(r.error.format());
    expect(r.success).toBe(true);
  });

  it('rejects wrong compositionId', () => {
    const r = SlideSpecSchema.safeParse({ ...validSlide, compositionId: 'Other' });
    expect(r.success).toBe(false);
  });

  it('rejects empty blocks', () => {
    const r = SlideSpecSchema.safeParse({ ...validSlide, blocks: [] });
    expect(r.success).toBe(false);
  });

  it('rejects unknown block type', () => {
    const r = SlideSpecSchema.safeParse({
      ...validSlide,
      blocks: [{ type: 'UnknownPrim', text: 'x' }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects unknown layout', () => {
    const r = SlideSpecSchema.safeParse({ ...validSlide, layout: 'banana-grid' });
    expect(r.success).toBe(false);
  });
});
