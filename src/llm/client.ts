import OpenAI from 'openai';

export interface LlmClientConfig {
  baseURL?: string;
  apiKey: string;
  model: string;
}

export function readLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmClientConfig {
  const baseURL = env.LITELLM_BASE_URL;
  const apiKey = env.LITELLM_API_KEY ?? env.OPENAI_API_KEY;
  const model = env.LITELLM_MODEL ?? env.OPENAI_MODEL ?? 'gpt-4o';
  if (!apiKey) throw new Error('LITELLM_API_KEY or OPENAI_API_KEY is required');
  return { baseURL, apiKey, model };
}

export function createLlmClient(cfg: LlmClientConfig): OpenAI {
  return new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey });
}
