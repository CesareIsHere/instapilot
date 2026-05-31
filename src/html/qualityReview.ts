import { z } from 'zod';
import type OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { promises as fs } from 'node:fs';
import type { ReasoningEffort } from '@/llm/client';
import type { UsageMeter } from '@/llm/usage';
import type { SlideDesignSpec } from './designSpec';

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

const QUALITY_REVIEWER_PROMPT = `You are a brand quality reviewer for Finvestire Instagram slides.
You receive the rendered slide image and the HTML/CSS source. Analyze both carefully.

## VISUAL REVIEW (from image)
- Background must be pure white — no colored backgrounds, gradients, or textures
- Logo (navy circle with F+arrow) must be visible at top center
- No text or content appears clipped at canvas edges
- Layout fills the canvas — no large empty areas (>100px of unintentional whitespace)
- Clear visual hierarchy with one dominant focal point

## BRAND COLOR REVIEW (image + source)
- Titles should be navy — not black, not gray
- Green (#00B373) only for positive/growth words — never decorative
- Red (#DC2626) only for negative/risk words — never decorative
- No hardcoded hex values in CSS (e.g. #012A78) — must use CSS custom properties (var(--brand-navy), etc.)

## TYPOGRAPHY REVIEW (source)
- No font-size below 22px for any text
- No font-size below 30px inside cards
- font-family must include Montserrat

## CSS STRUCTURE REVIEW (source)
- Root element must have: width:1080px; height:1350px; overflow:hidden
- No box-shadow used
- No background gradients
- Cards: border: 2px solid var(--brand-navy), border-radius: 12px+
- No CTA arrow manually added in bodyHtml (it is injected by the shell)
- No <script> tags, no @font-face, no @import, no :root in CSS

## OUTPUT
{ "approved": boolean, "issues": [...], "rendererFeedback": "consolidated actionable instructions for the renderer if not approved, null if approved" }
Only flag real violations — not stylistic preferences. Approve when everything is correct.`;

export async function reviewRenderedSlide(args: {
  client: OpenAI;
  model: string;
  reasoningEffort?: ReasoningEffort;
  pngPath: string;
  html: string;
  designSpec: SlideDesignSpec;
  meter?: UsageMeter;
}): Promise<QualityReview> {
  const jsonSchema = zodToJsonSchema(QualityReviewSchema, { name: 'QualityReview', nameStrategy: 'title' });
  const request: Record<string, unknown> = {
    model: args.model,
    messages: [
      { role: 'system', content: QUALITY_REVIEWER_PROMPT },
      { role: 'user', content: await buildReviewContent(args.pngPath, args.html, args.designSpec) },
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
  html: string,
  designSpec: SlideDesignSpec,
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

  return [
    imagePart,
    {
      type: 'text',
      text: `Design specification that was implemented:\n${JSON.stringify(designSpec, null, 2)}\n\n---\nHTML/CSS source:\n${html}`,
    },
  ];
}
