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

  if (m.scrollWidth > canvas.width + TOL) {
    push('overflow', `canvas content is ${m.scrollWidth - canvas.width}px wider than ${canvas.width}px (scrollWidth ${m.scrollWidth})`);
  }
  if (m.scrollHeight > canvas.height + TOL) {
    push('overflow', `canvas content is ${m.scrollHeight - canvas.height}px taller than ${canvas.height}px (scrollHeight ${m.scrollHeight})`);
  }

  const visible = m.elements.filter((e) => area(e) > 0);

  for (const e of visible) {
    if (e.left < -TOL || e.top < -TOL || e.right > canvas.width + TOL || e.bottom > canvas.height + TOL) {
      push('exceeds-canvas', `${label(e)} extends to [${Math.round(e.left)},${Math.round(e.top)},${Math.round(e.right)},${Math.round(e.bottom)}] (outside 0,0-${canvas.width},${canvas.height})`);
    }
  }

  for (const e of visible) {
    if (e.isTextLeaf && e.clipped && (e.scrollH > e.clientH + TOL || e.scrollW > e.clientW + TOL)) {
      push('clipped-text', `${label(e)} is clipped (content ${e.scrollW}x${e.scrollH} vs box ${e.clientW}x${e.clientH})`);
    }
  }

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
