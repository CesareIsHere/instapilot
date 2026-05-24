import { z } from 'zod';
import { HeadlineSchema } from '@/primitives/Headline';
import { RichTextSchema } from '@/primitives/RichText';
import { IllustrationSchema } from '@/primitives/Illustration';
import { FooterSchema } from '@/primitives/Footer';

export const BlockSchema = z.discriminatedUnion('type', [
  HeadlineSchema,
  RichTextSchema,
  IllustrationSchema,
  FooterSchema,
]);
export type Block = z.infer<typeof BlockSchema>;

export const ChromeSchema = z.object({
  showLogo: z.boolean(),
  showCarouselNav: z.boolean(),
  pageIndex: z.number().int().min(1).optional(),
  totalPages: z.number().int().min(1).optional(),
});

export const SlideSpecSchema = z.object({
  compositionId: z.literal('Slide'),
  format: z.literal('post-portrait'),
  layout: z.enum(['headline-body-illustration']),
  background: z.enum(['paper']),
  chrome: ChromeSchema,
  blocks: z.array(BlockSchema).min(1),
});

export type SlideSpec = z.infer<typeof SlideSpecSchema>;
