import { describe, it, expect } from 'vitest';
import { buildOutputPath } from '@/lib/render';

describe('buildOutputPath', () => {
  it('produces a path under output dir with composition id and id segment', () => {
    const p = buildOutputPath('Slide', 'abc123');
    expect(p).toMatch(/output[\\/]Slide-abc123\.png$/);
  });
});
