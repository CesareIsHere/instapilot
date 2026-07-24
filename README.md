# Instapilot

Generatore automatico di carousel e post Instagram per creator educativi.
Pipeline AI end-to-end: ricerca → struttura narrativa → design → rendering → revisione editoriale.

Il motore è **brand-agnostic**: l'identità del brand (nome, voice, palette, pubblico,
disclaimer) è iniettata a runtime tramite un *brand context*, non cablata nei prompt.
Vedi [Configurazione del brand](#configurazione-del-brand).

## Quickstart (5 minuti)

### 1. Clona e installa

```bash
git clone https://github.com/CesareIsHere/instapilot.git
cd instapilot
npm install
npx playwright install chromium
```

### 2. Avvia

```bash
npm run dev
```

Apri [http://localhost:3001](http://localhost:3001) nel browser.

### 3. Configura la API key

Vai in **Impostazioni** (barra laterale) e incolla la tua OpenAI API key.
Il banner arancione in alto scompare non appena la key viene salvata.

> Alternativa: crea un file `.env` (vedi `.env.example`) con `OPENAI_API_KEY=sk-...`

### 4. Configura il brand

Vai in **Brand kit** e imposta:
- Nome del brand e tono di voce
- 6 colori (ruoli semantici: primario, positivo, negativo, sfondo, testo, secondario)
- Font e logo

Poi vai in **Nuovo contenuto** e genera il primo carousel.

## Provider LLM supportati

- **OpenAI** (default): GPT-4o, GPT-5.4, o3-mini, ecc.
- **Qualsiasi proxy LiteLLM**: Claude, Gemini, Llama, ecc.

Imposta `LITELLM_BASE_URL` e `LITELLM_API_KEY` nel `.env` o dalla UI Impostazioni.

## Struttura del progetto

```
src/
  config/      # config store (API key, modelli)
  content/     # pipeline contenuto (research → plan → review)
  html/        # generazione HTML/CSS slide + rendering
  server/      # Express API + route
web/           # UI React (Vite, Tailwind, shadcn)
examples/      # preset brand pronti all'uso (brand-contexts/)
public/        # asset statici (font, logo default)
output/        # slide generate (gitignored)
data/          # config locale (gitignored)
```

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
- Template contesto brand: `docs/brand-context.example.md`

## Licenza

MIT — vedi [LICENSE](LICENSE).
