import { describe, it, expect } from 'vitest';
import { theme } from '@/theme';

describe('theme', () => {
  it('exposes colors, typography, spacing as single object', () => {
    expect(theme.colors).toBeDefined();
    expect(theme.typography).toBeDefined();
    expect(theme.spacing).toBeDefined();
  });

  it('includes brand-primary and paper colors', () => {
    expect(theme.colors['brand-primary']).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(theme.colors['paper']).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('exposes a fontFamily on typography', () => {
    expect(typeof theme.typography.fontFamily).toBe('string');
  });

  it('spacing scale uses numeric pixel values', () => {
    expect(typeof theme.spacing.md).toBe('number');
    expect(theme.spacing.md).toBeGreaterThan(0);
  });
});
