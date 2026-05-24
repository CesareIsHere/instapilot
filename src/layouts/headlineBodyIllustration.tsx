import React from 'react';
import { theme } from '@/theme';
import { primitives, type BlockProps } from '@/primitives';

interface Props {
  blocks: BlockProps[];
}

export const HeadlineBodyIllustration: React.FC<Props> = ({ blocks }) => {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      padding: `${theme.spacing.lg}px ${theme.spacing.xl}px`,
      gap: theme.spacing.lg,
      boxSizing: 'border-box',
    }}>
      {blocks.map((block, idx) => {
        const entry = primitives[block.type as keyof typeof primitives];
        if (!entry) return null;
        const Component = entry.component as React.FC<typeof block>;
        return (
          <div key={idx} style={{ width: '100%' }}>
            <Component {...block} />
          </div>
        );
      })}
    </div>
  );
};
