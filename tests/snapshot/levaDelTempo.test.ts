import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { buildBundle } from '@/remotion/bundler';
import { renderSlideStill } from '@/lib/render';
import type { SlideSpec } from '@/schema/slideSpec';

const FIXTURE = path.resolve('tests/snapshot/fixtures/leva-del-tempo.json');
const BASELINE = path.resolve('tests/snapshot/baselines/leva-del-tempo.png');
const TOLERANCE_RATIO = 0.01;

let serveUrl: string;

beforeAll(async () => {
  serveUrl = await buildBundle();
}, 60_000);

describe('snapshot: leva-del-tempo', () => {
  it('matches baseline (or creates one on first run)', async () => {
    const raw = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    const slide: SlideSpec = raw.slide;

    const { file } = await renderSlideStill({ serveUrl, slide });

    if (!fs.existsSync(BASELINE)) {
      fs.copyFileSync(file, BASELINE);
      console.warn(`[snapshot] created new baseline at ${BASELINE} — review it and commit`);
      return;
    }

    const actual = PNG.sync.read(fs.readFileSync(file));
    const expected = PNG.sync.read(fs.readFileSync(BASELINE));
    expect(actual.width).toBe(expected.width);
    expect(actual.height).toBe(expected.height);

    const diff = new PNG({ width: actual.width, height: actual.height });
    const numDiffPixels = pixelmatch(
      actual.data, expected.data, diff.data,
      actual.width, actual.height,
      { threshold: 0.1 },
    );
    const totalPixels = actual.width * actual.height;
    const ratio = numDiffPixels / totalPixels;

    if (ratio > TOLERANCE_RATIO) {
      const diffPath = path.resolve('output/leva-del-tempo.diff.png');
      fs.writeFileSync(diffPath, PNG.sync.write(diff));
      console.error(`[snapshot] diff ratio ${ratio.toFixed(4)} exceeds tolerance. Diff saved to ${diffPath}`);
    }
    expect(ratio).toBeLessThanOrEqual(TOLERANCE_RATIO);
  }, 60_000);
});
