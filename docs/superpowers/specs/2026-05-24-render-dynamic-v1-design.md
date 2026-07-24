# Render Dynamic v1 — Design

> Endpoint `/render/dynamic`: LLM genera codice Remotion TSX, il render service lo compila e renderizza dentro un bundle persistente. Affianca (non sostituisce) `/render/still` basato su SlideSpec.

## 1. Obiettivo

Dare all'LLM piena espressività Remotion per generare slide visualmente arbitrarie, mantenendo brand identity e performance accettabili. Risolvere il limite del DSL: ogni layout/spaziatura/effetto richiede codice nostro. Con dynamic mode, l'LLM ha accesso diretto a Remotion + brand context, scrive TSX, e il servizio lo esegue.

## 2. Architettura ad alto livello

```
POST /render/dynamic { prompt, brandContext? }
   │
   ▼
[Node] litellm chat completion (Sonnet 4.6 default)
   - system: Remotion rules + Sandbox API + Brand context
   - response_format: json_schema → { intent, code }
   │
   ▼
[Node] sucrase parse (syntax check, no eval)
   │
   ▼
[Node] renderStill(persistentBundle, "DynamicSlide", {
   tsxCode, theme, assets, brandContext
 })
   │
   ▼
[Chromium] DynamicSlide:
   1. delayRender('compiling')
   2. sucrase.transform(tsxCode, { transforms: ['typescript', 'jsx'] })
   3. new Function('React', 'Remotion', 'theme', 'assets', 'primitives',
        `${js}; return Slide;`)
   4. const SlideComponent = factory(React, RemotionAPIs, theme, assets, primitives)
   5. continueRender(handle)
   6. <SlideComponent />
   │
   ▼
PNG → { file, durationMs, llmDurationMs, renderDurationMs, code, intent }
```

**Decisione chiave:** il bundle Remotion viene costruito UNA volta al boot (come per `/render/still`). Compilazione TSX→JS avviene dentro Chromium via sucrase. Niente re-bundling per request → costo per render ≈ render statico + ~50ms di compile.

## 3. Endpoint

### `POST /render/dynamic`

**Request:**
```ts
{
  prompt: string;                    // required: descrizione contenuto della slide
  brandContext?: BrandContext;       // optional: default da env/static
  model?: string;                    // optional: override modello litellm
}
```

**Response 200:**
```ts
{
  file: string;          // absolute path al PNG
  durationMs: number;    // tempo totale request
  llmDurationMs: number; // tempo solo LLM call
  renderDurationMs: number; // tempo solo render
  code: string;          // codice TSX generato (per review/debug)
  intent: string;        // descrizione intent dell'LLM (per review)
}
```

**Errori:**
- `400 validation` — prompt mancante o body malformato
- `422 invalid_code` — il TSX generato non parsa con sucrase
- `500 llm_failure` — litellm errore (timeout, rete, schema)
- `500 render_failure` — errore in Chromium (eval throw, delayRender timeout)

## 4. Sandbox API esposta all'LLM

Dentro `new Function()` il codice riceve queste variabili come parametri:

| Nome | Tipo | Cosa contiene |
|---|---|---|
| `React` | typeof React | Tutta React (hooks inclusi) |
| `Remotion` | object | `{ AbsoluteFill, Img, Video, Audio, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Series, Easing, ... }` |
| `theme` | Theme | Stesso oggetto di `src/theme/index.ts` (colors, typography, spacing) |
| `assets` | Record<string, string> | Map `assetId → URL servito` (già passati per `staticFile`, pronti da usare in `<Img src=...>`) |
| `primitives` | object | `{ Headline, RichText, Illustration, Footer }` — primitive attuali come opzione |

**Contract atteso del codice:** esporta una variabile `Slide` (componente React funzione) come ultima espressione. Esempio:

```tsx
const Slide = () => {
  const { AbsoluteFill, Img } = Remotion;
  return (
    <AbsoluteFill style={{ backgroundColor: theme.colors.paper, padding: 64 }}>
      <div style={{ fontFamily: theme.typography.fontFamily, fontSize: 80, color: theme.colors['brand-navy'], fontWeight: 800 }}>
        La leva del tempo
      </div>
      <Img src={assets['money-time-flow']} style={{ width: 600, marginTop: 80 }} />
    </AbsoluteFill>
  );
};
```

L'LLM **non** può usare `import` / `require` — tutto deve passare dalle variabili iniettate. Lo specifichiamo nel system prompt.

## 5. System prompt (struttura)

Compone tre layer:

1. **Remotion rules** — distillato delle regole base prese dal `llms.txt` di Remotion: niente DOM API che non funzionano in headless (Date.now esclusi animazioni, `useCurrentFrame()` per animazioni, ecc.). Per still rendering siamo a `frame=0` quindi animazioni non sono richieste, ma manteniamo le regole per non avere codice rotto.

2. **Sandbox API** — descrizione delle 5 variabili disponibili con i loro tipi TS (in formato annotato, non vero TS).

3. **Brand context** — caricato da `docs/brand-context.example.md` (sintesi: nome, voice, palette tokens, target audience, do/don't, formato `post-portrait` 1080×1350). Il path è configurabile via env `BRAND_CONTEXT_FILE`.

Il prompt finale è ~1500-2500 token. Lo serializziamo in `src/llm/systemPrompt.ts` con funzione `buildSystemPrompt(brandContext)` per testabilità.

## 6. LLM integration via litellm

Litellm è un proxy OpenAI-compatible. Dal client Node usiamo il pacchetto `openai` puntato all'endpoint litellm:

```ts
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: process.env.LITELLM_BASE_URL,  // es. http://localhost:4000
  apiKey: process.env.LITELLM_API_KEY,
});

const response = await client.chat.completions.create({
  model: process.env.LITELLM_MODEL ?? 'claude-sonnet-4-6',
  messages: [
    { role: 'system', content: buildSystemPrompt(brandContext) },
    { role: 'user', content: prompt },
  ],
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'GeneratedSlide',
      strict: true,
      schema: zodToJsonSchema(GeneratedSlideSchema),
    },
  },
});
```

`GeneratedSlideSchema`:
```ts
z.object({
  intent: z.string().min(1),
  code: z.string().min(1),
})
```

## 7. Compilation pipeline

**Node-side (pre-render):** validazione sintassi con `sucrase.transform(code, { transforms: ['typescript', 'jsx'] })`. Solo controllo che non esploda — non eseguiamo niente lato Node. Se throw → 422.

**Chromium-side (durante render):**
- `delayRender('dynamic.compile')` apre handle
- `sucrase.transform(tsxCode, { transforms: ['typescript', 'jsx'], production: true })` produce JS
- `new Function('React', 'Remotion', 'theme', 'assets', 'primitives', '"use strict"; ' + js + '\n; return Slide;')` produce factory
- Eseguiamo `factory(React, RemotionAPIs, theme, assets, primitives)` → `SlideComponent`
- `continueRender(handle)`
- Render `<SlideComponent />`

Errori di compile/eval throw → vengono intercettati e mostrano "render_failure" con stack al chiamante.

## 8. File structure

```
src/
  llm/
    client.ts             # OpenAI client puntato a litellm
    schema.ts             # Zod per GeneratedSlide
    systemPrompt.ts       # buildSystemPrompt(brand)
    generate.ts           # generateSlideCode(prompt, brandContext)
    brandContext.ts       # loader per docs/brand-context.example.md
  dynamic/
    DynamicSlide.tsx      # composition interpreter
    compile.ts            # sucrase wrapper (works in browser via bundler)
    sandbox.ts            # buildSandboxGlobals()
  server/
    routes.ts             # aggiungere mountDynamicRoutes
  remotion/
    Root.tsx              # registrare composition "DynamicSlide"
tests/
  unit/llm/
    schema.test.ts
    systemPrompt.test.ts
    brandContext.test.ts
  unit/dynamic/
    compile.test.ts
    sandbox.test.ts
  integration/
    renderDynamic.test.ts # mocked LLM
examples/
  dynamic-prompt.txt
```

## 9. Composition `DynamicSlide`

```tsx
// src/dynamic/DynamicSlide.tsx
import React from 'react';
import { AbsoluteFill, delayRender, continueRender, cancelRender } from 'remotion';
import { compileTsx } from './compile';
import { buildSandboxGlobals } from './sandbox';
import type { Theme } from '@/theme';

export interface DynamicSlideProps {
  tsxCode: string;
  theme: Theme;
  assets: Record<string, string>;
  brandContext: unknown;
}

export const DynamicSlide: React.FC<DynamicSlideProps> = ({ tsxCode, theme, assets }) => {
  const [SlideComponent, setSlideComponent] = React.useState<React.FC | null>(null);
  const handleRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (handleRef.current === null) handleRef.current = delayRender('dynamic.compile');
    try {
      const js = compileTsx(tsxCode);
      const factory = new Function('React','Remotion','theme','assets','primitives',
        `"use strict";\n${js}\n;return Slide;`);
      const globals = buildSandboxGlobals(theme, assets);
      const Comp = factory(globals.React, globals.Remotion, theme, assets, globals.primitives);
      setSlideComponent(() => Comp);
      continueRender(handleRef.current);
    } catch (err) {
      cancelRender(err as Error);
    }
  }, [tsxCode]);

  if (!SlideComponent) return <AbsoluteFill />;
  return <SlideComponent />;
};

export const defaultDynamicProps: DynamicSlideProps = {
  tsxCode: 'const Slide = () => React.createElement("div", null, "loading");',
  theme: {} as Theme,
  assets: {},
  brandContext: null,
};
```

## 10. Registrare la composition

Modifichiamo `src/remotion/Root.tsx`:
```tsx
<Composition
  id="DynamicSlide"
  component={DynamicSlide}
  width={1080}
  height={1350}
  fps={30}
  durationInFrames={1}
  defaultProps={defaultDynamicProps}
/>
```

Niente Zod schema sulla composition (gli inputProps li validiamo noi lato server).

## 11. Decisioni risolte

| Decisione | Scelta |
|---|---|
| Sandbox API | Estesa (React, Remotion, theme, assets, primitives) |
| Modello LLM default | claude-sonnet-4-6 via litellm |
| Caching risultati | Rimandato (no v1) |
| Backward compat `/render/still` | Mantenuto |
| Re-bundling vs runtime eval | Runtime eval (Opzione B) |
| TSX compiler | sucrase (production-grade, ~150KB) |
| LLM client | `openai` npm pkg verso litellm endpoint |
| Structured output | `response_format: json_schema` + Zod validation post-risposta |

## 12. Out of scope v1

- Caching risultati (LLM o PNG)
- Streaming response (l'LLM risponde tutto, poi rendiamo)
- Video/Reels (still only — anche se sandbox supporta `useCurrentFrame`, lo provideremmo via `/render/dynamic-video` in v2)
- Skill detection / modular system prompt
- Self-critique / retry chain
- Few-shot examples (v2: aggiungere top-N esempi storici)

## 13. Errori e safety

**Validation lato Node (cheap):**
- prompt non vuoto, <8000 char
- brandContext JSON valido
- model presente in whitelist (configurabile)

**Validation post-LLM:**
- response JSON parse OK
- schema Zod OK
- code non vuoto, <100KB

**Compile-time (Node sucrase):**
- TSX parsa senza errori sintattici

**Render-time (Chromium):**
- delayRender timeout = 15s (>30s = render fail Remotion)
- `try/catch` attorno eval → `cancelRender(err)` per riportare l'errore con stack al chiamante invece di hang

**Risorse:**
- Il bundle persistente include sucrase (~150KB minified). Initial bundle size: stimato +400KB rispetto a v1 DSL.

## 14. Variabili d'ambiente nuove

```
LITELLM_BASE_URL=http://localhost:4000
LITELLM_API_KEY=sk-...
LITELLM_MODEL=claude-sonnet-4-6
BRAND_CONTEXT_FILE=docs/brand-context.example.md
DYNAMIC_RENDER_ENABLED=true
```

## 15. Acceptance criteria

1. `POST /render/dynamic { prompt: "Crea una slide titolo 'La leva del tempo' con sottotitolo e illustrazione 'money-time-flow'" }` ritorna 200 con PNG valido entro 8s.
2. La PNG mostra contenuto coerente col prompt: titolo, sottotitolo, illustrazione referenziata dal manifest.
3. Brand identity rispettata: palette dei theme tokens, font Plus Jakarta Sans, background paper.
4. Prompt sintatticamente errato dall'LLM (forziamo con mock) → 422 `invalid_code`.
5. LLM down (forziamo) → 500 `llm_failure`.
6. Eval runtime error (codice runtime-broken) → 500 `render_failure` con stack nel body.
7. `/render/still` (DSL legacy) continua a funzionare invariato.
8. Aggiunta nuova endpoint nel README e in `/compositions` (lista include "DynamicSlide").
9. Tutti i test passano (unit + integration).
