import { z } from 'zod';

const ParagraphSchema = z.object({
  kind: z.literal('paragraph'),
  text: z.string().min(1),
});

const BulletsSchema = z.object({
  kind: z.literal('bullets'),
  items: z.array(z.string().min(1)).min(1),
});

export const RichTextSchema = z.object({
  type: z.literal('RichText'),
  content: z.array(z.discriminatedUnion('kind', [ParagraphSchema, BulletsSchema])).min(1),
});

export type RichTextProps = z.infer<typeof RichTextSchema>;
