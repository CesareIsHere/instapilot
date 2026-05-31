import { z } from 'zod';
import type OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ReasoningEffort } from '@/llm/client';
import type { UsageMeter } from '@/llm/usage';

export const ResearchReviewSchema = z.object({
  approved: z.boolean(),
  issues: z.array(z.string()),
});
export type ResearchReview = z.infer<typeof ResearchReviewSchema>;

const RESEARCH_REVIEWER_PROMPT = `Sei un revisore di ricerca per Finvestire (finanza educativa in italiano).
Valuti un dossier di ricerca PRIMA che venga usato per scrivere un post Instagram.

Controlla:
1. Accuratezza: i fatti sono plausibili e non inventati? Opinioni distinte dai fatti?
2. Completezza: ci sono concetti chiave, dati, esempi, errori comuni, angoli/hook?
3. Dati: i numeri hanno anno/fonte? L'incertezza è segnalata dove serve?
4. Utilità: il materiale è abbastanza ricco e specifico da permettere un post di alto livello?
5. Aderenza: risponde davvero all'argomento e alle istruzioni?

Sii esigente ma equo. Approva se il dossier è solido. Boccia solo per lacune reali.
Output JSON: { "approved": boolean, "issues": string[] }. Se approvato, issues è un array vuoto.`;

export async function reviewResearch(args: {
  client: OpenAI;
  model: string;
  reasoningEffort?: ReasoningEffort;
  topic: string;
  instructions?: string;
  research: string;
  meter?: UsageMeter;
}): Promise<ResearchReview> {
  const jsonSchema = zodToJsonSchema(ResearchReviewSchema, { name: 'ResearchReview', nameStrategy: 'title' });
  const userContent = `ARGOMENTO: ${args.topic}
${args.instructions ? `ISTRUZIONI: ${args.instructions}\n` : ''}
DOSSIER DA VALUTARE:
${args.research}`;

  const request: Record<string, unknown> = {
    model: args.model,
    messages: [
      { role: 'system', content: RESEARCH_REVIEWER_PROMPT },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'ResearchReview', strict: true, schema: jsonSchema } },
  };
  if (args.reasoningEffort) request.reasoning_effort = args.reasoningEffort;

  const resp = (await args.client.chat.completions.create(
    request as unknown as Parameters<typeof args.client.chat.completions.create>[0],
  )) as OpenAI.Chat.Completions.ChatCompletion;
  args.meter?.record('research.review', resp.usage);

  const content = resp.choices[0]?.message?.content;
  if (!content) throw new Error('llm_empty_response');
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error('llm_invalid_json'); }
  const result = ResearchReviewSchema.safeParse(parsed);
  if (!result.success) throw new Error(`llm_schema_mismatch: ${result.error.message}`);
  return result.data;
}
