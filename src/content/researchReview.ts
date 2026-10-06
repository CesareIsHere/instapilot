import { z } from 'zod';
import type OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ReasoningEffort } from '@/llm/client';
import type { UsageMeter } from '@/llm/usage';
import { GENERIC_BRAND_NAME } from '@/html/brandVars';
import { DEFAULT_CONTENT_LANGUAGE } from '@/server/brand';

export const ResearchReviewSchema = z.object({
  approved: z.boolean(),
  issues: z.array(z.string()),
});
export type ResearchReview = z.infer<typeof ResearchReviewSchema>;

function buildReviewerPrompt(format: 'single' | 'carousel', brandName: string, language: string): string {
  const depthHint = format === 'single'
    ? `The dossier is for a SINGLE POST (1 slide). Check that it contains the essential key concepts, at least 1 useful data point and 1-2 angles/hooks. Do NOT require all 6 sections or academic depth: the expected depth is intentionally reduced.`
    : `The dossier is for a multi-slide CAROUSEL. Check that it is complete enough to feed several slides progressively: key concepts, data with year/source, examples, common mistakes, angles/hooks.`;

  return `You are a research reviewer for ${brandName} (educational content in ${language}; sector and angle in the BRAND CONTEXT).
You evaluate a research dossier BEFORE it is used to write an Instagram post.

${depthHint}

Check:
1. Accuracy: are the facts plausible and not invented? Are opinions kept separate from facts?
2. Data: do figures have a year/source? Is uncertainty flagged where needed?
3. Usefulness: is the material specific enough to enable a top-quality post?
4. Relevance: does it actually address the topic and the instructions?

Be demanding but fair. Approve if the dossier is solid. Reject only for real gaps.
JSON output: { "approved": boolean, "issues": string[] }. If approved, issues is an empty array.`;
}

export async function reviewResearch(args: {
  client: OpenAI;
  model: string;
  reasoningEffort?: ReasoningEffort;
  topic: string;
  instructions?: string;
  research: string;
  format: 'single' | 'carousel';
  meter?: UsageMeter;
  brandName?: string;
  language?: string;
}): Promise<ResearchReview> {
  const jsonSchema = zodToJsonSchema(ResearchReviewSchema, { name: 'ResearchReview', nameStrategy: 'title' });
  const userContent = `TOPIC: ${args.topic}
${args.instructions ? `INSTRUCTIONS: ${args.instructions}\n` : ''}
DOSSIER TO EVALUATE:
${args.research}`;

  const request: Record<string, unknown> = {
    model: args.model,
    messages: [
      {
        role: 'system',
        content: buildReviewerPrompt(args.format, args.brandName ?? GENERIC_BRAND_NAME, args.language ?? DEFAULT_CONTENT_LANGUAGE),
      },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'ResearchReview', strict: true, schema: jsonSchema } },
  };
  if (args.reasoningEffort) request.reasoning_effort = args.reasoningEffort;

  const resp = (await args.client.chat.completions.create(
    request as unknown as Parameters<typeof args.client.chat.completions.create>[0],
  )) as OpenAI.Chat.Completions.ChatCompletion;
  args.meter?.record('research.review', resp.usage);

  const content = resp.choices[0]?.message?.content;
  if (!content) throw new Error('llm_empty_response');
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error('llm_invalid_json'); }
  const result = ResearchReviewSchema.safeParse(parsed);
  if (!result.success) throw new Error(`llm_schema_mismatch: ${result.error.message}`);
  return result.data;
}
