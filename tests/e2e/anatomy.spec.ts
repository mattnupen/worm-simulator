import { test, expect } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ANATOMY_PARTS, ANATOMY_UI } from '../../src/content/anatomy';
import { shown } from '../../src/content/text';

const PAGE = pathToFileURL(path.resolve('dist/index.html')).href;

test('the anatomy viewer opens, labels its parts, and opens a sourced fact card', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  const outside: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) outside.push(r.url()); });
  await page.goto(`${PAGE}?anatomy=1&view=gut&ao=0`);
  await expect(page.locator('body[data-anatomy-ready="1"]')).toHaveCount(1, { timeout: 90_000 });

  const gizzard = page.locator('.anatomy-label', { hasText: shown(ANATOMY_PARTS.gizzard.name) });
  await expect(gizzard).toBeVisible();
  await gizzard.click();
  const card = page.getByRole('dialog');
  await expect(card).toContainText(shown(ANATOMY_PARTS.gizzard.fact));
  await expect(card.getByRole('link')).toHaveAttribute('target', '_blank');
  await expect(gizzard).toHaveAttribute('aria-current', 'true');
  await card.getByRole('button', { name: shown(ANATOMY_UI.close) }).click();
  await expect(card).toBeHidden();

  // The parts list finds a part by name and selects it.
  await page.getByRole('tab', { name: shown(ANATOMY_UI.tabParts) }).click();
  await page.getByRole('searchbox').fill('crop');
  await page.locator('.anatomy-panel').getByRole('button', { name: shown(ANATOMY_PARTS.crop.name), exact: true }).click();
  await expect(card).toContainText(shown(ANATOMY_PARTS.crop.fact));

  // A how-solid slider fades a system; the card's Hide hides it, and Reset brings it back.
  await page.getByRole('tab', { name: shown(ANATOMY_UI.tabLayers) }).click();
  const skin = page.getByLabel(`${shown(ANATOMY_UI.sysSkin)}, ${shown(ANATOMY_UI.howSolid)}`);
  await skin.fill('40');
  await expect(skin).toHaveValue('40');
  await card.getByRole('button', { name: new RegExp(`^${shown(ANATOMY_UI.actHide)}`) }).click();
  const reset = page.getByRole('button', { name: shown(ANATOMY_UI.reset) });
  await expect(reset).toBeVisible();
  await reset.click();
  await expect(skin).toHaveValue('100');

  // A system switch says on or off with aria-pressed (and a tick), not colour alone.
  const gut = page.locator('.anatomy-toggle', { hasText: shown(ANATOMY_UI.sysGut) });
  await expect(gut).toHaveAttribute('aria-pressed', 'true');
  await gut.click();
  await expect(gut).toHaveAttribute('aria-pressed', 'false');
  await expect(gizzard).toBeHidden();

  expect(errors).toEqual([]);
  expect(outside).toEqual([]);
});
