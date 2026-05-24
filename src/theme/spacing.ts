export const spacing = {
  xs: 8,
  sm: 16,
  md: 24,
  lg: 40,
  xl: 64,
  '2xl': 96,
} as const;

export type SpacingToken = keyof typeof spacing;
