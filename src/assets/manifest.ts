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
  'money-time-flow': {
    path: 'illustrations/money-time-flow.svg',
    tags: ['time', 'money', 'flow'],
    description: 'Sequenza monete → banconote → sacco $ con frecce manoscritte',
  },
};
