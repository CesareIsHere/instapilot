import path from 'node:path';
import fs from 'node:fs';
import { getBrowser } from './browser';
import { analyzeLayout, type LayoutIssue, type LayoutMeasurements } from './layoutAudit';
import { log } from '@/lib/log';

const OUTPUT_DIR = process.env.OUTPUT_DIR ?? path.resolve(process.cwd(), 'output');
const RENDER_TIMEOUT_MS = Number(process.env.HTML_RENDER_TIMEOUT_MS ?? 15_000);
const DEVICE_SCALE_FACTOR = Number(process.env.HTML_DEVICE_SCALE_FACTOR ?? 1);
export interface RenderHtmlResult {
  file: string;
  durationMs: number;
  /** Non-empty only when the screenshot was forced despite layout issues (best-effort render). */
  issues: LayoutIssue[];
}

export interface RenderHtmlFailure {
  issues: LayoutIssue[];
  durationMs: number;
}

export interface RenderHtmlOpts {
  /** Screenshot even if layout issues are detected, returning ok:true with `issues` set. */
  force?: boolean;
  /** Output directory (defaults to OUTPUT_DIR env). */
  dir?: string;
  /** Output file name including extension (defaults to `HtmlSlide-<outputId>.png`). */
  fileName?: string;
}

export type RenderHtmlOutcome =
  | ({ ok: true } & RenderHtmlResult)
  | ({ ok: false } & RenderHtmlFailure);

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

    const measurements = (await page.evaluate(() => {
      const canvas = document.querySelector('.canvas') as HTMLElement | null;
      const root = canvas ?? document.documentElement;
      const result = {
        scrollWidth: root.scrollWidth,
        scrollHeight: root.scrollHeight,
        elements: [] as Array<Record<string, unknown>>,
      };
      if (!canvas) return result;
      const cr = canvas.getBoundingClientRect();
      const CLIP_VALUES = new Set(['hidden', 'clip', 'auto', 'scroll']);
      for (const el of Array.from(canvas.querySelectorAll('*'))) {
        const node = el as HTMLElement;
        const cs = getComputedStyle(node);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        if (node.getClientRects().length === 0) continue;
        const r = node.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        const ownText = (node.textContent ?? '').trim();
        const childHasText = Array.from(node.children).some((c) => (c.textContent ?? '').trim().length > 0);
        result.elements.push({
          tag: node.tagName.toLowerCase(),
          cls: typeof node.className === 'string' && node.className ? node.className.split(/\s+/)[0] : '',
          text: ownText.slice(0, 60),
          left: r.left - cr.left, top: r.top - cr.top, right: r.right - cr.left, bottom: r.bottom - cr.top,
          clientW: node.clientWidth, clientH: node.clientHeight,
          scrollW: node.scrollWidth, scrollH: node.scrollHeight,
          clipped: CLIP_VALUES.has(cs.overflowX) || CLIP_VALUES.has(cs.overflowY),
          isTextLeaf: ownText.length > 0 && !childHasText,
        });
      }
      return result;
    })) as unknown as LayoutMeasurements;

    const issues = analyzeLayout(measurements, { width: 1080, height: 1350 });

    if (issues.length > 0 && !opts.force) {
      const durationMs = Date.now() - start;
      log.warn('render.html.layout_issues', { count: issues.length, types: issues.map((i) => i.type) });
      return { ok: false, issues, durationMs };
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
    if (issues.length > 0) {
      log.warn('render.html.forced_with_issues', { file, durationMs, count: issues.length });
    } else {
      log.info('render.html.complete', { file, durationMs });
    }
    return { ok: true, file, durationMs, issues };
  } finally {
    await context.close();
  }
}
