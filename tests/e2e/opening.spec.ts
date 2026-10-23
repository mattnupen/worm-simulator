import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TEXT, shown } from '../../src/content/text';
import { CAPTIONS } from '../../src/opening/script';

const PAGE = pathToFileURL(path.resolve('dist/index.html')).href;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('GPU stall')) errors.push(m.text());
  });
  return errors;
}

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const scene = (page: Page) => page.getByRole('region', { name: 'Opening' });
const crawling = (page: Page) => page.getByRole('region', { name: 'Crawling' });

// A student who has finished this version's lesson but not yet seen its opening.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wormsim.lessons', JSON.stringify({ version: 1, done: ['predators', 'eating'] })));
});

test('the first Crawl plays the opening with captions; Esc skips straight to play, and it plays once', async ({ page, context }) => {
  const errors = watchErrors(page);
  const outside: string[] = [];
  page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) outside.push(r.url()); });
  await context.setOffline(true);
  await page.goto(PAGE);
  await button(page, 'Crawl').click();
  await expect(scene(page)).toBeVisible();
  // No button: just the captions.
  await expect(scene(page).getByRole('button')).toHaveCount(0);
  // The first caption (a sound, in brackets) comes up on its own.
  await expect(page.getByText(shown(TEXT[CAPTIONS[0].line]))).toBeVisible();
  // The strip sits at the top, clear of the worm low in the shot.
  const box = await scene(page).boundingBox();
  const view = page.viewportSize()!;
  expect(box!.y + box!.height).toBeLessThan(view.height / 2);

  // White words on a see-through black bar.
  const words = page.getByText(shown(TEXT[CAPTIONS[0].line]));
  expect(await words.evaluate((e) => getComputedStyle(e).color)).toBe('rgb(255, 255, 255)');
  expect(await words.evaluate((e) => getComputedStyle(e).backgroundColor)).toMatch(/^rgba\(0, 0, 0, 0\.\d+\)$/);
  await page.keyboard.press('Escape');
  await expect(crawling(page)).toBeVisible();

  // Seen: the next Crawl goes straight to play, and Start offers the opening to watch again.
  await page.reload();
  await button(page, 'Crawl').click();
  await expect(crawling(page)).toBeVisible();
  await page.reload();
  await button(page, shown(TEXT.openingWatch)).click();
  await expect(scene(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(crawling(page)).toBeVisible();
  expect(outside).toEqual([]);
  expect(errors).toEqual([]);
});

test('the scene plays to its end by itself and hands over to play', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await page.goto(PAGE);
  await expect(button(page, shown(TEXT.openingWatch))).toHaveCount(0);
  await button(page, 'Crawl').click();
  await expect(scene(page)).toBeVisible();
  // The teacher's sourced warning is captioned (a slow software renderer runs the scene slowly).
  const loose = TEXT.openingLoose;
  await expect(page.locator(`[data-source="${loose.source}"]`, { hasText: loose.text })).toBeVisible({ timeout: 90_000 });
  await expect(crawling(page)).toBeVisible({ timeout: 60_000 });
  expect(errors).toEqual([]);
});

test('?opening=0 goes straight to play', async ({ page }) => {
  await page.goto(PAGE + '?opening=0');
  await button(page, 'Crawl').click();
  await expect(crawling(page)).toBeVisible();
});

test('the preview link (?opening=1) leads Start with the opening, and Pause offers it again', async ({ browser }) => {
  // A brand-new device: Learn is not done, so Crawl is locked, but the preview still opens it.
  const page = await browser.newPage();
  const errors = watchErrors(page);
  await page.goto(PAGE + '?opening=1');
  const watch = button(page, shown(TEXT.openingWatch));
  await expect(watch).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(scene(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(crawling(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await button(page, shown(TEXT.openingWatch)).click();
  await expect(scene(page)).toBeVisible();
  expect(errors).toEqual([]);
  await page.close();
});

test('students never see Watch the opening on Pause', async ({ page }) => {
  await page.goto(PAGE + '?opening=0');
  await button(page, 'Crawl').click();
  await expect(crawling(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Paused' })).toBeVisible();
  await expect(button(page, shown(TEXT.openingWatch))).toHaveCount(0);
});
