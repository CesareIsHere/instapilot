import type OpenAI from 'openai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ReasoningEffort } from './client';

const EditedSlideSchema = z.object({
  html: z
    .string()
    .describe('The COMPLETE, edited HTML document (from <!DOCTYPE html> to </html>), with the requested change applied.'),
  summary: z.string().describe('One short sentence (Italian) describing what was changed.'),
});
export type EditedSlide = z.infer<typeof EditedSlideSchema>;

export interface EditSlideArgs {
  client: OpenAI;
  model: string;
  reasoningEffort?: ReasoningEffort;
  /** Full HTML document of the slide currently rendered (as stored in slide-NN.html). */
  currentHtml: string;
  /** Natural-language instruction from the user, e.g. "rendi il titolo più corto e aggiungi un esempio numerico". */
  instruction: string;
  /** Optional brand context to keep tone/colors consistent. */
  brandContext?: string;
}

const SYSTEM_PROMPT = `Sei un editor esperto di slide HTML/CSS per Instagram (formato 1080×1350 px).
Ti viene dato il documento HTML COMPLETO di una slide già renderizzata e un'istruzione di modifica.

Regole tassative:
- Applica SOLO la modifica richiesta, con il minor cambiamento possibile. Mantieni tutto il resto identico (struttura, recipe, layout, classi, colori non menzionati).
- Restituisci SEMPRE il documento HTML COMPLETO e valido (da <!DOCTYPE html> a </html>), non un frammento.
- Tutto il contenuto deve restare dentro il canvas 1080×1350; non introdurre overflow, sovrapposizioni o testo tagliato.
- Non aggiungere script, gestori inline di eventi (onClick…), iframe o URL remoti. Le immagini si referenziano solo via i token {{asset:<id>}} già presenti o tramite i data URI già nel documento.
- Mantieni font, palette e tono coerenti con il brand.
- Se l'istruzione riguarda il testo, cambia solo la copy interessata. Se riguarda il layout/visivo, tocca solo ciò che serve.`;

export async function editSlideHtml(args: EditSlideArgs): Promise<EditedSlide> {
  const { client, model, reasoningEffort, currentHtml, instruction, brandContext } = args;
  const jsonSchema = zodToJsonSchema(EditedSlideSchema, { name: 'EditedSlide', nameStrategy: 'title' });

  const userPrompt = [
    brandContext ? `CONTESTO BRAND:\n${brandContext}\n` : '',
    `ISTRUZIONE DI MODIFICA:\n${instruction}\n`,
    `DOCUMENTO HTML ATTUALE DA MODIFICARE:\n${currentHtml}`,
  ].join('\n');

  const request: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'EditedSlide', strict: true, schema: jsonSchema as Record<string, unknown> },
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

  const result = EditedSlideSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`llm_invalid_response: schema mismatch — ${result.error.message}`);
  }
  return result.data;
}
