import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TEXT, shown } from '../../src/content/text';
import { CURRENT_LESSON } from '../../src/content/lessons';

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


// These tests play as a returning student who has finished this version's lesson and seen its
// opening scene, so Crawl comes first on Start and goes straight to play. The lesson's own flow,
// on a new device, is tests/e2e/lesson.spec.ts.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('wormsim.lessons', JSON.stringify({ version: 1, done: ['predators'] }));
    localStorage.setItem('wormsim.openings', JSON.stringify({ version: 1, seen: Array.from({ length: 30 }, (_, i) => i + 1) }));
  });
});

test('keyboard only: crawl, pause with Esc, resume, reach Graphics and back to start', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(PAGE);
  await expect(button(page, 'Crawl')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(crawling(page)).toBeVisible();
  // The crawl card (Matt, 2026-10-12): the short controls line, then the mission. No mushroom line.
  await expect(crawling(page).locator('p').first()).toHaveText(shown(TEXT.crawlHint));
  await expect(crawling(page).locator('p')).toHaveCount(CURRENT_LESSON ? 2 : 1);
  // The lesson's question to think about while playing sits under the controls (Matt, 2026-10-12).
  const mission = CURRENT_LESSON?.steps.find((st) => st.kind === 'mission');
  if (mission?.kind === 'mission') await expect(crawling(page).locator('.hint-think')).toHaveText(shown(mission.notice));
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
  await expect(button(page, 'Settings')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(radio(page, 'Auto')).toBeFocused();
  await page.keyboard.press('Escape');
  // Focus returns to the button that opened Settings.
  await expect(button(page, 'Settings')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(button(page, 'Back to start')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(button(page, 'Crawl')).toBeFocused();
  expect(errors).toEqual([]);
});

test('keyboard only: from Start reach Settings and Crawl; Esc leaves Settings', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(QUICK);
  await expect(button(page, 'Crawl')).toBeFocused();
  // Vote is still locked (a disabled button), so Tab goes on to Graphics.
  await page.keyboard.press('Tab');
  await expect(button(page, 'Settings')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(radio(page, 'Auto')).toBeChecked();
  await page.keyboard.press('ArrowDown');
  await expect(radio(page, 'Low')).toBeChecked();
  await expect(radio(page, 'Low')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(button(page, 'Settings')).toBeFocused();

  // No Speed test button on Start (Matt, 2026-10-12): it opens with ?speedtest=1.
  await expect(button(page, 'Speed test')).toHaveCount(0);
  await page.keyboard.press('Shift+Tab');
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
  expect(saved).toMatchObject({ version: 1, graphics: 'high', autoSettled: null });
  // V2 never writes V1's World scale (a fresh device stays unpinned).
  expect(saved).not.toHaveProperty('scale');

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
    await button(page, 'Settings').click();
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

  await page.goto(QUICK + '&speedtest=1');
  await expect(page.locator('.fps')).toBeHidden();
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

test('a crash while crawling shows the Something went wrong card with a Reload button', async ({ page }) => {
  await page.goto(PAGE);
  await startCrawling(page);
  // Break every draw call, so the next rendered frame throws and the game loop stops.
  await page.evaluate(() => {
    const fail = () => { throw new Error('test: draw failed'); };
    for (const proto of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype] as unknown as Record<string, unknown>[]) {
      proto.drawElements = fail;
      proto.drawArrays = fail;
      proto.drawElementsInstanced = fail;
      proto.drawArraysInstanced = fail;
    }
  });
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
  await expect(button(page, 'Reload the page')).toBeFocused();
});

test('the Settings screen\'s Back button returns focus to the Settings button that opened it', async ({ page }) => {
  await page.goto(PAGE);
  await button(page, 'Settings').click();
  await button(page, 'Back').click();
  await expect(button(page, 'Settings')).toBeFocused();
  await startCrawling(page);
  await button(page, 'Pause').click();
  await expect(button(page, 'Resume')).toBeFocused();
  await button(page, 'Settings').click();
  await button(page, 'Back').click();
  await expect(button(page, 'Settings')).toBeFocused();
});

test('no World scale in V2: the Start menu has no such button, and a V1 save with one still loads and keeps it', async ({ page }) => {
  const errors = watchErrors(page);
  // A V1 save, in storage before the page's first script runs (the page loads once).
  await page.addInitScript(() => localStorage.setItem('wormsim.settings', JSON.stringify({ version: 1, graphics: 'low', autoSettled: null, scale: 'classic' })));
  await page.goto(PAGE + '?scale=hybrid');
  await expect(button(page, 'Crawl')).toBeFocused();
  await expect(page.getByRole('button', { name: /World scale/ })).toHaveCount(0);
  await button(page, 'Settings').click();
  await expect(radio(page, 'Low')).toBeChecked();
  await radio(page, 'Medium').check();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wormsim.settings') ?? 'null'));
  // V1, frozen at /v1/, shares this key: its scale is kept, untouched.
  expect(saved).toEqual({ version: 1, graphics: 'medium', autoSettled: null, scale: 'classic' });
  await button(page, 'Back').click();
  await startCrawling(page);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowUp');
  expect(errors).toEqual([]);
});

test('changing presets, once each has been shown, compiles no shader, offline, with no network requests', async ({ page, context }) => {
  const errors = watchErrors(page);
  const outside: string[] = [];
  page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) outside.push(r.url()); });
  await page.addInitScript(() => {
    const w = window as unknown as { __compiles: number };
    w.__compiles = 0;
    const proto = WebGL2RenderingContext.prototype;
    const compile = proto.compileShader;
    proto.compileShader = function (s) { w.__compiles++; return compile.call(this, s); };
  });
  await context.setOffline(true);
  // Ultra builds every lazily built layer (detail leaves, near clutter) at load.
  await page.goto(PAGE + '?preset=ultra');
  await startCrawling(page);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowUp');
  const compiles = () => page.evaluate(() => (window as unknown as { __compiles: number }).__compiles);
  const before = await compiles();
  expect(before).toBeGreaterThan(0);
  for (const name of ['Low', 'Medium', 'High', 'Ultra']) {
    await button(page, 'Pause').click();
    await button(page, 'Settings').click();
    await radio(page, name).check();
    await button(page, 'Back').click();
    await button(page, 'Resume').click();
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(400);
    await page.keyboard.up('ArrowUp');
  }
  expect(await compiles()).toBe(before);
  expect(outside).toEqual([]);
  expect(errors).toEqual([]);
});

test('Settings has Sound on or off, saved only once switched', async ({ page }) => {
  await page.goto(PAGE);
  await button(page, 'Settings').click();
  await expect(page.getByRole('region', { name: 'Settings' })).toBeVisible();
  await expect(radio(page, 'On')).toBeChecked();
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('wormsim.settings') ?? 'null'));
  expect((await saved())?.sound).toBeUndefined();
  await radio(page, 'Off').check();
  await expect.poll(async () => (await saved())?.sound).toBe(false);
  await page.reload();
  await button(page, 'Settings').click();
  await expect(radio(page, 'Off')).toBeChecked();
});
