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
}

export interface RenderHtmlOverflow {
  overflow: OverflowResult;
  durationMs: number;
}

export type RenderHtmlOutcome =
  | ({ ok: true } & RenderHtmlResult)
  | ({ ok: false } & RenderHtmlOverflow);

export async function renderHtmlStill(html: string, outputId: string): Promise<RenderHtmlOutcome> {
  const start = Date.now();
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewportSize({ width: 1080, height: 1350, deviceScaleFactor: DEVICE_SCALE_FACTOR } as Parameters<typeof page.setViewportSize>[0]);

    // Block remote network — allow data: and blob: (embedded fonts/assets)
    await page.route(/^https?:\/\//, (route) => route.abort());

    await page.setContent(html, { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS });
    await page.evaluate(() => document.fonts.ready);

    // Measure overflow on .canvas
    const measurements = await page.evaluate(() => {
      const canvas = document.querySelector('.canvas') as HTMLElement | null;
      const el = canvas ?? document.documentElement;
      return {
        scrollWidth: el.scrollWidth,
        scrollHeight: el.scrollHeight,
      };
    });

    const overflowX = measurements.scrollWidth > 1080 + OVERFLOW_TOLERANCE_PX;
    const overflowY = measurements.scrollHeight > 1350 + OVERFLOW_TOLERANCE_PX;

    if (overflowX || overflowY) {
      const durationMs = Date.now() - start;
      log.warn('render.html.overflow', { ...measurements, overflowX, overflowY });
      return {
        ok: false,
        overflow: {
          x: overflowX,
          y: overflowY,
          scrollWidth: measurements.scrollWidth,
          scrollHeight: measurements.scrollHeight,
        },
        durationMs,
      };
    }

    // No overflow — take the screenshot
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    const file = path.join(OUTPUT_DIR, `HtmlSlide-${outputId}.png`);

    await page.screenshot({
      path: file,
      clip: { x: 0, y: 0, width: 1080, height: 1350 },
      type: 'png',
    });

    const durationMs = Date.now() - start;
    log.info('render.html.complete', { file, durationMs });
    return { ok: true, file, durationMs };
  } finally {
    await page.close();
  }
}
