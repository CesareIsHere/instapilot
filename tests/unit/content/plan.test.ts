import { describe, it, expect } from 'vitest';
import { ContentPlanSchema, ContentFormatSchema } from '@/content/plan';
import { ContentReviewSchema, SlideFixSchema } from '@/content/review';

describe('ContentFormatSchema', () => {
  it('accepts single and carousel', () => {
    expect(ContentFormatSchema.safeParse('single').success).toBe(true);
    expect(ContentFormatSchema.safeParse('carousel').success).toBe(true);
  });
  it('rejects other values', () => {
    expect(ContentFormatSchema.safeParse('story').success).toBe(false);
  });
});

describe('ContentPlanSchema', () => {
  const valid = {
    title: "Il potere dell'1%",
    framework: 'SWIPE',
    angle: 'Il tempo come alleato dell investitore di lungo periodo.',
    slides: [
      { role: 'cover', narrativeFunction: 'hook', brief: 'Hook: il tempo vale piu del timing.' },
      { role: 'body', narrativeFunction: 'inform', brief: 'Spiega interesse composto con esempio numerico.' },
      { role: 'cta', narrativeFunction: 'cta', brief: 'Invito a iniziare presto + segui.' },
    ],
  };

  it('accepts a valid plan', () => {
    expect(ContentPlanSchema.safeParse(valid).success).toBe(true);
  });

  it('requires at least one slide', () => {
    expect(ContentPlanSchema.safeParse({ ...valid, slides: [] }).success).toBe(false);
  });

  it('rejects invalid role', () => {
    const bad = { ...valid, slides: [{ role: 'intro', narrativeFunction: 'hook', brief: 'x' }] };
    expect(ContentPlanSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects empty brief', () => {
    const bad = { ...valid, slides: [{ role: 'cover', narrativeFunction: 'hook', brief: '' }] };
    expect(ContentPlanSchema.safeParse(bad).success).toBe(false);
  });

  it('requires framework', () => {
    const { framework, ...noFramework } = valid;
    expect(ContentPlanSchema.safeParse(noFramework).success).toBe(false);
  });

  it('requires narrativeFunction on each slide', () => {
    const bad = { ...valid, slides: [{ role: 'cover', brief: 'x' }] };
    expect(ContentPlanSchema.safeParse(bad).success).toBe(false);
  });
});

describe('ContentReviewSchema', () => {
  it('accepts approved with no fixes', () => {
    expect(ContentReviewSchema.safeParse({ approved: true, generalNotes: null, slideFixes: [] }).success).toBe(true);
  });

  it('accepts rejected with slide fixes', () => {
    const review = {
      approved: false,
      generalNotes: 'Manca un esempio concreto.',
      slideFixes: [{ slideIndex: 1, issue: 'Troppo astratto', fix: 'Aggiungi un esempio numerico.' }],
    };
    expect(ContentReviewSchema.safeParse(review).success).toBe(true);
  });

  it('rejects negative slideIndex', () => {
    expect(SlideFixSchema.safeParse({ slideIndex: -1, issue: 'x', fix: 'y' }).success).toBe(false);
  });

  it('rejects non-integer slideIndex', () => {
    expect(SlideFixSchema.safeParse({ slideIndex: 1.5, issue: 'x', fix: 'y' }).success).toBe(false);
  });
});
