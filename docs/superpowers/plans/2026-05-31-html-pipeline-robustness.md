# HTML Pipeline Robustness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the slide/content pipeline always produce a result (best-effort instead of hard failures), log token usage per agent and per post/carousel, save carousels into dedicated folders with HTML + manifest, harden the HTML-renderer prompt against overflow/positioning, and add review loops to the research and plan phases.

**Architecture:** Introduce a `UsageMeter` threaded through every LLM helper to accumulate tokens. Refactor `runSlidePipeline` so the only terminal failure is `LLM_FAILURE` — design-review and overflow exhaustion now ship best-effort renders with structured `warnings`. The content orchestrator gains research/plan review loops and, for carousels, writes everything to `output/carousel-<id>/` with a `manifest.json`.

**Tech Stack:** TypeScript (ESM), Express, Zod, OpenAI SDK, Playwright, Vitest. Path alias `@/* → src/*`. Tests live in `tests/{unit,integration}` and run via `npm test` (vitest, `include: tests/**/*.test.ts`).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/llm/usage.ts` | **New.** `UsageMeter` class — accumulate/aggregate token usage from Chat & Responses API shapes. |
| `src/html/designSpec.ts` | Modify — `callLlmJson`, `planSlideDesign`, `reviewSlideDesign` accept `meter` + label. |
| `src/html/generateHtml.ts` | Modify — `generateSlideHtml` accepts `meter`, records `html.generate`. |
| `src/html/qualityReview.ts` | Modify — `reviewRenderedSlide` accepts `meter`, records `quality.review`. |
| `src/html/renderHtml.ts` | Modify — `renderHtmlStill` accepts `opts {force, dir, fileName}`; force-screenshots overflow. |
| `src/html/pipeline.ts` | Modify — best-effort flow, `PipelineWarning` union, usage, retry defaults. |
| `src/html/htmlSystemPrompt.ts` | Modify — overflow/positioning hardening. |
| `src/content/research.ts` | Modify — prompt hardening + `meter`. |
| `src/content/plan.ts` | Modify — prompt hardening + `meter`. |
| `src/content/review.ts` | Modify — prompt sharpening + `meter`. |
| `src/content/researchReview.ts` | **New.** `reviewResearch` agent + schema. |
| `src/content/planReview.ts` | **New.** `reviewPlan` agent + schema. |
| `src/content/orchestrate.ts` | Modify — research/plan review loops, carousel folder + manifest, usage rollup. |
| `src/server/routes.ts` | Modify — `/render/html` & `/generate/content` response shapes (warnings, usage, carouselId). |
| `tests/unit/llm/usage.test.ts` | **New.** UsageMeter tests. |
| `tests/unit/html/pipeline.test.ts` | **New.** Best-effort branch tests. |
| `tests/unit/content/researchReview.test.ts` | **New.** Schema test. |
| `tests/unit/content/planReview.test.ts` | **New.** Schema test. |
| `tests/integration/renderHtml.test.ts` | Modify — warnings/usage assertions, drop dead failure codes. |
| `tests/integration/generateContent.test.ts` | Modify — new mocks, carousel folder, usage. |
| `.env.example` | Modify — new + changed defaults. |

---

## Task 1: `UsageMeter`

**Files:**
- Create: `src/llm/usage.ts`
- Test: `tests/unit/llm/usage.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/llm/usage.test.ts
import { describe, it, expect } from 'vitest';
import { UsageMeter } from '@/llm/usage';

describe('UsageMeter', () => {
  it('accumulates Chat API usage (prompt/completion/total)', () => {
    const m = new UsageMeter();
    m.record('a', { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
    m.record('b', { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 });
    expect(m.totals).toEqual({ promptTokens: 30, completionTokens: 15, totalTokens: 45, calls: 2 });
  });

  it('maps Responses API usage (input/output tokens)', () => {
    const m = new UsageMeter();
    m.record('research', { input_tokens: 100, output_tokens: 40, total_tokens: 140 });
    expect(m.totals).toEqual({ promptTokens: 100, completionTokens: 40, totalTokens: 140, calls: 1 });
  });

  it('treats missing usage as zeros but still counts the call', () => {
    const m = new UsageMeter();
    m.record('x', undefined);
    expect(m.totals).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0, calls: 1 });
  });

  it('derives total when total_tokens absent', () => {
    const m = new UsageMeter();
    m.record('x', { prompt_tokens: 7, completion_tokens: 3 });
    expect(m.totals.totalTokens).toBe(10);
  });

  it('aggregates breakdown by label', () => {
    const m = new UsageMeter();
    m.record('html.generate', { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 });
    m.record('html.generate', { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 });
    m.record('quality.review', { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 });
    const byLabel = Object.fromEntries(m.breakdown.map((r) => [r.label, r]));
    expect(byLabel['html.generate'].calls).toBe(2);
    expect(byLabel['html.generate'].totalTokens).toBe(20);
    expect(byLabel['quality.review'].totalTokens).toBe(2);
  });

  it('records UsageTotals via recordTotals (for rollups)', () => {
    const m = new UsageMeter();
    m.recordTotals('slide-1', { promptTokens: 100, completionTokens: 50, totalTokens: 150, calls: 4 });
    expect(m.totals).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150, calls: 1 });
    expect(m.breakdown[0].label).toBe('slide-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/llm/usage.test.ts`
Expected: FAIL — `Cannot find module '@/llm/usage'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/llm/usage.ts

/** Raw usage object as returned by either the Chat Completions API
 * (prompt_tokens/completion_tokens) or the Responses API (input_tokens/output_tokens). */
export interface RawUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
}

export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
}

export interface UsageRecord extends UsageTotals {
  label: string;
}

const ZERO: UsageTotals = { promptTokens: 0, completionTokens: 0, totalTokens: 0, calls: 0 };

/** Accumulates token usage across LLM calls in a single pipeline run.
 * Designed so a future price table is a pure multiplication over UsageTotals. */
export class UsageMeter {
  private _records: UsageRecord[] = [];

  /** Record usage from a raw LLM response.usage object (either API shape). */
  record(label: string, usage?: RawUsage | null): void {
    const promptTokens = usage?.prompt_tokens ?? usage?.input_tokens ?? 0;
    const completionTokens = usage?.completion_tokens ?? usage?.output_tokens ?? 0;
    const totalTokens = usage?.total_tokens ?? promptTokens + completionTokens;
    this._records.push({ label, promptTokens, completionTokens, totalTokens, calls: 1 });
  }

  /** Record a pre-aggregated UsageTotals (e.g. rolling a per-slide total into a carousel total). */
  recordTotals(label: string, totals: UsageTotals): void {
    this._records.push({ label, ...totals, calls: 1 });
  }

  get records(): UsageRecord[] {
    return [...this._records];
  }

  get totals(): UsageTotals {
    return this._records.reduce(
      (acc, r) => ({
        promptTokens: acc.promptTokens + r.promptTokens,
        completionTokens: acc.completionTokens + r.completionTokens,
        totalTokens: acc.totalTokens + r.totalTokens,
        calls: acc.calls + 1,
      }),
      { ...ZERO },
    );
  }

  /** Usage aggregated per label (multiple calls with the same label are summed). */
  get breakdown(): UsageRecord[] {
    const map = new Map<string, UsageRecord>();
    for (const r of this._records) {
      const existing = map.get(r.label);
      if (existing) {
        existing.promptTokens += r.promptTokens;
        existing.completionTokens += r.completionTokens;
        existing.totalTokens += r.totalTokens;
        existing.calls += 1;
      } else {
        map.set(r.label, { ...r });
      }
    }
    return [...map.values()];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/llm/usage.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/llm/usage.ts tests/unit/llm/usage.test.ts
git commit -m "feat(llm): UsageMeter for per-agent token accounting"
```

---

## Task 2: Thread `meter` into HTML LLM helpers

**Files:**
- Modify: `src/html/designSpec.ts`
- Modify: `src/html/generateHtml.ts`
- Modify: `src/html/qualityReview.ts`

No new behavior beyond recording usage; covered by existing schema tests + the pipeline tests in Task 4. This task is a refactor — verify with `npm run build`.

- [ ] **Step 1: Add `meter` to `callLlmJson` and both callers in `designSpec.ts`**

In `src/html/designSpec.ts`, change the import line at top to add the type:

```ts
import type { UsageMeter } from '@/llm/usage';
```

Replace the `callLlmJson` signature and the response block (lines ~42–78) so it accepts a meter + label and records usage:

```ts
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
```

- [ ] **Step 2: Pass `meter` through `planSlideDesign` and `reviewSlideDesign`**

Add `meter?: UsageMeter;` to both args object types, and pass it to `callLlmJson`. Replace the two function bodies' `callLlmJson(...)` calls:

In `planSlideDesign` (the `return callLlmJson(...)`), append `args.meter, 'design.plan'`:

```ts
  return callLlmJson(
    args.client, args.model, args.reasoningEffort,
    [
      { role: 'system', content: buildPlannerSystemPrompt(args.brandContext, args.role) },
      { role: 'user', content: userContent },
    ],
    SlideDesignSpecSchema, 'SlideDesignSpec',
    args.meter, 'design.plan',
  );
```

In `reviewSlideDesign`:

```ts
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
```

Add `meter?: UsageMeter;` to the args type of `planSlideDesign` (after `feedback?: string;`) and to `reviewSlideDesign` (after `designSpec: SlideDesignSpec;`).

- [ ] **Step 3: Add `meter` to `generateHtml.ts`**

In `src/html/generateHtml.ts`, add the import:

```ts
import type { UsageMeter } from '@/llm/usage';
```

Add `meter?: UsageMeter;` to `GenerateHtmlArgs`. After the `const response = (...)` line and before `const content = ...`, insert:

```ts
  args.meter?.record('html.generate', response.usage);
```

- [ ] **Step 4: Add `meter` to `qualityReview.ts`**

In `src/html/qualityReview.ts`, add the import:

```ts
import type { UsageMeter } from '@/llm/usage';
```

Add `meter?: UsageMeter;` to the `reviewRenderedSlide` args type (after `designSpec: SlideDesignSpec;`). After `const resp = await args.client.chat.completions.create(...)` and before `const content = ...`, insert:

```ts
  args.meter?.record('quality.review', resp.usage);
```

- [ ] **Step 5: Verify build + existing tests still pass**

Run: `npm run build`
Expected: no type errors.
Run: `npm test -- tests/unit/html`
Expected: PASS (schema/template/validate tests unaffected).

- [ ] **Step 6: Commit**

```bash
git add src/html/designSpec.ts src/html/generateHtml.ts src/html/qualityReview.ts
git commit -m "feat(html): thread UsageMeter through design/render/quality agents"
```

---

## Task 3: `renderHtmlStill` — output options + forced screenshot

**Files:**
- Modify: `src/html/renderHtml.ts`

The render function gains an options object: a configurable output `dir`/`fileName` (for carousel folders) and a `force` flag that screenshots even when overflow is detected (so the final pipeline attempt always yields an image). Tested via the pipeline tests in Task 4 (which mock this module); here verify with build.

- [ ] **Step 1: Extend the result type and signature**

In `src/html/renderHtml.ts`, replace the `RenderHtmlResult` interface and add an `overflow?` field so a forced success can carry overflow info:

```ts
export interface RenderHtmlResult {
  file: string;
  durationMs: number;
  /** Present when the screenshot was forced despite overflow (best-effort render). */
  overflow?: OverflowResult;
}

export interface RenderHtmlOpts {
  /** Screenshot even if overflow is detected, returning ok:true with `overflow` set. */
  force?: boolean;
  /** Output directory (defaults to OUTPUT_DIR). */
  dir?: string;
  /** Output file name including extension (defaults to `HtmlSlide-<outputId>.png`). */
  fileName?: string;
}
```

- [ ] **Step 2: Rewrite `renderHtmlStill` body to honor the options**

Replace the function signature and the overflow/screenshot section:

```ts
export async function renderHtmlStill(
  html: string,
  outputId: string,
  opts: RenderHtmlOpts = {},
): Promise<RenderHtmlOutcome> {
  const start = Date.now();
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1350 },
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  });

  try {
    const page = await context.newPage();
    await page.route(/^https?:\/\//, (route) => route.abort());
    await page.setContent(html, { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS });
    await page.evaluate(async () => { await document.fonts.ready; });

    const measurements = await page.evaluate(() => {
      const canvas = document.querySelector('.canvas') as HTMLElement | null;
      const el = canvas ?? document.documentElement;
      return { scrollWidth: el.scrollWidth, scrollHeight: el.scrollHeight };
    });

    const overflowX = measurements.scrollWidth > 1080 + OVERFLOW_TOLERANCE_PX;
    const overflowY = measurements.scrollHeight > 1350 + OVERFLOW_TOLERANCE_PX;
    const hasOverflow = overflowX || overflowY;
    const overflow: OverflowResult = {
      x: overflowX,
      y: overflowY,
      scrollWidth: measurements.scrollWidth,
      scrollHeight: measurements.scrollHeight,
    };

    if (hasOverflow && !opts.force) {
      const durationMs = Date.now() - start;
      log.warn('render.html.overflow', { ...measurements, overflowX, overflowY });
      return { ok: false, overflow, durationMs };
    }

    const dir = opts.dir ?? OUTPUT_DIR;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const fileName = opts.fileName ?? `HtmlSlide-${outputId}.png`;
    const file = path.join(dir, fileName);

    await page.screenshot({
      path: file,
      clip: { x: 0, y: 0, width: 1080, height: 1350 },
      type: 'png',
    });

    const durationMs = Date.now() - start;
    if (hasOverflow) {
      log.warn('render.html.forced_overflow', { file, durationMs, ...measurements });
      return { ok: true, file, durationMs, overflow };
    }
    log.info('render.html.complete', { file, durationMs });
    return { ok: true, file, durationMs };
  } finally {
    await context.close();
  }
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/html/renderHtml.ts
git commit -m "feat(render): forced screenshot on overflow + configurable output path"
```

---

## Task 4: Pipeline best-effort rewrite

**Files:**
- Modify: `src/html/pipeline.ts`
- Test: `tests/unit/html/pipeline.test.ts`

The pipeline becomes best-effort: design-review exhaustion keeps the last spec (warning), overflow exhaustion forces a render (warning), invalid HTML becomes retry feedback (warning on last attempt). The only failure is `LLM_FAILURE`. Output dir/fileName flow through. Usage is metered and returned.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/html/pipeline.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const SPEC = {
  recipe: 'cover', rationale: 'r',
  headline: { text: 'T', coloredSpans: null },
  eyebrow: null, bodyElements: [], colorPlan: 'navy', useAssets: ['logo-f'], notes: null,
};

const planSlideDesign = vi.fn();
const reviewSlideDesign = vi.fn();
const generateSlideHtml = vi.fn();
const reviewRenderedSlide = vi.fn();
const renderHtmlStill = vi.fn();

vi.mock('@/html/designSpec', () => ({ planSlideDesign, reviewSlideDesign }));
vi.mock('@/html/generateHtml', () => ({ generateSlideHtml }));
vi.mock('@/html/qualityReview', () => ({ reviewRenderedSlide }));
vi.mock('@/html/renderHtml', () => ({ renderHtmlStill }));
vi.mock('@/html/validate', () => ({ validateGeneratedHtml: vi.fn(() => null) }));
vi.mock('@/html/template', () => ({ buildHtmlDocument: vi.fn(() => '<html>doc</html>') }));
vi.mock('@/html/htmlSystemPrompt', () => ({ buildHtmlSystemPrompt: vi.fn(() => 'sys') }));

import { runSlidePipeline } from '@/html/pipeline';
import { validateGeneratedHtml } from '@/html/validate';

const baseArgs = {
  client: {} as never, model: 'm', brandContext: 'b', userPrompt: 'p', outputId: 'id1',
};
const GENERATED = { intent: 'i', bodyHtml: '<div></div>', css: '.canvas{}' };

beforeEach(() => {
  vi.clearAllMocks();
  planSlideDesign.mockResolvedValue(SPEC);
  reviewSlideDesign.mockResolvedValue({ approved: true, issues: [] });
  generateSlideHtml.mockResolvedValue(GENERATED);
  renderHtmlStill.mockResolvedValue({ ok: true, file: '/out/x.png', durationMs: 5 });
  reviewRenderedSlide.mockResolvedValue({ approved: true, issues: [], rendererFeedback: null });
  (validateGeneratedHtml as ReturnType<typeof vi.fn>).mockReturnValue(null);
});

describe('runSlidePipeline — best effort', () => {
  it('returns ok with no warnings on the happy path + usage present', async () => {
    const res = await runSlidePipeline(baseArgs as never);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.warnings).toEqual([]);
    expect(res.usage.calls).toBeGreaterThan(0);
  });

  it('ships best-effort with a design-review warning when Agent 2 never approves', async () => {
    reviewSlideDesign.mockResolvedValue({ approved: false, issues: ['recipe mismatch'] });
    const res = await runSlidePipeline(baseArgs as never);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.warnings.some((w) => w.kind === 'design-review')).toBe(true);
    expect(res.file).toBe('/out/x.png');
  });

  it('forces a render and warns when overflow never resolves', async () => {
    renderHtmlStill
      .mockResolvedValueOnce({ ok: false, overflow: { x: false, y: true, scrollWidth: 1080, scrollHeight: 1500 }, durationMs: 5 })
      .mockResolvedValueOnce({ ok: false, overflow: { x: false, y: true, scrollWidth: 1080, scrollHeight: 1500 }, durationMs: 5 })
      .mockResolvedValueOnce({ ok: false, overflow: { x: false, y: true, scrollWidth: 1080, scrollHeight: 1500 }, durationMs: 5 })
      .mockResolvedValueOnce({ ok: false, overflow: { x: false, y: true, scrollWidth: 1080, scrollHeight: 1500 }, durationMs: 5 })
      .mockResolvedValueOnce({ ok: true, file: '/out/forced.png', durationMs: 5, overflow: { x: false, y: true, scrollWidth: 1080, scrollHeight: 1500 } });
    const res = await runSlidePipeline(baseArgs as never);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.file).toBe('/out/forced.png');
    expect(res.warnings.some((w) => w.kind === 'overflow')).toBe(true);
    // Last attempt must request a forced render.
    const lastCall = renderHtmlStill.mock.calls[renderHtmlStill.mock.calls.length - 1];
    expect(lastCall[2]).toMatchObject({ force: true });
  });

  it('treats invalid HTML as retry feedback, not a hard failure', async () => {
    (validateGeneratedHtml as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({ code: 'INVALID_HTML', detail: '<script> tag not allowed' })
      .mockReturnValue(null);
    const res = await runSlidePipeline(baseArgs as never);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // second generate attempt produced valid html → clean success
    expect(generateSlideHtml).toHaveBeenCalledTimes(2);
  });

  it('returns LLM_FAILURE only when an LLM call throws', async () => {
    planSlideDesign.mockRejectedValue(new Error('network down'));
    const res = await runSlidePipeline(baseArgs as never);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('LLM_FAILURE');
  });

  it('passes output dir/fileName through to the renderer', async () => {
    await runSlidePipeline({ ...baseArgs, output: { dir: '/out/carousel-1', fileName: 'slide-01.png' } } as never);
    expect(renderHtmlStill.mock.calls[0][2]).toMatchObject({ dir: '/out/carousel-1', fileName: 'slide-01.png' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/html/pipeline.test.ts`
Expected: FAIL — current pipeline returns `DESIGN_REVIEW_FAILED`/`OVERFLOW_UNRESOLVED`, has no `warnings`/`usage`, no `output` arg.

- [ ] **Step 3: Rewrite `src/html/pipeline.ts`**

Replace the entire file with:

```ts
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
    // lastSpec is always set (LLM_FAILURE returns earlier otherwise).
    designSpec = lastSpec as SlideDesignSpec;
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
      // Cannot resolve within budget — ship best-effort with a warning.
      warnings.push({ kind: 'invalid-html', detail: validationErr.detail });
      log.warn('pipeline.render.invalid_html_best_effort', { detail: validationErr.detail });
    }

    const html = buildHtmlDocument(generated.bodyHtml, generated.css);

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
      qualityReview = await reviewRenderedSlide({ client, model, reasoningEffort, pngPath: renderOutcome.file, html, designSpec, meter });
    } catch (err) {
      totalLlmMs += Date.now() - t5;
      log.warn('pipeline.quality.review_error', { error: (err as Error).message, attempt: ra });
      return finalize(renderOutcome.file, html, generated.intent); // non-fatal
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

  // Unreachable — the loop always returns on the last attempt.
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
```

> Note: `finalize` is a nested function so it closes over `meter`, `warnings`, `designSpec`, attempts and timings. It is declared after the `return` for readability; hoisting makes it available throughout the function body.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/html/pipeline.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: type errors in `src/server/routes.ts` (uses `result.qualityWarnings`) and `src/content/orchestrate.ts` (uses `PipelineSuccess['qualityWarnings']`). These are fixed in Tasks 5 and 10. Note them and continue.

- [ ] **Step 6: Commit**

```bash
git add src/html/pipeline.ts tests/unit/html/pipeline.test.ts
git commit -m "feat(pipeline): best-effort result with structured warnings + usage"
```

---

## Task 5: Update `/render/html` route + its integration test

**Files:**
- Modify: `src/server/routes.ts` (the `mountHtmlRoutes` block, lines ~147–188)
- Modify: `tests/integration/renderHtml.test.ts`

- [ ] **Step 1: Update the route response shape**

In `src/server/routes.ts`, replace the `res.json({...})` body inside `mountHtmlRoutes` with:

```ts
      res.json({
        file: result.file,
        intent: result.intent,
        html: result.html,
        designSpec: result.designSpec,
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
        attempts: result.attempts,
        usage: result.usage,
        durationMs: result.durationMs.total,
        llmDurationMs: result.durationMs.llm,
        renderDurationMs: result.durationMs.render,
      });
```

(The `if (!result.ok)` branch above it stays — it now only fires for `LLM_FAILURE`.)

- [ ] **Step 2: Update the integration test**

In `tests/integration/renderHtml.test.ts`:

Replace `MOCK_SUCCESS` (lines 16–25) with:

```ts
const MOCK_SUCCESS = {
  ok: true as const,
  file: '/abs/output/HtmlSlide-mock.png',
  html: '<!DOCTYPE html><html><head></head><body><div class="canvas"></div></body></html>',
  intent: 'mock cover intent',
  designSpec: MOCK_DESIGN_SPEC,
  warnings: [],
  attempts: { design: 1, render: 1 },
  durationMs: { llm: 200, render: 80, total: 280 },
  usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150, calls: 4 },
};
```

Replace the two `qualityWarnings` tests (lines 69–84) with `warnings` + `usage` tests:

```ts
  it('omits warnings field when empty and includes usage', async () => {
    const res = await request(buildApp()).post('/render/html').send({ prompt: 'x' });
    expect(res.status).toBe(200);
    expect(res.body.warnings).toBeUndefined();
    expect(res.body.usage.totalTokens).toBe(150);
  });

  it('includes warnings when present', async () => {
    const { runSlidePipeline } = await import('@/html/pipeline');
    (runSlidePipeline as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...MOCK_SUCCESS,
      warnings: [{ kind: 'quality', issues: [{ category: 'brand-color', description: 'Hardcoded hex', suggestion: 'Use CSS vars' }] }],
    });
    const res = await request(buildApp()).post('/render/html').send({ prompt: 'x' });
    expect(res.status).toBe(200);
    expect(res.body.warnings).toHaveLength(1);
    expect(res.body.warnings[0].kind).toBe('quality');
  });
```

Delete the three now-impossible failure tests (the pipeline can no longer emit these codes): the `it('returns 422 invalid_html ...')`, `it('returns 422 overflow_unresolved ...')`, and `it('returns 422 design_review_failed ...')` blocks (lines 92–138). Keep the `LLM_FAILURE` test and the `role` test.

- [ ] **Step 3: Run the test**

Run: `npm test -- tests/integration/renderHtml.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/routes.ts tests/integration/renderHtml.test.ts
git commit -m "feat(api): /render/html returns warnings + token usage"
```

---

## Task 6: Harden the HTML renderer system prompt

**Files:**
- Modify: `src/html/htmlSystemPrompt.ts`
- Create: `tests/unit/html/htmlSystemPrompt.test.ts`

- [ ] **Step 1: Write the failing test (asserts the new guardrails are present)**

```ts
// tests/unit/html/htmlSystemPrompt.test.ts
import { describe, it, expect } from 'vitest';
import { buildHtmlSystemPrompt } from '@/html/htmlSystemPrompt';

describe('buildHtmlSystemPrompt — overflow/positioning hardening', () => {
  const prompt = buildHtmlSystemPrompt('CTX', 'body');

  it('mandates box-sizing: border-box', () => {
    expect(prompt).toContain('box-sizing: border-box');
  });
  it('warns about flex children min-width/min-height', () => {
    expect(prompt).toMatch(/min-width:\s*0/);
    expect(prompt).toMatch(/min-height:\s*0/);
  });
  it('forbids viewport units', () => {
    expect(prompt.toLowerCase()).toContain('100vw');
    expect(prompt.toLowerCase()).toContain('100vh');
  });
  it('requires overflow-wrap for long words/numbers', () => {
    expect(prompt).toContain('overflow-wrap');
  });
  it('includes a worked height-budget example summing to <= 1350', () => {
    expect(prompt).toMatch(/1350/);
    expect(prompt.toLowerCase()).toContain('height budget');
  });
  it('embeds the brand context', () => {
    expect(prompt).toContain('CTX');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/unit/html/htmlSystemPrompt.test.ts`
Expected: FAIL on `box-sizing`, `min-width: 0`, `100vw`, `overflow-wrap`, `height budget`.

- [ ] **Step 3: Edit the prompt**

In `src/html/htmlSystemPrompt.ts`, replace the `# ANTI-OVERFLOW RULES (CRITICAL)` section (currently lines ~105–112) with the expanded version below, and replace the `# SELF-CHECK BEFORE RESPONDING` section (lines ~152–162) with the rewritten checklist:

````md
# ANTI-OVERFLOW & POSITIONING RULES (CRITICAL — read twice)

Content that overflows 1080×1350 forces a regeneration. Be meticulous.

## Box model
- Add this rule FIRST in your CSS: \`.canvas, .canvas *, .canvas *::before, .canvas *::after { box-sizing: border-box; }\`. Without it, padding ADDS to width/height and causes overflow.
- Root element inside \`.canvas\`: \`width:1080px; height:1350px; overflow:hidden\`. Never larger.

## Flexbox (the #1 source of silent overflow)
- Every flex child that holds text MUST have \`min-width:0\` (for rows) and \`min-height:0\` (for columns). Flex items default to \`min-width:auto\`, which refuses to shrink and overflows.
- Two-column row: parent \`display:flex; gap:N\`, each child \`flex:1; min-width:0\`. No fixed px widths.
- Fixed sections (logo bar, footer): \`flex-shrink:0\` so they keep their height; everything else absorbs the remaining space.

## Units & sizing
- NEVER use \`100vw\`, \`100vh\`, \`vmin\`, \`vmax\`, or \`%\` of the viewport. The canvas is exactly 1080×1350px — use those fixed numbers.
- No \`position:absolute\` for layout (decorative accents only).

## Text wrapping
- Long words, URLs, tickers, big numbers: add \`overflow-wrap:anywhere\` (and \`hyphens:auto\` where natural) so they never push width.
- Recommended \`line-height\`: 1.05–1.15 for hero titles, 1.2–1.3 for section headers, 1.35–1.45 for body copy.

## Height budget (do the arithmetic before writing CSS)
Plan the vertical stack so the parts sum to ≤ 1350px. Worked example for a body slide:

\`\`\`
logo zone        120px   (logo 88px + 32px gap below)
title block      ~220px  (2 lines @ 84px, line-height 1.1)
content (flex:1) ~770px  ← absorbs the remainder
footer           80px
CTA reserve      160px   (bottom padding for the injected arrow)
-----------------------------
total            1350px  ✓
\`\`\`

If the content does not fit: FIRST shorten the copy, THEN compact the layout (smaller gaps/padding). NEVER reduce font sizes below the minimums (22px / 30px in cards).
````

And the rewritten self-check:

````md
# SELF-CHECK BEFORE RESPONDING (verify each, do the math)

1. First CSS rule is \`box-sizing: border-box\` on \`.canvas\` and all descendants?
2. Root element: \`width:1080px; height:1350px; overflow:hidden\`?
3. Every flex row child has \`min-width:0\`; every flex column child has \`min-height:0\`?
4. Fixed sections (logo, footer) have \`flex-shrink:0\`?
5. No \`100vw/100vh/vmin/vmax\` and no viewport-% sizing anywhere?
6. Long words/numbers protected with \`overflow-wrap:anywhere\`?
7. Height budget summed on paper: logo + title + content + footer + 160px CTA reserve ≤ 1350?
8. All flex-row children fit within usable width (1080 − 2×side-padding)?
9. Background white, all colors via CSS vars, all font sizes ≥ 22px (≥ 30px in cards)?
10. Logo at top center (80–96px); one clear focal point; no CTA arrow in the HTML?
````

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/unit/html/htmlSystemPrompt.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/html/htmlSystemPrompt.ts tests/unit/html/htmlSystemPrompt.test.ts
git commit -m "feat(html): harden renderer prompt for overflow & positioning"
```

---

## Task 7: Content helpers — meter + prompt improvements

**Files:**
- Modify: `src/content/research.ts`
- Modify: `src/content/plan.ts`
- Modify: `src/content/review.ts`

Refactor + prompt-text edits; verified via `npm run build` and existing schema tests.

- [ ] **Step 1: `research.ts` — accept `meter`, record both API shapes, harden prompt**

Add import at top: `import type { UsageMeter } from '@/llm/usage';`

Add `meter?: UsageMeter;` to `ResearchArgs` and thread it into `researchWithoutWeb`'s args type too.

In `researchTopic`, after `const resp = await client.responses.create(...)` record usage:

```ts
    args.meter?.record('research', (resp as { usage?: Record<string, number> }).usage);
```

In `researchWithoutWeb`, add `meter?: UsageMeter;` to its args type, pass `meter: args.meter` from the caller's fallback (`return researchWithoutWeb({ client, model, reasoningEffort, prompt, meter: args.meter })`), and after `const resp = (await args.client.chat.completions.create(...))` add:

```ts
  args.meter?.record('research', resp.usage);
```

Replace `buildResearchPrompt` with the hardened version:

```ts
function buildResearchPrompt(topic: string, instructions: string | undefined, feedback?: string): string {
  const corrections = feedback
    ? `\n\n--- REVISIONE PRECEDENTE DA CORREGGERE ---\nIl dossier precedente è stato bocciato per questi motivi. Correggili in questa versione:\n${feedback}\n`
    : '';
  return `Sei un ricercatore senior di finanza personale e investimenti per Finvestire (contenuti educativi in italiano), rivolto a un pubblico NON esperto.

Approfondisci a fondo il seguente argomento con informazioni aggiornate, affidabili e verificabili:

ARGOMENTO: ${topic}
${instructions ? `\nISTRUZIONI SUL CONTENUTO: ${instructions}\n` : ''}${corrections}
Produci un dossier di ricerca in italiano con QUESTE SEZIONI esplicite:
1. CONCETTI CHIAVE — i concetti necessari, spiegati in modo accessibile a chi parte da zero.
2. DATI E NUMERI — statistiche concrete e recenti. Ogni dato DEVE avere anno e fonte. Se non sei certo dell'aggiornamento, segnalalo esplicitamente con "[da verificare]".
3. ESEMPI E ANALOGIE — almeno 2 esempi pratici o analogie concrete che rendano tangibili i concetti.
4. ERRORI COMUNI — fraintendimenti diffusi da sfatare.
5. ANGOLI E HOOK — 2-3 angoli narrativi forti e ganci d'apertura utilizzabili per un post Instagram.
6. FONTI — le fonti principali consultate.

Regole di qualità:
- Accuratezza prima di tutto: niente affermazioni inventate. Distingui i fatti dalle opinioni.
- Niente contenuto generico o "filler": ogni riga deve essere utile a chi scriverà il post.
- Non scrivere il post: produci solo materiale di ricerca ricco e strutturato.`;
}
```

Update both call sites of `buildResearchPrompt` — the web path builds `const prompt = buildResearchPrompt(topic, instructions);` (keep as is; feedback is added by the orchestrator via a separate param in Task 8's loop — see note). To support feedback, change `researchTopic` to accept an optional `feedback?: string` on `ResearchArgs` and pass it: `const prompt = buildResearchPrompt(topic, instructions, args.feedback);`. Add `feedback?: string;` to `ResearchArgs`.

- [ ] **Step 2: `plan.ts` — accept `meter`, harden brief contract, support feedback**

Add import: `import type { UsageMeter } from '@/llm/usage';`

Add `meter?: UsageMeter;` and `feedback?: string;` to the `planContent` args type.

After `const resp = (await client.chat.completions.create(...))`, add:

```ts
  args.meter?.record('content.plan', resp.usage);
```

Append corrective feedback to the user content. Replace the `userContent` construction:

```ts
  const userContent = `ARGOMENTO: ${topic}
${instructions ? `ISTRUZIONI: ${instructions}\n` : ''}
DOSSIER DI RICERCA:
${research}${args.feedback ? `\n\n--- REVISIONE DEL PIANO PRECEDENTE DA CORREGGERE ---\n${args.feedback}` : ''}`;
```

Strengthen the planner system prompt — replace the paragraph that begins "Per ogni slide scrivi un \"brief\"..." and the "Regole:" block with:

```ts
  return `Sei un content strategist senior per Finvestire (contenuti educativi di finanza in italiano).
Ricevi un dossier di ricerca e pianifichi come strutturare il contenuto in slide per Instagram.

${formatRules}

Per ogni slide scrivi un "brief" AUTOSUFFICIENTE e dettagliato che un agente di design userà per generare la slide. Ogni brief DEVE contenere:
- HEADLINE proposta (testo esatto in italiano) e quali 1-2 parole evidenziare in verde (positivo/crescita) o rosso (rischio/perdita). Non abusare del colore.
- I PUNTI DI CONTENUTO concreti da mostrare, con i DATI specifici presi dal dossier (numeri + anno/fonte quando rilevanti).
- HINT DI LAYOUT: suggerisci la recipe più adatta (cover, numbered-list, compare-2col, kpi-hero, card-grid-2x2, quote, cta).
- TAGLIO: l'angolo emotivo/semantico della slide.
Il brief non deve riferirsi alle altre slide: deve bastare a sé stesso.

Regole:
- UNA idea principale per slide. Non sovraccaricare: meglio poco testo grande che molto testo piccolo (vincolo 1080×1350 senza overflow).
- Arco narrativo: la COVER deve avere un hook fortissimo; le BODY sviluppano in sequenza logica; la CTA chiude con sintesi + invito a seguire/salvare.
- Usa i dati del dossier quando rafforzano il messaggio; niente affermazioni non supportate dalla ricerca.
- Brief in italiano.

Output JSON (ContentPlan):
- title: titolo editoriale del contenuto complessivo
- angle: l'angolo/taglio scelto in 1-2 frasi
- slides: array di { role, brief } nell'ordine di pubblicazione`;
```

- [ ] **Step 3: `review.ts` — accept `meter`, sharpen criteria**

Add import: `import type { UsageMeter } from '@/llm/usage';`

Add `meter?: UsageMeter;` to the `reviewContent` args type.

After `const resp = (await client.chat.completions.create(...))`, add:

```ts
  args.meter?.record('content.review', resp.usage);
```

In `REVIEWER_PROMPT`, add two criteria to the numbered list (after item 5 "Completezza"):

```
6. Aderenza alla ricerca: i dati citati sono coerenti con il dossier e con l'argomento richiesto?
7. Forza editoriale: la cover aggancia davvero? La CTA chiude con un invito chiaro?
```

- [ ] **Step 4: Verify build + content schema tests**

Run: `npm run build`
Expected: no new errors from these files (orchestrate.ts errors from Task 4 may still show — fixed in Task 10).
Run: `npm test -- tests/unit/content/plan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/research.ts src/content/plan.ts src/content/review.ts
git commit -m "feat(content): harden research/plan/review prompts + meter usage"
```

---

## Task 8: `reviewResearch` agent

**Files:**
- Create: `src/content/researchReview.ts`
- Test: `tests/unit/content/researchReview.test.ts`

- [ ] **Step 1: Write the failing schema test**

```ts
// tests/unit/content/researchReview.test.ts
import { describe, it, expect } from 'vitest';
import { ResearchReviewSchema } from '@/content/researchReview';

describe('ResearchReviewSchema', () => {
  it('accepts approved with empty issues', () => {
    expect(ResearchReviewSchema.safeParse({ approved: true, issues: [] }).success).toBe(true);
  });
  it('accepts rejected with issues', () => {
    expect(ResearchReviewSchema.safeParse({ approved: false, issues: ['mancano dati con fonte'] }).success).toBe(true);
  });
  it('rejects missing approved', () => {
    expect(ResearchReviewSchema.safeParse({ issues: [] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/unit/content/researchReview.test.ts`
Expected: FAIL — `Cannot find module '@/content/researchReview'`.

- [ ] **Step 3: Implement**

```ts
// src/content/researchReview.ts
import { z } from 'zod';
import type OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ReasoningEffort } from '@/llm/client';
import type { UsageMeter } from '@/llm/usage';

export const ResearchReviewSchema = z.object({
  approved: z.boolean(),
  issues: z.array(z.string()),
});
export type ResearchReview = z.infer<typeof ResearchReviewSchema>;

const RESEARCH_REVIEWER_PROMPT = `Sei un revisore di ricerca per Finvestire (finanza educativa in italiano).
Valuti un dossier di ricerca PRIMA che venga usato per scrivere un post Instagram.

Controlla:
1. Accuratezza: i fatti sono plausibili e non inventati? Opinioni distinte dai fatti?
2. Completezza: ci sono concetti chiave, dati, esempi, errori comuni, angoli/hook?
3. Dati: i numeri hanno anno/fonte? L'incertezza è segnalata dove serve?
4. Utilità: il materiale è abbastanza ricco e specifico da permettere un post di alto livello?
5. Aderenza: risponde davvero all'argomento e alle istruzioni?

Sii esigente ma equo. Approva se il dossier è solido. Boccia solo per lacune reali.
Output JSON: { "approved": boolean, "issues": string[] }. Se approvato, issues è un array vuoto.`;

export async function reviewResearch(args: {
  client: OpenAI;
  model: string;
  reasoningEffort?: ReasoningEffort;
  topic: string;
  instructions?: string;
  research: string;
  meter?: UsageMeter;
}): Promise<ResearchReview> {
  const jsonSchema = zodToJsonSchema(ResearchReviewSchema, { name: 'ResearchReview', nameStrategy: 'title' });
  const userContent = `ARGOMENTO: ${args.topic}
${args.instructions ? `ISTRUZIONI: ${args.instructions}\n` : ''}
DOSSIER DA VALUTARE:
${args.research}`;

  const request: Record<string, unknown> = {
    model: args.model,
    messages: [
      { role: 'system', content: RESEARCH_REVIEWER_PROMPT },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'ResearchReview', strict: true, schema: jsonSchema } },
  };
  if (args.reasoningEffort) request.reasoning_effort = args.reasoningEffort;

  const resp = (await args.client.chat.completions.create(
    request as unknown as Parameters<typeof args.client.chat.completions.create>[0],
  )) as OpenAI.Chat.Completions.ChatCompletion;
  args.meter?.record('research.review', resp.usage);

  const content = resp.choices[0]?.message?.content;
  if (!content) throw new Error('llm_empty_response');
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error('llm_invalid_json'); }
  const result = ResearchReviewSchema.safeParse(parsed);
  if (!result.success) throw new Error(`llm_schema_mismatch: ${result.error.message}`);
  return result.data;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tests/unit/content/researchReview.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/content/researchReview.ts tests/unit/content/researchReview.test.ts
git commit -m "feat(content): reviewResearch agent"
```

---

## Task 9: `reviewPlan` agent

**Files:**
- Create: `src/content/planReview.ts`
- Test: `tests/unit/content/planReview.test.ts`

- [ ] **Step 1: Write the failing schema test**

```ts
// tests/unit/content/planReview.test.ts
import { describe, it, expect } from 'vitest';
import { PlanReviewSchema } from '@/content/planReview';

describe('PlanReviewSchema', () => {
  it('accepts approved with empty issues and null feedback', () => {
    expect(PlanReviewSchema.safeParse({ approved: true, issues: [], planFeedback: null }).success).toBe(true);
  });
  it('accepts rejected with issues + feedback', () => {
    expect(PlanReviewSchema.safeParse({
      approved: false, issues: ['cover hook debole'], planFeedback: 'Rafforza la cover con un dato shock.',
    }).success).toBe(true);
  });
  it('rejects missing approved', () => {
    expect(PlanReviewSchema.safeParse({ issues: [], planFeedback: null }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/unit/content/planReview.test.ts`
Expected: FAIL — `Cannot find module '@/content/planReview'`.

- [ ] **Step 3: Implement**

```ts
// src/content/planReview.ts
import { z } from 'zod';
import type OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ReasoningEffort } from '@/llm/client';
import type { UsageMeter } from '@/llm/usage';
import type { ContentPlan, ContentFormat } from './plan';

export const PlanReviewSchema = z.object({
  approved: z.boolean(),
  issues: z.array(z.string()),
  planFeedback: z.string().nullable(),
});
export type PlanReview = z.infer<typeof PlanReviewSchema>;

const PLAN_REVIEWER_PROMPT = `Sei un caporedattore di Finvestire. Valuti il PIANO di un contenuto Instagram (la struttura in slide e i brief) PRIMA che le slide vengano generate.

Controlla:
1. Struttura: rispetta il formato richiesto (numero di slide, ruoli cover/body/cta)?
2. Arco narrativo: cover con hook forte → sviluppo logico → cta che chiude con invito?
3. Una idea per slide: nessuna slide sovraccarica; niente ripetizioni tra slide.
4. Qualità dei brief: ogni brief è autosufficiente, con headline, dati concreti, hint di layout, taglio?
5. Aderenza alla ricerca e all'argomento: i brief usano il materiale del dossier e rispondono al tema?
6. Fattibilità: il contenuto di ogni slide è sintetizzabile in 1080×1350 senza overflow?

Sii esigente ma equo. Approva se il piano è solido. Boccia solo per problemi reali.
Se NON approvi, elenca gli issue e fornisci in planFeedback istruzioni concrete e azionabili per rifare il piano.
Output JSON: { "approved": boolean, "issues": string[], "planFeedback": string | null }.
Se approvato, issues è vuoto e planFeedback è null.`;

export async function reviewPlan(args: {
  client: OpenAI;
  model: string;
  reasoningEffort?: ReasoningEffort;
  topic: string;
  instructions?: string;
  format: ContentFormat;
  slideCount?: number;
  research: string;
  plan: ContentPlan;
  meter?: UsageMeter;
}): Promise<PlanReview> {
  const jsonSchema = zodToJsonSchema(PlanReviewSchema, { name: 'PlanReview', nameStrategy: 'title' });
  const slidesText = args.plan.slides
    .map((s, i) => `### Slide ${i} (${s.role})\n${s.brief}`)
    .join('\n\n');
  const userContent = `ARGOMENTO: ${args.topic}
${args.instructions ? `ISTRUZIONI: ${args.instructions}\n` : ''}FORMATO: ${args.format}${args.slideCount ? ` (${args.slideCount} slide)` : ''}

DOSSIER DI RICERCA:
${args.research}

PIANO PROPOSTO — titolo: "${args.plan.title}", angolo: "${args.plan.angle}"
${slidesText}`;

  const request: Record<string, unknown> = {
    model: args.model,
    messages: [
      { role: 'system', content: PLAN_REVIEWER_PROMPT },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'PlanReview', strict: true, schema: jsonSchema } },
  };
  if (args.reasoningEffort) request.reasoning_effort = args.reasoningEffort;

  const resp = (await args.client.chat.completions.create(
    request as unknown as Parameters<typeof args.client.chat.completions.create>[0],
  )) as OpenAI.Chat.Completions.ChatCompletion;
  args.meter?.record('plan.review', resp.usage);

  const content = resp.choices[0]?.message?.content;
  if (!content) throw new Error('llm_empty_response');
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error('llm_invalid_json'); }
  const result = PlanReviewSchema.safeParse(parsed);
  if (!result.success) throw new Error(`llm_schema_mismatch: ${result.error.message}`);
  return result.data;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tests/unit/content/planReview.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/content/planReview.ts tests/unit/content/planReview.test.ts
git commit -m "feat(content): reviewPlan agent"
```

---

## Task 10: Orchestrator — review loops, carousel folder, manifest, usage rollup

**Files:**
- Modify: `src/content/orchestrate.ts`

This is the integration point. It adds the research and plan review loops (best-effort), threads the shared `UsageMeter` into every content agent and each slide pipeline, writes carousel outputs (PNG already written by the renderer into the carousel dir; here we write the HTML files + `manifest.json`), and rolls usage up into a carousel total.

- [ ] **Step 1: Rewrite `src/content/orchestrate.ts`**

Replace the entire file with:

```ts
import path from 'node:path';
import fs from 'node:fs';
import type OpenAI from 'openai';
import type { ReasoningEffort } from '@/llm/client';
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
  const start = Date.now();
  const meter = new UsageMeter();
  const contentWarnings = { research: [] as string[], plan: [] as string[] };

  // ── Phase A: Research + review loop (best effort) ─────────────────────────
  let research: string;
  try {
    research = await researchTopic({ client, model, reasoningEffort, topic, instructions, meter });
    for (let round = 1; round <= MAX_RESEARCH_ROUNDS; round++) {
      const review = await reviewResearch({ client, model, reasoningEffort, topic, instructions, research, meter });
      log.info('content.research.reviewed', { approved: review.approved, issues: review.issues.length, round });
      if (review.approved || review.issues.length === 0) break;
      if (round === MAX_RESEARCH_ROUNDS) { contentWarnings.research = review.issues; break; }
      research = await researchTopic({ client, model, reasoningEffort, topic, instructions, feedback: review.issues.join('; '), meter });
    }
  } catch (err) {
    return { ok: false, code: 'LLM_FAILURE', detail: `research: ${(err as Error).message}` };
  }

  // ── Phase B: Plan + review loop (best effort) ─────────────────────────────
  let plan: ContentPlan;
  try {
    plan = await planContent({ client, model, reasoningEffort, format, slideCount, topic, instructions, research, meter });
    for (let round = 1; round <= MAX_PLAN_ROUNDS; round++) {
      const review = await reviewPlan({ client, model, reasoningEffort, topic, instructions, format, slideCount, research, plan, meter });
      log.info('content.plan.reviewed', { approved: review.approved, issues: review.issues.length, round });
      if (review.approved || review.issues.length === 0) break;
      if (round === MAX_PLAN_ROUNDS) { contentWarnings.plan = review.issues; break; }
      const feedback = review.planFeedback ?? review.issues.join('; ');
      plan = await planContent({ client, model, reasoningEffort, format, slideCount, topic, instructions, research, feedback, meter });
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

  // ── Phase C: Per-slide generation (4-agent pipeline) ──────────────────────
  const states: SlideState[] = [];
  for (let i = 0; i < plan.slides.length; i++) {
    const planned = plan.slides[i];
    const result = await generateOneSlide(args, planned.role, planned.brief, [], slideOutput(i));
    if (!result.ok) {
      return { ok: false, code: result.code === 'LLM_FAILURE' ? 'LLM_FAILURE' : 'SLIDE_GENERATION_FAILED', detail: { slideIndex: i, ...(result as object) } };
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
      review = await reviewContent({ client, model, reasoningEffort, topic, instructions, title: plan.title, angle: plan.angle, slides: reviewable, meter });
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
      const regenerated = await generateOneSlide(args, state.role, state.baseBrief, state.fixes, slideOutput(fix.slideIndex));
      if (!regenerated.ok) {
        return { ok: false, code: regenerated.code === 'LLM_FAILURE' ? 'LLM_FAILURE' : 'SLIDE_GENERATION_FAILED', detail: { slideIndex: fix.slideIndex, ...(regenerated as object) } };
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
    writeCarouselArtifacts({ carouselId: carouselId!, carouselDir, topic, format, plan, research, usage, contentWarnings, states });
  }

  return {
    ok: true,
    carouselId, carouselDir,
    topic, format, title: plan.title, angle: plan.angle, research,
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
  });
}
```

> Note: `PipelineFailure.code` is only `'LLM_FAILURE'`, so the `result.code === 'LLM_FAILURE' ? ...` checks always pick `LLM_FAILURE`. They are written defensively so adding future failure codes maps them to `SLIDE_GENERATION_FAILED` automatically.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: type errors now only in `src/server/routes.ts` `mountContentRoutes` (uses `result.slides[].qualityWarnings` indirectly and old fields) — fixed in Task 11.

- [ ] **Step 3: Commit**

```bash
git add src/content/orchestrate.ts
git commit -m "feat(content): research/plan review loops, carousel folder + manifest, usage rollup"
```

---

## Task 11: Update `/generate/content` route + integration test

**Files:**
- Modify: `src/server/routes.ts` (`mountContentRoutes`, lines ~205–246)
- Modify: `tests/integration/generateContent.test.ts`

- [ ] **Step 1: Update the route response**

In `mountContentRoutes`, replace the `res.json({...})` body with:

```ts
      res.json({
        carouselId: result.carouselId,
        carouselDir: result.carouselDir,
        topic: result.topic,
        format: result.format,
        title: result.title,
        angle: result.angle,
        files: result.slides.map((s) => s.file),
        slides: result.slides,
        reviewRounds: result.reviewRounds,
        contentWarnings: result.contentWarnings,
        usage: result.usage,
        durationMs: result.durationMs,
      });
```

(The `if (!result.ok)` branch stays; `SLIDE_GENERATION_FAILED` and `LLM_FAILURE` already map in `errors.ts`.)

- [ ] **Step 2: Update the integration test mocks**

In `tests/integration/generateContent.test.ts`:

Replace `pipelineSuccess` (lines 16–27) to include the new fields:

```ts
function pipelineSuccess(file: string) {
  return {
    ok: true as const,
    file,
    html: '<!DOCTYPE html>',
    intent: 'intent',
    designSpec: DESIGN_SPEC,
    warnings: [],
    attempts: { design: 1, render: 1 },
    durationMs: { llm: 1, render: 1, total: 2 },
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, calls: 4 },
  };
}
```

Add mocks for the two new review agents (after the `@/content/plan` mock, before the `@/content/review` mock):

```ts
vi.mock('@/content/researchReview', () => ({
  reviewResearch: vi.fn(async () => ({ approved: true, issues: [] })),
}));

vi.mock('@/content/planReview', () => ({
  reviewPlan: vi.fn(async () => ({ approved: true, issues: [], planFeedback: null })),
}));
```

Update the first test's assertions (the `generates a carousel` test) to also check usage and carouselId:

```ts
    expect(res.body.usage.totalTokens).toBeGreaterThan(0);
    expect(res.body.carouselId).toBeTruthy();
```

Replace the `returns 422 slide_generation_failed` test's mock to use `LLM_FAILURE` (since a real pipeline can no longer emit OVERFLOW_UNRESOLVED, and the orchestrator maps any non-LLM failure to SLIDE_GENERATION_FAILED — but for the test we assert the SLIDE_GENERATION_FAILED mapping with a non-LLM code). Replace that test body with:

```ts
  it('returns 422 slide_generation_failed when a slide pipeline fails (non-LLM)', async () => {
    const { runSlidePipeline } = await import('@/html/pipeline');
    (runSlidePipeline as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      code: 'RENDER_FAILURE',
      detail: { reason: 'browser crash' },
    });

    const res = await request(buildApp())
      .post('/generate/content')
      .send({ topic: 'x', format: 'carousel', slideCount: 3 });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('slide_generation_failed');
    expect(res.body.slideIndex).toBe(0);
  });
```

> The orchestrator's ternary maps any code other than `LLM_FAILURE` to `SLIDE_GENERATION_FAILED`, so a synthetic `RENDER_FAILURE` exercises that path.

- [ ] **Step 3: Set OUTPUT_DIR to a temp dir for the carousel-writing test**

At the top of `tests/integration/generateContent.test.ts`, after the imports of `describe`/etc., add a temp output dir so the manifest write does not pollute the repo. Add near the top (before the `vi.mock` calls):

```ts
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.OUTPUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'instapilot-test-'));
```

Add an assertion in the carousel test that the manifest was written:

```ts
    const manifestPath = path.join(process.env.OUTPUT_DIR!, `carousel-${res.body.carouselId}`, 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.slides).toHaveLength(3);
    expect(manifest.slides[0].htmlFile).toBe('slide-01.html');
```

> Because `runSlidePipeline` is mocked, the per-slide PNGs are not actually rendered; the manifest still references their basenames and the HTML files ARE written by the orchestrator from `result.html`. The assertion checks the manifest + html-file writing path.

- [ ] **Step 4: Run the test**

Run: `npm test -- tests/integration/generateContent.test.ts`
Expected: PASS (all tests, including the new carousel manifest assertions).

- [ ] **Step 5: Commit**

```bash
git add src/server/routes.ts tests/integration/generateContent.test.ts
git commit -m "feat(api): /generate/content returns usage + carouselId, writes manifest"
```

---

## Task 12: Env documentation

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Update the HTML + content retry vars**

In `.env.example`, replace lines 19–20 and the content section to reflect new defaults and add the two new vars:

```
# HTML_MAX_DESIGN_RETRIES=3        # retry sul design se l'agente 2 lo boccia (default: 3)
# HTML_MAX_ATTEMPTS=5               # retry su overflow / quality review (default: 5)
# HTML_RENDER_TIMEOUT_MS=15000      # timeout render Playwright (default: 15000)
```

Add near the existing `CONTENT_MAX_REVIEW_ROUNDS` line:

```
# CONTENT_MAX_RESEARCH_ROUNDS=2     # giri di revisione del dossier di ricerca (default: 2)
# CONTENT_MAX_PLAN_ROUNDS=2         # giri di revisione del piano contenuti (default: 2)
# CONTENT_MAX_REVIEW_ROUNDS=2       # giri di revisione editoriale finale (default: 2)
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs(env): new retry/review-round defaults for HTML & content pipeline"
```

---

## Final verification

- [ ] **Run the full suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Type-check**

Run: `npm run build`
Expected: no errors.

- [ ] **Manual smoke (optional, requires LLM creds + Playwright)**

Run the dev server (`npm run dev`) and POST a carousel to `/generate/content`; confirm `output/carousel-<id>/` contains `slide-01.png … slide-NN.png`, matching `.html` files, and `manifest.json` with a populated `usage.totalTokens`. Check logs for `pipeline.usage` and `content.usage` events.

---

## Self-Review notes (spec coverage)

- Spec §1 best-effort → Tasks 3, 4 (+ route/test updates 5, 11).
- Spec §2 token logging → Tasks 1, 2, 7, 10 (meter threading + `pipeline.usage`/`content.usage` logs).
- Spec §3 carousel folder + manifest → Tasks 3 (output opts), 10 (folder + manifest), 11 (route + test).
- Spec §4 prompt hardening → Task 6.
- Spec §5 research/plan/review prompt improvements → Task 7.
- Spec §6 new research/plan review loops → Tasks 8, 9, 10.
- Env (new vars + changed defaults) → Tasks 4 (code defaults), 12 (docs).
- `PipelineWarning` union (`design-review`/`overflow`/`quality`/`invalid-html`) is defined once in Task 4 and consumed consistently in Tasks 5, 10, 11.
