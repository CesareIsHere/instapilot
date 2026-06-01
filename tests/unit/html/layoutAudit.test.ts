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

  it('does NOT flag a decorative (no-text) element outside the canvas', () => {
    const els = [rect({ text: '', isTextLeaf: false, left: -50, top: 0, right: 1130, bottom: 200 })];
    expect(analyzeLayout(meas(els), CANVAS).some((i) => i.type === 'exceeds-canvas')).toBe(false);
  });

  it('caps the issue list at 12', () => {
    const els: ElementRect[] = [];
    for (let i = 0; i < 30; i++) els.push(rect({ text: `e${i}`, left: 0, top: 0, right: 1200, bottom: 100 }));
    expect(analyzeLayout(meas(els), CANVAS).length).toBeLessThanOrEqual(12);
  });
});
