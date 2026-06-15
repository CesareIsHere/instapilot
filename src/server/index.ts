import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import { log } from '@/lib/log';
import { buildBundle } from '@/remotion/bundler';
import { mountDiscoveryRoutes, mountRenderRoutes, mountDynamicRoutes, mountHtmlRoutes, mountContentRoutes } from './routes';
import { mountLibraryRoutes, OUTPUT_DIR } from './library';
import { mountJobRoutes } from './jobs';
import { closeBrowser } from '@/html/browser';
import { errorHandler } from './errors';

const WEB_DIR = path.resolve(process.cwd(), 'web');

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
    res.json({ status: 'ok', bundleReady: app.locals.bundleReady === true });
  });

  mountDiscoveryRoutes(app);
  mountRenderRoutes(app);
  mountDynamicRoutes(app);
  mountHtmlRoutes(app);
  mountContentRoutes(app);
  mountJobRoutes(app);
  mountLibraryRoutes(app);

  // Generated artifacts (PNG + HTML) — served read-only to the UI.
  app.use('/output', express.static(OUTPUT_DIR));

  // Web UI (zero-build static SPA). SPA fallback to index.html for client-side routes.
  app.use(express.static(WEB_DIR));
  app.get(/^\/(?!api\/|output\/|render\/|generate\/|compositions|primitives|layouts|theme|assets|health).*/, (_req, res) => {
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
