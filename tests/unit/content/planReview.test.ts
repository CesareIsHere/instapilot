import { describe, it, expect } from 'vitest';
import { PlanReviewSchema } from '@/content/planReview';

describe('PlanReviewSchema', () => {
  it('accepts approved with empty issues and null feedback', () => {
    expect(PlanReviewSchema.safeParse({ approved: true, issues: [], planFeedback: null }).success).toBe(true);
  });
  it('accepts rejected with issues + feedback', () => {
    expect(PlanReviewSchema.safeParse({
      approved: false, issues: ['cover hook debole'], planFeedback: 'Rafforza la cover con un dato shock.',
    }).success).toBe(true);
  });
  it('rejects missing approved', () => {
    expect(PlanReviewSchema.safeParse({ issues: [], planFeedback: null }).success).toBe(false);
  });
});
