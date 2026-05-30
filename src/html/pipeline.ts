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
import { log } from '@/lib/log';

const MAX_DESIGN_RETRIES = Number(process.env.HTML_MAX_DESIGN_RETRIES ?? 2);
const MAX_RENDER_RETRIES = Number(process.env.HTML_MAX_ATTEMPTS ?? 3);

export interface PipelineArgs {
  client: OpenAI;
  model: string;
  reasoningEffort?: ReasoningEffort;
  brandContext: string;
  userPrompt: string;
  role?: SlideRole;
  outputId: string;
}

export interface PipelineSuccess {
  ok: true;
  file: string;
  html: string;
  intent: string;
  designSpec: SlideDesignSpec;
  qualityWarnings: QualityIssue[];
  attempts: { design: number; render: number };
  durationMs: { llm: number; render: number; total: number };
}

export interface PipelineFailure {
  ok: false;
  code: 'DESIGN_REVIEW_FAILED' | 'OVERFLOW_UNRESOLVED' | 'INVALID_HTML' | 'LLM_FAILURE';
  detail: unknown;
}

export type PipelineResult = PipelineSuccess | PipelineFailure;

export async function runSlidePipeline(args: PipelineArgs): Promise<PipelineResult> {
  const { client, model, reasoningEffort, brandContext, userPrompt, role, outputId } = args;
  let totalLlmMs = 0;
  let totalRenderMs = 0;

  // ── Phase 1: Design (Agent 1 → Agent 2) ──────────────────────────────────

  let designSpec: SlideDesignSpec | null = null;
  let designAttempts = 0;
  let designFeedback: string | undefined;

  for (let da = 1; da <= MAX_DESIGN_RETRIES; da++) {
    designAttempts = da;

    const t1 = Date.now();
    let spec: SlideDesignSpec;
    try {
      spec = await planSlideDesign({ client, model, reasoningEffort, brandContext, userPrompt, role, feedback: designFeedback });
    } catch (err) {
      return { ok: false, code: 'LLM_FAILURE', detail: (err as Error).message };
    }
    totalLlmMs += Date.now() - t1;
    log.info('pipeline.design.planned', { recipe: spec.recipe, attempt: da });

    const t2 = Date.now();
    let review;
    try {
      review = await reviewSlideDesign({ client, model, reasoningEffort, originalPrompt: userPrompt, designSpec: spec });
    } catch (err) {
      return { ok: false, code: 'LLM_FAILURE', detail: (err as Error).message };
    }
    totalLlmMs += Date.now() - t2;
    log.info('pipeline.design.reviewed', { approved: review.approved, issueCount: review.issues.length, attempt: da });

    if (review.approved) {
      designSpec = spec;
      break;
    }

    if (da === MAX_DESIGN_RETRIES) {
      return { ok: false, code: 'DESIGN_REVIEW_FAILED', detail: { issues: review.issues, spec } };
    }
    designFeedback = review.issues.join('; ');
  }

  if (!designSpec) {
    return { ok: false, code: 'DESIGN_REVIEW_FAILED', detail: { issues: [], spec: null } };
  }

  // ── Phase 2: Render + Quality (Agent 3 → render → Agent 4) ───────────────

  const systemPrompt = buildHtmlSystemPrompt(brandContext, role);
  let renderAttempts = 0;
  let renderFeedback: string | undefined;

  for (let ra = 1; ra <= MAX_RENDER_RETRIES; ra++) {
    renderAttempts = ra;

    // Agent 3: generate HTML from design spec
    const t3 = Date.now();
    let generated;
    try {
      generated = await generateSlideHtml({
        client, model, systemPrompt, reasoningEffort,
        userPrompt: buildRendererPrompt(designSpec, renderFeedback),
        feedback: renderFeedback,
      });
    } catch (err) {
      return { ok: false, code: 'LLM_FAILURE', detail: (err as Error).message };
    }
    totalLlmMs += Date.now() - t3;

    const validationErr = validateGeneratedHtml(generated.bodyHtml, generated.css);
    if (validationErr) {
      return { ok: false, code: 'INVALID_HTML', detail: validationErr.detail };
    }

    const html = buildHtmlDocument(generated.bodyHtml, generated.css);

    // Render
    const t4 = Date.now();
    const renderOutcome = await renderHtmlStill(html, outputId);
    totalRenderMs += Date.now() - t4;

    if (!renderOutcome.ok) {
      const { scrollHeight, scrollWidth } = renderOutcome.overflow;
      const axes: string[] = [];
      if (renderOutcome.overflow.y) axes.push(`${scrollHeight - 1350}px taller than canvas (scrollHeight: ${scrollHeight})`);
      if (renderOutcome.overflow.x) axes.push(`${scrollWidth - 1080}px wider than canvas (scrollWidth: ${scrollWidth})`);
      log.warn('pipeline.render.overflow', { attempt: ra, scrollHeight, scrollWidth });

      if (ra === MAX_RENDER_RETRIES) {
        return {
          ok: false, code: 'OVERFLOW_UNRESOLVED',
          detail: { overflow: renderOutcome.overflow, html, intent: generated.intent, attempts: renderAttempts },
        };
      }
      renderFeedback = `OVERFLOW: ${axes.join(' and ')}. Reduce content, decrease spacing, or use a more compact layout. Do NOT go below font-size minimums.`;
      continue;
    }

    // Agent 4: quality review
    const t5 = Date.now();
    let qualityReview;
    try {
      qualityReview = await reviewRenderedSlide({ client, model, reasoningEffort, pngPath: renderOutcome.file, html, designSpec });
    } catch (err) {
      totalLlmMs += Date.now() - t5;
      log.warn('pipeline.quality.review_error', { error: (err as Error).message, attempt: ra });
      // Quality review failure is non-fatal — return the render with no warnings
      return {
        ok: true,
        file: renderOutcome.file, html, intent: generated.intent, designSpec,
        qualityWarnings: [],
        attempts: { design: designAttempts, render: renderAttempts },
        durationMs: { llm: totalLlmMs, render: totalRenderMs, total: totalLlmMs + totalRenderMs },
      };
    }
    totalLlmMs += Date.now() - t5;
    log.info('pipeline.quality.reviewed', { approved: qualityReview.approved, issueCount: qualityReview.issues.length, attempt: ra });

    if (qualityReview.approved) {
      return {
        ok: true,
        file: renderOutcome.file, html, intent: generated.intent, designSpec,
        qualityWarnings: [],
        attempts: { design: designAttempts, render: renderAttempts },
        durationMs: { llm: totalLlmMs, render: totalRenderMs, total: totalLlmMs + totalRenderMs },
      };
    }

    if (ra === MAX_RENDER_RETRIES) {
      // Max attempts reached — return the render with quality warnings rather than failing
      return {
        ok: true,
        file: renderOutcome.file, html, intent: generated.intent, designSpec,
        qualityWarnings: qualityReview.issues,
        attempts: { design: designAttempts, render: renderAttempts },
        durationMs: { llm: totalLlmMs, render: totalRenderMs, total: totalLlmMs + totalRenderMs },
      };
    }

    renderFeedback = qualityReview.rendererFeedback
      ?? qualityReview.issues.map(i => `[${i.category}] ${i.description}: ${i.suggestion}`).join('\n');
  }

  // Unreachable — loop always returns before exhausting iterations
  /* istanbul ignore next */
  return { ok: false, code: 'OVERFLOW_UNRESOLVED', detail: { attempts: renderAttempts } };
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
