import { test, expect } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ANATOMY_PARTS, ANATOMY_UI, BRISTLE_FACTS } from '../../src/content/anatomy';
import { TEXT, shown } from '../../src/content/text';

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

test('on a phone: the menu is a folded sheet, a card fits the screen, and Home goes back to the game', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto(`${PAGE}?anatomy=1&ao=0`);
  await page.waitForFunction(() => document.body.dataset.anatomyReady === '1', null, { timeout: 90_000 });
  // Nothing spills off the sides.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  // The menu starts folded, so the worm shows; Menu opens it.
  const tabs = page.getByRole('tab', { name: shown(ANATOMY_UI.tabParts) });
  await expect(tabs).toBeHidden();
  await page.getByRole('button', { name: shown(ANATOMY_UI.showPanel), exact: true }).click();
  await tabs.click();
  await page.locator('.anatomy-panel').getByRole('button', { name: shown(ANATOMY_PARTS.gizzard.name), exact: true }).click();
  const card = page.getByRole('dialog');
  await expect(card).toBeVisible();
  const box = (await card.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(664);
  // While the card is open it takes the menu's place; closing it brings the menu back.
  await expect(page.locator('.anatomy-panel')).toBeHidden();
  await card.getByRole('button', { name: shown(ANATOMY_UI.close) }).click();
  await expect(page.locator('.anatomy-panel')).toBeVisible();
  // Home: back to the game (this page without ?anatomy).
  const home = page.getByRole('link', { name: shown(ANATOMY_UI.toGame) });
  await expect(home).toHaveAttribute('href', /index\.html$/);
  // The game menu is here too: its tab slides out the panel, Mission has Back to start, and the
  // Virtual worm icon is left out (this is that page).
  const nav = page.getByRole('navigation', { name: 'Game menu' });
  await nav.getByRole('button', { name: shown(TEXT.menuOpen) }).click();
  await nav.getByRole('tab', { name: shown(TEXT.menuMission) }).click();
  await expect(nav.getByRole('button', { name: shown(TEXT.menuToStart) })).toBeVisible();
  await expect(nav.getByRole('link', { name: shown(TEXT.virtualWorm) })).toHaveCount(0);
  await nav.getByRole('tab', { name: shown(TEXT.menuSettings) }).click();
  await expect(nav.getByRole('group', { name: 'Text size' })).toBeVisible();
  await expect(nav.getByRole('group', { name: 'Graphics' })).toHaveCount(0);
});

test('the bristle close-up animates, marks the fact for what the worm is doing, pauses and changes speed', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${PAGE}?anatomy=1&ao=0`);
  await page.waitForFunction(() => document.body.dataset.anatomyReady === '1', null, { timeout: 90_000 });
  await page.getByRole('button', { name: shown(ANATOMY_UI.viewBristles), exact: true }).click();
  const facts = page.locator('.bristle-facts li');
  await expect(facts).toHaveText([new RegExp(shown(BRISTLE_FACTS.grip)), new RegExp(shown(BRISTLE_FACTS.slide))]);
  // One of the two is marked as happening now.
  await expect(page.locator('.bristle-fact-now')).toHaveCount(1);
  // One Sources button: a pop-up listing every source, each opening in a new tab.
  await page.getByRole('button', { name: shown(ANATOMY_UI.sources) }).click();
  const sources = page.getByRole('dialog', { name: shown(ANATOMY_UI.sources) });
  await expect(sources.getByRole('link')).toHaveCount(3);
  for (const link of await sources.getByRole('link').all()) await expect(link).toHaveAttribute('target', '_blank');
  await sources.getByRole('button', { name: shown(ANATOMY_UI.close) }).click();
  await expect(sources).toBeHidden();
  await page.getByRole('button', { name: shown(ANATOMY_UI.pause) }).click();
  await expect(page.getByRole('button', { name: shown(ANATOMY_UI.play) })).toBeVisible();
  // Speed: five stops, 1x to start; the left end is 1/8.
  const speed = page.getByRole('slider', { name: new RegExp(shown(ANATOMY_UI.speed)) });
  await expect(speed).toHaveAttribute('aria-valuetext', '1x');
  await speed.focus();
  await page.keyboard.press('Home');
  await expect(speed).toHaveAttribute('aria-valuetext', '1/8');
  await page.keyboard.press('End');
  await expect(speed).toHaveAttribute('aria-valuetext', '2x');
  await page.getByRole('button', { name: shown(ANATOMY_UI.viewCrawl), exact: true }).click();
  await expect(facts).toHaveText([new RegExp(shown(BRISTLE_FACTS.wedge)), new RegExp(shown(BRISTLE_FACTS.widen))]);
  // Back to the model: the bristle words go away.
  await page.getByRole('button', { name: shown(ANATOMY_UI.viewOutside), exact: true }).first().click();
  await expect(facts.first()).toBeHidden();
  expect(errors).toEqual([]);
});
