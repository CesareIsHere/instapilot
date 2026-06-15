# White-Label Fase 1 — Config Backbone & API Key (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettere di configurare provider LLM, API key e modelli dalla UI (salvati in un file locale gitignorato), con precedenza config UI → env var → default, e l'API key mai esposta in lettura.

**Architecture:** Un *config store* (`src/config/store.ts`) persiste i valori impostati da UI in `data/config.json`. `readLlmConfig()` viene rifattorizzato per fondere `stored → env → default`. Due route (`GET/PUT /api/config`) leggono/scrivono la config; il GET restituisce una proiezione pubblica senza la key in chiaro (`hasApiKey` + ultime 4 cifre). Il frontend aggiunge i metodi `api.config` e una pagina `/settings`.

**Tech Stack:** TypeScript, Node `fs`, Express, Zod, Vitest, React + react-router.

Riferimento spec: `docs/superpowers/specs/2026-06-15-white-label-config-design.md` (Layer A, Settings UI sezione LLM).

---

### Task 1: Config store — read/write/merge

**Files:**
- Create: `src/config/store.ts`
- Test: `tests/unit/config/store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readStoredConfig, writeStoredConfig } from '@/config/store';

function tmpFile(): string {
  return path.join(os.tmpdir(), `cfg-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

describe('config store', () => {
  it('returns {} when the file does not exist', () => {
    expect(readStoredConfig('/does/not/exist.json')).toEqual({});
  });

  it('writes and reads back a patch', () => {
    const f = tmpFile();
    try {
      writeStoredConfig({ model: 'gpt-5.4', apiKey: 'sk-abc' }, f);
      expect(readStoredConfig(f)).toEqual({ model: 'gpt-5.4', apiKey: 'sk-abc' });
    } finally { fs.rmSync(f, { force: true }); }
  });

  it('merges a patch into existing config (shallow + models deep)', () => {
    const f = tmpFile();
    try {
      writeStoredConfig({ model: 'a', models: { research: 'r1' } }, f);
      const merged = writeStoredConfig({ baseURL: 'http://x', models: { plan: 'p1' } }, f);
      expect(merged).toEqual({ model: 'a', baseURL: 'http://x', models: { research: 'r1', plan: 'p1' } });
    } finally { fs.rmSync(f, { force: true }); }
  });

  it('returns {} on invalid JSON', () => {
    const f = tmpFile();
    try {
      fs.writeFileSync(f, 'not json');
      expect(readStoredConfig(f)).toEqual({});
    } finally { fs.rmSync(f, { force: true }); }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/config/store.test.ts`
Expected: FAIL — `Cannot find module '@/config/store'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/config/store.ts
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

const CONFIG_FILE = process.env.APP_CONFIG_FILE ?? path.resolve(process.cwd(), 'data', 'config.json');

export function readStoredConfig(file: string = CONFIG_FILE): StoredConfig {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as StoredConfig;
  } catch {
    return {};
  }
}

export function writeStoredConfig(patch: StoredConfig, file: string = CONFIG_FILE): StoredConfig {
  const current = readStoredConfig(file);
  const merged: StoredConfig = { ...current, ...patch };
  if (patch.models) merged.models = { ...current.models, ...patch.models };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/config/store.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config/store.ts tests/unit/config/store.test.ts
git commit -m "feat(config): persistent config store with merge semantics"
```

---

### Task 2: Public projection (hide the API key)

**Files:**
- Modify: `src/config/store.ts`
- Test: `tests/unit/config/store.test.ts`

- [ ] **Step 1: Add the failing test (append to the existing describe block)**

```ts
import { toPublicConfig } from '@/config/store';

describe('toPublicConfig', () => {
  it('omits the raw apiKey and exposes hasApiKey + last4', () => {
    const pub = toPublicConfig({ model: 'm', apiKey: 'sk-secret1234' });
    expect(pub).not.toHaveProperty('apiKey');
    expect(pub.hasApiKey).toBe(true);
    expect(pub.apiKeyLast4).toBe('1234');
    expect(pub.model).toBe('m');
  });

  it('reports hasApiKey=false when no key is set', () => {
    const pub = toPublicConfig({ model: 'm' });
    expect(pub.hasApiKey).toBe(false);
    expect(pub.apiKeyLast4).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/config/store.test.ts`
Expected: FAIL — `toPublicConfig is not a function`.

- [ ] **Step 3: Implement `toPublicConfig`**

```ts
// append to src/config/store.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/config/store.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config/store.ts tests/unit/config/store.test.ts
git commit -m "feat(config): public projection that hides the API key"
```

---

### Task 3: Refactor `readLlmConfig` to merge stored → env → default

**Files:**
- Modify: `src/llm/client.ts:26-49`
- Test: `tests/unit/llm/client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/llm/client.test.ts
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
    const env = { ...baseEnv, OPENAI_MODEL: 'env-model' } as NodeJS.ProcessEnv;
    const cfg = readLlmConfig(env, {});
    expect(cfg.model).toBe('env-model');
    expect(cfg.apiKey).toBe('env-key');
  });

  it('per-agent model: stored > env > global model', () => {
    const env = { ...baseEnv, MODEL_RESEARCH: 'env-research' } as NodeJS.ProcessEnv;
    const cfg = readLlmConfig(env, { model: 'g', models: { plan: 'stored-plan' } });
    expect(cfg.models.research).toBe('env-research'); // from env
    expect(cfg.models.plan).toBe('stored-plan');      // from stored
    expect(cfg.models.designPlan).toBe('g');          // global fallback
  });

  it('throws when no api key anywhere', () => {
    expect(() => readLlmConfig({} as NodeJS.ProcessEnv, {})).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/llm/client.test.ts`
Expected: FAIL — `readLlmConfig` ignores the 2nd argument (stored), so `cfg.model` is `'gpt-4o'` not `'stored-model'`.

- [ ] **Step 3: Implement the merge**

Replace the body of `readLlmConfig` in `src/llm/client.ts` with:

```ts
import type { StoredConfig } from '@/config/store';
import { readStoredConfig } from '@/config/store';

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
```

Note: `StoredConfig` is imported as a *type* and `readStoredConfig` as a value — the cycle is type-only on the store side (store imports `AgentModels`/`ReasoningEffort` as types), so there is no runtime import cycle.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/llm/client.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full suite to check nothing regressed**

Run: `npx vitest run`
Expected: PASS (no regressions in existing tests that call `readLlmConfig()` with no args — default `stored` is read from disk, which is `{}` when `data/config.json` is absent).

- [ ] **Step 6: Commit**

```bash
git add src/llm/client.ts tests/unit/llm/client.test.ts
git commit -m "feat(config): readLlmConfig merges stored config over env over defaults"
```

---

### Task 4: `GET/PUT /api/config` routes (key write-only)

**Files:**
- Create: `src/server/config.ts`
- Test: `tests/integration/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/config.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { mountConfigRoutes } from '@/server/config';

const f = path.join(os.tmpdir(), `cfg-int-${Date.now()}.json`);
process.env.APP_CONFIG_FILE = f;

function app() {
  const a = express();
  a.use(express.json());
  mountConfigRoutes(a);
  return a;
}

afterEach(() => fs.rmSync(f, { force: true }));

describe('config routes', () => {
  it('PUT saves and GET never returns the raw apiKey', async () => {
    const a = app();
    await request(a).put('/api/config').send({ apiKey: 'sk-topsecret99', model: 'gpt-5.4' }).expect(200);

    const get = await request(a).get('/api/config').expect(200);
    expect(get.body).not.toHaveProperty('apiKey');
    expect(get.body.hasApiKey).toBe(true);
    expect(get.body.apiKeyLast4).toBe('et99');
    expect(get.body.model).toBe('gpt-5.4');

    // The key is persisted on disk (so the engine can use it) but not exposed via GET.
    expect(JSON.parse(fs.readFileSync(f, 'utf8')).apiKey).toBe('sk-topsecret99');
  });

  it('rejects unknown fields', async () => {
    const a = app();
    await request(a).put('/api/config').send({ nope: 1 }).expect(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/config.test.ts`
Expected: FAIL — `Cannot find module '@/server/config'`.

> If `supertest` is not installed, add it first: `npm i -D supertest @types/supertest` (it is the standard pattern used elsewhere in `tests/integration/`; verify with `npx vitest run tests/integration` before assuming it is missing).

- [ ] **Step 3: Implement the routes**

```ts
// src/server/config.ts
import type { Express, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { readStoredConfig, writeStoredConfig, toPublicConfig } from '@/config/store';
import { log } from '@/lib/log';

const ConfigPatchSchema = z
  .object({
    baseURL: z.string().max(500).optional(),
    apiKey: z.string().max(500).optional(),
    model: z.string().max(120).optional(),
    reasoningEffort: z.enum(['minimal', 'low', 'medium', 'high']).optional(),
    models: z.record(z.string(), z.string().max(120)).optional(),
  })
  .strict();

export function mountConfigRoutes(app: Express): void {
  app.get('/api/config', (_req, res) => {
    res.json(toPublicConfig(readStoredConfig()));
  });

  app.put('/api/config', (req: Request, res: Response, next: NextFunction) => {
    try {
      const patch = ConfigPatchSchema.parse(req.body ?? {});
      const merged = writeStoredConfig(patch);
      log.info('config.saved', { hasApiKey: Boolean(merged.apiKey), model: merged.model });
      res.json(toPublicConfig(merged));
    } catch (err) {
      next(err);
    }
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/config.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/config.ts tests/integration/config.test.ts
git commit -m "feat(config): GET/PUT /api/config with write-only API key"
```

---

### Task 5: Mount the config routes

**Files:**
- Modify: `src/server/index.ts:6-9,38-45`

- [ ] **Step 1: Add the import and the mount call**

In `src/server/index.ts`, add the import next to the other route imports:

```ts
import { mountConfigRoutes } from './config';
```

And add the mount call alongside the others (after `mountBrandRoutes(app);`):

```ts
  mountConfigRoutes(app);
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/index.ts
git commit -m "feat(config): mount config routes in the server"
```

---

### Task 6: Gitignore the local config/secrets

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Append the ignore rules**

Add to `.gitignore` (skip any line already present):

```
# Local runtime config & secrets (white-label)
/data/
```

- [ ] **Step 2: Verify the file is ignored**

Run: `git check-ignore data/config.json`
Expected output: `data/config.json`

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore local data/ (config + secrets)"
```

---

### Task 7: Frontend API client — `api.config`

**Files:**
- Modify: `web/src/lib/api.ts` (add a `config` block to the exported `api` object, near the `brand` block at line ~118)

- [ ] **Step 1: Add the types and client methods**

Add this interface near the other exported interfaces:

```ts
export interface PublicConfig {
  baseURL?: string;
  model?: string;
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  models?: Record<string, string>;
  hasApiKey: boolean;
  apiKeyLast4?: string;
}

export interface ConfigPatch {
  baseURL?: string;
  apiKey?: string;
  model?: string;
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  models?: Record<string, string>;
}
```

Add this block inside the `api` object (sibling of `brand`):

```ts
  config: {
    get: () => apiFetch<PublicConfig>('/api/config'),
    save: (patch: ConfigPatch) =>
      apiFetch<PublicConfig>('/api/config', { method: 'PUT', body: JSON.stringify(patch) }),
  },
```

- [ ] **Step 2: Type-check the web app**

Run: `npx tsc --noEmit -p web/tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/api.ts
git commit -m "feat(web): api.config client methods"
```

---

### Task 8: Settings page (LLM connection)

**Files:**
- Create: `web/src/pages/Settings.tsx`
- Modify: `web/src/App.tsx:9,21` (import + route)

- [ ] **Step 1: Create the page**

```tsx
// web/src/pages/Settings.tsx
import { useEffect, useState } from 'react';
import { Loader2, Save, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { api, type PublicConfig } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

export function Settings() {
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [baseURL, setBaseURL] = useState('');
  const [model, setModel] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.config.get().then(c => {
      setCfg(c);
      setBaseURL(c.baseURL ?? '');
      setModel(c.model ?? '');
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.config.save({
        baseURL: baseURL.trim() || undefined,
        model: model.trim() || undefined,
        // Only send the key when the user typed a new one — keeps the stored key intact otherwise.
        apiKey: apiKey.trim() || undefined,
      });
      setCfg(updated);
      setApiKey('');
      toast.success('Configurazione salvata');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Impostazioni</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connessione al provider LLM. Salvata in locale, mai inviata altrove.
        </p>
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="apiKey" className="flex items-center gap-1.5">
            <KeyRound size={14} /> API key
          </Label>
          <Input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={cfg?.hasApiKey ? `•••• ${cfg.apiKeyLast4 ?? ''}` : 'sk-…'}
          />
          <p className="text-xs text-muted-foreground">
            {cfg?.hasApiKey
              ? 'Una key è già salvata. Inserisci un nuovo valore solo per sostituirla.'
              : 'Nessuna key salvata: incollala per poter generare.'}
          </p>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="baseURL">Base URL (opzionale)</Label>
          <Input id="baseURL" value={baseURL} onChange={e => setBaseURL(e.target.value)}
            placeholder="https://api.openai.com/v1 o il tuo proxy" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="model">Modello di default</Label>
          <Input id="model" value={model} onChange={e => setModel(e.target.value)}
            placeholder="es. gpt-5.4" />
        </div>

        <Button onClick={save} disabled={saving} size="lg" className="font-semibold">
          {saving ? <><Loader2 size={16} className="animate-spin" /> Salvataggio…</> : <><Save size={16} /> Salva</>}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the route**

In `web/src/App.tsx`, add the import next to the other page imports:

```tsx
import { Settings } from '@/pages/Settings';
```

And add the route inside `<Routes>`:

```tsx
            <Route path="/settings" element={<Settings />} />
```

- [ ] **Step 3: Type-check the web app**

Run: `npx tsc --noEmit -p web/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Manual smoke (optional but recommended)**

Run the dev server, open `/settings`, paste a dummy key, save, reload. Expected: the field shows the masked placeholder `•••• <last4>` and `hasApiKey` is true.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/Settings.tsx web/src/App.tsx
git commit -m "feat(web): settings page for LLM connection & API key"
```

> Nav link: aggiungere una voce "Impostazioni" alla sidebar segue il pattern esistente del componente di layout. Viene gestito nella Fase 3 (onboarding) insieme al wizard di primo avvio; in Fase 1 la pagina è raggiungibile via `/settings`.

---

## Self-review notes

- **Spec coverage (Layer A + Settings UI sezione LLM):** config store (T1), key write-only (T2, T4), precedenza stored→env→default (T3), route (T4-T5), gitignore secrets (T6), UI (T7-T8). Onboarding wizard e brand strutturale sono fuori da questa fase (Fasi 3 e 2).
- **Type consistency:** `StoredConfig`/`PublicConfig`/`ConfigPatchSchema` usano gli stessi campi (`baseURL`, `apiKey`, `model`, `reasoningEffort`, `models`); `readStoredConfig`/`writeStoredConfig`/`toPublicConfig` usati con firme coerenti in T3-T4. `AgentModels`/`ReasoningEffort` importati come tipi da `@/llm/client`.
- **No placeholder:** ogni step di codice mostra il codice completo; l'unica nota aperta (nav link) è esplicitamente rimandata alla Fase 3, non un TODO silenzioso.
