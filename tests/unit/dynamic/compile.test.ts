import { describe, it, expect } from 'vitest';
import { compileTsx, validateTsx } from '@/dynamic/compile';

describe('compileTsx', () => {
  it('transforms TSX to plain JS', () => {
    const out = compileTsx('const Slide = () => <div>Hi</div>;');
    expect(out).toContain('React.createElement');
    expect(out).not.toContain('<div>');
  });

  it('strips TypeScript type annotations', () => {
    const out = compileTsx('const Slide: React.FC = () => <div />;');
    expect(out).not.toContain(': React.FC');
  });
});

describe('validateTsx', () => {
  it('returns null for valid TSX', () => {
    expect(validateTsx('const Slide = () => <div />;')).toBeNull();
  });

  it('returns error message for malformed TSX', () => {
    const err = validateTsx('const Slide = () => <div;');
    expect(err).toBeTruthy();
    expect(typeof err).toBe('string');
  });
});
