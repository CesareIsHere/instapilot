import path from 'node:path';
import fs from 'node:fs';
import { getBrowser } from './browser';
import type { OverflowResult } from './schema';
import { log } from '@/lib/log';

const OUTPUT_DIR = process.env.OUTPUT_DIR ?? path.resolve(process.cwd(), 'output');
const RENDER_TIMEOUT_MS = Number(process.env.HTML_RENDER_TIMEOUT_MS ?? 15_000);
const DEVICE_SCALE_FACTOR = Number(process.env.HTML_DEVICE_SCALE_FACTOR ?? 1);
const OVERFLOW_TOLERANCE_PX = 1;

export interface RenderHtmlResult {
  file: string;
  durationMs: number;
  /** Present when the screenshot was forced despite overflow (best-effort render). */
  overflow?: OverflowResult;
}

export interface RenderHtmlOverflow {
  overflow: OverflowResult;
  durationMs: number;
}

export interface RenderHtmlOpts {
  /** Screenshot even if overflow is detected, returning ok:true with `overflow` set. */
  force?: boolean;
  /** Output directory (defaults to OUTPUT_DIR env). */
  dir?: string;
  /** Output file name including extension (defaults to `HtmlSlide-<outputId>.png`). */
  fileName?: string;
}

export type RenderHtmlOutcome =
  | ({ ok: true } & RenderHtmlResult)
  | ({ ok: false } & RenderHtmlOverflow);

export async function renderHtmlStill(
  html: string,
  outputId: string,
  opts: RenderHtmlOpts = {},
): Promise<RenderHtmlOutcome> {
  const start = Date.now();
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1350 },
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  });

  try {
    const page = await context.newPage();
    await page.route(/^https?:\/\//, (route) => route.abort());
    await page.setContent(html, { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS });
    await page.evaluate(async () => { await document.fonts.ready; });

    const measurements = await page.evaluate(() => {
      const canvas = document.querySelector('.canvas') as HTMLElement | null;
      const el = canvas ?? document.documentElement;
      return { scrollWidth: el.scrollWidth, scrollHeight: el.scrollHeight };
    });

    const overflowX = measurements.scrollWidth > 1080 + OVERFLOW_TOLERANCE_PX;
    const overflowY = measurements.scrollHeight > 1350 + OVERFLOW_TOLERANCE_PX;
    const hasOverflow = overflowX || overflowY;
    const overflow: OverflowResult = {
      x: overflowX,
      y: overflowY,
      scrollWidth: measurements.scrollWidth,
      scrollHeight: measurements.scrollHeight,
    };

    if (hasOverflow && !opts.force) {
      const durationMs = Date.now() - start;
      log.warn('render.html.overflow', { ...measurements, overflowX, overflowY });
      return { ok: false, overflow, durationMs };
    }

    const dir = opts.dir ?? OUTPUT_DIR;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const fileName = opts.fileName ?? `HtmlSlide-${outputId}.png`;
    const file = path.join(dir, fileName);

    await page.screenshot({
      path: file,
      clip: { x: 0, y: 0, width: 1080, height: 1350 },
      type: 'png',
    });

    const durationMs = Date.now() - start;
    if (hasOverflow) {
      log.warn('render.html.forced_overflow', { file, durationMs, ...measurements });
      return { ok: true, file, durationMs, overflow };
    }
    log.info('render.html.complete', { file, durationMs });
    return { ok: true, file, durationMs };
  } finally {
    await context.close();
  }
}
