import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TEXT, shown } from '../../src/content/text';
import { SOURCES } from '../../src/content/sources';
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
const factCard = (page: Page) => page.getByRole('region', { name: shown(TEXT.openingFactTitle) });
const crawling = (page: Page) => page.getByRole('region', { name: 'Crawling' });

// A student who has finished this version's lesson but not yet seen its opening.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wormsim.lessons', JSON.stringify({ version: 1, done: ['predators'] })));
});

test('the first Crawl plays the opening with captions; Skip leads to the sourced fact, then play', async ({ page, context }) => {
  const errors = watchErrors(page);
  const outside: string[] = [];
  page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) outside.push(r.url()); });
  await context.setOffline(true);
  await page.goto(PAGE);
  await button(page, 'Crawl').click();
  await expect(scene(page)).toBeVisible();
  const skip = button(page, shown(TEXT.openingSkip));
  await expect(skip).toBeFocused();
  await expect(page.getByText(shown(TEXT.openingSkipKeys))).toBeVisible();
  // The first caption (a sound, in brackets) comes up on its own.
  await expect(page.getByText(shown(TEXT[CAPTIONS[0].line]))).toBeVisible();

  await skip.click();
  await expect(factCard(page)).toBeVisible();
  await expect(page.getByText(shown(TEXT.openingFact))).toBeVisible();
  await expect(page.getByText(shown(TEXT.openingTip))).toBeVisible();
  const src = SOURCES[TEXT.openingFact.source];
  const link = page.getByRole('link', { name: new RegExp(`^${src.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });
  await expect(link).toHaveAttribute('href', src.url);
  await expect(link).toHaveAttribute('target', '_blank');
  const start = button(page, shown(TEXT.openingStart));
  await expect(start).toBeFocused();
  await start.click();
  await expect(crawling(page)).toBeVisible();

  // Seen: the next Crawl goes straight to play, and Start offers the opening to watch again.
  await page.reload();
  await button(page, 'Crawl').click();
  await expect(crawling(page)).toBeVisible();
  await page.reload();
  await button(page, shown(TEXT.openingWatch)).click();
  await expect(scene(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(factCard(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(crawling(page)).toBeVisible();
  expect(outside).toEqual([]);
  expect(errors).toEqual([]);
});

test('the scene plays to its end by itself and hands over to the fact card', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await page.goto(PAGE);
  await expect(button(page, shown(TEXT.openingWatch))).toHaveCount(0);
  await button(page, 'Crawl').click();
  await expect(scene(page)).toBeVisible();
  // A slow software renderer runs the scene slower than real time.
  await expect(factCard(page)).toBeVisible({ timeout: 90_000 });
  expect(errors).toEqual([]);
});

test('?opening=0 goes straight to play', async ({ page }) => {
  await page.goto(PAGE + '?opening=0');
  await button(page, 'Crawl').click();
  await expect(crawling(page)).toBeVisible();
});

test('the preview link (?opening=1) leads Start with the opening, and its fact card offers Watch again', async ({ browser }) => {
  // A brand-new device: Learn is not done, so Crawl is locked, but the preview still opens it.
  const page = await browser.newPage();
  const errors = watchErrors(page);
  await page.goto(PAGE + '?opening=1');
  const watch = button(page, shown(TEXT.openingWatch));
  await expect(watch).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(scene(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(factCard(page)).toBeVisible();
  await button(page, shown(TEXT.openingReplay)).click();
  await expect(scene(page)).toBeVisible();
  await expect(button(page, shown(TEXT.openingSkip))).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(factCard(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(crawling(page)).toBeVisible();
  expect(errors).toEqual([]);
  await page.close();
});

test('students never see Watch again on the fact card', async ({ page }) => {
  await page.goto(PAGE);
  await button(page, 'Crawl').click();
  await button(page, shown(TEXT.openingSkip)).click();
  await expect(factCard(page)).toBeVisible();
  await expect(button(page, shown(TEXT.openingReplay))).toHaveCount(0);
});
