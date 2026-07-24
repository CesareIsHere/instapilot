import React from 'react';
import { theme } from '@/theme';
import type { FooterProps } from './schema';

// Configurable via env, with brand-neutral defaults so the repo runs out-of-the-box.
// (Guarded for the Remotion bundle where `process` may be undefined.)
const env = typeof process !== 'undefined' ? process.env : undefined;
const DISCLAIMER = env?.BRAND_DISCLAIMER || 'Contenuto a scopo informativo/educativo.';
const BRAND = env?.BRAND_HANDLE || '@yourbrand';

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
