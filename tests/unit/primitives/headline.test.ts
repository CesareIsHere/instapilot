import { describe, it, expect } from 'vitest';
import { HeadlineSchema } from '@/primitives/Headline';

describe('Headline schema', () => {
  it('accepts minimal valid props', () => {
    const r = HeadlineSchema.safeParse({ type: 'Headline', text: 'Ciao', size: 'md' });
    expect(r.success).toBe(true);
  });

  it('accepts optional color', () => {
    const r = HeadlineSchema.safeParse({ type: 'Headline', text: 'Ciao', size: 'xl', color: 'brand-navy' });
    expect(r.success).toBe(true);
  });

  it('rejects missing text', () => {
    const r = HeadlineSchema.safeParse({ type: 'Headline', size: 'md' });
    expect(r.success).toBe(false);
  });

  it('rejects invalid size', () => {
    const r = HeadlineSchema.safeParse({ type: 'Headline', text: 'x', size: 'enormous' });
    expect(r.success).toBe(false);
  });

  it('rejects wrong type discriminator', () => {
    const r = HeadlineSchema.safeParse({ type: 'NotHeadline', text: 'x', size: 'md' });
    expect(r.success).toBe(false);
  });
});
