import { test, expect } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PAGE = pathToFileURL(path.resolve('dist/index.html')).href + '?quick=1';

test('runs the speed test offline from a file with zero network requests', async ({ page, context }) => {
  const outside: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!/^(file|data|blob):/.test(u)) outside.push(u);
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Three reports shader compile and link failures as console errors.
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await context.setOffline(true);
  await page.goto(PAGE);
  await page.getByRole('button', { name: 'Speed test', exact: true }).click();
  await page.getByRole('button', { name: 'Start speed test' }).click();
  await expect(page.getByTestId('running')).toBeVisible();
  await expect(page.getByTestId('result')).toContainText('fps average', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Copy results' })).toBeFocused();

  expect(outside).toEqual([]);
  expect(errors).toEqual([]);
});

test('ships a CSP that blocks connections', async ({ page }) => {
  await page.goto(PAGE);
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("connect-src 'none'");
});

test('the speed test starts from the keyboard alone', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.getByRole('button', { name: 'Crawl' })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Speed test', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  const start = page.getByRole('button', { name: 'Start speed test' });
  await expect(start).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('running')).toBeVisible();
});

test('?speedtest=1 opens straight on the speed test (Chromebook link and benchmark)', async ({ page }) => {
  await page.goto(PAGE + '&speedtest=1');
  await expect(page.getByRole('button', { name: 'Start speed test' })).toBeFocused();
});

test('Use recommended setting saves a preset, then Back to start returns to the menu', async ({ page }) => {
  await page.goto(PAGE + '&speedtest=1');
  await page.getByRole('button', { name: 'Start speed test' }).click();
  await expect(page.getByTestId('result')).toContainText('fps average', { timeout: 30_000 });
  await page.getByRole('button', { name: /Use recommended setting/ }).click();
  await expect(page.getByText(/^Saved: (Low|Medium|High) graphics\.$/)).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wormsim.settings') ?? 'null'));
  expect(['low', 'medium', 'high']).toContain(saved.graphics);
  await expect(page.getByRole('button', { name: 'Back to start' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Crawl' })).toBeFocused();
});

test('the report\'s Leaves line is the litter plus detail leaves actually drawn at the tested preset', async ({ page }) => {
  await page.goto(PAGE + '&speedtest=1&preset=medium');
  await page.getByRole('button', { name: 'Start speed test' }).click();
  await expect(page.getByTestId('result')).toContainText('fps average', { timeout: 30_000 });
  const report = (await page.getByTestId('result').textContent()) ?? '';
  const tier = Number(/Quality level used: (\d) of 3/.exec(report)?.[1]);
  const leaves = Number(/^Leaves: (\d+)$/m.exec(report)?.[1]);
  // Medium draws 2,500 litter + 800 detail leaves; quality tier 3 halves both (rounded).
  const density = tier === 3 ? 0.5 : 1;
  expect(leaves).toBe(Math.round(2500 * density) + Math.round(800 * density));
});
