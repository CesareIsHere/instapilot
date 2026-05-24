import type OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { GeneratedSlideSchema, type GeneratedSlide } from './schema';
import type { ReasoningEffort } from './client';

export interface GenerateArgs {
  client: OpenAI;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  reasoningEffort?: ReasoningEffort;
}

export async function generateSlideCode(args: GenerateArgs): Promise<GeneratedSlide> {
  const { client, model, systemPrompt, userPrompt, reasoningEffort } = args;
  const jsonSchema = zodToJsonSchema(GeneratedSlideSchema, { name: 'GeneratedSlide', nameStrategy: 'title' });

  const request: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'GeneratedSlide', strict: true, schema: jsonSchema as Record<string, unknown> },
    },
  };
  if (reasoningEffort) {
    request.reasoning_effort = reasoningEffort;
  }

  const response = (await client.chat.completions.create(
    request as unknown as Parameters<typeof client.chat.completions.create>[0],
  )) as OpenAI.Chat.Completions.ChatCompletion;

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('llm_empty_response: no content in LLM response');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('llm_invalid_response: not valid JSON');
  } 

  const result = GeneratedSlideSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`llm_invalid_response: schema mismatch — ${result.error.message}`);
  }
  return result.data;
}
