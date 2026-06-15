# InstaPilot White-Label & Configurabilità — Design

> Stato: approvato (design). Data: 2026-06-15.
> Obiettivo: rendere il progetto totalmente white-label e configurabile, in vista del rilascio open source, così che chiunque possa eseguirlo in autonomia sul proprio PC.

## Contesto

Oggi il progetto genera caroselli/post Instagram per un brand specifico (Finvestire). Il brand è incollato nel codice in più punti:

- **Colori** hardcoded in `src/theme/colors.ts` (`#012A78`, `#00B373`, ecc.).
- **System prompt HTML** (`src/html/htmlSystemPrompt.ts`) con "Finvestire", i colori, il font "Montserrat" e la descrizione del logo scolpiti nel testo.
- **Logo** come asset fisso in `src/assets/manifest.ts` (`brand/logo.png`).
- **API key** e configurazione LLM solo da variabili d'ambiente (`OPENAI_API_KEY`, `MODEL_*`, `OPENAI_REASONING_EFFORT`, `LITELLM_*`).

Esiste già un'infrastruttura parziale: `src/server/brand.ts` definisce un `BrandKit` salvato in `data/brand-kit.json` con UI di settings, iniettato nei prompt come testo libero via `resolveBrandContext()`. Manca però l'estrazione del brand **strutturale** (colori come CSS var, logo, font, nome) e la configurazione dell'API key/LLM da UI.

## Decisioni fondamentali

1. **Prompt bloccati.** I prompt restano nel repo (open source è ok) ma NON sono modificabili dall'UI: sono ingegnerizzati per il massimo risultato. L'utente configura solo le **variabili di brand**, che vengono iniettate nei prompt via template.
2. **Brand a ruoli fissi, valori liberi.** Si mantengono i 6 ruoli semantici della palette (`primary`, `positive`, `negative`, `paper`, `ink`, `muted`); l'utente sceglie i valori hex, il font, il logo e il nome. I prompt restano coerenti ("usa il positivo per la crescita", ecc.) senza riscritture.
3. **Config UI-first, env fallback.** Ogni valore si risolve nell'ordine: **config locale (UI) → env var → default**. File di config locale gitignorato. L'API key è write-only: mai restituita in chiaro da un GET.
4. **Font: set curato + upload.** Set di font Google open (OFL) bundlati selezionabili da dropdown, più possibilità di caricare font custom (la licenza del font caricato è responsabilità dell'utente).

## Architettura

### Layer A — Config store (`src/config/`, nuovo)

File locale `data/config.json` (gitignored) con la configurazione runtime:

- provider LLM: `baseURL`, `apiKey`, `model`, modelli per-agente (`models.{research, plan, ...}`), `reasoningEffort`.

Resolver con precedenza **config.json → env → default**. `readLlmConfig()` (oggi in `src/llm/client.ts`, env-only) viene rifattorizzato per leggere prima dal config store.

Regole sull'API key:
- `PUT /api/config` accetta e salva la key.
- `GET /api/config` restituisce tutta la config **eccetto** la key in chiaro: espone `hasApiKey: boolean` ed eventualmente le ultime 4 cifre mascherate.
- La key non compare mai nei log.

### Layer B — Brand store (estende `src/server/brand.ts`)

`BrandKit` evolve in `BrandConfig` strutturato:

- **identità** (campi già esistenti): `name`, `tagline`, `audience`, `tone`, `dos`, `donts`, `hashtags`, `ctas`, `notes`.
- **colori**: 6 ruoli nominati → hex: `{ primary, positive, negative, paper, ink, muted }`.
- **font**: `{ family: string, source: 'bundled' | 'custom', files?: string[] }`.
- **logo**: path dell'immagine caricata.

Il `BrandConfig` alimenta DUE consumatori:
- la **CSS theme** del renderer (le 6 custom properties `:root` e il `@font-face` sono generati dai valori configurati);
- i **prompt** (interpolazione delle parti strutturali).

`src/theme/colors.ts` smette di essere la fonte di verità: i valori derivano dal `BrandConfig` (con i valori attuali Finvestire come default di esempio finché non sovrascritti).

### Layer C — Prompt templating (`src/prompts/`)

I prompt-builder ricevono `BrandConfig` e interpolano solo le parti strutturali (nome brand, hex+ruoli colore, font family, asset id del logo) nel template altrimenti fisso. Un unico punto di templating per garantire che, con un brand diverso configurato, **non resti alcun riferimento a Finvestire**. Nessuna esposizione UI dei prompt.

## Flusso Brand → Renderer

Lo shell (`src/html/template.ts`, `buildHtmlDocument`) oggi hardcoda il `@font-face` di Montserrat e il blocco `:root` dei colori brand. Diventeranno **generati da `BrandConfig`**:

- `@font-face` del font scelto: dai file bundlati (font OFL) o dai file caricati dall'utente.
- le 6 CSS custom properties (`--brand-navy` → `--primary`, ecc.) dai valori hex configurati.

L'entry `logo-f` del manifest (`src/assets/manifest.ts`) punta al logo caricato invece di `brand/logo.png`.

> Nota sui nomi delle CSS var: oggi i prompt usano `var(--brand-navy)`, `var(--brand-green)`, ecc. In fase implementativa si decide se (a) mantenere i nomi attuali rimappandoli ai ruoli, o (b) rinominare in `--primary`/`--positive`/… aggiornando prompt + recipes. Default proposto: **mantenere i nomi attuali come alias dei ruoli** per minimizzare le modifiche ai prompt, documentando la corrispondenza ruolo→variabile.

## Settings UI

Estende la pagina brand esistente:

- 6 color picker (uno per ruolo, con swatch e hex).
- Selettore font: dropdown del set curato + opzione "carica il tuo" (upload file).
- Upload logo.
- Campi identità (già presenti).
- Nuova sezione **Connessione / LLM**: `baseURL`, API key (campo password, write-only), `model` + override per-agente, `reasoningEffort`.

Upload (logo e font custom): endpoint dedicato, storage in `data/` (gitignored), validazione formato.

## First-run onboarding

All'avvio/primo caricamento, se non c'è un'API key risolvibile **e** il brand non è configurato → mostra un wizard/banner di setup che guida: (1) incolla API key, (2) imposta brand. Gli endpoint di generazione rispondono con un errore chiaro e azionabile se manca la key.

## Packaging open source

- `LICENSE` — **MIT**.
- `README` con quickstart: clona → installa → avvia → apri settings → incolla key → imposta brand → genera.
- `.env.example` che documenta i fallback opzionali (env var).
- `.gitignore`: `data/` (config.json, brand-kit.json, logo/font caricati), `output/`.
- **De-Finvestire-izzazione**: spostare `docs/contesto-progetto-finvestire.md`, il logo Finvestire e gli output di esempio in `examples/`; brand di default neutro/vuoto. I file Finvestire restano come esempio funzionante, non vengono rimossi.
- Font bundlati: solo OFL, creditati nel README/NOTICE.

## Testing

- **Resolver config**: precedenza config→env→default; verifica che la key non trapeli mai da `GET /api/config`.
- **Brand → CSS**: `BrandConfig` genera correttamente le 6 custom properties e il `@font-face`.
- **Templating prompt**: le variabili brand sono iniettate correttamente; **snapshot/asserzione che con un brand diverso non resti alcun letterale "Finvestire"** nei prompt generati.
- Onboarding: endpoint di generazione restituiscono errore chiaro senza API key.

## Fasi implementative (un solo spec, 3 fasi)

1. **Config backbone + API key.** Config store con precedenza UI→env→default; rifattorizzazione di `readLlmConfig`; endpoint `GET/PUT /api/config` con key write-only; sezione LLM nella UI.
2. **Brand strutturato.** Estensione `BrandKit`→`BrandConfig` (colori/font/logo/identità); generazione CSS var + `@font-face` da config; templating dei prompt; rimozione dell'hardcoding; upload logo/font.
3. **Onboarding + packaging.** Wizard first-run; LICENSE/README/.env.example/.gitignore; de-Finvestire-izzazione in `examples/`; crediti font.

## Out of scope (YAGNI)

- Palette completamente libera con numero arbitrario di colori (scartata: romperebbe la coerenza dei prompt).
- Editing dei prompt da UI (esplicitamente escluso).
- Multi-tenant / hosting condiviso: il target è l'esecuzione locale sul PC dell'utente.
