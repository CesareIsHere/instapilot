import { z } from 'zod';

export const FooterSchema = z.object({
  type: z.literal('Footer'),
  variant: z.enum(['brand', 'disclaimer', 'custom']),
  text: z.string().optional(),
});

export type FooterProps = z.infer<typeof FooterSchema>;
