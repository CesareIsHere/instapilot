import { z } from 'zod';
import type OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ReasoningEffort } from '@/llm/client';
import type { UsageMeter } from '@/llm/usage';
import type { SlideRole } from './htmlSystemPrompt';
import { manifest } from '@/assets/manifest';

const RECIPE_VALUES = [
  'cover', 'numbered-list', 'compare-2col', 'kpi-hero', 'card-grid-2x2', 'quote', 'cta',
  'card-grid', 'concept-breakdown', 'flow-diagram', 'breakdown-chart',
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

function buildPlannerSystemPrompt(brandContext: string, role: SlideRole | undefined, selfContained = false): string {
  const assetList = Object.entries(manifest)
    .map(([id, e]) => `- "${id}": ${e.description}`)
    .join('\n');

  const coverHint = selfContained
    ? 'STANDALONE single post — no following slides, so it must be SELF-CONTAINED: hook + key insight + (if useful) one supporting data point + a soft takeaway, all in one slide. Richer and more complete than a carousel cover, but still one focal point. Do not leave it sparse.'
    : 'Opening slide: strong hero title, minimal text, bold focal point. Logo at top center.';

  const roleHint = role
    ? `\n## SLIDE ROLE: ${role.toUpperCase()}\n${
        role === 'cover'
          ? coverHint
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
- card-grid-2x2: Four equal cards in a 2×2 grid (label + value + description).
- card-grid: 3–6 parallel concepts as cards (label + short explanation), 3 columns × N rows. Use for "N things/metrics/indicators".
- concept-breakdown: Unpack ONE concept — definition box + formula/breakdown box + optional glossary box. For "what is X" explainers.
- flow-diagram: A process / how-it-works flow with 3–6 ordered nodes connected by arrows (optional emoji per node).
- breakdown-chart: Proportional bars / step-down breakdown (e.g. revenue → margin → EBITDA → net), each bar labeled with what it is and its value.
- quote: Large pull quote + attribution.
- cta: Closing call-to-action with key message + social invite.

## BRAND RULES
The CANVAS background is ALWAYS pure white. Titles are navy. Mixed-color titles (navy + 1–2 green/red words) are the Finvestire signature.
- Green: positive keywords, growth metrics, favorable outcomes / "what remains" in a breakdown
- Red: negative keywords, risk/loss, costs subtracted in a breakdown
- For richer layouts (card-grid, flow-diagram, breakdown-chart, concept-breakdown) you MAY give cards / diagram nodes / chart blocks distinct ACCENT borders and LIGHT pastel SURFACE fills (amber, sky/blue, violet, teal, gray, green, red) to tell them apart — used semantically, not randomly. These never go on the canvas itself.
- EMOJI: allowed sparingly as node/section icons in flow-diagram / lists (1 per node, consistent, meaningful) — never decorative clutter.
Express colors only as semantic intent in colorPlan (the renderer maps them to brand CSS variables; never specify hex).
Font: Montserrat only. Keep content concise — it must fit in 1080×1350px without overflow.
Logo "logo-f" (navy circle with white F) must appear on every slide at top center.

## AVAILABLE ASSETS
${assetList}

## OUTPUT (SlideDesignSpec schema)
- recipe: layout pattern
- rationale: why this recipe fits (1–2 sentences)
- headline.text: main title in Italian, ≤ ~12 words, says what the slide is about and why it matters; headline.coloredSpans: [{word, color}] for green/red words (null if all navy)
- eyebrow: a SHORT, TOPICAL uppercase label that names the subject (e.g. "ETF VS FONDI", "INFLAZIONE"). It must add meaning. NEVER use generic meta-labels like "CONTESTO", "OGGETTO DELLA SLIDE", "INVESTIMENTO", "INTRODUZIONE" — if no real topical label fits, set it to null.
- bodyElements: content pieces in order — [{type, text, emphasis}]; emphasis "green"/"red"/"none"
  - types: "paragraph" | "list-item" | "kpi" | "card" | "caption" | "quote-text"
  - a "kpi" number is NEVER bare: its text must carry BOTH what it is (a label) AND what it means (a one-line takeaway), e.g. "0,27% — costo medio annuo di un ETF passivo" not just "0,27%".
- colorPlan: semantic description (e.g. "titolo navy con 'rendimento' verde")
- useAssets: asset ids to use (always include "logo-f"), null if none
- notes: special layout consideration, null if none

## EDITORIAL QUALITY (binding)
- One idea per slide, but FULLY developed — never a bare title on an empty slide, never a wall of text. Body ≈ ≤ 300 characters.
- DATA: at most ONE key number per slide; every number needs a label + a takeaway. Don't pile up figures.
- EMPHASIS / HIERARCHY: exactly one focal point per slide. Highlight at most 1–2 words. Green ONLY for positive/growth, red ONLY for risk/loss — never the wrong color, never decorative highlighting.
- SYMMETRY: for compare-2col / card-grid-2x2 / multi-column kpi, the columns must be parallel — same number of items, comparable text length, same structure on each side.
- LANGUAGE: conversational, address the reader as "tu"; explain or replace every technical term (the audience starts from zero).
- No repetition across the slide's own elements; every element earns its place.

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
  designContext?: string;
  selfContained?: boolean;
}): Promise<SlideDesignSpec> {
  const ctx = args.designContext
    ? `${args.userPrompt}\n\n---\nCAROUSEL CONTEXT (for visual coherence across the series):\n${args.designContext}`
    : args.userPrompt;
  const userContent = args.feedback
    ? `${ctx}\n\n---\nDesign review feedback (previous spec rejected — address these issues):\n${args.feedback}`
    : ctx;

  return callLlmJson(
    args.client, args.model, args.reasoningEffort,
    [
      { role: 'system', content: buildPlannerSystemPrompt(args.brandContext, args.role, args.selfContained) },
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
2. Headline: clear, ≤ ~12 words, says what the slide is about and why it matters?
3. Completeness & density: one idea, FULLY developed — not a bare title on an empty slide, not a wall of text (body ≈ ≤ 300 chars)?
4. Data with meaning: is every kpi/number given a label (what it is) AND a takeaway (what it means)? At most one key number? Flag bare numbers.
5. Color semantics & hierarchy: exactly one focal point; ≤ 1–2 highlighted words in the headline; green ONLY for positive, red ONLY for negative, never the wrong color. (Distinct accent borders / pastel surfaces on cards/diagram-nodes/chart-blocks are fine for card-grid, flow-diagram, breakdown-chart and concept-breakdown — judge them as structural, not as decorative highlighting.)
6. Symmetry: for compare-2col / card-grid-2x2 / multi-column kpi, are the columns parallel (same item count, comparable length, same structure)?
7. Eyebrow: is it a real topical label (or null)? Reject generic meta-labels like "CONTESTO", "OGGETTO DELLA SLIDE", "INVESTIMENTO", "INTRODUZIONE".
8. Language: conversational ("tu"); technical terms explained or avoided (audience starts from zero)?
9. Feasibility: would this content realistically fit in 1080×1350px?

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
