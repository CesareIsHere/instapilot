import React from 'react';
import { AbsoluteFill, delayRender, continueRender, cancelRender } from 'remotion';
import { compileTsx } from './compile';
import { buildSandboxGlobals } from './sandbox';
import type { Theme } from '@/theme';
import { theme as defaultTheme } from '@/theme';

export interface DynamicSlideProps {
  tsxCode: string;
  theme: Theme;
  assets: Record<string, string>;
}

export const DynamicSlide: React.FC<DynamicSlideProps> = ({ tsxCode, theme, assets }) => {
  const [SlideComponent, setSlideComponent] = React.useState<React.ComponentType | null>(null);
  const handleRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    handleRef.current ??= delayRender('dynamic.compile');
    try {
      const js = compileTsx(tsxCode);
      const factory = new Function(
        'React', 'Remotion', 'theme', 'assets', 'primitives',
        `"use strict";\n${js}\n;return Slide;`,
      );
      const globals = buildSandboxGlobals(theme, assets);
      const Comp = factory(
        globals.React, globals.Remotion, globals.theme, globals.assets, globals.primitives,
      );
      if (typeof Comp !== 'function') {
        throw new TypeError('dynamic.eval: generated code did not define a `Slide` function');
      }
      setSlideComponent(() => Comp);
      const h = handleRef.current;
      handleRef.current = null;
      continueRender(h);
    } catch (err) {
      cancelRender(err as Error);
    }
  }, [tsxCode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!SlideComponent) return <AbsoluteFill />;
  return <SlideComponent />;
};

export const defaultDynamicProps: DynamicSlideProps = {
  tsxCode: 'const Slide = () => React.createElement("div", null, "placeholder");',
  theme: defaultTheme,
  assets: {},
};
