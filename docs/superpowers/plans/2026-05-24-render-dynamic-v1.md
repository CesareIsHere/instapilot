# Render Dynamic v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere endpoint `POST /render/dynamic` che usa un LLM (via litellm proxy con SDK `openai`) per generare codice Remotion TSX, lo compila con sucrase dentro Chromium e lo renderizza in una composition `DynamicSlide` registrata nel bundle persistente.

**Architecture:** Bundle Remotion già esistente, esteso con una nuova composition interprete (`DynamicSlide`) che accetta `tsxCode` come inputProp, lo compila a runtime con `sucrase`, lo esegue con `new Function()` iniettando sandbox controllato (React, Remotion APIs, theme, assets, primitive). LLM via `openai` SDK puntato a litellm endpoint, structured output con `response_format: json_schema` validato post-risposta con Zod.

**Tech Stack:** Aggiunge a v1: `openai` (SDK Node), `sucrase` (TSX→JS compile). Riusa: `zod`, `zod-to-json-schema`, `@remotion/*`, `express`.

**Spec di riferimento:** `docs/superpowers/specs/2026-05-24-render-dynamic-v1-design.md`

---

## File map

**Create:**
- `src/llm/client.ts`, `src/llm/schema.ts`, `src/llm/brandContext.ts`, `src/llm/systemPrompt.ts`, `src/llm/generate.ts`
- `src/dynamic/compile.ts`, `src/dynamic/sandbox.ts`, `src/dynamic/DynamicSlide.tsx`
- `tests/unit/llm/{schema,brandContext,systemPrompt,generate}.test.ts`
- `tests/unit/dynamic/{compile,sandbox}.test.ts`
- `tests/integration/renderDynamic.test.ts`
- `examples/dynamic-prompt.json`

**Modify:**
- `src/remotion/Root.tsx` — registrare composition `DynamicSlide`
- `src/server/routes.ts` — aggiungere `mountDynamicRoutes`
- `src/server/index.ts` — mount nuova route
- `src/server/errors.ts` — gestire codici `LLM_FAILURE` e `INVALID_CODE`
- `.env.example` — variabili LITELLM_*
- `package.json` — deps `openai`, `sucrase`
- `README.md` — documentare nuovo endpoint

Ogni file ha responsabilità singola: `client` solo wiring SDK, `schema` solo Zod, `brandContext` solo I/O brand file, `systemPrompt` solo composizione testo, `generate` orchestratore. Lo stesso pattern dentro `dynamic/`: `compile` solo sucrase, `sandbox` solo costruzione globali, `DynamicSlide` solo composition.

---

## Prerequisiti non-codice

Prima del Task 14 (smoke test reale) l'utente deve avere:
- Un litellm proxy in esecuzione (es. `http://localhost:4000`) configurato con almeno il modello `claude-sonnet-4-6`
- API key valida per quel proxy

Il proxy può essere avviato con `pip install litellm && litellm --model claude-sonnet-4-6 --api_key ...` oppure via Docker. Setup fuori scope del piano.

---

## Task 1 — Dipendenze

**Files:**
- Modify: `package.json` (auto via npm)

- [ ] **Step 1: Installare openai e sucrase**

Run:
```bash
npm install openai sucrase
```

Atteso: `openai` (~ versione 4.x) e `sucrase` (~ 3.x) aggiunti a `dependencies`.

- [ ] **Step 2: Verificare build TS**

Run:
```bash
npm run build
```

Atteso: nessun errore (le librerie portano tipi propri).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add openai and sucrase for dynamic render mode"
```

---

## Task 2 — Variabili d'ambiente

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Aggiungere variabili LITELLM al template**

Modifica `.env.example` aggiungendo in fondo:

```
# Dynamic render mode
LITELLM_BASE_URL=http://localhost:4000
LITELLM_API_KEY=sk-changeme
LITELLM_MODEL=claude-sonnet-4-6
BRAND_CONTEXT_FILE=docs/brand-context.example.md
DYNAMIC_RENDER_ENABLED=true
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore(env): add LITELLM_* and BRAND_CONTEXT_FILE env vars"
```

---

## Task 3 — Schema Zod risposta LLM

**Files:**
- Create: `src/llm/schema.ts`
- Test: `tests/unit/llm/schema.test.ts`

- [ ] **Step 1: Scrivere il test fallente**

Crea `tests/unit/llm/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GeneratedSlideSchema } from '@/llm/schema';

describe('GeneratedSlideSchema', () => {
  it('accepts valid response', () => {
    const r = GeneratedSlideSchema.safeParse({
      intent: 'Titolo + sottotitolo brand-navy',
      code: 'const Slide = () => null;',
    });
    expect(r.success).toBe(true);
  });

  it('rejects missing intent', () => {
    const r = GeneratedSlideSchema.safeParse({ code: 'x' });
    expect(r.success).toBe(false);
  });

  it('rejects empty code', () => {
    const r = GeneratedSlideSchema.safeParse({ intent: 'x', code: '' });
    expect(r.success).toBe(false);
  });

  it('rejects empty intent', () => {
    const r = GeneratedSlideSchema.safeParse({ intent: '', code: 'x' });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Eseguire test (deve fallire)**

Run: `npx vitest run tests/unit/llm/schema.test.ts`
Atteso: FAIL `Cannot find module '@/llm/schema'`.

- [ ] **Step 3: Implementare schema**

Crea `src/llm/schema.ts`:

```ts
import { z } from 'zod';

export const GeneratedSlideSchema = z.object({
  intent: z.string().min(1),
  code: z.string().min(1).max(100_000),
});

export type GeneratedSlide = z.infer<typeof GeneratedSlideSchema>;
```

- [ ] **Step 4: Eseguire test (deve passare)**

Run: `npx vitest run tests/unit/llm/schema.test.ts`
Atteso: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add src/llm/schema.ts tests/unit/llm/schema.test.ts
git commit -m "feat(llm): add GeneratedSlide Zod schema"
```

---

## Task 4 — Brand context loader

**Files:**
- Create: `src/llm/brandContext.ts`
- Test: `tests/unit/llm/brandContext.test.ts`

- [ ] **Step 1: Scrivere il test fallente**

Crea `tests/unit/llm/brandContext.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadBrandContext } from '@/llm/brandContext';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('loadBrandContext', () => {
  it('reads markdown file from path and returns its content', () => {
    const tmp = path.join(os.tmpdir(), `brand-${Date.now()}.md`);
    fs.writeFileSync(tmp, '# Test Brand\n\nVoice: serio.');
    try {
      const result = loadBrandContext(tmp);
      expect(result).toContain('Test Brand');
      expect(result).toContain('Voice: serio');
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('returns a default fallback when path is missing', () => {
    const result = loadBrandContext('/does/not/exist.md');
    expect(result).toContain('Brand context unavailable');
  });

  it('truncates files larger than 8000 chars', () => {
    const tmp = path.join(os.tmpdir(), `brand-large-${Date.now()}.md`);
    fs.writeFileSync(tmp, 'x'.repeat(10_000));
    try {
      const result = loadBrandContext(tmp);
      expect(result.length).toBeLessThanOrEqual(8200);
      expect(result).toContain('truncated');
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});
```

- [ ] **Step 2: Eseguire test (deve fallire)**

Run: `npx vitest run tests/unit/llm/brandContext.test.ts`
Atteso: FAIL.

- [ ] **Step 3: Implementare loader**

Crea `src/llm/brandContext.ts`:

```ts
import fs from 'node:fs';

const MAX_CHARS = 8000;

export function loadBrandContext(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.length > MAX_CHARS) {
      return content.slice(0, MAX_CHARS) + '\n\n[...truncated for token budget]';
    }
    return content;
  } catch {
    return 'Brand context unavailable: file not found or unreadable.';
  }
}
```

- [ ] **Step 4: Eseguire test (deve passare)**

Run: `npx vitest run tests/unit/llm/brandContext.test.ts`
Atteso: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add src/llm/brandContext.ts tests/unit/llm/brandContext.test.ts
git commit -m "feat(llm): add brand context loader with truncation and fallback"
```

---

## Task 5 — System prompt builder

**Files:**
- Create: `src/llm/systemPrompt.ts`
- Test: `tests/unit/llm/systemPrompt.test.ts`

- [ ] **Step 1: Scrivere il test fallente**

Crea `tests/unit/llm/systemPrompt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '@/llm/systemPrompt';

describe('buildSystemPrompt', () => {
  const brand = '# Acme\n\nVoice: rigoroso.';

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
```

- [ ] **Step 2: Eseguire test (deve fallire)**

Run: `npx vitest run tests/unit/llm/systemPrompt.test.ts`
Atteso: FAIL.

- [ ] **Step 3: Implementare builder**

Crea `src/llm/systemPrompt.ts`:

```ts
export function buildSystemPrompt(brandContext: string): string {
  return `You generate Remotion TSX code for a single still frame (1080x1350 portrait).
Your output is compiled with sucrase inside Chromium and evaluated in a sandboxed context.

# REMOTION RULES

- The canvas is 1080 wide x 1350 tall, rendered as a single still (no animation needed).
- Use absolute positioning via the AbsoluteFill component for layers.
- All text and shapes must be inline-styled. No external CSS files.
- Do NOT use browser APIs that require interactivity (window events, timers).
- Do NOT use useCurrentFrame for animation — this is a still render at frame 0.
- For images, use Remotion's <Img src={...} /> with a URL from the assets map.

# SANDBOX API

Your code runs inside a new Function() with these injected parameters (NO IMPORTS ALLOWED):

- React: full React (hooks, createElement, Fragment, useState, useEffect, etc.)
- Remotion: { AbsoluteFill, Img, Video, Audio, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Series, Easing }
- theme: brand tokens, shape:
    {
      colors: { 'brand-navy': '#...', 'brand-gold': '#...', 'paper': '#...', 'ink': '#...', 'muted': '#...' },
      typography: { fontFamily: 'Plus Jakarta Sans, sans-serif', sizes: { sm, md, lg, xl }, weights: { regular, semibold, bold }, lineHeight },
      spacing: { xs: 8, sm: 16, md: 24, lg: 40, xl: 64, '2xl': 96 }
    }
- assets: map of assetId -> URL ready for <Img src={...}>. Available IDs: 'logo', 'money-time-flow'.
- primitives: { Headline, RichText, Illustration, Footer } — pre-built brand-safe components, OPTIONAL. Use only if they fit your design; you may write your own JSX instead.

# OUTPUT CONTRACT

You MUST declare a top-level const named Slide that is a React functional component:

    const Slide = () => {
      const { AbsoluteFill } = Remotion;
      return (
        <AbsoluteFill style={{ backgroundColor: theme.colors.paper }}>
          {/* your content */}
        </AbsoluteFill>
      );
    };

Rules:
- No import or require statements. Use only the injected sandbox globals.
- No top-level await, no top-level await inside Slide.
- Slide must return a single React element.
- Stay within the 1080x1350 canvas, no overflow.
- Apply brand identity from theme tokens (colors, font, spacing).

# BRAND CONTEXT

${brandContext}

# RESPONSE FORMAT

You will respond with structured JSON matching the GeneratedSlide schema:
- intent: 1-2 sentence summary of what you are designing and why
- code: the full TSX source code, ending with the Slide const definition

Do NOT wrap the code in markdown fences. Do NOT add explanations outside the JSON.
`;
}
```

- [ ] **Step 4: Eseguire test (deve passare)**

Run: `npx vitest run tests/unit/llm/systemPrompt.test.ts`
Atteso: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add src/llm/systemPrompt.ts tests/unit/llm/systemPrompt.test.ts
git commit -m "feat(llm): add system prompt builder with Remotion rules + sandbox API + brand"
```

---

## Task 6 — Client litellm (openai SDK)

**Files:**
- Create: `src/llm/client.ts`

Questo task non ha test diretto (è puro wiring SDK + lettura env). Sarà coperto indirettamente dai test di `generate.ts` (Task 7) tramite mock.

- [ ] **Step 1: Implementare client factory**

Crea `src/llm/client.ts`:

```ts
import OpenAI from 'openai';

export interface LlmClientConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

export function readLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmClientConfig {
  const baseURL = env.LITELLM_BASE_URL;
  const apiKey = env.LITELLM_API_KEY;
  const model = env.LITELLM_MODEL ?? 'claude-sonnet-4-6';
  if (!baseURL) throw new Error('LITELLM_BASE_URL is required');
  if (!apiKey) throw new Error('LITELLM_API_KEY is required');
  return { baseURL, apiKey, model };
}

export function createLlmClient(cfg: LlmClientConfig): OpenAI {
  return new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey });
}
```

- [ ] **Step 2: Verificare build**

Run: `npm run build`
Atteso: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/llm/client.ts
git commit -m "feat(llm): add litellm client factory using openai SDK"
```

---

## Task 7 — Generate function (LLM orchestration)

**Files:**
- Create: `src/llm/generate.ts`
- Test: `tests/unit/llm/generate.test.ts`

- [ ] **Step 1: Scrivere il test fallente con mock**

Crea `tests/unit/llm/generate.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { generateSlideCode } from '@/llm/generate';

function makeMockClient(content: string) {
  return {
    chat: {
      completions: {
        create: vi.fn(async () => ({
          choices: [{ message: { content } }],
        })),
      },
    },
  } as unknown as Parameters<typeof generateSlideCode>[0]['client'];
}

describe('generateSlideCode', () => {
  it('returns parsed GeneratedSlide on valid LLM response', async () => {
    const json = JSON.stringify({ intent: 'titolo', code: 'const Slide = () => null;' });
    const client = makeMockClient(json);
    const result = await generateSlideCode({
      client, model: 'm', systemPrompt: 'sys', userPrompt: 'usr',
    });
    expect(result.intent).toBe('titolo');
    expect(result.code).toContain('const Slide');
  });

  it('throws when LLM returns invalid JSON', async () => {
    const client = makeMockClient('not-json');
    await expect(generateSlideCode({
      client, model: 'm', systemPrompt: 's', userPrompt: 'u',
    })).rejects.toThrow(/llm_invalid_response/);
  });

  it('throws when response missing required fields', async () => {
    const client = makeMockClient(JSON.stringify({ intent: 'x' }));
    await expect(generateSlideCode({
      client, model: 'm', systemPrompt: 's', userPrompt: 'u',
    })).rejects.toThrow(/llm_invalid_response/);
  });

  it('throws when message content is null', async () => {
    const client = { chat: { completions: { create: vi.fn(async () => ({
      choices: [{ message: { content: null } }],
    })) } } } as unknown as Parameters<typeof generateSlideCode>[0]['client'];
    await expect(generateSlideCode({
      client, model: 'm', systemPrompt: 's', userPrompt: 'u',
    })).rejects.toThrow(/llm_empty_response/);
  });
});
```

- [ ] **Step 2: Eseguire test (deve fallire)**

Run: `npx vitest run tests/unit/llm/generate.test.ts`
Atteso: FAIL.

- [ ] **Step 3: Implementare generate**

Crea `src/llm/generate.ts`:

```ts
import type OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { GeneratedSlideSchema, type GeneratedSlide } from './schema';

export interface GenerateArgs {
  client: OpenAI;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}

export async function generateSlideCode(args: GenerateArgs): Promise<GeneratedSlide> {
  const { client, model, systemPrompt, userPrompt } = args;
  const jsonSchema = zodToJsonSchema(GeneratedSlideSchema, 'GeneratedSlide');

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'GeneratedSlide', strict: true, schema: jsonSchema as Record<string, unknown> },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('llm_empty_response: no content in LLM response');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('llm_invalid_response: not valid JSON');
  }

  const result = GeneratedSlideSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`llm_invalid_response: schema mismatch — ${result.error.message}`);
  }
  return result.data;
}
```

- [ ] **Step 4: Eseguire test (deve passare)**

Run: `npx vitest run tests/unit/llm/generate.test.ts`
Atteso: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add src/llm/generate.ts tests/unit/llm/generate.test.ts
git commit -m "feat(llm): add generateSlideCode with structured output via json_schema"
```

---

## Task 8 — TSX compile wrapper (sucrase)

**Files:**
- Create: `src/dynamic/compile.ts`
- Test: `tests/unit/dynamic/compile.test.ts`

- [ ] **Step 1: Scrivere il test fallente**

Crea `tests/unit/dynamic/compile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { compileTsx, validateTsx } from '@/dynamic/compile';

describe('compileTsx', () => {
  it('transforms TSX to plain JS', () => {
    const out = compileTsx('const Slide = () => <div>Hi</div>;');
    expect(out).toContain('React.createElement');
    expect(out).not.toContain('<div>');
  });

  it('strips TypeScript type annotations', () => {
    const out = compileTsx('const Slide: React.FC = () => <div />;');
    expect(out).not.toContain(': React.FC');
  });
});

describe('validateTsx', () => {
  it('returns null for valid TSX', () => {
    expect(validateTsx('const Slide = () => <div />;')).toBeNull();
  });

  it('returns error message for malformed TSX', () => {
    const err = validateTsx('const Slide = () => <div;');
    expect(err).toBeTruthy();
    expect(typeof err).toBe('string');
  });
});
```

- [ ] **Step 2: Eseguire test (deve fallire)**

Run: `npx vitest run tests/unit/dynamic/compile.test.ts`
Atteso: FAIL.

- [ ] **Step 3: Implementare compile**

Crea `src/dynamic/compile.ts`:

```ts
import { transform } from 'sucrase';

export function compileTsx(tsxCode: string): string {
  const { code } = transform(tsxCode, {
    transforms: ['typescript', 'jsx'],
    production: true,
  });
  return code;
}

export function validateTsx(tsxCode: string): string | null {
  try {
    compileTsx(tsxCode);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
```

- [ ] **Step 4: Eseguire test (deve passare)**

Run: `npx vitest run tests/unit/dynamic/compile.test.ts`
Atteso: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add src/dynamic/compile.ts tests/unit/dynamic/compile.test.ts
git commit -m "feat(dynamic): add sucrase TSX compile wrapper with validator"
```

---

## Task 9 — Sandbox globals builder

**Files:**
- Create: `src/dynamic/sandbox.ts`
- Test: `tests/unit/dynamic/sandbox.test.ts`

- [ ] **Step 1: Scrivere il test fallente**

Crea `tests/unit/dynamic/sandbox.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildSandboxGlobals } from '@/dynamic/sandbox';
import { theme } from '@/theme';

describe('buildSandboxGlobals', () => {
  const assets = { 'logo': 'http://x/logo.svg' };

  it('exposes React with hooks', () => {
    const g = buildSandboxGlobals(theme, assets);
    expect(typeof g.React.createElement).toBe('function');
    expect(typeof g.React.useState).toBe('function');
  });

  it('exposes Remotion APIs', () => {
    const g = buildSandboxGlobals(theme, assets);
    expect(typeof g.Remotion.AbsoluteFill).toBe('function');
    expect(typeof g.Remotion.Img).toBe('function');
    expect(typeof g.Remotion.staticFile).toBe('function');
  });

  it('exposes the four primitives', () => {
    const g = buildSandboxGlobals(theme, assets);
    expect(typeof g.primitives.Headline).toBe('function');
    expect(typeof g.primitives.RichText).toBe('function');
    expect(typeof g.primitives.Illustration).toBe('function');
    expect(typeof g.primitives.Footer).toBe('function');
  });
});
```

- [ ] **Step 2: Eseguire test (deve fallire)**

Run: `npx vitest run tests/unit/dynamic/sandbox.test.ts`
Atteso: FAIL.

- [ ] **Step 3: Implementare sandbox**

Crea `src/dynamic/sandbox.ts`:

```ts
import * as React from 'react';
import {
  AbsoluteFill, Img, Video, Audio, staticFile,
  useCurrentFrame, useVideoConfig, interpolate, spring,
  Sequence, Series, Easing,
} from 'remotion';
import { Headline } from '@/primitives/Headline';
import { RichText } from '@/primitives/RichText';
import { Illustration } from '@/primitives/Illustration';
import { Footer } from '@/primitives/Footer';
import type { Theme } from '@/theme';

export interface SandboxGlobals {
  React: typeof React;
  Remotion: {
    AbsoluteFill: typeof AbsoluteFill;
    Img: typeof Img;
    Video: typeof Video;
    Audio: typeof Audio;
    staticFile: typeof staticFile;
    useCurrentFrame: typeof useCurrentFrame;
    useVideoConfig: typeof useVideoConfig;
    interpolate: typeof interpolate;
    spring: typeof spring;
    Sequence: typeof Sequence;
    Series: typeof Series;
    Easing: typeof Easing;
  };
  theme: Theme;
  assets: Record<string, string>;
  primitives: {
    Headline: typeof Headline;
    RichText: typeof RichText;
    Illustration: typeof Illustration;
    Footer: typeof Footer;
  };
}

export function buildSandboxGlobals(theme: Theme, assets: Record<string, string>): SandboxGlobals {
  return {
    React,
    Remotion: {
      AbsoluteFill, Img, Video, Audio, staticFile,
      useCurrentFrame, useVideoConfig, interpolate, spring,
      Sequence, Series, Easing,
    },
    theme,
    assets,
    primitives: { Headline, RichText, Illustration, Footer },
  };
}
```

- [ ] **Step 4: Eseguire test (deve passare)**

Run: `npx vitest run tests/unit/dynamic/sandbox.test.ts`
Atteso: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add src/dynamic/sandbox.ts tests/unit/dynamic/sandbox.test.ts
git commit -m "feat(dynamic): add sandbox globals builder exposing React/Remotion/theme/assets/primitives"
```

---

## Task 10 — Composition DynamicSlide

**Files:**
- Create: `src/dynamic/DynamicSlide.tsx`

Nessun test automatico per la composition (logica eval avviene dentro Chromium, coperta da integration test al Task 12 e dallo smoke test).

- [ ] **Step 1: Implementare composition**

Crea `src/dynamic/DynamicSlide.tsx`:

```tsx
import React from 'react';
import { AbsoluteFill, delayRender, continueRender, cancelRender } from 'remotion';
import { compileTsx } from './compile';
import { buildSandboxGlobals } from './sandbox';
import type { Theme } from '@/theme';
import { theme as defaultTheme } from '@/theme';

export interface DynamicSlideProps {
  tsxCode: string;
  theme: Theme;
  assets: Record<string, string>;
}

export const DynamicSlide: React.FC<DynamicSlideProps> = ({ tsxCode, theme, assets }) => {
  const [SlideComponent, setSlideComponent] = React.useState<React.ComponentType | null>(null);
  const handleRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (handleRef.current === null) {
      handleRef.current = delayRender('dynamic.compile');
    }
    try {
      const js = compileTsx(tsxCode);
      const factory = new Function(
        'React', 'Remotion', 'theme', 'assets', 'primitives',
        `"use strict";\n${js}\n;return Slide;`,
      );
      const globals = buildSandboxGlobals(theme, assets);
      const Comp = factory(
        globals.React, globals.Remotion, globals.theme, globals.assets, globals.primitives,
      );
      if (typeof Comp !== 'function') {
        throw new Error('dynamic.eval: generated code did not define a `Slide` function');
      }
      setSlideComponent(() => Comp as React.ComponentType);
      const h = handleRef.current;
      handleRef.current = null;
      continueRender(h);
    } catch (err) {
      cancelRender(err as Error);
    }
  }, [tsxCode, theme, assets]);

  if (!SlideComponent) return <AbsoluteFill />;
  return <SlideComponent />;
};

export const defaultDynamicProps: DynamicSlideProps = {
  tsxCode: 'const Slide = () => React.createElement("div", null, "placeholder");',
  theme: defaultTheme,
  assets: {},
};
```

- [ ] **Step 2: Verificare build**

Run: `npm run build`
Atteso: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/dynamic/DynamicSlide.tsx
git commit -m "feat(dynamic): add DynamicSlide composition with sucrase-eval interpreter"
```

---

## Task 11 — Registrare DynamicSlide nel Root

**Files:**
- Modify: `src/remotion/Root.tsx`

- [ ] **Step 1: Aggiungere import + composition**

Modifica `src/remotion/Root.tsx` rimpiazzando il contenuto con:

```tsx
import React from 'react';
import { Composition } from 'remotion';
import { Slide, defaultSlideProps } from './Slide';
import { SlideSpecSchema } from '@/schema/slideSpec';
import { DynamicSlide, defaultDynamicProps } from '@/dynamic/DynamicSlide';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Slide"
        component={Slide}
        width={1080}
        height={1350}
        fps={30}
        durationInFrames={1}
        defaultProps={defaultSlideProps}
        schema={SlideSpecSchema}
      />
      <Composition
        id="DynamicSlide"
        component={DynamicSlide}
        width={1080}
        height={1350}
        fps={30}
        durationInFrames={1}
        defaultProps={defaultDynamicProps}
      />
    </>
  );
};
```

- [ ] **Step 2: Verificare build**

Run: `npm run build`
Atteso: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/remotion/Root.tsx
git commit -m "feat(remotion): register DynamicSlide composition alongside Slide"
```

---

## Task 12 — Route POST /render/dynamic

**Files:**
- Modify: `src/server/routes.ts`
- Modify: `src/server/index.ts`
- Test: `tests/integration/renderDynamic.test.ts`

- [ ] **Step 1: Scrivere il test fallente (LLM e render entrambi mockati)**

Crea `tests/integration/renderDynamic.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('@/llm/generate', () => ({
  generateSlideCode: vi.fn(async (args: { userPrompt: string }) => {
    if (args.userPrompt === 'EMPTY') throw new Error('llm_empty_response: x');
    if (args.userPrompt === 'BADJSON') throw new Error('llm_invalid_response: x');
    return { intent: 'mock intent', code: 'const Slide = () => null;' };
  }),
}));
vi.mock('@/llm/client', () => ({
  readLlmConfig: vi.fn(() => ({ baseURL: 'http://mock', apiKey: 'k', model: 'm' })),
  createLlmClient: vi.fn(() => ({} as unknown)),
}));
vi.mock('@/lib/render', () => ({
  renderSlideStill: vi.fn(),
  renderDynamicStill: vi.fn(async () => ({ file: '/abs/output/Slide-dyn-mock.png', durationMs: 100 })),
  assertAssetsResolvable: vi.fn(),
}));

import { mountDynamicRoutes } from '@/server/routes';
import { errorHandler } from '@/server/errors';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.locals.serveUrl = 'http://mock';
  mountDynamicRoutes(app);
  app.use(errorHandler);
  return app;
}

describe('POST /render/dynamic', () => {
  it('returns 200 with file + intent + code on success', async () => {
    const res = await request(buildApp())
      .post('/render/dynamic')
      .send({ prompt: 'Crea slide titolo' });
    expect(res.status).toBe(200);
    expect(res.body.file).toBe('/abs/output/Slide-dyn-mock.png');
    expect(res.body.intent).toBe('mock intent');
    expect(res.body.code).toContain('const Slide');
    expect(typeof res.body.durationMs).toBe('number');
    expect(typeof res.body.llmDurationMs).toBe('number');
    expect(typeof res.body.renderDurationMs).toBe('number');
  });

  it('returns 400 when prompt is missing', async () => {
    const res = await request(buildApp()).post('/render/dynamic').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation');
  });

  it('returns 500 with llm_failure when LLM throws', async () => {
    const res = await request(buildApp())
      .post('/render/dynamic')
      .send({ prompt: 'EMPTY' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('llm_failure');
  });

  it('returns 422 invalid_code when generated TSX does not parse', async () => {
    const { generateSlideCode } = await import('@/llm/generate');
    (generateSlideCode as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      intent: 'broken', code: 'const Slide = () => <div;',
    });
    const res = await request(buildApp())
      .post('/render/dynamic')
      .send({ prompt: 'broken' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('invalid_code');
  });
});
```

- [ ] **Step 2: Eseguire test (deve fallire)**

Run: `npx vitest run tests/integration/renderDynamic.test.ts`
Atteso: FAIL.

- [ ] **Step 3: Aggiungere `renderDynamicStill` in src/lib/render.ts**

Modifica `src/lib/render.ts`:

1. Aggiorna l'import esistente da `@/assets` (attualmente `import { assetExists } from '@/assets';`) per includere `listAssets`:

```ts
import { assetExists, listAssets } from '@/assets';
```

2. Aggiungi un nuovo import in cima al file:

```ts
import { theme as brandTheme } from '@/theme';
```

3. Aggiungi in fondo al file:

```ts
export interface RenderDynamicArgs {
  serveUrl: string;
  tsxCode: string;
}

export async function renderDynamicStill({ serveUrl, tsxCode }: RenderDynamicArgs): Promise<RenderStillResult> {
  const id = shortId();
  const output = buildOutputPath('DynamicSlide', id);
  const start = Date.now();

  const assetsMap = Object.fromEntries(
    Object.entries(listAssets()).map(([k, v]) => [k, v.absolutePath]),
  );
  const inputProps = { tsxCode, theme: brandTheme, assets: assetsMap };

  const composition = await selectComposition({
    serveUrl,
    id: 'DynamicSlide',
    inputProps,
  });

  await renderStill({
    composition,
    serveUrl,
    output,
    inputProps,
  });

  const durationMs = Date.now() - start;
  log.info('render.dynamic.complete', { file: output, durationMs });
  return { file: output, durationMs };
}
```

- [ ] **Step 4: Aggiungere `mountDynamicRoutes` in src/server/routes.ts**

Aggiungi in fondo a `src/server/routes.ts`:

```ts
import { generateSlideCode } from '@/llm/generate';
import { createLlmClient, readLlmConfig } from '@/llm/client';
import { buildSystemPrompt } from '@/llm/systemPrompt';
import { loadBrandContext } from '@/llm/brandContext';
import { validateTsx } from '@/dynamic/compile';
import { renderDynamicStill } from '@/lib/render';

const DynamicBodySchema = z.object({
  prompt: z.string().min(1).max(8000),
  brandContext: z.string().optional(),
  model: z.string().optional(),
});

export function mountDynamicRoutes(app: Express): void {
  app.post('/render/dynamic', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = DynamicBodySchema.parse(req.body);
      const cfg = readLlmConfig();
      const client = createLlmClient(cfg);
      const brand = body.brandContext
        ?? loadBrandContext(process.env.BRAND_CONTEXT_FILE ?? 'docs/brand-context.example.md');
      const systemPrompt = buildSystemPrompt(brand);

      const llmStart = Date.now();
      let generated;
      try {
        generated = await generateSlideCode({
          client, model: body.model ?? cfg.model, systemPrompt, userPrompt: body.prompt,
        });
      } catch (err) {
        const e: Error & { code?: string } = new Error((err as Error).message);
        e.code = 'LLM_FAILURE';
        throw e;
      }
      const llmDurationMs = Date.now() - llmStart;

      const syntaxErr = validateTsx(generated.code);
      if (syntaxErr) {
        const e: Error & { code?: string; detail?: string } = new Error('invalid_code: generated TSX does not parse');
        e.code = 'INVALID_CODE';
        e.detail = syntaxErr;
        throw e;
      }

      const serveUrl = req.app.locals.serveUrl as string;
      const renderStart = Date.now();
      const result = await renderDynamicStill({ serveUrl, tsxCode: generated.code });
      const renderDurationMs = Date.now() - renderStart;

      res.json({
        file: result.file,
        durationMs: llmDurationMs + renderDurationMs,
        llmDurationMs,
        renderDurationMs,
        code: generated.code,
        intent: generated.intent,
      });
    } catch (err) {
      next(err);
    }
  });
}
```

- [ ] **Step 5: Mount route in server**

Modifica `src/server/index.ts`. Aggiungi all'import:

```ts
import { mountDiscoveryRoutes, mountRenderRoutes, mountDynamicRoutes } from './routes';
```

E aggiungi DOPO `mountRenderRoutes(app);`:

```ts
  mountDynamicRoutes(app);
```

- [ ] **Step 6: Eseguire test (deve passare)**

Run: `npx vitest run tests/integration/renderDynamic.test.ts`
Atteso: PASS (4 test).

- [ ] **Step 7: Commit**

```bash
git add src/lib/render.ts src/server/routes.ts src/server/index.ts tests/integration/renderDynamic.test.ts
git commit -m "feat(server): add POST /render/dynamic with LLM generation and dynamic compile/render"
```

---

## Task 13 — Estendere error handler

**Files:**
- Modify: `src/server/errors.ts`
- Modify: `tests/integration/errors.test.ts`

- [ ] **Step 1: Aggiornare test esistenti aggiungendo casi LLM_FAILURE e INVALID_CODE**

Apri `tests/integration/errors.test.ts` e aggiungi nuove rotte nel `buildApp()` (dentro lo stesso file) **prima** di `app.use(errorHandler)`:

```ts
  app.get('/llmfail', (_req, _res, next) => {
    const e: Error & { code?: string } = new Error('llm_empty_response');
    e.code = 'LLM_FAILURE';
    next(e);
  });
  app.get('/badcode', (_req, _res, next) => {
    const e: Error & { code?: string; detail?: string } = new Error('invalid_code');
    e.code = 'INVALID_CODE';
    e.detail = 'unexpected token';
    next(e);
  });
```

Aggiungi nuovi test al describe `error handler`:

```ts
  it('maps LLM_FAILURE to 500 with error=llm_failure', async () => {
    const res = await request(buildApp()).get('/llmfail');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('llm_failure');
  });

  it('maps INVALID_CODE to 422 with error=invalid_code and detail', async () => {
    const res = await request(buildApp()).get('/badcode');
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('invalid_code');
    expect(res.body.detail).toBe('unexpected token');
  });
```

- [ ] **Step 2: Eseguire test (devono fallire)**

Run: `npx vitest run tests/integration/errors.test.ts`
Atteso: FAIL sui due nuovi test.

- [ ] **Step 3: Aggiornare error handler**

Modifica `src/server/errors.ts` rimpiazzando con:

```ts
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { log } from '@/lib/log';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'validation', issues: err.issues });
    return;
  }

  const code = (err as { code?: string }).code;

  if (code === 'ASSET_NOT_FOUND') {
    const assetId = (err as { assetId?: string }).assetId;
    res.status(422).json({ error: 'asset_not_found', assetId });
    return;
  }

  if (code === 'INVALID_CODE') {
    const detail = (err as { detail?: string }).detail;
    res.status(422).json({ error: 'invalid_code', detail, message: (err as Error).message });
    return;
  }

  if (code === 'LLM_FAILURE') {
    log.error('llm.failure', { message: (err as Error).message });
    res.status(500).json({ error: 'llm_failure', message: (err as Error).message });
    return;
  }

  log.error('render.failure', { message: (err as Error).message });
  res.status(500).json({ error: 'render_failure', message: (err as Error).message });
};
```

- [ ] **Step 4: Eseguire test (devono passare)**

Run: `npx vitest run tests/integration/errors.test.ts`
Atteso: PASS (5 test totali nel file).

- [ ] **Step 5: Commit**

```bash
git add src/server/errors.ts tests/integration/errors.test.ts
git commit -m "feat(server): map LLM_FAILURE to 500 and INVALID_CODE to 422 in error handler"
```

---

## Task 14 — Smoke test manuale end-to-end

**Files:** None (verifica runtime).

Richiede litellm proxy attivo. Se l'utente non lo ha ancora, fermarsi qui e chiedere setup.

- [ ] **Step 1: Verificare prerequisiti**

Conferma con l'utente che:
- `LITELLM_BASE_URL`, `LITELLM_API_KEY`, `LITELLM_MODEL` sono settati in `.env`
- Il proxy litellm risponde a `curl $LITELLM_BASE_URL/v1/models`

Se manca, halt.

- [ ] **Step 2: Avviare il server in un terminale**

Run:
```bash
npm run dev
```

Atteso: log mostra `server.boot`, `bundle.start`, `bundle.complete`, `server.listening` sulla porta 3001.

- [ ] **Step 3: Verificare la composition è registrata**

In un altro terminale:
```bash
curl http://localhost:3001/compositions
```

Atteso: la risposta NON cambia (solo `Slide` listata) — l'endpoint `/compositions` espone solo la composition statica `Slide` per design. `DynamicSlide` è interna.

Nota: se vuoi esporre anche `DynamicSlide` aggiorna `mountDiscoveryRoutes` in un follow-up — fuori scope v1.

- [ ] **Step 4: Creare example prompt JSON**

Crea `examples/dynamic-prompt.json`:

```json
{
  "prompt": "Crea una slide titolo per il post 'La leva del tempo' di Acme. Titolo grande in brand-navy in alto, sotto un sottotitolo in muted: 'Perché iniziare a 24 anni vale più di guadagnare il doppio a 40'. In basso una piccola scritta '@yourbrand' centrata. Background paper."
}
```

- [ ] **Step 5: Lanciare il render dinamico**

In PowerShell:
```powershell
curl -X POST http://localhost:3001/render/dynamic -H "Content-Type: application/json" --data-binary "@examples/dynamic-prompt.json"
```

Atteso: risposta JSON entro 8s con `file`, `intent`, `code`, `durationMs`, `llmDurationMs`, `renderDurationMs`. Status 200.

- [ ] **Step 6: Aprire e ispezionare il PNG**

Apri il file restituito. Conferma visivamente:
- Background paper (#F5F1E8)
- Titolo grande brand-navy
- Sottotitolo muted
- "@yourbrand" in basso
- Tutto dentro il canvas 1080x1350, niente overflow

Se non accettabile, leggere il `code` ritornato nella risposta per capire cosa l'LLM ha generato. Iterare sul system prompt se necessario.

- [ ] **Step 7: Test errori**

Verifica un prompt malformato:
```powershell
curl -X POST http://localhost:3001/render/dynamic -H "Content-Type: application/json" -d '{}'
```

Atteso: 400 con `error: "validation"`.

- [ ] **Step 8: Fermare il server**

Ctrl+C nel terminale dev.

- [ ] **Step 9: Commit dell'esempio**

```bash
git add examples/dynamic-prompt.json
git commit -m "docs: add dynamic-prompt example for /render/dynamic smoke test"
```

---

## Task 15 — README + acceptance criteria

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Estendere README**

Apri `README.md` e nella tabella `## Endpoint` aggiungi una riga dopo `/render/carousel`:

```
| `POST` | `/render/dynamic` | Genera TSX via LLM e renderizza un PNG dinamico |
```

Aggiungi una nuova sezione dopo `## Esempio request`:

```markdown
## Esempio dynamic render

```bash
curl -X POST http://localhost:3001/render/dynamic \
  -H "Content-Type: application/json" \
  --data-binary @examples/dynamic-prompt.json
```

Risposta:
`{ "file": "...", "intent": "...", "code": "...", "durationMs": 4200, "llmDurationMs": 1800, "renderDurationMs": 2400 }`

Richiede un proxy litellm in ascolto su `LITELLM_BASE_URL`. Le variabili minime sono in `.env.example` (`LITELLM_BASE_URL`, `LITELLM_API_KEY`, `LITELLM_MODEL`).
```

- [ ] **Step 2: Eseguire la full test suite**

Run:
```bash
npm test
```

Atteso: TUTTI i test passano (unit + integration). Esclusi gli snapshot test che richiedono asset SVG fisici.

- [ ] **Step 3: Build TS**

Run: `npm run build`
Atteso: PASS, zero errori.

- [ ] **Step 4: Verifica acceptance criteria spec §15**

Cammina mentalmente attraverso ogni item della spec:
1. `POST /render/dynamic` con prompt valido → 200 con PNG entro 8s — verificato Task 14
2. PNG coerente col prompt (titolo/sottotitolo/illustrazione) — verificato Task 14 step 6
3. Brand identity rispettata (palette, font, paper) — verificato Task 14 step 6
4. LLM ritorna TSX malformato → 422 — verificato Task 12 test 4
5. LLM down → 500 `llm_failure` — verificato Task 12 test 3
6. Eval runtime error → 500 `render_failure` — coperto da Task 12 mock + comportamento Remotion cancelRender
7. `/render/still` legacy invariato — i suoi test continuano a passare
8. README aggiornato con nuovo endpoint — verificato Step 1
9. Tutti i test passano — verificato Step 2

- [ ] **Step 5: Commit finale**

```bash
git add README.md
git commit -m "docs: document /render/dynamic endpoint and litellm setup in README"
```

---

## Plan complete

Dynamic render v1 è pronto. Prossimi follow-up (fuori scope v1):
1. Cache PNG basata su hash di `(prompt + brandContext + model)` per ridurre LLM calls in iterazione review
2. Esposizione di `DynamicSlide` in `/compositions` con metadata
3. Endpoint `/render/dynamic/preview` che ritorna SOLO il codice generato (senza render) per iterazione veloce
4. Few-shot examples nel system prompt da top-30 post storici (Fase 1 piano generale)
5. Skill detection modulare (passa al prompt solo le primitive/regole pertinenti per ridurre token)
6. Streaming response — utile se vogliamo mostrare progress in tempo reale
7. `/render/dynamic-video` (video dinamico, riusa la stessa infra ma con `renderMedia`)
