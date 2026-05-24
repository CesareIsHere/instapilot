import { describe, it, expect } from 'vitest';
import { RichTextSchema } from '@/primitives/RichText';

describe('RichText schema', () => {
  it('accepts paragraph + bullets mix', () => {
    const r = RichTextSchema.safeParse({
      type: 'RichText',
      content: [
        { kind: 'paragraph', text: 'Intro' },
        { kind: 'bullets', items: ['A', 'B', 'C'] },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('rejects empty content', () => {
    const r = RichTextSchema.safeParse({ type: 'RichText', content: [] });
    expect(r.success).toBe(false);
  });

  it('rejects bullets with empty items', () => {
    const r = RichTextSchema.safeParse({
      type: 'RichText',
      content: [{ kind: 'bullets', items: [] }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects unknown content kind', () => {
    const r = RichTextSchema.safeParse({
      type: 'RichText',
      content: [{ kind: 'code', text: 'x' }],
    });
    expect(r.success).toBe(false);
  });
});
