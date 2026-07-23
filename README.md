# instapilot — Render Service

Microservizio HTTP locale che genera slide/caroselli Instagram (1080×1350 PNG) a
partire da uno `SlideSpec` JSON o da un semplice argomento in linguaggio naturale,
usando Remotion/Playwright per il rendering deterministico e una pipeline multi-agente
LLM per contenuto e design.

Il motore è **brand-agnostic**: l'identità del brand (nome, voice, palette, pubblico,
disclaimer) è iniettata a runtime tramite un *brand context*, non cablata nei prompt.
Vedi [Configurazione del brand](#configurazione-del-brand).

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

Avviato il server (`npm run dev`), apri **http://localhost:3001** per la UI di gestione.

## UI Studio (web)

Interfaccia web servita dallo stesso server Express (nessun build step). Permette di gestire
l'intero ciclo di vita dei contenuti senza usare curl:

- **Libreria** (`/`) — griglia di tutti i contenuti generati (post e caroselli) con anteprima cover.
- **Nuovo contenuto** (`/new`) — form per avviare una generazione: argomento, istruzioni, formato
  (post/carosello), numero di slide, modello LLM opzionale. Avvia un job asincrono.
- **Generazioni** (`/jobs`) — stato dei job in corso con avanzamento per fase (ricerca → piano →
  slide → revisione).
- **Dettaglio contenuto** (`/content/:id`) — visualizza le slide, i metadati, e per ogni slide:
  - **Visualizza / Edita HTML** — editor con anteprima live (iframe) e re-render del PNG al salvataggio.
  - **Edit AI** — modifica chirurgica di una singola slide tramite istruzione in linguaggio naturale.
  - Download del PNG, eliminazione del contenuto.

### Endpoint UI (JSON)

| Metodo | Path | Scopo |
|---|---|---|
| `POST` | `/api/generate` | Avvia un job di generazione (ritorna `202` + jobId) |
| `GET` | `/api/generate` | Lista dei job recenti |
| `GET` | `/api/generate/:id` | Stato + risultato di un job |
| `GET` | `/api/library` | Lista dei contenuti generati |
| `GET` | `/api/library/:id` | Manifest completo di un contenuto |
| `DELETE` | `/api/library/:id` | Elimina un contenuto |
| `GET` | `/api/library/:id/slides/:n/html` | HTML grezzo di una slide |
| `PUT` | `/api/library/:id/slides/:n/html` | Salva l'HTML editato e ri-renderizza il PNG |
| `POST` | `/api/library/:id/slides/:n/ai-edit` | Modifica una slide via AI e ri-renderizza |
| `GET` | `/api/meta` | Metadati per la UI (modello di default, palette, range slide) |
| `GET` | `/output/...` | Artefatti generati (PNG + HTML) serviti staticamente |

> Nota: dalla pipeline ora **anche i post singoli** producono una cartella dedicata
> (`output/post-<id>/`) con `manifest.json`, così la libreria li gestisce in modo uniforme ai caroselli.

## Endpoint

| Metodo | Path | Scopo |
|---|---|---|
| `POST` | `/render/still` | Renderizza 1 PNG da uno `SlideSpec` |
| `POST` | `/render/carousel` | Renderizza N PNG da `SlideSpec[]` |
| `POST` | `/render/dynamic` | Genera TSX via LLM e renderizza un PNG dinamico |
| `POST` | `/render/html` | Genera HTML+CSS via LLM e renderizza un PNG via Playwright |
| `POST` | `/generate/content` | Genera un contenuto completo (post singolo o carosello) end-to-end |
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

## Esempio dynamic render

```bash
curl -X POST http://localhost:3001/render/dynamic \
  -H "Content-Type: application/json" \
  --data-binary @examples/dynamic-prompt.json
```

Risposta: `{ "file": "...", "intent": "...", "code": "...", "durationMs": 4200, "llmDurationMs": 1800, "renderDurationMs": 2400 }`

Richiede un proxy litellm in ascolto su `LITELLM_BASE_URL`. Le variabili minime sono in `.env.example` (`LITELLM_BASE_URL`, `LITELLM_API_KEY`, `LITELLM_MODEL`).

## Esempio html render

```bash
curl -X POST http://localhost:3001/render/html \
  -H "Content-Type: application/json" \
  --data-binary @examples/html-prompt.json
```

Risposta: `{ "file": "...", "intent": "...", "html": "...", "attempts": 1, "durationMs": 3800, "llmDurationMs": 1600, "renderDurationMs": 2200 }`

Richiede Playwright installato (`npm install && npx playwright install chromium`). Usa le stesse variabili LLM di `/render/dynamic`. Variabili opzionali: `HTML_MAX_ATTEMPTS` (default 3), `HTML_RENDER_TIMEOUT_MS` (default 15000), `HTML_DEVICE_SCALE_FACTOR` (default 1).

## Esempio content generation (end-to-end)

Crea un contenuto completo partendo solo dall'argomento. Pipeline:
**1)** un agente *ricercatore* approfondisce l'argomento via web search (OpenAI Responses API) →
**2)** un agente *content planner* struttura il contenuto in slide (cosa va in quale slide) →
**3)** ogni slide passa nella pipeline a 4 agenti di `/render/html` →
**4)** un *caporedattore* fa la revisione editoriale finale (aderenza all'argomento, scorrevolezza, qualità) e, se serve, rimanda la correzione all'agente della singola slide.

```bash
# Carosello da 6 slide
curl -X POST http://localhost:3001/generate/content \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "La leva del tempo negli investimenti",
    "instructions": "Tono educativo, pubblico principiante. Usa un esempio numerico sull'\''interesse composto.",
    "format": "carousel",
    "slideCount": 6
  }'

# Post singolo
curl -X POST http://localhost:3001/generate/content \
  -H "Content-Type: application/json" \
  -d '{ "topic": "Cos'\''è l'\''ETF", "format": "single" }'
```

Risposta: `{ "title": "...", "angle": "...", "files": ["...", ...], "slides": [...], "reviewRounds": 1, "durationMs": 42000 }`

`format` è `single` (1 slide) o `carousel` (`slideCount` 3–10, default 6). Variabili opzionali: `CONTENT_MAX_REVIEW_ROUNDS` (default 2), `OPENAI_WEB_SEARCH_TOOL` (default `web_search_preview`). La web search nativa richiede un modello OpenAI hosted; con un proxy senza web search l'agente ricercatore degrada sulla conoscenza del modello.

## Stack

- Node + TypeScript
- Remotion 4 (rendering)
- Express 4 (HTTP)
- Zod (validation)
- Vitest + pixelmatch (test + snapshot diff)

## Configurazione del brand

I prompt di generazione non contengono alcun brand: l'identità è fornita a runtime.
Puoi configurarla in due modi (in ordine di precedenza):

1. **Brand kit** dalla UI Studio (`/brand`) — salvato in `data/brand-kit.json`.
2. **File di contesto** puntato da `BRAND_CONTEXT_FILE` (default `docs/brand-context.example.md`).

Punti di partenza inclusi nel repo:
- `docs/brand-context.example.md` — template generico da compilare per il tuo brand.
- `examples/brand-contexts/finance.md` — preset pronto per finanza personale / value investing.

Handle e disclaimer del `Footer` sono configurabili via `BRAND_HANDLE` e `BRAND_DISCLAIMER`.

## Asset richiesti

Gli asset stanno in `public/`:
- `public/brand/logo.svg` — logo del brand (placeholder neutro incluso: sostituiscilo col tuo).
- `public/illustrations/money-time-flow.svg` — illustrazione slide campione.

## Documenti

- Design v1: `docs/superpowers/specs/2026-05-24-render-service-v1-design.md`
- Piano implementazione: `docs/superpowers/plans/2026-05-24-render-service-v1.md`
- Design dynamic render: `docs/superpowers/specs/2026-05-24-render-dynamic-v1-design.md`
- Piano dynamic render: `docs/superpowers/plans/2026-05-24-render-dynamic-v1.md`
- Template contesto brand: `docs/brand-context.example.md`
