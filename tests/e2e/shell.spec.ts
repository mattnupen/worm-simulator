import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TEXT, shown } from '../../src/content/text';
import { CURRENT_LESSON } from '../../src/content/lessons';
import { CHANGELOG_URL, PLANNED_ROUNDS, ROUNDS, VERSION } from '../../src/version';

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
/** In play: the crawl screen (the surface shows no card, so the page's own state says so). */
const crawling = (page: Page) => page.locator('#app[data-ui="crawl"]');
const paused = (page: Page) => page.getByRole('region', { name: 'Paused' });
/** The Paused chip's Resume (the menu's Pause icon is named Resume too while paused). */
const resume = (page: Page) => paused(page).getByRole('button', { name: 'Resume' });
const menu = (page: Page) => page.getByRole('navigation', { name: 'Game menu' });

async function startCrawling(page: Page): Promise<void> {
  await button(page, 'Crawl').click();
  await expect(crawling(page)).toBeVisible();
}

/** Slides the game menu out, if it is shut, then picks the named page's tab. */
async function openMenu(page: Page, pageName?: string): Promise<void> {
  const tab = menu(page).getByRole('button', { name: 'Open the menu' });
  if (await tab.count()) await tab.click();
  if (pageName) await menu(page).getByRole('tab', { name: pageName, exact: true }).click();
}
const pageTab = (page: Page, name: string) => menu(page).getByRole('tab', { name, exact: true });
/** The open page of the menu (an ARIA tab panel, named by its tab). */
const menuPage = (page: Page, name: string) => menu(page).getByRole('tabpanel', { name });

/** Pause with the game menu's Pause icon (Esc and P no longer pause: Matt, 2026-10-23). */
async function pauseGame(page: Page): Promise<void> {
  await openMenu(page);
  await menu(page).getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(paused(page)).toBeVisible();
}


// These tests play as a returning student who has finished this version's lesson and seen its
// opening scene, so Crawl comes first on Start and goes straight to play. The lesson's own flow,
// on a new device, is tests/e2e/lesson.spec.ts.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('wormsim.lessons', JSON.stringify({ version: 1, done: ['predators', 'eating'] }));
    localStorage.setItem('wormsim.openings', JSON.stringify({ version: 1, seen: Array.from({ length: 30 }, (_, i) => i + 1) }));
  });
});

test('keyboard only: crawl, open the menu, pause, resume, reach Settings and back to start', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(PAGE);
  await expect(button(page, 'Crawl')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(crawling(page)).toBeVisible();
  // Play shows no card (Matt, 2026-10-23: the mission is in the menu), and no Pause button.
  await expect(page.getByRole('region', { name: 'Crawling' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowUp');
  // Esc and P do not pause.
  for (const key of ['Escape', 'KeyP']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(200);
    await expect(paused(page)).toHaveCount(0);
  }

  // Tab reaches the menu's tab first.
  await page.keyboard.press('Tab');
  await expect(button(page, 'Open the menu')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(button(page, 'Close the menu')).toBeFocused();
  // The panel opens on Mission; its tab is next, and the arrow keys move along the tabs.
  await page.keyboard.press('Tab');
  await expect(pageTab(page, 'Mission')).toBeFocused();
  await expect(pageTab(page, 'Mission')).toHaveAttribute('aria-selected', 'true');
  for (const name of ['Rounds', 'Settings', 'About']) {
    await page.keyboard.press('ArrowRight');
    await expect(pageTab(page, name)).toBeFocused();
    await expect(menuPage(page, name)).toBeVisible();
  }
  await page.keyboard.press('ArrowRight');
  await expect(pageTab(page, 'Mission')).toBeFocused();
  // Along the bottom: Pause, then the virtual worm (the 3D anatomy model) in a new tab.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(button(page, 'Pause')).toBeFocused();
  const worm = page.locator('.game-menu').getByRole('link', { name: 'Virtual worm' });
  await expect(worm).toHaveAttribute('href', '?anatomy=1');
  await expect(worm).toHaveAttribute('target', '_blank');
  await page.keyboard.press('Enter');
  await expect(paused(page)).toBeVisible();
  await expect(resume(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(crawling(page)).toBeVisible();

  await openMenu(page, 'Settings');
  await expect(menuPage(page, 'Settings')).toBeVisible();
  await expect(radio(page, 'Auto')).toBeChecked();
  // Esc slides the whole panel away in one press; while crawling, the keys go back to the worm.
  await page.keyboard.press('Escape');
  await expect(pageTab(page, 'Settings')).toHaveCount(0);
  await expect(button(page, 'Open the menu')).toBeVisible();
  await expect(button(page, 'Open the menu')).not.toBeFocused();
  // It opens again where it was.
  await openMenu(page);
  await expect(menuPage(page, 'Settings')).toBeVisible();

  await openMenu(page, 'Mission');
  await button(page, 'Back to start').click();
  await expect(button(page, 'Crawl')).toBeFocused();
  await expect(pageTab(page, 'Mission')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('keyboard only: from Start, Tab reaches Crawl, then the menu; there is no Settings or Versions button', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(QUICK);
  await expect(button(page, 'Crawl')).toBeFocused();
  for (const name of ['Settings', 'Versions', 'Speed test', 'Watch the opening']) await expect(button(page, name)).toHaveCount(0);
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(button(page, 'Open the menu')).toBeFocused();
  await page.keyboard.press('Enter');
  // On Start there is nothing to pause.
  await expect(pageTab(page, 'Mission')).toBeVisible();
  await expect(button(page, 'Pause')).toBeHidden();
  await pageTab(page, 'Settings').click();
  await radio(page, 'Auto').focus();
  await page.keyboard.press('ArrowDown');
  await expect(radio(page, 'Low')).toBeChecked();
  await expect(radio(page, 'Low')).toBeFocused();
  await button(page, 'Close the menu').click();
  await button(page, 'Crawl').click();
  await expect(crawling(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('the menu\'s Pause and the Paused chip\'s Resume pause and resume; the menu stays open', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(PAGE);
  await startCrawling(page);
  await pauseGame(page);
  await expect(resume(page)).toBeFocused();
  await expect(menu(page).getByRole('button', { name: 'Resume' })).toBeVisible();
  await menu(page).getByRole('button', { name: 'Resume' }).click();
  await expect(crawling(page)).toBeVisible();
  await expect(menu(page).getByRole('button', { name: 'Pause' })).toBeVisible();
  await menu(page).getByRole('button', { name: 'Pause' }).click();
  await resume(page).click();
  await expect(crawling(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('the Mission page shows the round\'s mission and quests; the game keeps going while it is open', async ({ page }) => {
  await page.goto(PAGE);
  await startCrawling(page);
  await openMenu(page, 'Mission');
  const card = menuPage(page, 'Mission');
  const mission = CURRENT_LESSON?.steps.find((st) => st.kind === 'mission');
  if (mission?.kind === 'mission') {
    await expect(card.locator('.menu-mission')).toHaveText(shown(mission.short ?? mission.notice).replace(/^Mission:\s*/, ''));
  }
  await expect(card.getByRole('list', { name: "This round's quests" }).getByRole('listitem')).toHaveCount(3);
  await expect(paused(page)).toHaveCount(0);
  const canvas = page.locator('canvas').first();
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(300);
  const a = await canvas.screenshot();
  await page.waitForTimeout(800);
  const b = await canvas.screenshot();
  await page.keyboard.up('ArrowUp');
  expect(a.equals(b)).toBe(false);
});

test('the Rounds page lists every round, links the older ones, and links the changelog', async ({ page }) => {
  await page.goto(PAGE);
  await openMenu(page, 'Rounds');
  const card = menuPage(page, 'Rounds');
  for (const r of ROUNDS) {
    const title = `Round ${r.number}: ${r.name}`;
    if (r.number === VERSION.number) {
      await expect(card.getByText(title)).toBeVisible();
      await expect(card.getByRole('link', { name: title })).toHaveCount(0);
    } else {
      await expect(card.getByRole('link', { name: title })).toHaveAttribute('href', `/v${r.number}/`);
    }
  }
  for (let n = ROUNDS.length + 1; n <= PLANNED_ROUNDS; n++) {
    await expect(card.getByText(`Round ${n}`, { exact: true })).toBeVisible();
  }
  await expect(card.getByText('Coming soon')).toHaveCount(PLANNED_ROUNDS - ROUNDS.length);
  const changes = card.getByRole('link', { name: /What changed in each round/ });
  await expect(changes).toHaveAttribute('href', CHANGELOG_URL);
  await expect(changes).toHaveAttribute('target', '_blank');
  // The opening has been seen, so its replay leads the page.
  await expect(card.getByRole('button', { name: 'Watch the opening again' })).toBeVisible();
});

test('the About page says who makes the game, with its fact\'s source', async ({ page }) => {
  await page.goto(PAGE);
  await openMenu(page, 'About');
  const card = menuPage(page, 'About');
  await expect(card.getByText(shown(TEXT.openingInvasive))).toBeVisible();
  await expect(card.getByRole('link', { name: /Minnesota DNR/ })).toHaveAttribute('target', '_blank');
  await expect(card.getByText(/Game choice/)).toHaveCount(0);
});

test('the panel slides out from the left edge, tabs across its top, the X jutting out on its right', async ({ page }) => {
  await page.goto(PAGE);
  await startCrawling(page);
  const shut = (await button(page, 'Open the menu').boundingBox())!;
  expect(shut.x).toBeLessThanOrEqual(1);
  await openMenu(page, 'Settings');
  const panel = (await page.locator('#menu-panel').boundingBox())!;
  const tabs = (await menu(page).getByRole('tablist').boundingBox())!;
  const x = (await button(page, 'Close the menu').boundingBox())!;
  expect(panel.x).toBeLessThanOrEqual(1);
  expect(tabs.y).toBeLessThan(panel.y + 4);
  expect(x.x).toBeGreaterThanOrEqual(panel.x + panel.width - 2);
  expect(x.y).toBeLessThan(panel.y + 8);
});

test('a phone: the panel and its X fit the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PAGE);
  await startCrawling(page);
  await openMenu(page, 'Settings');
  const panel = (await page.locator('#menu-panel').boundingBox())!;
  const x = (await button(page, 'Close the menu').boundingBox())!;
  expect(panel.x).toBeLessThanOrEqual(1);
  expect(x.x + x.width).toBeLessThanOrEqual(390);
  for (const name of ['Mission', 'Rounds', 'Settings', 'About']) {
    const t = (await pageTab(page, name).boundingBox())!;
    expect(t.height).toBeGreaterThanOrEqual(48);
    expect(t.x + t.width).toBeLessThanOrEqual(panel.x + panel.width + 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
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

  await pauseGame(page);
  await page.waitForTimeout(500);
  // The Paused chip over the canvas rises in with a CSS animation, which the slow software
  // renderer can still be drawing; finish it so only the 3D scene is compared.
  const still1 = await canvas.screenshot({ animations: 'disabled' });
  await page.waitForTimeout(1000);
  const still2 = await canvas.screenshot({ animations: 'disabled' });
  expect(still1.equals(still2)).toBe(true);
});

test('a chosen preset (picked with the arrow keys) is still selected after a reload', async ({ page }) => {
  await page.goto(PAGE);
  await openMenu(page, 'Settings');
  await radio(page, 'Auto').focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await expect(radio(page, 'High')).toBeChecked();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wormsim.settings') ?? 'null'));
  expect(saved).toMatchObject({ version: 1, graphics: 'high', autoSettled: null });
  // V2 never writes V1's World scale (a fresh device stays unpinned).
  expect(saved).not.toHaveProperty('scale');

  await page.reload();
  await openMenu(page, 'Settings');
  await expect(radio(page, 'High')).toBeChecked();
  await expect(radio(page, 'Auto')).not.toBeChecked();

  // And Auto, chosen again with the keyboard, comes back as Auto.
  await radio(page, 'High').focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp');
  await expect(radio(page, 'Auto')).toBeChecked();
  await page.reload();
  await openMenu(page, 'Settings');
  await expect(radio(page, 'Auto')).toBeChecked();
  const auto = await page.evaluate(() => JSON.parse(localStorage.getItem('wormsim.settings') ?? 'null'));
  expect(auto.graphics).toBe('auto');
});

test('switching presets live during Crawl (Low, Ultra, High and more) causes no errors', async ({ page }) => {
  const errors = watchErrors(page);
  // ?fps=1 puts the active preset's name in the fps tag, so a switch that did nothing shows.
  await page.goto(PAGE + '?fps=1');
  await startCrawling(page);
  // The game keeps going while the Settings page is open: switch, then crawl on.
  await openMenu(page, 'Settings');
  for (const name of ['Low', 'Ultra', 'High', 'Medium', 'Ultra', 'Auto']) {
    await radio(page, name).check();
    await expect(radio(page, name)).toBeChecked();
    await page.locator('canvas').first().click({ position: { x: 900, y: 500 } });
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
  await expect(resume(page)).toBeFocused();
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

test('no World scale in V2: the Start menu has no such button, and a V1 save with one still loads and keeps it', async ({ page }) => {
  const errors = watchErrors(page);
  // A V1 save, in storage before the page's first script runs (the page loads once).
  await page.addInitScript(() => localStorage.setItem('wormsim.settings', JSON.stringify({ version: 1, graphics: 'low', autoSettled: null, scale: 'classic' })));
  await page.goto(PAGE + '?scale=hybrid');
  await expect(button(page, 'Crawl')).toBeFocused();
  await expect(page.getByRole('button', { name: /World scale/ })).toHaveCount(0);
  await openMenu(page, 'Settings');
  await expect(radio(page, 'Low')).toBeChecked();
  await radio(page, 'Medium').check();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wormsim.settings') ?? 'null'));
  // V1, frozen at /v1/, shares this key: its scale is kept, untouched.
  expect(saved).toEqual({ version: 1, graphics: 'medium', autoSettled: null, scale: 'classic' });
  await button(page, 'Close the menu').click();
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
  await openMenu(page, 'Settings');
  for (const name of ['Low', 'Medium', 'High', 'Ultra']) {
    await radio(page, name).check();
    await page.locator('canvas').first().click({ position: { x: 900, y: 500 } });
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
  await openMenu(page, 'Settings');
  await expect(menuPage(page, 'Settings')).toBeVisible();
  await expect(radio(page, 'On')).toBeChecked();
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('wormsim.settings') ?? 'null'));
  expect((await saved())?.sound).toBeUndefined();
  await radio(page, 'Off').check();
  await expect.poll(async () => (await saved())?.sound).toBe(false);
  await page.reload();
  await openMenu(page, 'Settings');
  await expect(radio(page, 'Off')).toBeChecked();
});

test('Settings has Text size (Normal, Big, Bigger): it applies at once and is saved only once picked', async ({ page }) => {
  await page.goto(PAGE);
  const rootPx = () => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  // Normal is a little larger than the browser's 16px (Matt, 2026-10-22).
  expect(await rootPx()).toBeCloseTo(17, 0);
  await openMenu(page, 'Settings');
  await expect(radio(page, 'Normal')).toBeChecked();
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('wormsim.settings') ?? 'null'));
  expect((await saved())?.textSize).toBeUndefined();
  const before = await menuPage(page, 'Settings').locator('legend').first().evaluate((h) => h.getBoundingClientRect().height);
  await radio(page, 'Bigger').check();
  await expect.poll(async () => (await saved())?.textSize).toBe('bigger');
  expect(await rootPx()).toBeCloseTo(21, 0);
  const after = await menuPage(page, 'Settings').locator('legend').first().evaluate((h) => h.getBoundingClientRect().height);
  expect(after).toBeGreaterThan(before);
  await page.reload();
  expect(await rootPx()).toBeCloseTo(21, 0);
  await openMenu(page, 'Settings');
  await expect(radio(page, 'Bigger')).toBeChecked();
});
