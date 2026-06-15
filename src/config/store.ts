import fs from 'node:fs';
import path from 'node:path';
import type { AgentModels, ReasoningEffort } from '@/llm/client';

export interface StoredConfig {
  baseURL?: string;
  apiKey?: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  models?: Partial<AgentModels>;
}

function configFile() {
  return process.env.APP_CONFIG_FILE ?? path.resolve(process.cwd(), 'data', 'config.json');
}

export function readStoredConfig(file: string = configFile()): StoredConfig {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as StoredConfig;
  } catch {
    return {};
  }
}

export function writeStoredConfig(patch: StoredConfig, file: string = configFile()): StoredConfig {
  const current = readStoredConfig(file);
  const merged: StoredConfig = { ...current, ...patch };
  if (patch.models) merged.models = { ...current.models, ...patch.models };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

export interface PublicConfig {
  baseURL?: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  models?: Partial<AgentModels>;
  hasApiKey: boolean;
  apiKeyLast4?: string;
}

export function toPublicConfig(stored: StoredConfig): PublicConfig {
  const { apiKey, ...rest } = stored;
  return {
    ...rest,
    hasApiKey: typeof apiKey === 'string' && apiKey.length > 0,
    apiKeyLast4: apiKey && apiKey.length >= 4 ? apiKey.slice(-4) : undefined,
  };
}
