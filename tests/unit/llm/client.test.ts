import { describe, it, expect } from 'vitest';
import { readLlmConfig } from '@/llm/client';

const baseEnv = { OPENAI_API_KEY: 'env-key' } as unknown as NodeJS.ProcessEnv;

describe('readLlmConfig precedence', () => {
  it('uses stored values over env', () => {
    const cfg = readLlmConfig(baseEnv, { model: 'stored-model', apiKey: 'stored-key' });
    expect(cfg.model).toBe('stored-model');
    expect(cfg.apiKey).toBe('stored-key');
  });

  it('falls back to env when stored is empty', () => {
    const env = { ...baseEnv, OPENAI_MODEL: 'env-model' } as unknown as NodeJS.ProcessEnv;
    const cfg = readLlmConfig(env, {});
    expect(cfg.model).toBe('env-model');
    expect(cfg.apiKey).toBe('env-key');
  });

  it('per-agent model: stored > env > global model', () => {
    const env = { ...baseEnv, MODEL_RESEARCH: 'env-research' } as unknown as NodeJS.ProcessEnv;
    const cfg = readLlmConfig(env, { model: 'g', models: { plan: 'stored-plan' } });
    expect(cfg.models.research).toBe('env-research'); // from env
    expect(cfg.models.plan).toBe('stored-plan');      // from stored
    expect(cfg.models.designPlan).toBe('g');          // global fallback
  });

  it('throws when no api key anywhere', () => {
    expect(() => readLlmConfig({} as NodeJS.ProcessEnv, {})).toThrow();
  });
});
