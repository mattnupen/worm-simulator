import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PAGE = pathToFileURL(path.resolve('dist/index.html')).href;

/** WCAG relative luminance of an `rgb(r, g, b)` colour. */
function luminance(rgb: string): number {
  const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map((v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

const prompt = (page: Page) => page.locator('.action-prompt');
const resume = (page: Page) => page.getByRole('region', { name: 'Paused' }).getByRole('button', { name: 'Resume' });

/**
 * Pause from the game menu with the keyboard (Esc no longer pauses: Matt, 2026-10-23), so no click
 * lands on the page. Tab reaches the menu's tab first; Pause is its column's last icon.
 */
async function pause(page: Page): Promise<void> {
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(resume(page)).toBeVisible();
}
const presses = (page: Page) => page.locator('#app').getAttribute('data-action-presses');

async function crawl(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Crawl', exact: true }).click();
  await expect(page.locator('#app[data-ui="crawl"]')).toBeVisible();
  // The first crawling frames compile the litter's reacting shader (a second or more in software
  // WebGL): let them pass, so presses land in steady frames.
  await page.waitForTimeout(1500);
}

test.describe('on a touch screen', () => {
  test.use({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true });

  test('the Action button shows, big, bottom right, clear of the joystick; a tap is one Action press', async ({ page }) => {
    await page.goto(PAGE + '?prompt=digDown');
    await expect(prompt(page)).toBeHidden();
    await crawl(page);
    const btn = page.getByRole('button', { name: 'Dig down' });
    await expect(btn).toBeVisible();
    // No keyboard here: no key chip.
    await expect(page.locator('.action-key')).toBeHidden();
    const box = (await btn.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(64);
    expect(box.width).toBeGreaterThanOrEqual(64);
    expect(box.x + box.width).toBeGreaterThan(300);
    expect(box.y + box.height).toBeGreaterThan(560);
    const stick = (await page.locator('.joystick').boundingBox())!;
    expect(box.x).toBeGreaterThan(stick.x + stick.width);
    expect(await presses(page)).toBeNull();
    await btn.tap();
    await expect.poll(() => presses(page)).toBe('1');
    await btn.tap();
    await expect.poll(() => presses(page)).toBe('2');
  });

  test('every kind fits beside the joystick, 8 px clear, at 360 and 320 px', async ({ page }) => {
    for (const width of [360, 320]) {
      await page.setViewportSize({ width, height: 640 });
      for (const kind of ['digDown', 'comeUp', 'viewWide', 'viewClose']) {
        const at = `${kind} at ${width} px`;
        await page.goto(PAGE + `?prompt=${kind}`);
        await crawl(page);
        await expect(prompt(page)).toBeVisible();
        const box = (await prompt(page).boundingBox())!;
        const stick = (await page.locator('.joystick').boundingBox())!;
        expect(box.x, at).toBeGreaterThanOrEqual(stick.x + stick.width + 8);
        expect(box.x + box.width, at).toBeLessThanOrEqual(width);
        expect(box.height, at).toBeGreaterThanOrEqual(64);
        const size = await prompt(page).locator('.btn-label').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
        expect(size, at).toBeGreaterThanOrEqual(18);
      }
    }
  });

  test('a touch held while the prompt hides and comes back is still one press', async ({ page }) => {
    await page.goto(PAGE + '?prompt=digDown');
    await crawl(page);
    const btn = page.getByRole('button', { name: 'Dig down' });
    const box = (await btn.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const touchPoints = [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints });
    await expect.poll(() => presses(page)).toBe('1');
    // The game hides the prompt (digging, coming up) and shows it again, the finger still down.
    await page.evaluate(() => { document.getElementById('app')!.dataset.promptOff = '1'; });
    await expect(prompt(page)).toBeHidden();
    await page.waitForTimeout(800);
    await page.evaluate(() => { delete document.getElementById('app')!.dataset.promptOff; });
    await expect(btn).toBeVisible();
    await page.waitForTimeout(800);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(500);
    expect(await presses(page)).toBe('1');
    // Let go, the next tap is the next press.
    await btn.tap();
    await expect.poll(() => presses(page)).toBe('2');
  });

  test('pausing mid-tap: the lift clicks nothing on the Paused chip', async ({ page }) => {
    await page.goto(PAGE + '?prompt=digDown');
    await crawl(page);
    const box = (await page.getByRole('button', { name: 'Dig down' }).boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const touchPoints = [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints });
    await pause(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(500);
    // Still paused: the tap's click did not land on Resume (or anything else).
    await expect(resume(page)).toBeVisible();
  });
});

// These tests play as a returning student who has finished this version's lesson and seen its
// opening scene, so Crawl comes first on Start and goes straight to play. The lesson's own flow,
// on a new device, is tests/e2e/lesson.spec.ts.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('wormsim.lessons', JSON.stringify({ version: 1, done: ['predators', 'eating'] }));
    localStorage.setItem('wormsim.openings', JSON.stringify({ version: 1, seen: Array.from({ length: 30 }, (_, i) => i + 1) }));
  });
});

test('a click with no pointer (Switch Access, a screen reader) is one Action press', async ({ page }) => {
  await page.goto(PAGE + '?prompt=viewWide');
  await crawl(page);
  await prompt(page).evaluate((b) => { b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })); });
  await expect.poll(() => presses(page)).toBe('1');
  await page.waitForTimeout(500);
  expect(await presses(page)).toBe('1');
});

test('with a keyboard: icon, word and a Space chip; Space presses Action once per press; it never takes focus', async ({ page }) => {
  await page.goto(PAGE + '?prompt=comeUp');
  await crawl(page);
  const btn = page.getByRole('button', { name: 'Come up' });
  await expect(btn).toBeVisible();
  await expect(btn).toHaveAttribute('aria-keyshortcuts', 'Space');
  await expect(page.locator('.action-key')).toBeVisible();
  await expect(page.locator('.action-key')).toHaveText('Space');
  // 18 px+ text at 7:1 or better against the button's darkest shade (#f4b244).
  const style = await btn.locator('.btn-label').evaluate((e) => {
    const s = getComputedStyle(e);
    return { size: parseFloat(s.fontSize), color: s.color };
  });
  expect(style.size).toBeGreaterThanOrEqual(18);
  expect(contrast(style.color, 'rgb(244, 178, 68)')).toBeGreaterThanOrEqual(7);
  expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(64);
  // Space is Action; holding it is one press.
  await page.keyboard.down('Space');
  await page.waitForTimeout(400);
  await page.keyboard.up('Space');
  await expect.poll(() => presses(page)).toBe('1');
  // A quick tap (down and up between two game steps) is still one press.
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await expect.poll(() => presses(page)).toBe('2');
  // A mouse press on it is an Action press too.
  await btn.click();
  await expect.poll(() => presses(page)).toBe('3');
  // It never takes keyboard focus (Space must not also "click" it).
  await expect(btn).not.toBeFocused();
  await expect(btn).toHaveAttribute('tabindex', '-1');
  // It goes with the crawl: hidden when paused.
  await pause(page);
  await expect(btn).toBeHidden();
});

test('Space on a focused Crawl or Resume button starts or resumes, and is never also an Action press', async ({ page }) => {
  await page.goto(PAGE + '?prompt=digDown');
  const crawling = page.locator('#app[data-ui="crawl"]');
  await expect(page.getByRole('button', { name: 'Crawl', exact: true })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(crawling).toBeVisible();
  // Let the first crawling frames (and their steps) run: still no press.
  await page.waitForTimeout(1500);
  expect(await presses(page)).toBeNull();
  await pause(page);
  await expect(resume(page)).toBeFocused();
  await page.keyboard.press('Space');
  await expect(crawling).toBeVisible();
  await page.waitForTimeout(800);
  expect(await presses(page)).toBeNull();
  // A real Space press while crawling (focus on the card) is one press.
  await page.keyboard.press('Space');
  await expect.poll(() => presses(page)).toBe('1');
});

test('without ?prompt= the game sets the prompt: none on the Start card, Dig down at the spawn (V2), none while paused', async ({ page }) => {
  await page.goto(PAGE);
  await page.waitForTimeout(300);
  await expect(prompt(page)).toBeHidden();
  await crawl(page);
  // The worm may dig where it starts.
  await expect(page.getByRole('button', { name: 'Dig down' })).toBeVisible();
  await pause(page);
  await expect(prompt(page)).toBeHidden();
});
