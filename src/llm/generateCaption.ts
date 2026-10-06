import type OpenAI from 'openai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ReasoningEffort } from './client';
import { DEFAULT_CONTENT_LANGUAGE } from '@/server/brand';

const CaptionSchema = z.object({
  caption: z
    .string()
    .describe('The complete Instagram caption, in the brand content language: opening hook, value-packed body and a final call to action. Use line breaks for readability. Do NOT include hashtags here.'),
  hashtags: z
    .array(z.string())
    .describe('5 to 12 relevant hashtags (in the content language and/or English), each WITHOUT the leading # (the client adds it).'),
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
  /** Language of the caption (defaults to the Brand Kit default). */
  language?: string;
}

function buildSystemPrompt(language: string): string {
  return `You are an expert Instagram social media manager for an educational content brand.
Write the caption for a post/carousel based on its content.

Rules:
- Write in ${language}, with a tone consistent with the brand: clear, authoritative yet approachable, never jargon-heavy.
- Open with a strong hook on the first line (grab attention, no generic "Hi everyone").
- Deliver the value concisely, picking up the slides' key concepts without repeating them word for word.
- Close with a natural call to action (save, comment, share or follow).
- You may use a few relevant emoji, without overdoing it.
- Hashtags go ONLY in their dedicated field, without the # symbol.`;
}

export async function generateCaption(args: GenerateCaptionArgs): Promise<GeneratedCaption> {
  const { client, model, reasoningEffort, topic, title, angle, slidesText, brandContext } = args;
  const jsonSchema = zodToJsonSchema(CaptionSchema, { name: 'Caption', nameStrategy: 'title' });

  const slidesBlock = slidesText
    .map((t, i) => `Slide ${i + 1}: ${t}`)
    .join('\n');

  const userPrompt = [
    brandContext ? `BRAND CONTEXT:\n${brandContext}\n` : '',
    `TOPIC: ${topic}`,
    title ? `TITLE: ${title}` : '',
    angle ? `ANGLE: ${angle}` : '',
    `\nSLIDE CONTENT:\n${slidesBlock}`,
  ].filter(Boolean).join('\n');

  const request: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: buildSystemPrompt(args.language ?? DEFAULT_CONTENT_LANGUAGE) },
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
