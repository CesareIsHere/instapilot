import { describe, it, expect } from 'vitest';
import { buildSandboxGlobals } from '@/dynamic/sandbox';
import { theme } from '@/theme';

describe('buildSandboxGlobals', () => {
  const assets = { 'logo-f': 'http://x/logo.svg' };

  it('exposes React with hooks', () => {
    const g = buildSandboxGlobals(theme, assets);
    expect(typeof g.React.createElement).toBe('function');
    expect(typeof g.React.useState).toBe('function');
  });

  it('exposes Remotion APIs', () => {
    const g = buildSandboxGlobals(theme, assets);
    expect(typeof g.Remotion.AbsoluteFill).toBe('function');
    expect(typeof g.Remotion.Img).toBe('function');
    expect(typeof g.Remotion.staticFile).toBe('function');
  });

  it('exposes the four primitives', () => {
    const g = buildSandboxGlobals(theme, assets);
    expect(typeof g.primitives.Headline).toBe('function');
    expect(typeof g.primitives.RichText).toBe('function');
    expect(typeof g.primitives.Illustration).toBe('function');
    expect(typeof g.primitives.Footer).toBe('function');
  });
});
