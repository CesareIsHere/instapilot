import type { BrandColors, BrandFont } from '@/server/brand';
import { defaultBrandKit } from '@/server/brand';
import { manifest } from '@/assets/manifest';
import { buildFontFaceBlock } from './fonts';
import { buildPaletteCss } from './palette';
import { resolveLogoPath } from '@/server/upload';
import fs from 'node:fs';
import path from 'node:path';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const ASSET_TOKEN_RE = /\{\{asset:([^}]+)\}\}/g;

function extToMime(ext: string): string {
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'png') return 'image/png';
  return 'image/jpeg';
}

function assetToDataUri(assetPath: string): string | null {
  const fullPath = path.join(PUBLIC_DIR, assetPath);
  if (!fs.existsSync(fullPath)) return null;
  const buf = fs.readFileSync(fullPath);
  const ext = path.extname(assetPath).slice(1).toLowerCase();
  return `data:${extToMime(ext)};base64,${buf.toString('base64')}`;
}

function assetToDataUriFromAbsolute(absolutePath: string): string | null {
  if (!fs.existsSync(absolutePath)) return null;
  const buf = fs.readFileSync(absolutePath);
  const ext = path.extname(absolutePath).slice(1).toLowerCase();
  return `data:${extToMime(ext)};base64,${buf.toString('base64')}`;
}

function buildAssetDataUris(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [id, entry] of Object.entries(manifest)) {
    let uri: string | null;
    if (id === 'logo') {
      // Usa il logo caricato dall'utente se disponibile, altrimenti il default.
      uri = assetToDataUriFromAbsolute(resolveLogoPath());
    } else {
      uri = assetToDataUri(entry.path);
    }
    if (uri) result[id] = uri;
  }
  return result;
}

function substituteTokens(str: string, dataUris: Record<string, string>): string {
  return str.replace(ASSET_TOKEN_RE, (_match, id) => {
    const trimmed = id.trim();
    return dataUris[trimmed] ?? `/* unknown asset: ${trimmed} */`;
  });
}

export function buildHtmlDocument(
  bodyHtml: string,
  css: string,
  showArrow = true,
  brandColors?: BrandColors,
  brandFont?: BrandFont,
): string {
  const kit = defaultBrandKit();
  const colors = brandColors ?? kit.brandColors;
  const font = brandFont ?? kit.font;
  const fontFaces = buildFontFaceBlock(font.family);
  const assetUris = buildAssetDataUris();

  const resolvedBodyHtml = substituteTokens(bodyHtml, assetUris);
  const resolvedCss = substituteTokens(css, assetUris);

  const assetCssVars = Object.entries(assetUris)
    .map(([id, uri]) => `  --asset-${id}: url('${uri}');`)
    .join('\n');

  const ctaArrowCss = showArrow
    ? `/* CTA arrow — swipe affordance, bottom-right (omitted on the last slide) */
.canvas::after {
  content: '→';
  position: absolute;
  bottom: 48px;
  right: 56px;
  width: 88px;
  height: 88px;
  border-radius: 50%;
  border: 3px solid var(--brand-primary);
  color: var(--brand-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
  font-family: var(--font-family);
  font-weight: 700;
  line-height: 1;
  pointer-events: none;
}`
    : '';

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=1080">
<style>
${fontFaces}

*, *::before, *::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --brand-primary:  ${colors.primary};
  --brand-positive: ${colors.positive};
  --paper:       ${colors.paper};
  --ink:         ${colors.ink};
  --muted:       ${colors.muted};
  --danger:      ${colors.negative};
  --font-family: '${font.family}', sans-serif;
  --space-xs:  8px;
  --space-sm:  16px;
  --space-md:  24px;
  --space-lg:  40px;
  --space-xl:  64px;
  --space-2xl: 96px;
${buildPaletteCss()}
${assetCssVars}
}

html, body {
  width: 1080px;
  height: 1350px;
  overflow: hidden;
}

.canvas {
  width: 1080px;
  height: 1350px;
  overflow: hidden;
  background: var(--paper);
  font-family: var(--font-family);
  color: var(--ink);
  position: relative;
}

${ctaArrowCss}

${resolvedCss}
</style>
</head>
<body>
<div class="canvas">
${resolvedBodyHtml}
</div>
</body>
</html>`;
}
