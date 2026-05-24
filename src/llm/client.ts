import OpenAI from 'openai';

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

export interface LlmClientConfig {
  baseURL?: string;
  apiKey: string;
  model: string;
  reasoningEffort?: ReasoningEffort;
}

export function readLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmClientConfig {
  const baseURL = env.LITELLM_BASE_URL;
  const apiKey = env.LITELLM_API_KEY ?? env.OPENAI_API_KEY;
  const model = env.LITELLM_MODEL ?? env.OPENAI_MODEL ?? 'gpt-4o';
  const raw = env.OPENAI_REASONING_EFFORT?.toLowerCase();
  const reasoningEffort = (['minimal', 'low', 'medium', 'high'] as const).includes(raw as ReasoningEffort)
    ? (raw as ReasoningEffort)
    : undefined;
  if (!apiKey) throw new Error('LITELLM_API_KEY or OPENAI_API_KEY is required');
  return { baseURL, apiKey, model, reasoningEffort };
}

export function createLlmClient(cfg: LlmClientConfig): OpenAI {
  return new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey });
}
