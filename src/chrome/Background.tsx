import React from 'react';
import { AbsoluteFill } from 'remotion';
import { theme } from '@/theme';

interface Props {
  variant: 'paper';
}

export const Background: React.FC<Props> = ({ variant }) => {
  if (variant === 'paper') {
    return (
      <AbsoluteFill style={{
        backgroundColor: theme.colors.paper,
      }} />
    );
  }
  return null;
};
