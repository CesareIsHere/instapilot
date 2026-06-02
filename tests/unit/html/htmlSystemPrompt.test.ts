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

describe('buildHtmlSystemPrompt — rich layouts & palette', () => {
  const prompt = buildHtmlSystemPrompt('CTX', 'body');

  it('documents the new recipes', () => {
    for (const id of ['card-grid', 'flow-diagram', 'breakdown-chart', 'concept-breakdown']) {
      expect(prompt).toContain(id);
    }
  });

  it('documents the extended palette and keeps the canvas white', () => {
    expect(prompt).toContain('var(--surface-blue)');
    expect(prompt).toContain('var(--accent-amber)');
    expect(prompt.toLowerCase()).toContain('canvas background stays pure white');
  });

  it('allows emoji as sparing node icons', () => {
    expect(prompt.toLowerCase()).toContain('emoji');
  });
});

describe('buildHtmlSystemPrompt — single-post (self-contained) cover', () => {
  it('a carousel cover stays minimal', () => {
    const carouselCover = buildHtmlSystemPrompt('CTX', 'cover', false);
    expect(carouselCover).toContain('minimal text');
    expect(carouselCover).not.toContain('SELF-CONTAINED');
  });

  it('a single-post cover is told to be self-contained and richer', () => {
    const single = buildHtmlSystemPrompt('CTX', 'cover', true);
    expect(single).toContain('SELF-CONTAINED');
    expect(single).toMatch(/standalone single post/i);
    expect(single).not.toContain('minimal text');
  });
});
