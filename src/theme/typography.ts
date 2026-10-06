export const typography = {
  fontFamily: 'Inter, sans-serif',
  sizes: {
    sm: 28,
    md: 36,
    lg: 56,
    xl: 88,
  },
  weights: {
    regular: 400,
    semibold: 600,
    bold: 800,
  },
  lineHeight: 1.25,
} as const;

export type SizeToken = keyof typeof typography.sizes;
