/**
 * Extended palette for richer infographics (flexible grids, flow diagrams,
 * breakdown charts). These are exposed by the shell as CSS custom properties so
 * the renderer references them via var(--…) and never hardcodes hex (the brand
 * core stays primary/positive/negative/paper — these are STRUCTURAL accents/surfaces meant
 * to distinguish nodes, cards and chart segments, NOT the canvas background).
 */

/** Vivid accents — for borders, connectors, labels on diagram nodes / grid cards. */
export const ACCENTS: Record<string, string> = {
  '--accent-amber': '#E0A400',
  '--accent-sky': '#2F6BEE',
  '--accent-violet': '#6B4FD8',
  '--accent-teal': '#0E9E9E',
};

/** Light pastel surfaces — for filling cards / diagram nodes / chart blocks. */
export const SURFACES: Record<string, string> = {
  '--surface-blue': '#EAF1FC',
  '--surface-green': '#E6F7F0',
  '--surface-amber': '#FBF1D6',
  '--surface-violet': '#EFEAFB',
  '--surface-red': '#FCEBEB',
  '--surface-gray': '#F1F2F4',
};

export const EXTENDED_PALETTE: Record<string, string> = { ...ACCENTS, ...SURFACES };

/** CSS custom-property declarations for injection inside the shell's :root. */
export function buildPaletteCss(): string {
  return Object.entries(EXTENDED_PALETTE)
    .map(([name, hex]) => `  ${name}: ${hex};`)
    .join('\n');
}

/** Human-readable documentation of the palette for the renderer's system prompt. */
export function buildPaletteDocs(): string {
  const accents = Object.keys(ACCENTS).map((v) => `var(${v})`).join(', ');
  const surfaces = Object.keys(SURFACES).map((v) => `var(${v})`).join(', ');
  return [
    `Accent colors (borders, connectors, node/section labels): ${accents}, plus the core var(--brand-primary), var(--brand-positive), var(--danger).`,
    `Light surface fills (card / diagram-node / chart-block backgrounds — NEVER the canvas): ${surfaces}, plus var(--paper) for white.`,
  ].join('\n');
}
