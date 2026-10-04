import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_SCALE, SCALE_LABELS, SCALE_MODES, type ScaleMode } from '../../src/surface/worldScale';

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
const radio = (page: Page, mode: ScaleMode) => page.getByRole('radio', { name: new RegExp(`^${SCALE_LABELS[mode]}`) });
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('wormsim.settings') ?? 'null'));
const ready = (page: Page, mode: ScaleMode) =>
  expect(page.getByText(`The forest is ready: ${SCALE_LABELS[mode]}.`)).toBeVisible({ timeout: 30_000 });

/**
 * Counts WebGL buffer deletions. Only freeing the old forest after a rebuild deletes buffers here,
 * so a rise proves a rebuild really ran.
 */
async function countDeletes(page: Page): Promise<() => Promise<number>> {
  await page.addInitScript(() => {
    const w = window as unknown as { __deletes: number };
    w.__deletes = 0;
    const proto = WebGL2RenderingContext.prototype;
    const del = proto.deleteBuffer;
    proto.deleteBuffer = function (b) { w.__deletes++; return del.call(this, b); };
  });
  return () => page.evaluate(() => (window as unknown as { __deletes: number }).__deletes);
}

test('keyboard only: Start -> World scale, pick a mode, it builds, saves, and Esc returns focus', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(PAGE);
  await expect(button(page, 'Crawl')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(button(page, 'World scale')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'World scale' })).toBeVisible();
  await expect(radio(page, DEFAULT_SCALE)).toBeChecked();
  await expect(radio(page, DEFAULT_SCALE)).toBeFocused();
  for (const m of SCALE_MODES) await expect(page.getByText(SCALE_LABELS[m], { exact: true })).toBeVisible();

  // Arrow down to the next mode (it wraps round): it says it is building, then that it is ready.
  const next = SCALE_MODES[(SCALE_MODES.indexOf(DEFAULT_SCALE) + 1) % SCALE_MODES.length];
  await page.keyboard.press('ArrowDown');
  await expect(radio(page, next)).toBeChecked();
  await expect(page.getByText('Building the forest…')).toBeVisible();
  await ready(page, next);
  await expect(radio(page, next)).toBeFocused();
  expect((await saved(page)).scale).toBe(next);

  await page.keyboard.press('Escape');
  await expect(button(page, 'World scale')).toBeFocused();
  // It is still that mode after a reload.
  await page.reload();
  await button(page, 'World scale').click();
  await expect(radio(page, next)).toBeChecked();
  expect(errors).toEqual([]);
});

test('switching modes rebuilds the forest without compiling a single shader, offline, with no errors', async ({ page, context }) => {
  const errors = watchErrors(page);
  const deletes = await countDeletes(page);
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
  await page.goto(PAGE + '?scale=classic');
  // Let the first frames compile everything (the litter's reacting program on its first frame).
  await page.waitForTimeout(2000);
  const compiles = () => page.evaluate(() => (window as unknown as { __compiles: number }).__compiles);
  const before = await compiles();
  expect(before).toBeGreaterThan(0);
  await button(page, 'World scale').click();
  for (const m of ['true', 'hybrid', 'classic', 'true'] as ScaleMode[]) {
    const freed = await deletes();
    await radio(page, m).check();
    await ready(page, m);
    // The old forest was really freed: this switch rebuilt it.
    expect(await deletes()).toBeGreaterThan(freed);
    await page.waitForTimeout(300);
  }
  expect(await compiles()).toBe(before);
  // And the crawl runs in the new forest.
  await button(page, 'Back').click();
  await button(page, 'Crawl').click();
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(600);
  await page.keyboard.up('ArrowUp');
  expect(await compiles()).toBe(before);
  expect(outside).toEqual([]);
  expect(errors).toEqual([]);
});

test('?scale= forces a mode for the visit without changing the saved one', async ({ page }) => {
  await page.goto(PAGE);
  await page.evaluate(() => localStorage.setItem('wormsim.settings', JSON.stringify({ version: 1, graphics: 'auto', autoSettled: null, scale: 'hybrid' })));
  await page.goto(PAGE + '?scale=true');
  await button(page, 'World scale').click();
  await expect(radio(page, 'true')).toBeChecked();
  expect((await saved(page)).scale).toBe('hybrid');
});

test('a Step 1a save (no scale) loads at the default scale and keeps its graphics', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(PAGE);
  await page.evaluate(() => localStorage.setItem('wormsim.settings', JSON.stringify({ version: 1, graphics: 'low', autoSettled: null })));
  await page.reload();
  await button(page, 'World scale').click();
  await expect(radio(page, DEFAULT_SCALE)).toBeChecked();
  await button(page, 'Back').click();
  await button(page, 'Graphics').click();
  await expect(page.getByRole('radio', { name: /^Low/ })).toBeChecked();
  expect(errors).toEqual([]);
});

test('the speed test report names the world scale', async ({ page }) => {
  await page.goto(PAGE + '?quick=1&speedtest=1&scale=true');
  await button(page, 'Start speed test').click();
  await expect(page.getByTestId('result')).toContainText('World scale: True', { timeout: 30_000 });
});

test('a pick then Esc builds it at once on the way out, and Back returns focus to World scale', async ({ page }) => {
  const errors = watchErrors(page);
  const deletes = await countDeletes(page);
  await page.goto(PAGE + '?scale=classic');
  await button(page, 'World scale').click();
  await expect(radio(page, 'classic')).toBeFocused();
  const before = await deletes();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(button(page, 'World scale')).toBeFocused();
  // Built before Start came back (not 400 ms later).
  expect(await deletes()).toBeGreaterThan(before);
  await button(page, 'World scale').click();
  await expect(radio(page, 'hybrid')).toBeChecked();
  await button(page, 'Back').click();
  await expect(button(page, 'World scale')).toBeFocused();
  expect(errors).toEqual([]);
});

for (const leave of [false, true]) {
  test(`a rebuild that fails shows the Something went wrong card${leave ? ' (pick, then Esc at once)' : ''}`, async ({ page }) => {
    await page.goto(PAGE + '?scale=classic');
    await button(page, 'World scale').click();
    // Freeing the old forest throws once.
    await page.evaluate(() => {
      const proto = WebGL2RenderingContext.prototype;
      const del = proto.deleteBuffer;
      let armed = true;
      proto.deleteBuffer = function (b) {
        if (armed) { armed = false; throw new Error('test: rebuild failed'); }
        return del.call(this, b);
      };
    });
    await radio(page, 'true').check();
    if (leave) await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible({ timeout: 30_000 });
    await expect(button(page, 'Reload the page')).toBeFocused();
    // It stays: nothing draws a game screen over it.
    await page.waitForTimeout(800);
    await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
  });
}
