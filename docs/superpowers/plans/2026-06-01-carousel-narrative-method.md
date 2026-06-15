# Carousel Narrative Method Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carousels follow proven Instagram narrative methods (SWIPE & siblings), the last/CTA slide no longer shows the swipe arrow, and the reviewers evaluate narrative/slide-type appropriateness.

**Architecture:** Keep `cover|body|cta` as rendering roles; add a `framework` (carousel) and per-slide `narrativeFunction` chosen by the planner. The shell's CTA arrow becomes conditional (`buildHtmlDocument(.., showArrow)`), driven through the pipeline (`showCtaArrow`) and orchestrator (arrow on all but last slide). The quality reviewer receives slide role/position/narrativeFunction context and judges slide-type fit + flags an arrow on the last slide. Plan/editorial reviewers gain method-adherence criteria.

**Tech Stack:** TypeScript (ESM), Express, Zod, OpenAI SDK, Playwright, Vitest. Path alias `@/* → src/*`. Tests in `tests/{unit,integration}`, run with `npm test`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/html/template.ts` | `buildHtmlDocument(bodyHtml, css, showArrow=true)` — conditional `.canvas::after` arrow |
| `src/html/pipeline.ts` | `showCtaArrow?`, `narrativeFunction?`, `slideIndex?`, `slideTotal?`; pass `showArrow` + `slideContext` |
| `src/html/qualityReview.ts` | `slideContext` arg + narrative/slide-type review section + arrow rule |
| `src/content/plan.ts` | schema `framework` + `narrativeFunction`; framework catalog + SWIPE rules in prompt |
| `src/content/planReview.ts` | method-adherence criteria; receives framework + narrativeFunction |
| `src/content/review.ts` | narrative-lens criteria |
| `src/content/orchestrate.ts` | thread framework/narrativeFunction/position/showCtaArrow; manifest carries framework + per-slide narrativeFunction |
| `src/server/routes.ts` | `/render/html` `showCtaArrow:false`; carousel `slideCount` default 7 clamp 6–9 |
| Tests | template, pipeline, plan, generateContent integration |

---

## Task 1: Conditional CTA arrow in the shell template

**Files:**
- Modify: `src/html/template.ts`
- Test: `tests/unit/html/template.test.ts`

- [ ] **Step 1: Write the failing test (append to the existing describe block)**

Read `tests/unit/html/template.test.ts` first. Add these tests inside the existing top-level `describe`:

```ts
  it('includes the CTA arrow by default', () => {
    const html = buildHtmlDocument('<div></div>', '.canvas{}');
    expect(html).toContain('.canvas::after');
    expect(html).toContain("content: '→'");
  });

  it('includes the CTA arrow when showArrow is true', () => {
    const html = buildHtmlDocument('<div></div>', '.canvas{}', true);
    expect(html).toContain('.canvas::after');
  });

  it('omits the CTA arrow when showArrow is false', () => {
    const html = buildHtmlDocument('<div></div>', '.canvas{}', false);
    expect(html).not.toContain('.canvas::after');
    expect(html).not.toContain("content: '→'");
  });
```

(If the file imports `buildHtmlDocument` already, reuse it; otherwise add `import { buildHtmlDocument } from '@/html/template';`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/unit/html/template.test.ts`
Expected: FAIL — the `showArrow:false` test fails because the arrow is always present.

- [ ] **Step 3: Make the arrow conditional**

In `src/html/template.ts`, change the signature:

```ts
export function buildHtmlDocument(bodyHtml: string, css: string, showArrow = true): string {
```

Extract the arrow CSS into a local variable and interpolate it conditionally. Replace the hard-coded `.canvas::after { ... }` block (the comment line `/* CTA arrow — present on every slide, bottom-right */` and the rule that follows it) with a `${ctaArrowCss}` interpolation, and define `ctaArrowCss` near the top of the function body (after `const sp = theme.spacing;`):

```ts
  const ctaArrowCss = showArrow
    ? `/* CTA arrow — swipe affordance, bottom-right (omitted on the last slide) */
.canvas::after {
  content: '→';
  position: absolute;
  bottom: 48px;
  right: 56px;
  width: 88px;
  height: 88px;
  border-radius: 50%;
  border: 3px solid var(--brand-navy);
  color: var(--brand-navy);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
  font-family: var(--font-family);
  font-weight: 700;
  line-height: 1;
  pointer-events: none;
}`
    : '';
```

Then in the returned template literal, replace the old arrow block (lines with the comment + `.canvas::after { ... }`) with:

```
${ctaArrowCss}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tests/unit/html/template.test.ts`
Expected: PASS (existing tests + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/html/template.ts tests/unit/html/template.test.ts
git commit -m "feat(html): make CTA swipe arrow conditional (showArrow)"
```

---

## Task 2: Pipeline — `showCtaArrow` + narrative slide context

**Files:**
- Modify: `src/html/pipeline.ts`
- Test: `tests/unit/html/pipeline.test.ts`

- [ ] **Step 1: Write failing tests (append after the existing tests)**

Read `tests/unit/html/pipeline.test.ts`. The test mocks `@/html/template` as `{ buildHtmlDocument: vi.fn(() => '<html>doc</html>') }`. Add a reference to that mock at the top of the file where the other mock fns are declared. Find the existing line:

```ts
vi.mock('@/html/template', () => ({ buildHtmlDocument: vi.fn(() => '<html>doc</html>') }));
```

Replace it with a captured mock:

```ts
const buildHtmlDocument = vi.fn(() => '<html>doc</html>');
vi.mock('@/html/template', () => ({ buildHtmlDocument }));
```

And add an import so it can be referenced (it is already module-scoped via the const). Then append these tests inside the `describe`:

```ts
  it('omits the arrow when showCtaArrow is false', async () => {
    await runSlidePipeline({ ...baseArgs, showCtaArrow: false } as never);
    // buildHtmlDocument(bodyHtml, css, showArrow)
    expect(buildHtmlDocument.mock.calls[0][2]).toBe(false);
  });

  it('defaults showArrow to true when showCtaArrow is omitted', async () => {
    await runSlidePipeline(baseArgs as never);
    expect(buildHtmlDocument.mock.calls[0][2]).toBe(true);
  });

  it('forwards narrative slide context to the quality reviewer', async () => {
    await runSlidePipeline({
      ...baseArgs, role: 'cta', narrativeFunction: 'cta', slideIndex: 4, slideTotal: 5,
    } as never);
    const reviewArgs = reviewRenderedSlide.mock.calls[0][0];
    expect(reviewArgs.slideContext).toMatchObject({
      role: 'cta', narrativeFunction: 'cta', index: 4, total: 5, isLast: true,
    });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/unit/html/pipeline.test.ts`
Expected: FAIL — `buildHtmlDocument` called with 2 args (no third), and `reviewRenderedSlide` has no `slideContext`.

- [ ] **Step 3: Implement in `src/html/pipeline.ts`**

Add to `PipelineArgs`:

```ts
  showCtaArrow?: boolean;
  narrativeFunction?: string;
  slideIndex?: number;
  slideTotal?: number;
```

Near the top of `runSlidePipeline`, after destructuring `args`, derive context:

```ts
  const showArrow = args.showCtaArrow ?? true;
  const isLast = args.slideTotal != null && args.slideIndex != null
    ? args.slideIndex === args.slideTotal - 1
    : undefined;
  const slideContext = {
    role,
    narrativeFunction: args.narrativeFunction,
    index: args.slideIndex,
    total: args.slideTotal,
    isLast,
  };
```

Change the `buildHtmlDocument` call to pass `showArrow`:

```ts
    const html = buildHtmlDocument(generated.bodyHtml, generated.css, showArrow);
```

Change the `reviewRenderedSlide` call to pass `slideContext`:

```ts
      qualityReview = await reviewRenderedSlide({ client, model, reasoningEffort, pngPath: renderOutcome.file, html, designSpec, meter, slideContext });
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tests/unit/html/pipeline.test.ts`
Expected: PASS (existing 9 + 3 new = 12).

- [ ] **Step 5: Verify build (expect downstream errors)**

Run: `npm run build`
Expected: type error in `src/html/qualityReview.ts` (no `slideContext` in args) — fixed in Task 3. Note and continue.

- [ ] **Step 6: Commit**

```bash
git add src/html/pipeline.ts tests/unit/html/pipeline.test.ts
git commit -m "feat(pipeline): showCtaArrow + narrative slide context to reviewer"
```

---

## Task 3: Quality reviewer — narrative/slide-type awareness

**Files:**
- Modify: `src/html/qualityReview.ts`

This adds the `slideContext` arg and a narrative review section. Verified via build + existing schema test.

- [ ] **Step 1: Add the `slideContext` arg type and import `SlideRole`**

In `src/html/qualityReview.ts`, add an import:

```ts
import type { SlideRole } from './htmlSystemPrompt';
```

Add `slideContext` to the `reviewRenderedSlide` args type (after `meter?: UsageMeter;`):

```ts
  slideContext?: {
    role: SlideRole;
    narrativeFunction?: string;
    index?: number;
    total?: number;
    isLast?: boolean;
  };
```

- [ ] **Step 2: Add the narrative review section to the prompt**

Append this block to `QUALITY_REVIEWER_PROMPT` (before the `## OUTPUT` section):

```
## NARRATIVE / SLIDE-TYPE REVIEW (act as an expert content reviewer)
You are told this slide's role, narrative function and position. Judge whether the CONTENT fits its type:
- cover / hook: a strong hook + clear promise, minimal text, one focal point — NOT a dense body.
- inform: exactly one clear idea, density appropriate to the recipe.
- payoff: a concise recap (bullets), echoes the cover, introduces no new topic.
- cta: one clear call-to-action / invite, closing tone.
- SWIPE ARROW RULE: the bottom-right circular swipe arrow (→) is a "scroll to next" affordance. On the LAST / CTA slide there is no next slide, so it MUST NOT appear — if you see it on the last/CTA slide, flag it (category "layout"). On non-last slides the arrow is expected; do NOT flag its presence there.
Flag real mismatches only (use category "content" for wrong-content-for-type, "layout" for the arrow).
```

- [ ] **Step 3: Pass the context into the user message**

In `buildReviewContent` (the function that builds the content parts), it currently receives `(pngPath, html, designSpec)`. Add a `slideContext` parameter and include a text line describing it. Change the signature and the text part.

Update the `reviewRenderedSlide` call site:

```ts
      { role: 'user', content: await buildReviewContent(args.pngPath, args.html, args.designSpec, args.slideContext) },
```

Update `buildReviewContent` signature and the trailing text part:

```ts
async function buildReviewContent(
  pngPath: string,
  html: string,
  designSpec: SlideDesignSpec,
  slideContext?: {
    role: SlideRole;
    narrativeFunction?: string;
    index?: number;
    total?: number;
    isLast?: boolean;
  },
): Promise<OpenAI.Chat.ChatCompletionContentPart[]> {
```

And where the final text part is constructed, prepend a context line. Replace the text part object with:

```ts
    {
      type: 'text',
      text: `${slideContext ? `Slide context: role=${slideContext.role}, narrativeFunction=${slideContext.narrativeFunction ?? 'n/a'}, position=${slideContext.index != null && slideContext.total != null ? `${slideContext.index + 1}/${slideContext.total}` : 'standalone'}, isLast=${slideContext.isLast ?? 'n/a'}.\n\n` : ''}Design specification that was implemented:\n${JSON.stringify(designSpec, null, 2)}\n\n---\nHTML/CSS source:\n${html}`,
    },
```

- [ ] **Step 4: Verify build + existing test**

Run: `npm run build`
Expected: no errors (pipeline.ts from Task 2 now satisfied).
Run: `npm test -- tests/unit/html/qualityReview.test.ts`
Expected: PASS (schema test unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/html/qualityReview.ts
git commit -m "feat(html): narrative/slide-type awareness in quality reviewer"
```

---

## Task 4: Plan schema + planner carousel knowledge

**Files:**
- Modify: `src/content/plan.ts`
- Test: `tests/unit/content/plan.test.ts`

- [ ] **Step 1: Update the schema test**

Read `tests/unit/content/plan.test.ts`. Update the `valid` object in the `ContentPlanSchema` describe to include `framework` and `narrativeFunction`:

```ts
  const valid = {
    title: 'La leva del tempo',
    framework: 'SWIPE',
    angle: 'Il tempo come alleato dell investitore di lungo periodo.',
    slides: [
      { role: 'cover', narrativeFunction: 'hook', brief: 'Hook: il tempo vale piu del timing.' },
      { role: 'body', narrativeFunction: 'inform', brief: 'Spiega interesse composto con esempio numerico.' },
      { role: 'cta', narrativeFunction: 'cta', brief: 'Invito a iniziare presto + segui.' },
    ],
  };
```

Update the "rejects invalid role" and "rejects empty brief" cases to keep `narrativeFunction` present (so only the intended field is invalid). Add two new tests:

```ts
  it('requires framework', () => {
    const { framework, ...noFramework } = valid;
    expect(ContentPlanSchema.safeParse(noFramework).success).toBe(false);
  });

  it('requires narrativeFunction on each slide', () => {
    const bad = { ...valid, slides: [{ role: 'cover', brief: 'x' }] };
    expect(ContentPlanSchema.safeParse(bad).success).toBe(false);
  });
```

For the existing "rejects invalid role" and "rejects empty brief": update their slide objects to include `narrativeFunction: 'hook'` so they isolate the field under test, e.g.:
```ts
  it('rejects invalid role', () => {
    const bad = { ...valid, slides: [{ role: 'intro', narrativeFunction: 'hook', brief: 'x' }] };
    expect(ContentPlanSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects empty brief', () => {
    const bad = { ...valid, slides: [{ role: 'cover', narrativeFunction: 'hook', brief: '' }] };
    expect(ContentPlanSchema.safeParse(bad).success).toBe(false);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/unit/content/plan.test.ts`
Expected: FAIL — `framework`/`narrativeFunction` not yet in schema.

- [ ] **Step 3: Extend the schema**

In `src/content/plan.ts`:

```ts
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
```

- [ ] **Step 4: Add the carousel knowledge to the planner prompt**

In `buildPlannerSystemPrompt`, after the `${formatRules}` insertion and before the "Per ogni slide scrivi un brief..." paragraph, insert the framework catalog + narrative rules (only meaningful for carousels, but harmless for single):

```ts
  return `Sei un social media manager senior specializzato in caroselli Instagram educativi di finanza per Finvestire (italiano).

${formatRules}

# METODO E STRUTTURE NARRATIVE (per i caroselli)
Scegli la struttura più adatta al contenuto e dichiarala nel campo "framework":
- SWIPE (Hook → Why → Inform×3 → Payoff → CTA): meccanismi, principi, come-funziona, concetti complessi. È il default.
- 3-ACT (Setup → Conflitto → Soluzione → Applicazione): storie reali/plausibili, errori, mindset, prima→dopo.
- SRL (Shock → Reveal → Lesson): sfatare miti, verità controintuitive, bias.
- 3ACT-2.0 (Problema → Analisi → Soluzione → Applicazione): problemi concreti dell'utente, abitudini, budgeting.
- 3ACT-3.0 (Domanda → Percorso → Risposta): una domanda reale del pubblico, scelte A-vs-B, chiarimenti.
- A-vs-B: confronto tra due concetti su cui si fa confusione.
- case-study: parti da un caso reale per spiegare un concetto generale.
- list: "X cose per…", un elemento per slide.
- step-by-step / roadmap: uno step per slide, da A a B.
- framework→breakdown→application: mostra un framework tramite un esempio reale.

# REGOLE NARRATIVE (valide per qualunque struttura)
- COVER = hook fortissimo + promessa chiara, testo minimo.
- FORESHADOWING: cover e slide 2 devono essere coerenti (la slide 2 spiega perché conta / apre il loop principale).
- MINI-LOOP: apri una domanda e chiudila entro 1-2 slide.
- PAYOFF: recap in 3-4 bullet nella PENULTIMA slide, prima della CTA; chiude tutti i loop e richiama la cover.
- CTA: una sola, chiara, SOLO nell'ultima slide.
- Una idea per slide; testo conciso (deve stare in 1080×1350 senza overflow).

# FUNZIONE NARRATIVA
Assegna a ogni slide un "narrativeFunction" coerente con la struttura scelta (es. "hook", "why", "inform", "payoff", "cta", "setup", "conflict", "solution", "loop-open", "loop-close").

Per ogni slide scrivi un "brief" AUTOSUFFICIENTE e dettagliato che un agente di design userà per generare la slide. Ogni brief DEVE contenere:
- HEADLINE proposta (testo esatto in italiano) e quali 1-2 parole evidenziare in verde (positivo/crescita) o rosso (rischio/perdita). Non abusare del colore.
- I PUNTI DI CONTENUTO concreti da mostrare, con i DATI specifici presi dal dossier (numeri + anno/fonte quando rilevanti).
- HINT DI LAYOUT: suggerisci la recipe più adatta (cover, numbered-list, compare-2col, kpi-hero, card-grid-2x2, quote, cta).
- TAGLIO: l'angolo emotivo/semantico della slide e se apre o chiude un loop.
Il brief non deve riferirsi alle altre slide: deve bastare a sé stesso.

Regole:
- UNA idea principale per slide. Non sovraccaricare: meglio poco testo grande che molto testo piccolo.
- Arco narrativo coerente con la struttura scelta; la COVER aggancia, le slide centrali sviluppano, la CTA chiude.
- Usa i dati del dossier quando rafforzano il messaggio; niente affermazioni non supportate dalla ricerca.
- Brief in italiano.

Output JSON (ContentPlan):
- title: titolo editoriale del contenuto complessivo
- framework: la struttura narrativa scelta (es. "SWIPE")
- angle: l'angolo/taglio scelto in 1-2 frasi
- slides: array di { role, narrativeFunction, brief } nell'ordine di pubblicazione`;
```

Also update the carousel branch of `formatRules` to mention the 7-slide default. Find the carousel `formatRules` string and ensure it says the rhythm is ~7 slides (it already takes `slideCount`); no change needed beyond what the planner receives. If the single branch exists, set its expectation that `framework` may be `"single"` and one slide with `narrativeFunction: "hook"`.

Update the single-format `formatRules` string to add: `Imposta framework a "single" e narrativeFunction della slide a "hook".`

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- tests/unit/content/plan.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify build (expect orchestrate downstream)**

Run: `npm run build`
Expected: possible type usage in `orchestrate.ts` if it reads `plan.framework`/`narrativeFunction` — those are additive and optional in reads, so build should stay clean. If `orchestrate.ts` errors, it is fixed in Task 6.

- [ ] **Step 7: Commit**

```bash
git add src/content/plan.ts tests/unit/content/plan.test.ts
git commit -m "feat(content): framework + narrativeFunction schema; SWIPE catalog in planner"
```

---

## Task 5: Plan & editorial reviewers — method adherence

**Files:**
- Modify: `src/content/planReview.ts`
- Modify: `src/content/review.ts`

Prompt-only changes (+ pass framework/narrativeFunction into planReview's user content). Verified via build + existing schema tests.

- [ ] **Step 1: `planReview.ts` — receive framework + narrativeFunction and add criteria**

In `src/content/planReview.ts`, the `slidesText` currently maps `plan.slides` to `### Slide N (role)\nbrief`. Change it to include the narrative function:

```ts
  const slidesText = args.plan.slides
    .map((s, i) => `### Slide ${i} (${s.role} / ${s.narrativeFunction})\n${s.brief}`)
    .join('\n\n');
```

Add the framework to the user content. Find the line that builds `PIANO PROPOSTO — titolo: ...` and change it to include the framework:

```ts
PIANO PROPOSTO — framework: "${args.plan.framework}", titolo: "${args.plan.title}", angolo: "${args.plan.angle}"
```

Extend `PLAN_REVIEWER_PROMPT` with method-adherence criteria — add after the existing numbered checks:

```
7. Struttura narrativa: il framework dichiarato è adatto al contenuto? La sequenza dei narrativeFunction è coerente con quel framework?
8. Foreshadowing: cover e slide 2 sono coerenti (la slide 2 apre il loop / spiega perché conta)?
9. Mini-loop: ogni domanda/loop aperto viene chiuso entro 1-2 slide?
10. Payoff: c'è un recap (3-4 bullet) nella penultima slide, prima della CTA, che richiama la cover?
11. CTA: ce n'è UNA sola, chiara, e solo nell'ultima slide?
12. Ritmo: il numero di slide è ragionevole per il framework (≈7)?
```

- [ ] **Step 2: `review.ts` — narrative lens on generated slides**

In `src/content/review.ts`, extend `REVIEWER_PROMPT` — add after the existing criteria (currently up to "7. Forza editoriale"):

```
8. Foreshadowing: la cover e la seconda slide sono coerenti tra loro?
9. Loop narrativi: le domande/tensioni aperte vengono chiuse? C'è un payoff chiaro prima della CTA?
10. CTA unica: l'ultima slide contiene una sola call-to-action chiara e nessun rimando a "slide successive"?
```

- [ ] **Step 3: Verify build + tests**

Run: `npm run build`
Expected: no errors.
Run: `npm test -- tests/unit/content`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/content/planReview.ts src/content/review.ts
git commit -m "feat(content): method-adherence criteria in plan & editorial reviewers"
```

---

## Task 6: Orchestrator — thread narrative context, arrow, manifest

**Files:**
- Modify: `src/content/orchestrate.ts`

- [ ] **Step 1: Pass narrative context + showCtaArrow into the pipeline**

Read `src/content/orchestrate.ts`. The `generateOneSlide` helper currently takes `(args, role, baseBrief, fixes, output)`. Extend it to accept the slide's narrative context and pass it to `runSlidePipeline`.

Change `generateOneSlide` signature and body:

```ts
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
  });
}
```

- [ ] **Step 2: Build the context at each call site**

There are two `generateOneSlide` call sites (initial generation loop and the editorial-fix regeneration). At both, compute the context. Add a helper near `slideOutput`:

```ts
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
```

In the initial generation loop, change the call:

```ts
    const planned = plan.slides[i];
    const result = await generateOneSlide(args, planned.role, planned.brief, [], slideOutput(i), slideCtx(i, planned.narrativeFunction));
```

In the editorial-fix regeneration loop, change the call (the slide index is `fix.slideIndex`):

```ts
      const planned = plan.slides[fix.slideIndex];
      const regenerated = await generateOneSlide(args, state.role, state.baseBrief, state.fixes, slideOutput(fix.slideIndex), slideCtx(fix.slideIndex, planned?.narrativeFunction));
```

(If `state` already holds what is needed, keep using `state.role` / `state.baseBrief`; only the extra `slideCtx(...)` arg is new. `plan.slides[fix.slideIndex]` gives the `narrativeFunction`.)

- [ ] **Step 3: Carry framework + narrativeFunction into the manifest and result**

In `writeCarouselArtifacts`, the manifest currently has top-level fields and per-slide entries. Add `framework: p.plan.framework` to the manifest object, and add `narrativeFunction` to each manifest slide entry. The `writeCarouselArtifacts` param object already receives `plan`, so:

```ts
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
```

And in the `manifestSlides` map, add `narrativeFunction: p.plan.slides[idx]?.narrativeFunction` to each entry object.

Optionally expose `framework` on `GenerateContentSuccess` — add `framework: string;` to the interface and `framework: plan.framework` to the returned object (so the route can surface it).

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: no errors (route may still compile; if `GenerateContentSuccess.framework` is added, the route can pass it in Task 7).

Run: `npm test -- tests/unit/content`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/orchestrate.ts
git commit -m "feat(content): thread narrative context + arrow control; manifest framework"
```

---

## Task 7: Routes — arrow off for standalone, carousel slideCount default 7

**Files:**
- Modify: `src/server/routes.ts`
- Test: `tests/integration/generateContent.test.ts`

- [ ] **Step 1: `/render/html` — no arrow on standalone slide**

In `mountHtmlRoutes`, in the `runSlidePipeline({...})` call, add:

```ts
        showCtaArrow: false,
```

- [ ] **Step 2: Carousel slideCount default 7, clamp 6–9**

In `ContentBodySchema`'s `.transform(...)`, change the slideCount line:

```ts
    slideCount: b.format === 'carousel' ? Math.min(9, Math.max(6, b.slideCount ?? 7)) : 1,
```

- [ ] **Step 3: Surface `framework` in the content response (if added in Task 6)**

If `GenerateContentSuccess.framework` exists, add to the `mountContentRoutes` `res.json({...})`:

```ts
        framework: result.framework,
```

- [ ] **Step 4: Update the integration test mocks + assertions**

Read `tests/integration/generateContent.test.ts`. Update the `@/content/plan` mock so the plan carries `framework` and each slide a `narrativeFunction`:

```ts
vi.mock('@/content/plan', () => ({
  planContent: vi.fn(async () => ({
    title: 'Titolo contenuto',
    framework: 'SWIPE',
    angle: 'angolo',
    slides: [
      { role: 'cover', narrativeFunction: 'hook', brief: 'brief cover' },
      { role: 'body', narrativeFunction: 'inform', brief: 'brief body' },
      { role: 'cta', narrativeFunction: 'cta', brief: 'brief cta' },
    ],
  })),
}));
```

In the carousel test (`'generates a carousel: research → plan → slides → review'`), after the existing manifest assertions, add:

```ts
    expect(manifest.framework).toBe('SWIPE');
    expect(manifest.slides[0].narrativeFunction).toBe('hook');
    expect(manifest.slides[2].narrativeFunction).toBe('cta');
```

Add a new test verifying the last carousel slide gets `showCtaArrow:false`:

```ts
  it('disables the swipe arrow on the last carousel slide', async () => {
    const { runSlidePipeline } = await import('@/html/pipeline');
    await request(buildApp())
      .post('/generate/content')
      .send({ topic: 'x', format: 'carousel', slideCount: 3 });
    const calls = (runSlidePipeline as ReturnType<typeof vi.fn>).mock.calls;
    // 3 slides → last call (index 2) is the cta slide
    const lastSlideArg = calls[2][0];
    expect(lastSlideArg.showCtaArrow).toBe(false);
    const firstSlideArg = calls[0][0];
    expect(firstSlideArg.showCtaArrow).toBe(true);
  });
```

> Note: `planContent` is mocked to return 3 slides regardless of `slideCount`, so the clamp to 6 does not change the slide count in this test; the mock drives it.

- [ ] **Step 5: Run the integration test**

Run: `npm test -- tests/integration/generateContent.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Verify build + full suite**

Run: `npm run build`
Expected: clean.
Run: `npm test`
Expected: all pass except the 2 pre-existing unrelated failures (`sandbox.test.ts`, `assets.test.ts`).

- [ ] **Step 7: Commit**

```bash
git add src/server/routes.ts tests/integration/generateContent.test.ts
git commit -m "feat(api): standalone no-arrow; carousel slideCount default 7 (6-9); framework in response"
```

---

## Final verification

- [ ] Run `npm test` — all pass except the 2 documented pre-existing failures.
- [ ] Run `npm run build` — clean.
- [ ] Manual smoke (optional, needs LLM creds + Playwright): POST a carousel to `/generate/content`; confirm `manifest.json` has `framework` + per-slide `narrativeFunction`, and the last slide PNG has **no** swipe arrow while earlier slides do.

## Self-Review notes (spec coverage)

- Spec A (arrow fix) → Tasks 1 (template), 2 (pipeline), 6 (orchestrator), 7 (routes).
- Spec B (narrative layer) → Task 4 (schema) + threaded in 2, 6.
- Spec C (planner knowledge) → Task 4.
- Spec D (quality reviewer narrative) → Tasks 2 (context plumbing) + 3 (prompt + arg).
- Spec E (plan/editorial reviewers) → Task 5.
- Spec F (slide count) → Task 7.
- `slideContext` shape defined identically in pipeline (Task 2) and qualityReview (Task 3); `framework`/`narrativeFunction` defined in schema (Task 4) and consumed in 5, 6, 7.
