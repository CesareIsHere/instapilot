import fs from 'node:fs';
import path from 'node:path';

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
  for (const { weight, file } of VARIANTS) {
    const fullPath = path.join(FONTS_DIR, file);
    if (!fs.existsSync(fullPath)) {
      // Fallback: reference by URL so Chrome can load from CDN if fonts not vendored yet
      faces.push(
        `@font-face { font-family: 'Plus Jakarta Sans'; font-weight: ${weight}; font-style: normal; font-display: block; src: url('https://fonts.gstatic.com/s/plusjakartasans/v8/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_KU7NSg.woff2') format('woff2'); }`,
      );
      continue;
    }
    const dataUri = toDataUri(fullPath);
    faces.push(
      `@font-face { font-family: 'Plus Jakarta Sans'; font-weight: ${weight}; font-style: normal; font-display: block; src: url('${dataUri}') format('woff2'); }`,
    );
  }
  return faces.join('\n');
}
