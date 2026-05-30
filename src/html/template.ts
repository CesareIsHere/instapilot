import { theme } from '@/theme';
import { manifest } from '@/assets/manifest';
import { buildFontFaceBlock } from './fonts';
import fs from 'node:fs';
import path from 'node:path';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const ASSET_TOKEN_RE = /\{\{asset:([^}]+)\}\}/g;

function assetToDataUri(assetPath: string): string | null {
  const fullPath = path.join(PUBLIC_DIR, assetPath);
  if (!fs.existsSync(fullPath)) return null;
  const buf = fs.readFileSync(fullPath);
  const ext = path.extname(assetPath).slice(1).toLowerCase();
  const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

let cachedAssetUris: Record<string, string> | null = null;

function buildAssetDataUris(): Record<string, string> {
  if (cachedAssetUris !== null) return cachedAssetUris;
  const result: Record<string, string> = {};
  for (const [id, entry] of Object.entries(manifest)) {
    const uri = assetToDataUri(entry.path);
    if (uri) result[id] = uri;
  }
  cachedAssetUris = result;
  return result;
}

function substituteTokens(str: string, dataUris: Record<string, string>): string {
  return str.replace(ASSET_TOKEN_RE, (_match, id) => {
    const trimmed = id.trim();
    return dataUris[trimmed] ?? `/* unknown asset: ${trimmed} */`;
  });
}

export function buildHtmlDocument(bodyHtml: string, css: string): string {
  const fontFaces = buildFontFaceBlock();
  const assetUris = buildAssetDataUris();

  const resolvedBodyHtml = substituteTokens(bodyHtml, assetUris);
  const resolvedCss = substituteTokens(css, assetUris);

  const assetCssVars = Object.entries(assetUris)
    .map(([id, uri]) => `  --asset-${id}: url('${uri}');`)
    .join('\n');

  const c = theme.colors;
  const sp = theme.spacing;

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
  --brand-navy: ${c['brand-navy']};
  --brand-gold: ${c['brand-gold']};
  --paper: ${c['paper']};
  --ink: ${c['ink']};
  --muted: ${c['muted']};
  --font-family: 'Plus Jakarta Sans', sans-serif;
  --space-xs: ${sp.xs}px;
  --space-sm: ${sp.sm}px;
  --space-md: ${sp.md}px;
  --space-lg: ${sp.lg}px;
  --space-xl: ${sp.xl}px;
  --space-2xl: ${sp['2xl']}px;
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
