import { test, expect } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PAGE = pathToFileURL(path.resolve('dist/index.html')).href;

// A returning student (lesson done, opening seen), so Crawl goes straight to play. The software
// renderer runs the game slower than real time, so every wait here is long, and the window small.
test.use({ viewport: { width: 800, height: 600 } });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('wormsim.lessons', JSON.stringify({ version: 1, done: ['predators'] }));
    localStorage.setItem('wormsim.openings', JSON.stringify({ version: 1, seen: Array.from({ length: 30 }, (_, i) => i + 1) }));
  });
});

const bar = (page: import('@playwright/test').Page) => page.getByRole('meter', { name: 'How far the robin has pulled you out' });
const pull = async (page: import('@playwright/test').Page) => Number(await bar(page).getAttribute('aria-valuenow'));

test('a robin comes, warns, grabs the worm; holding Space pulls back; the hunt ends one way or another', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto(PAGE + '?opening=0&robinIn=1&preset=low');
  await page.getByRole('button', { name: 'Crawl', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Crawling' })).toBeVisible();

  // The warning: words and an icon, a status screen readers read out. The crawl card steps aside.
  const warning = page.getByRole('status').filter({ hasText: 'Robin!' });
  await expect(warning).toBeVisible({ timeout: 60_000 });
  await expect(warning).toContainText('Dig down to hide.');
  await expect(page.getByRole('region', { name: 'Crawling' })).toBeHidden();

  // The worm stays up top: the robin closes in and grabs it. The grip panel replaces the warning.
  await expect(bar(page)).toBeVisible({ timeout: 150_000 });
  await expect(warning).toBeHidden();
  await expect(page.locator('.hunt-grip')).toContainText('The robin has you!');
  await expect(page.getByRole('button', { name: 'Hold on' })).toBeVisible();
  // The first grab's hint: the grip fact with its source, and the timing game labelled.
  await expect(page.locator('.hunt-note')).toContainText('setae');
  await expect(page.locator('.hunt-note')).toContainText('Game choice: ');

  // Holding Space (held, not pressed) grips: the worm marker moves toward Burrow.
  const start = await pull(page);
  await page.keyboard.down('Space');
  await expect.poll(() => pull(page), { timeout: 60_000 }).toBeLessThan(start);
  // Held on through the robin's tugs, it either gets back in or stretches until it breaks: either
  // way the grab ends and the worm is underground (escaped, broken, or a new life in its burrow).
  await expect(bar(page)).toBeHidden({ timeout: 120_000 });
  await page.keyboard.up('Space');
  await expect(page.locator('.hunt-note')).toHaveText(/got away|broke|whole worm|Too short/);
  await expect.poll(() => page.locator('#app').getAttribute('data-place'), { timeout: 60_000 }).not.toBe('surface');
});

test('?hunt=0 turns the hunt off: no robin comes', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(PAGE + '?opening=0&robinIn=0.5&hunt=0&preset=low');
  await page.getByRole('button', { name: 'Crawl', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Crawling' })).toBeVisible();
  await page.waitForTimeout(8000);
  await expect(page.locator('.hunt-warning')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Crawling' })).toBeVisible();
});
