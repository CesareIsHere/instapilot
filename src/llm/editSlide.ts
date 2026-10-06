import type OpenAI from 'openai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ReasoningEffort } from './client';
import { DEFAULT_CONTENT_LANGUAGE } from '@/server/brand';

const EditedSlideSchema = z.object({
  html: z
    .string()
    .describe('The COMPLETE, edited HTML document (from <!DOCTYPE html> to </html>), with the requested change applied.'),
  summary: z.string().describe('One short sentence, in the content language, describing what was changed.'),
});
export type EditedSlide = z.infer<typeof EditedSlideSchema>;

export interface EditSlideArgs {
  client: OpenAI;
  model: string;
  reasoningEffort?: ReasoningEffort;
  /** Full HTML document of the slide currently rendered (as stored in slide-NN.html). */
  currentHtml: string;
  /** Natural-language instruction from the user, e.g. "make the title shorter and add a numeric example". */
  instruction: string;
  /** Optional brand context to keep tone/colors consistent. */
  brandContext?: string;
  /** Language of the slide copy (defaults to the Brand Kit default). */
  language?: string;
}

function buildSystemPrompt(language: string): string {
  return `You are an expert editor of HTML/CSS Instagram slides (1080×1350 px format).
You are given the COMPLETE HTML document of an already rendered slide and an edit instruction (which may be written in any language).

Strict rules:
- Apply ONLY the requested change, with the smallest possible edit. Keep everything else identical (structure, recipe, layout, classes, colors not mentioned).
- ALWAYS return the COMPLETE, valid HTML document (from <!DOCTYPE html> to </html>), never a fragment.
- All content must stay inside the 1080×1350 canvas; do not introduce overflow, overlaps or clipped text.
- Do not add scripts, inline event handlers (onClick…), iframes or remote URLs. Images are referenced only via the {{asset:<id>}} tokens already present or the data URIs already in the document.
- Keep font, palette and tone consistent with the brand.
- Any slide copy you write or rewrite must be in ${language}.
- If the instruction is about the text, change only the affected copy. If it is about the layout/visuals, touch only what is needed.`;
}

export async function editSlideHtml(args: EditSlideArgs): Promise<EditedSlide> {
  const { client, model, reasoningEffort, currentHtml, instruction, brandContext } = args;
  const jsonSchema = zodToJsonSchema(EditedSlideSchema, { name: 'EditedSlide', nameStrategy: 'title' });

  const userPrompt = [
    brandContext ? `BRAND CONTEXT:\n${brandContext}\n` : '',
    `EDIT INSTRUCTION:\n${instruction}\n`,
    `CURRENT HTML DOCUMENT TO EDIT:\n${currentHtml}`,
  ].join('\n');

  const request: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: buildSystemPrompt(args.language ?? DEFAULT_CONTENT_LANGUAGE) },
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
