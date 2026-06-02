import { z } from 'zod';
import type OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ReasoningEffort } from '@/llm/client';
import type { UsageMeter } from '@/llm/usage';

export const ContentFormatSchema = z.enum(['single', 'carousel']);
export type ContentFormat = z.infer<typeof ContentFormatSchema>;

export const PlannedSlideSchema = z.object({
  role: z.enum(['cover', 'body', 'cta']),
  narrativeFunction: z.string().min(1),
  brief: z.string().min(1),
});

export const ContentPlanSchema = z.object({
  title: z.string().min(1),
  framework: z.string().min(1),
  angle: z.string().min(1),
  slides: z.array(PlannedSlideSchema).min(1),
});

export type PlannedSlide = z.infer<typeof PlannedSlideSchema>;
export type ContentPlan = z.infer<typeof ContentPlanSchema>;

function buildPlannerSystemPrompt(format: ContentFormat, slideCount: number | undefined): string {
  const formatRules =
    format === 'single'
      ? `Il formato è un SINGOLO POST: produci esattamente 1 slide (role "cover"). Tutto il messaggio deve stare in una sola immagine. Imposta framework="single".`
      : `Il formato è un CAROSELLO da ${slideCount} slide. Struttura narrativa:
- Slide 1: COVER (role "cover") — hook forte che cattura l'attenzione e introduce il tema.
- Slide centrali: BODY (role "body") — una idea per slide, sviluppata in modo chiaro e progressivo. Sequenza logica e scorrevole.
- Ultima slide: CTA (role "cta") — sintesi del messaggio chiave + invito a seguire/salvare.
Produci esattamente ${slideCount} slide in totale.`;

  const narrativeBlock =
    format === 'single'
      ? `# POST SINGOLO — AUTOSUFFICIENTE
Non c'è una slide successiva: questa unica slide deve bastare a sé stessa. In una sola immagine, in modo gerarchico e skimmabile, deve contenere:
- HOOK: apertura forte (problema + promessa, dato sorprendente o domanda) — la prima cosa che si legge.
- INSIGHT: il messaggio chiave davvero utile (il "perché" o il "come"), non solo il titolo.
- PROVA (se rafforza): al massimo UN dato concreto con etichetta e significato (numero + anno/fonte dal dossier).
- MICRO-CTA soft: una chiusura leggera ("Salva per non dimenticarlo", "Segui per altri spunti"), non invadente.
Densità MAGGIORE di una cover di carosello (che resta scarna perché il resto la sviluppa): qui non c'è il resto. Ma resta UNA idea centrale, un solo punto focale, testo conciso entro 1080×1350.
Imposta narrativeFunction="all-in-one". Le regole di foreshadowing / payoff / mini-loop dei caroselli NON si applicano.`
      : `# METODO E STRUTTURE NARRATIVE (per i caroselli)
Scegli la struttura più adatta al contenuto e dichiarala nel campo "framework":
- SWIPE (Hook → Why → Inform×3 → Payoff → CTA): meccanismi, principi, come-funziona, concetti complessi. È il default.
- 3-ACT (Setup → Conflitto → Soluzione → Applicazione): storie reali/plausibili, errori, mindset, prima→dopo.
- SRL (Shock → Reveal → Lesson): sfatare miti, verità controintuitive, bias.
- 3ACT-2.0 (Problema → Analisi → Soluzione → Applicazione): problemi concreti dell'utente, abitudini, budgeting.
- 3ACT-3.0 (Domanda → Percorso → Risposta): una domanda reale del pubblico, scelte A-vs-B, chiarimenti.
- A-vs-B: confronto tra due concetti su cui si fa confusione.
- case-study: parti da un caso reale per spiegare un concetto generale.
- list: "X cose per…", un elemento per slide.
- step-by-step / roadmap: uno step per slide, da A a B.
- framework→breakdown→application: mostra un framework tramite un esempio reale.

# REGOLE NARRATIVE (valide per qualunque struttura)
- COVER = hook fortissimo + promessa chiara, testo minimo.
- FORESHADOWING: cover e slide 2 devono essere coerenti (la slide 2 spiega perché conta / apre il loop principale).
- MINI-LOOP: apri una domanda e chiudila entro 1-2 slide.
- PAYOFF: recap in 3-4 bullet nella PENULTIMA slide, prima della CTA; chiude tutti i loop e richiama la cover.
- CTA: una sola, chiara, SOLO nell'ultima slide.
- Una idea per slide; testo conciso (deve stare in 1080×1350 senza overflow).

# FUNZIONE NARRATIVA
Assegna a ogni slide un "narrativeFunction" coerente con la struttura scelta (es. "hook", "why", "inform", "payoff", "cta", "setup", "conflict", "solution", "loop-open", "loop-close").`;

  return `Sei un social media manager senior specializzato in post e caroselli Instagram educativi di finanza per Finvestire (italiano).

${formatRules}

${narrativeBlock}

Per ogni slide scrivi un "brief" AUTOSUFFICIENTE e dettagliato che un agente di design userà per generare la slide. Ogni brief DEVE contenere:
- HEADLINE / MINI-HEADLINE proposta (testo esatto in italiano), 4-9 parole, che dice cosa tratta la slide e perché conta. Indica quali 1-2 parole evidenziare in verde (SOLO positivo/crescita) o rosso (SOLO rischio/perdita). Massimo 1-2 parole evidenziate; mai evidenziare per decorazione.
- SPIEGAZIONE: 1-2 frasi che sviluppano DAVVERO l'idea (il "perché" o il "come"), non un titolo lasciato a sé. La slide deve insegnare qualcosa di completo.
- DATO (se presente): ogni numero deve avere ETICHETTA (cos'è) e SIGNIFICATO (cosa comunica). Mai un numero nudo. Massimo UN dato chiave per slide (numero + anno/fonte dal dossier). Non accumulare numeri.
- HINT DI LAYOUT: la recipe più adatta — cover, numbered-list, compare-2col, kpi-hero, card-grid-2x2, card-grid (3-6 concetti), concept-breakdown (spiega "cos'è X": definizione + formula + glossario), flow-diagram (processo a step con frecce, utile per "come funziona X"), breakdown-chart (barre proporzionali / scomposizione tipo ricavi→margine→EBITDA), quote, cta. Per confronti/colonne/griglie: gli elementi devono essere SIMMETRICI (stesso numero di voci, frasi di lunghezza simile, struttura parallela).
- OBIETTIVO DELLA SLIDE: in una frase, cosa deve ottenere questa slide nell'arco (agganciare / spiegare il punto X / dare la prova / chiudere il loop Y / invitare).
Il brief non deve riferirsi alle altre slide: deve bastare a sé stesso.

# QUALITÀ EDITORIALE (regole vincolanti)
- UNA sola idea per slide, ma SVILUPPATA: né un muro di testo né una slide vuota. Se non sai dire l'obiettivo della slide, eliminala o riscrivila.
- QUANTITÀ: headline ≤ ~12 parole; spiegazione 1-2 frasi (≈ max 300 caratteri di corpo per slide). Se serve un paragrafo, va nella caption, non nella slide.
- NIENTE RIPETIZIONI: ogni slide aggiunge informazione NUOVA. Non rispiegare con parole diverse un concetto già dato.
- REGISTRO: conversazionale, rivolto al "tu", come a un amico. Ogni termine tecnico (ETF, TER, volatilità, cedola…) va spiegato o sostituito: il pubblico parte da zero. Rendi semplice il complesso senza banalizzare.
- COVER: deve rispondere in ≤ ~10 parole a "è per me?" e "cosa ottengo se scorro?" (problema + promessa, o dato sorprendente, o domanda).
- CTA: una sola, concreta (es. "Salva per dopo", "Commenta X", "Segui per…"), SOLO nell'ultima slide.
- Usa i dati del dossier solo quando rafforzano; niente affermazioni non supportate dalla ricerca. Brief in italiano.

Output JSON (ContentPlan):
- title: titolo editoriale del contenuto complessivo
- framework: la struttura narrativa scelta (es. "SWIPE")
- angle: l'angolo/taglio scelto in 1-2 frasi
- slides: array di { role, narrativeFunction, brief } nell'ordine di pubblicazione`;
}

export async function planContent(args: {
  client: OpenAI;
  model: string;
  reasoningEffort?: ReasoningEffort;
  format: ContentFormat;
  slideCount?: number;
  topic: string;
  instructions?: string;
  research: string;
  meter?: UsageMeter;
  feedback?: string;
}): Promise<ContentPlan> {
  const { client, model, reasoningEffort, format, slideCount, topic, instructions, research } = args;
  const jsonSchema = zodToJsonSchema(ContentPlanSchema, { name: 'ContentPlan', nameStrategy: 'title' });

  const userContent = `ARGOMENTO: ${topic}
${instructions ? `ISTRUZIONI: ${instructions}\n` : ''}
DOSSIER DI RICERCA:
${research}${args.feedback ? `\n\n--- REVISIONE DEL PIANO PRECEDENTE DA CORREGGERE ---\n${args.feedback}` : ''}`;

  const request: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: buildPlannerSystemPrompt(format, slideCount) },
      { role: 'user', content: userContent },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'ContentPlan', strict: true, schema: jsonSchema },
    },
  };
  if (reasoningEffort) request.reasoning_effort = reasoningEffort;

  const resp = (await client.chat.completions.create(
    request as unknown as Parameters<typeof client.chat.completions.create>[0],
  )) as OpenAI.Chat.Completions.ChatCompletion;

  args.meter?.record('content.plan', resp.usage);

  const content = resp.choices[0]?.message?.content;
  if (!content) throw new Error('llm_empty_response');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('llm_invalid_json');
  }

  const result = ContentPlanSchema.safeParse(parsed);
  if (!result.success) throw new Error(`llm_schema_mismatch: ${result.error.message}`);
  return result.data;
}
