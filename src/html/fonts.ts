import fs from 'node:fs';
import path from 'node:path';
import { log } from '@/lib/log';

const FONTS_DIR = path.resolve(process.cwd(), 'public/fonts');

interface FontVariant {
  weight: number;
  file: string;
}

const VARIANTS: FontVariant[] = [
  { weight: 400, file: 'PlusJakartaSans-Regular.woff2' },
  { weight: 500, file: 'PlusJakartaSans-Medium.woff2' },
  { weight: 600, file: 'PlusJakartaSans-SemiBold.woff2' },
  { weight: 700, file: 'PlusJakartaSans-Bold.woff2' },
  { weight: 800, file: 'PlusJakartaSans-ExtraBold.woff2' },
];

function toDataUri(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return `data:font/woff2;base64,${buf.toString('base64')}`;
}

export function buildFontFaceBlock(): string {
  const faces: string[] = [];
  const missing: number[] = [];
  for (const { weight, file } of VARIANTS) {
    const fullPath = path.join(FONTS_DIR, file);
    if (!fs.existsSync(fullPath)) {
      missing.push(weight);
      continue;
    }
    const dataUri = toDataUri(fullPath);
    faces.push(
      `@font-face { font-family: 'Plus Jakarta Sans'; font-weight: ${weight}; font-style: normal; font-display: block; src: url('${dataUri}') format('woff2'); }`,
    );
  }
  if (missing.length > 0) {
    // No CDN fallback: remote requests are blocked at render-time. Missing weights
    // degrade to the 'sans-serif' fallback in the font stack.
    log.warn('html.fonts.missing', { weights: missing, dir: FONTS_DIR });
  }
  return faces.join('\n');
}
