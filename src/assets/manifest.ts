export interface AssetEntry {
  path: string;
  tags: string[];
  description: string;
}

export const manifest: Record<string, AssetEntry> = {
  'logo-f': {
    path: 'brand/logo.png',
    tags: ['brand', 'logo'],
    description: 'Logo Finvestire — cerchio navy con F + freccia bianca',
  },
  'money-time-flow': {
    path: 'illustrations/money-time-flow.svg',
    tags: ['time', 'money', 'flow'],
    description: 'Sequenza monete → banconote → sacco $ con frecce manoscritte',
  },
};
