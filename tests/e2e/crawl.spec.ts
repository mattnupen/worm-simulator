import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * V4 hot fix (Matt: "going backwards doesn't always work, players are reporting getting stuck";
 * "allow worm to crawl over rocks and logs"): the real input paths on the surface. ?debug=1 reads
 * the worm (window.__wormDebug, main.ts), ?at=x,z,deg starts it somewhere, ?hunt=0 keeps the robin
 * away. SwiftShader runs the game slower than real time, so the waits are on the worm's place.
 */
const PAGE = pathToFileURL(path.resolve('dist/index.html')).href;
const SLOW = 60_000;

test.use({ viewport: { width: 800, height: 600 } });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('wormsim.lessons', JSON.stringify({ version: 1, done: ['predators', 'eating'] }));
    localStorage.setItem('wormsim.openings', JSON.stringify({ version: 1, seen: Array.from({ length: 30 }, (_, i) => i + 1) }));
  });
});

interface Worm { x: number; y: number; z: number; heading: number; tailX: number; tailZ: number }
const worm = (page: Page): Promise<Worm> =>
  page.evaluate(() => (window as unknown as { __wormDebug: { head(): Worm } }).__wormDebug.head());

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('GPU stall')) errors.push(m.text());
  });
  return errors;
}

async function crawl(page: Page, q = ''): Promise<void> {
  await page.goto(PAGE + '?opening=0&hunt=0&preset=low&debug=1' + q);
  await page.getByRole('button', { name: 'Crawl', exact: true }).click();
  await expect(page.locator('#app[data-ui="crawl"]')).toBeVisible();
}

/** Holds `key` until `until(worm)` holds (polled), then lets go. */
async function holdUntil(page: Page, key: string, until: (w: Worm) => boolean): Promise<Worm> {
  await page.keyboard.down(key);
  try {
    await expect.poll(async () => until(await worm(page)), { timeout: SLOW }).toBe(true);
  } finally {
    await page.keyboard.up(key);
  }
  return worm(page);
}

test('S and the down arrow back the worm up, tail first, on the surface', async ({ page }) => {
  const errors = watchErrors(page);
  await crawl(page);
  const start = await worm(page);
  // The spawn faces +z: backing goes toward -z, still facing +z.
  const s = await holdUntil(page, 'KeyS', (w) => w.z < start.z - 0.6);
  expect(Math.abs(s.heading)).toBeLessThan(0.2);
  const a = await holdUntil(page, 'ArrowDown', (w) => w.z < s.z - 0.6);
  expect(a.tailZ).toBeLessThan(s.tailZ);
  // And forward again.
  await holdUntil(page, 'KeyW', (w) => w.z > a.z + 0.4);
  expect(errors).toEqual([]);
});

test('the touch joystick pulled down backs the worm up', async ({ page }) => {
  await crawl(page);
  const start = await worm(page);
  const box = (await page.locator('.joystick').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + box.height * 0.45, { steps: 4 });
  try {
    await expect.poll(async () => (await worm(page)).z, { timeout: SLOW }).toBeLessThan(start.z - 0.6);
  } finally {
    await page.mouse.up();
  }
});

test('wedged nose first into a tree trunk, backing up frees the worm', async ({ page }) => {
  // The birch at (-17.37, 5.57) reaches past the play area's west edge: drive into the notch
  // where its foot meets the edge (before the fix, the head could only turn about 75 degrees there).
  await crawl(page, '&at=-17.5,-2,-26');
  const wedged = await holdUntil(page, 'KeyW', (w) => w.x < -18.9);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyW');
  const still = await worm(page);
  expect(Math.hypot(still.x - wedged.x, still.z - wedged.z)).toBeLessThan(0.3);
  const freed = await holdUntil(page, 'KeyS', (w) => Math.hypot(w.x - still.x, w.z - still.z) > 1);
  expect(freed.z).toBeLessThan(still.z);
});

test('the worm crawls up onto the fallen log and along its top', async ({ page }) => {
  const errors = watchErrors(page);
  await crawl(page, '&at=0,11,0');
  const before = await worm(page);
  // The log lies across z = 15.5, about 4.5 high: up its flank and onto the top.
  const up = await holdUntil(page, 'KeyW', (w) => w.y > before.y + 4);
  expect(up.z).toBeGreaterThan(13.5);
  expect(up.z).toBeLessThan(17);
  // Back down again the way it came, tail first.
  await holdUntil(page, 'KeyS', (w) => w.y < before.y + 1);
  expect(errors).toEqual([]);
});

test('right after coming up from underground, S backs the worm up', async ({ page }) => {
  test.setTimeout(180_000);
  await crawl(page);
  const prompt = (word: string) => page.locator('.action-prompt').getByText(word, { exact: true });
  const place = (p: string) => expect(page.locator(`#app[data-place="${p}"]`)).toHaveCount(1, { timeout: SLOW });
  await expect(prompt('Dig down')).toBeVisible({ timeout: SLOW });
  await page.keyboard.down('Space');
  await page.waitForTimeout(200);
  await page.keyboard.up('Space');
  await place('underground');
  await page.keyboard.down('ArrowUp');
  try {
    await expect(prompt('Come up')).toBeVisible({ timeout: SLOW });
  } finally {
    await page.keyboard.up('ArrowUp');
  }
  await page.keyboard.down('Space');
  await page.waitForTimeout(200);
  await page.keyboard.up('Space');
  await place('surface');
  const up = await worm(page);
  const backed = await holdUntil(page, 'KeyS', (w) => Math.hypot(w.tailX - up.tailX, w.tailZ - up.tailZ) > 0.6);
  expect(Math.hypot(backed.x - up.x, backed.z - up.z)).toBeGreaterThan(0.4);
});
