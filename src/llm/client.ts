import OpenAI from 'openai';

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

export interface AgentModels {
  research: string;
  researchReview: string;
  plan: string;
  planReview: string;
  designPlan: string;
  designReview: string;
  htmlRender: string;
  qualityReview: string;
  editorialReview: string;
  dynamic: string;
}

export interface LlmClientConfig {
  baseURL?: string;
  apiKey: string;
  model: string;
  reasoningEffort?: ReasoningEffort;
  models: AgentModels;
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
  const m = (key: string) => env[key] ?? model;
  const models: AgentModels = {
    research:        m('MODEL_RESEARCH'),
    researchReview:  m('MODEL_RESEARCH_REVIEW'),
    plan:            m('MODEL_PLAN'),
    planReview:      m('MODEL_PLAN_REVIEW'),
    designPlan:      m('MODEL_DESIGN_PLAN'),
    designReview:    m('MODEL_DESIGN_REVIEW'),
    htmlRender:      m('MODEL_HTML_RENDER'),
    qualityReview:   m('MODEL_QUALITY_REVIEW'),
    editorialReview: m('MODEL_EDITORIAL_REVIEW'),
    dynamic:         m('MODEL_DYNAMIC'),
  };
  return { baseURL, apiKey, model, reasoningEffort, models };
}

export function createLlmClient(cfg: LlmClientConfig): OpenAI {
  return new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey });
}
