# Layout Collision & Clipping Detection (Phase 1)

**Date:** 2026-06-01
**Status:** Approved (design)

## Goal

The slide pipeline only detects when `.canvas` overflows its 1080×1350 bounds. It is blind to **internal** layout failures — elements escaping their containers, text clipped inside `overflow:hidden` boxes, and **text overlapping other text** — because `.canvas` has `overflow:hidden`, so its `scrollHeight` stays 1350 even when content collides inside it. This is why a slide with two big KPI numbers overlapping the body paragraph shipped without any retry.

Phase 1 makes the render step detect these internal failures and feed them back into the existing retry loop. (Phase 2 — constrained deterministic layouts — is deliberately out of scope here; we want to measure Phase 1's impact first.)

## Non-goals

- No constrained/deterministic recipe renderers (that is Phase 2).
- No change to the LLM authoring approach — Agent 3 still writes the HTML/CSS.
- No change to the design-spec schema.

---

## Architecture

Separate **measurement** (in the browser, thin, untested) from **analysis** (pure Node function, unit-tested).

- The Playwright page extracts raw geometry for every visible element via `page.evaluate` → `ElementRect[]` (plus the canvas scroll size).
- A pure function `analyzeLayout(measurements, canvas)` runs in Node and returns `LayoutIssue[]`. All thresholds and overlap math live here and are unit-tested with synthetic inputs — no browser needed.

### `src/html/layoutAudit.ts` (new)

```ts
export interface ElementRect {
  tag: string;
  cls: string;          // first class name, or ''
  text: string;         // trimmed textContent, truncated to ~60 chars
  left: number; top: number; right: number; bottom: number;
  clientW: number; clientH: number;
  scrollW: number; scrollH: number;
  clipped: boolean;     // computed overflow is hidden/clip/auto/scroll on x or y
  isTextLeaf: boolean;  // has non-empty text AND no child element with its own text
}

export interface LayoutMeasurements {
  scrollWidth: number;   // of .canvas (or documentElement)
  scrollHeight: number;
  elements: ElementRect[];
}

export type LayoutIssueType = 'overflow' | 'exceeds-canvas' | 'clipped-text' | 'overlap';
export interface LayoutIssue { type: LayoutIssueType; detail: string; }

export function analyzeLayout(
  m: LayoutMeasurements,
  canvas: { width: number; height: number },
): LayoutIssue[];
```

**Rules in `analyzeLayout`** (tolerance `TOL = 1px`):

1. **overflow** — `m.scrollWidth > width + TOL` → issue; `m.scrollHeight > height + TOL` → issue.
2. **exceeds-canvas** — for each element with non-zero area, if `left < -TOL || top < -TOL || right > width + TOL || bottom > height + TOL` → issue (`<tag.cls> "text…" extends to [l,t,r,b]`).
3. **clipped-text** — for each `isTextLeaf` element that is `clipped`, if `scrollH > clientH + TOL || scrollW > clientW + TOL` → issue (`"text…" is clipped (content WxH vs box WxH)`).
4. **overlap** — for each pair of `isTextLeaf` elements with non-zero area, compute rect intersection area; if `inter > 0.15 * min(areaA, areaB)` AND `inter > 200` → issue (`"textA…" overlaps "textB…"`). Parent/child false positives are avoided because a parent containing a text-bearing child is not a text leaf.

Cap the returned list at 12 issues; de-duplicate identical details.

### `src/html/renderHtml.ts` (modify)

- After `document.fonts.ready`, `page.evaluate` returns `LayoutMeasurements` (canvas scroll size + an `ElementRect[]` built by walking `.canvas *`, skipping `display:none`/`visibility:hidden`/zero-rect elements; `isTextLeaf` and `clipped` computed in-page).
- Call `analyzeLayout(measurements, { width: 1080, height: 1350 })` in Node → `issues`.
- Outcome:
  ```ts
  export type RenderHtmlOutcome =
    | { ok: true; file: string; durationMs: number; issues: LayoutIssue[] }
    | { ok: false; issues: LayoutIssue[]; durationMs: number };
  ```
  - `issues.length === 0` → screenshot, `{ ok: true, file, durationMs, issues: [] }`.
  - `issues.length > 0 && !opts.force` → `{ ok: false, issues, durationMs }` (retry).
  - `issues.length > 0 && opts.force` → screenshot anyway, `{ ok: true, file, durationMs, issues }` (best-effort; caller warns).
- `RenderHtmlOpts` (`force`, `dir`, `fileName`) unchanged. The old `OverflowResult`-based shape is removed from the outcome.

### `src/html/pipeline.ts` (modify)

- `PipelineWarning`: replace `{ kind: 'overflow'; overflow: OverflowResult }` with `{ kind: 'layout'; issues: LayoutIssue[] }`. (Other kinds unchanged.)
- Render loop:
  - `if (!renderOutcome.ok)` → set `renderFeedback` from `renderOutcome.issues` via `buildLayoutFeedback(issues)`, `continue`.
  - forced render returning `issues.length > 0` → push `{ kind: 'layout', issues }` warning, finalize.
  - clean render (`issues` empty) → proceed to quality review as today.
- `buildLayoutFeedback(issues)` produces actionable text, e.g.:
  ```
  LAYOUT ISSUES detected in the rendered slide — fix them:
  - OVERLAP: "262.481 €" overlaps "La differenza non dipende…". Elements must never collide: give each block its own vertical space; do NOT use position:absolute for content; avoid fixed heights too small for the content.
  - CLIPPED TEXT: "…" is cut off inside its box. Reduce font-size (not below minimums) or shorten the copy; don't constrain a text box with a fixed height.
  - EXCEEDS CANVAS: "…" extends beyond 1080×1350. Keep all content within the canvas.
  Priority: first shorten copy, then reduce font sizes within the minimums, then simplify the layout.
  ```
  Group by type; list up to a few examples per type.

### Consumers

- `tests/unit/html/pipeline.test.ts`: the `renderHtmlStill` mock returns `{ ok: false, overflow: {...} }` today — change to `{ ok: false, issues: [...] }`; the overflow test asserts warning `kind === 'overflow'` → assert `kind === 'layout'`.
- No route/orchestrator change: warnings are passed through generically; only the pipeline constructs the warning kind.

---

## Testing

- **`tests/unit/html/layoutAudit.test.ts`** (new, pure, no browser):
  - clean layout (no overlaps, within bounds) → `[]`.
  - two text leaves with intersecting rects → one `overlap` issue.
  - parent + its text child (child rect inside parent) → NO overlap (parent is not a text leaf, so not compared).
  - element extending past `right > 1080` → `exceeds-canvas`.
  - text leaf with `clipped` and `scrollH > clientH` → `clipped-text`; not clipped (overflow visible) → none.
  - canvas `scrollHeight > 1350` → `overflow`.
  - result capped at 12.
- **`tests/unit/html/pipeline.test.ts`** (update):
  - overflow→retry test: mock `renderHtmlStill` `{ ok:false, issues:[{type:'overlap',detail:'x'}] }` for 4 attempts then forced `{ ok:true, file, issues:[...] }`; assert success, warning `kind:'layout'`, last call `force:true`.
  - happy path: `{ ok:true, file, issues:[] }` → no layout warning.

## Affected files

| File | Change |
|---|---|
| `src/html/layoutAudit.ts` | **New** — `ElementRect`, `LayoutMeasurements`, `LayoutIssue`, `analyzeLayout` |
| `src/html/renderHtml.ts` | Collect `ElementRect[]` in-page; call `analyzeLayout`; `issues`-based outcome |
| `src/html/pipeline.ts` | `layout` warning, `buildLayoutFeedback`, issues-driven retry |
| `tests/unit/html/layoutAudit.test.ts` | **New** — analysis unit tests |
| `tests/unit/html/pipeline.test.ts` | Update render mock + warning-kind assertion |

## Risks

- **False positives on overlap** could cause unnecessary regenerations (cost/latency). Mitigated by the 15%-of-min-area + 200px² thresholds and the text-leaf restriction (decorative/inline parents excluded). Tunable in one place.
- The in-page collection adds a small measurement cost per render — negligible vs LLM/render time.
- `force` on the last attempt still ships a colliding slide, now surfaced via a `layout` warning (consistent with best-effort philosophy).
