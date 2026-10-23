// Screenshots of every anatomy viewer preset (src/anatomy/views.ts), for review rounds.
// Usage: npm run build && node scripts/anatomy-shots.mjs <outDir> [view ...]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [outDir = 'anatomy-shots', ...only] = process.argv.slice(2);
const views = only.length ? only : ['outside', 'head', 'belly', 'inside', 'gut', 'blood', 'nerves', 'repro', 'muscles', 'nephridia', 'ghost'];
mkdirSync(outDir, { recursive: true });
const page0 = pathToFileURL(resolve('dist/index.html')).href;
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', (e) => console.error('page error:', e.message));
for (const spec of views) {
  // A view id, or name=view&cam=..&at=.. for a custom camera.
  const [v, extra] = spec.includes('=') ? [spec.split('=')[0], spec.slice(spec.indexOf('=') + 1)] : [spec, ''];
  const t = Date.now();
  await page.goto(`${page0}?anatomy=1&view=${extra || v}`);
  await page.waitForFunction(() => document.body.dataset.anatomyReady === '1', null, { timeout: 180_000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/${v}.png` });
  const stats = await page.evaluate(() => window.anatomyStats);
  console.log(v, `${Date.now() - t} ms`, JSON.stringify(stats));
}
await browser.close();
