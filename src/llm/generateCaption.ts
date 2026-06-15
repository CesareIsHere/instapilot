import type OpenAI from 'openai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ReasoningEffort } from './client';

const CaptionSchema = z.object({
  caption: z
    .string()
    .describe('La didascalia Instagram completa in italiano: hook iniziale, corpo con valore, e una call-to-action finale. Usa a capo per la leggibilità. NON includere gli hashtag qui.'),
  hashtags: z
    .array(z.string())
    .describe('Da 5 a 12 hashtag pertinenti, in italiano/inglese, ognuno SENZA il simbolo # iniziale (verrà aggiunto dal client).'),
});
export type GeneratedCaption = z.infer<typeof CaptionSchema>;

export interface GenerateCaptionArgs {
  client: OpenAI;
  model: string;
  reasoningEffort?: ReasoningEffort;
  topic: string;
  title?: string;
  angle?: string;
  /** Plain-text content extracted from the slides, in order. */
  slidesText: string[];
  brandContext?: string;
}

const SYSTEM_PROMPT = `Sei un social media manager esperto di Instagram per un brand finanziario/educativo italiano.
Scrivi la didascalia (caption) per un post/carosello a partire dal suo contenuto.

Regole:
- Scrivi in italiano, tono coerente con il brand: chiaro, autorevole ma accessibile, mai gergale.
- Inizia con un hook forte nella prima riga (cattura l'attenzione, niente "Ciao a tutti").
- Sviluppa il valore in modo conciso, riprendendo i concetti chiave delle slide senza ripeterle parola per parola.
- Chiudi con una call-to-action naturale (salva, commenta, condividi o segui).
- Puoi usare pochi emoji pertinenti, senza esagerare.
- Gli hashtag vanno SOLO nel campo dedicato, senza il simbolo #.`;

export async function generateCaption(args: GenerateCaptionArgs): Promise<GeneratedCaption> {
  const { client, model, reasoningEffort, topic, title, angle, slidesText, brandContext } = args;
  const jsonSchema = zodToJsonSchema(CaptionSchema, { name: 'Caption', nameStrategy: 'title' });

  const slidesBlock = slidesText
    .map((t, i) => `Slide ${i + 1}: ${t}`)
    .join('\n');

  const userPrompt = [
    brandContext ? `CONTESTO BRAND:\n${brandContext}\n` : '',
    `ARGOMENTO: ${topic}`,
    title ? `TITOLO: ${title}` : '',
    angle ? `ANGOLO: ${angle}` : '',
    `\nCONTENUTO DELLE SLIDE:\n${slidesBlock}`,
  ].filter(Boolean).join('\n');

  const request: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'Caption', strict: true, schema: jsonSchema as Record<string, unknown> },
    },
  };
  if (reasoningEffort) request.reasoning_effort = reasoningEffort;

  const response = (await client.chat.completions.create(
    request as unknown as Parameters<typeof client.chat.completions.create>[0],
  )) as OpenAI.Chat.Completions.ChatCompletion;

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('llm_empty_response: no content in LLM response');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('llm_invalid_response: not valid JSON');
  }

  const result = CaptionSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`llm_invalid_response: schema mismatch — ${result.error.message}`);
  }
  return result.data;
}
