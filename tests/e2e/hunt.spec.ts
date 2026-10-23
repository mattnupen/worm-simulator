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

const energy = (page: Page) => page.getByRole('meter', { name: 'Energy' });
/** The robin holds the worm and is pulling now. */
const pulling = (page: Page) => page.evaluate(() => {
  const p = document.querySelector<HTMLElement>('.hunt-energy');
  return !!p && !p.hidden && p.dataset.phase === 'pull';
});

/** Waits for the next pull to start; false once the grab is over. */
async function nextPull(page: Page): Promise<boolean> {
  const h = await page.waitForFunction(() => {
    const p = document.querySelector<HTMLElement>('.hunt-energy');
    if (!p || p.hidden) return 'over';
    return p.dataset.phase === 'pull' ? 'pull' : false;
  }, null, { timeout: 60_000, polling: 'raf' });
  return (await h.jsonValue()) === 'pull';
}

/** Crawls until the robin has grabbed the worm: the warning first, then only the Energy bar. */
async function grabbed(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Crawl', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Crawling' })).toBeVisible();
  const warning = page.getByRole('status').filter({ hasText: 'Robin!' });
  await expect(warning).toBeVisible({ timeout: 60_000 });
  await expect(warning).toContainText('Dig down to hide.');
  await expect(page.getByRole('region', { name: 'Crawling' })).toBeHidden();
  await expect(energy(page)).toBeVisible({ timeout: 150_000 });
  await expect(warning).toBeHidden();
  // The grab plays in the side view (the cut through a new burrow where the worm lay).
  await expect(page.locator('#app')).toHaveAttribute('data-place', 'underground');
  // No instructions (Matt, 2026-10-22): only the bar, full; no note, and with a keyboard no Tap button.
  await expect(energy(page)).toHaveAttribute('aria-valuenow', '100');
  await expect(page.locator('.hunt-energy')).toHaveText('Energy');
  await expect(page.locator('.hunt-note')).toBeHidden();
  await expect(page.locator('.action-prompt')).toBeHidden();
  await expect(page.locator('.cut-labels:visible')).toHaveCount(0);
}

test('a robin grabs the worm; tapping Space while it pulls, resting while it regrips, pulls it free', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto(PAGE + '?opening=0&robinIn=1&preset=low');
  await grabbed(page);
  let pulls = 0;
  while (await nextPull(page)) {
    pulls++;
    // Screen readers hear each pull start.
    if (pulls === 1) await expect(page.locator('[aria-live="assertive"]')).toContainText('Robin pulls!');
    // A few taps in the pull, a little apart; none once the robin regrips.
    await page.waitForTimeout(120);
    for (let i = 0; i < 5 && (await pulling(page)); i++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(210);
    }
    expect(pulls).toBeLessThan(40);
  }
  await expect(page.locator('.hunt-energy')).toBeHidden({ timeout: 30_000 });
  await expect(page.locator('.hunt-note')).toHaveText('You got away!');
  // Back in its new burrow, underground; then the grip's fact with its source (no Game choice label).
  await expect(page.locator('#app')).toHaveAttribute('data-place', 'underground');
  await expect(page.locator('.hunt-note')).toContainText('setae', { timeout: 30_000 });
  await expect(page.locator('.hunt-note')).not.toContainText('Game choice');
});

/** After the robin wins: its nest (skipped) or the note about how it ended, matching `note`. */
async function robinWon(page: Page, note: RegExp): Promise<void> {
  await expect(page.locator('.hunt-energy')).toBeHidden({ timeout: 90_000 });
  // 1 catch in 4 the robin takes the whole worm to its nest: skip the scene, then play goes on.
  const nest = page.getByRole('region', { name: 'Nest scene' });
  const said = page.locator('.hunt-note').filter({ hasText: note });
  await expect(nest.or(said)).toBeVisible({ timeout: 30_000 });
  if (await nest.isVisible()) {
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Keep going', exact: true }).click();
    await expect(page.locator('.hunt-note')).toContainText('whole worm', { timeout: 30_000 });
  }
}

test('no taps: the robin pulls the worm out, with the energy still full', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto(PAGE + '?opening=0&robinIn=1&preset=low');
  await grabbed(page);
  await expect(page.locator('.hunt-energy')).toBeHidden({ timeout: 90_000 });
  await robinWon(page, /broke|Too short/);
  await expect(page.locator('.hunt-note')).not.toContainText('Out of energy!');
});

test('tapping as fast as you can runs the energy out, and the robin wins', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto(PAGE + '?opening=0&robinIn=1&preset=low');
  await grabbed(page);
  let sawLow = false;
  for (let i = 0; i < 300 && (await page.locator('.hunt-energy').isVisible()); i++) {
    await page.keyboard.press('Space');
    // The bar shows low energy with a pattern (and its marker), not colour alone.
    if (!sawLow) {
      sawLow = await page.evaluate(() => {
        const p = document.querySelector<HTMLElement>('.hunt-energy');
        const n = Number(p?.querySelector('[role="meter"]')?.getAttribute('aria-valuenow'));
        return !!p && !p.hidden && n > 0 && n <= 30 && p.classList.contains('is-low');
      });
    }
    await page.waitForTimeout(40);
  }
  expect(sawLow).toBe(true);
  await robinWon(page, /Out of energy!/);
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
