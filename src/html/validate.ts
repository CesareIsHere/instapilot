import { manifest } from '@/assets/manifest';

const FORBIDDEN_TAG = /<script[\s>]/i;
const FORBIDDEN_HANDLER = /\bon\w+\s*=/i;
// Remote URLs are forbidden, EXCEPT the W3C SVG/XML namespace (inline SVG connectors need xmlns="http://www.w3.org/…").
const REMOTE_URL = /https?:\/\/(?!www\.w3\.org\/)/i;
const ASSET_TOKEN = /\{\{asset:([^}]+)\}\}/g;

// Brand CSS rules — deterministically checkable (no need to rely on the vision reviewer).
// Hex color literals: 3- or 6-digit, but not id selectors (`#fff {`).
const HEX_COLOR = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b(?!\s*\{)/;
const ROOT_SELECTOR = /:root\b/i;
const AT_IMPORT = /@import\b/i;
const AT_FONT_FACE = /@font-face\b/i;
// box-shadow value capture (allow the explicit reset `box-shadow: none`).
const BOX_SHADOW = /box-shadow\s*:\s*([^;}]+)/i;
const GRADIENT = /(?:linear|radial|conic)-gradient\s*\(/i;
const VIEWPORT_UNIT = /\b\d*\.?\d+(?:vw|vh|vmin|vmax)\b/i;

export interface ValidationError {
  code: 'INVALID_HTML';
  detail: string;
}

export function validateGeneratedHtml(bodyHtml: string, css: string): ValidationError | null {
  const combined = bodyHtml + '\n' + css;
  const violations: string[] = [];

  // ── Security / correctness ───────────────────────────────────────────────
  if (FORBIDDEN_TAG.test(combined)) violations.push('<script> tag not allowed');
  if (FORBIDDEN_HANDLER.test(combined)) violations.push('inline event handler (on*=) not allowed');
  if (REMOTE_URL.test(combined)) violations.push('remote http(s):// URLs not allowed — use {{asset:<id>}} tokens');

  ASSET_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ASSET_TOKEN.exec(combined)) !== null) {
    const id = match[1].trim();
    if (!manifest[id]) {
      violations.push(`unknown asset id: "${id}" — available: ${Object.keys(manifest).join(', ')}`);
    }
  }

  // ── Brand CSS rules ──────────────────────────────────────────────────────
  if (HEX_COLOR.test(combined)) violations.push('hardcoded hex color found — use brand CSS custom properties only (var(--brand-navy), var(--brand-green), var(--danger), var(--ink), var(--muted), var(--paper))');
  if (ROOT_SELECTOR.test(combined)) violations.push(':root selector not allowed — custom properties are provided by the shell');
  if (AT_IMPORT.test(combined)) violations.push('@import not allowed');
  if (AT_FONT_FACE.test(combined)) violations.push('@font-face not allowed — Montserrat is provided by the shell');
  const shadow = BOX_SHADOW.exec(combined);
  if (shadow && shadow[1].trim().toLowerCase() !== 'none') violations.push('box-shadow not allowed — the brand is clean and flat (use a 2px navy border instead)');
  if (GRADIENT.test(combined)) violations.push('gradients not allowed — background must be pure white');
  if (VIEWPORT_UNIT.test(combined)) violations.push('viewport units (vw/vh/vmin/vmax) not allowed — the canvas is exactly 1080×1350px, use fixed pixel values');

  if (violations.length === 0) return null;
  return { code: 'INVALID_HTML', detail: violations.join('; ') };
}
