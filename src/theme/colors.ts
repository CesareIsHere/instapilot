export const colors = {
  'brand-navy':  '#012A78',
  'brand-green': '#00B373',
  'paper':       '#FFFFFF',
  'ink':         '#101010',
  'muted':       '#767676',
  'danger':      '#DC2626',
} as const;

export type ColorToken = keyof typeof colors;
