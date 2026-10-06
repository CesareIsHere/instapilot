import React from 'react';
import { theme } from '@/theme';

interface Props {
  pageIndex?: number;
  totalPages?: number;
}

export const CarouselNav: React.FC<Props> = ({ pageIndex }) => {
  return (
    <>
      <div style={{
        position: 'absolute',
        left: 12, top: '50%',
        transform: 'translateY(-50%)',
        width: 28, height: 28, borderRadius: 14,
        border: `2px solid ${theme.colors.muted}`,
        color: theme.colors.muted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18,
      }}>‹</div>

      <div style={{
        position: 'absolute',
        right: 12, top: '50%',
        transform: 'translateY(-50%)',
        width: 28, height: 28, borderRadius: 14,
        border: `2px solid ${theme.colors.muted}`,
        color: theme.colors.muted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18,
      }}>›</div>

      {pageIndex !== undefined && (
        <div style={{
          position: 'absolute',
          right: 48, bottom: 48,
          width: 80, height: 56, borderRadius: 28,
          border: `2px solid ${theme.colors['brand-primary']}`,
          color: theme.colors['brand-primary'],
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28,
        }}>→</div>
      )}
    </>
  );
};
