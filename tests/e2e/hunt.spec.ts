import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PAGE = pathToFileURL(path.resolve('dist/index.html')).href;

// A returning student (lesson done, opening seen), so Crawl goes straight to play. The software
// renderer runs the game slower than real time, so every wait here is long, and the window small.
test.use({ viewport: { width: 800, height: 600 } });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('wormsim.lessons', JSON.stringify({ version: 1, done: ['predators', 'eating'] }));
    localStorage.setItem('wormsim.openings', JSON.stringify({ version: 1, seen: Array.from({ length: 30 }, (_, i) => i + 1) }));
  });
});

const ring = (page: Page) => page.getByRole('img', { name: 'Timing ring' });
const goods = (page: Page) => page.getByRole('img', { name: /^Good taps: / });
const misses = (page: Page) => page.getByRole('img', { name: /^Misses: / });

/** Waits for the next ring to be `ms` or less from the dot (read from the ring's data-to-target); false once the grab is over. */
async function ringWithin(page: Page, ms: number): Promise<boolean> {
  const h = await page.waitForFunction((limit) => {
    const r = document.querySelector<HTMLElement>('.hunt-ring');
    if (!r || r.closest('[hidden]')) return 'over';
    return r.dataset.phase === 'ring' && r.dataset.toTarget !== undefined && Number(r.dataset.toTarget) <= limit ? 'ring' : false;
  }, ms, { timeout: 60_000, polling: 'raf' });
  return (await h.jsonValue()) === 'ring';
}

/** Waits until the beat in progress is decided (the ring has stopped) or the grab is over. */
async function decided(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const r = document.querySelector<HTMLElement>('.hunt-ring');
    return !r || !!r.closest('[hidden]') || r.dataset.phase !== 'ring';
  }, null, { timeout: 60_000, polling: 'raf' });
}

/** Crawls until the robin has grabbed the worm: the warning first, then the grip panel and its ring. */
async function grabbed(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Crawl', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Crawling' })).toBeVisible();
  const warning = page.getByRole('status').filter({ hasText: 'Robin!' });
  await expect(warning).toBeVisible({ timeout: 60_000 });
  await expect(warning).toContainText('Dig down to hide.');
  await expect(page.getByRole('region', { name: 'Crawling' })).toBeHidden();
  await expect(ring(page)).toBeVisible({ timeout: 150_000 });
  await expect(warning).toBeHidden();
  // The grab plays in the side view (the cut through a new burrow where the worm lay).
  await expect(page.locator('#app')).toHaveAttribute('data-place', 'underground');
  await expect(page.locator('.hunt-grip')).toContainText('The robin has you!');
  await expect(page.locator('.hunt-grip')).toContainText('Tap Space when the ring touches the dot.');
  await expect(page.locator('.action-prompt')).toContainText('Tap!');
  await expect(goods(page)).toHaveAccessibleName('Good taps: 0 of 5');
  await expect(misses(page)).toHaveAccessibleName('Misses: 0 of 3');
  // The first grab's hint: the grip fact with its source, and the timing game labelled.
  await expect(page.locator('.hunt-note')).toContainText('setae');
  await expect(page.locator('.hunt-note')).toContainText('Game choice: ');
}

test('a robin comes, warns and grabs the worm; Space as each ring meets the dot pulls it free', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto(PAGE + '?opening=0&robinIn=1&preset=low');
  await grabbed(page);
  // Tap as each ring reaches the dot (within a frame or so of it: the window is a third of a second).
  for (let beat = 0; beat < 8; beat++) {
    if (!(await ringWithin(page, 70))) break;
    await page.keyboard.press('Space');
    await decided(page);
  }
  await expect(page.locator('.hunt-grip')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('.hunt-note')).toHaveText('You got away!');
  // Back in its new burrow, underground.
  await expect(page.locator('#app')).toHaveAttribute('data-place', 'underground');
});

test('misses: a tap too early, then none; three and the robin wins', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto(PAGE + '?opening=0&robinIn=1&preset=low');
  await grabbed(page);
  // A tap long before the ring meets the dot is that beat's miss ("Too early"); then no taps at all.
  await page.waitForFunction(() => {
    const r = document.querySelector<HTMLElement>('.hunt-ring');
    return r?.dataset.phase === 'ring' && Number(r.dataset.toTarget) <= 800;
  }, null, { timeout: 60_000, polling: 'raf' });
  await page.keyboard.press('Space');
  await expect(page.locator('.hunt-call')).toContainText('Too early');
  await expect(misses(page)).toHaveAccessibleName('Misses: 1 of 3');
  await expect(page.locator('.hunt-call')).toContainText('Too late', { timeout: 60_000 });
  await expect(page.locator('.hunt-grip')).toBeHidden({ timeout: 60_000 });
  // 1 catch in 4 the robin takes the whole worm to its nest: skip the scene, then play goes on.
  const nest = page.getByRole('region', { name: 'Nest scene' });
  const note = page.locator('.hunt-note').filter({ hasText: /broke|whole worm|Too short/ });
  await expect(nest.or(note)).toBeVisible({ timeout: 30_000 });
  if (await nest.isVisible()) {
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Keep going', exact: true }).click();
  }
  await expect(note).toBeVisible({ timeout: 30_000 });
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
