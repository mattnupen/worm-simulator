import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TEXT, shown } from '../../src/content/text';

const PAGE = pathToFileURL(path.resolve('dist/index.html')).href;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('GPU stall')) errors.push(m.text());
  });
  return errors;
}

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const scene = (page: Page) => page.getByRole('region', { name: shown(TEXT.nestLabel) });
const crawling = (page: Page) => page.getByRole('region', { name: 'Crawling' });

test('?nest=1: "Watch the nest scene" leads Start; Esc skips to the fact card, and Keep going goes to play', async ({ page, context }) => {
  const errors = watchErrors(page);
  const outside: string[] = [];
  page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) outside.push(r.url()); });
  await context.setOffline(true);
  await page.goto(PAGE + '?nest=1');
  const watch = button(page, shown(TEXT.nestWatch));
  await expect(watch).toBeFocused();
  await watch.click();
  await expect(scene(page)).toBeVisible();
  // No Skip button, as in the opening.
  await expect(scene(page).getByRole('button')).toHaveCount(0);
  await page.keyboard.press('Escape');
  const fact = page.locator(`[data-source="${TEXT.nestFact.source}"]`, { hasText: TEXT.nestFact.text });
  await expect(fact).toBeVisible();
  await expect(page.getByText(shown(TEXT.nestSeason))).toBeVisible();
  await expect(page.getByRole('link', { name: /Cornell Lab/ })).toHaveAttribute('target', '_blank');
  const go = button(page, shown(TEXT.nestContinue));
  await expect(go).toBeFocused();
  await go.press('Enter');
  await expect(crawling(page)).toBeVisible();
  expect(outside).toEqual([]);
  expect(errors).toEqual([]);
});

test('a tap anywhere skips too (touch has no Esc), and the scene plays to its card by itself', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await page.goto(PAGE + '?nest=1');
  await button(page, shown(TEXT.nestWatch)).click();
  await expect(scene(page)).toBeVisible();
  await page.mouse.click(200, 300);
  await expect(button(page, shown(TEXT.nestContinue))).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(crawling(page)).toBeVisible();
  // Unskipped, it reaches the card on its own (a slow software renderer plays it slowly).
  await page.goto(PAGE + '?nest=1');
  await button(page, shown(TEXT.nestWatch)).click();
  await expect(page.getByText(shown(TEXT.nestCheep))).toBeVisible({ timeout: 60_000 });
  await expect(button(page, shown(TEXT.nestContinue))).toBeVisible({ timeout: 60_000 });
  expect(errors).toEqual([]);
});

test('without ?nest=1 there is no nest scene button', async ({ page }) => {
  await page.goto(PAGE);
  await expect(button(page, shown(TEXT.nestWatch))).toHaveCount(0);
});
