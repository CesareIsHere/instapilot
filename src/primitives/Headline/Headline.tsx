import React from 'react';
import { theme } from '@/theme';
import type { HeadlineProps } from './schema';

export const Headline: React.FC<HeadlineProps> = ({ text, size, color = 'brand-navy' }) => {
  return (
    <div
      style={{
        fontFamily: theme.typography.fontFamily,
        fontSize: theme.typography.sizes[size],
        fontWeight: theme.typography.weights.bold,
        color: theme.colors[color],
        lineHeight: theme.typography.lineHeight,
        letterSpacing: '-0.02em',
      }}
    >
      {text}
    </div>
  );
};
