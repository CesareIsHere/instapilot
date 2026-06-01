# Layout Collision Detection (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect internal layout failures the boundary-overflow check misses — elements escaping the canvas, text clipped inside `overflow:hidden` boxes, and text overlapping text — and feed them into the existing render retry loop.

**Architecture:** Browser extracts raw geometry (`ElementRect[]`); a pure Node function `analyzeLayout` returns `LayoutIssue[]` (unit-tested without a browser). `renderHtmlStill` returns `issues`; the pipeline retries on any issue, forces a best-effort screenshot on the last attempt, and surfaces a `layout` warning.

**Tech Stack:** TypeScript (ESM), Playwright, Vitest. Path alias `@/* → src/*`. Tests in `tests/unit`, run with `npm test`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/html/layoutAudit.ts` | **New** — `ElementRect`, `LayoutMeasurements`, `LayoutIssue`, pure `analyzeLayout` |
| `src/html/renderHtml.ts` | Collect `ElementRect[]` in-page, call `analyzeLayout`, `issues`-based outcome |
| `src/html/pipeline.ts` | `layout` warning, `buildLayoutFeedback`, issues-driven retry |
| `tests/unit/html/layoutAudit.test.ts` | **New** — analysis unit tests |
| `tests/unit/html/pipeline.test.ts` | Update render mock + warning-kind assertion |

---

## Task 1: `analyzeLayout` pure function

**Files:**
- Create: `src/html/layoutAudit.ts`
- Test: `tests/unit/html/layoutAudit.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/html/layoutAudit.test.ts
import { describe, it, expect } from 'vitest';
import { analyzeLayout, type ElementRect, type LayoutMeasurements } from '@/html/layoutAudit';

const CANVAS = { width: 1080, height: 1350 };

function rect(partial: Partial<ElementRect>): ElementRect {
  return {
    tag: 'div', cls: '', text: 'x',
    left: 0, top: 0, right: 100, bottom: 100,
    clientW: 100, clientH: 100, scrollW: 100, scrollH: 100,
    clipped: false, isTextLeaf: true,
    ...partial,
  };
}

function meas(elements: ElementRect[], scrollWidth = 1080, scrollHeight = 1350): LayoutMeasurements {
  return { scrollWidth, scrollHeight, elements };
}

describe('analyzeLayout', () => {
  it('returns no issues for a clean layout', () => {
    const els = [
      rect({ text: 'a', left: 0, top: 0, right: 100, bottom: 100 }),
      rect({ text: 'b', left: 0, top: 200, right: 100, bottom: 300 }),
    ];
    expect(analyzeLayout(meas(els), CANVAS)).toEqual([]);
  });

  it('flags canvas overflow on height', () => {
    const issues = analyzeLayout(meas([], 1080, 1500), CANVAS);
    expect(issues.some((i) => i.type === 'overflow')).toBe(true);
  });

  it('flags an element that exceeds the canvas bounds', () => {
    const els = [rect({ text: 'big', left: 0, top: 0, right: 1200, bottom: 100 })];
    expect(analyzeLayout(meas(els), CANVAS).some((i) => i.type === 'exceeds-canvas')).toBe(true);
  });

  it('flags clipped text in an overflow-hidden box', () => {
    const els = [rect({ text: 'cut', clipped: true, clientH: 100, scrollH: 180 })];
    expect(analyzeLayout(meas(els), CANVAS).some((i) => i.type === 'clipped-text')).toBe(true);
  });

  it('does NOT flag clipping when overflow is visible', () => {
    const els = [rect({ text: 'tall', clipped: false, clientH: 100, scrollH: 180 })];
    expect(analyzeLayout(meas(els), CANVAS).some((i) => i.type === 'clipped-text')).toBe(false);
  });

  it('flags two overlapping text leaves', () => {
    const els = [
      rect({ text: '262.481', left: 60, top: 950, right: 460, bottom: 1080 }),
      rect({ text: 'La differenza', left: 60, top: 1000, right: 1000, bottom: 1080 }),
    ];
    expect(analyzeLayout(meas(els), CANVAS).some((i) => i.type === 'overlap')).toBe(true);
  });

  it('does NOT flag a parent/child pair (parent is not a text leaf)', () => {
    const els = [
      rect({ text: 'parent', left: 0, top: 0, right: 400, bottom: 200, isTextLeaf: false }),
      rect({ text: 'child', left: 10, top: 10, right: 200, bottom: 100, isTextLeaf: true }),
    ];
    expect(analyzeLayout(meas(els), CANVAS).some((i) => i.type === 'overlap')).toBe(false);
  });

  it('does NOT flag a tiny incidental overlap', () => {
    const els = [
      rect({ text: 'a', left: 0, top: 0, right: 100, bottom: 100 }),
      rect({ text: 'b', left: 98, top: 98, right: 200, bottom: 200 }),
    ];
    expect(analyzeLayout(meas(els), CANVAS).some((i) => i.type === 'overlap')).toBe(false);
  });

  it('caps the issue list at 12', () => {
    const els: ElementRect[] = [];
    for (let i = 0; i < 30; i++) els.push(rect({ text: `e${i}`, left: 0, top: 0, right: 1200, bottom: 100 }));
    expect(analyzeLayout(meas(els), CANVAS).length).toBeLessThanOrEqual(12);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/unit/html/layoutAudit.test.ts`
Expected: FAIL — `Cannot find module '@/html/layoutAudit'`.

- [ ] **Step 3: Implement `src/html/layoutAudit.ts`**

```ts
const TOL = 1;
const OVERLAP_AREA_RATIO = 0.15;
const OVERLAP_MIN_AREA = 200;
const MAX_ISSUES = 12;

export interface ElementRect {
  tag: string;
  cls: string;
  text: string;
  left: number; top: number; right: number; bottom: number;
  clientW: number; clientH: number;
  scrollW: number; scrollH: number;
  clipped: boolean;
  isTextLeaf: boolean;
}

export interface LayoutMeasurements {
  scrollWidth: number;
  scrollHeight: number;
  elements: ElementRect[];
}

export type LayoutIssueType = 'overflow' | 'exceeds-canvas' | 'clipped-text' | 'overlap';
export interface LayoutIssue { type: LayoutIssueType; detail: string; }

function label(e: ElementRect): string {
  const cls = e.cls ? `.${e.cls}` : '';
  const txt = e.text ? ` "${e.text}"` : '';
  return `<${e.tag}${cls}>${txt}`;
}

function area(e: ElementRect): number {
  return Math.max(0, e.right - e.left) * Math.max(0, e.bottom - e.top);
}

export function analyzeLayout(
  m: LayoutMeasurements,
  canvas: { width: number; height: number },
): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const seen = new Set<string>();
  const push = (type: LayoutIssueType, detail: string) => {
    const key = `${type}:${detail}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ type, detail });
  };

  // 1. Canvas boundary overflow
  if (m.scrollWidth > canvas.width + TOL) {
    push('overflow', `canvas content is ${m.scrollWidth - canvas.width}px wider than ${canvas.width}px (scrollWidth ${m.scrollWidth})`);
  }
  if (m.scrollHeight > canvas.height + TOL) {
    push('overflow', `canvas content is ${m.scrollHeight - canvas.height}px taller than ${canvas.height}px (scrollHeight ${m.scrollHeight})`);
  }

  const visible = m.elements.filter((e) => area(e) > 0);

  // 2. Elements exceeding the canvas bounds
  for (const e of visible) {
    if (e.left < -TOL || e.top < -TOL || e.right > canvas.width + TOL || e.bottom > canvas.height + TOL) {
      push('exceeds-canvas', `${label(e)} extends to [${Math.round(e.left)},${Math.round(e.top)},${Math.round(e.right)},${Math.round(e.bottom)}] (outside 0,0–${canvas.width},${canvas.height})`);
    }
  }

  // 3. Clipped text inside an overflow-hidden/clip/auto/scroll box
  for (const e of visible) {
    if (e.isTextLeaf && e.clipped && (e.scrollH > e.clientH + TOL || e.scrollW > e.clientW + TOL)) {
      push('clipped-text', `${label(e)} is clipped (content ${e.scrollW}x${e.scrollH} vs box ${e.clientW}x${e.clientH})`);
    }
  }

  // 4. Overlap between text leaves
  const leaves = visible.filter((e) => e.isTextLeaf);
  for (let i = 0; i < leaves.length; i++) {
    for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i];
      const b = leaves[j];
      const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      const inter = ix * iy;
      if (inter <= 0) continue;
      const minArea = Math.min(area(a), area(b));
      if (inter > OVERLAP_AREA_RATIO * minArea && inter > OVERLAP_MIN_AREA) {
        push('overlap', `${label(a)} overlaps ${label(b)}`);
      }
    }
  }

  return issues.slice(0, MAX_ISSUES);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tests/unit/html/layoutAudit.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/html/layoutAudit.ts tests/unit/html/layoutAudit.test.ts
git commit -m "feat(html): analyzeLayout — pure collision/clipping/overflow analysis"
```

---

## Task 2: Wire detection into `renderHtmlStill`

**Files:**
- Modify: `src/html/renderHtml.ts`

No unit test here (needs a real browser). Verified by build + the pipeline tests in Task 3. The in-page collection is thin; the tested logic lives in `analyzeLayout`.

- [ ] **Step 1: Replace imports and outcome types**

In `src/html/renderHtml.ts`, replace the `OverflowResult` import:

```ts
import { analyzeLayout, type LayoutIssue, type LayoutMeasurements } from './layoutAudit';
```

Replace the `RenderHtmlResult` / `RenderHtmlOverflow` / `RenderHtmlOutcome` block (current lines ~12–35) with:

```ts
export interface RenderHtmlResult {
  file: string;
  durationMs: number;
  /** Non-empty only when the screenshot was forced despite layout issues (best-effort render). */
  issues: LayoutIssue[];
}

export interface RenderHtmlFailure {
  issues: LayoutIssue[];
  durationMs: number;
}

export interface RenderHtmlOpts {
  /** Screenshot even if layout issues are detected, returning ok:true with `issues` set. */
  force?: boolean;
  /** Output directory (defaults to OUTPUT_DIR env). */
  dir?: string;
  /** Output file name including extension (defaults to `HtmlSlide-<outputId>.png`). */
  fileName?: string;
}

export type RenderHtmlOutcome =
  | ({ ok: true } & RenderHtmlResult)
  | ({ ok: false } & RenderHtmlFailure);
```

(`OVERFLOW_TOLERANCE_PX` constant can be removed; tolerance now lives in `analyzeLayout`.)

- [ ] **Step 2: Replace the measurement + decision block**

Replace the body from the `const measurements = await page.evaluate(...)` call through the end of the function (the overflow detection + screenshot logic) with:

```ts
    const measurements = (await page.evaluate(() => {
      const canvas = document.querySelector('.canvas') as HTMLElement | null;
      const root = canvas ?? document.documentElement;
      const result = {
        scrollWidth: root.scrollWidth,
        scrollHeight: root.scrollHeight,
        elements: [] as Array<Record<string, unknown>>,
      };
      if (!canvas) return result;
      const clip = (v: string) => v === 'hidden' || v === 'clip' || v === 'auto' || v === 'scroll';
      for (const el of Array.from(canvas.querySelectorAll('*'))) {
        const node = el as HTMLElement;
        const cs = getComputedStyle(node);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        if (node.getClientRects().length === 0) continue;
        const r = node.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        const ownText = (node.textContent ?? '').trim();
        const childHasText = Array.from(node.children).some((c) => (c.textContent ?? '').trim().length > 0);
        result.elements.push({
          tag: node.tagName.toLowerCase(),
          cls: typeof node.className === 'string' && node.className ? node.className.split(/\s+/)[0] : '',
          text: ownText.slice(0, 60),
          left: r.left, top: r.top, right: r.right, bottom: r.bottom,
          clientW: node.clientWidth, clientH: node.clientHeight,
          scrollW: node.scrollWidth, scrollH: node.scrollHeight,
          clipped: clip(cs.overflowX) || clip(cs.overflowY),
          isTextLeaf: ownText.length > 0 && !childHasText,
        });
      }
      return result;
    })) as unknown as LayoutMeasurements;

    const issues = analyzeLayout(measurements, { width: 1080, height: 1350 });

    if (issues.length > 0 && !opts.force) {
      const durationMs = Date.now() - start;
      log.warn('render.html.layout_issues', { count: issues.length, types: issues.map((i) => i.type) });
      return { ok: false, issues, durationMs };
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
    if (issues.length > 0) {
      log.warn('render.html.forced_with_issues', { file, durationMs, count: issues.length });
    } else {
      log.info('render.html.complete', { file, durationMs });
    }
    return { ok: true, file, durationMs, issues };
```

- [ ] **Step 3: Verify build (expect pipeline downstream errors)**

Run: `npm run build`
Expected: type errors in `src/html/pipeline.ts` (uses `renderOutcome.overflow`, `OverflowResult`, `{ kind: 'overflow' }`). These are fixed in Task 3. Note and continue.

- [ ] **Step 4: Commit**

```bash
git add src/html/renderHtml.ts
git commit -m "feat(render): detect element collisions/clipping via analyzeLayout"
```

---

## Task 3: Issues-driven retry + `layout` warning in the pipeline

**Files:**
- Modify: `src/html/pipeline.ts`
- Test: `tests/unit/html/pipeline.test.ts`

- [ ] **Step 1: Update the pipeline tests first**

In `tests/unit/html/pipeline.test.ts`:

Update the default render mock in `beforeEach` (the line `renderHtmlStill.mockResolvedValue({ ok: true, file: '/out/x.png', durationMs: 5 });`) to include `issues`:

```ts
  renderHtmlStill.mockResolvedValue({ ok: true, file: '/out/x.png', durationMs: 5, issues: [] });
```

Replace the existing "forces a render and warns when overflow never resolves" test with an issues-based version:

```ts
  it('forces a render and warns (layout) when issues never resolve', async () => {
    const issue = { type: 'overlap', detail: 'A overlaps B' };
    renderHtmlStill
      .mockResolvedValueOnce({ ok: false, issues: [issue], durationMs: 5 })
      .mockResolvedValueOnce({ ok: false, issues: [issue], durationMs: 5 })
      .mockResolvedValueOnce({ ok: false, issues: [issue], durationMs: 5 })
      .mockResolvedValueOnce({ ok: false, issues: [issue], durationMs: 5 })
      .mockResolvedValueOnce({ ok: true, file: '/out/forced.png', durationMs: 5, issues: [issue] });
    const res = await runSlidePipeline(baseArgs as never);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.file).toBe('/out/forced.png');
    expect(res.warnings.some((w) => w.kind === 'layout')).toBe(true);
    const lastCall = renderHtmlStill.mock.calls[renderHtmlStill.mock.calls.length - 1];
    expect((lastCall as unknown[])[2]).toMatchObject({ force: true });
  });
```

If any other existing test in this file references `overflow:` in a `renderHtmlStill` mock or asserts `kind === 'overflow'`, update it to `issues:` / `kind === 'layout'` the same way.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/unit/html/pipeline.test.ts`
Expected: FAIL — pipeline still emits `kind:'overflow'` and reads `renderOutcome.overflow`.

- [ ] **Step 3: Update `src/html/pipeline.ts`**

Replace the import on line 11:

```ts
import type { LayoutIssue } from './layoutAudit';
```

In the `PipelineWarning` union, replace the overflow member:

```ts
  | { kind: 'layout'; issues: LayoutIssue[] }
```

Replace the render-outcome handling block (current lines ~167–181, the `if (!renderOutcome.ok) { ... }` and the `if (renderOutcome.overflow) { ... }` blocks) with:

```ts
    if (!renderOutcome.ok) {
      log.warn('pipeline.render.layout_issues', { attempt: ra, count: renderOutcome.issues.length });
      renderFeedback = buildLayoutFeedback(renderOutcome.issues);
      continue;
    }

    // Forced render that still had layout issues → ship best-effort, skip quality review.
    if (renderOutcome.issues.length > 0) {
      warnings.push({ kind: 'layout', issues: renderOutcome.issues });
      return finalize(renderOutcome.file, html, generated.intent);
    }
```

Add the `buildLayoutFeedback` helper at the bottom of the file (next to `buildRendererPrompt`):

```ts
function buildLayoutFeedback(issues: LayoutIssue[]): string {
  const byType = (t: string) => issues.filter((i) => i.type === t).slice(0, 3).map((i) => `- ${i.detail}`);
  const lines: string[] = ['LAYOUT ISSUES detected in the rendered slide — fix them:'];
  const overlap = byType('overlap');
  if (overlap.length) {
    lines.push('OVERLAP (elements must never collide — give each block its own vertical space; do NOT use position:absolute for content; avoid fixed heights too small for the content):');
    lines.push(...overlap);
  }
  const clipped = byType('clipped-text');
  if (clipped.length) {
    lines.push('CLIPPED TEXT (text is cut off — reduce font-size within the minimums or shorten the copy; do not put text in a fixed-height box):');
    lines.push(...clipped);
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tests/unit/html/pipeline.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Verify build + full suite**

Run: `npm run build`
Expected: clean.
Run: `npm test`
Expected: all pass except the 2 known pre-existing failures (`sandbox.test.ts`, `assets.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/html/pipeline.ts tests/unit/html/pipeline.test.ts
git commit -m "feat(pipeline): retry on layout issues; layout warning + actionable feedback"
```

---

## Final verification

- [ ] `npm test` — all pass except the 2 documented pre-existing failures.
- [ ] `npm run build` — clean.
- [ ] Manual smoke (optional, needs LLM creds + Playwright): regenerate the compound-interest carousel; confirm the pipeline now retries when a slide has overlapping text (look for `render.html.layout_issues` / `pipeline.render.layout_issues` log events), and that any shipped best-effort slide carries a `layout` warning.

## Self-Review notes (spec coverage)

- `analyzeLayout` (overflow/exceeds/clipped/overlap, thresholds, cap, parent/child safety) → Task 1.
- In-page `ElementRect` collection + issues-based outcome + force handling → Task 2.
- `layout` warning, `buildLayoutFeedback`, issues-driven retry, test updates → Task 3.
- `LayoutIssue` defined once in `layoutAudit.ts`; consumed by `renderHtml.ts` and `pipeline.ts`.
