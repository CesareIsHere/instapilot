import React from 'react';
import { theme } from '@/theme';
import type { RichTextProps } from './schema';

export const RichText: React.FC<RichTextProps> = ({ content }) => {
  return (
    <div
      style={{
        fontFamily: theme.typography.fontFamily,
        fontSize: theme.typography.sizes.md,
        fontWeight: theme.typography.weights.regular,
        color: theme.colors.ink,
        lineHeight: 1.4,
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.md,
      }}
    >
      {content.map((block, idx) => {
        if (block.kind === 'paragraph') {
          return <p key={idx} style={{ margin: 0 }}>{block.text}</p>;
        }
        return (
          <ul key={idx} style={{ margin: 0, paddingLeft: theme.spacing.lg, display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
            {block.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        );
      })}
    </div>
  );
};
