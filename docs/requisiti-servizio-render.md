# Render Service — Requisiti

## Scopo
Microservizio HTTP che, dato un payload con dati di contenuto, produce immagini statiche (PNG) o video (MP4) renderizzati tramite componenti Remotion. Esposto come API interna, consumato da n8n.

## Stack
- Runtime: **Node.js** (LTS)
- Rendering: **Remotion** (con Chromium bundled)
- Server: **Express**
- Process manager: **PM2**
- Linguaggio: **TypeScript**
- Validazione schema: **Zod**

---

## Requisiti funzionali

### Endpoint API

#### `POST /render/still`
Produce un PNG da una composition statica.
- **Input**: `{ compositionId: string, props: object, frame?: number }`
- **Output**: `{ file: string, durationMs: number }`

#### `POST /render/carousel`
Produce N PNG (un carousel completo) in una singola chiamata.
- **Input**: `{ compositionId: string, slides: Array<{ frame: number, props: object }> }`
- **Output**: `{ files: string[], durationMs: number }`

#### `POST /render/video`
Produce un MP4 da una composition animata (per reels).
- **Input**: `{ compositionId: string, props: object }`
- **Output**: `{ file: string, durationMs: number }`

#### `GET /compositions`
Lista delle compositions registrate con relativo props schema.
- **Output**: `{ compositions: Array<{ id, width, height, fps, propsSchema }> }`

#### `GET /health`
Health check standard.

### Compositions iniziali
Da implementare nel primo ciclo, driven dai template Canva attuali (la mappatura precisa avviene in Fase 3 del piano generale):
- `StockAnalysisHook` — slide di apertura per analisi titolo
- `StockAnalysisData` — slide con grafico dati (prezzo, multipli, comparativi)
- `StockAnalysisTakeaway` — slide di chiusura/CTA
- `NewsCommentary` — single post di commento news
- `Quote` — citazione o framework

Ogni composition definisce e valida il proprio props schema con Zod.

### Output
- File salvati in directory configurabile (default: `./output`)
- Naming: `{compositionId}-{timestamp}-{slideIndex?}.{ext}`
- Path assoluto restituito al chiamante

---

## Requisiti non funzionali

### Performance
- Bundle Remotion costruito **una sola volta** all'avvio del servizio e tenuto in memoria
- Render still atteso: <3s a regime
- Render video da 5-10 secondi: <30s a regime

### Reliability
- Logging strutturato (JSON) su stdout per ogni request
- Error handling: errori di render restituiscono 500 con dettagli, il processo non crasha
- PM2 con restart automatico

### Configurazione
Variabili ambiente via `.env`:
- `PORT` (default 3001)
- `OUTPUT_DIR` (default `./output`)
- `LOG_LEVEL`

### Assets
- Font e logo in `/public` (caricati via `staticFile()` di Remotion)
- Palette/spaziature/tipografia come token TypeScript condivisi tra compositions
- Singolo `theme.ts` per cambiare brand identity in un punto solo

---

## Out of scope
- Upload su S3 o storage remoti (lo fa il chiamante se serve)
- Autenticazione/autorizzazione (servizio interno, dietro firewall)
- Scheduling dei render (lo fa n8n)
- Generazione dei contenuti testuali (lo fa la pipeline LLM upstream)
- Pubblicazione su Instagram (lo fa il workflow n8n via Meta Graph API)
- Persistenza metadata dei render (la fa il chiamante nel proprio DB)

---

## Decisioni aperte (da risolvere con Claude Code)
- Hot reload del bundle in dev mode: utile o eccessivo per il workflow?
- Strutturazione asset condivisi: cartella unica `/public` vs sotto-cartelle per-composition
- Strategia per testing visuale: screenshot regression test automatico o validazione manuale all'inizio?
- Gestione concorrenza: single-process sufficient o serve una queue (BullMQ) per request parallele?
- Strategia di pulizia dei file vecchi in `/output` (TTL? cleanup job?)