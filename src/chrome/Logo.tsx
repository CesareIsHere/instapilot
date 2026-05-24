import React from 'react';
import { Img, staticFile } from 'remotion';
import { manifest } from '@/assets/manifest';

export const Logo: React.FC = () => {
  const entry = manifest['logo-f'];
  if (!entry) return null;
  return (
    <div style={{
      width: '100%',
      display: 'flex',
      justifyContent: 'center',
      paddingTop: 32,
    }}>
      <Img src={staticFile(entry.path)} style={{ height: 72, width: 72 }} />
    </div>
  );
};
