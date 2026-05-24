import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { log } from '@/lib/log';

export async function buildBundle(): Promise<string> {
  const start = Date.now();
  log.info('bundle.start', {});
  const serveUrl = await bundle({
    entryPoint: path.resolve(process.cwd(), 'src/remotion/index.ts'),
    webpackOverride: (config) => config,
  });
  log.info('bundle.complete', { durationMs: Date.now() - start });
  return serveUrl;
}
