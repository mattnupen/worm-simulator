import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// V4 hot fix (Matt): "if worm is at the top, then space bar allows them to exit" and "Going
// backwards doesn't always work. Players are reporting getting stuck." Played with the keyboard and
// with touch, robins off (?hunt=0), the worm's place read from #app data-worm (?probe=1).

const PAGE = pathToFileURL(path.resolve('dist/index.html')).href + '?hunt=0&probe=1';
const SLOW = 45_000;
/** Screenshots for Matt (a shared mount: only new files are written; skipped where it is missing). */
const SHOTS = '/mnt/project-files/v4/hotfix';

const prompt = (page: Page, word: string) => page.locator('.action-prompt').getByText(word, { exact: true });
const place = (page: Page, p: string) => expect(page.locator(`#app[data-place="${p}"]`)).toHaveCount(1, { timeout: SLOW });
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('wormsim.settings') ?? 'null'));

/** The worm underground: head u along the cut, its height v, backing up, heading out. */
async function worm(page: Page): Promise<{ u: number; v: number; backing: boolean; heading: boolean }> {
  const s = (await page.locator('#app').getAttribute('data-worm')) ?? '0 0 0 0';
  const [u, v, b, h] = s.split(' ').map(Number);
  return { u, v, backing: b === 1, heading: h === 1 };
}

async function frames(page: Page, n = 3): Promise<void> {
  await page.evaluate((count) => new Promise<void>((done) => {
    let k = 0;
    const next = (): void => { if (++k >= count) done(); else requestAnimationFrame(next); };
    requestAnimationFrame(next);
  }), n);
}

async function hold(page: Page, key: string, ms = 150): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await frames(page);
  await page.keyboard.up(key);
  await page.waitForTimeout(150);
  await frames(page);
}

/** Holds a key until `until` passes, then lets go. */
async function holdUntil(page: Page, key: string, until: () => Promise<void>): Promise<void> {
  await page.keyboard.down(key);
  try {
    await until();
  } finally {
    await page.keyboard.up(key);
  }
  await frames(page);
}

/** Watches data-worm from the page itself (every change), so a short heading out is never missed. */
async function watchWorm(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __headed: boolean; __backed: boolean };
    w.__headed = false;
    w.__backed = false;
    document.addEventListener('DOMContentLoaded', () => {
      const app = document.getElementById('app')!;
      new MutationObserver(() => {
        const s = (app.dataset.worm ?? '').split(' ');
        if (s[3] === '1') w.__headed = true;
        if (s[2] === '1') w.__backed = true;
      }).observe(app, { attributes: true, attributeFilter: ['data-worm'] });
    });
  });
}
const seen = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { __headed: boolean; __backed: boolean };
  return { headed: w.__headed, backed: w.__backed };
});

async function returning(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    localStorage.setItem('wormsim.lessons', JSON.stringify({ version: 1, done: ['predators', 'eating'] }));
    localStorage.setItem('wormsim.openings', JSON.stringify({ version: 1, seen: Array.from({ length: 30 }, (_, i) => i + 1) }));
  });
}

function shot(name: string): string | null {
  if (!fs.existsSync(SHOTS)) return null;
  const file = path.join(SHOTS, name);
  return fs.existsSync(file) ? null : file;
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('GPU stall')) errors.push(m.text());
  });
  return errors;
}

test('keyboard: at the top where the worm cannot lie out, Space still comes up (it heads out first), never the view', async ({ browser }) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await returning(context);
  const page = await context.newPage();
  await watchWorm(page);
  const errors = watchErrors(page);
  await page.goto(PAGE);
  await page.getByRole('button', { name: 'Crawl', exact: true }).click();
  await expect(prompt(page, 'Dig down')).toBeVisible({ timeout: SLOW });
  await hold(page, 'Space');
  await place(page, 'underground');
  // From the spawn's dig, the cut's far left (u below about -4.5) has no way out: a trunk or rock
  // lies in the body's way (the unit tests map it). Dig over there, then up into the litter.
  await holdUntil(page, 'ArrowLeft', () => expect.poll(async () => (await worm(page)).u, { timeout: 120_000 }).toBeLessThan(-5.6));
  await holdUntil(page, 'ArrowUp', () => expect(prompt(page, 'Come up')).toBeVisible({ timeout: SLOW }));
  expect((await worm(page)).u).toBeLessThan(-4.7);
  const file = shot('exit-laptop-1366x768.png');
  if (file) await page.screenshot({ path: file });
  await hold(page, 'Space');
  await place(page, 'comingUp');
  expect((await seen(page)).headed).toBe(true);
  await place(page, 'surface');
  // Space at the top never switched the view (the setting is stored only when it does).
  expect((await saved(page))?.undergroundView).toBeUndefined();
  expect(errors).toEqual([]);
  await context.close();
});

test('touch: the Come up button at the top always comes up; the joystick backs the worm out of the top', async ({ browser }) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  await returning(context);
  const page = await context.newPage();
  await watchWorm(page);
  const errors = watchErrors(page);
  await page.goto(PAGE);
  await page.getByRole('button', { name: 'Crawl', exact: true }).click();
  const cdp = await context.newCDPSession(page);
  type Box = { x: number; y: number; width: number; height: number };
  const stickAt = async (dx: number, dy: number) => {
    const box: Box = (await page.locator('.joystick').boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx, y: y + dy }] });
  };
  const lift = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const action = async (word: string) => {
    await expect(prompt(page, word)).toBeVisible({ timeout: SLOW });
    const box: Box = (await page.locator('.action-prompt').boundingBox())!;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
    await page.waitForTimeout(200);
    await frames(page);
    await lift();
    await frames(page);
  };
  await action('Dig down');
  await place(page, 'underground');
  // Up into the top with the joystick, held there a while (pressed into the litter's top)...
  await stickAt(0, -40);
  try {
    await expect(prompt(page, 'Come up')).toBeVisible({ timeout: SLOW });
    await page.waitForTimeout(2000);
  } finally {
    await lift();
  }
  // ...then pulled straight down, away from the head: the worm gets moving again.
  const before = await worm(page);
  await stickAt(0, 40);
  try {
    await expect.poll(async () => {
      const now = await worm(page);
      return Math.hypot(now.u - before.u, now.v - before.v);
    }, { timeout: SLOW }).toBeGreaterThan(0.4);
  } finally {
    await lift();
  }
  // Back up at the top: the button says Come up, and a tap comes up.
  await stickAt(0, -40);
  try {
    await expect(prompt(page, 'Come up')).toBeVisible({ timeout: SLOW });
  } finally {
    await lift();
  }
  const file = shot('exit-phone-390x844.png');
  if (file) await page.screenshot({ path: file });
  await action('Come up');
  await place(page, 'comingUp');
  await place(page, 'surface');
  expect(errors).toEqual([]);
  await context.close();
});

test('keyboard: right after the camera swing, and pressed into the top, the arrow away from the head moves the worm', async ({ browser }) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await returning(context);
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto(PAGE);
  await page.getByRole('button', { name: 'Crawl', exact: true }).click();
  await expect(prompt(page, 'Dig down')).toBeVisible({ timeout: SLOW });
  await hold(page, 'Space');
  await place(page, 'underground');
  const moves = async (key: string) => {
    const before = await worm(page);
    await holdUntil(page, key, () => expect.poll(async () => {
      const now = await worm(page);
      return Math.hypot(now.u - before.u, now.v - before.v);
    }, { timeout: SLOW }).toBeGreaterThan(0.4));
  };
  // Just arrived, facing down: Up (back toward the way in) turns it round.
  await moves('ArrowUp');
  // Into the top and held there, then Down.
  await holdUntil(page, 'ArrowUp', () => expect(prompt(page, 'Come up')).toBeVisible({ timeout: SLOW }));
  await hold(page, 'ArrowUp', 2000);
  await moves('ArrowDown');
  // Along to the cut's end and pressed into it, then the other way.
  await holdUntil(page, 'ArrowRight', () => expect.poll(async () => (await worm(page)).u, { timeout: 120_000 }).toBeGreaterThan(7.6));
  await hold(page, 'ArrowRight', 1500);
  await moves('ArrowLeft');
  expect(errors).toEqual([]);
  await context.close();
});
