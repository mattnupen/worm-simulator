import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TEXT, shown } from '../../src/content/text';

const PAGE = pathToFileURL(path.resolve('dist/index.html')).href;

// Wiggling free on the way to the nest (V4 hot fix). ?nestEscape=1 makes every roll succeed once
// the hidden meter is high (and lets the Start preview wiggle), so the escape is certain here.
test.use({ viewport: { width: 800, height: 600 } });

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('GPU stall')) errors.push(m.text());
  });
  return errors;
}

const scene = (page: Page) => page.getByRole('region', { name: shown(TEXT.nestLabel) });
const crawling = (page: Page) => page.getByRole('region', { name: 'Crawling' });
/** The only words the scene ever shows while it plays: its sound captions. */
const CAPTIONS = new Set(['', shown(TEXT.nestWings), shown(TEXT.nestCheep)]);

/**
 * Mashes (Space, or taps with `tap`) until play is back, checking each time that the scene shows no
 * button and no words but its captions: nothing tells the player about wiggling. Returns the note
 * shown as play came back.
 */
async function mash(page: Page, tap = false): Promise<string> {
  for (let i = 0; i < 300; i++) {
    const now = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('[role="region"][aria-live]');
      const note = document.querySelector<HTMLElement>('.hunt-note');
      return {
        label: panel?.getAttribute('aria-label') ?? '',
        words: panel?.innerText.trim() ?? '',
        buttons: panel?.querySelectorAll('button').length ?? 0,
        note: note && !note.hidden ? note.textContent ?? '' : '',
      };
    });
    if (now.label === 'Crawling') return now.note;
    if (now.label === shown(TEXT.nestLabel)) {
      expect(now.buttons).toBe(0);
      expect(CAPTIONS.has(now.words), `the scene shows "${now.words}"`).toBe(true);
    }
    if (tap) await page.mouse.click(300 + (i % 5) * 20, 300);
    else await page.keyboard.press('Space');
    await page.waitForTimeout(50);
  }
  throw new Error('never got free');
}

async function freed(page: Page, note: string): Promise<void> {
  await expect(crawling(page)).toBeVisible({ timeout: 30_000 });
  // On the forest floor where it landed, with one short line after; never the fact card.
  await expect(page.locator('#app')).toHaveAttribute('data-place', 'surface');
  expect(note).toBe(shown(TEXT.nestWiggledFree));
  await expect(page.getByRole('button', { name: shown(TEXT.nestContinue), exact: true })).toHaveCount(0);
}

test('the preview with ?nestEscape=1: mashing Space wiggles free, and it plays on from the forest floor', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await page.goto(PAGE + '?nest=1&nestEscape=1');
  await page.getByRole('button', { name: shown(TEXT.nestWatch), exact: true }).click();
  await expect(scene(page)).toBeVisible();
  await freed(page, await mash(page));
  expect(errors).toEqual([]);
});

test('taps on the scene wiggle too (a touch screen has no Space), with no button anywhere', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(PAGE + '?nest=1&nestEscape=1');
  await page.getByRole('button', { name: shown(TEXT.nestWatch), exact: true }).click();
  await expect(scene(page)).toBeVisible();
  await freed(page, await mash(page, true));
});

test('a hunt that ends in the nest: mashing Space wiggles free onto the forest floor', async ({ page }) => {
  test.setTimeout(300_000);
  await page.addInitScript(() => {
    localStorage.setItem('wormsim.lessons', JSON.stringify({ version: 1, done: ['predators', 'eating'] }));
    localStorage.setItem('wormsim.openings', JSON.stringify({ version: 1, seen: Array.from({ length: 30 }, (_, i) => i + 1) }));
  });
  const errors = watchErrors(page);
  await page.goto(PAGE + '?opening=0&robinIn=1&preset=low&nestEscape=1');
  await page.getByRole('button', { name: 'Crawl', exact: true }).click();
  await expect(crawling(page)).toBeVisible();
  // No taps in the grab: the robin wins and carries the whole worm off.
  await expect(page.getByRole('meter', { name: 'Energy' })).toBeVisible({ timeout: 150_000 });
  await expect(scene(page)).toBeVisible({ timeout: 120_000 });
  await freed(page, await mash(page));
  // Same worm, same life: it can crawl on from here.
  expect(errors).toEqual([]);
});
