import 'dotenv/config';
import express from 'express';
import { log } from '@/lib/log';
import { buildBundle } from '@/remotion/bundler';
import { mountDiscoveryRoutes, mountRenderRoutes } from './routes';
import { errorHandler } from './errors';

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
  app.use(errorHandler);

  app.listen(PORT, () => {
    log.info('server.listening', { port: PORT });
  });
}

main().catch((err) => {
  log.error('server.fatal', { message: (err as Error).message });
  process.exit(1);
});
