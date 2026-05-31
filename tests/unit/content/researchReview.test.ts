import { describe, it, expect } from 'vitest';
import { ResearchReviewSchema } from '@/content/researchReview';

describe('ResearchReviewSchema', () => {
  it('accepts approved with empty issues', () => {
    expect(ResearchReviewSchema.safeParse({ approved: true, issues: [] }).success).toBe(true);
  });
  it('accepts rejected with issues', () => {
    expect(ResearchReviewSchema.safeParse({ approved: false, issues: ['mancano dati con fonte'] }).success).toBe(true);
  });
  it('rejects missing approved', () => {
    expect(ResearchReviewSchema.safeParse({ issues: [] }).success).toBe(false);
  });
});
