import path from 'node:path';
import crypto from 'node:crypto';
import { renderStill, selectComposition } from '@remotion/renderer';
import { staticFile } from 'remotion';
import type { SlideSpec } from '@/schema/slideSpec';
import { assetExists, listAssets } from '@/assets';
import { theme as brandTheme } from '@/theme';
import { log } from './log';

const OUTPUT_DIR = process.env.OUTPUT_DIR ?? path.resolve(process.cwd(), 'output');

export function buildOutputPath(compositionId: string, id: string): string {
  return path.join(OUTPUT_DIR, `${compositionId}-${id}.png`);
}

export function shortId(): string {
  return crypto.randomBytes(6).toString('hex');
}

export function assertAssetsResolvable(slide: SlideSpec): void {
  for (const block of slide.blocks) {
    if (block.type === 'Illustration') {
      if (!assetExists(block.assetId)) {
        const err: Error & { code?: string; assetId?: string } = new Error(
          `asset_not_found:${block.assetId}`,
        );
        err.code = 'ASSET_NOT_FOUND';
        err.assetId = block.assetId;
        throw err;
      }
    }
  }
}

export interface RenderStillArgs {
  serveUrl: string;
  slide: SlideSpec;
}

export interface RenderStillResult {
  file: string;
  durationMs: number;
}

export async function renderSlideStill({ serveUrl, slide }: RenderStillArgs): Promise<RenderStillResult> {
  assertAssetsResolvable(slide);
  const id = shortId();
  const output = buildOutputPath(slide.compositionId, id);
  const start = Date.now();

  const composition = await selectComposition({
    serveUrl,
    id: slide.compositionId,
    inputProps: slide,
  });

  await renderStill({
    composition,
    serveUrl,
    output,
    inputProps: slide,
  });

  const durationMs = Date.now() - start;
  log.info('render.complete', { compositionId: slide.compositionId, file: output, durationMs });
  return { file: output, durationMs };
}

export interface RenderDynamicArgs {
  serveUrl: string;
  tsxCode: string;
}

export async function renderDynamicStill({ serveUrl, tsxCode }: RenderDynamicArgs): Promise<RenderStillResult> {
  const id = shortId();
  const output = buildOutputPath('DynamicSlide', id);
  const start = Date.now();

  const assetsMap = Object.fromEntries(
    Object.entries(listAssets()).map(([k, v]) => [k, staticFile(v.path)]),
  );
  const inputProps = { tsxCode, theme: brandTheme, assets: assetsMap };

  const composition = await selectComposition({
    serveUrl,
    id: 'DynamicSlide',
    inputProps,
  });

  await renderStill({
    composition,
    serveUrl,
    output,
    inputProps,
  });

  const durationMs = Date.now() - start;
  log.info('render.dynamic.complete', { file: output, durationMs });
  return { file: output, durationMs };
}
