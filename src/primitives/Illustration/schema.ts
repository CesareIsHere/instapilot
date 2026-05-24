import { z } from 'zod';

export const IllustrationSchema = z.object({
  type: z.literal('Illustration'),
  assetId: z.string().min(1),
  caption: z.string().optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
});

export type IllustrationProps = z.infer<typeof IllustrationSchema>;
