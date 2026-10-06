import fs from 'node:fs';
import path from 'node:path';
import { log } from '@/lib/log';

const FONTS_DIR = path.resolve(process.cwd(), 'public/fonts');

function toDataUri(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return `data:font/woff2;base64,${buf.toString('base64')}`;
}

export function buildFontFaceBlock(fontFamily = 'Inter'): string {
  // Per font custom in data/fonts/custom/, usa quella directory.
  const customDir = path.resolve(process.cwd(), 'data', 'fonts', 'custom');
  const fontsDir = fs.existsSync(path.join(customDir, `${fontFamily}-Regular.woff2`))
    ? customDir
    : FONTS_DIR;

  const variants = [
    { weight: 400, file: `${fontFamily}-Regular.woff2` },
    { weight: 500, file: `${fontFamily}-Medium.woff2` },
    { weight: 600, file: `${fontFamily}-SemiBold.woff2` },
    { weight: 700, file: `${fontFamily}-Bold.woff2` },
    { weight: 800, file: `${fontFamily}-ExtraBold.woff2` },
  ];

  const faces: string[] = [];
  const missing: number[] = [];
  for (const { weight, file } of variants) {
    const fullPath = path.join(fontsDir, file);
    if (!fs.existsSync(fullPath)) { missing.push(weight); continue; }
    const dataUri = toDataUri(fullPath);
    faces.push(
      `@font-face { font-family: '${fontFamily}'; font-weight: ${weight}; font-style: normal; font-display: block; src: url('${dataUri}') format('woff2'); }`,
    );
  }
  if (missing.length > 0) log.warn('html.fonts.missing', { weights: missing, dir: fontsDir, family: fontFamily });
  return faces.join('\n');
}
