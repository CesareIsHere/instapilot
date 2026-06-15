import { describe, it, expect } from 'vitest';
import { UsageMeter } from '@/llm/usage';

describe('UsageMeter', () => {
  it('accumulates Chat API usage (prompt/completion/total)', () => {
    const m = new UsageMeter();
    m.record('a', { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
    m.record('b', { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 });
    expect(m.totals).toEqual({ promptTokens: 30, completionTokens: 15, totalTokens: 45, calls: 2 });
  });

  it('maps Responses API usage (input/output tokens)', () => {
    const m = new UsageMeter();
    m.record('research', { input_tokens: 100, output_tokens: 40, total_tokens: 140 });
    expect(m.totals).toEqual({ promptTokens: 100, completionTokens: 40, totalTokens: 140, calls: 1 });
  });

  it('treats missing usage as zeros but still counts the call', () => {
    const m = new UsageMeter();
    m.record('x', undefined);
    expect(m.totals).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0, calls: 1 });
  });

  it('derives total when total_tokens absent', () => {
    const m = new UsageMeter();
    m.record('x', { prompt_tokens: 7, completion_tokens: 3 });
    expect(m.totals.totalTokens).toBe(10);
  });

  it('aggregates breakdown by label', () => {
    const m = new UsageMeter();
    m.record('html.generate', { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 });
    m.record('html.generate', { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 });
    m.record('quality.review', { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 });
    const byLabel = Object.fromEntries(m.breakdown.map((r) => [r.label, r]));
    expect(byLabel['html.generate'].calls).toBe(2);
    expect(byLabel['html.generate'].totalTokens).toBe(20);
    expect(byLabel['quality.review'].totalTokens).toBe(2);
  });

  it('records UsageTotals via recordTotals (for rollups)', () => {
    const m = new UsageMeter();
    m.recordTotals('slide-1', { promptTokens: 100, completionTokens: 50, totalTokens: 150, calls: 4 });
    expect(m.totals).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150, calls: 4 });
    expect(m.breakdown[0].label).toBe('slide-1');
  });
});
