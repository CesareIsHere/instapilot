import { Headline, HeadlineSchema, type HeadlineProps } from './Headline';
import { RichText, RichTextSchema, type RichTextProps } from './RichText';
import { Illustration, IllustrationSchema, type IllustrationProps } from './Illustration';
import { Footer, FooterSchema, type FooterProps } from './Footer';

export const primitives = {
  Headline: { component: Headline, schema: HeadlineSchema },
  RichText: { component: RichText, schema: RichTextSchema },
  Illustration: { component: Illustration, schema: IllustrationSchema },
  Footer: { component: Footer, schema: FooterSchema },
} as const;

export type BlockProps = HeadlineProps | RichTextProps | IllustrationProps | FooterProps;
export type PrimitiveName = keyof typeof primitives;

export { Headline, RichText, Illustration, Footer };
export { HeadlineSchema, RichTextSchema, IllustrationSchema, FooterSchema };
