import { z } from 'zod';

export const GeneratedSlideSchema = z.object({
  intent: z.string().min(1),
  code: z.string().min(1).max(100_000),
});

export type GeneratedSlide = z.infer<typeof GeneratedSlideSchema>;
