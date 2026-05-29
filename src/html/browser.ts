import type { Browser } from 'playwright';

let instance: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (instance) return instance;
  // Dynamic import so the module loads even when playwright is not yet installed
  const { chromium } = await import('playwright');
  instance = await chromium.launch({ headless: true });
  return instance;
}

export async function closeBrowser(): Promise<void> {
  if (instance) {
    await instance.close();
    instance = null;
  }
}
