# HTML Pipeline — Robustness, Cost Logging, Carousels & Prompt Hardening

**Date:** 2026-05-31
**Status:** Approved (design)

## Goal

Render the HTML/content pipeline more robust and observable. Six areas of work:

1. **Best-effort pipeline** — the slide pipeline must always produce a result; "review not passed" / "overflow unresolved" must no longer be terminal failures.
2. **Token logging** — log how many tokens each post/carousel consumed (per-agent + total). No dollar pricing for now (structured so $ can be added later as a multiplication).
3. **Carousels saved together** — each carousel goes into its own `output/carousel-<id>/` folder with PNGs + HTML + a `manifest.json`.
4. **HTML renderer prompt hardening** — make the HTML-generating agent meticulous about overflow and positioning.
5. **Improve content prompts** — research, plan, and final editorial review agents.
6. **New review loops** — add best-effort review loops on research and on plan, before slide generation.

## Non-goals

- No dollar/cost pricing table (tokens only).
- No change to the single `/render/html` output layout (stays flat: `output/HtmlSlide-<id>.png`).
- No new editorial features beyond the review loops described.

---

## 1. Best-effort pipeline (`src/html/pipeline.ts`)

Today `runSlidePipeline` returns `ok: false` in three places: `DESIGN_REVIEW_FAILED`, `OVERFLOW_UNRESOLVED`, `INVALID_HTML`. These stop being terminal failures.

- **Design review failed after retries** → keep the last generated `spec`, proceed to the render phase, and append a `design-review` warning.
- **Overflow unresolved after retries** → on the final attempt, force a screenshot anyway (clip 1080×1350, content possibly clipped) and return `ok: true` with an `overflow` warning.
- **Invalid HTML** (`<script>`, remote URLs, etc.) → no longer fatal on first occurrence. The validation error becomes corrective feedback and re-enters the render retry loop (like overflow). In practice this almost always resolves within the retries.
- **Only remaining failure:** `LLM_FAILURE` (API unreachable). Without the LLM nothing can be produced — unavoidable.

### Type changes

- `renderHtmlStill(html, outputId, opts?)` gains an optional `force?: boolean`. When `force` is true and overflow is detected, it still takes the screenshot and returns `ok: true` (the overflow info is surfaced separately so the caller can warn).
- `PipelineSuccess` replaces `qualityWarnings: QualityIssue[]` with a unified:
  ```ts
  warnings: PipelineWarning[]
  // PipelineWarning = { kind: 'design-review' | 'overflow' | 'quality'; detail: unknown }
  ```
- `PipelineFailure.code` narrows to `'LLM_FAILURE'` only.
- `PipelineSuccess` gains `usage: UsageTotals` (see §2).

### Retry defaults (configurable)

- `HTML_MAX_DESIGN_RETRIES` default **2 → 3**
- `HTML_MAX_ATTEMPTS` default **3 → 5**

---

## 2. Token logging (`src/llm/usage.ts` — new)

A small `UsageMeter` accumulates token usage across all LLM calls in a run.

```ts
interface UsageRecord {
  label: string;          // 'design.plan', 'html.generate', 'research', ...
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
}

class UsageMeter {
  record(label: string, usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }): void;
  get records(): UsageRecord[];
  get totals(): UsageTotals;
}
```

- Each LLM helper (`planSlideDesign`, `reviewSlideDesign`, `generateSlideHtml`, `reviewRenderedSlide`, `researchTopic`, `planContent`, `reviewContent`, plus the new `reviewResearch` / `reviewPlan`) accepts an optional `meter?: UsageMeter` and calls `meter.record(label, response.usage)` after each call.
- `runSlidePipeline` creates one meter, threads it into the design/render/quality helpers, logs `log.info('pipeline.usage', { breakdown, total })`, and returns `usage: meter.totals` on the success object.
- `generateContent` creates a parent meter for the whole run (research + plan + reviews + every slide pipeline). It passes the same meter into each `runSlidePipeline` call so per-slide token usage rolls up into the carousel total. At the end: `log.info('content.usage', { perSlide, total })`.
- Designed so a future price table (`input/output $ per 1M tokens` per model) is a pure multiplication over `UsageTotals` — not implemented now.

Missing `usage` on a response (e.g. the web-search Responses API path) is recorded as zeros and counted as a call.

---

## 3. Carousels in a dedicated folder (`src/content/orchestrate.ts`, `src/html/renderHtml.ts`)

- At the start of `generateContent`, generate `carouselId = shortId()` → directory `output/carousel-<carouselId>/`.
- `PipelineArgs` gains an optional `output?: { dir?: string; fileName?: string }`. Default (single `/render/html`) keeps `output/HtmlSlide-<outputId>.png`.
- `renderHtmlStill` resolves its output path from these opts instead of always `OUTPUT_DIR + HtmlSlide-<id>.png`.
- Each carousel slide renders to `output/carousel-<id>/slide-01.png`, `slide-02.png`, … (zero-padded, 1-based, publication order).
- After all slides are generated (and after the final editorial review loop), write for each slide `slide-01.html`, … and a `manifest.json`:
  ```jsonc
  {
    "carouselId": "...",
    "topic": "...",
    "format": "carousel",
    "title": "...",
    "angle": "...",
    "createdAt": "ISO-8601",
    "usage": { "promptTokens": 0, "completionTokens": 0, "totalTokens": 0, "calls": 0 },
    "warnings": { "research": [], "plan": [] },
    "research": "full dossier text",
    "slides": [
      {
        "index": 0,
        "role": "cover",
        "file": "slide-01.png",
        "htmlFile": "slide-01.html",
        "intent": "...",
        "designSpec": { /* SlideDesignSpec */ },
        "attempts": { "design": 1, "render": 2 },
        "warnings": [ /* PipelineWarning[] */ ],
        "usage": { /* per-slide UsageTotals */ }
      }
    ]
  }
  ```
- `slides[].file` / `htmlFile` are relative to the carousel folder so it is self-contained and movable.
- A `single` post (`format: 'single'`) does **not** get a carousel folder — it stays flat (unchanged behavior), unless we later decide otherwise.

---

## 4. HTML renderer prompt hardening (`src/html/htmlSystemPrompt.ts`)

Reinforce the spots that actually cause overflow / mispositioning:

- **`box-sizing: border-box`** required on everything (scoped under `.canvas`) — the #1 cause of padding-driven overflow.
- **`min-width: 0` / `min-height: 0`** on flex children — the classic flexbox overflow gotcha.
- Forbid `100vw` / `100vh` and any viewport-relative units; always fixed 1080 / 1350.
- Explicit text-wrapping rules: `overflow-wrap: anywhere` for long words/numbers; recommended `line-height` per size band.
- A **worked arithmetic example** of the height budget (logo 120 + title 200 + content + footer 80 + CTA zone 160 ≤ 1350) instead of just the formula.
- No fixed heights that don't sum; prefer flex with `flex-shrink: 0` on fixed sections.
- Rewritten final self-check with explicit arithmetic checks + a positioning checklist (logo top-center, single focal point, gutters via `gap`).
- When the `OVERFLOW` feedback arrives, prioritized remediation steps (shorten copy first, then compact the layout, never below the size minimums).

---

## 5. Improve content prompts (`src/content/{research,plan,review}.ts`)

- **Research**: stricter prompt — mandatory structured sections, numeric data always with year/source, explicit uncertainty flagging, framing for a non-expert audience, request strong usable hooks/angles, no generic filler.
- **Plan**: tighter brief contract — each brief self-sufficient with proposed headline + color semantics (which words green/red), specific data points from the research, a recipe/layout hint, emotional angle. Reinforce narrative arc, one-idea-per-slide, no cross-slide references, strong hook on cover and CTA.
- **Final review**: sharpen criteria + add explicit research/plan adherence checks.

---

## 6. New review loops on research and plan (`src/content/orchestrate.ts` + new files)

Consistent with the "always a result" philosophy — these never hard-fail; after the max rounds they ship best-effort with a warning.

- **`reviewResearch`** (new, `src/content/researchReview.ts`): evaluates the dossier (accuracy, completeness, concrete data, sources, misconceptions). Returns `{ approved, issues[] }`. Loop `CONTENT_MAX_RESEARCH_ROUNDS` (default 2): on rejection, issues feed back to `researchTopic` as corrective feedback. After max rounds → keep best dossier + `warnings.research`.
- **`reviewPlan`** (new, `src/content/planReview.ts`): evaluates the `ContentPlan` (structure, brief quality, research adherence, narrative flow, one-idea-per-slide, format/slideCount compliance). Returns `{ approved, issues[], planFeedback }`. Loop `CONTENT_MAX_PLAN_ROUNDS` (default 2): on rejection, feeds back to `planContent`. After max rounds → keep best plan + `warnings.plan`.

### New flow in `generateContent`

```
research → reviewResearch (loop)
  → plan → reviewPlan (loop)
    → per-slide generation (existing 4-agent pipeline)
      → final editorial review (loop, existing)
```

All new calls record into the shared `UsageMeter`. Research/plan warnings are surfaced in the content result and in `manifest.json`.

### New env vars

- `CONTENT_MAX_RESEARCH_ROUNDS=2`
- `CONTENT_MAX_PLAN_ROUNDS=2`
- (existing `CONTENT_MAX_REVIEW_ROUNDS` unchanged)

---

## Affected files

| File | Change |
|---|---|
| `src/html/pipeline.ts` | Best-effort flow, unified warnings, usage threading, output opts, retry defaults |
| `src/html/renderHtml.ts` | `force` screenshot on overflow; configurable output dir/filename |
| `src/html/htmlSystemPrompt.ts` | Prompt hardening (overflow/positioning) |
| `src/html/generateHtml.ts`, `designSpec.ts`, `qualityReview.ts` | Accept `meter`, record usage |
| `src/llm/usage.ts` | **New** — `UsageMeter` |
| `src/content/orchestrate.ts` | New review loops, carousel folder + manifest, usage rollup |
| `src/content/research.ts` | Prompt hardening + accept `meter` |
| `src/content/plan.ts` | Prompt hardening + accept `meter` |
| `src/content/review.ts` | Prompt sharpening + accept `meter` |
| `src/content/researchReview.ts` | **New** — `reviewResearch` |
| `src/content/planReview.ts` | **New** — `reviewPlan` |
| `src/server/routes.ts`, `errors.ts` | Adapt to narrowed failure codes & new result shape |
| `.env` / env docs | New + changed defaults |

## Testing

- Unit: `UsageMeter` accumulation & totals (incl. missing-usage → zeros).
- Unit: pipeline best-effort branches — design-review-exhausted, overflow-forced, invalid-html-retried — assert `ok: true` + correct warning kind (mock LLM + render).
- Unit: `reviewResearch` / `reviewPlan` loops — rejection feeds back, max-rounds ships best-effort with warning.
- Integration: carousel run writes `output/carousel-<id>/` with N PNGs, N HTML files, and a valid `manifest.json`.
- Existing tests adapted to the new `warnings` field and narrowed `PipelineFailure`.

## Risks / open points

- Higher retry/review counts increase latency and token spend per post — acceptable per requirements; mitigated by env configurability.
- Forced screenshot on unresolved overflow ships a visually clipped slide; surfaced via warning so callers can decide.
- Web-search research path (Responses API) may not expose `usage`; counted as a zero-token call (documented).
