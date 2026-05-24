export const colors = {
  'brand-navy': '#1B3A6B',
  'brand-gold': '#C9A24A',
  'paper': '#F5F1E8',
  'ink': '#1A1A1A',
  'muted': '#6B6B6B',
} as const;

export type ColorToken = keyof typeof colors;
