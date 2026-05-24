export interface AssetEntry {
  path: string;
  tags: string[];
  description: string;
}

export const manifest: Record<string, AssetEntry> = {
  'logo-f': {
    path: 'brand/logo-f.svg',
    tags: ['brand', 'logo'],
    description: 'Logo monogramma Finvestire',
  },
  'money-time-flow': {
    path: 'illustrations/money-time-flow.svg',
    tags: ['time', 'money', 'flow'],
    description: 'Sequenza monete → banconote → sacco $ con frecce manoscritte',
  },
};
