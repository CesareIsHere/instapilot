import type OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { GeneratedSlideSchema, type GeneratedSlide } from './schema';

export interface GenerateArgs {
  client: OpenAI;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}

export async function generateSlideCode(args: GenerateArgs): Promise<GeneratedSlide> {
  const { client, model, systemPrompt, userPrompt } = args;
  const jsonSchema = zodToJsonSchema(GeneratedSlideSchema, { name: 'GeneratedSlide', nameStrategy: 'title' });

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'GeneratedSlide', strict: true, schema: jsonSchema as Record<string, unknown> },
    },
  });

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
