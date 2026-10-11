import { test, expect } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { VERSION_LABEL } from '../../src/version';

const PAGE = pathToFileURL(path.resolve('dist/index.html')).href;

/** WCAG relative luminance of an `rgb(r, g, b)` colour. */
function luminance(rgb: string): number {
  const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map((v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// These tests play as a returning student who has finished this version's lesson, so Crawl comes
// first on Start. The lesson's own flow, on a new device, is tests/e2e/lesson.spec.ts.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wormsim.lessons', JSON.stringify({ version: 1, done: ['predators'] })));
});

test('the Start screen shows the version label, at least 18 px and 7:1 on the parchment', async ({ page }) => {
  await page.goto(PAGE);
  const label = page.getByText(VERSION_LABEL, { exact: true });
  await expect(label).toBeVisible();
  const style = await label.evaluate((e) => {
    const s = getComputedStyle(e);
    return { size: parseFloat(s.fontSize), color: s.color };
  });
  expect(style.size).toBeGreaterThanOrEqual(18);
  // The card's parchment shades from --parchment (#f8eed6) to --parchment-lo (#efdfbd) in its
  // corner gradient; check against the darker, worst case.
  const L1 = luminance(style.color);
  const L2 = luminance('rgb(239, 223, 189)');
  expect((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)).toBeGreaterThanOrEqual(7);
  // Decorative to keyboard users: it takes no focus, so the menu's focus order is unchanged.
  await expect(page.getByRole('button', { name: 'Crawl', exact: true })).toBeFocused();
});

test('the built page carries the version meta tag', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator('meta[name="wormsim-version"]')).toHaveAttribute('content', VERSION_LABEL);
});
