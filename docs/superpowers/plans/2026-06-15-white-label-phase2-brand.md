# White-Label Fase 2 — Brand Strutturato (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estrarre ogni dipendenza da Finvestire dal codice e renderla configurabile: colori (6 ruoli semantici), font (bundled + upload), logo (upload), nome brand nei prompt. Il progetto deve funzionare identicamente con qualsiasi brand configurato.

**Architecture:** `BrandKit` in `src/server/brand.ts` viene esteso con `brandColors` strutturato e `font`; `buildHtmlDocument` in `template.ts` genera i CSS var dai valori configurati invece che da `theme/colors.ts`; `buildFontFaceBlock` diventa parametrizzabile; `logo-f` si risolve al logo caricato dall'utente; i prompt-builder ricevono un `BrandVars` con `{ name, fontFamily }` invece di avere "Finvestire"/"Montserrat" hardcoded; i file Finvestire-specifici vengono spostati in `examples/`.

**Tech Stack:** TypeScript, Node `fs`, Express (multer per upload), Vitest, React.

Riferimento spec: `docs/superpowers/specs/2026-06-15-white-label-config-design.md` (Layer B, Layer C, De-Finvestire-izzazione).

---

### Task 1: BrandConfig — schema esteso con colori strutturati e font

**Files:**
- Modify: `src/server/brand.ts`
- Test: `tests/unit/brand/brandConfig.test.ts`

Obiettivo: aggiungere `brandColors` (6 ruoli tipizzati) e `font` all'interfaccia `BrandKit`, con valori di default Finvestire che vengono restituiti quando nessun brand è configurato (backward compat), e aggiornare `brandKitToContext()` per includerli.

- [ ] **Step 1: Scrivi il test**

```ts
// tests/unit/brand/brandConfig.test.ts
import { describe, it, expect } from 'vitest';
import { brandKitToContext, defaultBrandKit } from '@/server/brand';

describe('BrandKit - colori strutturati', () => {
  it('defaultBrandKit ha i 6 ruoli colore con i valori Finvestire', () => {
    const kit = defaultBrandKit();
    expect(kit.brandColors.primary).toBe('#012A78');
    expect(kit.brandColors.positive).toBe('#00B373');
    expect(kit.brandColors.negative).toBe('#DC2626');
    expect(kit.brandColors.paper).toBe('#FFFFFF');
    expect(kit.brandColors.ink).toBe('#101010');
    expect(kit.brandColors.muted).toBe('#767676');
  });

  it('defaultBrandKit ha font Montserrat', () => {
    const kit = defaultBrandKit();
    expect(kit.font.family).toBe('Montserrat');
    expect(kit.font.source).toBe('bundled');
  });

  it('brandKitToContext include i colori e il font', () => {
    const kit = defaultBrandKit();
    kit.name = 'TestBrand';
    const ctx = brandKitToContext(kit);
    expect(ctx).toContain('TestBrand');
    expect(ctx).toContain('#012A78');
    expect(ctx).toContain('Montserrat');
  });
});
```

- [ ] **Step 2: Verifica il fallimento**

Run: `npx vitest run tests/unit/brand/brandConfig.test.ts`
Expected: FAIL — `defaultBrandKit is not exported` o `brandColors` non esiste.

- [ ] **Step 3: Estendi `src/server/brand.ts`**

Sostituisci il file con questa versione aggiornata (mantieni tutti i route handler esistenti — modifica solo l'interfaccia, lo schema, e le funzioni pure):

```ts
import type { Express, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { loadBrandContext } from '@/llm/brandContext';
import { log } from '@/lib/log';

const BRAND_KIT_FILE = process.env.BRAND_KIT_FILE ?? path.resolve(process.cwd(), 'data', 'brand-kit.json');

export interface BrandColors {
  primary: string;   // titoli, bordi, logo bg — era --brand-navy
  positive: string;  // parole positive, crescita — era --brand-green
  negative: string;  // rischio, perdita — era --danger
  paper: string;     // sfondo canvas (quasi sempre #FFFFFF)
  ink: string;       // testo corpo
  muted: string;     // testo secondario, caption
}

export interface BrandFont {
  family: string;
  source: 'bundled' | 'custom';
}

export interface BrandKit {
  name: string;
  tagline: string;
  audience: string;
  tone: string;
  brandColors: BrandColors;
  font: BrandFont;
  logoPath?: string;  // path relativo a data/brand/ per il logo caricato
  // campi testuali invariati
  hashtags: string[];
  ctas: string[];
  dos: string;
  donts: string;
  notes: string;
}

const BrandColorsSchema = z.object({
  primary:  z.string().max(30).default('#012A78'),
  positive: z.string().max(30).default('#00B373'),
  negative: z.string().max(30).default('#DC2626'),
  paper:    z.string().max(30).default('#FFFFFF'),
  ink:      z.string().max(30).default('#101010'),
  muted:    z.string().max(30).default('#767676'),
});

const BrandFontSchema = z.object({
  family: z.string().max(80).default('Montserrat'),
  source: z.enum(['bundled', 'custom']).default('bundled'),
});

const BrandKitSchema = z.object({
  name:        z.string().max(120).default(''),
  tagline:     z.string().max(280).default(''),
  audience:    z.string().max(500).default(''),
  tone:        z.string().max(500).default(''),
  brandColors: BrandColorsSchema.default({}),
  font:        BrandFontSchema.default({}),
  logoPath:    z.string().max(500).optional(),
  hashtags:    z.array(z.string().max(80)).max(40).default([]),
  ctas:        z.array(z.string().max(200)).max(20).default([]),
  dos:         z.string().max(2000).default(''),
  donts:       z.string().max(2000).default(''),
  notes:       z.string().max(4000).default(''),
});

export function defaultBrandKit(): BrandKit {
  return BrandKitSchema.parse({});
}

export function readBrandKit(): BrandKit | null {
  try {
    const raw = JSON.parse(fs.readFileSync(BRAND_KIT_FILE, 'utf8'));
    return BrandKitSchema.parse(raw);
  } catch {
    return null;
  }
}

function writeBrandKit(kit: BrandKit): void {
  fs.mkdirSync(path.dirname(BRAND_KIT_FILE), { recursive: true });
  fs.writeFileSync(BRAND_KIT_FILE, JSON.stringify(kit, null, 2), 'utf8');
}

export function brandKitToContext(kit: BrandKit): string {
  const lines: string[] = ['# CONTESTO BRAND'];
  if (kit.name)     lines.push(`Nome: ${kit.name}`);
  if (kit.tagline)  lines.push(`Tagline: ${kit.tagline}`);
  if (kit.audience) lines.push(`Pubblico target: ${kit.audience}`);
  if (kit.tone)     lines.push(`Tono di voce: ${kit.tone}`);
  const c = kit.brandColors;
  lines.push(`Colori (ruoli semantici): primario ${c.primary}, positivo ${c.positive}, negativo ${c.negative}, sfondo ${c.paper}, testo ${c.ink}, secondario ${c.muted}`);
  lines.push(`Font: ${kit.font.family}`);
  if (kit.hashtags.length) lines.push(`Hashtag ricorrenti: ${kit.hashtags.map(h => `#${h.replace(/^#/, '')}`).join(' ')}`);
  if (kit.ctas.length)     lines.push(`Call-to-action preferite:\n${kit.ctas.map(c => `- ${c}`).join('\n')}`);
  if (kit.dos)   lines.push(`Da fare:\n${kit.dos}`);
  if (kit.donts) lines.push(`Da evitare:\n${kit.donts}`);
  if (kit.notes) lines.push(`Note aggiuntive:\n${kit.notes}`);
  return lines.join('\n');
}

export function resolveBrandContext(override?: string): string {
  if (override) return override;
  const kit = readBrandKit();
  if (kit) return brandKitToContext(kit);
  return loadBrandContext(process.env.BRAND_CONTEXT_FILE ?? 'examples/finvestire/brand-context.md');
}

export function mountBrandRoutes(app: Express): void {
  app.get('/api/brand', (_req, res) => {
    const kit = readBrandKit();
    res.json({ kit: kit ?? defaultBrandKit(), saved: kit !== null });
  });

  app.put('/api/brand', (req: Request, res: Response, next: NextFunction) => {
    try {
      const kit = BrandKitSchema.parse(req.body ?? {});
      writeBrandKit(kit);
      log.info('brand.saved', { name: kit.name });
      res.json({ ok: true, kit });
    } catch (err) {
      next(err);
    }
  });
}
```

- [ ] **Step 4: Esegui il test**

Run: `npx vitest run tests/unit/brand/brandConfig.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verifica suite completa**

Run: `npx vitest run`
Expected: nessuna regressione (i 3 fallimenti preesistenti sandbox/assets/levaDelTempo sono ok).

- [ ] **Step 6: Commit**

```bash
git add src/server/brand.ts tests/unit/brand/brandConfig.test.ts
git commit -m "feat(brand): BrandKit con colori strutturati (6 ruoli) e font"
```

---

### Task 2: CSS var generation — `buildHtmlDocument` legge da BrandKit

**Files:**
- Modify: `src/html/template.ts`
- Modify: `src/html/fonts.ts`
- Test: `tests/unit/html/template.test.ts`

Obiettivo: `buildHtmlDocument` smette di leggere da `theme.colors` e usa i valori del `BrandKit` corrente. I nomi delle CSS var restano invariati (`--brand-navy`, `--brand-green`, ecc.) — alias dei 6 ruoli.

- [ ] **Step 1: Scrivi il test**

```ts
// tests/unit/html/template.test.ts
import { describe, it, expect } from 'vitest';
import { buildHtmlDocument } from '@/html/template';
import type { BrandColors, BrandFont } from '@/server/brand';

const defaultColors: BrandColors = {
  primary: '#012A78', positive: '#00B373', negative: '#DC2626',
  paper: '#FFFFFF', ink: '#101010', muted: '#767676',
};
const defaultFont: BrandFont = { family: 'Montserrat', source: 'bundled' };

describe('buildHtmlDocument brand injection', () => {
  it('inietta i colori del brand nelle CSS var', () => {
    const html = buildHtmlDocument('<p>test</p>', '', false, defaultColors, defaultFont);
    expect(html).toContain('--brand-navy:  #012A78');
    expect(html).toContain('--brand-green: #00B373');
    expect(html).toContain('--danger:      #DC2626');
  });

  it('usa i colori custom quando specificati', () => {
    const custom: BrandColors = { ...defaultColors, primary: '#FF0000', positive: '#00FF00' };
    const html = buildHtmlDocument('<p>test</p>', '', false, custom, defaultFont);
    expect(html).toContain('--brand-navy:  #FF0000');
    expect(html).toContain('--brand-green: #00FF00');
    expect(html).not.toContain('#012A78');
    expect(html).not.toContain('#00B373');
  });

  it('inietta il font-family configurato', () => {
    const font: BrandFont = { family: 'Inter', source: 'bundled' };
    const html = buildHtmlDocument('<p>test</p>', '', false, defaultColors, font);
    expect(html).toContain("--font-family: 'Inter'");
  });
});
```

- [ ] **Step 2: Verifica fallimento**

Run: `npx vitest run tests/unit/html/template.test.ts`
Expected: FAIL — `buildHtmlDocument` non accetta quei parametri.

- [ ] **Step 3: Aggiorna `src/html/template.ts`**

Aggiungi gli import in cima:
```ts
import type { BrandColors, BrandFont } from '@/server/brand';
import { defaultBrandKit } from '@/server/brand';
```

Modifica la firma di `buildHtmlDocument`:
```ts
export function buildHtmlDocument(
  bodyHtml: string,
  css: string,
  showArrow = true,
  brandColors?: BrandColors,
  brandFont?: BrandFont,
): string {
```

All'inizio della funzione, subito prima di `const fontFaces = buildFontFaceBlock()`:
```ts
  const kit = defaultBrandKit();
  const colors = brandColors ?? kit.brandColors;
  const font = brandFont ?? kit.font;
```

Nel blocco `:root`, sostituisci le 6 righe che leggono `c['brand-navy']` ecc. con:
```ts
  --brand-navy:  ${colors.primary};
  --brand-green: ${colors.positive};
  --paper:       ${colors.paper};
  --ink:         ${colors.ink};
  --muted:       ${colors.muted};
  --danger:      ${colors.negative};
  --font-family: '${font.family}', sans-serif;
```

Aggiorna anche la riga che usava `--font-family: 'Montserrat', sans-serif;` (rimuovi la riga separata, ora è già nel blocco `:root`).

Rimuovi anche le righe `const c = theme.colors;` e `const sp = theme.spacing;` e sostituisci i riferimenti a `sp.*` con i valori hardcoded dallo spacing theme (i valori non cambiano con il brand):
```ts
  --space-xs:  8px;
  --space-sm:  16px;
  --space-md:  24px;
  --space-lg:  40px;
  --space-xl:  64px;
  --space-2xl: 96px;
```

- [ ] **Step 4: Aggiorna `buildFontFaceBlock` in `src/html/fonts.ts`**

Aggiungi il parametro `fontFamily`:

```ts
export function buildFontFaceBlock(fontFamily = 'Montserrat'): string {
  // Per font custom (in data/fonts/custom/), usa quella directory.
  // Per font bundled, usa public/fonts/.
  const customDir = path.resolve(process.cwd(), 'data', 'fonts', 'custom');
  const bundledDir = FONTS_DIR; // public/fonts

  const fontsDir = fs.existsSync(path.join(customDir, `${fontFamily}-Regular.woff2`))
    ? customDir
    : bundledDir;

  const VARIANTS: FontVariant[] = [
    { weight: 400, file: `${fontFamily}-Regular.woff2` },
    { weight: 500, file: `${fontFamily}-Medium.woff2` },
    { weight: 600, file: `${fontFamily}-SemiBold.woff2` },
    { weight: 700, file: `${fontFamily}-Bold.woff2` },
    { weight: 800, file: `${fontFamily}-ExtraBold.woff2` },
  ];
  // ... resto uguale ma con fontsDir e fontFamily variabili
```

Rimuovi il caching (`cachedBlock`) perché ora dipende dal parametro family. Sostituisci `'Montserrat'` nella stringa `font-family` con `fontFamily`.

Infine aggiorna la chiamata in `template.ts`:
```ts
const fontFaces = buildFontFaceBlock(font.family);
```

- [ ] **Step 5: Aggiorna i chiamanti di `buildHtmlDocument`**

Cerca tutti i chiamanti di `buildHtmlDocument` nel backend:

Run: `grep -r "buildHtmlDocument" src/`

Per ogni chiamante che non passa `brandColors`/`brandFont`, aggiungi la lettura dal brand kit:
```ts
import { readBrandKit, defaultBrandKit } from '@/server/brand';
// ...
const kit = readBrandKit() ?? defaultBrandKit();
const html = buildHtmlDocument(bodyHtml, css, showArrow, kit.brandColors, kit.font);
```

I file da aggiornare sono tipicamente `src/html/pipeline.ts` (la chiamata a `buildHtmlDocument` alla riga ~154).

- [ ] **Step 6: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Esegui i test**

Run: `npx vitest run tests/unit/html/template.test.ts tests/unit/html/`
Expected: PASS. Se qualche test esistente in `tests/unit/html/` chiama `buildHtmlDocument` senza i nuovi parametri, aggiornali passando `defaultColors` e `defaultFont` come nel test sopra.

- [ ] **Step 8: Commit**

```bash
git add src/html/template.ts src/html/fonts.ts src/html/pipeline.ts
git add tests/unit/html/template.test.ts
git commit -m "feat(brand): buildHtmlDocument genera CSS var dai colori/font configurati"
```

---

### Task 3: Logo upload — endpoint + risoluzione dinamica

**Files:**
- Create: `src/server/upload.ts`
- Modify: `src/html/template.ts` (risoluzione logo)
- Modify: `src/server/index.ts` (mount upload routes)
- Test: `tests/unit/brand/logoUpload.test.ts`

Obiettivo: l'utente può caricare un logo (PNG/JPG/SVG ≤ 2 MB) che viene salvato in `data/brand/logo.png` (gitignored). Il sistema risolve `logo-f` al logo caricato se presente, altrimenti al default `public/brand/logo.png`.

- [ ] **Step 1: Installa multer**

```bash
npm i multer
npm i -D @types/multer
```

- [ ] **Step 2: Scrivi il test**

```ts
// tests/unit/brand/logoUpload.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveLogoPath } from '@/server/upload';

describe('resolveLogoPath', () => {
  it('ritorna il logo custom se esiste', () => {
    const tmp = path.join(os.tmpdir(), `logo-${Date.now()}.png`);
    fs.writeFileSync(tmp, 'fake-png');
    try {
      expect(resolveLogoPath(tmp)).toBe(tmp);
    } finally { fs.rmSync(tmp, { force: true }); }
  });

  it('ritorna il logo default se custom non esiste', () => {
    const result = resolveLogoPath('/does/not/exist.png');
    expect(result).toContain('public/brand/logo.png');
  });
});
```

- [ ] **Step 3: Verifica fallimento**

Run: `npx vitest run tests/unit/brand/logoUpload.test.ts`
Expected: FAIL — `Cannot find module '@/server/upload'`.

- [ ] **Step 4: Crea `src/server/upload.ts`**

```ts
// src/server/upload.ts
import type { Express, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { log } from '@/lib/log';

const DATA_BRAND_DIR = path.resolve(process.cwd(), 'data', 'brand');
const CUSTOM_LOGO_PATH = path.join(DATA_BRAND_DIR, 'logo.png');
const DEFAULT_LOGO_PATH = path.resolve(process.cwd(), 'public', 'brand', 'logo.png');

/** Risolve il path del logo: custom caricato → default pubblico. */
export function resolveLogoPath(customPath = CUSTOM_LOGO_PATH): string {
  return fs.existsSync(customPath) ? customPath : DEFAULT_LOGO_PATH;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(DATA_BRAND_DIR, { recursive: true });
    cb(null, DATA_BRAND_DIR);
  },
  filename: (_req, _file, cb) => cb(null, 'logo.png'),
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/svg+xml'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Formato non supportato: usa PNG, JPG o SVG'));
  },
});

export function mountUploadRoutes(app: Express): void {
  app.post('/api/brand/logo', upload.single('logo'), (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) { res.status(400).json({ error: 'nessun file' }); return; }
      log.info('brand.logo.uploaded', { size: req.file.size });
      res.json({ ok: true, path: CUSTOM_LOGO_PATH });
    } catch (err) { next(err); }
  });

  app.get('/api/brand/logo', (_req, res) => {
    const logoPath = resolveLogoPath();
    if (!fs.existsSync(logoPath)) { res.status(404).json({ error: 'logo_not_found' }); return; }
    const ext = path.extname(logoPath).slice(1).toLowerCase();
    const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'png' ? 'image/png' : 'image/jpeg';
    res.setHeader('Content-Type', mime);
    res.sendFile(logoPath);
  });
}
```

- [ ] **Step 5: Aggiorna `template.ts` per usare `resolveLogoPath`**

In `buildAssetDataUris` (o dove viene risolto l'asset `logo-f`), aggiungi la sostituzione dinamica del logo:

```ts
import { resolveLogoPath } from '@/server/upload';

function buildAssetDataUris(): Record<string, string> {
  if (cachedAssetUris !== null) return cachedAssetUris;
  const result: Record<string, string> = {};
  for (const [id, entry] of Object.entries(manifest)) {
    // Per logo-f: usa il logo caricato dall'utente se disponibile.
    const assetPath = id === 'logo-f'
      ? path.relative(PUBLIC_DIR, resolveLogoPath())
      : entry.path;
    const uri = assetToDataUri(assetPath);
    if (uri) result[id] = uri;
  }
  cachedAssetUris = result;
  return result;
}
```

Nota: poiché il logo può cambiare a runtime (upload), rimuovi il caching (`cachedAssetUris`) o rendilo invalido dopo l'upload. La soluzione più semplice: rimuovi `cachedAssetUris` e il caching per ora (ha poco impatto su generazioni singole).

- [ ] **Step 6: Mount upload routes in `src/server/index.ts`**

```ts
import { mountUploadRoutes } from './upload';
// ...
mountUploadRoutes(app);
```

- [ ] **Step 7: TypeScript check + test**

Run: `npx tsc --noEmit`
Run: `npx vitest run tests/unit/brand/logoUpload.test.ts`
Expected: PASS (2 tests), no TS errors.

- [ ] **Step 8: Commit**

```bash
git add src/server/upload.ts src/html/template.ts src/server/index.ts
git add tests/unit/brand/logoUpload.test.ts
git commit -m "feat(brand): logo upload endpoint + risoluzione dinamica logo-f"
```

---

### Task 4: Prompt brand injection — BrandVars nei prompt

**Files:**
- Create: `src/html/brandVars.ts`
- Modify: `src/html/htmlSystemPrompt.ts`
- Modify: `src/html/designSpec.ts`
- Modify: `src/html/pipeline.ts`
- Modify: `src/content/research.ts`
- Modify: `src/content/researchReview.ts`
- Modify: `src/content/plan.ts`
- Modify: `src/content/planReview.ts`
- Modify: `src/content/review.ts`
- Modify: `src/content/orchestrate.ts`
- Test: `tests/unit/html/brandVars.test.ts`

Obiettivo: sostituire ogni occorrenza hardcoded di "Finvestire" e "Montserrat" nei prompt con variabili derivate dal `BrandKit`. Il test di snapshot verifica che con un brand diverso configurato non resti nessun letterale "Finvestire" nei prompt generati.

- [ ] **Step 1: Crea `src/html/brandVars.ts`**

```ts
// src/html/brandVars.ts
import { readBrandKit, defaultBrandKit } from '@/server/brand';

export interface BrandVars {
  name: string;
  fontFamily: string;
}

export function getBrandVars(): BrandVars {
  const kit = readBrandKit() ?? defaultBrandKit();
  return {
    name: kit.name || 'il brand',
    fontFamily: kit.font.family,
  };
}
```

- [ ] **Step 2: Scrivi il test**

```ts
// tests/unit/html/brandVars.test.ts
import { describe, it, expect } from 'vitest';
import { buildHtmlSystemPrompt } from '@/html/htmlSystemPrompt';
import type { BrandVars } from '@/html/brandVars';

const testVars: BrandVars = { name: 'AcmeCorp', fontFamily: 'Inter' };

describe('prompt brand injection', () => {
  it('il system prompt NON contiene "Finvestire" quando il brand è AcmeCorp', () => {
    const prompt = buildHtmlSystemPrompt('brand context test', undefined, false, testVars);
    expect(prompt).not.toContain('Finvestire');
    expect(prompt).toContain('AcmeCorp');
  });

  it('il system prompt NON contiene "Montserrat" hardcoded quando il font è Inter', () => {
    const prompt = buildHtmlSystemPrompt('brand context test', undefined, false, testVars);
    expect(prompt).not.toContain('Montserrat');
    expect(prompt).toContain('Inter');
  });
});
```

- [ ] **Step 3: Verifica fallimento**

Run: `npx vitest run tests/unit/html/brandVars.test.ts`
Expected: FAIL — `buildHtmlSystemPrompt` non accetta il 4° parametro, e il prompt contiene "Finvestire" e "Montserrat".

- [ ] **Step 4: Aggiorna `src/html/htmlSystemPrompt.ts`**

Modifica la firma:
```ts
import type { BrandVars } from './brandVars';

export function buildHtmlSystemPrompt(
  brandContext: string,
  role?: SlideRole,
  selfContained = false,
  vars?: BrandVars,
): string {
  const brandName = vars?.name ?? 'il brand';
  const fontFamily = vars?.fontFamily ?? 'Montserrat';
  const fontWeights = '400 / 500 / 600 / 700 / 800';
```

Poi cerca e sostituisci nel testo del prompt:
- `"Finvestire (Italian educational finance content)"` → `"${brandName}"`  
- `"senior Instagram designer for Finvestire"` → `"senior Instagram designer for ${brandName}"`
- `"Font: **Montserrat** only. Available weights: 400–800."` → `` `Font: **${fontFamily}** only. Available weights: ${fontWeights}.` ``
- `"'Montserrat', sans-serif"` → `` `'${fontFamily}', sans-serif` ``
- Qualsiasi altra occorrenza di `Montserrat` o `Finvestire` nel template

- [ ] **Step 5: Aggiorna `src/html/pipeline.ts`**

Importa e passa i `BrandVars` alla costruzione del system prompt:
```ts
import { getBrandVars } from './brandVars';
// ...
const vars = getBrandVars();
const systemPrompt = buildHtmlSystemPrompt(brandContext, role, args.selfContained, vars);
```

- [ ] **Step 6: Aggiorna i prompt content (research, plan, review)**

In ogni file che contiene "Finvestire" nel testo del prompt, sostituisci con il nome brand da `BrandVars`. Il pattern è: i prompt accettano già `brandContext` (testo libero), quindi il modo più semplice è aggiungere il nome del brand come variabile separata.

**`src/content/research.ts`** — in `buildResearchPrompt`, aggiungi `brandName: string` come parametro e sostituisci "Finvestire" nel testo:
```ts
function buildResearchPrompt(topic, instructions, format, slideCount, brandName, feedback?) {
  // "ricercatore senior di finanza personale ... per Finvestire"
  // → `ricercatore senior per ${brandName}`
```

Aggiorna `ResearchArgs` con `brandName: string` e la chiamata in `researchTopic`.

**`src/content/researchReview.ts`** — stesso pattern in `buildReviewerPrompt`.

**`src/content/plan.ts`** — nel system prompt del planner (`buildPlannerSystemPrompt`), sostituisci `"Finvestire (italiano)"` → `` `${brandName} (italiano)` ``.

**`src/content/planReview.ts`** — idem.

**`src/content/review.ts`** — `REVIEWER_PROMPT` usa "Finvestire": rendilo un template function `buildReviewerPrompt(brandName)`.

**`src/content/orchestrate.ts`** — `GenerateContentArgs` aggiunge `brandName?: string` (se assente, si legge da `getBrandVars().name`). Thread attraverso le chiamate a research/plan/review.

- [ ] **Step 7: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Esegui i test**

Run: `npx vitest run tests/unit/html/brandVars.test.ts tests/unit/html/htmlSystemPrompt.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/html/brandVars.ts src/html/htmlSystemPrompt.ts src/html/pipeline.ts
git add src/content/research.ts src/content/researchReview.ts src/content/plan.ts
git add src/content/planReview.ts src/content/review.ts src/content/orchestrate.ts
git add tests/unit/html/brandVars.test.ts
git commit -m "feat(brand): brand name e font iniettati nei prompt (zero Finvestire hardcoded)"
```

---

### Task 5: De-Finvestire-izzazione — sposta file specifici in `examples/`

**Files:**
- Rename/Move: `docs/contesto-progetto-finvestire.md` → `examples/finvestire/brand-context.md`
- Copy + replace: `public/brand/logo.png` → `examples/finvestire/logo.png` + logo placeholder in `public/brand/`

Obiettivo: un nuovo utente che clona il repo non vede nessun riferimento a Finvestire nelle path di default; trova però un esempio funzionante in `examples/finvestire/`.

- [ ] **Step 1: Crea la directory `examples/finvestire/`**

```bash
mkdir -p examples/finvestire
```

- [ ] **Step 2: Sposta il documento brand Finvestire**

```bash
git mv docs/contesto-progetto-finvestire.md examples/finvestire/brand-context.md
```

- [ ] **Step 3: Copia il logo e aggiungi un placeholder**

```bash
cp public/brand/logo.png examples/finvestire/logo.png
```

Per il logo placeholder in `public/brand/logo.png`: se esiste già un logo generico da usare come default, usalo. Altrimenti, il logo Finvestire rimane come default fino a quando l'utente ne carica uno proprio (è già funzionale, solo non è "bianco"). Aggiungi una nota nel README.

Tieni il file `public/brand/logo.png` com'è per ora (non vuoto — serve come fallback quando nessun logo è stato caricato).

- [ ] **Step 4: Aggiorna `src/server/brand.ts` — path fallback**

Il path di fallback in `resolveBrandContext()` è già stato aggiornato al Task 1 a `examples/finvestire/brand-context.md`. Verifica che sia corretto.

- [ ] **Step 5: Aggiorna eventuali riferimenti hardcoded alla vecchia path**

Run: `grep -r "contesto-progetto-finvestire" src/ tests/ web/ --include="*.ts" --include="*.tsx"`

Se trovati, aggiorna a `examples/finvestire/brand-context.md`.

- [ ] **Step 6: Crea `examples/finvestire/README.md`**

```markdown
# Esempio Finvestire

Questo è un esempio completo di brand configurato con InstaPilot.

Per usarlo:
1. Copia `brand-context.md` nella pagina Brand Kit (sezione "Note aggiuntive")
2. Carica `logo.png` come logo del brand
3. Imposta i colori: primario #012A78, positivo #00B373
```

- [ ] **Step 7: Commit**

```bash
git add examples/
git add src/server/brand.ts  # solo se modificato in questo task
git commit -m "chore: sposta file Finvestire-specifici in examples/"
```

---

### Task 6: BrandKit UI — color picker + font selector + logo upload

**Files:**
- Modify: `web/src/pages/BrandKit.tsx`
- Modify: `web/src/lib/api.ts` (aggiorna tipo `BrandKit`)

Obiettivo: sostituire il campo "Palette colori" (tag liberi) con 6 color picker denominati, aggiungere il selettore font e il pulsante di upload logo.

- [ ] **Step 1: Aggiorna il tipo `BrandKit` in `web/src/lib/api.ts`**

```ts
export interface BrandColors {
  primary: string;
  positive: string;
  negative: string;
  paper: string;
  ink: string;
  muted: string;
}

export interface BrandFont {
  family: string;
  source: 'bundled' | 'custom';
}

export interface BrandKit {
  name: string;
  tagline: string;
  audience: string;
  tone: string;
  brandColors: BrandColors;
  font: BrandFont;
  logoPath?: string;
  hashtags: string[];
  ctas: string[];
  dos: string;
  donts: string;
  notes: string;
}
```

- [ ] **Step 2: Aggiorna `web/src/pages/BrandKit.tsx`**

Sostituisci la sezione "Visual" (attualmente con `TagInput` per colori e font liberi) con:

```tsx
{/* Brand Colors */}
<section className="space-y-4">
  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Colori</h2>
  {(
    [
      { key: 'primary',  label: 'Primario',   hint: 'Titoli, bordi, logo background' },
      { key: 'positive', label: 'Positivo',   hint: 'Crescita, parole chiave positive' },
      { key: 'negative', label: 'Negativo',   hint: 'Rischio, perdita' },
      { key: 'paper',    label: 'Sfondo',     hint: 'Background del canvas (solitamente bianco)' },
      { key: 'ink',      label: 'Testo',      hint: 'Testo corpo principale' },
      { key: 'muted',    label: 'Secondario', hint: 'Caption, note, testo secondario' },
    ] as const
  ).map(({ key, label, hint }) => (
    <div key={key} className="flex items-center gap-3">
      <input
        type="color"
        value={kit.brandColors[key]}
        onChange={e => set('brandColors', { ...kit.brandColors, [key]: e.target.value })}
        className="w-10 h-10 rounded-md border cursor-pointer p-0.5"
      />
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Input
        className="ml-auto w-28 font-mono text-sm"
        value={kit.brandColors[key]}
        onChange={e => set('brandColors', { ...kit.brandColors, [key]: e.target.value })}
      />
    </div>
  ))}
</section>

<Separator />

{/* Font */}
<section className="space-y-4">
  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Font</h2>
  <div className="space-y-2">
    <Label htmlFor="fontFamily">Font principale</Label>
    <select
      id="fontFamily"
      value={kit.font.family}
      onChange={e => set('font', { ...kit.font, family: e.target.value, source: 'bundled' })}
      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
    >
      <option value="Montserrat">Montserrat (default)</option>
      <option value="Inter">Inter</option>
      <option value="Poppins">Poppins</option>
    </select>
  </div>
</section>

<Separator />

{/* Logo */}
<section className="space-y-4">
  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Logo</h2>
  <div className="flex items-center gap-4">
    <img src="/api/brand/logo" alt="logo attuale" className="w-16 h-16 object-contain rounded-lg border" />
    <div>
      <label htmlFor="logoUpload" className="cursor-pointer">
        <Button type="button" variant="outline" size="sm" asChild>
          <span>Carica logo (PNG/SVG, max 2 MB)</span>
        </Button>
      </label>
      <input
        id="logoUpload"
        type="file"
        accept="image/png,image/jpeg,image/svg+xml"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const fd = new FormData();
          fd.append('logo', file);
          try {
            await fetch('/api/brand/logo', { method: 'POST', body: fd });
            toast.success('Logo caricato');
            // Forza reload dell'immagine
            const img = document.querySelector('img[alt="logo attuale"]') as HTMLImageElement | null;
            if (img) img.src = `/api/brand/logo?t=${Date.now()}`;
          } catch { toast.error('Errore caricamento logo'); }
        }}
      />
      <p className="text-xs text-muted-foreground mt-1">Il logo viene usato in ogni slide generata.</p>
    </div>
  </div>
</section>
```

Aggiorna anche `EMPTY` per includere i nuovi campi:
```ts
const EMPTY: IBrandKit = {
  name: '', tagline: '', audience: '', tone: '',
  brandColors: { primary: '#012A78', positive: '#00B373', negative: '#DC2626', paper: '#FFFFFF', ink: '#101010', muted: '#767676' },
  font: { family: 'Montserrat', source: 'bundled' },
  hashtags: [], ctas: [],
  dos: '', donts: '', notes: '',
};
```

Rimuovi i vecchi campi `colors: []` e `fonts: []` da `EMPTY` e da qualsiasi `set('colors', ...)` / `set('fonts', ...)`.

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit -p web/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/BrandKit.tsx web/src/lib/api.ts
git commit -m "feat(web): brand kit UI con color picker, font selector e logo upload"
```

---

## Self-review notes

- **Spec coverage:** colori strutturati T1, CSS generation T2, font configurable T2, logo upload T3, prompt injection T4, de-Finvestire T5, UI T6. Font upload custom: l'infrastruttura è pronta in T3 (data/fonts/custom/) ma la UI per caricare font custom woff2 è fuori scope per la Fase 2 (complessità licenze) → utente copia i file manualmente in `data/fonts/custom/`.
- **CSS var names:** mantenuti invariati (`--brand-navy`, `--brand-green`, `--danger`) come alias dei ruoli — zero impatto sui prompt e recipes esistenti.
- **Caching asset invalidation:** in T3 viene rimosso il caching di `cachedAssetUris` per permettere il reload del logo dopo upload. Se la performance è un problema, si può reintrodurre con invalidazione esplicita dopo l'upload (Fase 3).
- **Type consistency:** `BrandColors`/`BrandFont` definiti in `src/server/brand.ts` (backend) e replicati in `web/src/lib/api.ts` (frontend) — due definizioni identiche è normale per la separazione client/server; se si volesse un package condiviso è un refactor di Fase 3.
- **No placeholder:** ogni step mostra il codice completo o istruzioni precise. Il font upload woff2 dalla UI è documentato come fuori scope, non lasciato come TODO.
