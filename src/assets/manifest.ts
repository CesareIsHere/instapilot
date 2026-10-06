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
    description: 'Scalini crescenti con freccia verso l\'alto — progresso graduale, piccoli passi che si sommano',
  },
};
