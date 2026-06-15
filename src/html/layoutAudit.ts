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
  /** DOM-order index; enables ancestor-aware overlap. Optional for backward compat. */
  id?: number;
  /** Nearest measured ancestor's id, or -1 if none. */
  parentId?: number;
  /** Computed font-size / line-height in px; enables bad-wrap detection. */
  fontSize?: number;
  lineHeight?: number;
}

export interface LayoutMeasurements {
  scrollWidth: number;
  scrollHeight: number;
  elements: ElementRect[];
}

export type LayoutIssueType = 'overflow' | 'exceeds-canvas' | 'clipped-text' | 'overlap' | 'wrapped-text';
export interface LayoutIssue { type: LayoutIssueType; detail: string; }

interface Rect { left: number; top: number; right: number; bottom: number; }

/**
 * A reserved keep-out zone the shell occupies (e.g. the bottom-right swipe arrow,
 * injected as a ::after pseudo-element that the DOM measurement cannot see). Content
 * overlapping it is flagged so the renderer keeps clear.
 */
export interface ReservedZone extends Rect { label: string; }

export interface AnalyzeOptions { reservedZones?: ReservedZone[]; }

/** Build, per element id, the set of its ancestor ids (walking parentId chains). */
function buildAncestorSets(els: ElementRect[]): Map<number, Set<number>> {
  const byId = new Map<number, ElementRect>();
  for (const e of els) if (e.id != null) byId.set(e.id, e);
  const cache = new Map<number, Set<number>>();
  for (const e of els) {
    if (e.id == null) continue;
    const set = new Set<number>();
    let cur: ElementRect | undefined = e;
    let guard = 0;
    while (cur?.parentId != null && cur.parentId >= 0 && guard++ < 4096) {
      if (set.has(cur.parentId)) break;
      set.add(cur.parentId);
      cur = byId.get(cur.parentId);
    }
    cache.set(e.id, set);
  }
  return cache;
}

function label(e: ElementRect): string {
  const cls = e.cls ? `.${e.cls}` : '';
  const txt = e.text ? ` "${e.text}"` : '';
  return `<${e.tag}${cls}>${txt}`;
}

function area(e: Rect): number {
  return Math.max(0, e.right - e.left) * Math.max(0, e.bottom - e.top);
}

export function analyzeLayout(
  m: LayoutMeasurements,
  canvas: { width: number; height: number },
  options: AnalyzeOptions = {},
): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const seen = new Set<string>();
  const push = (type: LayoutIssueType, detail: string) => {
    const key = `${type}:${detail}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ type, detail });
  };

  if (m.scrollWidth > canvas.width + TOL) {
    push('overflow', `canvas content is ${m.scrollWidth - canvas.width}px wider than ${canvas.width}px (scrollWidth ${m.scrollWidth})`);
  }
  if (m.scrollHeight > canvas.height + TOL) {
    push('overflow', `canvas content is ${m.scrollHeight - canvas.height}px taller than ${canvas.height}px (scrollHeight ${m.scrollHeight})`);
  }

  const visible = m.elements.filter((e) => area(e) > 0);

  for (const e of visible) {
    if (e.text.length > 0 && (e.left < -TOL || e.top < -TOL || e.right > canvas.width + TOL || e.bottom > canvas.height + TOL)) {
      push('exceeds-canvas', `${label(e)} extends to [${Math.round(e.left)},${Math.round(e.top)},${Math.round(e.right)},${Math.round(e.bottom)}] (outside 0,0-${canvas.width},${canvas.height})`);
    }
  }

  for (const e of visible) {
    if (e.isTextLeaf && e.clipped && (e.scrollH > e.clientH + TOL || e.scrollW > e.clientW + TOL)) {
      push('clipped-text', `${label(e)} is clipped (content ${e.scrollW}x${e.scrollH} vs box ${e.clientW}x${e.clientH})`);
    }
  }

  detectOverlaps(visible, push);
  detectBadWraps(visible, push);
  detectReservedCollisions(visible, options.reservedZones ?? [], push);

  return issues.slice(0, MAX_ISSUES);
}

/**
 * Flag content that intrudes into a shell-reserved zone (the swipe arrow). The
 * arrow is a ::after pseudo-element absent from the DOM measurement, so we compare
 * the measured text leaves against the known zone rect.
 */
function detectReservedCollisions(
  visible: ElementRect[],
  zones: ReservedZone[],
  push: (t: LayoutIssueType, d: string) => void,
): void {
  if (zones.length === 0) return;
  for (const e of visible) {
    if (!e.isTextLeaf) continue;
    for (const z of zones) {
      if (overlaps(e, z)) {
        push('overlap', `${label(e)} overlaps the ${z.label} — keep content clear of that area`);
      }
    }
  }
}

/**
 * Overlap detection. When the measurements carry DOM hierarchy (id/parentId), a
 * text element is checked against ANY non-ancestor/descendant element (so a number
 * spilling onto a neighbouring box, or text over a sibling card, is caught — not
 * just text-over-text). Without hierarchy it falls back to text-leaf vs text-leaf.
 */
function overlaps(a: Rect, b: Rect): boolean {
  const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const inter = ix * iy;
  if (inter <= 0) return false;
  const minArea = Math.min(area(a), area(b));
  return inter > OVERLAP_AREA_RATIO * minArea && inter > OVERLAP_MIN_AREA;
}

function detectOverlaps(visible: ElementRect[], push: (t: LayoutIssueType, d: string) => void): void {
  const hasHierarchy = visible.some((e) => e.id != null);
  const ancestors = hasHierarchy ? buildAncestorSets(visible) : null;
  const related = (a: ElementRect, b: ElementRect): boolean => {
    if (!ancestors || a.id == null || b.id == null) return false;
    return (ancestors.get(a.id)?.has(b.id) ?? false) || (ancestors.get(b.id)?.has(a.id) ?? false);
  };

  const texts = visible.filter((e) => e.isTextLeaf);
  const candidates = hasHierarchy ? visible : texts;

  for (const a of texts) {
    for (const b of candidates) {
      if (a === b || related(a, b) || !overlaps(a, b)) continue;
      // Sorted labels → the shared `seen` set de-dupes the (a,b)/(b,a) pair.
      const [l1, l2] = [label(a), label(b)].sort((x, y) => x.localeCompare(y));
      push('overlap', `${l1} overlaps ${l2}`);
    }
  }
}

/**
 * Detect a short single-token value (e.g. "0,27%") that wrapped onto 2+ lines —
 * a common KPI defect. Needs fontSize/lineHeight; a no-op without them.
 */
function detectBadWraps(visible: ElementRect[], push: (t: LayoutIssueType, d: string) => void): void {
  for (const e of visible) {
    if (!e.isTextLeaf || !e.lineHeight || e.lineHeight <= 0) continue;
    const token = e.text.trim();
    if (token.length === 0 || token.length > 12 || /\s/.test(token)) continue; // only short, single-token values
    const renderedHeight = e.bottom - e.top;
    if (renderedHeight > e.lineHeight * 1.6) {
      push('wrapped-text', `${label(e)} wraps onto multiple lines (height ${Math.round(renderedHeight)}px vs line-height ${Math.round(e.lineHeight)}px) — it should fit on one line`);
    }
  }
}
