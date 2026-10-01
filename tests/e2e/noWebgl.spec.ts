import { test, expect } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PAGE = pathToFileURL(path.resolve('dist/index.html')).href;

// Own file: launchOptions force a new worker, so they cannot live in a describe group.
test.use({ launchOptions: { args: ['--disable-3d-apis', '--disable-gpu'] } });

test('shows a FAIL report instead of a blank page when WebGL 2 is missing', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await context.setOffline(true);
  await page.goto(PAGE);
  const result = page.getByTestId('result');
  await expect(result).toContainText('Result: FAIL');
  await expect(result).toContainText('WebGL 2');
  await expect(page.getByRole('button', { name: 'Copy results' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Try driving the worm' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
