import React from 'react';
import { Img, staticFile } from 'remotion';
import { manifest } from '@/assets/manifest';
import { theme } from '@/theme';
import type { IllustrationProps } from './schema';

export const Illustration: React.FC<IllustrationProps> = ({ assetId, caption, align = 'center' }) => {
  const entry = manifest[assetId];
  if (!entry) {
    return <div style={{ color: 'red' }}>missing asset: {assetId}</div>;
  }

  const justify = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: justify, gap: theme.spacing.sm, width: '100%' }}>
      <Img
        src={staticFile(entry.path)}
        style={{ maxWidth: '100%', maxHeight: 400, objectFit: 'contain' }}
      />
      {caption && (
        <div style={{
          fontFamily: theme.typography.fontFamily,
          fontSize: theme.typography.sizes.sm,
          color: theme.colors.ink,
          fontWeight: theme.typography.weights.semibold,
        }}>
          {caption}
        </div>
      )}
    </div>
  );
};
