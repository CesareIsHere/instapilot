import { z } from 'zod';
import type OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ReasoningEffort } from '@/llm/client';

export const ContentFormatSchema = z.enum(['single', 'carousel']);
export type ContentFormat = z.infer<typeof ContentFormatSchema>;

export const PlannedSlideSchema = z.object({
  role: z.enum(['cover', 'body', 'cta']),
  brief: z.string().min(1),
});

export const ContentPlanSchema = z.object({
  title: z.string().min(1),
  angle: z.string().min(1),
  slides: z.array(PlannedSlideSchema).min(1),
});

export type PlannedSlide = z.infer<typeof PlannedSlideSchema>;
export type ContentPlan = z.infer<typeof ContentPlanSchema>;

function buildPlannerSystemPrompt(format: ContentFormat, slideCount: number | undefined): string {
  const formatRules =
    format === 'single'
      ? `Il formato è un SINGOLO POST: produci esattamente 1 slide (role "cover"). Tutto il messaggio deve stare in una sola immagine: scegli l'angolo più forte e sintetizza.`
      : `Il formato è un CAROSELLO da ${slideCount} slide. Struttura narrativa:
- Slide 1: COVER (role "cover") — hook forte che cattura l'attenzione e introduce il tema.
- Slide centrali: BODY (role "body") — una idea per slide, sviluppata in modo chiaro e progressivo. Sequenza logica e scorrevole.
- Ultima slide: CTA (role "cta") — sintesi del messaggio chiave + invito a seguire/salvare.
Produci esattamente ${slideCount} slide in totale.`;

  return `Sei un content strategist per Finvestire (contenuti educativi di finanza in italiano).
Ricevi un dossier di ricerca e pianifichi come strutturare il contenuto in slide per Instagram.

${formatRules}

Per ogni slide scrivi un "brief": istruzioni di contenuto dettagliate e autosufficienti che descrivono COSA deve comunicare quella slide (titolo proposto, punti da includere, dati specifici dalla ricerca, eventuale taglio emotivo/semantico). Il brief verrà passato a un agente di design che genererà la slide: deve contenere tutto il necessario, senza riferirsi alle altre slide.

Regole:
- Una idea principale per slide. Non sovraccaricare.
- Mantieni continuità narrativa tra le slide (il carosello deve scorrere come un racconto).
- Usa dati concreti dalla ricerca quando rafforzano il messaggio.
- I brief sono in italiano.

Output JSON (ContentPlan):
- title: titolo editoriale del contenuto complessivo
- angle: l'angolo/taglio scelto in 1-2 frasi
- slides: array di { role, brief } nell'ordine di pubblicazione`;
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
}): Promise<ContentPlan> {
  const { client, model, reasoningEffort, format, slideCount, topic, instructions, research } = args;
  const jsonSchema = zodToJsonSchema(ContentPlanSchema, { name: 'ContentPlan', nameStrategy: 'title' });

  const userContent = `ARGOMENTO: ${topic}
${instructions ? `ISTRUZIONI: ${instructions}\n` : ''}
DOSSIER DI RICERCA:
${research}`;

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
