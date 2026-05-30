import { z } from 'zod';
import type OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ReasoningEffort } from '@/llm/client';
import type { SlideDesignSpec } from '@/html/designSpec';

export const SlideFixSchema = z.object({
  slideIndex: z.number().int().min(0),
  issue: z.string().min(1),
  fix: z.string().min(1),
});

export const ContentReviewSchema = z.object({
  approved: z.boolean(),
  generalNotes: z.string().nullable(),
  slideFixes: z.array(SlideFixSchema),
});

export type SlideFix = z.infer<typeof SlideFixSchema>;
export type ContentReview = z.infer<typeof ContentReviewSchema>;

/** Lightweight per-slide summary the reviewer evaluates (text only — visual
 * quality is already enforced by the per-slide pipeline's Agent 4). */
export interface ReviewableSlide {
  index: number;
  role: string;
  brief: string;
  intent: string;
  designSpec: SlideDesignSpec;
}

const REVIEWER_PROMPT = `Sei un caporedattore di Finvestire. Esegui la revisione editoriale finale di un contenuto Instagram (singolo post o carosello) già strutturato in slide.

Valuta l'INSIEME del contenuto, non la singola slide isolata:
1. Aderenza all'argomento: il contenuto risponde davvero al tema e alle istruzioni richieste?
2. Scorrevolezza narrativa: le slide si concatenano in modo logico e fluido? (cover che aggancia → sviluppo progressivo → cta che chiude)
3. Qualità e livello: il contenuto è accurato, chiaro, di alto livello e non banale?
4. Coerenza: nessuna ripetizione inutile, nessuna contraddizione, nessun salto logico.
5. Completezza: i punti chiave dell'argomento sono coperti?

Sii esigente ma equo. Approva se il contenuto è solido. Boccia solo per problemi reali.

Se NON approvi, per ogni slide problematica indica:
- slideIndex (0-based)
- issue: cosa non va
- fix: istruzione concreta e azionabile da aggiungere al brief di quella slide per correggerla

Output JSON (ContentReview): { approved, generalNotes, slideFixes }
Se approvato, slideFixes deve essere un array vuoto.`;

export async function reviewContent(args: {
  client: OpenAI;
  model: string;
  reasoningEffort?: ReasoningEffort;
  topic: string;
  instructions?: string;
  title: string;
  angle: string;
  slides: ReviewableSlide[];
}): Promise<ContentReview> {
  const { client, model, reasoningEffort } = args;
  const jsonSchema = zodToJsonSchema(ContentReviewSchema, { name: 'ContentReview', nameStrategy: 'title' });

  const slidesText = args.slides
    .map(
      (s) =>
        `### Slide ${s.index} (${s.role})\nBrief: ${s.brief}\nIntent: ${s.intent}\nHeadline: ${s.designSpec.headline.text}\nContenuto: ${s.designSpec.bodyElements
          .map((b) => b.text)
          .join(' | ')}`,
    )
    .join('\n\n');

  const userContent = `ARGOMENTO RICHIESTO: ${args.topic}
${args.instructions ? `ISTRUZIONI: ${args.instructions}\n` : ''}
TITOLO CONTENUTO: ${args.title}
ANGOLO: ${args.angle}

SLIDE GENERATE:
${slidesText}`;

  const request: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: REVIEWER_PROMPT },
      { role: 'user', content: userContent },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'ContentReview', strict: true, schema: jsonSchema },
    },
  };
  if (reasoningEffort) request.reasoning_effort = reasoningEffort;

  const resp = (await client.chat.completions.create(
    request as unknown as Parameters<typeof client.chat.completions.create>[0],
  )) as OpenAI.Chat.Completions.ChatCompletion;

  const content = resp.choices[0]?.message?.content;
  if (!content) throw new Error('llm_empty_response');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('llm_invalid_json');
  }

  const result = ContentReviewSchema.safeParse(parsed);
  if (!result.success) throw new Error(`llm_schema_mismatch: ${result.error.message}`);
  return result.data;
}
