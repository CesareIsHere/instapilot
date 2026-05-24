type Level = 'debug' | 'info' | 'warn' | 'error';

function write(level: Level, event: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  }));
}

export const log = {
  debug: (event: string, fields?: Record<string, unknown>) => write('debug', event, fields),
  info:  (event: string, fields?: Record<string, unknown>) => write('info', event, fields),
  warn:  (event: string, fields?: Record<string, unknown>) => write('warn', event, fields),
  error: (event: string, fields?: Record<string, unknown>) => write('error', event, fields),
};
