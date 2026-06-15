import type OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { GeneratedHtmlSchema, type GeneratedHtml } from './schema';
import type { ReasoningEffort } from '@/llm/client';
import type { UsageMeter } from '@/llm/usage';

export interface GenerateHtmlArgs {
  client: OpenAI;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  reasoningEffort?: ReasoningEffort;
  feedback?: string;
  meter?: UsageMeter;
}

export async function generateSlideHtml(args: GenerateHtmlArgs): Promise<GeneratedHtml> {
  const { client, model, systemPrompt, userPrompt, reasoningEffort } = args;
  const jsonSchema = zodToJsonSchema(GeneratedHtmlSchema, { name: 'GeneratedHtml', nameStrategy: 'title' });

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const request: Record<string, unknown> = {
    model,
    messages,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'GeneratedHtml',
        strict: true,
        schema: jsonSchema as Record<string, unknown>,
      },
    },
  };
  if (reasoningEffort) {
    request.reasoning_effort = reasoningEffort;
  }

  const response = (await client.chat.completions.create(
    request as unknown as Parameters<typeof client.chat.completions.create>[0],
  )) as OpenAI.Chat.Completions.ChatCompletion;

  args.meter?.record('html.generate', response.usage);

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('llm_empty_response: no content in LLM response');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('llm_invalid_response: not valid JSON');
  }

  const result = GeneratedHtmlSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`llm_invalid_response: schema mismatch — ${result.error.message}`);
  }
  return result.data;
}
