import React from 'react';
import { theme } from '@/theme';
import type { FooterProps } from './schema';

const DISCLAIMER = "Contenuto a scopo informativo/educativo. Non è consulenza finanziaria.";
const BRAND = "@finvestire";

export const Footer: React.FC<FooterProps> = (props) => {
  const text = props.variant === 'brand' ? BRAND
             : props.variant === 'disclaimer' ? DISCLAIMER
             : (props.text ?? '');

  return (
    <div style={{
      fontFamily: theme.typography.fontFamily,
      fontSize: theme.typography.sizes.sm * 0.7,
      color: theme.colors.muted,
      textAlign: 'center',
      width: '100%',
    }}>
      {text}
    </div>
  );
};
