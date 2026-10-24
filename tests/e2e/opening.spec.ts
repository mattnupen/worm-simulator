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
/** In play: the crawl screen (the surface shows no card, so the page's own state says so). */
const crawling = (page: Page) => page.locator('#app[data-ui="crawl"]');
const menu = (page: Page) => page.getByRole('navigation', { name: 'Game menu' });
/** The game menu's Rounds page (Matt, 2026-10-23): the opening's replay is its first line. */
async function openRounds(page: Page): Promise<void> {
  await menu(page).getByRole('button', { name: 'Open the menu' }).click();
  await menu(page).getByRole('tab', { name: 'Rounds', exact: true }).click();
}
const replay = (page: Page) => button(page, shown(TEXT.roundsOpening));

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

  // Seen: the next Crawl goes straight to play, and the menu's Rounds page offers it again, on
  // Start and in play.
  await page.reload();
  await button(page, 'Crawl').click();
  await expect(crawling(page)).toBeVisible();
  await openRounds(page);
  await replay(page).click();
  await expect(scene(page)).toBeVisible();
  await expect(menu(page)).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(crawling(page)).toBeVisible();
  await page.reload();
  await openRounds(page);
  await replay(page).click();
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
  await openRounds(page);
  await expect(replay(page)).toHaveCount(0);
  await button(page, 'Close the menu').click();
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

test('the preview link (?opening=1) leads Start with the opening, and the menu offers it again in play', async ({ browser }) => {
  // A brand-new device, with Learn not done: the preview still leads with the opening.
  const page = await browser.newPage();
  const errors = watchErrors(page);
  await page.goto(PAGE + '?opening=1');
  const watch = button(page, shown(TEXT.openingWatch));
  await expect(watch).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(scene(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(crawling(page)).toBeVisible();
  await openRounds(page);
  await replay(page).click();
  await expect(scene(page)).toBeVisible();
  expect(errors).toEqual([]);
  await page.close();
});

test('students never see the opening\'s replay before they have seen it', async ({ page }) => {
  await page.goto(PAGE + '?opening=0');
  await button(page, 'Crawl').click();
  await expect(crawling(page)).toBeVisible();
  await openRounds(page);
  await expect(page.getByRole('tabpanel', { name: 'Rounds' })).toBeVisible();
  await expect(replay(page)).toHaveCount(0);
});
