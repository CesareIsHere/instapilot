import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { log } from '@/lib/log';

export async function buildBundle(): Promise<string> {
  const start = Date.now();
  log.info('bundle.start', {});
  const serveUrl = await bundle({
    entryPoint: path.resolve(process.cwd(), 'src/remotion/index.ts'),
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        alias: {
          ...((config.resolve?.alias as Record<string, string>) ?? {}),
          '@': path.resolve(process.cwd(), 'src'),
        },
      },
    }),
  });
  log.info('bundle.complete', { durationMs: Date.now() - start });
  return serveUrl;
}
