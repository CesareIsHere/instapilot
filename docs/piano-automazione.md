# Piano automazione contenuti Finvestire

## Obiettivo
Automatizzare la creazione di contenuti Instagram (post singoli e carousel) per Finvestire, mantenendo umani: stories, commenti/DM, revisione finale prima della pubblicazione.

---

## Fase 1 — Fondamenta editoriali *(non-tech)*
- Audit dei template Canva attuali → categorizzazione per tipo (es. stock analysis, news commentary, framework, citazione)
- Selezione di 20-30 post storici migliori → corpus per few-shot dell'LLM
- Documento di brand voice: tono, do/don't, esempi positivi e negativi
- Mix editoriale: % per ogni pillar tematico
- Disclaimer compliance: testo standard + checklist di pre-flight per evitare scivolate su "consigli di investimento" (rischio CONSOB)

## Fase 2 — Setup infrastruttura
- Conversione account IG in Business/Creator + collegamento Pagina Facebook
- Generazione long-lived access token per Meta Graph API
- DB per coda contenuti (Postgres semplice o Notion via API)
- Storage per asset generati (cartella locale → S3 quando volumi crescono)

## Fase 3 — Migrazione template *(semi-tech)*
- Mappatura 1:1 di ogni template Canva attivo → componente Remotion equivalente
- Rebuild prioritizzato per frequenza d'uso (i 3-4 template più usati per primi)
- Validazione visiva: confronto affiancato Canva vs Remotion per ogni template
- Setup palette/font/logo come asset condivisi del progetto Remotion

## Fase 4 — Render service
- Sviluppo del repo dedicato (Node + Remotion + Express) — vedi documento requisiti separato
- Deploy sul server esistente, gestione con PM2
- Test isolati su ogni composition prima dell'integrazione

## Fase 5 — Pipeline LLM
- Voice prompt versionato con few-shot dei post selezionati in Fase 1
- Pipeline multi-step: outline → draft → self-critique → refine
- Retrieval dati finanziari da fonte (yfinance/FMP) per evitare hallucination su numeri
- Orchestrazione in n8n con nodi modulari

## Fase 6 — Sourcing contenuti
- RSS feed di fonti finanza italiane ed estere
- Earnings calendar via API
- Lista curata X/Twitter per spunti
- LLM scorer per filtrare topic rilevanti → coda in DB

## Fase 7 — Review interface
- Bot Telegram con preview del carousel completo
- Azioni: approve, edit (con feedback testuale), reject
- Tracking metrica chiave: % approvati senza modifiche (target iniziale: >50%, ottimale: >70%)

## Fase 8 — Pubblicazione
- Integrazione Meta Graph API per upload carousel e single post
- Scheduling via n8n cron
- Logging completo di ogni pubblicazione

## Fase 9 — Soft launch e iterazione
- Modalità shadow per 2-4 settimane: la pipeline genera, tu rivedi e pubblichi a mano
- Iterazione su voice prompt e template basata sul gap tra output e tuoi edit
- Quando la metrica della Fase 7 supera la soglia → passaggio ad auto-publish post-review

## Fase 10 — Feedback loop
- Pull delle metriche post-pubblicazione da Graph API (saves, shares, reach)
- Ranking dei topic futuri basato su performance storica per categoria
- Refresh trimestrale del few-shot con i nuovi post performanti

---

## Note operative
- Le Fasi 1, 2, 3 sono prerequisito e dovrebbero partire in parallelo
- Le Fasi 4 (render service) e 5 (LLM pipeline) si sviluppano in parallelo una volta chiuse le prerequisite
- Stories e commenti/DM restano fuori scope per design — gestione manuale
- Soft launch (Fase 9) è il vero gate di qualità: meglio 4 settimane in più qui che pubblicare contenuto sbiadito