import { z } from 'zod';
import type OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ReasoningEffort } from '@/llm/client';
import type { UsageMeter } from '@/llm/usage';
import { GENERIC_BRAND_NAME } from '@/html/brandVars';
import { DEFAULT_CONTENT_LANGUAGE } from '@/server/brand';

export const ContentFormatSchema = z.enum(['single', 'carousel']);
export type ContentFormat = z.infer<typeof ContentFormatSchema>;

export const PlannedSlideSchema = z.object({
  role: z.enum(['cover', 'body', 'cta']),
  narrativeFunction: z.string().min(1),
  brief: z.string().min(1),
});

export const ContentPlanSchema = z.object({
  title: z.string().min(1),
  framework: z.string().min(1),
  angle: z.string().min(1),
  slides: z.array(PlannedSlideSchema).min(1),
});

export type PlannedSlide = z.infer<typeof PlannedSlideSchema>;
export type ContentPlan = z.infer<typeof ContentPlanSchema>;

function buildPlannerSystemPrompt(format: ContentFormat, slideCount: number | undefined, brandName: string, language: string): string {
  const formatRules =
    format === 'single'
      ? `The format is a SINGLE POST: produce exactly 1 slide (role "cover"). The whole message must fit in a single image. Set framework="single".`
      : `The format is a CAROUSEL of ${slideCount} slides. Narrative structure:
- Slide 1: COVER (role "cover") — a strong hook that grabs attention and introduces the topic.
- Middle slides: BODY (role "body") — one idea per slide, developed clearly and progressively. A logical, flowing sequence.
- Last slide: CTA (role "cta") — summary of the key message + invitation to follow/save.
Produce exactly ${slideCount} slides in total.`;

  const narrativeBlock =
    format === 'single'
      ? `# SINGLE POST — SELF-CONTAINED
There is no next slide: this one slide must stand on its own. In a single image, hierarchical and skimmable, it must contain:
- HOOK: a strong opening (problem + promise, a surprising figure or a question) — the first thing people read.
- INSIGHT: the genuinely useful key message (the "why" or the "how"), not just the title.
- PROOF (if it strengthens the message): at most ONE concrete data point with a label and a meaning (number + year/source from the dossier).
- Soft MICRO-CTA: a light, non-intrusive close ("Save it so you don't forget", "Follow for more ideas").
HIGHER density than a carousel cover (which stays sparse because the rest develops it): here there is no rest. But it is still ONE central idea, a single focal point, concise copy within 1080×1350.
Set narrativeFunction="all-in-one". The carousel rules on foreshadowing / payoff / mini-loops do NOT apply.`
      : `# METHOD AND NARRATIVE STRUCTURES (for carousels)
Pick the structure that best fits the content and declare it in the "framework" field:
- SWIPE (Hook → Why → Inform×3 → Payoff → CTA): mechanisms, principles, how-it-works, complex concepts. This is the default.
- 3-ACT (Setup → Conflict → Solution → Application): real/plausible stories, mistakes, mindset, before→after.
- SRL (Shock → Reveal → Lesson): debunking myths, counter-intuitive truths, biases.
- 3ACT-2.0 (Problem → Analysis → Solution → Application): concrete user problems, habits, everyday decisions.
- 3ACT-3.0 (Question → Journey → Answer): a real question from the audience, A-vs-B choices, clarifications.
- A-vs-B: comparison between two concepts people often confuse.
- case-study: start from a real case to explain a general concept.
- list: "X things to…", one item per slide.
- step-by-step / roadmap: one step per slide, from A to B.
- framework→breakdown→application: show a framework through a real example.

# NARRATIVE RULES (apply to any structure)
- COVER = very strong hook + clear promise, minimal text.
- FORESHADOWING: the cover and slide 2 must be consistent (slide 2 explains why it matters / opens the main loop).
- MINI-LOOPS: open a question and close it within 1-2 slides.
- PAYOFF: a 3-4 bullet recap on the SECOND-TO-LAST slide, before the CTA; it closes every loop and echoes the cover.
- CTA: only one, clear, ONLY on the last slide.
- One idea per slide; concise copy (it must fit in 1080×1350 without overflow).

# NARRATIVE FUNCTION
Give each slide a "narrativeFunction" consistent with the chosen structure (e.g. "hook", "why", "inform", "payoff", "cta", "setup", "conflict", "solution", "loop-open", "loop-close").`;

  return `You are a senior social media manager specialised in educational Instagram posts and carousels for ${brandName}. Adapt sector, examples and angle to the BRAND CONTEXT provided.

LANGUAGE: every piece of reader-facing copy you write (title, headlines, briefs' proposed text, CTAs) must be in ${language}.

${formatRules}

${narrativeBlock}

For each slide write a SELF-CONTAINED, detailed "brief" that a design agent will use to generate the slide. Each brief MUST contain:
- Proposed HEADLINE / MINI-HEADLINE (exact text, in ${language}), 4-9 words, saying what the slide is about and why it matters. State which 1-2 words to highlight with the positive accent (ONLY positive/growth) or the negative accent (ONLY risk/loss). At most 1-2 highlighted words; never highlight for decoration.
- EXPLANATION: 1-2 sentences that REALLY develop the idea (the "why" or the "how"), not a title left on its own. The slide must teach something complete.
- DATA (if any): every number must have a LABEL (what it is) and a MEANING (what it tells you). Never a bare number. At most ONE key data point per slide (number + year/source from the dossier). Do not pile up figures.
- LAYOUT HINT: the best-fitting recipe — cover, numbered-list, compare-2col, kpi-hero, card-grid-2x2, card-grid (3-6 concepts), concept-breakdown (explains "what is X": definition + formula + glossary), flow-diagram (step-by-step process with arrows, useful for "how X works"), breakdown-chart (proportional bars / breaking a total down into its parts), quote, cta. For comparisons/columns/grids the items must be SYMMETRIC (same number of items, sentences of similar length, parallel structure).
- SLIDE GOAL: in one sentence, what this slide must achieve in the arc (hook / explain point X / give the proof / close loop Y / invite).
The brief must not refer to the other slides: it has to stand on its own.

# EDITORIAL QUALITY (binding rules)
- ONE idea per slide, but DEVELOPED: neither a wall of text nor an empty slide. If you cannot state the slide's goal, remove or rewrite it.
- AMOUNT: headline ≤ ~12 words; explanation 1-2 sentences (≈ max 300 characters of body per slide). If a paragraph is needed, it belongs in the caption, not on the slide.
- NO REPETITION: each slide adds NEW information. Do not re-explain an already covered concept in different words.
- REGISTER: conversational, addressing the reader directly and informally in the second person (e.g. "tu" in Italian, "you" in English), like a friend. Every technical or jargon term must be explained or replaced: the audience starts from zero. Make the complex simple without dumbing it down.
- COVER: must answer in ≤ ~10 words "is this for me?" and "what do I get if I swipe?" (problem + promise, a surprising figure, or a question).
- CTA: only one, concrete (e.g. "Save for later", "Comment X", "Follow for…"), ONLY on the last slide.
- Use the dossier's data only when it strengthens the message; no claims unsupported by the research.

JSON output (ContentPlan):
- title: editorial title of the whole piece (in ${language})
- framework: the chosen narrative structure (e.g. "SWIPE")
- angle: the chosen angle in 1-2 sentences
- slides: array of { role, narrativeFunction, brief } in publishing order`;
}

export async function planContent(args: {
  client: OpenAI;
  model: string;
  reasoningEffort?: ReasoningEffort;
  format: ContentFormat;
  slideCount?: number;
  topic: string;
  instructions?: string;
  research: string;
  meter?: UsageMeter;
  feedback?: string;
  brandName?: string;
  language?: string;
}): Promise<ContentPlan> {
  const { client, model, reasoningEffort, format, slideCount, topic, instructions, research } = args;
  const jsonSchema = zodToJsonSchema(ContentPlanSchema, { name: 'ContentPlan', nameStrategy: 'title' });

  const userContent = `TOPIC: ${topic}
${instructions ? `INSTRUCTIONS: ${instructions}\n` : ''}
RESEARCH DOSSIER:
${research}${args.feedback ? `\n\n--- REVIEW OF THE PREVIOUS PLAN TO ADDRESS ---\n${args.feedback}` : ''}`;

  const request: Record<string, unknown> = {
    model,
    messages: [
      {
        role: 'system',
        content: buildPlannerSystemPrompt(format, slideCount, args.brandName ?? GENERIC_BRAND_NAME, args.language ?? DEFAULT_CONTENT_LANGUAGE),
      },
      { role: 'user', content: userContent },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'ContentPlan', strict: true, schema: jsonSchema },
    },
  };
  if (reasoningEffort) request.reasoning_effort = reasoningEffort;

  const resp = (await client.chat.completions.create(
    request as unknown as Parameters<typeof client.chat.completions.create>[0],
  )) as OpenAI.Chat.Completions.ChatCompletion;

  args.meter?.record('content.plan', resp.usage);

  const content = resp.choices[0]?.message?.content;
  if (!content) throw new Error('llm_empty_response');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('llm_invalid_json');
  }

  const result = ContentPlanSchema.safeParse(parsed);
  if (!result.success) throw new Error(`llm_schema_mismatch: ${result.error.message}`);
  return result.data;
}
