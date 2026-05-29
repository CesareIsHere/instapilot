import { describe, it, expect } from 'vitest';
import { validateGeneratedHtml } from '@/html/validate';

describe('validateGeneratedHtml', () => {
  it('returns null for clean HTML and CSS', () => {
    expect(validateGeneratedHtml('<div class="hero">Titolo</div>', '.canvas .hero { color: var(--ink); }')).toBeNull();
  });

  it('rejects <script> tags', () => {
    const err = validateGeneratedHtml('<script>alert(1)</script>', '');
    expect(err).not.toBeNull();
    expect(err?.detail).toMatch(/script/i);
  });

  it('rejects inline event handlers', () => {
    const err = validateGeneratedHtml('<div onclick="evil()">x</div>', '');
    expect(err).not.toBeNull();
    expect(err?.detail).toMatch(/event handler/i);
  });

  it('rejects http:// URLs in bodyHtml', () => {
    const err = validateGeneratedHtml('<img src="http://example.com/img.png">', '');
    expect(err).not.toBeNull();
    expect(err?.detail).toMatch(/http/i);
  });

  it('rejects https:// URLs in css', () => {
    const err = validateGeneratedHtml('<div>x</div>', 'background: url(https://cdn.example.com/img.png)');
    expect(err).not.toBeNull();
    expect(err?.detail).toMatch(/http/i);
  });

  it('rejects {{asset:}} tokens with unknown ids', () => {
    const err = validateGeneratedHtml('<img src="{{asset:does-not-exist}}">', '');
    expect(err).not.toBeNull();
    expect(err?.detail).toMatch(/unknown asset id/i);
  });

  it('accepts valid {{asset:}} tokens', () => {
    const err = validateGeneratedHtml('<img src="{{asset:logo-f}}">', '');
    expect(err).toBeNull();
  });

  it('accepts data: URIs', () => {
    const err = validateGeneratedHtml('<img src="data:image/png;base64,abc">', '');
    expect(err).toBeNull();
  });
});
