import { z } from 'zod';
import type OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { promises as fs } from 'node:fs';
import type { ReasoningEffort } from '@/llm/client';
import type { UsageMeter } from '@/llm/usage';
import type { SlideDesignSpec } from '@/html/designSpec';
import { log } from '@/lib/log';
import { GENERIC_BRAND_NAME } from '@/html/brandVars';
import { DEFAULT_CONTENT_LANGUAGE } from '@/server/brand';

export const SlideFixSchema = z.object({
  slideIndex: z.number().int().min(0),
  issue: z.string().min(1),
  fix: z.string().min(1),
});

export const ContentReviewSchema = z.object({
  approved: z.boolean(),
  generalNotes: z.string().nullable(),
  slideFixes: z.array(SlideFixSchema),
});

export type SlideFix = z.infer<typeof SlideFixSchema>;
export type ContentReview = z.infer<typeof ContentReviewSchema>;

/** Per-slide summary the reviewer evaluates, plus the rendered PNG path so the
 * review can SEE every slide and judge the carousel as a whole. */
export interface ReviewableSlide {
  index: number;
  role: string;
  brief: string;
  intent: string;
  designSpec: SlideDesignSpec;
  /** Path to the rendered PNG; attached as an image so the reviewer sees the actual slide. */
  file: string;
}

function buildReviewerPrompt(brandName: string, language: string): string {
  return `You are the editor-in-chief AND final art director of ${brandName}. You perform the final review of an already rendered Instagram piece (single post or carousel). The reader-facing copy is in ${language}. You receive the IMAGE of EVERY slide plus its metadata: you judge both the copy and the visual result, and above all the WHOLE.

This content will be published to a global audience: the bar is extremely high. By default do NOT approve; approve only if it is truly ready to show the world. When in doubt, do not approve.

## EDITORIAL REVIEW (copy + the whole)
1. Faithfulness to the requested topic and instructions.
2. Narrative flow: a cover that hooks → progressive development → a cta that closes. No logical jumps.
2-bis. LOOP CLOSURE (also applies to a SINGLE POST of just 1 slide): if the headline poses a question, a paradox or a promise, the content MUST resolve it explicitly, not just give readers the tools to work it out themselves. On a self-contained post the tension opened by the title must be closed WITHIN the same slide (e.g. with a micro-example or the direct answer). A title whose promise is left unfulfilled = content NOT ready: flag it with a concrete fix.
3. Quality and level: accurate, clear, not trivial.
4. Consistency: no pointless repetition, contradictions or jumps.
5. Completeness: the key points are covered.
6. Faithfulness to the research: the data is consistent with the dossier.
7. Editorial strength: does the cover hook? Does the CTA close with a clear, single invitation (only on the last slide)?
8. Foreshadowing and loops: cover↔slide 2 consistent; open tensions get closed; there is a payoff before the CTA.

## PER-SLIDE EDITORIAL QUALITY (copy + image)
9. GOAL ACHIEVED: every slide must have a clear goal in the arc (hook / explain a point / give the proof / close a loop / invite) and achieve it. If you cannot tell what a slide is for, flag it.
10. RIGHT DENSITY: neither empty/too-thin slides (a title without a real explanation) nor walls of text. Every body slide must teach something complete (mini-headline + explanation + optional proof). Flag slides that are "short on content".
11. NO REPETITION: no slide re-explains an already covered concept in different words. Every slide adds NEW information.
12. DATA WITH MEANING: every number must say WHAT IT IS (label) and WHAT IT TELLS YOU (takeaway). Flag bare numbers, numbers whose meaning is unclear, and piles of figures.
13. REGISTER AND JARGON: conversational language, informal second person; every technical term explained or replaced (audience starting from zero). Flag unexplained jargon.
14. EYEBROWS/LABELS: the small labels above the title must be real topical labels. Flag generic, disconnected meta-labels such as "CONTEXT", "SLIDE TOPIC", "SUBJECT", "INTRODUCTION" (or their equivalents in ${language}) — they must be made topical or removed.

## OVERALL VISUAL REVIEW (looking at the images of ALL slides) — TOP PRIORITY
15. SERIES CONSISTENCY: type scale, spacing, margins, box style and use of color CONSISTENT across all slides. Flag any slide that deviates.
16. RHYTHM AND VARIETY: the middle slides are not all identical or monotonous, but belong to the same visual family.
17. COVER↔CTA ECHO: the final slide visually echoes the cover.
18. HIERARCHY AND HIGHLIGHTS: a single focal point per slide; WORD highlights used well — POSITIVE ACCENT only for positive ideas, NEGATIVE ACCENT only for negative ones, never a randomly highlighted word or the wrong color. (In rich layouts — grids, diagrams, charts — colored borders/surfaces and one emoji per node are fine if used semantically and consistently: the canvas stays on the paper color. Flag only random or excessive color/emoji.)
19. SYMMETRY: in comparisons/columns/charts the parts must be symmetric (same number of items, comparable alignments and lengths). Flag asymmetries.
20. PER-SLIDE VISUAL DEFECTS: collisions/overlaps, text on top of other text, numbers/labels outside their box, misalignments, clipped text, values that wrap badly (e.g. "%" on its own line), accidental empty space. Even a single defect like these = carousel not ready.

For EVERY slide with a problem (editorial or visual) provide:
- slideIndex (0-based)
- issue: what is wrong (be precise: which element, where)
- fix: a concrete, actionable instruction to correct it (for visual defects, state clearly the layout adjustment needed). Any replacement copy you propose must be in ${language}.

JSON output (ContentReview): { approved, generalNotes, slideFixes }
Approve (empty slideFixes) ONLY if every slide is editorially solid AND visually flawless AND the whole is consistent. Do not invent problems, but do not let through anything you would not proudly publish.`;
}

export async function reviewContent(args: {
  client: OpenAI;
  model: string;
  reasoningEffort?: ReasoningEffort;
  topic: string;
  instructions?: string;
  title: string;
  angle: string;
  slides: ReviewableSlide[];
  meter?: UsageMeter;
  brandName?: string;
  language?: string;
}): Promise<ContentReview> {
  const { client, model, reasoningEffort } = args;
  const jsonSchema = zodToJsonSchema(ContentReviewSchema, { name: 'ContentReview', nameStrategy: 'title' });

  const userContent = await buildReviewContent(args);

  const request: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: buildReviewerPrompt(args.brandName ?? GENERIC_BRAND_NAME, args.language ?? DEFAULT_CONTENT_LANGUAGE) },
      { role: 'user', content: userContent },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'ContentReview', strict: true, schema: jsonSchema },
    },
  };
  if (reasoningEffort) request.reasoning_effort = reasoningEffort;

  const resp = (await client.chat.completions.create(
    request as unknown as Parameters<typeof client.chat.completions.create>[0],
  )) as OpenAI.Chat.Completions.ChatCompletion;

  args.meter?.record('content.review', resp.usage);

  const content = resp.choices[0]?.message?.content;
  if (!content) throw new Error('llm_empty_response');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('llm_invalid_json');
  }

  const result = ContentReviewSchema.safeParse(parsed);
  if (!result.success) throw new Error(`llm_schema_mismatch: ${result.error.message}`);
  return result.data;
}

/** Assemble the multimodal user content: a header, then per slide its image + metadata. */
async function buildReviewContent(args: {
  topic: string;
  instructions?: string;
  title: string;
  angle: string;
  slides: ReviewableSlide[];
}): Promise<OpenAI.Chat.ChatCompletionContentPart[]> {
  const parts: OpenAI.Chat.ChatCompletionContentPart[] = [
    {
      type: 'text',
      text: `REQUESTED TOPIC: ${args.topic}
${args.instructions ? `INSTRUCTIONS: ${args.instructions}\n` : ''}CONTENT TITLE: ${args.title}
ANGLE: ${args.angle}
NUMBER OF SLIDES: ${args.slides.length}

Below is every slide: first its metadata, then its rendered image.`,
    },
  ];

  for (const s of args.slides) {
    parts.push({
      type: 'text',
      text: `\n### Slide ${s.index} (${s.role})\nBrief: ${s.brief}\nIntent: ${s.intent}\nHeadline: ${s.designSpec.headline.text}\nContent: ${s.designSpec.bodyElements.map((b) => b.text).join(' | ')}`,
    });
    const image = await loadImagePart(s.file);
    parts.push(image ?? { type: 'text', text: '[image not available for this slide — evaluate from the text]' });
  }

  return parts;
}

async function loadImagePart(file: string): Promise<OpenAI.Chat.ChatCompletionContentPart | null> {
  try {
    const buffer = await fs.readFile(file);
    return {
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${buffer.toString('base64')}`, detail: 'high' },
    };
  } catch (err) {
    log.warn('content.review.image_unavailable', { file, reason: (err as Error).message });
    return null;
  }
}
