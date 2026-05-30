import type OpenAI from 'openai';
import type { ReasoningEffort } from '@/llm/client';
import { log } from '@/lib/log';

// OpenAI Responses API web-search tool. Configurable for forward-compat
// (web_search_preview is the broadly-supported variant for gpt-4o).
const WEB_SEARCH_TOOL = process.env.OPENAI_WEB_SEARCH_TOOL ?? 'web_search_preview';

function buildResearchPrompt(topic: string, instructions: string | undefined): string {
  return `Sei un ricercatore esperto di finanza personale e investimenti per Finvestire (contenuti educativi in italiano).

Approfondisci a fondo il seguente argomento, cercando informazioni aggiornate e affidabili su internet:

ARGOMENTO: ${topic}
${instructions ? `\nISTRUZIONI SUL CONTENUTO: ${instructions}\n` : ''}
Produci un dossier di ricerca strutturato in italiano che includa:
- I concetti chiave necessari per spiegare l'argomento a un pubblico non esperto
- Dati, numeri, statistiche concrete e recenti (con anno/fonte quando rilevante)
- Esempi pratici, analogie o casi reali utili a illustrare i concetti
- Eventuali errori comuni o fraintendimenti da chiarire
- Citazioni delle fonti principali consultate

Il dossier deve essere accurato, fattuale e abbastanza ricco da permettere a un altro agente di scrivere un post Instagram di alta qualità. Non scrivere il post: produci solo il materiale di ricerca.`;
}

export interface ResearchArgs {
  client: OpenAI;
  model: string;
  reasoningEffort?: ReasoningEffort;
  topic: string;
  instructions?: string;
}

/**
 * Agent 1 — Researcher. Uses the OpenAI Responses API with the native
 * web-search tool to gather up-to-date material on the topic. Falls back to
 * model knowledge (chat completion, no web search) if the Responses API or the
 * web-search tool is unavailable (e.g. a proxy that doesn't support it).
 */
export async function researchTopic(args: ResearchArgs): Promise<string> {
  const { client, model, reasoningEffort, topic, instructions } = args;
  const prompt = buildResearchPrompt(topic, instructions);

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
      log.info('content.research.done', { mode: 'web_search', chars: text.length });
      return text;
    }
    throw new Error('empty_web_search_response');
  } catch (err) {
    log.warn('content.research.fallback', { reason: (err as Error).message });
    return researchWithoutWeb({ client, model, reasoningEffort, prompt });
  }
}

async function researchWithoutWeb(args: {
  client: OpenAI;
  model: string;
  reasoningEffort?: ReasoningEffort;
  prompt: string;
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

  const text = resp.choices[0]?.message?.content;
  if (!text) throw new Error('research_failed: no content from model');
  log.info('content.research.done', { mode: 'model_knowledge', chars: text.length });
  return text;
}
