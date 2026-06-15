import type OpenAI from 'openai';
import type { ReasoningEffort } from '@/llm/client';
import type { UsageMeter } from '@/llm/usage';
import { log } from '@/lib/log';

// OpenAI Responses API web-search tool. Configurable for forward-compat
// (web_search_preview is the broadly-supported variant for gpt-4o).
const WEB_SEARCH_TOOL = process.env.OPENAI_WEB_SEARCH_TOOL ?? 'web_search_preview';

function buildResearchPrompt(
  topic: string,
  instructions: string | undefined,
  format: 'single' | 'carousel',
  slideCount: number | undefined,
  brandName: string,
  feedback?: string,
): string {
  const corrections = feedback
    ? `\n\n--- REVISIONE PRECEDENTE DA CORREGGERE ---\nIl dossier precedente è stato bocciato per questi motivi. Correggili in questa versione:\n${feedback}\n`
    : '';

  const isSingle = format === 'single';
  const formatHint = isSingle
    ? `Il materiale servirà per un SINGOLO POST Instagram (1 sola immagine 1080×1350). Produci un dossier SNELLO: solo i concetti e i dati strettamente necessari a spiegare l'argomento in una slide. Niente sezioni accademiche o approfondimenti laterali.`
    : `Il materiale servirà per un CAROSELLO da ${slideCount ?? 'alcune'} slide. Produci un dossier COMPLETO con tutti i concetti, dati ed esempi necessari a riempire più slide in modo progressivo.`;

  const sections = isSingle
    ? `Produci un dossier di ricerca in italiano con QUESTE SEZIONI (brevi e focalizzate):
1. CONCETTI CHIAVE — i 2-3 concetti essenziali, spiegati in modo accessibile a chi parte da zero. Niente sotto-sezioni.
2. DATO CHIAVE — al massimo 1-2 statistiche concrete e recenti con anno e fonte. Solo quelle che rafforzano davvero il messaggio.
3. ESEMPI — 1-2 analogie pratiche che rendano tangibile il concetto principale.
4. ANGOLI E HOOK — 2 ganci d'apertura forti utilizzabili per un post Instagram.`
    : `Produci un dossier di ricerca in italiano con QUESTE SEZIONI esplicite:
1. CONCETTI CHIAVE — i concetti necessari, spiegati in modo accessibile a chi parte da zero.
2. DATI E NUMERI — statistiche concrete e recenti. Ogni dato DEVE avere anno e fonte. Se non sei certo dell'aggiornamento, segnalalo esplicitamente con "[da verificare]".
3. ESEMPI E ANALOGIE — almeno 2 esempi pratici o analogie concrete che rendano tangibili i concetti.
4. ERRORI COMUNI — fraintendimenti diffusi da sfatare.
5. ANGOLI E HOOK — 2-3 angoli narrativi forti e ganci d'apertura utilizzabili per un post Instagram.
6. FONTI — le fonti principali consultate.`;

  return `Sei un ricercatore senior di finanza personale e investimenti per ${brandName} (contenuti educativi in italiano), rivolto a un pubblico NON esperto.

${formatHint}

ARGOMENTO: ${topic}
${instructions ? `\nISTRUZIONI SUL CONTENUTO: ${instructions}\n` : ''}${corrections}
${sections}

Regole di qualità:
- Accuratezza prima di tutto: niente affermazioni inventate. Distingui i fatti dalle opinioni.
- Niente contenuto generico o "filler": ogni riga deve essere utile a chi scriverà il post.
- Non scrivere il post: produci solo materiale di ricerca.`;
}

export interface ResearchArgs {
  client: OpenAI;
  model: string;
  reasoningEffort?: ReasoningEffort;
  topic: string;
  instructions?: string;
  format: 'single' | 'carousel';
  slideCount?: number;
  /** When false, skip the web-search tool and rely on model knowledge — saves tokens/latency for evergreen topics. Defaults to true. */
  useWebSearch?: boolean;
  meter?: UsageMeter;
  feedback?: string;
  brandName?: string;
}

/**
 * Agent 1 — Researcher. Uses the OpenAI Responses API with the native
 * web-search tool to gather up-to-date material on the topic. Falls back to
 * model knowledge (chat completion, no web search) if the Responses API or the
 * web-search tool is unavailable (e.g. a proxy that doesn't support it).
 */
export async function researchTopic(args: ResearchArgs): Promise<string> {
  const { client, model, reasoningEffort, topic, instructions, format, slideCount } = args;
  const prompt = buildResearchPrompt(topic, instructions, format, slideCount, args.brandName ?? 'il brand', args.feedback);

  // Evergreen topics don't need fresh web data — skip the search tool to save tokens/latency.
  if (args.useWebSearch === false) {
    log.info('content.research.web_disabled', {});
    return researchWithoutWeb({ client, model, reasoningEffort, prompt, meter: args.meter });
  }

  try {
    const request: Record<string, unknown> = {
      model,
      tools: [{ type: WEB_SEARCH_TOOL }],
      input: prompt,
    };
    if (reasoningEffort) request.reasoning = { effort: reasoningEffort };

    const resp = await client.responses.create(
      request as unknown as Parameters<typeof client.responses.create>[0],
    );
    const text = (resp as { output_text?: string }).output_text;
    if (text && text.trim().length > 0) {
      args.meter?.record('research', (resp as { usage?: Record<string, number> }).usage);
      log.info('content.research.done', { mode: 'web_search', chars: text.length });
      return text;
    }
    throw new Error('empty_web_search_response');
  } catch (err) {
    log.warn('content.research.fallback', { reason: (err as Error).message });
    return researchWithoutWeb({ client, model, reasoningEffort, prompt, meter: args.meter });
  }
}

async function researchWithoutWeb(args: {
  client: OpenAI;
  model: string;
  reasoningEffort?: ReasoningEffort;
  prompt: string;
  meter?: UsageMeter;
}): Promise<string> {
  const request: Record<string, unknown> = {
    model: args.model,
    messages: [
      {
        role: 'system',
        content:
          'Sei un ricercatore esperto di finanza personale. Non hai accesso a internet: usa la tua conoscenza, segnalando esplicitamente quando un dato potrebbe non essere aggiornato.',
      },
      { role: 'user', content: args.prompt },
    ],
  };
  if (args.reasoningEffort) request.reasoning_effort = args.reasoningEffort;

  const resp = (await args.client.chat.completions.create(
    request as unknown as Parameters<typeof args.client.chat.completions.create>[0],
  )) as OpenAI.Chat.Completions.ChatCompletion;

  args.meter?.record('research', resp.usage);

  const text = resp.choices[0]?.message?.content;
  if (!text) throw new Error('research_failed: no content from model');
  log.info('content.research.done', { mode: 'model_knowledge', chars: text.length });
  return text;
}
