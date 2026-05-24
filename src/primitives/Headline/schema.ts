import { z } from 'zod';

export const HeadlineSchema = z.object({
  type: z.literal('Headline'),
  text: z.string().min(1),
  size: z.enum(['sm', 'md', 'lg', 'xl']),
  color: z.enum(['brand-navy', 'brand-gold', 'ink', 'paper', 'muted']).optional(),
});

export type HeadlineProps = z.infer<typeof HeadlineSchema>;
