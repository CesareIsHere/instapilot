import { z } from 'zod';

export const GeneratedHtmlSchema = z.object({
  intent: z.string().min(1),
  bodyHtml: z.string().min(1).max(100_000),
  css: z.string().max(50_000),
});

export type GeneratedHtml = z.infer<typeof GeneratedHtmlSchema>;

export const OverflowResult = z.object({
  x: z.boolean(),
  y: z.boolean(),
  scrollWidth: z.number(),
  scrollHeight: z.number(),
});

export type OverflowResult = z.infer<typeof OverflowResult>;
