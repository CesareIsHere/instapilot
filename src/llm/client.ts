import OpenAI from 'openai';
import type { StoredConfig } from '@/config/store';
import { readStoredConfig } from '@/config/store';

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

export function readLlmConfig(
  env: NodeJS.ProcessEnv = process.env,
  stored: StoredConfig = readStoredConfig(),
): LlmClientConfig {
  const baseURL = stored.baseURL ?? env.LITELLM_BASE_URL;
  const apiKey = stored.apiKey ?? env.LITELLM_API_KEY ?? env.OPENAI_API_KEY;
  const model = stored.model ?? env.LITELLM_MODEL ?? env.OPENAI_MODEL ?? 'gpt-4o';
  const raw = env.OPENAI_REASONING_EFFORT?.toLowerCase();
  const envEffort = (['minimal', 'low', 'medium', 'high'] as const).includes(raw as ReasoningEffort)
    ? (raw as ReasoningEffort)
    : undefined;
  const reasoningEffort = stored.reasoningEffort ?? envEffort;
  if (!apiKey) throw new Error('API key is required (set it in Settings or via OPENAI_API_KEY)');
  const m = (key: string, agent: keyof AgentModels) => stored.models?.[agent] ?? env[key] ?? model;
  const models: AgentModels = {
    research:        m('MODEL_RESEARCH', 'research'),
    researchReview:  m('MODEL_RESEARCH_REVIEW', 'researchReview'),
    plan:            m('MODEL_PLAN', 'plan'),
    planReview:      m('MODEL_PLAN_REVIEW', 'planReview'),
    designPlan:      m('MODEL_DESIGN_PLAN', 'designPlan'),
    designReview:    m('MODEL_DESIGN_REVIEW', 'designReview'),
    htmlRender:      m('MODEL_HTML_RENDER', 'htmlRender'),
    qualityReview:   m('MODEL_QUALITY_REVIEW', 'qualityReview'),
    editorialReview: m('MODEL_EDITORIAL_REVIEW', 'editorialReview'),
    dynamic:         m('MODEL_DYNAMIC', 'dynamic'),
  };
  return { baseURL, apiKey, model, reasoningEffort, models };
}

export function createLlmClient(cfg: LlmClientConfig): OpenAI {
  return new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey });
}
