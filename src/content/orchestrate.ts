import type OpenAI from 'openai';
import type { ReasoningEffort } from '@/llm/client';
import { shortId } from '@/lib/render';
import { runSlidePipeline, type PipelineSuccess } from '@/html/pipeline';
import type { SlideRole } from '@/html/htmlSystemPrompt';
import { researchTopic } from './research';
import { planContent, type ContentFormat, type ContentPlan } from './plan';
import { reviewContent, type ReviewableSlide } from './review';
import { log } from '@/lib/log';

const MAX_REVIEW_ROUNDS = Number(process.env.CONTENT_MAX_REVIEW_ROUNDS ?? 2);

export interface GenerateContentArgs {
  client: OpenAI;
  model: string;
  reasoningEffort?: ReasoningEffort;
  brandContext: string;
  topic: string;
  instructions?: string;
  format: ContentFormat;
  slideCount?: number;
}

export interface ContentSlideResult {
  index: number;
  role: SlideRole;
  brief: string;
  file: string;
  intent: string;
  designSpec: PipelineSuccess['designSpec'];
  attempts: PipelineSuccess['attempts'];
  warnings: PipelineSuccess['warnings'];
}

export interface GenerateContentSuccess {
  ok: true;
  topic: string;
  format: ContentFormat;
  title: string;
  angle: string;
  research: string;
  slides: ContentSlideResult[];
  reviewRounds: number;
  durationMs: number;
}

export interface GenerateContentFailure {
  ok: false;
  code: 'LLM_FAILURE' | 'SLIDE_GENERATION_FAILED';
  detail: unknown;
}

export type GenerateContentResult = GenerateContentSuccess | GenerateContentFailure;

interface SlideState {
  role: SlideRole;
  baseBrief: string;
  fixes: string[];
  result: PipelineSuccess;
}

export async function generateContent(args: GenerateContentArgs): Promise<GenerateContentResult> {
  const { client, model, reasoningEffort, brandContext, topic, instructions, format, slideCount } = args;
  const start = Date.now();

  // ── Agent 1: research ────────────────────────────────────────────────────
  let research: string;
  try {
    research = await researchTopic({ client, model, reasoningEffort, topic, instructions });
  } catch (err) {
    return { ok: false, code: 'LLM_FAILURE', detail: `research: ${(err as Error).message}` };
  }

  // ── Agent 2: content plan ────────────────────────────────────────────────
  let plan: ContentPlan;
  try {
    plan = await planContent({ client, model, reasoningEffort, format, slideCount, topic, instructions, research });
  } catch (err) {
    return { ok: false, code: 'LLM_FAILURE', detail: `plan: ${(err as Error).message}` };
  }
  log.info('content.plan.done', { title: plan.title, slides: plan.slides.length });

  // ── Per-slide generation (existing 4-agent pipeline) ──────────────────────
  const states: SlideState[] = [];
  for (let i = 0; i < plan.slides.length; i++) {
    const planned = plan.slides[i];
    const result = await generateOneSlide(args, planned.role, planned.brief, []);
    if (!result.ok) {
      return { ok: false, code: 'SLIDE_GENERATION_FAILED', detail: { slideIndex: i, ...(result as object) } };
    }
    states.push({ role: planned.role, baseBrief: planned.brief, fixes: [], result });
    log.info('content.slide.done', { index: i, role: planned.role });
  }

  // ── Final review loop (editorial) ─────────────────────────────────────────
  let reviewRounds = 0;
  for (let round = 1; round <= MAX_REVIEW_ROUNDS; round++) {
    reviewRounds = round;

    const reviewable: ReviewableSlide[] = states.map((s, idx) => ({
      index: idx,
      role: s.role,
      brief: composeBrief(s),
      intent: s.result.intent,
      designSpec: s.result.designSpec,
    }));

    let review;
    try {
      review = await reviewContent({
        client, model, reasoningEffort,
        topic, instructions, title: plan.title, angle: plan.angle, slides: reviewable,
      });
    } catch (err) {
      // Editorial review failure is non-fatal: ship what we have.
      log.warn('content.review.error', { reason: (err as Error).message, round });
      break;
    }
    log.info('content.review.done', { approved: review.approved, fixes: review.slideFixes.length, round });

    if (review.approved || review.slideFixes.length === 0) break;
    if (round === MAX_REVIEW_ROUNDS) break; // exhausted — ship best effort

    // Apply fixes only to the flagged slides and regenerate them.
    for (const fix of review.slideFixes) {
      const state = states[fix.slideIndex];
      if (!state) continue;
      state.fixes.push(fix.fix);
      const regenerated = await generateOneSlide(args, state.role, state.baseBrief, state.fixes);
      if (!regenerated.ok) {
        return { ok: false, code: 'SLIDE_GENERATION_FAILED', detail: { slideIndex: fix.slideIndex, ...(regenerated as object) } };
      }
      state.result = regenerated;
      log.info('content.slide.refixed', { index: fix.slideIndex, round });
    }
  }

  return {
    ok: true,
    topic,
    format,
    title: plan.title,
    angle: plan.angle,
    research,
    slides: states.map((s, idx) => ({
      index: idx,
      role: s.role,
      brief: composeBrief(s),
      file: s.result.file,
      intent: s.result.intent,
      designSpec: s.result.designSpec,
      attempts: s.result.attempts,
      warnings: s.result.warnings,
    })),
    reviewRounds,
    durationMs: Date.now() - start,
  };
}

function composeBrief(state: SlideState): string {
  if (state.fixes.length === 0) return state.baseBrief;
  return `${state.baseBrief}\n\nCORREZIONI EDITORIALI DA APPLICARE:\n${state.fixes.map((f) => `- ${f}`).join('\n')}`;
}

async function generateOneSlide(
  args: GenerateContentArgs,
  role: SlideRole,
  baseBrief: string,
  fixes: string[],
) {
  const brief = fixes.length === 0
    ? baseBrief
    : `${baseBrief}\n\nCORREZIONI EDITORIALI DA APPLICARE:\n${fixes.map((f) => `- ${f}`).join('\n')}`;

  return runSlidePipeline({
    client: args.client,
    model: args.model,
    reasoningEffort: args.reasoningEffort,
    brandContext: args.brandContext,
    userPrompt: brief,
    role,
    outputId: shortId(),
  });
}
