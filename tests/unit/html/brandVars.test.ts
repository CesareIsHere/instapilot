import { describe, it, expect } from 'vitest';
import { buildHtmlSystemPrompt } from '@/html/htmlSystemPrompt';
import type { BrandVars } from '@/html/brandVars';

const testVars: BrandVars = { name: 'AcmeCorp', fontFamily: 'Inter' };

describe('prompt brand injection', () => {
  it('il system prompt NON contiene "Finvestire" quando il brand è AcmeCorp', () => {
    const prompt = buildHtmlSystemPrompt('brand context test', undefined, false, testVars);
    expect(prompt).not.toContain('Finvestire');
    expect(prompt).toContain('AcmeCorp');
  });

  it('il system prompt NON contiene "Montserrat" hardcoded quando il font è Inter', () => {
    const prompt = buildHtmlSystemPrompt('brand context test', undefined, false, testVars);
    expect(prompt).not.toContain('Montserrat');
    expect(prompt).toContain('Inter');
  });
});
