import * as React from 'react';
import {
  AbsoluteFill, Img, Video, Audio, staticFile,
  useCurrentFrame, useVideoConfig, interpolate, spring,
  Sequence, Series, Easing,
} from 'remotion';
import { Headline } from '@/primitives/Headline';
import { RichText } from '@/primitives/RichText';
import { Illustration } from '@/primitives/Illustration';
import { Footer } from '@/primitives/Footer';
import type { Theme } from '@/theme';

export interface SandboxGlobals {
  React: typeof React;
  Remotion: {
    AbsoluteFill: typeof AbsoluteFill;
    Img: typeof Img;
    Video: typeof Video;
    Audio: typeof Audio;
    staticFile: typeof staticFile;
    useCurrentFrame: typeof useCurrentFrame;
    useVideoConfig: typeof useVideoConfig;
    interpolate: typeof interpolate;
    spring: typeof spring;
    Sequence: typeof Sequence;
    Series: typeof Series;
    Easing: typeof Easing;
  };
  theme: Theme;
  assets: Record<string, string>;
  primitives: {
    Headline: typeof Headline;
    RichText: typeof RichText;
    Illustration: typeof Illustration;
    Footer: typeof Footer;
  };
}

export function buildSandboxGlobals(theme: Theme, assets: Record<string, string>): SandboxGlobals {
  return {
    React,
    Remotion: {
      AbsoluteFill, Img, Video, Audio, staticFile,
      useCurrentFrame, useVideoConfig, interpolate, spring,
      Sequence, Series, Easing,
    },
    theme,
    assets,
    primitives: { Headline, RichText, Illustration, Footer },
  };
}
