import React from 'react';
import { AbsoluteFill } from 'remotion';
import { loadFont } from '@remotion/google-fonts/PlusJakartaSans';
import { Background } from '@/chrome/Background';
import { Logo } from '@/chrome/Logo';
import { CarouselNav } from '@/chrome/CarouselNav';
import { layouts } from '@/layouts';
import type { SlideSpec } from '@/schema/slideSpec';

loadFont();

export const Slide: React.FC<SlideSpec> = (slide) => {
  const layout = layouts[slide.layout];
  if (!layout) {
    return (
      <AbsoluteFill style={{ background: 'red', color: 'white', padding: 40 }}>
        Unknown layout: {slide.layout}
      </AbsoluteFill>
    );
  }
  const LayoutComponent = layout.component;

  const LOGO_HEIGHT = 104; // paddingTop(32) + img(72)

  return (
    <AbsoluteFill>
      <Background variant={slide.background} />
      <AbsoluteFill>
        <LayoutComponent blocks={slide.blocks} logoOffset={slide.chrome.showLogo ? LOGO_HEIGHT : 0} />
      </AbsoluteFill>
      {slide.chrome.showLogo && <Logo />}
      {slide.chrome.showCarouselNav && (
        <CarouselNav pageIndex={slide.chrome.pageIndex} totalPages={slide.chrome.totalPages} />
      )}
    </AbsoluteFill>
  );
};

export const defaultSlideProps: SlideSpec = {
  compositionId: 'Slide',
  format: 'post-portrait',
  layout: 'headline-body-illustration',
  background: 'paper',
  chrome: { showLogo: true, showCarouselNav: true, pageIndex: 3 },
  blocks: [
    { type: 'Headline', text: 'La leva del tempo', size: 'xl', color: 'brand-navy' },
    {
      type: 'RichText',
      content: [
        { kind: 'paragraph', text: 'Per Mirco, il vantaggio non sono i soldi, ma il tempo.' },
        {
          kind: 'bullets',
          items: [
            'Ha davanti a sé circa 30-35 anni di lavoro.',
            'Più tempo = più interesse composto.',
            "Sul lunghissimo periodo, i mercati azionari hanno reso il 7-8% all'anno.",
            'Il tempo gli permetterà di partire da piccole cifre a un capitale importante per la sua pensione.',
          ],
        },
      ],
    },
    { type: 'Illustration', assetId: 'money-time-flow', caption: 'Tempo' },
  ],
};
