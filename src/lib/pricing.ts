import type { UsageTotals } from '@/llm/usage';

export interface Pricing {
  /** Price per 1M input (prompt) tokens, in `currency`. */
  inputPer1M: number;
  /** Price per 1M output (completion) tokens, in `currency`. */
  outputPer1M: number;
  currency: string;
}

/**
 * Token pricing, configurable via env. Defaults approximate GPT-4o list pricing
 * (USD) so the UI shows a meaningful estimate out of the box; override per model
 * with LLM_PRICE_INPUT_PER_1M / LLM_PRICE_OUTPUT_PER_1M / LLM_PRICE_CURRENCY.
 */
export function readPricing(env: NodeJS.ProcessEnv = process.env): Pricing {
  const inputPer1M = Number(env.LLM_PRICE_INPUT_PER_1M ?? 2.5);
  const outputPer1M = Number(env.LLM_PRICE_OUTPUT_PER_1M ?? 10);
  return {
    inputPer1M: Number.isFinite(inputPer1M) ? inputPer1M : 0,
    outputPer1M: Number.isFinite(outputPer1M) ? outputPer1M : 0,
    currency: env.LLM_PRICE_CURRENCY ?? 'USD',
  };
}

/** Estimated cost (in pricing.currency) for a given token usage. */
export function estimateCost(usage: Pick<UsageTotals, 'promptTokens' | 'completionTokens'> | undefined, pricing: Pricing): number {
  if (!usage) return 0;
  const cost =
    (usage.promptTokens / 1_000_000) * pricing.inputPer1M +
    (usage.completionTokens / 1_000_000) * pricing.outputPer1M;
  return Math.round(cost * 10_000) / 10_000;
}
