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
