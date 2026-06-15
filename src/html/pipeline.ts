import type OpenAI from 'openai';
import type { ReasoningEffort, AgentModels } from '@/llm/client';
import type { SlideRole } from './htmlSystemPrompt';
import { planSlideDesign, reviewSlideDesign, type SlideDesignSpec } from './designSpec';
import { generateSlideHtml } from './generateHtml';
import { buildHtmlSystemPrompt } from './htmlSystemPrompt';
import { validateGeneratedHtml } from './validate';
import { buildHtmlDocument } from './template';
import { renderHtmlStill } from './renderHtml';
import { readBrandKit, defaultBrandKit } from '@/server/brand';
import { getBrandVars } from './brandVars';
import { reviewRenderedSlide, type QualityIssue } from './qualityReview';
import type { LayoutIssue } from './layoutAudit';
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
  /** Per-agent model overrides. Each key falls back to `model` if not set. */
  models?: Partial<AgentModels>;
  /** Context about sibling slides in the same carousel (recipes used, cover/cta echo) — guides the design planner toward variety and coherence. */
  designContext?: string;
  /** True for a standalone single post: the (cover) slide must be self-contained and richer, not a sparse carousel cover. */
  selfContained?: boolean;
  /**
   * Surgical revision mode: reuse an already-approved design + HTML and apply a
   * single editorial fix instead of regenerating the slide from scratch. Skips
   * the design phase (Agent 1 + 2) entirely.
   */
  revision?: {
    designSpec: SlideDesignSpec;
    previousHtml: { bodyHtml: string; css: string };
    editorialFix: string;
  };
}

export type PipelineWarning =
  | { kind: 'design-review'; issues: string[] }
  | { kind: 'layout'; issues: LayoutIssue[] }
  | { kind: 'quality'; issues: QualityIssue[] }
  | { kind: 'invalid-html'; detail: string };

export interface PipelineSuccess {
  ok: true;
  file: string;
  html: string;
  /** Renderer output before shell-wrapping — kept so a later surgical revision can reuse it. */
  bodyHtml: string;
  css: string;
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
  const pick = (agent: keyof AgentModels) => args.models?.[agent] ?? model;
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
  // Revision mode reuses an already-approved design and skips the design phase.
  let designSpec: SlideDesignSpec;
  let designAttempts = 0;

  if (args.revision) {
    designSpec = args.revision.designSpec;
  } else {
    const design = await runDesignPhase({ client, pick, reasoningEffort, brandContext, userPrompt, role, meter, designContext: args.designContext, selfContained: args.selfContained });
    if (!design.ok) return { ok: false, code: 'LLM_FAILURE', detail: design.detail };
    designSpec = design.designSpec;
    designAttempts = design.attempts;
    totalLlmMs += design.llmMs;
    if (design.warning) warnings.push(design.warning);
  }

  // ── Phase 2: Render + Quality (Agent 3 → render → Agent 4) — best effort ──
  const systemPrompt = buildHtmlSystemPrompt(brandContext, role, args.selfContained, getBrandVars());
  let renderAttempts = 0;
  // In revision mode, seed the renderer with the editorial fix + the prior HTML so it edits surgically.
  let renderFeedback: string | undefined = args.revision ? buildEditorialFeedback(args.revision.editorialFix) : undefined;
  let previousHtml: { bodyHtml: string; css: string } | undefined = args.revision?.previousHtml;

  for (let ra = 1; ra <= MAX_RENDER_RETRIES; ra++) {
    renderAttempts = ra;
    const isLastAttempt = ra === MAX_RENDER_RETRIES;

    const t3 = Date.now();
    let generated;
    try {
      generated = await generateSlideHtml({
        client, model: pick('htmlRender'), systemPrompt, reasoningEffort,
        userPrompt: buildRendererPrompt(designSpec, renderFeedback, previousHtml),
        feedback: renderFeedback, meter,
      });
    } catch (err) {
      return { ok: false, code: 'LLM_FAILURE', detail: (err as Error).message };
    }
    totalLlmMs += Date.now() - t3;
    // Remember this attempt so the next retry can correct it instead of starting from scratch.
    previousHtml = { bodyHtml: generated.bodyHtml, css: generated.css };

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

    const kit = readBrandKit() ?? defaultBrandKit();
    const html = buildHtmlDocument(generated.bodyHtml, generated.css, showArrow, kit.brandColors, kit.font);

    const t4 = Date.now();
    const renderOutcome = await renderHtmlStill(html, outputId, {
      force: isLastAttempt,
      dir: output?.dir,
      fileName: output?.fileName,
      ctaArrow: showArrow,
    });
    totalRenderMs += Date.now() - t4;

    if (!renderOutcome.ok) {
      log.warn('pipeline.render.layout_issues', { attempt: ra, count: renderOutcome.issues.length });
      renderFeedback = buildLayoutFeedback(renderOutcome.issues);
      continue;
    }

    // Forced render that still had layout issues → ship best-effort, skip quality review.
    if (renderOutcome.issues.length > 0) {
      warnings.push({ kind: 'layout', issues: renderOutcome.issues });
      return finalize(renderOutcome.file, html, generated);
    }

    // Agent 4: quality review
    const t5 = Date.now();
    let qualityReview;
    try {
      qualityReview = await reviewRenderedSlide({ client, model: pick('qualityReview'), reasoningEffort, pngPath: renderOutcome.file, bodyHtml: generated.bodyHtml, css: generated.css, designSpec, meter, slideContext });
    } catch (err) {
      totalLlmMs += Date.now() - t5;
      log.warn('pipeline.quality.review_error', { error: (err as Error).message, attempt: ra });
      return finalize(renderOutcome.file, html, generated);
    }
    totalLlmMs += Date.now() - t5;
    log.info('pipeline.quality.reviewed', { approved: qualityReview.approved, issueCount: qualityReview.issues.length, attempt: ra });

    if (qualityReview.approved) {
      return finalize(renderOutcome.file, html, generated);
    }

    if (isLastAttempt) {
      warnings.push({ kind: 'quality', issues: qualityReview.issues });
      return finalize(renderOutcome.file, html, generated);
    }

    renderFeedback = qualityReview.rendererFeedback
      ?? qualityReview.issues.map((i) => `[${i.category}] ${i.description}: ${i.suggestion}`).join('\n');
  }

  /* istanbul ignore next */
  return { ok: false, code: 'LLM_FAILURE', detail: 'pipeline_exhausted' };

  function finalize(file: string, html: string, generated: { intent: string; bodyHtml: string; css: string }): PipelineSuccess {
    const usage = meter.totals;
    log.info('pipeline.usage', { breakdown: meter.breakdown, total: usage });
    return {
      ok: true,
      file, html, intent: generated.intent, bodyHtml: generated.bodyHtml, css: generated.css,
      designSpec, warnings,
      attempts: { design: designAttempts, render: renderAttempts },
      durationMs: { llm: totalLlmMs, render: totalRenderMs, total: totalLlmMs + totalRenderMs },
      usage,
    };
  }
}

type DesignPhaseResult =
  | { ok: true; designSpec: SlideDesignSpec; attempts: number; llmMs: number; warning?: PipelineWarning }
  | { ok: false; detail: string };

/** Agent 1 → Agent 2 design loop, best effort. Extracted to keep runSlidePipeline readable. */
async function runDesignPhase(a: {
  client: OpenAI;
  pick: (agent: keyof AgentModels) => string;
  reasoningEffort?: ReasoningEffort;
  brandContext: string;
  userPrompt: string;
  role?: SlideRole;
  meter: UsageMeter;
  designContext?: string;
  selfContained?: boolean;
}): Promise<DesignPhaseResult> {
  let llmMs = 0;
  let designFeedback: string | undefined;
  let lastSpec: SlideDesignSpec | null = null;
  let lastIssues: string[] = [];

  for (let da = 1; da <= MAX_DESIGN_RETRIES; da++) {
    const t1 = Date.now();
    try {
      lastSpec = await planSlideDesign({ client: a.client, model: a.pick('designPlan'), reasoningEffort: a.reasoningEffort, brandContext: a.brandContext, userPrompt: a.userPrompt, role: a.role, feedback: designFeedback, meter: a.meter, designContext: a.designContext, selfContained: a.selfContained });
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
    llmMs += Date.now() - t1;
    log.info('pipeline.design.planned', { recipe: lastSpec.recipe, attempt: da });

    const t2 = Date.now();
    let review;
    try {
      review = await reviewSlideDesign({ client: a.client, model: a.pick('designReview'), reasoningEffort: a.reasoningEffort, originalPrompt: a.userPrompt, designSpec: lastSpec, meter: a.meter });
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
    llmMs += Date.now() - t2;
    log.info('pipeline.design.reviewed', { approved: review.approved, issueCount: review.issues.length, attempt: da });

    if (review.approved) return { ok: true, designSpec: lastSpec, attempts: da, llmMs };
    lastIssues = review.issues;
    designFeedback = review.issues.join('; ');
  }

  if (!lastSpec) return { ok: false, detail: 'MAX_DESIGN_RETRIES must be >= 1' };
  log.warn('pipeline.design.best_effort', { issues: lastIssues });
  return {
    ok: true,
    designSpec: lastSpec,
    attempts: MAX_DESIGN_RETRIES,
    llmMs,
    warning: lastIssues.length > 0 ? { kind: 'design-review', issues: lastIssues } : undefined,
  };
}

/** Frame a single review fix as surgical corrective feedback for the renderer. */
function buildEditorialFeedback(editorialFix: string): string {
  return `REVISION REQUESTED — apply this fix making the SMALLEST change that fully addresses it. Preserve everything that already works (keep the recipe, the layout structure, and the parts not mentioned). If the fix is about content, change only that copy; if it is about layout/visual issues, adjust only what is needed to resolve them:\n${editorialFix}`;
}

function buildLayoutFeedback(issues: LayoutIssue[]): string {
  const byType = (t: string) => issues.filter((i) => i.type === t).slice(0, 3).map((i) => `- ${i.detail}`);
  const lines: string[] = ['LAYOUT ISSUES detected in the rendered slide — fix them:'];
  const overlap = byType('overlap');
  if (overlap.length) {
    lines.push('OVERLAP (elements must never collide — give each content block its own space in normal flow; avoid position:absolute for body text; avoid fixed heights too small for the content):');
    lines.push(...overlap);
  }
  const clipped = byType('clipped-text');
  if (clipped.length) {
    lines.push('CLIPPED TEXT (text is cut off — reduce font-size within the minimums or shorten the copy; do not put text in a fixed-height box):');
    lines.push(...clipped);
  }
  const wrapped = byType('wrapped-text');
  if (wrapped.length) {
    lines.push('BAD WRAP (a short value broke onto multiple lines, e.g. the "%" dropped to its own line — give the value enough width with white-space:nowrap or a larger container, or reduce its font-size within the minimums):');
    lines.push(...wrapped);
  }
  const exceeds = byType('exceeds-canvas');
  if (exceeds.length) {
    lines.push('EXCEEDS CANVAS (keep all content within 1080×1350):');
    lines.push(...exceeds);
  }
  const overflow = byType('overflow');
  if (overflow.length) {
    lines.push('OVERFLOW (the canvas itself overflows — reduce total content height/width):');
    lines.push(...overflow);
  }
  lines.push('Priority: first shorten the copy, then reduce font sizes within the minimums, then simplify the layout. Never go below the font-size minimums.');
  return lines.join('\n');
}

function buildRendererPrompt(
  designSpec: SlideDesignSpec,
  feedback: string | undefined,
  previousHtml?: { bodyHtml: string; css: string },
): string {
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

  if (!feedback) return base;

  // On a retry, hand the renderer its own previous output so it can fix surgically
  // instead of rebuilding from scratch (and risk regressing what already worked).
  const previous = previousHtml
    ? `\n\n---\nYOUR PREVIOUS ATTEMPT (the one that has the issues below). Start FROM this and apply the smallest changes that fix the corrections — keep everything that already works, do not redesign:
<previousBodyHtml>
${previousHtml.bodyHtml}
</previousBodyHtml>
<previousCss>
${previousHtml.css}
</previousCss>`
    : '';

  return `${base}${previous}\n\n---\nCORRECTIONS REQUIRED (from previous attempt):\n${feedback}`;
}
