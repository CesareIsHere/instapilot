import { z } from 'zod';
import type OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ReasoningEffort } from '@/llm/client';
import type { UsageMeter } from '@/llm/usage';
import type { SlideRole } from './htmlSystemPrompt';
import { manifest } from '@/assets/manifest';

const RECIPE_VALUES = [
  'cover', 'numbered-list', 'compare-2col', 'kpi-hero', 'card-grid-2x2', 'quote', 'cta',
] as const;

export const SlideDesignSpecSchema = z.object({
  recipe: z.enum(RECIPE_VALUES),
  rationale: z.string().min(1),
  headline: z.object({
    text: z.string().min(1),
    coloredSpans: z.array(z.object({
      word: z.string().min(1),
      color: z.enum(['green', 'red']),
    })).nullable(),
  }),
  eyebrow: z.string().nullable(),
  bodyElements: z.array(z.object({
    type: z.enum(['paragraph', 'list-item', 'kpi', 'card', 'caption', 'quote-text']),
    text: z.string().min(1),
    emphasis: z.enum(['green', 'red', 'none']),
  })),
  colorPlan: z.string().min(1),
  useAssets: z.array(z.string()).nullable(),
  notes: z.string().nullable(),
});

export type SlideDesignSpec = z.infer<typeof SlideDesignSpecSchema>;

export const DesignReviewSchema = z.object({
  approved: z.boolean(),
  issues: z.array(z.string()),
});

export type DesignReview = z.infer<typeof DesignReviewSchema>;

async function callLlmJson<T extends z.ZodType>(
  client: OpenAI,
  model: string,
  reasoningEffort: ReasoningEffort | undefined,
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  schema: T,
  schemaName: string,
  meter: UsageMeter | undefined,
  label: string,
): Promise<z.infer<T>> {
  const jsonSchema = zodToJsonSchema(schema, { name: schemaName, nameStrategy: 'title' });
  const request: Record<string, unknown> = {
    model,
    messages,
    response_format: {
      type: 'json_schema',
      json_schema: { name: schemaName, strict: true, schema: jsonSchema },
    },
  };
  if (reasoningEffort) request.reasoning_effort = reasoningEffort;

  const resp = await client.chat.completions.create(
    request as unknown as Parameters<typeof client.chat.completions.create>[0],
  ) as OpenAI.Chat.Completions.ChatCompletion;

  meter?.record(label, resp.usage);

  const content = resp.choices[0]?.message?.content;
  if (!content) throw new Error('llm_empty_response');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('llm_invalid_json');
  }

  const result = schema.safeParse(parsed);
  if (!result.success) throw new Error(`llm_schema_mismatch: ${result.error.message}`);
  return result.data;
}

function buildPlannerSystemPrompt(brandContext: string, role: SlideRole | undefined): string {
  const assetList = Object.entries(manifest)
    .map(([id, e]) => `- "${id}": ${e.description}`)
    .join('\n');

  const roleHint = role
    ? `\n## SLIDE ROLE: ${role.toUpperCase()}\n${
        role === 'cover'
          ? 'Opening slide: strong hero title, minimal text, bold focal point. Logo at top center.'
          : role === 'cta'
          ? 'Closing slide: reinforce key message, invite to follow/save. Clean and spacious.'
          : 'Content slide: develop one clear idea with a structured layout.'
      }\n`
    : '';

  return `You are a senior Instagram content strategist for Finvestire (Italian educational finance).
Plan the visual design structure for a single Instagram post (1080×1350 portrait).

Your output is a structured design specification — NOT HTML or CSS. A separate renderer implements it.
${roleHint}
## AVAILABLE RECIPES
- cover: Bold hero title, minimal text, one focal point. Logo top center.
- numbered-list: 3–6 numbered items, each with header + brief description.
- compare-2col: Two-column comparison (pros/cons, A vs B, before/after).
- kpi-hero: One dominant metric/number with supporting context.
- card-grid-2x2: Four equal cards in a 2×2 grid.
- quote: Large pull quote + attribution.
- cta: Closing call-to-action with key message + social invite.

## BRAND RULES
Background is always white. Titles are navy. Mixed-color titles (navy + 1–2 green/red words) are the Finvestire signature.
- Green (#00B373): positive keywords, growth metrics, favorable outcomes ONLY
- Red (#DC2626): negative keywords, risk/loss, unfavorable outcomes ONLY
Font: Montserrat only. Keep content concise — it must fit in 1080×1350px without overflow.
Logo "logo-f" (navy circle with white F) must appear on every slide at top center.

## AVAILABLE ASSETS
${assetList}

## OUTPUT (SlideDesignSpec schema)
- recipe: layout pattern
- rationale: why this recipe fits (1–2 sentences)
- headline.text: main title in Italian; headline.coloredSpans: [{word, color}] for green/red words (null if all navy)
- eyebrow: short UPPERCASE label above the title, null if none (e.g. "INVESTIMENTO")
- bodyElements: content pieces in order — [{type, text, emphasis}]; emphasis "green"/"red"/"none"
  - types: "paragraph" | "list-item" | "kpi" | "card" | "caption" | "quote-text"
- colorPlan: semantic description (e.g. "titolo navy con 'rendimento' verde")
- useAssets: asset ids to use (always include "logo-f"), null if none
- notes: special layout consideration, null if none

## BRAND CONTEXT
${brandContext}`;
}

export async function planSlideDesign(args: {
  client: OpenAI;
  model: string;
  reasoningEffort?: ReasoningEffort;
  brandContext: string;
  userPrompt: string;
  role?: SlideRole;
  feedback?: string;
  meter?: UsageMeter;
}): Promise<SlideDesignSpec> {
  const userContent = args.feedback
    ? `${args.userPrompt}\n\n---\nDesign review feedback (previous spec rejected — address these issues):\n${args.feedback}`
    : args.userPrompt;

  return callLlmJson(
    args.client, args.model, args.reasoningEffort,
    [
      { role: 'system', content: buildPlannerSystemPrompt(args.brandContext, args.role) },
      { role: 'user', content: userContent },
    ],
    SlideDesignSpecSchema, 'SlideDesignSpec',
    args.meter, 'design.plan',
  );
}

const DESIGN_CRITIC_PROMPT = `You are a design critic for Finvestire Instagram posts.
Review the proposed slide design specification against the original content request.

Check:
1. Recipe fit: does the chosen layout match the content type? (numbered-list for tips, kpi-hero for stats)
2. Headline: does it capture the core message clearly?
3. Completeness: are all key content points from the request in bodyElements?
4. Color semantics: green only for positive outcomes, red only for negative — never decorative
5. Content density: appropriate quantity for the recipe — not too sparse, not too dense
6. Feasibility: would this content realistically fit in 1080×1350px?

Be decisive. Approve if the spec is sound. Reject only for genuine mismatches.

Output JSON: { "approved": boolean, "issues": string[] }
If approved, issues must be an empty array.`;

export async function reviewSlideDesign(args: {
  client: OpenAI;
  model: string;
  reasoningEffort?: ReasoningEffort;
  originalPrompt: string;
  designSpec: SlideDesignSpec;
  meter?: UsageMeter;
}): Promise<DesignReview> {
  return callLlmJson(
    args.client, args.model, args.reasoningEffort,
    [
      { role: 'system', content: DESIGN_CRITIC_PROMPT },
      {
        role: 'user',
        content: `Original request:\n${args.originalPrompt}\n\nProposed design spec:\n${JSON.stringify(args.designSpec, null, 2)}`,
      },
    ],
    DesignReviewSchema, 'DesignReview',
    args.meter, 'design.review',
  );
}
