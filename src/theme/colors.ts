export const colors = {
  'brand-primary':  '#4F46E5',
  'brand-positive': '#059669',
  'paper':          '#FFFFFF',
  'ink':            '#111827',
  'muted':          '#6B7280',
  'danger':         '#DC2626',
} as const;

export type ColorToken = keyof typeof colors;
