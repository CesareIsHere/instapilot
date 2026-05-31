import type OpenAI from 'openai';
import type { ReasoningEffort } from '@/llm/client';
import type { SlideRole } from './htmlSystemPrompt';
import { planSlideDesign, reviewSlideDesign, type SlideDesignSpec } from './designSpec';
import { generateSlideHtml } from './generateHtml';
import { buildHtmlSystemPrompt } from './htmlSystemPrompt';
import { validateGeneratedHtml } from './validate';
import { buildHtmlDocument } from './template';
import { renderHtmlStill } from './renderHtml';
import { reviewRenderedSlide, type QualityIssue } from './qualityReview';
import type { OverflowResult } from './schema';
import { UsageMeter, type UsageTotals } from '@/llm/usage';
import { log } from '@/lib/log';

const MAX_DESIGN_RETRIES = Number(process.env.HTML_MAX_DESIGN_RETRIES ?? 3);
const MAX_RENDER_RETRIES = Number(process.env.HTML_MAX_ATTEMPTS ?? 5);

export interface PipelineArgs {
  client: OpenAI;
  model: string;
  reasoningEffort?: ReasoningEffort;
  brandContext: string;
  userPrompt: string;
  role?: SlideRole;
  outputId: string;
  /** Optional output target — used by carousels to group files into one folder. */
  output?: { dir?: string; fileName?: string };
  showCtaArrow?: boolean;
  narrativeFunction?: string;
  slideIndex?: number;
  slideTotal?: number;
}

export type PipelineWarning =
  | { kind: 'design-review'; issues: string[] }
  | { kind: 'overflow'; overflow: OverflowResult }
  | { kind: 'quality'; issues: QualityIssue[] }
  | { kind: 'invalid-html'; detail: string };

export interface PipelineSuccess {
  ok: true;
  file: string;
  html: string;
  intent: string;
  designSpec: SlideDesignSpec;
  warnings: PipelineWarning[];
  attempts: { design: number; render: number };
  durationMs: { llm: number; render: number; total: number };
  usage: UsageTotals;
}

export interface PipelineFailure {
  ok: false;
  code: 'LLM_FAILURE';
  detail: unknown;
}

export type PipelineResult = PipelineSuccess | PipelineFailure;

export async function runSlidePipeline(args: PipelineArgs): Promise<PipelineResult> {
  const { client, model, reasoningEffort, brandContext, userPrompt, role, outputId, output } = args;
  const showArrow = args.showCtaArrow ?? true;
  const isLast = args.slideTotal != null && args.slideIndex != null
    ? args.slideIndex === args.slideTotal - 1
    : undefined;
  const slideContext = role == null
    ? undefined
    : {
        role,
        narrativeFunction: args.narrativeFunction,
        index: args.slideIndex,
        total: args.slideTotal,
        isLast,
      };
  const meter = new UsageMeter();
  const warnings: PipelineWarning[] = [];
  let totalLlmMs = 0;
  let totalRenderMs = 0;

  // ── Phase 1: Design (Agent 1 → Agent 2) — best effort ─────────────────────
  let designSpec: SlideDesignSpec;
  let designAttempts = 0;
  let designFeedback: string | undefined;

  {
    let lastSpec: SlideDesignSpec | null = null;
    let lastIssues: string[] = [];
    for (let da = 1; da <= MAX_DESIGN_RETRIES; da++) {
      designAttempts = da;
      const t1 = Date.now();
      try {
        lastSpec = await planSlideDesign({ client, model, reasoningEffort, brandContext, userPrompt, role, feedback: designFeedback, meter });
      } catch (err) {
        return { ok: false, code: 'LLM_FAILURE', detail: (err as Error).message };
      }
      totalLlmMs += Date.now() - t1;
      log.info('pipeline.design.planned', { recipe: lastSpec.recipe, attempt: da });

      const t2 = Date.now();
      let review;
      try {
        review = await reviewSlideDesign({ client, model, reasoningEffort, originalPrompt: userPrompt, designSpec: lastSpec, meter });
      } catch (err) {
        return { ok: false, code: 'LLM_FAILURE', detail: (err as Error).message };
      }
      totalLlmMs += Date.now() - t2;
      log.info('pipeline.design.reviewed', { approved: review.approved, issueCount: review.issues.length, attempt: da });

      if (review.approved) { lastIssues = []; break; }
      lastIssues = review.issues;
      designFeedback = review.issues.join('; ');
    }
    if (!lastSpec) {
      return { ok: false, code: 'LLM_FAILURE', detail: 'MAX_DESIGN_RETRIES must be >= 1' };
    }
    designSpec = lastSpec;
    if (lastIssues.length > 0) {
      warnings.push({ kind: 'design-review', issues: lastIssues });
      log.warn('pipeline.design.best_effort', { issues: lastIssues });
    }
  }

  // ── Phase 2: Render + Quality (Agent 3 → render → Agent 4) — best effort ──
  const systemPrompt = buildHtmlSystemPrompt(brandContext, role);
  let renderAttempts = 0;
  let renderFeedback: string | undefined;

  for (let ra = 1; ra <= MAX_RENDER_RETRIES; ra++) {
    renderAttempts = ra;
    const isLastAttempt = ra === MAX_RENDER_RETRIES;

    const t3 = Date.now();
    let generated;
    try {
      generated = await generateSlideHtml({
        client, model, systemPrompt, reasoningEffort,
        userPrompt: buildRendererPrompt(designSpec, renderFeedback),
        feedback: renderFeedback, meter,
      });
    } catch (err) {
      return { ok: false, code: 'LLM_FAILURE', detail: (err as Error).message };
    }
    totalLlmMs += Date.now() - t3;

    // Validation → corrective feedback (no longer a hard failure).
    const validationErr = validateGeneratedHtml(generated.bodyHtml, generated.css);
    if (validationErr && !isLastAttempt) {
      renderFeedback = `INVALID HTML: ${validationErr.detail}. Remove the offending tag/handler/remote URL; reference assets only via {{asset:<id>}} tokens.`;
      log.warn('pipeline.render.invalid_html', { attempt: ra, detail: validationErr.detail });
      continue;
    }
    if (validationErr && isLastAttempt) {
      warnings.push({ kind: 'invalid-html', detail: validationErr.detail });
      log.warn('pipeline.render.invalid_html_best_effort', { detail: validationErr.detail });
    }

    const html = buildHtmlDocument(generated.bodyHtml, generated.css, showArrow);

    const t4 = Date.now();
    const renderOutcome = await renderHtmlStill(html, outputId, {
      force: isLastAttempt,
      dir: output?.dir,
      fileName: output?.fileName,
    });
    totalRenderMs += Date.now() - t4;

    if (!renderOutcome.ok) {
      const { scrollHeight, scrollWidth } = renderOutcome.overflow;
      const axes: string[] = [];
      if (renderOutcome.overflow.y) axes.push(`${scrollHeight - 1350}px taller than canvas (scrollHeight: ${scrollHeight})`);
      if (renderOutcome.overflow.x) axes.push(`${scrollWidth - 1080}px wider than canvas (scrollWidth: ${scrollWidth})`);
      log.warn('pipeline.render.overflow', { attempt: ra, scrollHeight, scrollWidth });
      renderFeedback = `OVERFLOW: ${axes.join(' and ')}. First shorten the copy, then compact the layout (reduce gaps/padding). Never go below font-size minimums.`;
      continue;
    }

    // Forced render that still overflowed → ship best-effort, skip quality review.
    if (renderOutcome.overflow) {
      warnings.push({ kind: 'overflow', overflow: renderOutcome.overflow });
      return finalize(renderOutcome.file, html, generated.intent);
    }

    // Agent 4: quality review
    const t5 = Date.now();
    let qualityReview;
    try {
      qualityReview = await reviewRenderedSlide({ client, model, reasoningEffort, pngPath: renderOutcome.file, html, designSpec, meter, slideContext });
    } catch (err) {
      totalLlmMs += Date.now() - t5;
      log.warn('pipeline.quality.review_error', { error: (err as Error).message, attempt: ra });
      return finalize(renderOutcome.file, html, generated.intent);
    }
    totalLlmMs += Date.now() - t5;
    log.info('pipeline.quality.reviewed', { approved: qualityReview.approved, issueCount: qualityReview.issues.length, attempt: ra });

    if (qualityReview.approved) {
      return finalize(renderOutcome.file, html, generated.intent);
    }

    if (isLastAttempt) {
      warnings.push({ kind: 'quality', issues: qualityReview.issues });
      return finalize(renderOutcome.file, html, generated.intent);
    }

    renderFeedback = qualityReview.rendererFeedback
      ?? qualityReview.issues.map((i) => `[${i.category}] ${i.description}: ${i.suggestion}`).join('\n');
  }

  /* istanbul ignore next */
  return { ok: false, code: 'LLM_FAILURE', detail: 'pipeline_exhausted' };

  function finalize(file: string, html: string, intent: string): PipelineSuccess {
    const usage = meter.totals;
    log.info('pipeline.usage', { breakdown: meter.breakdown, total: usage });
    return {
      ok: true,
      file, html, intent, designSpec, warnings,
      attempts: { design: designAttempts, render: renderAttempts },
      durationMs: { llm: totalLlmMs, render: totalRenderMs, total: totalLlmMs + totalRenderMs },
      usage,
    };
  }
}

function buildRendererPrompt(designSpec: SlideDesignSpec, feedback: string | undefined): string {
  const base = `Here is the approved design specification to implement as HTML+CSS:

<designSpec>
${JSON.stringify(designSpec, null, 2)}
</designSpec>

Implement this design faithfully:
- Use the specified recipe layout
- Use the exact headline text with the specified coloredSpans (green/red on those words)
- Include all bodyElements in the specified order with the specified emphasis
- Follow the color plan exactly
- Include all assets listed in useAssets using {{asset:<id>}} tokens`;

  return feedback ? `${base}\n\n---\nCORRECTIONS REQUIRED (from previous attempt):\n${feedback}` : base;
}
