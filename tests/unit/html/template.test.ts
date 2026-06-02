import { describe, it, expect } from 'vitest';
import { buildHtmlDocument } from '@/html/template';

describe('buildHtmlDocument', () => {
  it('injects brand CSS custom properties', () => {
    const html = buildHtmlDocument('<div>x</div>', '');
    expect(html).toContain('--brand-navy:  #012A78');
    expect(html).toContain('--brand-green: #00B373');
    expect(html).toContain('--danger:      #DC2626');
    expect(html).toContain('--paper:       #FFFFFF');
  });

  it('injects the extended palette (accents + surfaces) for rich layouts', () => {
    const html = buildHtmlDocument('<div>x</div>', '');
    expect(html).toContain('--surface-blue:');
    expect(html).toContain('--surface-amber:');
    expect(html).toContain('--accent-amber:');
    expect(html).toContain('--accent-violet:');
  });

  it('includes .canvas with correct dimensions', () => {
    const html = buildHtmlDocument('<p>hello</p>', '');
    expect(html).toContain('width: 1080px');
    expect(html).toContain('height: 1350px');
    expect(html).toContain('class="canvas"');
  });

  it('places bodyHtml inside .canvas', () => {
    const html = buildHtmlDocument('<h1 class="hero">Titolo</h1>', '');
    expect(html).toMatch(/<div class="canvas">[\s\S]*<h1 class="hero">Titolo<\/h1>/);
  });

  it('injects scoped css inside <style>', () => {
    const html = buildHtmlDocument('<div>x</div>', '.canvas .hero { font-size: 120px; }');
    expect(html).toContain('.canvas .hero { font-size: 120px; }');
  });

  it('substitutes {{asset:logo-f}} token if asset file present (or leaves untouched)', () => {
    const html = buildHtmlDocument('<img src="{{asset:logo-f}}">', '');
    // Either replaced with data-URI or with comment if file not present in test env
    expect(html).toMatch(/src="(data:|\/\* unknown)/);
  });

  it('wraps output in valid DOCTYPE html structure', () => {
    const html = buildHtmlDocument('<div>x</div>', '');
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('includes the CTA arrow by default', () => {
    const html = buildHtmlDocument('<div></div>', '.canvas{}');
    expect(html).toContain('.canvas::after');
    expect(html).toContain("content: '→'");
  });

  it('includes the CTA arrow when showArrow is true', () => {
    const html = buildHtmlDocument('<div></div>', '.canvas{}', true);
    expect(html).toContain('.canvas::after');
  });

  it('omits the CTA arrow when showArrow is false', () => {
    const html = buildHtmlDocument('<div></div>', '.canvas{}', false);
    expect(html).not.toContain('.canvas::after');
    expect(html).not.toContain("content: '→'");
  });
});
