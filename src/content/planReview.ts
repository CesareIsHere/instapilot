import { z } from 'zod';
import type OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ReasoningEffort } from '@/llm/client';
import type { UsageMeter } from '@/llm/usage';
import type { ContentPlan, ContentFormat } from './plan';

export const PlanReviewSchema = z.object({
  approved: z.boolean(),
  issues: z.array(z.string()),
  planFeedback: z.string().nullable(),
});
export type PlanReview = z.infer<typeof PlanReviewSchema>;

const PLAN_REVIEWER_PROMPT = `Sei un caporedattore di Finvestire. Valuti il PIANO di un contenuto Instagram (la struttura in slide e i brief) PRIMA che le slide vengano generate.

Controlla:
1. Struttura: rispetta il formato richiesto (numero di slide, ruoli cover/body/cta)?
2. Arco narrativo: cover con hook forte → sviluppo logico → cta che chiude con invito?
3. Una idea per slide MA sviluppata: nessuna slide sovraccarica E nessuna slide vuota/troppo magra (ogni body deve insegnare qualcosa di completo: mini-headline + spiegazione + eventuale prova).
4. NIENTE RIPETIZIONI: nessuna slide rispiega con parole diverse un concetto già dato. Ogni slide aggiunge informazione NUOVA.
5. Obiettivo per-slide: ogni slide dichiara cosa deve ottenere nell'arco? Se non è chiaro, è un problema.
6. Dati con significato: ogni numero ha etichetta (cos'è) e takeaway (cosa comunica)? Niente numeri nudi né accumulo di cifre (max ~1 dato chiave per slide)?
7. Registro: linguaggio conversazionale (tu), termini tecnici spiegati o sostituiti (pubblico a zero)? Niente gergo non spiegato?
8. Quantità: headline ≤ ~12 parole, corpo ≈ ≤ 300 caratteri per slide? Se un brief sembra un paragrafo, va asciugato.
9. Confronti/colonne: gli elementi sono simmetrici (stesso numero di voci, struttura parallela, lunghezze simili)?
9b. Visualizzazione dei dati: le slide che confrontano più numeri, mostrano proporzioni/ranking o un'evoluzione nel tempo usano un GRAFICO (bar-chart/progression-chart/breakdown-chart) e non solo testo o un singolo numero? Se i dati sono lasciati a testo, segnalalo.
10. Qualità dei brief: ogni brief è autosufficiente, con headline, hint di layout, taglio, e aderente al dossier/argomento?
11. Fattibilità: il contenuto di ogni slide sta in 1080×1350 senza overflow?
12. Framework: la struttura dichiarata è adatta? La sequenza dei narrativeFunction è coerente con quel framework?
13. Foreshadowing: cover e slide 2 coerenti (la slide 2 apre il loop / spiega perché conta)?
14. Mini-loop e payoff: ogni loop aperto si chiude entro 1-2 slide; c'è un recap nella penultima slide, prima della CTA, che richiama la cover?
15. CTA: UNA sola, chiara, solo nell'ultima slide?
16. Ritmo: numero di slide ragionevole per il framework (tipicamente 6-9; non imporre ≈7 ai framework a lista o roadmap)?

Sii esigente ma equo. Approva se il piano è solido. Boccia solo per problemi reali.
Se NON approvi, elenca gli issue e fornisci in planFeedback istruzioni concrete e azionabili per rifare il piano.
Output JSON: { "approved": boolean, "issues": string[], "planFeedback": string | null }.
Se approvato, issues è vuoto e planFeedback è null.`;

export async function reviewPlan(args: {
  client: OpenAI;
  model: string;
  reasoningEffort?: ReasoningEffort;
  topic: string;
  instructions?: string;
  format: ContentFormat;
  slideCount?: number;
  research: string;
  plan: ContentPlan;
  meter?: UsageMeter;
}): Promise<PlanReview> {
  const jsonSchema = zodToJsonSchema(PlanReviewSchema, { name: 'PlanReview', nameStrategy: 'title' });
  const slidesText = args.plan.slides
    .map((s, i) => `### Slide ${i} (${s.role} / ${s.narrativeFunction})\n${s.brief}`)
    .join('\n\n');
  const userContent = `ARGOMENTO: ${args.topic}
${args.instructions ? `ISTRUZIONI: ${args.instructions}\n` : ''}FORMATO: ${args.format}${args.slideCount ? ` (${args.slideCount} slide)` : ''}

DOSSIER DI RICERCA:
${args.research}

PIANO PROPOSTO — framework: "${args.plan.framework}", titolo: "${args.plan.title}", angolo: "${args.plan.angle}"
${slidesText}`;

  const request: Record<string, unknown> = {
    model: args.model,
    messages: [
      { role: 'system', content: PLAN_REVIEWER_PROMPT },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'PlanReview', strict: true, schema: jsonSchema } },
  };
  if (args.reasoningEffort) request.reasoning_effort = args.reasoningEffort;

  const resp = (await args.client.chat.completions.create(
    request as unknown as Parameters<typeof args.client.chat.completions.create>[0],
  )) as OpenAI.Chat.Completions.ChatCompletion;
  args.meter?.record('plan.review', resp.usage);

  const content = resp.choices[0]?.message?.content;
  if (!content) throw new Error('llm_empty_response');
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error('llm_invalid_json'); }
  const result = PlanReviewSchema.safeParse(parsed);
  if (!result.success) throw new Error(`llm_schema_mismatch: ${result.error.message}`);
  return result.data;
}
