import { test, expect } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROUNDS, VERSION, VERSION_LABEL, VERSION_TITLE } from '../../src/version';

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

test('the Start screen shows "Version N · Name" under the title, at least 18 px and 4.5:1 on the parchment', async ({ page }) => {
  await page.goto(PAGE);
  const label = page.getByText(VERSION_TITLE, { exact: true });
  await expect(label).toBeVisible();
  await expect(page.getByText('A forest floor in fall')).toHaveCount(0);
  const style = await label.evaluate((e) => {
    const s = getComputedStyle(e);
    return { size: parseFloat(s.fontSize), color: s.color };
  });
  expect(style.size).toBeGreaterThanOrEqual(18);
  // The card's parchment shades from --parchment (#f8eed6) to --parchment-lo (#efdfbd) in its
  // corner gradient; check against the darker, worst case.
  const L1 = luminance(style.color);
  const L2 = luminance('rgb(239, 223, 189)');
  expect((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)).toBeGreaterThanOrEqual(4.5);
  await expect(page.getByRole('button', { name: 'Crawl', exact: true })).toBeFocused();
});

test('Versions lists every round, links the older ones to /vN/, and closes with Esc', async ({ page }) => {
  await page.goto(PAGE);
  const versions = page.getByRole('button', { name: 'Versions', exact: true });
  await versions.click();
  const dialog = page.getByRole('dialog', { name: 'Versions' });
  await expect(dialog).toBeVisible();
  for (const r of ROUNDS) {
    const title = `Round ${r.number}: ${r.name}`;
    if (r.number === VERSION.number) {
      await expect(dialog.getByText(title)).toBeVisible();
      await expect(dialog.getByRole('link', { name: title })).toHaveCount(0);
    } else {
      await expect(dialog.getByRole('link', { name: title })).toHaveAttribute('href', `/v${r.number}/`);
    }
    await expect(dialog.getByText(r.about)).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(versions).toBeFocused();
});

test('the built page carries the version meta tag', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator('meta[name="wormsim-version"]')).toHaveAttribute('content', VERSION_LABEL);
});
