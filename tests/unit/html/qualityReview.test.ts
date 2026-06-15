import { describe, it, expect } from 'vitest';
import { QualityReviewSchema, QualityIssueSchema } from '@/html/qualityReview';

describe('QualityIssueSchema', () => {
  it('accepts all valid categories', () => {
    const categories = ['brand-color', 'font-size', 'layout', 'logo', 'style', 'content'];
    for (const category of categories) {
      expect(QualityIssueSchema.safeParse({ category, description: 'desc', suggestion: 'fix it' }).success).toBe(true);
    }
  });

  it('rejects unknown category', () => {
    expect(QualityIssueSchema.safeParse({ category: 'unknown', description: 'desc', suggestion: 'fix' }).success).toBe(false);
  });

  it('rejects empty description', () => {
    expect(QualityIssueSchema.safeParse({ category: 'layout', description: '', suggestion: 'fix' }).success).toBe(false);
  });
});

describe('QualityReviewSchema', () => {
  it('accepts approved with no issues', () => {
    expect(QualityReviewSchema.safeParse({ approved: true, issues: [], rendererFeedback: null }).success).toBe(true);
  });

  it('accepts rejected with issues and feedback', () => {
    const review = {
      approved: false,
      issues: [{ category: 'brand-color', description: 'Hardcoded hex', suggestion: 'Use CSS vars' }],
      rendererFeedback: 'Replace #012A78 with var(--brand-navy)',
    };
    expect(QualityReviewSchema.safeParse(review).success).toBe(true);
  });

  it('accepts null rendererFeedback when approved', () => {
    expect(QualityReviewSchema.safeParse({ approved: true, issues: [], rendererFeedback: null }).success).toBe(true);
  });

  it('rejects missing approved field', () => {
    expect(QualityReviewSchema.safeParse({ issues: [], rendererFeedback: null }).success).toBe(false);
  });
});
