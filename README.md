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

## Asset richiesti

Prima di poter renderizzare, posiziona i file in `public/`:
- `public/brand/logo-f.svg` — logo monogramma Finvestire
- `public/illustrations/money-time-flow.svg` — illustrazione slide campione

## Documenti

- Design v1: `docs/superpowers/specs/2026-05-24-render-service-v1-design.md`
- Piano implementazione: `docs/superpowers/plans/2026-05-24-render-service-v1.md`
- Design dynamic render: `docs/superpowers/specs/2026-05-24-render-dynamic-v1-design.md`
- Piano dynamic render: `docs/superpowers/plans/2026-05-24-render-dynamic-v1.md`
- Contesto brand: `docs/contesto-progetto-finvestire.md`
