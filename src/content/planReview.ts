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
3. Una idea per slide: nessuna slide sovraccarica; niente ripetizioni tra slide.
4. Qualità dei brief: ogni brief è autosufficiente, con headline, dati concreti, hint di layout, taglio?
5. Aderenza alla ricerca e all'argomento: i brief usano il materiale del dossier e rispondono al tema?
6. Fattibilità: il contenuto di ogni slide è sintetizzabile in 1080×1350 senza overflow?

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
    .map((s, i) => `### Slide ${i} (${s.role})\n${s.brief}`)
    .join('\n\n');
  const userContent = `ARGOMENTO: ${args.topic}
${args.instructions ? `ISTRUZIONI: ${args.instructions}\n` : ''}FORMATO: ${args.format}${args.slideCount ? ` (${args.slideCount} slide)` : ''}

DOSSIER DI RICERCA:
${args.research}

PIANO PROPOSTO — titolo: "${args.plan.title}", angolo: "${args.plan.angle}"
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
