import { describe, it, expect } from 'vitest';
import { GeneratedSlideSchema } from '@/llm/schema';

describe('GeneratedSlideSchema', () => {
  it('accepts valid response', () => {
    const r = GeneratedSlideSchema.safeParse({
      intent: 'Titolo + sottotitolo brand-navy',
      code: 'const Slide = () => null;',
    });
    expect(r.success).toBe(true);
  });

  it('rejects missing intent', () => {
    const r = GeneratedSlideSchema.safeParse({ code: 'x' });
    expect(r.success).toBe(false);
  });

  it('rejects empty code', () => {
    const r = GeneratedSlideSchema.safeParse({ intent: 'x', code: '' });
    expect(r.success).toBe(false);
  });

  it('rejects empty intent', () => {
    const r = GeneratedSlideSchema.safeParse({ intent: '', code: 'x' });
    expect(r.success).toBe(false);
  });
});
