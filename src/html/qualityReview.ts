import { z } from 'zod';
import type OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { promises as fs } from 'node:fs';
import type { ReasoningEffort } from '@/llm/client';
import type { UsageMeter } from '@/llm/usage';
import type { SlideDesignSpec } from './designSpec';
import type { SlideRole } from './htmlSystemPrompt';

const ISSUE_CATEGORIES = ['brand-color', 'font-size', 'layout', 'logo', 'style', 'content'] as const;

export const QualityIssueSchema = z.object({
  category: z.enum(ISSUE_CATEGORIES),
  description: z.string().min(1),
  suggestion: z.string().min(1),
});

export const QualityReviewSchema = z.object({
  approved: z.boolean(),
  issues: z.array(QualityIssueSchema),
  rendererFeedback: z.string().nullable(),
});

export type QualityIssue = z.infer<typeof QualityIssueSchema>;
export type QualityReview = z.infer<typeof QualityReviewSchema>;

const QUALITY_REVIEWER_PROMPT = `You are the FINAL art director and quality gatekeeper for the brand's Instagram slides.
This slide will be published to a global audience. Your standard is superlative: it must look like
it was crafted by a top-tier design studio — pixel-perfect, intentional, and flawless. Nothing
sloppy ships. You receive the rendered slide image and the HTML/CSS source. Study BOTH meticulously.

MINDSET
- You are not ticking a checklist. You are judging whether this is ready to show the entire world.
- The rules below are a FLOOR, not a ceiling. If anything looks off, cramped, misaligned, accidental,
  or unpolished — even if no specific rule names it — flag it. Trust your eye.
- Scan the image as a critic would: zoom mentally into every block, edge, gap and baseline.
- Default to NOT approving. Approve ONLY when the slide is genuinely publication-grade and you would
  be proud to put your name on it. When in doubt, do not approve.

## VISUAL INTEGRITY (from image) — HIGHEST PRIORITY
Inspect the actual pixels. These are the most common and most damaging defects — hunt for them:
- NO COLLISIONS: no element may overlap another. No text on top of other text. No number, label,
  or icon sitting over a paragraph or over another block. Numbers/labels must stay INSIDE their own
  box, never spilling onto or over a neighbouring box or column.
- NO BROKEN WRAPPING: text and values must wrap naturally. A KPI value must never split awkwardly
  (e.g. the "%" or a digit dropping to its own line, "0,27" on one line and "%" below). If a value
  or label wraps in a way a designer would never accept, flag it.
- ALIGNMENT & SYMMETRY: blocks, columns, baselines and edges must align on a clean grid. Parallel
  elements (e.g. KPI columns, compare columns, a 2×2 grid) must be SYMMETRIC — same top/bottom,
  equal widths, equal gaps, the same number of items per column, comparable text length on each side.
  Flag any drift, uneven spacing, ragged or lopsided columns.
- CONTAINMENT: every piece of content sits comfortably inside its container with balanced padding —
  not touching borders, not overflowing, not clipped, not crammed.
- BREATHING ROOM: spacing between blocks is even and deliberate; no two blocks kiss or crowd; no
  awkward gaps. Density must feel composed, never accidental.
- The CANVAS background must be pure white (no gradients/textures). NOTE: in rich layouts (card-grid, flow-diagram, breakdown-chart, concept-breakdown) individual cards / diagram nodes / chart segments MAY have light colored surface fills and accent borders — that is correct, do NOT flag it as a "colored background"; only flag a colored fill behind the WHOLE slide.
- Logo must be visible at top center
- No text or content appears clipped at canvas edges
- Layout fills the canvas — no large empty areas (>100px of unintentional whitespace)
- Clear visual hierarchy with one dominant focal point
Use category "layout" for any collision, overlap, misalignment, broken wrapping, clipping, crowding
or containment defect, and describe precisely WHICH elements and WHERE in your description.

## WHAT IS YOURS vs THE SHELL (read this before checking the source)
The HTML/CSS you receive is ONLY the renderer's own output (bodyHtml + css). A shell wraps it and adds — these are NOT in what you see and must NEVER be reported as violations:
- the white canvas, its 1080×1350 sizing and overflow:hidden;
- the Montserrat @font-face and the brand color custom properties (the :root block with --brand-navy #012A78, --brand-green #00B373, etc.);
- the bottom-right circular swipe arrow (→).
Hardcoded hex, :root, @font-face, @import, box-shadow and gradients in the renderer's code are already blocked automatically elsewhere — do NOT re-check or report them. Judge the arrow only from the IMAGE (see the rule below), never from the source.

## BRAND COLOR & EMPHASIS REVIEW (image)
- Titles should be navy — not black, not gray
- Exactly ONE focal point per slide; at most 1–2 highlighted words in the headline
- Green ONLY for positive/growth words; red ONLY for negative/risk words — never the wrong color, never decorative HIGHLIGHTING of words (flag green on a negative idea, red on a neutral one, or highlighted words with no meaning)
- In rich layouts, distinct accent borders / pastel surfaces on cards/nodes/segments are fine if used semantically (e.g. one color per node type). A small, meaningful emoji per diagram node / list item is allowed. Flag only color/emoji used randomly or as clutter.

## CONTENT CLARITY REVIEW (image)
- BARE NUMBERS: every number/KPI must show what it is (a label) and ideally what it means — flag a big number with no caption explaining it (category "content")
- EYEBROW LABELS: the small uppercase label above the title must be a real topical label. Flag generic, disconnected meta-labels like "CONTESTO", "OGGETTO DELLA SLIDE", "ARGOMENTO", "INTRODUZIONE" (category "content")

## TYPOGRAPHY REVIEW (source)
- No font-size below 22px for any text; no font-size below 30px inside cards
- Flag only a font OTHER than Montserrat (Montserrat is the shell default — its absence from the renderer's CSS is fine)

## STRUCTURE REVIEW (source)
- Cards: white background, border: 2px solid var(--brand-navy), border-radius ≥ 12px
- The renderer must NOT hand-draw a swipe/CTA arrow glyph (→) in bodyHtml — if you find one authored in the source, flag it (category "layout")

## NARRATIVE / SLIDE-TYPE REVIEW (act as an expert content reviewer)
You are told this slide's role, narrative function and position. Judge whether the CONTENT fits its type:
- cover / hook: a strong hook + clear promise, minimal text, one focal point — NOT a dense body.
- all-in-one (a STANDALONE single post — narrativeFunction "all-in-one", position "standalone"): this slide is the WHOLE content, so it is intentionally denser than a carousel cover. It must be SELF-CONTAINED. CRITICAL — LOOP CLOSURE: if the headline poses a question, a paradox or a promise (e.g. "an asset can be X"), the body MUST resolve it, not just hand the reader the tools to figure it out themselves. A slide whose title raises a tension that its body never pays off is a FAIL — flag it (category "content") with a concrete fix (e.g. add the missing example/answer that closes the loop). Do NOT flag it as "too dense for a cover": for a single post density is expected.
- inform: exactly one clear idea, density appropriate to the recipe.
- payoff: a concise recap (bullets), echoes the cover, introduces no new topic.
- cta: one clear call-to-action / invite, closing tone.
- SWIPE ARROW RULE: the bottom-right circular swipe arrow (→) is a "scroll to next" affordance. On the LAST / CTA slide there is no next slide, so it MUST NOT appear — if you see it on the last/CTA slide, flag it (category "layout"). On non-last slides the arrow is expected; do NOT flag its presence there.
Flag real mismatches only (use category "content" for wrong-content-for-type, "layout" for the arrow).

## OUTPUT
{ "approved": boolean, "issues": [...], "rendererFeedback": "consolidated actionable instructions for the renderer if not approved, null if approved" }
Report every defect you find — visual integrity issues first. Each issue needs a precise description
(which element, where) and a concrete fix. In rendererFeedback, lead with the collision/alignment
fixes since those ruin the slide. Approve ONLY when the slide is truly publication-grade; if even one
real defect remains, set approved=false. Do not invent issues to be safe, but never wave through a
slide you would not proudly publish.`;

export async function reviewRenderedSlide(args: {
  client: OpenAI;
  model: string;
  reasoningEffort?: ReasoningEffort;
  pngPath: string;
  /** The renderer's OWN output (not the shell-wrapped document) — so shell-injected :root/fonts/arrow are never mistaken for slide violations. */
  bodyHtml: string;
  css: string;
  designSpec: SlideDesignSpec;
  meter?: UsageMeter;
  slideContext?: {
    role: SlideRole;
    narrativeFunction?: string;
    index?: number;
    total?: number;
    isLast?: boolean;
  };
}): Promise<QualityReview> {
  const jsonSchema = zodToJsonSchema(QualityReviewSchema, { name: 'QualityReview', nameStrategy: 'title' });
  const request: Record<string, unknown> = {
    model: args.model,
    messages: [
      { role: 'system', content: QUALITY_REVIEWER_PROMPT },
      { role: 'user', content: await buildReviewContent(args.pngPath, args.bodyHtml, args.css, args.designSpec, args.slideContext) },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'QualityReview', strict: true, schema: jsonSchema },
    },
  };
  if (args.reasoningEffort) request.reasoning_effort = args.reasoningEffort;

  const resp = await args.client.chat.completions.create(
    request as unknown as Parameters<typeof args.client.chat.completions.create>[0],
  ) as OpenAI.Chat.Completions.ChatCompletion;

  args.meter?.record('quality.review', resp.usage);

  const content = resp.choices[0]?.message?.content;
  if (!content) throw new Error('llm_empty_response');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('llm_invalid_json');
  }

  const result = QualityReviewSchema.safeParse(parsed);
  if (!result.success) throw new Error(`llm_schema_mismatch: ${result.error.message}`);
  return result.data;
}

async function buildReviewContent(
  pngPath: string,
  bodyHtml: string,
  css: string,
  designSpec: SlideDesignSpec,
  slideContext?: {
    role: SlideRole;
    narrativeFunction?: string;
    index?: number;
    total?: number;
    isLast?: boolean;
  },
): Promise<OpenAI.Chat.ChatCompletionContentPart[]> {
  let imagePart: OpenAI.Chat.ChatCompletionContentPart;
  try {
    const pngBuffer = await fs.readFile(pngPath);
    const base64 = pngBuffer.toString('base64');
    imagePart = {
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${base64}`, detail: 'high' },
    };
  } catch {
    // PNG unavailable — fall back to source-only review
    imagePart = { type: 'text', text: '[rendered image not available — perform source-only review]' };
  }

  let contextPrefix = '';
  if (slideContext) {
    const position =
      slideContext.index != null && slideContext.total != null
        ? String(slideContext.index + 1) + '/' + String(slideContext.total)
        : 'standalone';
    contextPrefix =
      'Slide context: role=' +
      slideContext.role +
      ', narrativeFunction=' +
      (slideContext.narrativeFunction ?? 'n/a') +
      ', position=' +
      position +
      ', isLast=' +
      String(slideContext.isLast ?? 'n/a') +
      '.\n\n';
  }

  return [
    imagePart,
    {
      type: 'text',
      text: `${contextPrefix}Design specification that was implemented:\n${JSON.stringify(designSpec, null, 2)}\n\n---\nThe renderer's OWN HTML/CSS (the shell wraps this with the white canvas, Montserrat fonts, the brand color :root variables and the swipe arrow — none of which appear below and none of which are the slide's responsibility):\n\n<bodyHtml>\n${bodyHtml}\n</bodyHtml>\n\n<css>\n${css}\n</css>`,
    },
  ];
}
