import { describe, it, expect } from 'vitest';
import { SlideDesignSpecSchema, DesignReviewSchema } from '@/html/designSpec';

const validSpec = {
  recipe: 'numbered-list',
  rationale: 'Content is a list of tips — numbered-list recipe fits perfectly.',
  headline: { text: 'Come investire in 5 passi', coloredSpans: [{ word: 'investire', color: 'green' }] },
  eyebrow: 'GUIDA',
  bodyElements: [
    { type: 'list-item', text: '1. Definisci i tuoi obiettivi', emphasis: 'none' },
    { type: 'list-item', text: '2. Diversifica il portafoglio', emphasis: 'green' },
    { type: 'list-item', text: '3. Evita il market timing', emphasis: 'red' },
  ],
  colorPlan: 'Titolo navy con "investire" verde; lista con accent verde per step positivi',
  useAssets: ['logo'],
  notes: null,
};

describe('SlideDesignSpecSchema', () => {
  it('accepts a valid spec', () => {
    expect(SlideDesignSpecSchema.safeParse(validSpec).success).toBe(true);
  });

  it('accepts null for optional nullable fields', () => {
    const spec = { ...validSpec, headline: { text: 'Titolo', coloredSpans: null }, eyebrow: null, useAssets: null, notes: null };
    expect(SlideDesignSpecSchema.safeParse(spec).success).toBe(true);
  });

  it('rejects unknown recipe', () => {
    expect(SlideDesignSpecSchema.safeParse({ ...validSpec, recipe: 'unknown-layout' }).success).toBe(false);
  });

  it('rejects empty headline text', () => {
    const spec = { ...validSpec, headline: { text: '', coloredSpans: null } };
    expect(SlideDesignSpecSchema.safeParse(spec).success).toBe(false);
  });

  it('rejects invalid bodyElement emphasis', () => {
    const spec = {
      ...validSpec,
      bodyElements: [{ type: 'list-item', text: 'Item', emphasis: 'blue' }],
    };
    expect(SlideDesignSpecSchema.safeParse(spec).success).toBe(false);
  });

  it('rejects invalid bodyElement type', () => {
    const spec = {
      ...validSpec,
      bodyElements: [{ type: 'header', text: 'Item', emphasis: 'none' }],
    };
    expect(SlideDesignSpecSchema.safeParse(spec).success).toBe(false);
  });

  it('all recipe values are accepted', () => {
    const recipes = ['cover', 'numbered-list', 'compare-2col', 'kpi-hero', 'card-grid-2x2', 'quote', 'cta'];
    for (const recipe of recipes) {
      expect(SlideDesignSpecSchema.safeParse({ ...validSpec, recipe }).success).toBe(true);
    }
  });
});

describe('DesignReviewSchema', () => {
  it('accepts approved with empty issues', () => {
    expect(DesignReviewSchema.safeParse({ approved: true, issues: [] }).success).toBe(true);
  });

  it('accepts rejected with issues', () => {
    expect(DesignReviewSchema.safeParse({ approved: false, issues: ['Recipe does not fit content'] }).success).toBe(true);
  });

  it('rejects missing approved field', () => {
    expect(DesignReviewSchema.safeParse({ issues: [] }).success).toBe(false);
  });
});
