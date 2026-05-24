import { HeadlineBodyIllustration } from './headlineBodyIllustration';

export interface LayoutMeta {
  id: string;
  description: string;
  slots: string[];
}

export const layouts = {
  'headline-body-illustration': {
    component: HeadlineBodyIllustration,
    meta: {
      id: 'headline-body-illustration',
      description: 'Titolo in alto, corpo testo al centro, illustrazione in basso',
      slots: ['Headline', 'RichText', 'Illustration'],
    } satisfies LayoutMeta,
  },
} as const;

export type LayoutId = keyof typeof layouts;
