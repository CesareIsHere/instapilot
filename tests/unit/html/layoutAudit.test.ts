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

  describe('hierarchy-aware overlap (id/parentId present)', () => {
    it('flags a text element overlapping a NON-ancestor box (e.g. number over a sibling card)', () => {
      const els = [
        rect({ id: 0, parentId: -1, text: '', isTextLeaf: false, left: 0, top: 0, right: 1080, bottom: 1350 }), // root wrapper
        rect({ id: 1, parentId: 0, text: '', isTextLeaf: false, left: 60, top: 400, right: 360, bottom: 700 }), // card A box
        rect({ id: 2, parentId: 0, text: '0,27%', isTextLeaf: true, left: 80, top: 300, right: 340, bottom: 480 }), // number overlapping card A box
      ];
      const issues = analyzeLayout(meas(els), CANVAS);
      expect(issues.some((i) => i.type === 'overlap')).toBe(true);
    });

    it('does NOT flag a text leaf overlapping its OWN ancestor container', () => {
      const els = [
        rect({ id: 0, parentId: -1, text: '', isTextLeaf: false, left: 60, top: 400, right: 360, bottom: 700 }), // box
        rect({ id: 1, parentId: 0, text: 'inside', isTextLeaf: true, left: 80, top: 420, right: 340, bottom: 680 }), // text inside the box
      ];
      const issues = analyzeLayout(meas(els), CANVAS);
      expect(issues.some((i) => i.type === 'overlap')).toBe(false);
    });

    it('flags a short value that wrapped onto multiple lines', () => {
      const els = [
        rect({ id: 0, parentId: -1, text: '0,27%', isTextLeaf: true, left: 80, top: 300, right: 240, bottom: 540, fontSize: 120, lineHeight: 120 }),
      ];
      const issues = analyzeLayout(meas(els), CANVAS);
      expect(issues.some((i) => i.type === 'wrapped-text')).toBe(true);
    });

    it('does NOT flag a single-line value or wrapping multi-word text', () => {
      const single = [rect({ id: 0, parentId: -1, text: '0,27%', isTextLeaf: true, left: 80, top: 300, right: 240, bottom: 430, fontSize: 120, lineHeight: 120 })];
      expect(analyzeLayout(meas(single), CANVAS).some((i) => i.type === 'wrapped-text')).toBe(false);
      const multiWord = [rect({ id: 0, parentId: -1, text: 'una frase lunga', isTextLeaf: true, left: 80, top: 300, right: 240, bottom: 540, fontSize: 40, lineHeight: 48 })];
      expect(analyzeLayout(meas(multiWord), CANVAS).some((i) => i.type === 'wrapped-text')).toBe(false);
    });
  });

  describe('reserved-zone collision (swipe arrow)', () => {
    // The shell arrow zone: ~[936,1214]–[1024,1302].
    const arrow = { label: 'swipe arrow (bottom-right)', left: 936, top: 1214, right: 1024, bottom: 1302 };

    it('flags a text node overlapping the swipe arrow zone', () => {
      const els = [rect({ text: 'Quota fissa', isTextLeaf: true, left: 110, top: 1180, right: 1000, bottom: 1290 })];
      const issues = analyzeLayout(meas(els), CANVAS, { reservedZones: [arrow] });
      expect(issues.some((i) => i.type === 'overlap' && /swipe arrow/.test(i.detail))).toBe(true);
    });

    it('does NOT flag when content stays clear of the arrow', () => {
      const els = [rect({ text: 'Quota fissa', isTextLeaf: true, left: 110, top: 1050, right: 880, bottom: 1150 })];
      const issues = analyzeLayout(meas(els), CANVAS, { reservedZones: [arrow] });
      expect(issues.some((i) => /swipe arrow/.test(i.detail))).toBe(false);
    });

    it('does nothing when no reserved zones are passed (last/cta slides)', () => {
      const els = [rect({ text: 'x', isTextLeaf: true, left: 936, top: 1214, right: 1024, bottom: 1302 })];
      expect(analyzeLayout(meas(els), CANVAS).some((i) => /swipe arrow/.test(i.detail))).toBe(false);
    });
  });
});
