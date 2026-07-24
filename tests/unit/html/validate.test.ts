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
    const err = validateGeneratedHtml('<img src="{{asset:logo}}">', '');
    expect(err).toBeNull();
  });

  it('accepts data: URIs', () => {
    const err = validateGeneratedHtml('<img src="data:image/png;base64,abc">', '');
    expect(err).toBeNull();
  });

  it('accepts inline SVG with the W3C namespace (for diagram connectors)', () => {
    const err = validateGeneratedHtml('<svg xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="0" x2="10" y2="10"/></svg>', '');
    expect(err).toBeNull();
  });

  describe('brand CSS rules (deterministic)', () => {
    it('rejects hardcoded hex colors', () => {
      const err = validateGeneratedHtml('<div>x</div>', '.canvas .t { color: #012A78; }');
      expect(err).not.toBeNull();
      expect(err?.detail).toMatch(/hex|var\(/i);
    });

    it('rejects hex colors in inline style', () => {
      const err = validateGeneratedHtml('<div style="color:#fff">x</div>', '');
      expect(err).not.toBeNull();
      expect(err?.detail).toMatch(/hex/i);
    });

    it('rejects :root in css', () => {
      const err = validateGeneratedHtml('<div>x</div>', ':root { --x: 1px; } .canvas { color: var(--ink); }');
      expect(err).not.toBeNull();
      expect(err?.detail).toMatch(/:root/i);
    });

    it('rejects @import and @font-face', () => {
      expect(validateGeneratedHtml('<div>x</div>', '@import url(x);')?.detail).toMatch(/@import/i);
      expect(validateGeneratedHtml('<div>x</div>', '@font-face { font-family: X; }')?.detail).toMatch(/@font-face/i);
    });

    it('rejects box-shadow (but allows box-shadow: none)', () => {
      expect(validateGeneratedHtml('<div>x</div>', '.canvas .c { box-shadow: 0 2px 4px #000; }')).not.toBeNull();
      expect(validateGeneratedHtml('<div>x</div>', '.canvas .c { box-shadow: none; }')).toBeNull();
    });

    it('rejects gradients', () => {
      const err = validateGeneratedHtml('<div>x</div>', '.canvas { background: linear-gradient(#fff, #000); }');
      expect(err).not.toBeNull();
      expect(err?.detail).toMatch(/gradient/i);
    });

    it('rejects viewport units', () => {
      const err = validateGeneratedHtml('<div>x</div>', '.canvas .t { width: 100vw; height: 50vh; }');
      expect(err).not.toBeNull();
      expect(err?.detail).toMatch(/viewport|vw|vh/i);
    });

    it('does not flag id selectors as hex colors', () => {
      const err = validateGeneratedHtml('<div id="main">x</div>', '.canvas #main { color: var(--ink); }');
      expect(err).toBeNull();
    });

    it('reports multiple violations together', () => {
      const err = validateGeneratedHtml('<div>x</div>', '.canvas { color: #012A78; box-shadow: 0 0 2px #000; width: 100vw; }');
      expect(err).not.toBeNull();
      expect(err?.detail).toMatch(/hex/i);
      expect(err?.detail).toMatch(/box-shadow/i);
      expect(err?.detail).toMatch(/viewport|vw/i);
    });
  });
});
