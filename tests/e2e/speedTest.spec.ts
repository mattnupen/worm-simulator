import { test, expect } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PAGE = pathToFileURL(path.resolve('dist/index.html')).href + '?quick=1';

test('runs offline from a file with zero network requests', async ({ page, context }) => {
  const outside: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!/^(file|data|blob):/.test(u)) outside.push(u);
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await context.setOffline(true);
  await page.goto(PAGE);
  await page.getByRole('button', { name: 'Start speed test' }).click();
  await expect(page.getByTestId('running')).toBeVisible();
  await expect(page.getByTestId('result')).toContainText('fps average', { timeout: 30_000 });

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

test('start button works from the keyboard alone', async ({ page }) => {
  await page.goto(PAGE);
  const start = page.getByRole('button', { name: 'Start speed test' });
  await expect(start).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('running')).toBeVisible();
});
