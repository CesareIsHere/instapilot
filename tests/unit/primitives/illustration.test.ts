import { describe, it, expect } from 'vitest';
import { IllustrationSchema } from '@/primitives/Illustration';

describe('Illustration schema', () => {
  it('accepts minimal props', () => {
    const r = IllustrationSchema.safeParse({ type: 'Illustration', assetId: 'logo' });
    expect(r.success).toBe(true);
  });

  it('accepts optional caption and align', () => {
    const r = IllustrationSchema.safeParse({
      type: 'Illustration',
      assetId: 'money-time-flow',
      caption: 'Tempo',
      align: 'center',
    });
    expect(r.success).toBe(true);
  });

  it('rejects missing assetId', () => {
    const r = IllustrationSchema.safeParse({ type: 'Illustration' });
    expect(r.success).toBe(false);
  });
});
