import { expect, test, type Page } from '@playwright/test';

/** One student's whole first visit: join, think first, post a drawn idea, see the board, dig. */
async function join(page: Page, period: number) {
  await page.goto('/');
  await page.fill('#code', 'sample-1');
  await page.click(`[data-p="${period}"]`);
  await page.click('button:text("Join")');
}

test('a student thinks first, posts a drawing, then digs from another idea', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await join(page, 3);
  await expect(page.locator('#gate')).toBeVisible();
  await expect(page.locator('.card')).toHaveCount(0);

  await page.click('#gateBtn');
  await page.click('button:text("Next")');
  await expect(page.locator('#err')).toHaveText(/Pick what your idea is about/);
  await page.fill('#fOther', 'Fish');
  await page.click('button:text("Next")');
  await page.check('input[name="fact"][value="game"]');
  await page.click('button:text("Next")');
  await page.fill('#fTitle', 'Heron at the pond');
  await page.fill('#fDoes', 'A heron stands still in the water. Stay deep in the mud.');
  await page.click('button:text("Next")');
  const box = (await page.locator('#pad').boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 120, { steps: 6 });
  await page.mouse.up();
  await page.click('button:text("Post idea")');

  await expect(page.locator('#gate')).toBeHidden();
  const mine = page.locator('.card.mine', { hasText: 'Heron at the pond' });
  await expect(mine).toBeVisible();
  await expect(mine.locator('img.thumb')).toBeVisible();
  // two "Something else: fish" answers in the sample, plus this one, make a Fish area
  await expect(page.locator('.zone', { hasText: 'Fish' })).toBeVisible();

  await page.locator('.card', { hasText: 'Robin shadow warning' }).click();
  await expect(page.locator('#panel')).toBeVisible();
  await expect(page.locator('#panel [data-edit]')).toHaveCount(0); // not mine: no Change button
  await page.click('[data-dig2]');
  await page.click('#twistUse');
  await page.click('button:text("Next")');
  await page.click('button:text("Next")');
  await page.fill('#fTitle', 'Shadow at sunset');
  await page.fill('#fDoes', 'Long shadows are harder to read.');
  await page.click('button:text("Next")');
  await page.click('[data-pt="none"]');
  await page.click('button:text("Post idea")');
  await expect(page.locator('#panel h2')).toHaveText('Shadow at sunset');
  await expect(page.locator('#panel')).toContainText('Dug from');
  expect(errors).toEqual([]);
});

test('the teacher signs in, sees every answer and exports the board', async ({ page }) => {
  await page.goto('/teacher');
  await page.fill('#pw', 'pw');
  await page.click('button:text("Sign in")');
  await expect(page.getByText('Round boards')).toBeVisible();
  await page.click('[data-areas="sample-predators"]');
  await expect(page.locator('table.areas')).toContainText('Birds');
  const res = await page.request.get('/api/boards/sample-predators/export');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('application/zip');
});

test('the list view works for keyboard and small screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await join(page, 1);
  await page.click('#gateBtn');
  await page.check('input[name="choice"][value="birds"]');
  await page.click('button:text("Next")');
  await page.click('button:text("Next")');
  await page.fill('#fTitle', 'Phone idea');
  await page.fill('#fDoes', 'Something on a phone.');
  await page.click('button:text("Next")');
  await page.click('[data-pt="none"]');
  await page.click('button:text("Post idea")');
  await expect(page.locator('#listview')).toBeVisible();
  await page.locator('#listview button', { hasText: 'Woodcock probe attack' }).click();
  await expect(page.locator('#panel h2')).toHaveText('Woodcock probe attack');
});
