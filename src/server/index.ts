import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import { log } from '@/lib/log';
import { buildBundle } from '@/remotion/bundler';
import { mountDiscoveryRoutes, mountRenderRoutes, mountDynamicRoutes, mountHtmlRoutes, mountContentRoutes } from './routes';
import { mountLibraryRoutes, OUTPUT_DIR } from './library';
import { mountJobRoutes } from './jobs';
import { mountBrandRoutes } from './brand';
import { mountConfigRoutes } from './config';
import { mountUploadRoutes } from './upload';
import { closeBrowser } from '@/html/browser';
import { errorHandler } from './errors';
import { readStoredConfig } from '@/config/store';

const WEB_DIR = path.resolve(process.cwd(), 'web', 'dist');

const PORT = Number(process.env.PORT ?? 3001);

async function main() {
  log.info('server.boot', { port: PORT });

  let serveUrl: string;
  try {
    serveUrl = await buildBundle();
  } catch (err) {
    log.error('bundle.failed', { message: (err as Error).message });
    process.exit(1);
  }

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.locals.serveUrl = serveUrl;
  app.locals.bundleReady = true;

  app.get('/health', (_req, res) => {
    const stored = readStoredConfig();
    const hasApiKey = Boolean(stored.apiKey) || Boolean(process.env.LITELLM_API_KEY) || Boolean(process.env.OPENAI_API_KEY);
    res.json({ status: 'ok', bundleReady: app.locals.bundleReady === true, hasApiKey });
  });

  mountDiscoveryRoutes(app);
  mountRenderRoutes(app);
  mountDynamicRoutes(app);
  mountHtmlRoutes(app);
  mountContentRoutes(app);
  mountJobRoutes(app);
  mountLibraryRoutes(app);
  mountBrandRoutes(app);
  mountUploadRoutes(app);
  mountConfigRoutes(app);

  // Generated artifacts (PNG + HTML) — served read-only to the UI.
  app.use('/output', express.static(OUTPUT_DIR));

  // Web UI (zero-build static SPA). SPA fallback to index.html for any GET that
  // didn't match an API/static route above (API + artifact paths fall through to 404).
  app.use(express.static(WEB_DIR));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/output/')) return next();
    res.sendFile(path.join(WEB_DIR, 'index.html'));
  });

  app.use(errorHandler);

  const server = app.listen(PORT, () => {
    log.info('server.listening', { port: PORT });
  });

  const shutdown = async () => {
    log.info('server.shutdown');
    server.close();
    await closeBrowser();
    process.exit(0);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

main().catch((err) => {
  log.error('server.fatal', { message: (err as Error).message });
  process.exit(1);
});
