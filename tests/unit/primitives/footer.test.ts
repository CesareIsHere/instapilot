import { describe, it, expect } from 'vitest';
import { FooterSchema } from '@/primitives/Footer';

describe('Footer schema', () => {
  it('accepts brand variant without text', () => {
    const r = FooterSchema.safeParse({ type: 'Footer', variant: 'brand' });
    expect(r.success).toBe(true);
  });

  it('accepts disclaimer variant', () => {
    const r = FooterSchema.safeParse({ type: 'Footer', variant: 'disclaimer' });
    expect(r.success).toBe(true);
  });

  it('accepts custom variant with text', () => {
    const r = FooterSchema.safeParse({ type: 'Footer', variant: 'custom', text: 'Note' });
    expect(r.success).toBe(true);
  });

  it('rejects unknown variant', () => {
    const r = FooterSchema.safeParse({ type: 'Footer', variant: 'banana' });
    expect(r.success).toBe(false);
  });

  it('rejects wrong type discriminator', () => {
    const r = FooterSchema.safeParse({ type: 'NotFooter', variant: 'brand' });
    expect(r.success).toBe(false);
  });
});
