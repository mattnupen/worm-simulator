import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PAGE = pathToFileURL(path.resolve('dist/index.html')).href;
/** The speed test with 1.5 s phases, for tests that only need it to run. */
const QUICK = PAGE + '?quick=1';

/** Page errors and console errors. SwiftShader's "GPU stall due to ReadPixels" is a harmless driver note. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('GPU stall')) errors.push(m.text());
  });
  return errors;
}

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const radio = (page: Page, name: string) => page.getByRole('radio', { name: new RegExp(`^${name}`) });
const crawling = (page: Page) => page.getByRole('region', { name: 'Crawling' });
const paused = (page: Page) => page.getByRole('region', { name: 'Paused' });

async function startCrawling(page: Page): Promise<void> {
  await button(page, 'Crawl').click();
  await expect(crawling(page)).toBeVisible();
}

test('keyboard only: crawl, pause with Esc, resume, reach Graphics and back to start', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(PAGE);
  await expect(button(page, 'Crawl')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(crawling(page)).toBeVisible();
  await expect(button(page, 'Pause')).toBeVisible();
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowUp');

  await page.keyboard.press('Escape');
  await expect(button(page, 'Resume')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(crawling(page)).toBeVisible();

  await page.keyboard.press('KeyP');
  await expect(button(page, 'Resume')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(button(page, 'Graphics')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(radio(page, 'Auto')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(button(page, 'Resume')).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(button(page, 'Back to start')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(button(page, 'Crawl')).toBeFocused();
  expect(errors).toEqual([]);
});

test('keyboard only: from Start reach Graphics, Speed test and Crawl; Esc leaves Graphics', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(QUICK);
  await expect(button(page, 'Crawl')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(button(page, 'Graphics')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(radio(page, 'Auto')).toBeChecked();
  await page.keyboard.press('ArrowDown');
  await expect(radio(page, 'Low')).toBeChecked();
  await expect(radio(page, 'Low')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(button(page, 'Crawl')).toBeFocused();

  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(button(page, 'Speed test')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(button(page, 'Start speed test')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(button(page, 'Back to start')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(button(page, 'Crawl')).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(crawling(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('the Pause button pauses, Resume restores the crawl, and Esc and P each toggle', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(PAGE);
  await startCrawling(page);

  await button(page, 'Pause').click();
  await expect(paused(page)).toBeVisible();
  await expect(button(page, 'Resume')).toBeFocused();
  await expect(button(page, 'Pause')).toBeHidden();
  await button(page, 'Resume').click();
  await expect(crawling(page)).toBeVisible();
  await expect(button(page, 'Pause')).toBeVisible();

  for (const key of ['Escape', 'KeyP']) {
    await page.keyboard.press(key);
    await expect(paused(page)).toBeVisible();
    await expect(button(page, 'Resume')).toBeFocused();
    await page.keyboard.press(key);
    await expect(crawling(page)).toBeVisible();
    await expect(button(page, 'Pause')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('the scene is frozen while paused and moves while crawling', async ({ page }) => {
  await page.goto(PAGE);
  await startCrawling(page);
  const canvas = page.locator('canvas').first();

  // Control: crawling forward changes the picture.
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(300);
  const moving1 = await canvas.screenshot();
  await page.waitForTimeout(1000);
  const moving2 = await canvas.screenshot();
  await page.keyboard.up('ArrowUp');
  expect(moving1.equals(moving2)).toBe(false);

  await page.keyboard.press('Escape');
  await expect(paused(page)).toBeVisible();
  await page.waitForTimeout(500);
  const still1 = await canvas.screenshot();
  await page.waitForTimeout(1000);
  const still2 = await canvas.screenshot();
  expect(still1.equals(still2)).toBe(true);
});

test('a chosen preset (picked with the arrow keys) is still selected after a reload', async ({ page }) => {
  await page.goto(PAGE);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(radio(page, 'Auto')).toBeFocused();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await expect(radio(page, 'High')).toBeChecked();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wormsim.settings') ?? 'null'));
  expect(saved).toEqual({ version: 1, graphics: 'high', autoSettled: null });

  await page.reload();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(radio(page, 'High')).toBeChecked();
  await expect(radio(page, 'Auto')).not.toBeChecked();

  // And Auto, chosen again with the keyboard, comes back as Auto.
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp');
  await expect(radio(page, 'Auto')).toBeChecked();
  await page.reload();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(radio(page, 'Auto')).toBeChecked();
  const auto = await page.evaluate(() => JSON.parse(localStorage.getItem('wormsim.settings') ?? 'null'));
  expect(auto.graphics).toBe('auto');
});

test('switching presets live during Crawl (Low, Ultra, High and more) causes no errors', async ({ page }) => {
  const errors = watchErrors(page);
  // ?fps=1 puts the active preset's name in the fps tag, so a switch that did nothing shows.
  await page.goto(PAGE + '?fps=1');
  await startCrawling(page);
  for (const name of ['Low', 'Ultra', 'High', 'Medium', 'Ultra', 'Auto']) {
    await button(page, 'Pause').click();
    await button(page, 'Graphics').click();
    await radio(page, name).check();
    await expect(radio(page, name)).toBeChecked();
    await button(page, 'Back').click();
    await button(page, 'Resume').click();
    await expect(crawling(page)).toBeVisible();
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(300);
    await page.keyboard.up('ArrowUp');
    // Auto starts on High (nothing is saved, so it has not settled lower).
    const shown = name === 'Auto' ? 'High' : name;
    await expect(page.locator('.fps')).toContainText(`fps, ${shown}`, { timeout: 5000 });
  }
  expect(errors).toEqual([]);
});

test('the fps tag shows with ?fps=1 and during the speed test, and is hidden otherwise', async ({ page }) => {
  await page.goto(PAGE);
  await startCrawling(page);
  await page.waitForTimeout(800);
  await expect(page.locator('.fps')).toBeHidden();

  await page.goto(PAGE + '?fps=1');
  await startCrawling(page);
  await expect(page.locator('.fps')).toContainText('fps', { timeout: 5000 });

  await page.goto(QUICK);
  await expect(page.locator('.fps')).toBeHidden();
  await button(page, 'Speed test').click();
  await button(page, 'Start speed test').click();
  await expect(page.getByTestId('running')).toBeVisible();
  await expect(page.locator('.fps')).toContainText('fps, quality', { timeout: 5000 });
  await expect(page.getByTestId('result')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.fps')).toBeHidden();
});

test('a hidden tab pauses the crawl', async ({ page }) => {
  await page.goto(PAGE);
  await startCrawling(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(paused(page)).toBeVisible();
  await expect(button(page, 'Resume')).toBeFocused();
});
