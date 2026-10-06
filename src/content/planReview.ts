import { z } from 'zod';
import type OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ReasoningEffort } from '@/llm/client';
import type { UsageMeter } from '@/llm/usage';
import type { ContentPlan, ContentFormat } from './plan';
import { GENERIC_BRAND_NAME } from '@/html/brandVars';
import { DEFAULT_CONTENT_LANGUAGE } from '@/server/brand';

export const PlanReviewSchema = z.object({
  approved: z.boolean(),
  issues: z.array(z.string()),
  planFeedback: z.string().nullable(),
});
export type PlanReview = z.infer<typeof PlanReviewSchema>;

function buildPlanReviewerPrompt(brandName: string, language: string): string {
  return `You are the editor-in-chief of ${brandName}. You evaluate the PLAN of an Instagram piece (its slide structure and briefs) BEFORE the slides are generated. The reader-facing copy is in ${language}.

Check:
1. Structure: does it respect the requested format (number of slides, cover/body/cta roles)?
2. Narrative arc: cover with a strong hook → logical development → a cta that closes with an invitation?
3. One idea per slide BUT developed: no overloaded slide AND no empty/too-thin slide (every body slide must teach something complete: mini-headline + explanation + optional proof).
4. NO REPETITION: no slide re-explains an already covered concept in different words. Every slide adds NEW information.
5. Per-slide goal: does every slide state what it must achieve in the arc? If unclear, that is a problem.
6. Data with meaning: does every number have a label (what it is) and a takeaway (what it tells you)? No bare numbers and no pile-up of figures (max ~1 key data point per slide)?
7. Register: conversational, informal second person; technical terms explained or replaced (audience starting from zero)? No unexplained jargon?
8. Amount: headline ≤ ~12 words, body ≈ ≤ 300 characters per slide? If a brief reads like a paragraph, it must be trimmed.
9. Comparisons/columns: are the items symmetric (same number of items, parallel structure, similar lengths)?
9b. Data visualisation: do the slides that compare several numbers, show proportions/rankings or a change over time use a CHART (bar-chart/progression-chart/breakdown-chart) rather than just text or a single number? If data is left as text, flag it.
10. Brief quality: is every brief self-contained, with headline, layout hint and angle, and faithful to the dossier/topic?
11. Feasibility: does each slide's content fit in 1080×1350 without overflow?
12. Framework: is the declared structure appropriate? Is the sequence of narrativeFunctions consistent with that framework?
13. Foreshadowing: are the cover and slide 2 consistent (slide 2 opens the loop / explains why it matters)?
14. Mini-loops and payoff: does every open loop close within 1-2 slides; is there a recap on the second-to-last slide, before the CTA, that echoes the cover?
15. CTA: only ONE, clear, and only on the last slide?
16. Pacing: a reasonable number of slides for the framework (typically 6-9; do not force ≈7 onto list or roadmap frameworks)?

Be demanding but fair. Approve if the plan is solid. Reject only for real problems.
If you do NOT approve, list the issues and give concrete, actionable instructions in planFeedback to redo the plan.
JSON output: { "approved": boolean, "issues": string[], "planFeedback": string | null }.
If approved, issues is empty and planFeedback is null.`;
}

export async function reviewPlan(args: {
  client: OpenAI;
  model: string;
  reasoningEffort?: ReasoningEffort;
  topic: string;
  instructions?: string;
  format: ContentFormat;
  slideCount?: number;
  research: string;
  plan: ContentPlan;
  meter?: UsageMeter;
  brandName?: string;
  language?: string;
}): Promise<PlanReview> {
  const jsonSchema = zodToJsonSchema(PlanReviewSchema, { name: 'PlanReview', nameStrategy: 'title' });
  const slidesText = args.plan.slides
    .map((s, i) => `### Slide ${i} (${s.role} / ${s.narrativeFunction})\n${s.brief}`)
    .join('\n\n');
  const userContent = `TOPIC: ${args.topic}
${args.instructions ? `INSTRUCTIONS: ${args.instructions}\n` : ''}FORMAT: ${args.format}${args.slideCount ? ` (${args.slideCount} slides)` : ''}

RESEARCH DOSSIER:
${args.research}

PROPOSED PLAN — framework: "${args.plan.framework}", title: "${args.plan.title}", angle: "${args.plan.angle}"
${slidesText}`;

  const request: Record<string, unknown> = {
    model: args.model,
    messages: [
      { role: 'system', content: buildPlanReviewerPrompt(args.brandName ?? GENERIC_BRAND_NAME, args.language ?? DEFAULT_CONTENT_LANGUAGE) },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'PlanReview', strict: true, schema: jsonSchema } },
  };
  if (args.reasoningEffort) request.reasoning_effort = args.reasoningEffort;

  const resp = (await args.client.chat.completions.create(
    request as unknown as Parameters<typeof args.client.chat.completions.create>[0],
  )) as OpenAI.Chat.Completions.ChatCompletion;
  args.meter?.record('plan.review', resp.usage);

  const content = resp.choices[0]?.message?.content;
  if (!content) throw new Error('llm_empty_response');
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error('llm_invalid_json'); }
  const result = PlanReviewSchema.safeParse(parsed);
  if (!result.success) throw new Error(`llm_schema_mismatch: ${result.error.message}`);
  return result.data;
}
