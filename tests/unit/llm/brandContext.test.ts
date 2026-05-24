import { describe, it, expect } from 'vitest';
import { loadBrandContext } from '@/llm/brandContext';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('loadBrandContext', () => {
  it('reads markdown file from path and returns its content', () => {
    const tmp = path.join(os.tmpdir(), `brand-${Date.now()}.md`);
    fs.writeFileSync(tmp, '# Test Brand\n\nVoice: serio.');
    try {
      const result = loadBrandContext(tmp);
      expect(result).toContain('Test Brand');
      expect(result).toContain('Voice: serio');
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('returns a default fallback when path is missing', () => {
    const result = loadBrandContext('/does/not/exist.md');
    expect(result).toContain('Brand context unavailable');
  });

  it('truncates files larger than 8000 chars', () => {
    const tmp = path.join(os.tmpdir(), `brand-large-${Date.now()}.md`);
    fs.writeFileSync(tmp, 'x'.repeat(10_000));
    try {
      const result = loadBrandContext(tmp);
      expect(result.length).toBeLessThanOrEqual(8200);
      expect(result).toContain('truncated');
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});
