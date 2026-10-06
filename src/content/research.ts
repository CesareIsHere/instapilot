import type OpenAI from 'openai';
import type { ReasoningEffort } from '@/llm/client';
import type { UsageMeter } from '@/llm/usage';
import { log } from '@/lib/log';
import { GENERIC_BRAND_NAME } from '@/html/brandVars';
import { DEFAULT_CONTENT_LANGUAGE } from '@/server/brand';

// OpenAI Responses API web-search tool. Configurable for forward-compat
// (web_search_preview is the broadly-supported variant for gpt-4o).
const WEB_SEARCH_TOOL = process.env.OPENAI_WEB_SEARCH_TOOL ?? 'web_search_preview';

function buildResearchPrompt(
  topic: string,
  instructions: string | undefined,
  format: 'single' | 'carousel',
  slideCount: number | undefined,
  brandName: string,
  language: string,
  feedback?: string,
): string {
  const corrections = feedback
    ? `\n\n--- PREVIOUS REVIEW TO ADDRESS ---\nThe previous dossier was rejected for these reasons. Fix them in this version:\n${feedback}\n`
    : '';

  const isSingle = format === 'single';
  const formatHint = isSingle
    ? `The material is for a SINGLE Instagram POST (one 1080×1350 image). Produce a LEAN dossier: only the concepts and data strictly needed to explain the topic in one slide. No academic sections or side tangents.`
    : `The material is for a CAROUSEL of ${slideCount ?? 'several'} slides. Produce a COMPLETE dossier with all the concepts, data and examples needed to fill several slides progressively.`;

  const sections = isSingle
    ? `Write the research dossier in ${language} with THESE SECTIONS (short and focused):
1. KEY CONCEPTS — the 2-3 essential concepts, explained accessibly for someone starting from zero. No sub-sections.
2. KEY DATA POINT — at most 1-2 concrete, recent statistics with year and source. Only those that genuinely strengthen the message.
3. EXAMPLES — 1-2 practical analogies that make the main concept tangible.
4. ANGLES & HOOKS — 2 strong opening hooks usable for an Instagram post.`
    : `Write the research dossier in ${language} with THESE explicit SECTIONS:
1. KEY CONCEPTS — the concepts needed, explained accessibly for someone starting from zero.
2. DATA & NUMBERS — concrete, recent statistics. Every figure MUST have a year and a source. If you are not sure it is up to date, flag it explicitly with "[to verify]".
3. EXAMPLES & ANALOGIES — at least 2 practical examples or concrete analogies that make the concepts tangible.
4. COMMON MISTAKES — widespread misconceptions to debunk.
5. ANGLES & HOOKS — 2-3 strong narrative angles and opening hooks usable for an Instagram post.
6. SOURCES — the main sources consulted.`;

  return `You are a senior researcher preparing material for educational Instagram content in ${language} for ${brandName}, aimed at a NON-expert audience. The specific sector, angle and audience are described in the BRAND CONTEXT: adapt your research and examples to that context.

${formatHint}

TOPIC: ${topic}
${instructions ? `\nCONTENT INSTRUCTIONS: ${instructions}\n` : ''}${corrections}
${sections}

Quality rules:
- Accuracy first: no invented claims. Separate facts from opinions.
- No generic content or filler: every line must be useful to whoever writes the post.
- Do not write the post: produce research material only.`;
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
  /** Language of the reader-facing copy (defaults to the Brand Kit default). */
  language?: string;
}

/**
 * Agent 1 — Researcher. Uses the OpenAI Responses API with the native
 * web-search tool to gather up-to-date material on the topic. Falls back to
 * model knowledge (chat completion, no web search) if the Responses API or the
 * web-search tool is unavailable (e.g. a proxy that doesn't support it).
 */
export async function researchTopic(args: ResearchArgs): Promise<string> {
  const { client, model, reasoningEffort, topic, instructions, format, slideCount } = args;
  const prompt = buildResearchPrompt(
    topic, instructions, format, slideCount,
    args.brandName ?? GENERIC_BRAND_NAME, args.language ?? DEFAULT_CONTENT_LANGUAGE, args.feedback,
  );

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
          'You are an expert researcher on the requested topic. You have no internet access: rely on your own knowledge and explicitly flag any figure that might be out of date.',
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
