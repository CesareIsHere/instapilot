# Carousel Narrative Method & Narrative-Aware Review

**Date:** 2026-06-01
**Status:** Approved (design)

## Goal

Make the content pipeline produce carousels that follow proven Instagram narrative methods (SWIPE and siblings), and make the reviewers evaluate **narrative context** — including the fact that the last/CTA slide must not show the swipe arrow. Five areas:

1. **Fix the CTA arrow** — it is shell-injected on every slide; make injection conditional so the last/CTA slide (and single posts) have no swipe arrow.
2. **Narrative layer over roles** — keep `cover|body|cta` as rendering roles; add a `framework` (carousel) and per-slide `narrativeFunction` chosen by the planner.
3. **Carousel knowledge into the planner** — a distilled catalog of narrative frameworks + SWIPE rules (foreshadowing, mini-loops, payoff, single CTA), default 7 slides.
4. **Quality reviewer (Agent 4) narrative awareness** — give it slide role/position/narrativeFunction context; it evaluates whether each slide's content fits its slide type and flags a swipe arrow on the last/CTA slide.
5. **Plan & editorial reviewers** — validate method adherence (framework fit, foreshadowing, loop closure, payoff-before-CTA, single CTA, rhythm).

## Non-goals

- No expansion of the rendering `SlideRole` type (`cover|body|cta` stays).
- No change to layout recipes.
- The recurring `:root`/hardcoded-hex renderer warning is out of scope here.
- No image-generation (`visual hint` AI prompts from the source material are not implemented).

---

## A. CTA arrow fix (`src/html/template.ts`, `src/html/pipeline.ts`, routes)

The arrow lives in `buildHtmlDocument` as a `.canvas::after` rule, injected unconditionally. Agent 3 cannot remove it (not in its CSS), so the fix lives in the shell.

- `buildHtmlDocument(bodyHtml: string, css: string, showArrow = true): string` — the `.canvas::after` block is emitted only when `showArrow` is true. Default `true` preserves existing callers/tests.
- `PipelineArgs.showCtaArrow?: boolean`. In `runSlidePipeline`, compute `const showArrow = args.showCtaArrow ?? true;` and pass it into `buildHtmlDocument(...)`.
- Orchestrator sets it per slide:
  - carousel → `showCtaArrow = index < total - 1` (arrow on all but the last)
  - single post → `showCtaArrow = false`
- `/render/html` route → pass `showCtaArrow: false` (a standalone slide has no next).

Result: the last/CTA slide and single posts never render the swipe arrow.

---

## B. Narrative layer over roles (`src/content/plan.ts`)

Extend the plan schema (rendering roles unchanged):

- `ContentPlanSchema.framework: z.string()` — the chosen narrative structure (e.g. `"SWIPE"`, `"3-ACT"`, `"SRL"`, `"A-vs-B"`, `"case-study"`, `"list"`, `"step-by-step"`).
- `PlannedSlideSchema.narrativeFunction: z.string()` — the slide's function in the structure (e.g. `"hook"`, `"why"`, `"inform"`, `"payoff"`, `"cta"`, `"setup"`, `"conflict"`, `"solution"`, `"loop-open"`, `"loop-close"`).

Both are free strings (frameworks vary); the planner prompt documents the expected vocabulary. They flow: planner → orchestrator → `runSlidePipeline` → `reviewRenderedSlide` and into `manifest.json`.

For a `single` post the planner still returns one slide; `framework` may be `"single"` and `narrativeFunction` `"hook"`.

---

## C. Carousel knowledge in the planner prompt (`src/content/plan.ts`)

Add a distilled (not verbatim) block to `buildPlannerSystemPrompt` covering:

**Framework catalog — "when to use":**
- **SWIPE** (Hook → Why → Inform×3 → Payoff → CTA) — mechanisms, principles, how-things-work, complex concepts. Default.
- **3-ACT** (Setup → Conflict → Solution → Application) — real/plausible stories, mistakes, mindset, before→after.
- **SRL** (Shock → Reveal → Lesson) — myth-busting, counterintuitive truths, biases.
- **3ACT-2.0** (Problem → Analysis → Solution → Application) — concrete user problems, habits, budgeting.
- **3ACT-3.0** (Question → Path → Answer) — a real audience question, A-vs-B choices, clarifications.
- **A-vs-B** — comparison of two confused concepts.
- **case-study** — start from a real case to explain a general concept.
- **list** ("X things for…") — one element per slide.
- **step-by-step / roadmap** — one step per slide, A → B.
- **framework→breakdown→application** — show a framework via a real example.

**SWIPE / narrative rules (apply to whichever framework):**
- Cover = strong hook + clear promise; minimal text.
- **Foreshadowing**: cover and slide 2 must be coherent (slide 2 = why it matters / opens the main loop).
- **Mini-loops**: open a question, close it within 1–2 slides.
- **Payoff**: a 3–4 bullet recap on the **penultimate** slide, before the CTA; closes all loops and echoes the cover.
- **CTA**: exactly one, clear, only on the **last** slide.
- Default 7 slides (range 6–9); one idea per slide; text concise (fits 1080×1350 without overflow).

**Per-slide brief** must additionally state the slide's `narrativeFunction` and whether it opens/closes a loop.

---

## D. Quality reviewer narrative awareness (`src/html/qualityReview.ts`, `src/html/pipeline.ts`)

`reviewRenderedSlide` gains a `slideContext` arg:

```ts
slideContext?: {
  role: SlideRole;
  narrativeFunction?: string;
  index?: number;     // 0-based
  total?: number;     // total slides in the carousel (absent for single)
  isLast?: boolean;
};
```

`runSlidePipeline` builds this from new `PipelineArgs` fields (`narrativeFunction?`, `slideIndex?`, `slideTotal?`, derived `isLast`) and passes it through; the orchestrator supplies them per slide.

New prompt section — **NARRATIVE / SLIDE-TYPE REVIEW** — instructs the reviewer to act as an expert evaluating whether the rendered content fits the slide's type/function:
- cover/hook → strong hook, minimal text, single focal point (not a dense body).
- inform → one clear idea, density appropriate to the recipe.
- payoff → concise recap (bullets), echoes the cover, no new topic.
- cta → one clear call-to-action/invite; closing tone.
- **Swipe arrow rule:** on the **last/CTA slide** there must be NO bottom-right swipe arrow → flag it (category `layout`) if visible. On non-last slides the arrow is expected; do not flag its presence.

The context is provided in the user message so the model knows position/role.

---

## E. Plan & editorial reviewers (`src/content/planReview.ts`, `src/content/review.ts`)

- **`reviewPlan`** prompt adds method-adherence criteria: chosen `framework` fits the content; cover↔slide-2 foreshadowing; every opened loop closed within 1–2 slides; a payoff recap on the penultimate slide; exactly one CTA, on the last slide; slide count/rhythm reasonable (≈7). It receives `plan.framework` and per-slide `narrativeFunction` in the user content.
- **`reviewContent`** (editorial) adds the same narrative lens applied to generated slides: foreshadowing coherence, loops closed, payoff present, single clear CTA.

---

## F. Slide count default (`src/server/routes.ts`)

Carousel default **7**, clamped to **6–9** in the body transform. Single stays 1. Raw schema stays permissive (`min(3).max(10)`); the transform clamps carousel into `[6, 9]` with default 7.

---

## Affected files

| File | Change |
|---|---|
| `src/html/template.ts` | `buildHtmlDocument(bodyHtml, css, showArrow=true)`, conditional arrow |
| `src/html/pipeline.ts` | `showCtaArrow?`, `narrativeFunction?`, `slideIndex?`, `slideTotal?`; pass showArrow + slideContext |
| `src/html/qualityReview.ts` | `slideContext` arg + narrative/slide-type review section + arrow rule |
| `src/content/plan.ts` | schema `framework` + `narrativeFunction`; framework catalog + SWIPE rules in prompt |
| `src/content/planReview.ts` | method-adherence criteria; receives framework + narrativeFunction |
| `src/content/review.ts` | narrative-lens criteria |
| `src/content/orchestrate.ts` | pass framework/narrativeFunction/position/showCtaArrow into pipeline; manifest carries framework + per-slide narrativeFunction |
| `src/server/routes.ts` | `/render/html` showCtaArrow:false; carousel slideCount default 7 clamp 6–9 |
| Tests | template (arrow toggle), pipeline (showArrow + slideContext pass-through), plan/planReview schema (framework + narrativeFunction), qualityReview schema unaffected, generateContent integration (framework in manifest) |

## Testing

- `template.test.ts`: arrow present when `showArrow` true/omitted; absent when false.
- `pipeline.test.ts`: `showCtaArrow:false` → `buildHtmlDocument` called with `false`; `slideContext` (role/narrativeFunction/isLast) forwarded to `reviewRenderedSlide`.
- `plan.test.ts`: `ContentPlanSchema` requires `framework`; `PlannedSlideSchema` requires `narrativeFunction`; rejects when missing.
- `planReview.test.ts`: unchanged schema; still valid.
- `generateContent.test.ts`: mocks updated with `framework`/`narrativeFunction`; manifest contains `framework` and per-slide `narrativeFunction`; last carousel slide gets `showCtaArrow:false` passed to the pipeline.

## Risks

- Adding required schema fields (`framework`, `narrativeFunction`) breaks existing mocks/tests — updated as part of the work.
- Larger planner prompt increases tokens per plan call — acceptable; it is one call per plan round.
- `showArrow` default `true` keeps backward compatibility for the standalone template test.
