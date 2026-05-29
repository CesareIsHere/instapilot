# Render HTML v1 — Requisiti & Design

> Endpoint `POST /render/html`: l'LLM genera **HTML + CSS** (non TSX Remotion), il render service li renderizza in PNG con **Chromium headless via Playwright**. Affianca (non sostituisce) `/render/dynamic` e `/render/still`.

## 1. Obiettivo

Spostare la generazione di una singola pagina (slide) da un approccio Remotion/TSX a un approccio **HTML/CSS puro**, mantenendo la stessa interfaccia d'uso di `/render/dynamic` (prompt + brand → PNG 1080×1350).

Motivazioni:
- Per uno **still**, Remotion è overhead: `useCurrentFrame`, `delayRender`, composition, bundler servono al video.
- CSS reale (grid, flex, gradient, box-shadow, background-image, clip-path, SVG inline) è **più espressivo e meno bug-prone** del JSX-in-sandbox.
- Si elimina l'intera classe di bug "JSX collapses whitespace" / `{' '}` del prompt attuale: in HTML lo spazio è spazio.
- Render = un solo screenshot Chromium, senza compile sucrase nel browser.
- Font embedding e crispness (deviceScaleFactor) più semplici da controllare.

**Responsabilità dell'endpoint:** prendere in input le informazioni di contenuto + brand (via prompt) e produrre **una singola pagina** PNG. NON è responsabile di decidere se è un carosello o un post singolo né di orchestrare N pagine: quello è compito del livello a monte.

## 2. Decisioni bloccate

| Decisione | Scelta | Note |
|---|---|---|
| Motore render HTML→PNG | **Playwright** | API screenshot, `fonts.ready`, clip preciso, request-interception per offline |
| Output contract LLM | **Shell nostra + frammento** | Noi forniamo boilerplate/font/brand; LLM dà `bodyHtml` + `css` |
| Font & asset | **Tutto offline/embedded** | woff2 **base64 data-URI** in `@font-face` + asset come data-URI (zero richieste di rete) |
| Output PNG | **1080×1350 (deviceScaleFactor 1)** | DSF>1 opzionale via env per nitidezza; default = parità con la pipeline Remotion |
| Forma input | **Prompt libero** come `/render/dynamic` | `{ prompt, brandContext?, model?, role? }` |
| Lifecycle browser | **Singleton condiviso** | Una istanza Playwright lazy, chiusa allo shutdown |
| Backward compat | `/render/dynamic` e `/render/still` invariati | |

## 3. Architettura ad alto livello

```
POST /render/html { prompt, brandContext?, model?, role? }
   │
   ▼
┌───────────────────────── LOOP (max HTML_MAX_ATTEMPTS, default 3) ─────────────────────────┐
│  [Node] LLM chat completion (riusa client OpenAI/litellm esistente)                        │
│     - system: brand + scala tipografica + CSS-vars + recipe library + regole + self-check  │
│     - messages: prompt utente (+ al retry: feedback overflow del tentativo precedente)     │
│     - response_format: json_schema → { intent, bodyHtml, css }                             │
│        │                                                                                   │
│        ▼                                                                                   │
│  [Node] validate.ts — parse, reject <script>/on*=/http(s)://, valida token {{asset:}}      │
│        │                                                                                   │
│        ▼                                                                                   │
│  [Node] template.ts — documento HTML completo:                                             │
│     <!DOCTYPE> + reset + @font-face (woff2 base64) + :root{--brand-*,--asset-*} +          │
│     sostituzione {{asset:<id>}} → data-URI + .canvas 1080×1350{bodyHtml} + <style>{css}>   │
│        │                                                                                   │
│        ▼                                                                                   │
│  [Chromium/Playwright] renderHtml.ts:                                                      │
│     1. page (viewport 1080×1350, deviceScaleFactor da env, default 1)                      │
│     2. route(http/https → abort) — data:/file: ok                                          │
│     3. setContent(html, waitUntil:'load') → await document.fonts.ready                     │
│     4. MISURA OVERFLOW (.canvas scrollWidth/scrollHeight vs 1080×1350)                      │
│        │                                                                                   │
│        ├─ overflow? ──SÌ──► scarta, costruisci feedback (asse + px di sforamento) ─► retry │
│        │                                                                                   │
│        └─ NO ──► screenshot { clip:0,0,1080,1350 } → PNG in OUTPUT_DIR ─► esci dal loop     │
└────────────────────────────────────────────────────────────────────────────────────────┘
   │
   ├─ successo ──► PNG → { file, intent, html, attempts, durationMs, llmDurationMs, renderDurationMs }
   │
   └─ esauriti i tentativi e ancora overflow ──► 422 overflow_unresolved (nessun PNG tagliato esce mai)
```

**Principio:** un PNG con contenuto tagliato è un post non pubblicabile. L'overflow è quindi **fatale**: ogni generazione termina solo con una pagina che sta integralmente dentro 1080×1350, oppure con un errore esplicito dopo aver esaurito i tentativi.

## 4. Endpoint

### `POST /render/html`

**Request:**
```ts
{
  prompt: string;                       // required, 1..8000 char — contenuto della pagina
  brandContext?: string;                // optional, default da BRAND_CONTEXT_FILE
  model?: string;                       // optional, override modello
  role?: 'cover' | 'body' | 'cta';      // optional, hint per coerenza in un carosello a monte
}
```

**Response 200:**
```ts
{
  file: string;             // path assoluto al PNG
  intent: string;           // descrizione del concept visivo (per review/debug)
  html: string;             // documento HTML finale renderizzato (per review/debug)
  attempts: number;         // quanti tentativi sono serviti (1 = primo colpo)
  durationMs: number;       // totale (tutti i tentativi)
  llmDurationMs: number;    // somma tempo LLM
  renderDurationMs: number; // somma tempo render
}
```

La response 200 è garantita **senza overflow**: il contenuto sta integralmente dentro 1080×1350.

**Errori:**
- `400 validation` — body malformato / prompt mancante
- `422 invalid_html` — HTML contiene `<script>`/`on*=`/risorse remote, token asset sconosciuto, o non parsa
- `422 overflow_unresolved` — dopo `HTML_MAX_ATTEMPTS` tentativi il contenuto sfora ancora il canvas. Body include l'ultimo `{ overflow: { x, y, scrollWidth, scrollHeight }, html, intent }` per debug.
- `500 llm_failure` — errore LLM (timeout, rete, schema)
- `500 render_failure` — errore Chromium/Playwright (timeout, eccezione di pagina)

## 5. Output dell'LLM

`GeneratedHtmlSchema`:
```ts
z.object({
  intent: z.string().min(1),
  bodyHtml: z.string().min(1).max(100_000),  // contenuto dentro .canvas
  css: z.string().max(50_000),               // CSS di scope per il frammento
})
```

L'LLM **non** scrive `<html>/<head>/<body>`, `@font-face` o `<!DOCTYPE>`: quelli li mette la shell. Scrive solo il markup dentro `.canvas` e il CSS associato. Niente `<script>`, niente URL `http(s)://`.

**Reference asset:** l'LLM referenzia gli asset con un token `{{asset:<id>}}` (es. `<img src="{{asset:logo-f}}">` oppure `background-image: url('{{asset:logo-f}}')`); `template.ts` sostituisce i token con il data-URI corrispondente **dopo** la validazione. In alternativa per i background è disponibile la CSS-var `var(--asset-<id>)` (già contenente `url(data:...)`).

**Scope CSS:** il `css` dell'LLM deve essere scopato sotto `.canvas` (es. `.canvas .hero { ... }`) per non collidere con reset e shell.

## 6. Template shell (`template.ts`)

Responsabilità: garantire brand, font e canvas a prescindere dall'output LLM.

- `<!DOCTYPE html>` + `<meta charset>`.
- **Reset CSS** minimale (`* { margin:0; padding:0; box-sizing:border-box }`).
- **`@font-face`** per Plus Jakarta Sans (pesi **400/500/600/700/800**) con `src` come **base64 data-URI** del woff2 (nessuna richiesta di rete).
- **`:root`** con CSS custom properties derivate da `src/theme`:
  - `--brand-navy`, `--brand-gold`, `--paper`, `--ink`, `--muted`
  - `--space-xs..2xl` (8/16/24/40/64/96), `--font-family`
  - `--asset-<id>: url(data:...)` per ogni asset del manifest (uso in `background-image`)
- `.canvas` fisso `1080×1350`, `overflow:hidden`, `background: var(--paper)`, `font-family: var(--font-family)`.
- **Asset injection**: sostituzione dei token `{{asset:<id>}}` nel `bodyHtml`/`css` con il data-URI (post-validazione) + le `--asset-<id>` in `:root`. Lista id disponibili documentata nel system prompt.
- Slot: `<style>{css}</style>` + `<div class="canvas">{bodyHtml}</div>`.

## 7. System prompt (`htmlSystemPrompt.ts`)

Riadattamento HTML del prompt attuale. Compone i layer:

1. **Design principles** — focal point unico, max 3 colori, colore semantico (rosso=perdita/ritardo, verde=crescita), legibilità a thumbnail.
2. **Scala tipografica** — riuso identico della tabella esistente (hero 88–120px, KPI 120–180px, body ≥30px, **mai < 22px**, mai < 30px in card).
3. **Spacing rhythm** — multipli di 8, padding esterni 56–80px.
4. **Riempimento verticale** — il canvas deve occupare i 1350px: flexbox/grid con `flex:1`, `margin-top:auto`, niente vuoti > 100px.
5. **CSS-vars del brand** — usare `var(--brand-navy)` ecc. invece di hardcodare i colori.
6. **Libreria recipe** (`recipes.ts`) — catalogo di pattern collaudati che l'LLM compone (vedi §8).
7. **Asset catalog** — id disponibili (`logo-f`, `money-time-flow`, …) e convenzione `{{asset:<id>}}` / `var(--asset-<id>)` per referenziarli.
8. **Pesi font disponibili** — usare SOLO 400/500/600/700/800 (gli unici embedded); niente altri pesi che verrebbero sintetizzati.
9. **Regole anti-overflow** — `box-sizing:border-box`, niente larghezze fisse che sommate sforano 1080, budget verticale ≤ 1350.
10. **Output contract** — solo `bodyHtml` + `css` (scopato sotto `.canvas`), niente `<script>`/URL remoti, JSON `{intent, bodyHtml, css}` senza markdown fence.
11. **Self-check** finale prima di rispondere.
12. **Brand context** — caricato da `BRAND_CONTEXT_FILE`. Il `role` (cover/body/cta), se presente, è un hint per il tono/struttura della pagina.

## 8. Libreria recipe (`recipes.ts`)

Catalogo di pattern di layout (scheletro HTML + "quando usarlo") iniettati nel prompt per alzare il livello di design e ridurre il "foglio bianco":

| Recipe | Quando |
|---|---|
| `cover` | Slide di apertura/hook: eyebrow + hero title + logo |
| `numbered-list` | Lista di punti/step numerati |
| `compare-2col` | Confronto a 2 colonne (es. prima/dopo, A vs B) |
| `kpi-hero` | Numero protagonista grande + label + contesto |
| `card-grid-2x2` | Griglia 2×2 di card (es. 4 indicatori) |
| `quote` | Citazione/framework con attribuzione |
| `cta` | Slide finale: call-to-action + logo |

## 9. File structure

```
src/
  html/
    schema.ts            # GeneratedHtmlSchema { intent, bodyHtml, css }
    htmlSystemPrompt.ts  # buildHtmlSystemPrompt(brand, role?)
    recipes.ts           # libreria pattern di layout
    generateHtml.ts      # generateSlideHtml(...) — chiamata LLM
    template.ts          # buildHtmlDocument({ bodyHtml, css, theme, assets })
    validate.ts          # validateGeneratedHtml(bodyHtml, css)
    fonts.ts             # carica i woff2 e li serializza in base64 data-URI
    renderHtml.ts        # renderHtmlStill({ html }) → PNG via Playwright
    browser.ts           # singleton Playwright (getBrowser / closeBrowser)
  server/
    routes.ts            # + mountHtmlRoutes(app)
    index.ts             # closeBrowser() su shutdown
public/
  fonts/                 # Plus Jakarta Sans woff2 (400/500/600/700/800) self-hosted
tests/
  unit/html/
    schema.test.ts
    validate.test.ts     # blocca <script>, on*= e http(s)://; consente {{asset:}} e data:
    template.test.ts     # inietta CSS-vars + sostituisce {{asset:}} → data-URI
    htmlSystemPrompt.test.ts
  integration/
    renderHtml.test.ts   # LLM mockato → render frammento noto → PNG 1080×1350, no overflow
    overflowRetry.test.ts # mock sfora al 1° tentativo, rientra al 2° → 200 attempts=2; sempre sfora → 422
examples/
  html-prompt.json
```

## 10. Rendering (`renderHtml.ts` + `browser.ts`)

- **Singleton browser**: `getBrowser()` lancia Chromium headless una volta (lazy), `closeBrowser()` allo shutdown del server. Evita di rilanciare Chromium per richiesta.
- Per richiesta: nuova `page`, `setViewport(1080×1350, deviceScaleFactor = HTML_DEVICE_SCALE_FACTOR ?? 1)`. Con DSF=1 il PNG è esattamente 1080×1350.
- `page.route('**', ...)` che **abortisce solo `http(s)://`** e lascia passare `data:`/`file:` — i font/asset sono data-URI embedded, quindi nessuna fetch remota.
- `setContent(html, { waitUntil: 'load' })` → `await page.evaluate(() => document.fonts.ready)`.
- **Overflow check (fatale)** via `page.evaluate`: misura `scrollWidth`/`scrollHeight` di `.canvas` (e in fallback del root) vs 1080×1350, con tolleranza di **1px** per arrotondamenti sub-pixel. Il `.canvas` ha `overflow:hidden`, quindi senza questo check il taglio sarebbe silenzioso. Se c'è overflow su un asse → **NON** si fa lo screenshot, si ritorna l'esito al loop per la rigenerazione.
- Lo `screenshot({ clip: {x:0,y:0,width:1080,height:1350}, type:'png' })` viene fatto **solo** quando l'overflow è zero.
- Output: `OUTPUT_DIR/HtmlSlide-{shortId}.png` (riuso helper `buildOutputPath`/`shortId` da `src/lib/render.ts`).
- Timeout render configurabile (default 15s) → `render_failure` invece di hang.

### Loop di rigenerazione (overflow)

- `renderHtmlStill` ritorna `{ overflow, measurements }` senza salvare PNG se sfora; salva e ritorna `{ file }` se ok.
- Il route handler orchestra il loop (max `HTML_MAX_ATTEMPTS`, default 3):
  1. genera → valida → render+misura;
  2. se overflow, costruisce un **messaggio di feedback** per l'LLM, es. *"Il tentativo precedente sforava di 180px in altezza (scrollHeight 1530 vs 1350). Riduci la quantità di contenuto o ricomponi per stare DENTRO 1080×1350 senza tagli. Mantieni la scala tipografica minima."* e lo accoda come turno conversazionale (output precedente come `assistant`, feedback come `user`) → nuova generazione;
  3. al primo render senza overflow esce e ritorna 200;
  4. esauriti i tentativi → `422 overflow_unresolved`.
- Il feedback è mirato (asse + px) per dare all'LLM un segnale azionabile, non un retry cieco.

## 11. Font & asset offline

- **Font**: vendoring di Plus Jakarta Sans woff2 (**400/500/600/700/800**) in `public/fonts/`. Disponibili via `@remotion/google-fonts` già installato; vengono copiati una volta nel repo. A render-time `fonts.ts` li legge e li serializza come **base64 data-URI** dentro l'`@font-face` della shell → render 100% offline (nessuna dipendenza da CDN né dalla network policy del container). I pesi embedded coprono tutti quelli usati nel design prompt.
- **Asset**: il manifest esistente (`src/assets`) viene risolto in data-URI e iniettato nella shell (token `{{asset:<id>}}` + CSS-var `--asset-<id>`), così il frammento può usarli senza accesso al filesystem/rete dentro Chromium.

## 12. Validazione & safety

**Lato Node (post-LLM):**
- JSON parse OK + schema Zod OK.
- `bodyHtml`/`css` non oltre i limiti di dimensione.
- **Reject** se `bodyHtml` contiene `<script` o `on*=` handler inline; reject se `bodyHtml`/`css` contengono `http://`/`https://` (forziamo asset locali). → `422 invalid_html`.
- **Consentiti**: i token `{{asset:<id>}}` (con `<id>` presente nel manifest) e gli URI `data:`. Token con id sconosciuto → `422 invalid_html`.

**Render-time (Chromium):**
- Route che abortisce solo `http(s)://` (difesa in profondità anche se la validazione passasse qualcosa); `data:`/`file:` consentiti per font/asset embedded.
- `try/catch` attorno al render → `render_failure` con messaggio, niente hang.

## 13. Variabili d'ambiente

Riuso delle esistenti (`LITELLM_*` / `OPENAI_*`, `BRAND_CONTEXT_FILE`, `OUTPUT_DIR`, `OPENAI_REASONING_EFFORT`). Nuove opzionali:
```
HTML_RENDER_TIMEOUT_MS=15000      # timeout render Playwright
HTML_DEVICE_SCALE_FACTOR=1        # 1 = PNG 1080×1350 (default); >1 per più nitidezza (PNG più grande)
HTML_MAX_ATTEMPTS=3               # tentativi totali generazione+render prima di 422 overflow_unresolved
PLAYWRIGHT_BROWSERS_PATH=...       # opzionale, path browser
```

**Setup (sul computer dell'utente, non in questo ambiente):**
```
npm install            # installa playwright
npx playwright install chromium
```

## 14. Carosello (fuori scope, ma progettato per esso)

L'endpoint genera **una pagina sola**. Il campo opzionale `role` (`cover`/`body`/`cta`) permette all'orchestratore a monte di richiedere pagine coerenti tra loro (stessa palette, ritmo, footer). La coerenza cross-slide e l'orchestrazione N→carosello restano a monte.

## 15. Out of scope v1

- Orchestrazione carosello / generazione multi-pagina in una chiamata.
- Caching risultati (LLM o PNG).
- Streaming response.
- Animazioni / video (è uno still).
- Few-shot da esempi storici.

> Nota: il **retry chain su overflow** è IN scope v1 (vedi §10). Restano fuori scope retry per altri tipi di critica qualitativa (es. self-critique estetico).

## 16. Acceptance criteria

1. `POST /render/html { prompt: "Slide cover: 'La leva del tempo', sottotitolo e logo" }` → 200 con PNG 1080×1350 valido.
2. La PNG riflette il prompt (titolo, sottotitolo, asset referenziato).
3. Brand rispettato: palette dai theme tokens (CSS-vars), font Plus Jakarta Sans embedded, background paper.
4. Render **offline**: nessuna richiesta di rete a render-time (verificabile con route abort attivo).
5. Output LLM con `<script>` o URL remoto (forzato via mock) → `422 invalid_html`.
6. LLM down (mock) → `500 llm_failure`.
7. Eccezione di pagina/timeout (forzato) → `500 render_failure`, niente hang.
8. **Overflow fatale**: una risposta 200 non contiene MAI un PNG con contenuto tagliato. Se il primo tentativo sfora (mock), il loop rigenera con feedback; se un tentativo successivo sta nel canvas → 200 con `attempts>1`.
9. **Overflow irrisolto**: se tutti i tentativi (mock che sfora sempre) sforano → `422 overflow_unresolved`, nessun PNG salvato.
10. `/render/dynamic` e `/render/still` continuano a funzionare invariati.
11. README aggiornato (riga endpoint + esempio) e `examples/html-prompt.json` presente.
12. Tutti i test passano (unit + integration con LLM mockato), incluso un test del **loop overflow** (mock che sfora al 1° tentativo e rientra al 2°).
13. Con DSF=1 il PNG è esattamente 1080×1350; impostando `HTML_DEVICE_SCALE_FACTOR=2` il PNG esce 2160×3240.
