# Render Service v1 — Design

**Data:** 2026-05-24
**Scope:** Prima versione del microservizio di rendering Remotion per la pipeline Finvestire.
**Target:** MVP locale per iterare sulle compositions; integrazione n8n e deploy server rimandati a v2.

---

## 1. Obiettivo

Realizzare un servizio HTTP locale che, dato in input uno `SlideSpec` JSON, produce un PNG renderizzato tramite Remotion. Il servizio è **deterministico e privo di AI**: la sua unica responsabilità è la trasformazione `SlideSpec → PNG`. Tutta la generazione di contenuto (testo, pianificazione layout, generazione illustrazioni) vive in una pipeline LLM upstream, fuori dallo scope di questa v1.

Test di accettazione della v1: il servizio deve riprodurre fedelmente la slide "La leva del tempo" (campione fornito dal founder) partendo da uno `SlideSpec` scritto a mano.

## 2. Filosofia: Modello Ibrido (DSL + Primitive)

Tre modelli sono stati valutati per la relazione AI ↔ rendering:

1. **Template fissi** — componenti React predefiniti, l'AI fornisce solo dati. Rigido.
2. **AI scrive TSX** — l'AI genera codice Remotion. Rischi di sicurezza, brand drift, lentezza, costi alti.
3. **Ibrido (scelto)** — l'AI produce JSON dichiarativo che combina **primitive** brand-safe secondo **layout preset**. Brand consistency garantita, flessibilità di composizione, validabile via Zod, niente codice runtime arbitrario.

Il render service implementa il Modello 3.

## 3. Separation of Concerns

```
┌──────────────────────────────────────────────────────────┐
│  Pipeline LLM (futura, repo/modulo separato)    🧠 AI    │
│  · scrive contenuto editoriale                           │
│  · pianifica slide (legge /primitives, /layouts, /theme) │
│  · genera illustrazioni (DALL-E/Flux) → asset library    │
│  · review compliance                                     │
│  · output: SlideSpec[] validato                          │
└──────────────────────────┬───────────────────────────────┘
                           │  POST /render/carousel
                           ▼
┌──────────────────────────────────────────────────────────┐
│  Render Service (questo repo)                  🚫 NO AI  │
│  · funzione pura SlideSpec → PNG                         │
│  · ~2s per slide, deterministico, testabile              │
└──────────────────────────┬───────────────────────────────┘
                           │  PNG[]
                           ▼
┌──────────────────────────────────────────────────────────┐
│  Review (Telegram, futuro) → n8n → Meta Graph API        │
└──────────────────────────────────────────────────────────┘
```

L'AI non entra mai nel render service. Questa è una scelta architetturale, non un'omissione: garantisce riproducibilità, testabilità con snapshot, velocità, debugabilità, e disaccoppia l'evoluzione del rendering da quella della pipeline LLM.

## 4. Architettura runtime

```
┌──────────────────────────────────────────────────────────┐
│  ig-auto-builder (render service v1, MVP locale)         │
├──────────────────────────────────────────────────────────┤
│   ┌──────────────┐         ┌────────────────────────┐    │
│   │ Express API  │ ──────▶ │ Remotion bundle (mem)  │    │
│   │ /render/*    │         │  • <Slide> composition │    │
│   │ /primitives  │         │  • primitives registry │    │
│   │ /layouts     │         │  • theme tokens        │    │
│   │ /theme       │         └─────────┬──────────────┘    │
│   │ /assets      │                   ▼                   │
│   │ /health      │           renderStill() → output/.png │
│   └──────┬───────┘                                       │
│          ▼                                               │
│    Zod validation (SlideSpec)                            │
│                                                          │
│   ┌─────────────────────────────────────────────────┐    │
│   │ Remotion Studio (npm run studio)                │    │
│   │ Editing visivo primitive/layout, hot reload     │    │
│   └─────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

**Concetti chiave:**

- **Una sola composition Remotion `<Slide>`**, interprete dello `SlideSpec`.
- **Primitive**: componenti React brand-safe, ognuna con il proprio Zod schema.
- **Layout preset**: funzioni che dispongono spazialmente i blocchi, usando token del theme.
- **Theme**: token TS centralizzati (colori, font, spacing). Niente colori hardcoded nelle primitive.
- **Bundle Remotion** costruito una volta al boot e tenuto in memoria.
- **Remotion Studio** in parallelo come strumento di dev.

## 5. Il DSL `SlideSpec`

### 5.1 Schema radice

```ts
SlideSpec = {
  compositionId: "Slide"          // unica composition in v1
  format: "post-portrait"         // 1080×1350 in v1 (altri rimandati)
  layout: LayoutId                // "headline-body-illustration" in v1
  background: "paper"             // unico variant in v1
  chrome: {
    showLogo: boolean
    showCarouselNav: boolean
    pageIndex?: number
    totalPages?: number
  }
  blocks: Block[]                 // ordine = ordine di rendering nel layout
}
```

### 5.2 Catalogo primitive (DSL completo — v1 implementa subset)

| Primitive | Scopo | Props principali | In v1? |
|---|---|---|---|
| `Eyebrow` | Etichetta sopra titolo | `text`, `accent?` | No |
| `Headline` | Titolo principale | `text`, `size`, `color?` | **Sì** |
| `Subheadline` | Sottotitolo | `text`, `size?` | No |
| `RichText` | Paragrafi + bullet list | `content: (Paragraph \| Bullets)[]` | **Sì** |
| `DataRow` | Riga di KPI orizzontali | `items: {label, value, hint?}[]` | No |
| `Quote` | Citazione | `text`, `author?`, `style` | No |
| `Illustration` | Immagine da asset library | `assetId`, `caption?`, `align?` | **Sì** |
| `Footer` | Disclaimer / brand | `variant`, `text?` | **Sì** |

L'AI non può introdurre `type` non listati: lo Zod schema fa enforcing → 400 con errore chiaro.

### 5.3 Catalogo layout preset (DSL completo — v1 implementa subset)

| Layout | Descrizione | Slot ordinati | In v1? |
|---|---|---|---|
| `hero-stack` | Titolo grande, blocchi centrati | Headline → blocks | No |
| `headline-body-illustration` | Titolo / corpo / illustrazione | Headline → RichText → Illustration | **Sì** |
| `quote-centered` | Quote enorme centrata | Quote | No |
| `data-grid` | Headline + DataRow/Chart in griglia | Headline → DataRow | No |

Il layout è una funzione `(blocks, theme) → JSX` che dispone i blocchi con flex/grid/padding/align. Le primitive non hanno mai position assoluta.

### 5.4 Esempio: "La leva del tempo" (acceptance test v1)

```json
{
  "compositionId": "Slide",
  "format": "post-portrait",
  "layout": "headline-body-illustration",
  "background": "paper",
  "chrome": { "showLogo": true, "showCarouselNav": true, "pageIndex": 3 },
  "blocks": [
    {
      "type": "Headline",
      "text": "La leva del tempo",
      "size": "xl",
      "color": "brand-navy"
    },
    {
      "type": "RichText",
      "content": [
        { "kind": "paragraph", "text": "Per Mirco, il vantaggio non sono i soldi, ma il tempo." },
        { "kind": "bullets", "items": [
            "Ha davanti a sé circa 30-35 anni di lavoro.",
            "Più tempo = più interesse composto.",
            "Sul lunghissimo periodo, i mercati azionari hanno reso il 7-8% all'anno.",
            "Il tempo gli permetterà di partire da piccole cifre a un capitale importante per la sua pensione."
          ]
        }
      ]
    },
    {
      "type": "Illustration",
      "assetId": "money-time-flow",
      "caption": "Tempo"
    }
  ]
}
```

Se il render service v1 produce un PNG visivamente equivalente alla slide campione partendo da questo JSON, **la v1 è done**.

## 6. Asset Library

L'AI non genera mai immagini all'interno del render service. Tutte le immagini sono asset preesistenti referenziati per `assetId`.

```
public/
├── brand/              # curato a mano, committed
│   └── logo-f.svg
├── illustrations/      # curato a mano, committed (in v1 contiene money-time-flow.svg)
│   └── money-time-flow.svg
├── generated/          # popolato dalla pipeline upstream, gitignored
└── fonts/              # font famiglia brand
```

Manifest TS in `src/assets/manifest.ts`:

```ts
{
  "logo-f":            { path: "brand/logo-f.svg",               tags: ["brand"],         description: "Logo monogramma Finvestire" },
  "money-time-flow":   { path: "illustrations/money-time-flow.svg", tags: ["time","money"], description: "Sequenza monete → banconote → sacco $ con frecce manoscritte" }
}
```

Endpoint `GET /assets` espone il manifest per discovery futura dalla pipeline LLM.

## 7. API

| Metodo | Path | Input | Output | Note |
|---|---|---|---|---|
| `POST` | `/render/still` | `{ slide: SlideSpec }` | `{ file, durationMs }` | PNG singolo |
| `POST` | `/render/carousel` | `{ slides: SlideSpec[] }` | `{ files[], durationMs }` | N PNG, serializzati |
| `GET` | `/compositions` | — | `{ compositions: [{ id, width, height, fps }] }` | Discovery |
| `GET` | `/primitives` | — | `{ [name]: { schema } }` (JSON Schema da Zod) | Discovery LLM |
| `GET` | `/layouts` | — | `{ [id]: { slots, description } }` | Discovery LLM |
| `GET` | `/theme` | — | `{ colors, typography, spacing }` | Discovery LLM |
| `GET` | `/assets` | — | manifest asset | Discovery LLM |
| `GET` | `/health` | — | `{ status: "ok", bundleReady: bool }` | Health |

I 4 endpoint di discovery (`/primitives`, `/layouts`, `/theme`, `/assets`) sono dump dei registry interni — costo implementativo trascurabile, beneficio grande: la pipeline LLM upstream li interroga per sapere cosa può usare, evitando doc drift.

## 8. Struttura del codice

Layout flat per tipo, con co-location di componente + schema per primitive e layout.

```
ig-auto-builder/
├── src/
│   ├── server/
│   │   ├── index.ts           # bootstrap Express + bundle Remotion al boot
│   │   ├── routes.ts          # tutti gli endpoint
│   │   └── errors.ts          # error handler centralizzato
│   ├── remotion/
│   │   ├── Root.tsx           # registra <Slide>
│   │   ├── Slide.tsx          # composition interprete
│   │   └── bundler.ts         # wrapper Remotion bundle()
│   ├── primitives/
│   │   ├── Headline/          # Headline.tsx + schema.ts + index.ts
│   │   ├── RichText/
│   │   ├── Illustration/
│   │   ├── Footer/
│   │   └── index.ts           # registry { name → {component, schema} }
│   ├── layouts/
│   │   ├── headlineBodyIllustration.tsx
│   │   └── index.ts           # registry { id → {component, slots} }
│   ├── chrome/
│   │   ├── Logo.tsx
│   │   ├── CarouselNav.tsx
│   │   └── Background.tsx
│   ├── theme/
│   │   ├── colors.ts
│   │   ├── typography.ts
│   │   ├── spacing.ts
│   │   └── index.ts
│   ├── assets/
│   │   ├── manifest.ts
│   │   └── index.ts
│   ├── schema/
│   │   └── slideSpec.ts       # Zod root, union dei block schemas
│   └── lib/
│       ├── render.ts          # wrapper renderStill, naming output
│       └── log.ts             # JSON structured logging
├── public/
│   ├── brand/logo-f.svg
│   ├── illustrations/money-time-flow.svg
│   └── fonts/
├── output/                    # gitignored
├── tests/
│   ├── unit/                  # schemas Zod
│   ├── integration/           # routes via supertest
│   └── snapshot/
│       ├── baselines/         # PNG di riferimento committed
│       └── fixtures/          # SlideSpec JSON di input
├── package.json
├── tsconfig.json
├── remotion.config.ts
└── .env.example
```

## 9. Data flow di un render still

```
1. Client            POST /render/still { slide: SlideSpec }
                              │
2. Express route     ─────────▼
                     zodValidate(SlideSpec) ──fail──▶ 400 {error,issues}
                              │ ok
3. Orchestrator               ▼
                     resolveAssets(slide)   # assetId → file path
                              │
                     renderStill({
                       composition: "Slide",
                       inputProps: slide,
                       serveUrl: cachedBundleUrl,
                       output: `output/${id}.png`
                     })
                              │
4. <Slide>           ─────────▼
                     pick layout by slide.layout
                     render <Background />, <Chrome />
                     iterate blocks → render primitive per type
                              │
5. Response                   ▼
                     { file: "/abs/output/slide-123.png", durationMs: 1820 }
```

### Bootstrap del server

1. Carica `.env`
2. Carica manifest assets
3. **Bundle Remotion una sola volta** → `serveUrl` in memoria
4. Setup Express + routes
5. Listen su `PORT`

Se il bundle fallisce al boot, il server **non parte** (fail fast).

## 10. Error handling

| Categoria | Causa | HTTP | Body |
|---|---|---|---|
| Validation | SlideSpec non valido (Zod) | 400 | `{ error: "validation", issues }` |
| AssetNotFound | `assetId` non in manifest | 422 | `{ error: "asset_not_found", assetId }` |
| RenderFailure | Remotion lancia (font, OOM, ecc.) | 500 | `{ error: "render_failure", message }` |

Gli errori di render **non crashano il processo**: catch in `lib/render.ts`, log, 500 con dettagli.

Logging strutturato JSON su stdout, formato:
```json
{ "ts": "...", "level": "info", "event": "render.complete", "compositionId": "Slide", "durationMs": 1820 }
```

## 11. Testing strategy

Tre livelli:

1. **Unit (vitest)** — Zod schemas: per ogni primitive, valid props pass, invalid fail.
2. **Integration (vitest + supertest)** — endpoint con SlideSpec validi/invalidi, render mockato.
3. **Snapshot visivo (vitest + pixelmatch)** — render reale della slide "La leva del tempo" → confronto con baseline in `tests/snapshot/baselines/`. Tolleranza ~1% per antialiasing OS-specific.

In v1 basta **uno** snapshot test (la slide campione). È l'acceptance test della v1.

## 12. Decisioni aperte risolte

| Decisione | Risoluzione v1 | Motivo |
|---|---|---|
| Protocollo (HTTP REST vs MCP) | **HTTP REST** | Il consumer reale è n8n (orchestrator classico), non un agente LLM interattivo. L'interazione è batch-style (`SlideSpec → PNG`), non un loop tool-use. REST è universale e debugabile. Wrapper MCP futuro resta possibile gratis sopra gli endpoint di discovery. |
| Hot reload bundle in dev | **No** — Studio per iterazione visiva, `tsx watch` per server code | Studio già copre il caso d'uso |
| Layout asset condivisi | **Sotto-cartelle** per tipo (`brand/`, `illustrations/`, `generated/`, `fonts/`) | Gitignore selettivo + separazione semantica |
| Testing visuale | **Snapshot test automatico**, baseline minimo | Catch regressioni gratis |
| Concorrenza | **Single-process, render serializzati** | MVP locale; BullMQ overkill |
| Cleanup `/output` | **Nessuno** — gitignored, cancellazione manuale | YAGNI |

## 13. Scope

### IN scope v1

- Express server + Remotion bundle al boot
- Composition `<Slide>` interprete di SlideSpec
- Primitive: `Headline`, `RichText`, `Illustration`, `Footer`
- Layout: `headline-body-illustration`
- Chrome: `Logo`, `CarouselNav`, `Background` (variant `paper`)
- Theme: palette base (brand-navy, paper, ink, gold), 1 font famiglia, spacing scale
- Asset manifest con 2 asset (`logo-f`, `money-time-flow`)
- Endpoint: `POST /render/still`, `POST /render/carousel`, `GET /compositions`, `/primitives`, `/layouts`, `/theme`, `/assets`, `/health`
- Zod validation su SlideSpec
- Error handling + structured JSON logging
- Test: unit Zod + integration routes + 1 snapshot visivo
- Remotion Studio integrato per dev iteration

### OUT of scope (rimandato)

- `/render/video` e tutto il flow Reels
- Primitive non implementate v1: `Eyebrow`, `Subheadline`, `DataRow`, `Quote`, `Chart`
- Layout non implementati v1: `hero-stack`, `quote-centered`, `data-grid`
- Format diversi da `post-portrait` (1080×1350)
- PM2 / deploy server
- Autenticazione
- Image generation (pipeline upstream, fase futura)
- Pipeline LLM (Fase 5 piano generale)
- Cleanup `/output`, hot-reload bundle, queue BullMQ, S3, integrazione n8n

## 14. Stack tecnico

- Node LTS, TypeScript strict
- Remotion 4.x
- Express 4.x
- Zod 3.x
- Vitest per test
- `tsx` per dev (`tsx watch` su server)
- `pixelmatch` + `pngjs` per snapshot diff
- `.env`: `PORT=3001`, `OUTPUT_DIR=./output`, `LOG_LEVEL=info`

## 15. Prerequisiti non-codice

Asset e risorse che devono esistere **prima** che la v1 possa passare l'acceptance test, e che non sono prodotti dal render service stesso:

- **`public/brand/logo-f.svg`** — monogramma Finvestire (estratto dai template Canva attuali o ridisegnato)
- **`public/illustrations/money-time-flow.svg`** — illustrazione "monete → banconote → sacco $ con frecce manoscritte" (estratta dalla slide campione "La leva del tempo" o ridisegnata)
- **`public/fonts/*`** — file font famiglia brand (estratti dai template Canva attuali; necessari per match visivo)

Questi asset sono input umano, non output della pipeline. Senza di essi l'acceptance test non può essere eseguito.

**Nota su `Footer`:** è incluso nelle primitive v1 perché critico per compliance editoriale (disclaimer ricorrente nelle slide reali), ma non appare nella slide campione "La leva del tempo" (che è una slide intermedia di carosello, `pageIndex: 3`). La sua implementazione e copertura test va validata indipendentemente dallo snapshot di acceptance.

## 16. Acceptance criteria v1

La v1 si considera completa quando:

1. `npm run dev` avvia il server su porta 3001 senza errori
2. `npm run studio` apre Remotion Studio e mostra `<Slide>` con defaultProps
3. `curl POST /render/still` con il SlideSpec di "La leva del tempo" produce un PNG in `output/`
4. Il PNG prodotto è visivamente equivalente alla slide campione (giudizio del founder)
5. Snapshot test su quella slide passa contro la baseline committed
6. Tutti gli endpoint discovery (`/primitives`, `/layouts`, `/theme`, `/assets`, `/health`, `/compositions`) rispondono coerentemente coi registry interni
7. Errori di validazione restituiscono 400 con `issues` strutturate
8. Errori di asset mancante restituiscono 422
9. Errori di render restituiscono 500 senza crashare il processo
