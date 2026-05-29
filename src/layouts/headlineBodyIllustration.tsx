import React from 'react';
import { theme } from '@/theme';
import { primitives, type BlockProps } from '@/primitives';

interface Props {
  blocks: BlockProps[];
  logoOffset?: number;
}

export const HeadlineBodyIllustration: React.FC<Props> = ({ blocks, logoOffset = 0 }) => {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      paddingTop: theme.spacing.lg + logoOffset,
      paddingBottom: theme.spacing.lg,
      paddingLeft: theme.spacing.xl,
      paddingRight: theme.spacing.xl,
      gap: theme.spacing.lg,
      boxSizing: 'border-box',
      overflow: 'hidden',
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
