import { describe, it, expect } from 'vitest';
import { buildHtmlSystemPrompt } from '@/html/htmlSystemPrompt';
import { buildQualityReviewerPrompt } from '@/html/qualityReview';
import type { BrandVars } from '@/html/brandVars';

const testVars: BrandVars = {
  name: 'AcmeCorp',
  fontFamily: 'Poppins',
  colors: {
    primary: '#AA0011', positive: '#00AA22', negative: '#CC3300',
    paper: '#FFFBF0', ink: '#222222', muted: '#888888',
  },
};

describe('prompt brand injection', () => {
  it('il system prompt usa il nome del brand configurato', () => {
    const prompt = buildHtmlSystemPrompt('brand context test', undefined, false, testVars);
    expect(prompt).toContain('AcmeCorp');
  });

  it('il system prompt usa il font configurato e non altri font hardcoded', () => {
    const prompt = buildHtmlSystemPrompt('brand context test', undefined, false, testVars);
    expect(prompt).toContain('Poppins');
    expect(prompt).not.toContain('Montserrat');
    expect(prompt).not.toMatch(/\bInter\b/);
  });

  it('il system prompt documenta i colori configurati, non una palette fissa', () => {
    const prompt = buildHtmlSystemPrompt('brand context test', undefined, false, testVars);
    for (const hex of Object.values(testVars.colors)) expect(prompt).toContain(hex);
    expect(prompt).not.toContain('#4F46E5');
    expect(prompt.toLowerCase()).not.toContain('navy');
  });

  it('il prompt del quality reviewer usa colori e font configurati', () => {
    const prompt = buildQualityReviewerPrompt(testVars);
    expect(prompt).toContain('#AA0011');
    expect(prompt).toContain('Poppins');
    expect(prompt).not.toContain('Montserrat');
    expect(prompt.toLowerCase()).not.toContain('navy');
  });
});
