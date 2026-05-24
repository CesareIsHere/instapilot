# Render Service v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire un microservizio HTTP locale che trasforma uno `SlideSpec` JSON in PNG via Remotion, capace di riprodurre fedelmente la slide "La leva del tempo" come acceptance test.

**Architecture:** Express + Remotion programmatico. Una sola composition `<Slide>` interprete che riceve uno `SlideSpec` validato da Zod e renderizza combinando primitive (`Headline`, `RichText`, `Illustration`, `Footer`) brand-safe secondo un layout preset (`headline-body-illustration`). Bundle Remotion costruito una volta al boot. Servizio deterministico, niente AI.

**Tech Stack:** Node LTS, TypeScript strict, Remotion 4.x, Express 4.x, Zod 3.x, Vitest, pixelmatch + pngjs (snapshot diff), tsx (dev runner), @remotion/google-fonts.

**Spec di riferimento:** `docs/superpowers/specs/2026-05-24-render-service-v1-design.md`

---

## File map

Mappa di tutti i file creati/modificati nel piano.

**Create:**
- `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `vitest.config.ts`, `remotion.config.ts`, `README.md`
- `src/theme/colors.ts`, `src/theme/typography.ts`, `src/theme/spacing.ts`, `src/theme/index.ts`
- `src/lib/log.ts`, `src/lib/render.ts`
- `src/assets/manifest.ts`, `src/assets/index.ts`
- `src/schema/slideSpec.ts`
- `src/primitives/Headline/{Headline.tsx,schema.ts,index.ts}`
- `src/primitives/RichText/{RichText.tsx,schema.ts,index.ts}`
- `src/primitives/Illustration/{Illustration.tsx,schema.ts,index.ts}`
- `src/primitives/Footer/{Footer.tsx,schema.ts,index.ts}`
- `src/primitives/index.ts`
- `src/chrome/{Background.tsx,Logo.tsx,CarouselNav.tsx}`
- `src/layouts/headlineBodyIllustration.tsx`, `src/layouts/index.ts`
- `src/remotion/{Root.tsx,Slide.tsx,bundler.ts}`
- `src/server/{index.ts,routes.ts,errors.ts}`
- `tests/unit/*`, `tests/integration/*`, `tests/snapshot/*`
- `public/brand/.gitkeep`, `public/illustrations/.gitkeep`, `public/fonts/.gitkeep`, `public/generated/.gitkeep`

Ogni file ha una responsabilità singola. Le primitive sono co-located (componente + schema + index). Theme/log/render sono pure utility. Server è separato da Remotion.

---

## Prerequisiti non-codice

Prima del Task 20 (snapshot test) l'utente deve fornire:
- `public/brand/logo-f.svg` — logo Finvestire
- `public/illustrations/money-time-flow.svg` — illustrazione della slide campione

Per il font, in v1 usiamo un Google Font ("Plus Jakarta Sans") via `@remotion/google-fonts` come placeholder vicino al brand. Sostituibile in futuro con font custom in `public/fonts/`.

---

## Task 1 — Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `vitest.config.ts`
- Create: `remotion.config.ts`
- Create: `public/{brand,illustrations,fonts,generated}/.gitkeep`
- Create: `output/.gitkeep`

- [ ] **Step 1: Initialize Node project**

Run:
```bash
npm init -y
```

Then overwrite `package.json` with:

```json
{
  "name": "ig-auto-builder",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server/index.ts",
    "studio": "remotion studio src/remotion/Root.tsx",
    "build": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@remotion/bundler": "^4.0.0",
    "@remotion/cli": "^4.0.0",
    "@remotion/google-fonts": "^4.0.0",
    "@remotion/renderer": "^4.0.0",
    "express": "^4.19.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "remotion": "^4.0.0",
    "zod": "^3.23.0",
    "zod-to-json-schema": "^3.23.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "@types/node": "^20.0.0",
    "@types/pixelmatch": "^5.2.0",
    "@types/pngjs": "^6.0.0",
    "@types/react": "^18.3.0",
    "@types/supertest": "^6.0.0",
    "pixelmatch": "^5.3.0",
    "pngjs": "^7.0.0",
    "supertest": "^7.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install
```

Expected: install completa, no errori (warning su peer deps di Remotion OK).

- [ ] **Step 3: Create tsconfig.json**

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "isolatedModules": true,
    "noEmit": true,
    "lib": ["ES2022", "DOM"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 4: Create .gitignore**

Create `.gitignore`:
```
node_modules/
output/*
!output/.gitkeep
public/generated/*
!public/generated/.gitkeep
.env
*.log
dist/
.DS_Store
```

- [ ] **Step 5: Create .env.example**

Create `.env.example`:
```
PORT=3001
OUTPUT_DIR=./output
LOG_LEVEL=info
```

- [ ] **Step 6: Create remotion.config.ts**

Create `remotion.config.ts`:
```ts
import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('png');
Config.setOverwriteOutput(true);
```

- [ ] **Step 7: Create vitest.config.ts**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 8: Create directory placeholders**

Run:
```bash
mkdir -p public/brand public/illustrations public/fonts public/generated output src tests
touch public/brand/.gitkeep public/illustrations/.gitkeep public/fonts/.gitkeep public/generated/.gitkeep output/.gitkeep
```

- [ ] **Step 9: Verify build works**

Run:
```bash
npm run build
```

Expected: `tsc --noEmit` esce senza errori (nessun file TS ancora, output vuoto OK).

- [ ] **Step 10: Commit**

```bash
git init
git add .
git commit -m "chore: project scaffolding with Remotion, Express, Zod, Vitest"
```

---

## Task 2 — Theme tokens

**Files:**
- Create: `src/theme/colors.ts`
- Create: `src/theme/typography.ts`
- Create: `src/theme/spacing.ts`
- Create: `src/theme/index.ts`
- Test: `tests/unit/theme.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/theme.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { theme } from '@/theme';

describe('theme', () => {
  it('exposes colors, typography, spacing as single object', () => {
    expect(theme.colors).toBeDefined();
    expect(theme.typography).toBeDefined();
    expect(theme.spacing).toBeDefined();
  });

  it('includes brand-navy and paper colors', () => {
    expect(theme.colors['brand-navy']).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(theme.colors['paper']).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('exposes a fontFamily on typography', () => {
    expect(typeof theme.typography.fontFamily).toBe('string');
  });

  it('spacing scale uses numeric pixel values', () => {
    expect(typeof theme.spacing.md).toBe('number');
    expect(theme.spacing.md).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run tests/unit/theme.test.ts`
Expected: FAIL with "Cannot find module '@/theme'".

- [ ] **Step 3: Implement colors**

Create `src/theme/colors.ts`:
```ts
export const colors = {
  'brand-navy': '#1B3A6B',
  'brand-gold': '#C9A24A',
  'paper': '#F5F1E8',
  'ink': '#1A1A1A',
  'muted': '#6B6B6B',
} as const;

export type ColorToken = keyof typeof colors;
```

- [ ] **Step 4: Implement typography**

Create `src/theme/typography.ts`:
```ts
export const typography = {
  fontFamily: 'Plus Jakarta Sans, sans-serif',
  sizes: {
    sm: 28,
    md: 36,
    lg: 56,
    xl: 88,
  },
  weights: {
    regular: 400,
    semibold: 600,
    bold: 800,
  },
  lineHeight: 1.25,
} as const;

export type SizeToken = keyof typeof typography.sizes;
```

- [ ] **Step 5: Implement spacing**

Create `src/theme/spacing.ts`:
```ts
export const spacing = {
  xs: 8,
  sm: 16,
  md: 24,
  lg: 40,
  xl: 64,
  '2xl': 96,
} as const;

export type SpacingToken = keyof typeof spacing;
```

- [ ] **Step 6: Implement theme index**

Create `src/theme/index.ts`:
```ts
import { colors } from './colors';
import { typography } from './typography';
import { spacing } from './spacing';

export const theme = { colors, typography, spacing } as const;
export type Theme = typeof theme;
export { colors, typography, spacing };
export type { ColorToken } from './colors';
export type { SizeToken } from './typography';
export type { SpacingToken } from './spacing';
```

- [ ] **Step 7: Run test, verify it passes**

Run: `npx vitest run tests/unit/theme.test.ts`
Expected: PASS (4 test).

- [ ] **Step 8: Commit**

```bash
git add src/theme tests/unit/theme.test.ts
git commit -m "feat(theme): add brand color, typography, spacing tokens"
```

---

## Task 3 — Structured JSON logger

**Files:**
- Create: `src/lib/log.ts`
- Test: `tests/unit/log.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/log.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log } from '@/lib/log';

describe('log', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('writes a JSON line with ts, level, event', () => {
    log.info('render.start', { compositionId: 'Slide' });
    expect(consoleSpy).toHaveBeenCalledOnce();
    const payload = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(payload.level).toBe('info');
    expect(payload.event).toBe('render.start');
    expect(payload.compositionId).toBe('Slide');
    expect(typeof payload.ts).toBe('string');
  });

  it('supports error level', () => {
    log.error('render.fail', { message: 'boom' });
    const payload = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(payload.level).toBe('error');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run tests/unit/log.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement logger**

Create `src/lib/log.ts`:
```ts
type Level = 'debug' | 'info' | 'warn' | 'error';

function write(level: Level, event: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  }));
}

export const log = {
  debug: (event: string, fields?: Record<string, unknown>) => write('debug', event, fields),
  info:  (event: string, fields?: Record<string, unknown>) => write('info', event, fields),
  warn:  (event: string, fields?: Record<string, unknown>) => write('warn', event, fields),
  error: (event: string, fields?: Record<string, unknown>) => write('error', event, fields),
};
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run tests/unit/log.test.ts`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/log.ts tests/unit/log.test.ts
git commit -m "feat(lib): add structured JSON logger"
```

---

## Task 4 — Asset manifest + resolver

**Files:**
- Create: `src/assets/manifest.ts`
- Create: `src/assets/index.ts`
- Test: `tests/unit/assets.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/assets.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolveAsset, listAssets, assetExists } from '@/assets';

describe('assets', () => {
  it('resolves known assetId to absolute-ish path', () => {
    const p = resolveAsset('logo-f');
    expect(p).toContain('brand/logo-f.svg');
  });

  it('throws on unknown assetId', () => {
    expect(() => resolveAsset('does-not-exist')).toThrow(/asset_not_found/);
  });

  it('reports asset existence without throwing', () => {
    expect(assetExists('logo-f')).toBe(true);
    expect(assetExists('does-not-exist')).toBe(false);
  });

  it('lists all assets with metadata', () => {
    const all = listAssets();
    expect(all['logo-f']).toMatchObject({ path: expect.stringContaining('brand/logo-f.svg') });
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run tests/unit/assets.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement manifest**

Create `src/assets/manifest.ts`:
```ts
export interface AssetEntry {
  path: string;          // relative to public/
  tags: string[];
  description: string;
}

export const manifest: Record<string, AssetEntry> = {
  'logo-f': {
    path: 'brand/logo-f.svg',
    tags: ['brand', 'logo'],
    description: 'Logo monogramma Finvestire',
  },
  'money-time-flow': {
    path: 'illustrations/money-time-flow.svg',
    tags: ['time', 'money', 'flow'],
    description: 'Sequenza monete → banconote → sacco $ con frecce manoscritte',
  },
};
```

- [ ] **Step 4: Implement resolver**

Create `src/assets/index.ts`:
```ts
import path from 'node:path';
import { manifest, type AssetEntry } from './manifest';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

export function resolveAsset(assetId: string): string {
  const entry = manifest[assetId];
  if (!entry) {
    throw new Error(`asset_not_found:${assetId}`);
  }
  return path.join(PUBLIC_DIR, entry.path);
}

export function assetExists(assetId: string): boolean {
  return Boolean(manifest[assetId]);
}

export function listAssets(): Record<string, AssetEntry & { absolutePath: string }> {
  return Object.fromEntries(
    Object.entries(manifest).map(([id, entry]) => [
      id,
      { ...entry, absolutePath: path.join(PUBLIC_DIR, entry.path) },
    ]),
  );
}

export { manifest };
```

- [ ] **Step 5: Run test, verify it passes**

Run: `npx vitest run tests/unit/assets.test.ts`
Expected: PASS (4 test).

- [ ] **Step 6: Commit**

```bash
git add src/assets tests/unit/assets.test.ts
git commit -m "feat(assets): add asset manifest with resolver and discovery helpers"
```

---

## Task 5 — Primitive: Headline

**Files:**
- Create: `src/primitives/Headline/schema.ts`
- Create: `src/primitives/Headline/Headline.tsx`
- Create: `src/primitives/Headline/index.ts`
- Test: `tests/unit/primitives/headline.test.ts`

- [ ] **Step 1: Write the failing test for schema**

Create `tests/unit/primitives/headline.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { HeadlineSchema } from '@/primitives/Headline';

describe('Headline schema', () => {
  it('accepts minimal valid props', () => {
    const r = HeadlineSchema.safeParse({ type: 'Headline', text: 'Ciao', size: 'md' });
    expect(r.success).toBe(true);
  });

  it('accepts optional color', () => {
    const r = HeadlineSchema.safeParse({ type: 'Headline', text: 'Ciao', size: 'xl', color: 'brand-navy' });
    expect(r.success).toBe(true);
  });

  it('rejects missing text', () => {
    const r = HeadlineSchema.safeParse({ type: 'Headline', size: 'md' });
    expect(r.success).toBe(false);
  });

  it('rejects invalid size', () => {
    const r = HeadlineSchema.safeParse({ type: 'Headline', text: 'x', size: 'enormous' });
    expect(r.success).toBe(false);
  });

  it('rejects wrong type discriminator', () => {
    const r = HeadlineSchema.safeParse({ type: 'NotHeadline', text: 'x', size: 'md' });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run tests/unit/primitives/headline.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement schema**

Create `src/primitives/Headline/schema.ts`:
```ts
import { z } from 'zod';

export const HeadlineSchema = z.object({
  type: z.literal('Headline'),
  text: z.string().min(1),
  size: z.enum(['sm', 'md', 'lg', 'xl']),
  color: z.enum(['brand-navy', 'brand-gold', 'ink', 'paper', 'muted']).optional(),
});

export type HeadlineProps = z.infer<typeof HeadlineSchema>;
```

- [ ] **Step 4: Implement component**

Create `src/primitives/Headline/Headline.tsx`:
```tsx
import React from 'react';
import { theme } from '@/theme';
import type { HeadlineProps } from './schema';

export const Headline: React.FC<HeadlineProps> = ({ text, size, color = 'brand-navy' }) => {
  return (
    <div
      style={{
        fontFamily: theme.typography.fontFamily,
        fontSize: theme.typography.sizes[size],
        fontWeight: theme.typography.weights.bold,
        color: theme.colors[color],
        lineHeight: theme.typography.lineHeight,
        letterSpacing: '-0.02em',
      }}
    >
      {text}
    </div>
  );
};
```

- [ ] **Step 5: Implement index**

Create `src/primitives/Headline/index.ts`:
```ts
export { Headline } from './Headline';
export { HeadlineSchema, type HeadlineProps } from './schema';
```

- [ ] **Step 6: Run test, verify it passes**

Run: `npx vitest run tests/unit/primitives/headline.test.ts`
Expected: PASS (5 test).

- [ ] **Step 7: Commit**

```bash
git add src/primitives/Headline tests/unit/primitives/headline.test.ts
git commit -m "feat(primitives): add Headline primitive with Zod schema"
```

---

## Task 6 — Primitive: RichText

**Files:**
- Create: `src/primitives/RichText/schema.ts`
- Create: `src/primitives/RichText/RichText.tsx`
- Create: `src/primitives/RichText/index.ts`
- Test: `tests/unit/primitives/richText.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/primitives/richText.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { RichTextSchema } from '@/primitives/RichText';

describe('RichText schema', () => {
  it('accepts paragraph + bullets mix', () => {
    const r = RichTextSchema.safeParse({
      type: 'RichText',
      content: [
        { kind: 'paragraph', text: 'Intro' },
        { kind: 'bullets', items: ['A', 'B', 'C'] },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('rejects empty content', () => {
    const r = RichTextSchema.safeParse({ type: 'RichText', content: [] });
    expect(r.success).toBe(false);
  });

  it('rejects bullets with empty items', () => {
    const r = RichTextSchema.safeParse({
      type: 'RichText',
      content: [{ kind: 'bullets', items: [] }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects unknown content kind', () => {
    const r = RichTextSchema.safeParse({
      type: 'RichText',
      content: [{ kind: 'code', text: 'x' }],
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run tests/unit/primitives/richText.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement schema**

Create `src/primitives/RichText/schema.ts`:
```ts
import { z } from 'zod';

const ParagraphSchema = z.object({
  kind: z.literal('paragraph'),
  text: z.string().min(1),
});

const BulletsSchema = z.object({
  kind: z.literal('bullets'),
  items: z.array(z.string().min(1)).min(1),
});

export const RichTextSchema = z.object({
  type: z.literal('RichText'),
  content: z.array(z.discriminatedUnion('kind', [ParagraphSchema, BulletsSchema])).min(1),
});

export type RichTextProps = z.infer<typeof RichTextSchema>;
```

- [ ] **Step 4: Implement component**

Create `src/primitives/RichText/RichText.tsx`:
```tsx
import React from 'react';
import { theme } from '@/theme';
import type { RichTextProps } from './schema';

export const RichText: React.FC<RichTextProps> = ({ content }) => {
  return (
    <div
      style={{
        fontFamily: theme.typography.fontFamily,
        fontSize: theme.typography.sizes.md,
        fontWeight: theme.typography.weights.regular,
        color: theme.colors.ink,
        lineHeight: 1.4,
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.md,
      }}
    >
      {content.map((block, idx) => {
        if (block.kind === 'paragraph') {
          return <p key={idx} style={{ margin: 0 }}>{block.text}</p>;
        }
        return (
          <ul key={idx} style={{ margin: 0, paddingLeft: theme.spacing.lg, display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
            {block.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 5: Implement index**

Create `src/primitives/RichText/index.ts`:
```ts
export { RichText } from './RichText';
export { RichTextSchema, type RichTextProps } from './schema';
```

- [ ] **Step 6: Run test, verify it passes**

Run: `npx vitest run tests/unit/primitives/richText.test.ts`
Expected: PASS (4 test).

- [ ] **Step 7: Commit**

```bash
git add src/primitives/RichText tests/unit/primitives/richText.test.ts
git commit -m "feat(primitives): add RichText primitive with paragraph+bullets union"
```

---

## Task 7 — Primitive: Illustration

**Files:**
- Create: `src/primitives/Illustration/schema.ts`
- Create: `src/primitives/Illustration/Illustration.tsx`
- Create: `src/primitives/Illustration/index.ts`
- Test: `tests/unit/primitives/illustration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/primitives/illustration.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { IllustrationSchema } from '@/primitives/Illustration';

describe('Illustration schema', () => {
  it('accepts minimal props', () => {
    const r = IllustrationSchema.safeParse({ type: 'Illustration', assetId: 'logo-f' });
    expect(r.success).toBe(true);
  });

  it('accepts optional caption and align', () => {
    const r = IllustrationSchema.safeParse({
      type: 'Illustration',
      assetId: 'money-time-flow',
      caption: 'Tempo',
      align: 'center',
    });
    expect(r.success).toBe(true);
  });

  it('rejects missing assetId', () => {
    const r = IllustrationSchema.safeParse({ type: 'Illustration' });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run tests/unit/primitives/illustration.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement schema**

Create `src/primitives/Illustration/schema.ts`:
```ts
import { z } from 'zod';

export const IllustrationSchema = z.object({
  type: z.literal('Illustration'),
  assetId: z.string().min(1),
  caption: z.string().optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
});

export type IllustrationProps = z.infer<typeof IllustrationSchema>;
```

- [ ] **Step 4: Implement component**

Create `src/primitives/Illustration/Illustration.tsx`:
```tsx
import React from 'react';
import { Img, staticFile } from 'remotion';
import { manifest } from '@/assets/manifest';
import { theme } from '@/theme';
import type { IllustrationProps } from './schema';

export const Illustration: React.FC<IllustrationProps> = ({ assetId, caption, align = 'center' }) => {
  const entry = manifest[assetId];
  if (!entry) {
    return <div style={{ color: 'red' }}>missing asset: {assetId}</div>;
  }

  const justify = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: justify, gap: theme.spacing.sm, width: '100%' }}>
      <Img
        src={staticFile(entry.path)}
        style={{ maxWidth: '100%', maxHeight: 400, objectFit: 'contain' }}
      />
      {caption && (
        <div style={{
          fontFamily: theme.typography.fontFamily,
          fontSize: theme.typography.sizes.sm,
          color: theme.colors.ink,
          fontWeight: theme.typography.weights.semibold,
        }}>
          {caption}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 5: Implement index**

Create `src/primitives/Illustration/index.ts`:
```ts
export { Illustration } from './Illustration';
export { IllustrationSchema, type IllustrationProps } from './schema';
```

- [ ] **Step 6: Run test, verify it passes**

Run: `npx vitest run tests/unit/primitives/illustration.test.ts`
Expected: PASS (3 test).

- [ ] **Step 7: Commit**

```bash
git add src/primitives/Illustration tests/unit/primitives/illustration.test.ts
git commit -m "feat(primitives): add Illustration primitive referencing asset manifest"
```

---

## Task 8 — Primitive: Footer

**Files:**
- Create: `src/primitives/Footer/schema.ts`
- Create: `src/primitives/Footer/Footer.tsx`
- Create: `src/primitives/Footer/index.ts`
- Test: `tests/unit/primitives/footer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/primitives/footer.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { FooterSchema } from '@/primitives/Footer';

describe('Footer schema', () => {
  it('accepts brand variant without text', () => {
    const r = FooterSchema.safeParse({ type: 'Footer', variant: 'brand' });
    expect(r.success).toBe(true);
  });

  it('accepts disclaimer variant', () => {
    const r = FooterSchema.safeParse({ type: 'Footer', variant: 'disclaimer' });
    expect(r.success).toBe(true);
  });

  it('accepts custom variant with text', () => {
    const r = FooterSchema.safeParse({ type: 'Footer', variant: 'custom', text: 'Note' });
    expect(r.success).toBe(true);
  });

  it('rejects unknown variant', () => {
    const r = FooterSchema.safeParse({ type: 'Footer', variant: 'banana' });
    expect(r.success).toBe(false);
  });

  it('rejects wrong type discriminator', () => {
    const r = FooterSchema.safeParse({ type: 'NotFooter', variant: 'brand' });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run tests/unit/primitives/footer.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement schema**

Create `src/primitives/Footer/schema.ts`:

Footer is a single `ZodObject` (so it composes with the root `discriminatedUnion('type', ...)` in Task 9). The `variant` is a string enum and `text` is optional for all variants — the component renders a sensible default for `brand`/`disclaimer` and uses `text` for `custom`. Cross-field constraints like "custom requires text" are deferred (would require a non-`ZodObject` wrapper that breaks discriminated union composition).

```ts
import { z } from 'zod';

export const FooterSchema = z.object({
  type: z.literal('Footer'),
  variant: z.enum(['brand', 'disclaimer', 'custom']),
  text: z.string().optional(),
});

export type FooterProps = z.infer<typeof FooterSchema>;
```

- [ ] **Step 4: Implement component**

Create `src/primitives/Footer/Footer.tsx`:
```tsx
import React from 'react';
import { theme } from '@/theme';
import type { FooterProps } from './schema';

const DISCLAIMER = "Contenuto a scopo informativo/educativo. Non è consulenza finanziaria.";
const BRAND = "@finvestire";

export const Footer: React.FC<FooterProps> = (props) => {
  const text = props.variant === 'brand' ? BRAND
             : props.variant === 'disclaimer' ? DISCLAIMER
             : (props.text ?? '');

  return (
    <div style={{
      fontFamily: theme.typography.fontFamily,
      fontSize: theme.typography.sizes.sm * 0.7,
      color: theme.colors.muted,
      textAlign: 'center',
      width: '100%',
    }}>
      {text}
    </div>
  );
};
```

- [ ] **Step 5: Implement index**

Create `src/primitives/Footer/index.ts`:
```ts
export { Footer } from './Footer';
export { FooterSchema, type FooterProps } from './schema';
```

- [ ] **Step 6: Run test, verify it passes**

Run: `npx vitest run tests/unit/primitives/footer.test.ts`
Expected: PASS (5 test).

- [ ] **Step 7: Commit**

```bash
git add src/primitives/Footer tests/unit/primitives/footer.test.ts
git commit -m "feat(primitives): add Footer primitive with brand/disclaimer/custom variants"
```

---

## Task 9 — Primitives registry + SlideSpec root schema

**Files:**
- Create: `src/primitives/index.ts`
- Create: `src/schema/slideSpec.ts`
- Test: `tests/unit/slideSpec.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/slideSpec.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { SlideSpecSchema } from '@/schema/slideSpec';

const validSlide = {
  compositionId: 'Slide',
  format: 'post-portrait',
  layout: 'headline-body-illustration',
  background: 'paper',
  chrome: { showLogo: true, showCarouselNav: true, pageIndex: 3 },
  blocks: [
    { type: 'Headline', text: 'La leva del tempo', size: 'xl', color: 'brand-navy' },
    { type: 'RichText', content: [
      { kind: 'paragraph', text: 'Per Mirco...' },
      { kind: 'bullets', items: ['x', 'y'] },
    ]},
    { type: 'Illustration', assetId: 'money-time-flow', caption: 'Tempo' },
  ],
};

describe('SlideSpec schema', () => {
  it('accepts the leva-del-tempo slide', () => {
    const r = SlideSpecSchema.safeParse(validSlide);
    if (!r.success) console.error(r.error.format());
    expect(r.success).toBe(true);
  });

  it('rejects wrong compositionId', () => {
    const r = SlideSpecSchema.safeParse({ ...validSlide, compositionId: 'Other' });
    expect(r.success).toBe(false);
  });

  it('rejects empty blocks', () => {
    const r = SlideSpecSchema.safeParse({ ...validSlide, blocks: [] });
    expect(r.success).toBe(false);
  });

  it('rejects unknown block type', () => {
    const r = SlideSpecSchema.safeParse({
      ...validSlide,
      blocks: [{ type: 'UnknownPrim', text: 'x' }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects unknown layout', () => {
    const r = SlideSpecSchema.safeParse({ ...validSlide, layout: 'banana-grid' });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run tests/unit/slideSpec.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement primitives registry**

Create `src/primitives/index.ts`:
```ts
import { Headline, HeadlineSchema, type HeadlineProps } from './Headline';
import { RichText, RichTextSchema, type RichTextProps } from './RichText';
import { Illustration, IllustrationSchema, type IllustrationProps } from './Illustration';
import { Footer, FooterSchema, type FooterProps } from './Footer';

export const primitives = {
  Headline: { component: Headline, schema: HeadlineSchema },
  RichText: { component: RichText, schema: RichTextSchema },
  Illustration: { component: Illustration, schema: IllustrationSchema },
  Footer: { component: Footer, schema: FooterSchema },
} as const;

export type BlockProps = HeadlineProps | RichTextProps | IllustrationProps | FooterProps;
export type PrimitiveName = keyof typeof primitives;

export { Headline, RichText, Illustration, Footer };
export { HeadlineSchema, RichTextSchema, IllustrationSchema, FooterSchema };
```

- [ ] **Step 4: Implement SlideSpec schema**

Create `src/schema/slideSpec.ts`:
```ts
import { z } from 'zod';
import { HeadlineSchema } from '@/primitives/Headline';
import { RichTextSchema } from '@/primitives/RichText';
import { IllustrationSchema } from '@/primitives/Illustration';
import { FooterSchema } from '@/primitives/Footer';

export const BlockSchema = z.discriminatedUnion('type', [
  HeadlineSchema,
  RichTextSchema,
  IllustrationSchema,
  FooterSchema,
]);
export type Block = z.infer<typeof BlockSchema>;

export const ChromeSchema = z.object({
  showLogo: z.boolean(),
  showCarouselNav: z.boolean(),
  pageIndex: z.number().int().min(1).optional(),
  totalPages: z.number().int().min(1).optional(),
});

export const SlideSpecSchema = z.object({
  compositionId: z.literal('Slide'),
  format: z.literal('post-portrait'),
  layout: z.enum(['headline-body-illustration']),
  background: z.enum(['paper']),
  chrome: ChromeSchema,
  blocks: z.array(BlockSchema).min(1),
});

export type SlideSpec = z.infer<typeof SlideSpecSchema>;
```

- [ ] **Step 5: Run test, verify it passes**

Run: `npx vitest run tests/unit/slideSpec.test.ts`
Expected: PASS (5 test).

- [ ] **Step 6: Commit**

```bash
git add src/primitives/index.ts src/schema tests/unit/slideSpec.test.ts
git commit -m "feat(schema): add SlideSpec root schema + primitives registry"
```

---

## Task 10 — Chrome components

**Files:**
- Create: `src/chrome/Background.tsx`
- Create: `src/chrome/Logo.tsx`
- Create: `src/chrome/CarouselNav.tsx`

No automated tests for chrome components — covered by snapshot test in Task 14.

- [ ] **Step 1: Implement Background**

Create `src/chrome/Background.tsx`:
```tsx
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { theme } from '@/theme';

interface Props {
  variant: 'paper';
}

export const Background: React.FC<Props> = ({ variant }) => {
  if (variant === 'paper') {
    return (
      <AbsoluteFill style={{
        backgroundColor: theme.colors.paper,
      }} />
    );
  }
  return null;
};
```

- [ ] **Step 2: Implement Logo**

Create `src/chrome/Logo.tsx`:
```tsx
import React from 'react';
import { Img, staticFile } from 'remotion';
import { manifest } from '@/assets/manifest';

export const Logo: React.FC = () => {
  const entry = manifest['logo-f'];
  if (!entry) return null;
  return (
    <div style={{
      width: '100%',
      display: 'flex',
      justifyContent: 'center',
      paddingTop: 32,
    }}>
      <Img src={staticFile(entry.path)} style={{ height: 72, width: 72 }} />
    </div>
  );
};
```

- [ ] **Step 3: Implement CarouselNav**

Create `src/chrome/CarouselNav.tsx`:
```tsx
import React from 'react';
import { theme } from '@/theme';

interface Props {
  pageIndex?: number;
  totalPages?: number;
}

export const CarouselNav: React.FC<Props> = ({ pageIndex }) => {
  return (
    <>
      <div style={{
        position: 'absolute',
        left: 12, top: '50%',
        transform: 'translateY(-50%)',
        width: 28, height: 28, borderRadius: 14,
        border: `2px solid ${theme.colors.muted}`,
        color: theme.colors.muted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18,
      }}>‹</div>

      <div style={{
        position: 'absolute',
        right: 12, top: '50%',
        transform: 'translateY(-50%)',
        width: 28, height: 28, borderRadius: 14,
        border: `2px solid ${theme.colors.muted}`,
        color: theme.colors.muted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18,
      }}>›</div>

      {pageIndex !== undefined && (
        <div style={{
          position: 'absolute',
          right: 48, bottom: 48,
          width: 80, height: 56, borderRadius: 28,
          border: `2px solid ${theme.colors['brand-navy']}`,
          color: theme.colors['brand-navy'],
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28,
        }}>→</div>
      )}
    </>
  );
};
```

- [ ] **Step 4: Commit**

```bash
git add src/chrome
git commit -m "feat(chrome): add Background, Logo, CarouselNav chrome components"
```

---

## Task 11 — Layout: headline-body-illustration + registry

**Files:**
- Create: `src/layouts/headlineBodyIllustration.tsx`
- Create: `src/layouts/index.ts`

- [ ] **Step 1: Implement layout**

Create `src/layouts/headlineBodyIllustration.tsx`:
```tsx
import React from 'react';
import { theme } from '@/theme';
import { primitives, type BlockProps } from '@/primitives';

interface Props {
  blocks: BlockProps[];
}

export const HeadlineBodyIllustration: React.FC<Props> = ({ blocks }) => {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      padding: `${theme.spacing.lg}px ${theme.spacing.xl}px`,
      gap: theme.spacing.lg,
      boxSizing: 'border-box',
    }}>
      {blocks.map((block, idx) => {
        const entry = primitives[block.type as keyof typeof primitives];
        if (!entry) return null;
        const Component = entry.component as React.FC<typeof block>;
        return (
          <div key={idx} style={{ width: '100%' }}>
            <Component {...block} />
          </div>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 2: Implement layouts registry**

Create `src/layouts/index.ts`:
```ts
import { HeadlineBodyIllustration } from './headlineBodyIllustration';

export interface LayoutMeta {
  id: string;
  description: string;
  slots: string[];
}

export const layouts = {
  'headline-body-illustration': {
    component: HeadlineBodyIllustration,
    meta: {
      id: 'headline-body-illustration',
      description: 'Titolo in alto, corpo testo al centro, illustrazione in basso',
      slots: ['Headline', 'RichText', 'Illustration'],
    } satisfies LayoutMeta,
  },
} as const;

export type LayoutId = keyof typeof layouts;
```

- [ ] **Step 3: Verify TS compiles**

Run: `npm run build`
Expected: PASS, no TS errors.

- [ ] **Step 4: Commit**

```bash
git add src/layouts
git commit -m "feat(layouts): add headline-body-illustration layout + registry"
```

---

## Task 12 — Composition `<Slide>` + Remotion Root + bundler

**Files:**
- Create: `src/remotion/Slide.tsx`
- Create: `src/remotion/Root.tsx`
- Create: `src/remotion/bundler.ts`

- [ ] **Step 1: Implement `<Slide>` composition**

Create `src/remotion/Slide.tsx`:
```tsx
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { loadFont } from '@remotion/google-fonts/PlusJakartaSans';
import { Background } from '@/chrome/Background';
import { Logo } from '@/chrome/Logo';
import { CarouselNav } from '@/chrome/CarouselNav';
import { layouts } from '@/layouts';
import type { SlideSpec } from '@/schema/slideSpec';

loadFont();

export const Slide: React.FC<SlideSpec> = (slide) => {
  const layout = layouts[slide.layout];
  if (!layout) {
    return <AbsoluteFill style={{ background: 'red', color: 'white', padding: 40 }}>
      Unknown layout: {slide.layout}
    </AbsoluteFill>;
  }
  const LayoutComponent = layout.component;

  return (
    <AbsoluteFill>
      <Background variant={slide.background} />
      {slide.chrome.showLogo && <Logo />}
      <div style={{ width: '100%', height: '100%' }}>
        <LayoutComponent blocks={slide.blocks} />
      </div>
      {slide.chrome.showCarouselNav && (
        <CarouselNav pageIndex={slide.chrome.pageIndex} totalPages={slide.chrome.totalPages} />
      )}
    </AbsoluteFill>
  );
};

export const defaultSlideProps: SlideSpec = {
  compositionId: 'Slide',
  format: 'post-portrait',
  layout: 'headline-body-illustration',
  background: 'paper',
  chrome: { showLogo: true, showCarouselNav: true, pageIndex: 3 },
  blocks: [
    { type: 'Headline', text: 'La leva del tempo', size: 'xl', color: 'brand-navy' },
    {
      type: 'RichText',
      content: [
        { kind: 'paragraph', text: 'Per Mirco, il vantaggio non sono i soldi, ma il tempo.' },
        { kind: 'bullets', items: [
            'Ha davanti a sé circa 30-35 anni di lavoro.',
            'Più tempo = più interesse composto.',
            "Sul lunghissimo periodo, i mercati azionari hanno reso il 7-8% all'anno.",
            'Il tempo gli permetterà di partire da piccole cifre a un capitale importante per la sua pensione.',
          ],
        },
      ],
    },
    { type: 'Illustration', assetId: 'money-time-flow', caption: 'Tempo' },
  ],
};
```

- [ ] **Step 2: Implement Root**

Create `src/remotion/Root.tsx`:
```tsx
import React from 'react';
import { Composition } from 'remotion';
import { Slide, defaultSlideProps } from './Slide';
import { SlideSpecSchema } from '@/schema/slideSpec';

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
    </>
  );
};
```

Then add the `registerRoot` entrypoint. Create `src/remotion/index.ts`:
```ts
import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';

registerRoot(RemotionRoot);
```

Update `package.json` script `studio` to point at the entry:
```json
"studio": "remotion studio src/remotion/index.ts"
```

- [ ] **Step 3: Implement bundler wrapper**

Create `src/remotion/bundler.ts`:
```ts
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { log } from '@/lib/log';

export async function buildBundle(): Promise<string> {
  const start = Date.now();
  log.info('bundle.start', {});
  const serveUrl = await bundle({
    entryPoint: path.resolve(process.cwd(), 'src/remotion/index.ts'),
    webpackOverride: (config) => config,
  });
  log.info('bundle.complete', { durationMs: Date.now() - start });
  return serveUrl;
}
```

- [ ] **Step 4: Verify Studio launches**

Run: `npm run studio`
Expected: Studio opens in browser on `localhost:3000`, shows `Slide` composition.

Even without `logo-f.svg` / `money-time-flow.svg` files yet, the JSX renders (the `<Img>` shows broken). Close Studio with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add src/remotion package.json
git commit -m "feat(remotion): add Slide composition, Root entrypoint, bundler wrapper"
```

---

## Task 13 — Render library (programmatic renderStill wrapper)

**Files:**
- Create: `src/lib/render.ts`
- Test: `tests/unit/render.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/render.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildOutputPath } from '@/lib/render';

describe('buildOutputPath', () => {
  it('produces a path under output dir with composition id and id segment', () => {
    const p = buildOutputPath('Slide', 'abc123');
    expect(p).toMatch(/output[\\/]Slide-abc123\.png$/);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run tests/unit/render.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement render lib**

Create `src/lib/render.ts`:
```ts
import path from 'node:path';
import crypto from 'node:crypto';
import { renderStill, selectComposition } from '@remotion/renderer';
import type { SlideSpec } from '@/schema/slideSpec';
import { assetExists } from '@/assets';
import { log } from './log';

const OUTPUT_DIR = process.env.OUTPUT_DIR ?? path.resolve(process.cwd(), 'output');

export function buildOutputPath(compositionId: string, id: string): string {
  return path.join(OUTPUT_DIR, `${compositionId}-${id}.png`);
}

export function shortId(): string {
  return crypto.randomBytes(6).toString('hex');
}

export function assertAssetsResolvable(slide: SlideSpec): void {
  for (const block of slide.blocks) {
    if (block.type === 'Illustration') {
      if (!assetExists(block.assetId)) {
        const err: Error & { code?: string; assetId?: string } = new Error(
          `asset_not_found:${block.assetId}`,
        );
        err.code = 'ASSET_NOT_FOUND';
        err.assetId = block.assetId;
        throw err;
      }
    }
  }
}

export interface RenderStillArgs {
  serveUrl: string;
  slide: SlideSpec;
}

export interface RenderStillResult {
  file: string;
  durationMs: number;
}

export async function renderSlideStill({ serveUrl, slide }: RenderStillArgs): Promise<RenderStillResult> {
  assertAssetsResolvable(slide);
  const id = shortId();
  const output = buildOutputPath(slide.compositionId, id);
  const start = Date.now();

  const composition = await selectComposition({
    serveUrl,
    id: slide.compositionId,
    inputProps: slide,
  });

  await renderStill({
    composition,
    serveUrl,
    output,
    inputProps: slide,
  });

  const durationMs = Date.now() - start;
  log.info('render.complete', { compositionId: slide.compositionId, file: output, durationMs });
  return { file: output, durationMs };
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run tests/unit/render.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/render.ts tests/unit/render.test.ts
git commit -m "feat(lib): add render wrapper with asset validation and output path helper"
```

---

## Task 14 — Express server bootstrap with Remotion bundle al boot

**Files:**
- Create: `src/server/index.ts`

The route handlers come in next tasks; this one just wires bootstrap + bundle. Health route is included inline so the server is testable.

- [ ] **Step 1: Implement bootstrap**

Create `src/server/index.ts`:
```ts
import 'dotenv/config';
import express from 'express';
import { log } from '@/lib/log';
import { buildBundle } from '@/remotion/bundler';

const PORT = Number(process.env.PORT ?? 3001);

async function main() {
  log.info('server.boot', { port: PORT });

  let serveUrl: string;
  try {
    serveUrl = await buildBundle();
  } catch (err) {
    log.error('bundle.failed', { message: (err as Error).message });
    process.exit(1);
  }

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.locals.serveUrl = serveUrl;
  app.locals.bundleReady = true;

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', bundleReady: app.locals.bundleReady === true });
  });

  app.listen(PORT, () => {
    log.info('server.listening', { port: PORT });
  });
}

main().catch((err) => {
  log.error('server.fatal', { message: (err as Error).message });
  process.exit(1);
});
```

- [ ] **Step 2: Install dotenv**

Run:
```bash
npm install dotenv
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS, no TS errors.

- [ ] **Step 4: Commit**

```bash
git add src/server/index.ts package.json package-lock.json
git commit -m "feat(server): add Express bootstrap with Remotion bundle at boot"
```

---

## Task 15 — Error handler middleware

**Files:**
- Create: `src/server/errors.ts`
- Test: `tests/integration/errors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/errors.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { errorHandler } from '@/server/errors';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.get('/validation', (_req, _res, next) => {
    try { z.object({ x: z.number() }).parse({}); }
    catch (e) { next(e); }
  });
  app.get('/asset', (_req, _res, next) => {
    const err: Error & { code?: string; assetId?: string } = new Error('asset_not_found:foo');
    err.code = 'ASSET_NOT_FOUND';
    err.assetId = 'foo';
    next(err);
  });
  app.get('/boom', (_req, _res, next) => next(new Error('kaboom')));
  app.use(errorHandler);
  return app;
}

describe('error handler', () => {
  it('maps ZodError to 400', async () => {
    const res = await request(buildApp()).get('/validation');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation');
    expect(Array.isArray(res.body.issues)).toBe(true);
  });

  it('maps ASSET_NOT_FOUND to 422', async () => {
    const res = await request(buildApp()).get('/asset');
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('asset_not_found');
    expect(res.body.assetId).toBe('foo');
  });

  it('maps generic errors to 500', async () => {
    const res = await request(buildApp()).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('render_failure');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run tests/integration/errors.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement error handler**

Create `src/server/errors.ts`:
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

  log.error('render.failure', { message: (err as Error).message });
  res.status(500).json({ error: 'render_failure', message: (err as Error).message });
};
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run tests/integration/errors.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add src/server/errors.ts tests/integration/errors.test.ts
git commit -m "feat(server): add centralized error handler for validation/asset/render failures"
```

---

## Task 16 — Routes: discovery endpoints (/compositions, /primitives, /layouts, /theme, /assets)

**Files:**
- Create: `src/server/routes.ts`
- Modify: `src/server/index.ts` — mount routes
- Test: `tests/integration/discovery.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/discovery.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mountDiscoveryRoutes } from '@/server/routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  mountDiscoveryRoutes(app);
  return app;
}

describe('discovery endpoints', () => {
  it('GET /compositions lists Slide', async () => {
    const res = await request(buildApp()).get('/compositions');
    expect(res.status).toBe(200);
    expect(res.body.compositions[0]).toMatchObject({ id: 'Slide', width: 1080, height: 1350 });
  });

  it('GET /primitives returns all primitive names', async () => {
    const res = await request(buildApp()).get('/primitives');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(expect.arrayContaining(['Headline', 'RichText', 'Illustration', 'Footer']));
  });

  it('GET /layouts returns headline-body-illustration', async () => {
    const res = await request(buildApp()).get('/layouts');
    expect(res.status).toBe(200);
    expect(res.body['headline-body-illustration']).toMatchObject({ slots: ['Headline', 'RichText', 'Illustration'] });
  });

  it('GET /theme returns colors/typography/spacing', async () => {
    const res = await request(buildApp()).get('/theme');
    expect(res.status).toBe(200);
    expect(res.body.colors['brand-navy']).toMatch(/^#/);
  });

  it('GET /assets returns manifest entries', async () => {
    const res = await request(buildApp()).get('/assets');
    expect(res.status).toBe(200);
    expect(res.body['logo-f']).toMatchObject({ path: expect.stringContaining('logo-f.svg') });
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run tests/integration/discovery.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement routes**

Create `src/server/routes.ts`:
```ts
import type { Express } from 'express';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { primitives } from '@/primitives';
import { layouts } from '@/layouts';
import { theme } from '@/theme';
import { listAssets } from '@/assets';

export function mountDiscoveryRoutes(app: Express): void {
  app.get('/compositions', (_req, res) => {
    res.json({
      compositions: [{ id: 'Slide', width: 1080, height: 1350, fps: 30 }],
    });
  });

  app.get('/primitives', (_req, res) => {
    const out: Record<string, { schema: unknown }> = {};
    for (const [name, entry] of Object.entries(primitives)) {
      out[name] = { schema: zodToJsonSchema(entry.schema, name) };
    }
    res.json(out);
  });

  app.get('/layouts', (_req, res) => {
    const out: Record<string, { description: string; slots: string[] }> = {};
    for (const [id, entry] of Object.entries(layouts)) {
      out[id] = { description: entry.meta.description, slots: entry.meta.slots };
    }
    res.json(out);
  });

  app.get('/theme', (_req, res) => {
    res.json(theme);
  });

  app.get('/assets', (_req, res) => {
    res.json(listAssets());
  });
}
```

- [ ] **Step 4: Mount routes in server**

Modify `src/server/index.ts` — after the `/health` route and before `app.listen`, add:
```ts
import { mountDiscoveryRoutes } from './routes';
import { errorHandler } from './errors';
```
Add inside `main()` after `app.get('/health', ...)`:
```ts
  mountDiscoveryRoutes(app);
  app.use(errorHandler);
```

- [ ] **Step 5: Run test, verify it passes**

Run: `npx vitest run tests/integration/discovery.test.ts`
Expected: PASS (5 test).

- [ ] **Step 6: Commit**

```bash
git add src/server/routes.ts src/server/index.ts tests/integration/discovery.test.ts
git commit -m "feat(server): add discovery endpoints (/compositions /primitives /layouts /theme /assets)"
```

---

## Task 17 — Route POST /render/still

**Files:**
- Modify: `src/server/routes.ts` — add `mountRenderRoutes`
- Modify: `src/server/index.ts` — mount render routes
- Test: `tests/integration/renderStill.test.ts`

- [ ] **Step 1: Write the failing test (mocked render)**

Create `tests/integration/renderStill.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('@/lib/render', () => ({
  renderSlideStill: vi.fn(async () => ({ file: '/abs/output/Slide-mock.png', durationMs: 42 })),
  assertAssetsResolvable: vi.fn(),
}));

import { mountRenderRoutes } from '@/server/routes';
import { errorHandler } from '@/server/errors';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.locals.serveUrl = 'http://mock';
  mountRenderRoutes(app);
  app.use(errorHandler);
  return app;
}

const validSlide = {
  compositionId: 'Slide',
  format: 'post-portrait',
  layout: 'headline-body-illustration',
  background: 'paper',
  chrome: { showLogo: true, showCarouselNav: true, pageIndex: 3 },
  blocks: [
    { type: 'Headline', text: 'x', size: 'xl' },
    { type: 'RichText', content: [{ kind: 'paragraph', text: 'p' }] },
    { type: 'Illustration', assetId: 'money-time-flow' },
  ],
};

describe('POST /render/still', () => {
  it('returns 200 with file path for valid slide', async () => {
    const res = await request(buildApp()).post('/render/still').send({ slide: validSlide });
    expect(res.status).toBe(200);
    expect(res.body.file).toBe('/abs/output/Slide-mock.png');
    expect(typeof res.body.durationMs).toBe('number');
  });

  it('returns 400 for invalid slide', async () => {
    const res = await request(buildApp()).post('/render/still').send({ slide: { ...validSlide, blocks: [] } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation');
  });

  it('returns 400 if body missing slide key', async () => {
    const res = await request(buildApp()).post('/render/still').send({});
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run tests/integration/renderStill.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add mountRenderRoutes**

Append to `src/server/routes.ts`:
```ts
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { SlideSpecSchema } from '@/schema/slideSpec';
import { renderSlideStill } from '@/lib/render';

const StillBodySchema = z.object({ slide: SlideSpecSchema });

export function mountRenderRoutes(app: Express): void {
  app.post('/render/still', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { slide } = StillBodySchema.parse(req.body);
      const serveUrl = req.app.locals.serveUrl as string;
      const result = await renderSlideStill({ serveUrl, slide });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });
}
```

- [ ] **Step 4: Mount in server**

Modify `src/server/index.ts`. Add import:
```ts
import { mountDiscoveryRoutes, mountRenderRoutes } from './routes';
```
Add after `mountDiscoveryRoutes(app)`:
```ts
  mountRenderRoutes(app);
```
Move `app.use(errorHandler)` to be **last** (after all routes).

- [ ] **Step 5: Run test, verify it passes**

Run: `npx vitest run tests/integration/renderStill.test.ts`
Expected: PASS (3 test).

- [ ] **Step 6: Commit**

```bash
git add src/server/routes.ts src/server/index.ts tests/integration/renderStill.test.ts
git commit -m "feat(server): add POST /render/still endpoint with Zod-validated body"
```

---

## Task 18 — Route POST /render/carousel

**Files:**
- Modify: `src/server/routes.ts` — extend `mountRenderRoutes`
- Test: `tests/integration/renderCarousel.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/renderCarousel.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

let callCount = 0;
vi.mock('@/lib/render', () => ({
  renderSlideStill: vi.fn(async () => {
    callCount += 1;
    return { file: `/abs/output/Slide-${callCount}.png`, durationMs: 10 };
  }),
  assertAssetsResolvable: vi.fn(),
}));

import { mountRenderRoutes } from '@/server/routes';
import { errorHandler } from '@/server/errors';

function buildApp() {
  callCount = 0;
  const app = express();
  app.use(express.json());
  app.locals.serveUrl = 'http://mock';
  mountRenderRoutes(app);
  app.use(errorHandler);
  return app;
}

const slide = {
  compositionId: 'Slide',
  format: 'post-portrait',
  layout: 'headline-body-illustration',
  background: 'paper',
  chrome: { showLogo: true, showCarouselNav: true },
  blocks: [
    { type: 'Headline', text: 'x', size: 'md' },
    { type: 'RichText', content: [{ kind: 'paragraph', text: 'p' }] },
    { type: 'Illustration', assetId: 'money-time-flow' },
  ],
};

describe('POST /render/carousel', () => {
  it('renders N slides and returns N files', async () => {
    const res = await request(buildApp())
      .post('/render/carousel')
      .send({ slides: [slide, slide, slide] });
    expect(res.status).toBe(200);
    expect(res.body.files).toHaveLength(3);
    expect(typeof res.body.durationMs).toBe('number');
  });

  it('returns 400 if any slide invalid', async () => {
    const bad = { ...slide, blocks: [] };
    const res = await request(buildApp())
      .post('/render/carousel')
      .send({ slides: [slide, bad] });
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty slides array', async () => {
    const res = await request(buildApp())
      .post('/render/carousel')
      .send({ slides: [] });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run tests/integration/renderCarousel.test.ts`
Expected: FAIL.

- [ ] **Step 3: Extend mountRenderRoutes**

In `src/server/routes.ts`, after the still route definition (still inside `mountRenderRoutes`), add:
```ts
  const CarouselBodySchema = z.object({ slides: z.array(SlideSpecSchema).min(1) });

  app.post('/render/carousel', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { slides } = CarouselBodySchema.parse(req.body);
      const serveUrl = req.app.locals.serveUrl as string;
      const start = Date.now();
      const files: string[] = [];
      for (const slide of slides) {
        const r = await renderSlideStill({ serveUrl, slide });
        files.push(r.file);
      }
      res.json({ files, durationMs: Date.now() - start });
    } catch (err) {
      next(err);
    }
  });
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run tests/integration/renderCarousel.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add src/server/routes.ts tests/integration/renderCarousel.test.ts
git commit -m "feat(server): add POST /render/carousel endpoint (serial rendering)"
```

---

## Task 19 — Manual smoke test of running server

**Files:** None (runtime verification).

This is the first end-to-end check. **Requires** the SVG assets to be placed in `public/`. If they don't exist yet, ask the user to provide them before running this task.

- [ ] **Step 1: Place asset files**

Ensure the user has dropped:
- `public/brand/logo-f.svg`
- `public/illustrations/money-time-flow.svg`

If missing, halt here and inform the user.

- [ ] **Step 2: Copy .env**

Run:
```bash
cp .env.example .env
```

- [ ] **Step 3: Start the dev server**

Run in one terminal:
```bash
npm run dev
```

Expected: structured JSON logs showing `server.boot`, `bundle.start`, `bundle.complete`, `server.listening` on port 3001. No crashes.

- [ ] **Step 4: Hit /health**

In another terminal:
```bash
curl http://localhost:3001/health
```

Expected: `{"status":"ok","bundleReady":true}`

- [ ] **Step 5: Hit /render/still with the leva-del-tempo slide**

Create `examples/leva-del-tempo.json`:
```json
{
  "slide": {
    "compositionId": "Slide",
    "format": "post-portrait",
    "layout": "headline-body-illustration",
    "background": "paper",
    "chrome": { "showLogo": true, "showCarouselNav": true, "pageIndex": 3 },
    "blocks": [
      { "type": "Headline", "text": "La leva del tempo", "size": "xl", "color": "brand-navy" },
      { "type": "RichText", "content": [
        { "kind": "paragraph", "text": "Per Mirco, il vantaggio non sono i soldi, ma il tempo." },
        { "kind": "bullets", "items": [
          "Ha davanti a sé circa 30-35 anni di lavoro.",
          "Più tempo = più interesse composto.",
          "Sul lunghissimo periodo, i mercati azionari hanno reso il 7-8% all'anno.",
          "Il tempo gli permetterà di partire da piccole cifre a un capitale importante per la sua pensione."
        ]}
      ]},
      { "type": "Illustration", "assetId": "money-time-flow", "caption": "Tempo" }
    ]
  }
}
```

Run:
```bash
curl -X POST http://localhost:3001/render/still \
  -H "Content-Type: application/json" \
  --data-binary @examples/leva-del-tempo.json
```

Expected: `{"file":"/abs/path/output/Slide-XXXX.png","durationMs":<number>}`

- [ ] **Step 6: Visually inspect the PNG**

Open the returned file. Confirm it shows:
- Paper background
- Logo at top center
- "La leva del tempo" headline in brand-navy
- Bullet list rendered legibly
- Illustration + "Tempo" caption at bottom
- Carousel nav arrows on sides + page indicator at bottom right

If visually acceptable to the founder, proceed to Task 20 to capture as baseline. If not, iterate on chrome/layout/primitive styling in Studio before continuing.

- [ ] **Step 7: Stop the dev server**

Ctrl+C in the dev terminal.

- [ ] **Step 8: Commit example**

```bash
git add examples/leva-del-tempo.json
git commit -m "docs: add leva-del-tempo example slide spec"
```

---

## Task 20 — Snapshot test (acceptance test of v1)

**Files:**
- Create: `tests/snapshot/fixtures/leva-del-tempo.json`
- Create: `tests/snapshot/levaDelTempo.test.ts`
- Create: `tests/snapshot/baselines/.gitkeep`

- [ ] **Step 1: Copy the example as fixture**

Run:
```bash
mkdir -p tests/snapshot/baselines tests/snapshot/fixtures
cp examples/leva-del-tempo.json tests/snapshot/fixtures/leva-del-tempo.json
touch tests/snapshot/baselines/.gitkeep
```

- [ ] **Step 2: Write the snapshot test**

Create `tests/snapshot/levaDelTempo.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { buildBundle } from '@/remotion/bundler';
import { renderSlideStill } from '@/lib/render';
import type { SlideSpec } from '@/schema/slideSpec';

const FIXTURE = path.resolve('tests/snapshot/fixtures/leva-del-tempo.json');
const BASELINE = path.resolve('tests/snapshot/baselines/leva-del-tempo.png');
const TOLERANCE_RATIO = 0.01; // 1%

let serveUrl: string;

beforeAll(async () => {
  serveUrl = await buildBundle();
}, 60_000);

describe('snapshot: leva-del-tempo', () => {
  it('matches baseline (or creates one on first run)', async () => {
    const raw = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    const slide: SlideSpec = raw.slide;

    const { file } = await renderSlideStill({ serveUrl, slide });

    if (!fs.existsSync(BASELINE)) {
      fs.copyFileSync(file, BASELINE);
      console.warn(`[snapshot] created new baseline at ${BASELINE} — review it and commit`);
      return;
    }

    const actual = PNG.sync.read(fs.readFileSync(file));
    const expected = PNG.sync.read(fs.readFileSync(BASELINE));
    expect(actual.width).toBe(expected.width);
    expect(actual.height).toBe(expected.height);

    const diff = new PNG({ width: actual.width, height: actual.height });
    const numDiffPixels = pixelmatch(
      actual.data, expected.data, diff.data,
      actual.width, actual.height,
      { threshold: 0.1 },
    );
    const totalPixels = actual.width * actual.height;
    const ratio = numDiffPixels / totalPixels;

    if (ratio > TOLERANCE_RATIO) {
      const diffPath = path.resolve('output/leva-del-tempo.diff.png');
      fs.writeFileSync(diffPath, PNG.sync.write(diff));
      console.error(`[snapshot] diff ratio ${ratio.toFixed(4)} exceeds tolerance. Diff saved to ${diffPath}`);
    }
    expect(ratio).toBeLessThanOrEqual(TOLERANCE_RATIO);
  }, 60_000);
});
```

- [ ] **Step 3: Run the test the first time (creates baseline)**

Run: `npx vitest run tests/snapshot/levaDelTempo.test.ts`
Expected: PASS with warning `[snapshot] created new baseline ...`.

- [ ] **Step 4: Inspect the baseline**

Open `tests/snapshot/baselines/leva-del-tempo.png`. Confirm it is visually acceptable (founder judgment). If not acceptable, delete the baseline, iterate on primitives/layout/chrome via Studio, and re-run.

- [ ] **Step 5: Run the test again (regression check)**

Run: `npx vitest run tests/snapshot/levaDelTempo.test.ts`
Expected: PASS (1 test) — now comparing against the baseline you just committed.

- [ ] **Step 6: Commit baseline + test**

```bash
git add tests/snapshot
git commit -m "test(snapshot): add leva-del-tempo acceptance snapshot test + baseline"
```

---

## Task 21 — README + acceptance verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

Create `README.md`:
```markdown
# ig-auto-builder — Render Service

Microservizio HTTP locale che trasforma uno `SlideSpec` JSON in PNG via Remotion.
Parte della pipeline di automazione contenuti Finvestire.

## Quickstart

```bash
npm install
cp .env.example .env

# Sviluppo Express (con tsx watch)
npm run dev

# Remotion Studio per iterare visualmente
npm run studio

# Run test suite
npm test
```

## Endpoint

| Metodo | Path | Scopo |
|---|---|---|
| `POST` | `/render/still` | Renderizza 1 PNG da uno `SlideSpec` |
| `POST` | `/render/carousel` | Renderizza N PNG da `SlideSpec[]` |
| `GET` | `/compositions` | Metadati composition `Slide` |
| `GET` | `/primitives` | Catalogo primitive + JSON Schema |
| `GET` | `/layouts` | Catalogo layout preset |
| `GET` | `/theme` | Token brand (colori, font, spacing) |
| `GET` | `/assets` | Manifest asset library |
| `GET` | `/health` | Health check |

## Esempio request

```bash
curl -X POST http://localhost:3001/render/still \
  -H "Content-Type: application/json" \
  --data-binary @examples/leva-del-tempo.json
```

Risposta: `{ "file": "/abs/path/output/Slide-XXXX.png", "durationMs": 1820 }`

## Stack
- Node + TypeScript
- Remotion 4 (rendering)
- Express 4 (HTTP)
- Zod (validation)
- Vitest + pixelmatch (test + snapshot diff)

## Documenti

- Design v1: `docs/superpowers/specs/2026-05-24-render-service-v1-design.md`
- Piano implementazione: `docs/superpowers/plans/2026-05-24-render-service-v1.md`
- Contesto brand: `docs/contesto-progetto-finvestire.md`
```

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: ALL tests PASS (unit + integration + snapshot).

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: PASS, no TS errors.

- [ ] **Step 4: Verify all acceptance criteria from spec §16**

Walk through each item in spec section 16. Check off mentally / verbally:
1. `npm run dev` boots server on 3001 — verified Task 19
2. `npm run studio` shows Slide — verified Task 12
3. `curl POST /render/still` produces PNG — verified Task 19
4. PNG visually equivalent to campione — verified Task 19 step 6 + Task 20 step 4
5. Snapshot test passes — verified Task 20 step 5
6. Discovery endpoints respond — verified Task 16
7. Validation errors → 400 — verified Task 15 + 17
8. Asset errors → 422 — verified Task 15
9. Render errors → 500 without crash — verified Task 15

- [ ] **Step 5: Final commit**

```bash
git add README.md
git commit -m "docs: add README with quickstart, endpoints, and acceptance criteria checklist"
```

---

## Plan complete

Da qui la v1 è production-ready *come MVP locale*. Prossimi passi (fuori scope v1, in ordine consigliato):

1. Estendere primitive (`Eyebrow`, `Subheadline`, `DataRow`, `Quote`, `Chart`)
2. Estendere layout (`hero-stack`, `quote-centered`, `data-grid`)
3. Format aggiuntivi (`post-square`, `story`)
4. Pipeline LLM upstream (Fase 5 piano generale)
5. Image generation modulo separato + integrazione asset library
6. `/render/video` per Reels
7. Deploy (PM2, server, auth se serve)
