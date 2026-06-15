# Instapilot

Generatore automatico di carousel e post Instagram per creator educativi.
Pipeline AI end-to-end: ricerca → struttura narrativa → design → rendering → revisione editoriale.

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
examples/      # esempio brand Finvestire (pronto all'uso)
public/        # asset statici (font, logo default)
output/        # slide generate (gitignored)
data/          # config locale (gitignored)
```

## Esempio: Finvestire

La directory `examples/finvestire/` contiene un brand completo funzionante.
Segui le istruzioni in `examples/finvestire/README.md` per importarlo.

## Licenza

MIT — vedi [LICENSE](LICENSE).
