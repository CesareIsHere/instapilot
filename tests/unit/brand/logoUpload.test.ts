import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveLogoPath } from '@/server/upload';

describe('resolveLogoPath', () => {
  it('ritorna il logo custom se esiste', () => {
    const tmp = path.join(os.tmpdir(), `logo-${Date.now()}.png`);
    fs.writeFileSync(tmp, 'fake-png');
    try {
      expect(resolveLogoPath(tmp)).toBe(tmp);
    } finally { fs.rmSync(tmp, { force: true }); }
  });

  it('ritorna il logo default se custom non esiste', () => {
    const result = resolveLogoPath('/does/not/exist.png');
    // Normalize to forward slashes for cross-platform comparison.
    expect(result.replaceAll('\\', '/')).toContain('public/brand/logo.svg');
  });
});
