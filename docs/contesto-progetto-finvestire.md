# Finvestire — Context Document

> Documento di riferimento sul brand Finvestire. Da usare come input per gli LLM (voice prompt, content generation), come briefing per Claude Code, e come riferimento condiviso per chiunque lavori sui contenuti.
>
> I blocchi marcati con ⚠️ contengono inferenze ragionevoli o placeholder che vanno verificati/completati da te.

---

## Identità

- **Nome:** Finvestire
- **Canale principale:** Instagram (community)
- **Lingua:** Italiano
- **Founder & autore:** Cesare Emiliano

**Cosa fa Finvestire:**
Community di contenuti su educazione finanziaria e value investing, rivolta a investitori retail italiani che vogliono ragionare sui propri investimenti con un approccio strutturato e di lungo periodo, anziché seguire trend o consigli da social.

**Posizionamento:**
- Value investing nella scuola Graham/Buffett/Munger
- Orizzonte di lungo periodo (no trading, no speculazione)
- Analisi fondamentale di aziende quotate (qualità del business + margin of safety)
- Cultura finanziaria di base per chi inizia
- Lettura macro e geopolitica come contesto, non come driver tattico

---

## Audience

> ⚠️ Sezione da affinare con dati reali da Instagram Insights.

**Profilo prevalente (ipotesi da validare):**
- Investitori retail italiani
- Età indicativa 25-45
- Mix di principianti che cercano educazione e investitori più strutturati che apprezzano analisi rigorose

**Cosa cerca l'audience:**
- Strumenti per ragionare, non scorciatoie
- Analisi su singoli titoli con metodo replicabile
- Cultura finanziaria che eviti gli errori più comuni
- Una voce credibile in un panorama saturo di "finfluencer" hype-driven

---

## Pillar tematici

> ⚠️ Da ribilanciare con i dati reali del mix editoriale storico.

1. **Analisi di singoli titoli** — Apple, PayPal, Freshworks, SPS Commerce, PagerDuty, Air Liquide, Hyundai/Boston Dynamics e simili. Flusso: comprensione del business → fondamentali → valutazione triangolata (DCF, multipli, reverse DCF) → verdetto trasparente che ammette anche "dati insufficienti".
2. **Framework di value investing** — margin of safety, owner earnings, moat, cost of capital, capital allocation, reverse DCF.
3. **Educazione finanziaria di base** — come funziona un ETF, differenza azione/obbligazione, fiscalità degli investimenti in Italia (regime amministrato vs dichiarativo).
4. **Tesi macro/settoriali** — robotica, AI, transizione energetica, second-order effects geopolitici.
5. **Cultura del lungo periodo** — psicologia dell'investitore, bias cognitivi, disciplina.

---

## Voice e tone

**Principi di comunicazione:**
- **Diretto** — niente fronzoli, niente accademia inutile
- **Autentico** — non si finge esperti quando non lo si è, si ammettono i limiti
- **Rigoroso ma accessibile** — concetti tecnici resi comprensibili senza banalizzarli
- **Integrità prima dell'ottimizzazione tattica** — niente clickbait, niente esagerazioni per engagement

**Da evitare:**
- Hype, FOMO, urgency artificiale
- Toni da "guru" o promesse di ritorni
- Anglismi gratuiti quando esiste un termine italiano efficace
- Affermazioni assolute su titoli ("compra X", "vendi Y")
- Generalizzazioni del tipo "il mercato dice…"

**Da preferire:**
- Ragionamento esplicito ("perché penso questo")
- Numeri quando ci sono, fonti citate
- "Se" e "potrebbe" quando si parla di scenari futuri
- Confronto tra alternative invece di verdetti unilaterali
- Ammettere incertezza dove c'è incertezza

---

## Cosa NON facciamo

- **Consulenza personalizzata** in materia di investimenti (attività riservata ai sensi del TUF)
- **Trading signals** o segnali operativi
- **Promesse di rendimento**
- **Sponsorizzazioni di broker o prodotti senza disclosure chiara**
- **Crypto speculation** — eventuali contenuti sul tema restano educativi, mai operativi

---

## Compliance

Tutti i contenuti che riguardano titoli specifici, allocazioni o strategie devono:
- Includere disclaimer "non è consulenza finanziaria, contenuto a scopo informativo/educativo"
- Evitare formule imperative ("compra", "vendi", "investi ora")
- Presentare l'analisi come ragionamento personale dell'autore, non come raccomandazione
- Citare dati e fonti verificabili (bilanci, report ufficiali, dati di mercato datati)

**Riferimento normativo:** TUF (D.Lgs. 58/1998) — la consulenza in materia di investimenti è attività riservata e richiede abilitazione. La produzione di contenuti educativi è invece libera, purché chiaramente distinguibile dalla consulenza.

**Pre-flight checklist** (da eseguire prima della pubblicazione di ogni post che riguarda titoli o strategie):
- [ ] Disclaimer presente
- [ ] Nessun verbo imperativo riferito a operazioni
- [ ] Dati numerici verificati contro fonte
- [ ] Tono coerente con "ragionamento" e non "raccomandazione"

---

## Formati contenuto

**Carousel** (formato principale)
- 5-7 slide per analisi titolo
- 4-5 slide per framework
- 3-4 slide per concetti rapidi

**Single post**
- Citazione + commento
- News commentary
- Tesi macro veloce

**Stories** (manuale, fuori scope automazione)
- BTS, opinioni rapide, sondaggi, Q&A

**Reels** (fase futura, quando la pipeline lo supporta)
- Sintesi di analisi
- Risposte a domande ricorrenti

---

## Identità visiva

> ⚠️ Da documentare nel dettaglio durante la migrazione dei template Canva (Fase 3 del piano).

Da catalogare:
- Palette colori (codici esatti)
- Font (heading + body)
- Logo (versioni e usage rules)
- Grid e spaziature standard dei carousel
- Convenzioni grafici (palette dati, stile linee, label)

---

## Riferimenti culturali

Autori e fonti che ispirano lo stile editoriale:
- **Classici value:** Benjamin Graham, Warren Buffett, Charlie Munger
- **Valutazione:** Aswath Damodaran
- **Mentalità:** Howard Marks (memos), Morgan Housel
- **Macro:** Ray Dalio (con cautela), Lyn Alden

> ⚠️ Da estendere con i riferimenti italiani e contemporanei che ti ispirano davvero — utile averli espliciti per orientare l'LLM nella voice.

---

## Note d'uso

Questo documento è la fonte primaria di contesto per:
- Voice prompt dell'LLM nella pipeline di generazione
- System message di Claude Code quando lavora sul repo di rendering
- Brief per qualsiasi collaboratore o tool esterno

**Va aggiornato quando:**
- Cambiano i pillar tematici o il loro mix
- Si introducono nuovi formati
- Si affina la voice (dopo analisi delle performance)
- Cambia l'identità visiva
- Si scoprono pattern da evitare o da promuovere nei contenuti generati