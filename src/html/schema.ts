import { z } from 'zod';

export const GeneratedHtmlSchema = z.object({
  intent: z.string().min(1),
  bodyHtml: z.string().min(1).max(100_000),
  css: z.string().max(50_000),
});

export type GeneratedHtml = z.infer<typeof GeneratedHtmlSchema>;
