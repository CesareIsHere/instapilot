import { describe, it, expect } from 'vitest';
import { GeneratedHtmlSchema } from '@/html/schema';

describe('GeneratedHtmlSchema', () => {
  it('parses valid output', () => {
    const result = GeneratedHtmlSchema.safeParse({
      intent: 'A clean cover slide',
      bodyHtml: '<div class="cover">Titolo</div>',
      css: '.canvas .cover { color: var(--ink); }',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing intent', () => {
    const result = GeneratedHtmlSchema.safeParse({ bodyHtml: '<div>x</div>', css: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty bodyHtml', () => {
    const result = GeneratedHtmlSchema.safeParse({ intent: 'ok', bodyHtml: '', css: '' });
    expect(result.success).toBe(false);
  });

  it('rejects bodyHtml over 100k chars', () => {
    const result = GeneratedHtmlSchema.safeParse({ intent: 'ok', bodyHtml: 'x'.repeat(100_001), css: '' });
    expect(result.success).toBe(false);
  });
});
