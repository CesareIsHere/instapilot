import React from 'react';
import { AbsoluteFill } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';
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
    { type: 'Headline', text: "Il potere dell'1%", size: 'xl', color: 'brand-primary' },
    {
      type: 'RichText',
      content: [
        { kind: 'paragraph', text: 'Per Giulia, il vantaggio non è il talento, ma la costanza.' },
        {
          kind: 'bullets',
          items: [
            "Ha davanti a sé 365 occasioni all'anno per migliorare.",
            'Più costanza = più effetto cumulativo.',
            "Migliorare dell'1% al giorno vuol dire ~37 volte meglio in un anno.",
            'La costanza le permetterà di partire da piccoli gesti e arrivare a grandi risultati.',
          ],
        },
      ],
    },
    { type: 'Illustration', assetId: 'growth-steps', caption: 'Costanza' },
  ],
};
