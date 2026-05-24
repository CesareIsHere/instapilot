import React from 'react';
import { Composition } from 'remotion';
import { Slide, defaultSlideProps } from './Slide';
import { SlideSpecSchema } from '@/schema/slideSpec';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Slide"
        component={Slide}
        width={1080}
        height={1350}
        fps={30}
        durationInFrames={1}
        defaultProps={defaultSlideProps}
        schema={SlideSpecSchema}
      />
    </>
  );
};
