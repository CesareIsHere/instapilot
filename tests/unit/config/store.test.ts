import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readStoredConfig, writeStoredConfig } from '@/config/store';

function tmpFile(): string {
  return path.join(os.tmpdir(), `cfg-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

describe('config store', () => {
  it('returns {} when the file does not exist', () => {
    expect(readStoredConfig('/does/not/exist.json')).toEqual({});
  });

  it('writes and reads back a patch', () => {
    const f = tmpFile();
    try {
      writeStoredConfig({ model: 'gpt-5.4', apiKey: 'sk-abc' }, f);
      expect(readStoredConfig(f)).toEqual({ model: 'gpt-5.4', apiKey: 'sk-abc' });
    } finally { fs.rmSync(f, { force: true }); }
  });

  it('merges a patch into existing config (shallow + models deep)', () => {
    const f = tmpFile();
    try {
      writeStoredConfig({ model: 'a', models: { research: 'r1' } }, f);
      const merged = writeStoredConfig({ baseURL: 'http://x', models: { plan: 'p1' } }, f);
      expect(merged).toEqual({ model: 'a', baseURL: 'http://x', models: { research: 'r1', plan: 'p1' } });
    } finally { fs.rmSync(f, { force: true }); }
  });

  it('returns {} on invalid JSON', () => {
    const f = tmpFile();
    try {
      fs.writeFileSync(f, 'not json');
      expect(readStoredConfig(f)).toEqual({});
    } finally { fs.rmSync(f, { force: true }); }
  });
});
