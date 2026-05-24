import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log } from '@/lib/log';

describe('log', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('writes a JSON line with ts, level, event', () => {
    log.info('render.start', { compositionId: 'Slide' });
    expect(consoleSpy).toHaveBeenCalledOnce();
    const payload = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(payload.level).toBe('info');
    expect(payload.event).toBe('render.start');
    expect(payload.compositionId).toBe('Slide');
    expect(typeof payload.ts).toBe('string');
  });

  it('supports error level', () => {
    log.error('render.fail', { message: 'boom' });
    const payload = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(payload.level).toBe('error');
  });
});
