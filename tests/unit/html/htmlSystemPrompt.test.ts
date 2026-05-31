import { describe, it, expect } from 'vitest';
import { buildHtmlSystemPrompt } from '@/html/htmlSystemPrompt';

describe('buildHtmlSystemPrompt — overflow/positioning hardening', () => {
  const prompt = buildHtmlSystemPrompt('CTX', 'body');

  it('mandates box-sizing: border-box', () => {
    expect(prompt).toContain('box-sizing: border-box');
  });
  it('warns about flex children min-width/min-height', () => {
    expect(prompt).toMatch(/min-width:\s*0/);
    expect(prompt).toMatch(/min-height:\s*0/);
  });
  it('forbids viewport units (mentions 100vw and 100vh)', () => {
    expect(prompt).toContain('100vw');
    expect(prompt).toContain('100vh');
  });
  it('requires overflow-wrap for long words/numbers', () => {
    expect(prompt).toContain('overflow-wrap');
  });
  it('includes a height budget section', () => {
    expect(prompt.toLowerCase()).toContain('height budget');
  });
  it('embeds the brand context', () => {
    expect(prompt).toContain('CTX');
  });
});
