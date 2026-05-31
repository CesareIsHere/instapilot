import { z } from 'zod';
import type OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ReasoningEffort } from '@/llm/client';
import type { UsageMeter } from '@/llm/usage';

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

  return `Sei un content strategist senior per Finvestire (contenuti educativi di finanza in italiano).
Ricevi un dossier di ricerca e pianifichi come strutturare il contenuto in slide per Instagram.

${formatRules}

Per ogni slide scrivi un "brief" AUTOSUFFICIENTE e dettagliato che un agente di design userà per generare la slide. Ogni brief DEVE contenere:
- HEADLINE proposta (testo esatto in italiano) e quali 1-2 parole evidenziare in verde (positivo/crescita) o rosso (rischio/perdita). Non abusare del colore.
- I PUNTI DI CONTENUTO concreti da mostrare, con i DATI specifici presi dal dossier (numeri + anno/fonte quando rilevanti).
- HINT DI LAYOUT: suggerisci la recipe più adatta (cover, numbered-list, compare-2col, kpi-hero, card-grid-2x2, quote, cta).
- TAGLIO: l'angolo emotivo/semantico della slide.
Il brief non deve riferirsi alle altre slide: deve bastare a sé stesso.

Regole:
- UNA idea principale per slide. Non sovraccaricare: meglio poco testo grande che molto testo piccolo (vincolo 1080×1350 senza overflow).
- Arco narrativo: la COVER deve avere un hook fortissimo; le BODY sviluppano in sequenza logica; la CTA chiude con sintesi + invito a seguire/salvare.
- Usa i dati del dossier quando rafforzano il messaggio; niente affermazioni non supportate dalla ricerca.
- Brief in italiano.

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
