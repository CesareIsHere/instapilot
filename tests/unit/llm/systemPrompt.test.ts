import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '@/llm/systemPrompt';

describe('buildSystemPrompt', () => {
  const brand = '# Finvestire\n\nVoice: rigoroso.';

  it('includes the three required sections', () => {
    const prompt = buildSystemPrompt(brand);
    expect(prompt).toContain('REMOTION RULES');
    expect(prompt).toContain('SANDBOX API');
    expect(prompt).toContain('BRAND CONTEXT');
  });

  it('embeds the brand context verbatim', () => {
    const prompt = buildSystemPrompt(brand);
    expect(prompt).toContain('Voice: rigoroso');
  });

  it('declares the expected output contract (Slide function)', () => {
    const prompt = buildSystemPrompt(brand);
    expect(prompt).toMatch(/const Slide\s*=/);
  });

  it('lists all 5 sandbox globals', () => {
    const prompt = buildSystemPrompt(brand);
    for (const g of ['React', 'Remotion', 'theme', 'assets', 'primitives']) {
      expect(prompt).toContain(g);
    }
  });

  it('forbids import statements', () => {
    const prompt = buildSystemPrompt(brand);
    expect(prompt.toLowerCase()).toContain('no import');
  });
});
