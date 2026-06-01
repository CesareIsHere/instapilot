import path from 'node:path';
import fs from 'node:fs';
import type OpenAI from 'openai';
import type { ReasoningEffort, AgentModels } from '@/llm/client';
import { shortId } from '@/lib/render';
import { runSlidePipeline, type PipelineSuccess, type PipelineWarning } from '@/html/pipeline';
import type { SlideRole } from '@/html/htmlSystemPrompt';
import { UsageMeter, type UsageTotals } from '@/llm/usage';
import { researchTopic } from './research';
import { reviewResearch } from './researchReview';
import { planContent, type ContentFormat, type ContentPlan } from './plan';
import { reviewPlan } from './planReview';
import { reviewContent, type ReviewableSlide } from './review';
import { log } from '@/lib/log';

const MAX_REVIEW_ROUNDS = Number(process.env.CONTENT_MAX_REVIEW_ROUNDS ?? 2);
const MAX_RESEARCH_ROUNDS = Number(process.env.CONTENT_MAX_RESEARCH_ROUNDS ?? 2);
const MAX_PLAN_ROUNDS = Number(process.env.CONTENT_MAX_PLAN_ROUNDS ?? 2);
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? path.resolve(process.cwd(), 'output');

export interface GenerateContentArgs {
  client: OpenAI;
  model: string;
  reasoningEffort?: ReasoningEffort;
  brandContext: string;
  topic: string;
  instructions?: string;
  format: ContentFormat;
  slideCount?: number;
  /** Per-agent model overrides. Each key falls back to `model` if not set. */
  models?: Partial<AgentModels>;
}

export interface ContentSlideResult {
  index: number;
  role: SlideRole;
  brief: string;
  file: string;
  intent: string;
  designSpec: PipelineSuccess['designSpec'];
  attempts: PipelineSuccess['attempts'];
  warnings: PipelineWarning[];
  usage: UsageTotals;
}

export interface GenerateContentSuccess {
  ok: true;
  carouselId?: string;
  carouselDir?: string;
  topic: string;
  format: ContentFormat;
  framework: string;
  title: string;
  angle: string;
  research: string;
  slides: ContentSlideResult[];
  reviewRounds: number;
  contentWarnings: { research: string[]; plan: string[] };
  usage: UsageTotals;
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
  const pick = (agent: keyof AgentModels) => args.models?.[agent] ?? model;
  const start = Date.now();
  const meter = new UsageMeter();
  const contentWarnings = { research: [] as string[], plan: [] as string[] };

  // ── Phase A: Research + review loop (best effort) ─────────────────────────
  let research: string;
  try {
    research = await researchTopic({ client, model: pick('research'), reasoningEffort, topic, instructions, meter });
    for (let round = 1; round <= MAX_RESEARCH_ROUNDS; round++) {
      const review = await reviewResearch({ client, model: pick('researchReview'), reasoningEffort, topic, instructions, research, meter });
      log.info('content.research.reviewed', { approved: review.approved, issues: review.issues.length, round });
      if (review.approved || review.issues.length === 0) break;
      if (round === MAX_RESEARCH_ROUNDS) { contentWarnings.research = review.issues; break; }
      research = await researchTopic({ client, model: pick('research'), reasoningEffort, topic, instructions, feedback: review.issues.join('; '), meter });
    }
  } catch (err) {
    return { ok: false, code: 'LLM_FAILURE', detail: `research: ${(err as Error).message}` };
  }

  // ── Phase B: Plan + review loop (best effort) ─────────────────────────────
  let plan: ContentPlan;
  try {
    plan = await planContent({ client, model: pick('plan'), reasoningEffort, format, slideCount, topic, instructions, research, meter });
    for (let round = 1; round <= MAX_PLAN_ROUNDS; round++) {
      const review = await reviewPlan({ client, model: pick('planReview'), reasoningEffort, topic, instructions, format, slideCount, research, plan, meter });
      log.info('content.plan.reviewed', { approved: review.approved, issues: review.issues.length, round });
      if (review.approved || review.issues.length === 0) break;
      if (round === MAX_PLAN_ROUNDS) { contentWarnings.plan = review.issues; break; }
      const feedback = review.planFeedback ?? review.issues.join('; ');
      plan = await planContent({ client, model: pick('plan'), reasoningEffort, format, slideCount, topic, instructions, research, feedback, meter });
    }
  } catch (err) {
    return { ok: false, code: 'LLM_FAILURE', detail: `plan: ${(err as Error).message}` };
  }
  log.info('content.plan.done', { title: plan.title, slides: plan.slides.length });

  // ── Carousel output folder (single posts stay flat) ───────────────────────
  const isCarousel = format === 'carousel';
  const carouselId = isCarousel ? shortId() : undefined;
  const carouselDir = carouselId ? path.join(OUTPUT_DIR, `carousel-${carouselId}`) : undefined;

  function slideOutput(index: number): { dir?: string; fileName?: string } {
    if (!carouselDir) return {};
    return { dir: carouselDir, fileName: `slide-${String(index + 1).padStart(2, '0')}.png` };
  }

  const total = plan.slides.length;
  function slideCtx(index: number, narrativeFunction?: string) {
    return {
      narrativeFunction,
      index,
      total,
      // Arrow only in a carousel, and never on the last slide.
      showCtaArrow: isCarousel && index < total - 1,
    };
  }

  // ── Phase C: Per-slide generation (4-agent pipeline) ──────────────────────
  const states: SlideState[] = [];
  for (let i = 0; i < plan.slides.length; i++) {
    const planned = plan.slides[i];
    const result = await generateOneSlide(args, planned.role, planned.brief, [], slideOutput(i), slideCtx(i, planned.narrativeFunction));
    if (!result.ok) {
      return {
        ok: false,
        code: result.code === 'LLM_FAILURE' ? 'LLM_FAILURE' : 'SLIDE_GENERATION_FAILED',
        detail: { slideIndex: i, ...(result as object) },
      };
    }
    states.push({ role: planned.role, baseBrief: planned.brief, fixes: [], result });
    log.info('content.slide.done', { index: i, role: planned.role });
  }

  // ── Phase D: Final editorial review loop (existing) ───────────────────────
  let reviewRounds = 0;
  for (let round = 1; round <= MAX_REVIEW_ROUNDS; round++) {
    reviewRounds = round;
    const reviewable: ReviewableSlide[] = states.map((s, idx) => ({
      index: idx, role: s.role, brief: composeBrief(s), intent: s.result.intent, designSpec: s.result.designSpec,
    }));

    let review;
    try {
      review = await reviewContent({ client, model: pick('editorialReview'), reasoningEffort, topic, instructions, title: plan.title, angle: plan.angle, slides: reviewable, meter });
    } catch (err) {
      log.warn('content.review.error', { reason: (err as Error).message, round });
      break;
    }
    log.info('content.review.done', { approved: review.approved, fixes: review.slideFixes.length, round });

    if (review.approved || review.slideFixes.length === 0) break;
    if (round === MAX_REVIEW_ROUNDS) break;

    for (const fix of review.slideFixes) {
      const state = states[fix.slideIndex];
      if (!state) continue;
      state.fixes.push(fix.fix);
      const regenerated = await generateOneSlide(args, state.role, state.baseBrief, state.fixes, slideOutput(fix.slideIndex), slideCtx(fix.slideIndex, plan.slides[fix.slideIndex]?.narrativeFunction));
      if (!regenerated.ok) {
        return {
          ok: false,
          code: regenerated.code === 'LLM_FAILURE' ? 'LLM_FAILURE' : 'SLIDE_GENERATION_FAILED',
          detail: { slideIndex: fix.slideIndex, ...(regenerated as object) },
        };
      }
      state.result = regenerated;
      log.info('content.slide.refixed', { index: fix.slideIndex, round });
    }
  }

  // ── Roll per-slide usage into the carousel/post total ─────────────────────
  states.forEach((s, idx) => meter.recordTotals(`slide-${idx + 1}`, s.result.usage));
  const usage = meter.totals;
  log.info('content.usage', { breakdown: meter.breakdown, total: usage });

  const slides: ContentSlideResult[] = states.map((s, idx) => ({
    index: idx,
    role: s.role,
    brief: composeBrief(s),
    file: s.result.file,
    intent: s.result.intent,
    designSpec: s.result.designSpec,
    attempts: s.result.attempts,
    warnings: s.result.warnings,
    usage: s.result.usage,
  }));

  // ── Write carousel HTML files + manifest.json ─────────────────────────────
  if (carouselDir) {
    try {
      writeCarouselArtifacts({ carouselId: carouselId!, carouselDir, topic, format, plan, research, usage, contentWarnings, states });
    } catch (err) {
      log.error('content.carousel.write_error', { reason: (err as Error).message });
    }
  }

  return {
    ok: true,
    carouselId, carouselDir,
    topic, format, framework: plan.framework, title: plan.title, angle: plan.angle, research,
    slides, reviewRounds, contentWarnings, usage,
    durationMs: Date.now() - start,
  };
}

function writeCarouselArtifacts(p: {
  carouselId: string;
  carouselDir: string;
  topic: string;
  format: ContentFormat;
  plan: ContentPlan;
  research: string;
  usage: UsageTotals;
  contentWarnings: { research: string[]; plan: string[] };
  states: SlideState[];
}): void {
  if (!fs.existsSync(p.carouselDir)) fs.mkdirSync(p.carouselDir, { recursive: true });

  const manifestSlides = p.states.map((s, idx) => {
    const htmlFile = `slide-${String(idx + 1).padStart(2, '0')}.html`;
    fs.writeFileSync(path.join(p.carouselDir, htmlFile), s.result.html, 'utf8');
    return {
      index: idx,
      role: s.role,
      narrativeFunction: p.plan.slides[idx]?.narrativeFunction,
      file: path.basename(s.result.file),
      htmlFile,
      intent: s.result.intent,
      designSpec: s.result.designSpec,
      attempts: s.result.attempts,
      warnings: s.result.warnings,
      usage: s.result.usage,
    };
  });

  const manifest = {
    carouselId: p.carouselId,
    topic: p.topic,
    format: p.format,
    framework: p.plan.framework,
    title: p.plan.title,
    angle: p.plan.angle,
    createdAt: new Date().toISOString(),
    usage: p.usage,
    warnings: p.contentWarnings,
    research: p.research,
    slides: manifestSlides,
  };
  fs.writeFileSync(path.join(p.carouselDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  log.info('content.carousel.written', { carouselId: p.carouselId, dir: p.carouselDir, slides: manifestSlides.length });
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
  output: { dir?: string; fileName?: string },
  ctx: { narrativeFunction?: string; index: number; total: number; showCtaArrow: boolean },
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
    output,
    narrativeFunction: ctx.narrativeFunction,
    slideIndex: ctx.index,
    slideTotal: ctx.total,
    showCtaArrow: ctx.showCtaArrow,
    models: args.models,
  });
}
