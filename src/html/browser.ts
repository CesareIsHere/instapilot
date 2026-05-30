import type { Browser } from 'playwright';

// Cache the launch *promise* (not the resolved browser) so concurrent first
// calls share a single launch instead of racing to spawn multiple Chromium
// instances. Reset on disconnect/crash so the next call relaunches.
let browserPromise: Promise<Browser> | null = null;

async function launch(): Promise<Browser> {
  // Dynamic import so the module loads even when playwright is not yet installed.
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  browser.on('disconnected', () => {
    browserPromise = null;
  });
  return browser;
}

export async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const existing = await browserPromise;
      if (existing.isConnected()) return existing;
    } catch {
      // previous launch failed — fall through and retry
    }
    browserPromise = null;
  }

  browserPromise = launch();
  try {
    return await browserPromise;
  } catch (err) {
    browserPromise = null; // don't cache a rejected launch
    throw err;
  }
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise.catch(() => null);
  browserPromise = null;
  if (browser) await browser.close();
}
