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
| Font & asset | **Tutto offline/embedded** | woff2 self-hosted via `@font-face` + asset come data-URI |
| Forma input | **Prompt libero** come `/render/dynamic` | `{ prompt, brandContext?, model?, role? }` |
| Lifecycle browser | **Singleton condiviso** | Una istanza Playwright lazy, chiusa allo shutdown |
| Backward compat | `/render/dynamic` e `/render/still` invariati | |

## 3. Architettura ad alto livello

```
POST /render/html { prompt, brandContext?, model?, role? }
   │
   ▼
[Node] LLM chat completion (riusa client OpenAI/litellm esistente)
   - system: brand context + scala tipografica + CSS-vars + recipe library + regole + self-check
   - response_format: json_schema → { intent, bodyHtml, css }
   │
   ▼
[Node] validate.ts — parse, reject <script> e http(s)://
   │
   ▼
[Node] template.ts — compone documento HTML completo:
   <!DOCTYPE> + reset CSS + @font-face (woff2 locali)
   + :root { --brand-navy, --brand-gold, --paper, --ink, --muted, spacing, font }
   + asset come data-URI
   + .canvas 1080×1350 { <bodyHtml> }  + <style>{css}</style>
   │
   ▼
[Chromium/Playwright] renderHtml.ts:
   1. page (viewport 1080×1350, deviceScaleFactor 2)
   2. route('**', abort)  → rete bloccata (offline deterministico)
   3. setContent(html, waitUntil:'load')
   4. await document.fonts.ready
   5. misura overflow (scrollWidth/scrollHeight vs 1080×1350)
   6. screenshot { clip: 0,0,1080,1350 } → PNG in OUTPUT_DIR
   │
   ▼
PNG → { file, intent, html, durationMs, llmDurationMs, renderDurationMs, overflow? }
```

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
  durationMs: number;       // totale
  llmDurationMs: number;    // solo LLM
  renderDurationMs: number; // solo render
  overflow?: { x: boolean; y: boolean; scrollWidth: number; scrollHeight: number };
}
```

**Errori:**
- `400 validation` — body malformato / prompt mancante
- `422 invalid_html` — HTML contiene `<script>` o risorse remote, o non parsa
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

## 6. Template shell (`template.ts`)

Responsabilità: garantire brand, font e canvas a prescindere dall'output LLM.

- `<!DOCTYPE html>` + `<meta charset>`.
- **Reset CSS** minimale (`* { margin:0; padding:0; box-sizing:border-box }`).
- **`@font-face`** per Plus Jakarta Sans woff2 locali (pesi 400/600/800).
- **`:root`** con CSS custom properties derivate da `src/theme`:
  - `--brand-navy`, `--brand-gold`, `--paper`, `--ink`, `--muted`
  - `--space-xs..2xl` (8/16/24/40/64/96), `--font-family`
- `.canvas` fisso `1080×1350`, `overflow:hidden`, `background: var(--paper)`, `font-family: var(--font-family)`.
- **Asset injection**: gli asset del manifest passati al frammento come data-URI (o `file://`), referenziabili per id; lista id disponibili documentata nel system prompt.
- Slot: `<style>{css}</style>` + `<div class="canvas">{bodyHtml}</div>`.

## 7. System prompt (`htmlSystemPrompt.ts`)

Riadattamento HTML del prompt attuale. Compone i layer:

1. **Design principles** — focal point unico, max 3 colori, colore semantico (rosso=perdita/ritardo, verde=crescita), legibilità a thumbnail.
2. **Scala tipografica** — riuso identico della tabella esistente (hero 88–120px, KPI 120–180px, body ≥30px, **mai < 22px**, mai < 30px in card).
3. **Spacing rhythm** — multipli di 8, padding esterni 56–80px.
4. **Riempimento verticale** — il canvas deve occupare i 1350px: flexbox/grid con `flex:1`, `margin-top:auto`, niente vuoti > 100px.
5. **CSS-vars del brand** — usare `var(--brand-navy)` ecc. invece di hardcodare i colori.
6. **Libreria recipe** (`recipes.ts`) — catalogo di pattern collaudati che l'LLM compone (vedi §8).
7. **Asset catalog** — id disponibili (`logo-f`, `money-time-flow`, …) e come referenziarli.
8. **Regole anti-overflow** — `box-sizing:border-box`, niente larghezze fisse che sommate sforano 1080, budget verticale ≤ 1350.
9. **Output contract** — solo `bodyHtml` + `css`, niente `<script>`/URL remoti, JSON `{intent, bodyHtml, css}` senza markdown fence.
10. **Self-check** finale prima di rispondere.
11. **Brand context** — caricato da `BRAND_CONTEXT_FILE`.

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
    renderHtml.ts        # renderHtmlStill({ html }) → PNG via Playwright
    browser.ts           # singleton Playwright (getBrowser / closeBrowser)
  server/
    routes.ts            # + mountHtmlRoutes(app)
    index.ts             # closeBrowser() su shutdown
public/
  fonts/                 # Plus Jakarta Sans woff2 (400/600/800) self-hosted
tests/
  unit/html/
    schema.test.ts
    validate.test.ts     # blocca <script> e http(s)://
    template.test.ts     # inietta CSS-vars + asset
    htmlSystemPrompt.test.ts
  integration/
    renderHtml.test.ts   # LLM mockato → render frammento noto → PNG 1080×1350, no overflow
examples/
  html-prompt.json
```

## 10. Rendering (`renderHtml.ts` + `browser.ts`)

- **Singleton browser**: `getBrowser()` lancia Chromium headless una volta (lazy), `closeBrowser()` allo shutdown del server. Evita di rilanciare Chromium per richiesta.
- Per richiesta: nuova `page`, `setViewport(1080×1350, deviceScaleFactor:2)`.
- `page.route('**', r => r.abort())` per garantire **offline** (nessuna fetch a render-time) — i font e gli asset sono già embedded nella shell.
- `setContent(html, { waitUntil: 'load' })` → `await page.evaluate(() => document.fonts.ready)`.
- Overflow check via `page.evaluate` (`scrollWidth`/`scrollHeight` di `.canvas`).
- `screenshot({ clip: {x:0,y:0,width:1080,height:1350}, type:'png' })`.
- Output: `OUTPUT_DIR/HtmlSlide-{shortId}.png` (riuso helper `buildOutputPath`/`shortId` da `src/lib/render.ts`).
- Timeout render configurabile (default 15s) → `render_failure` invece di hang.

## 11. Font & asset offline

- **Font**: vendoring di Plus Jakarta Sans woff2 (400/600/800) in `public/fonts/`. Disponibili via `@remotion/google-fonts` già installato; vengono copiati una volta nel repo per render 100% offline (nessuna dipendenza da CDN né dalla network policy del container).
- **Asset**: il manifest esistente (`src/assets`) viene risolto in data-URI e iniettato nella shell, così il frammento può usarli senza accesso al filesystem/rete dentro Chromium.

## 12. Validazione & safety

**Lato Node (post-LLM):**
- JSON parse OK + schema Zod OK.
- `bodyHtml`/`css` non oltre i limiti di dimensione.
- **Reject** se `bodyHtml` contiene `<script` o `on*=` handler inline; reject se `bodyHtml`/`css` contengono `http://`/`https://` (forziamo asset locali). → `422 invalid_html`.

**Render-time (Chromium):**
- Rete bloccata via route abort (difesa in profondità anche se la validazione passasse qualcosa).
- `try/catch` attorno al render → `render_failure` con messaggio, niente hang.

## 13. Variabili d'ambiente

Riuso delle esistenti (`LITELLM_*` / `OPENAI_*`, `BRAND_CONTEXT_FILE`, `OUTPUT_DIR`, `OPENAI_REASONING_EFFORT`). Nuove opzionali:
```
HTML_RENDER_TIMEOUT_MS=15000      # timeout render Playwright
HTML_DEVICE_SCALE_FACTOR=2        # crispness screenshot
PLAYWRIGHT_BROWSERS_PATH=...       # opzionale, path browser
```

## 14. Carosello (fuori scope, ma progettato per esso)

L'endpoint genera **una pagina sola**. Il campo opzionale `role` (`cover`/`body`/`cta`) permette all'orchestratore a monte di richiedere pagine coerenti tra loro (stessa palette, ritmo, footer). La coerenza cross-slide e l'orchestrazione N→carosello restano a monte.

## 15. Out of scope v1

- Orchestrazione carosello / generazione multi-pagina in una chiamata.
- Caching risultati (LLM o PNG).
- Streaming response.
- Animazioni / video (è uno still).
- Self-critique / retry chain automatico.
- Few-shot da esempi storici.

## 16. Acceptance criteria

1. `POST /render/html { prompt: "Slide cover: 'La leva del tempo', sottotitolo e logo" }` → 200 con PNG 1080×1350 valido.
2. La PNG riflette il prompt (titolo, sottotitolo, asset referenziato).
3. Brand rispettato: palette dai theme tokens (CSS-vars), font Plus Jakarta Sans embedded, background paper.
4. Render **offline**: nessuna richiesta di rete a render-time (verificabile con route abort attivo).
5. Output LLM con `<script>` o URL remoto (forzato via mock) → `422 invalid_html`.
6. LLM down (mock) → `500 llm_failure`.
7. Eccezione di pagina/timeout (forzato) → `500 render_failure`, niente hang.
8. `overflow` riportato correttamente quando il contenuto sfora 1080×1350.
9. `/render/dynamic` e `/render/still` continuano a funzionare invariati.
10. README aggiornato (riga endpoint + esempio) e `examples/html-prompt.json` presente.
11. Tutti i test passano (unit + integration con LLM mockato).
```
