export interface AssetEntry {
  path: string;
  tags: string[];
  description: string;
}

export const manifest: Record<string, AssetEntry> = {
  logo: {
    path: 'brand/logo.svg',
    tags: ['brand', 'logo'],
    description: 'Brand logo (neutral placeholder — replace with your own)',
  },
  'growth-steps': {
    path: 'illustrations/growth-steps.svg',
    tags: ['growth', 'progress', 'steps'],
    description: 'Rising steps with an upward arrow — gradual progress, small steps that add up',
  },
};
