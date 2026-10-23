import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { VERSION_LABEL } from '../../src/version';

/**
 * Render serves every frozen version at /vN/ by copying releases/ into dist/ after the build
 * (scripts/copy-releases.mjs, render.yaml). This runs that copy into a scratch folder, with a
 * stand-in v1 made from today's build plus every real release in the repo, and checks each copy
 * runs offline from its folder exactly as the root build does.
 */
let site = '';
let versions: string[] = [];

test.beforeAll(() => {
  const root = mkdtempSync(path.join(tmpdir(), 'wormsim-releases-'));
  const from = path.join(root, 'releases');
  site = path.join(root, 'dist');
  mkdirSync(path.join(from, 'v1'), { recursive: true });
  mkdirSync(site, { recursive: true });
  copyFileSync('dist/index.html', path.join(site, 'index.html'));
  copyFileSync('dist/index.html', path.join(from, 'v1', 'index.html'));
  // Real releases (once cut) are checked too; a real v1 replaces the stand-in.
  if (existsSync('releases')) {
    for (const v of readdirSync('releases').filter((n) => /^v[1-9]\d*$/.test(n))) {
      mkdirSync(path.join(from, v), { recursive: true });
      copyFileSync(path.join('releases', v, 'index.html'), path.join(from, v, 'index.html'));
    }
  }
  execFileSync('node', ['scripts/copy-releases.mjs', '--from', from, '--to', site]);
  versions = readdirSync(from);
  test.info().annotations.push({ type: 'releases', description: versions.join(', ') });
});

test.afterAll(() => {
  if (site) rmSync(path.dirname(site), { recursive: true, force: true });
});

test('every release copied into the site runs offline with zero network requests', async ({ page, context }) => {
  expect(versions).toContain('v1');
  await context.setOffline(true);
  // From V3, Crawl unlocks after the round's lesson (the quest list): play as a student who has
  // done it. Older versions ignore this key.
  await page.addInitScript(() => localStorage.setItem('wormsim.lessons', JSON.stringify({ version: 1, done: ['predators', 'eating'] })));
  for (const v of versions) {
    const outside: string[] = [];
    const errors: string[] = [];
    const onRequest = (r: { url(): string }) => { if (!/^(file|data|blob):/.test(r.url())) outside.push(r.url()); };
    page.on('request', onRequest);
    page.on('pageerror', (e) => errors.push(e.message));
    // Three reports shader compile and link failures as console errors.
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(pathToFileURL(path.join(site, v, 'index.html')).href);
    const crawl = page.getByRole('button', { name: 'Crawl', exact: true });
    await expect(crawl).toBeFocused();
    await crawl.click();
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(500);
    await page.keyboard.up('ArrowUp');
    expect(outside, v).toEqual([]);
    expect(errors, v).toEqual([]);
    page.off('request', onRequest);
    page.removeAllListeners('pageerror');
    page.removeAllListeners('console');
  }
});

test('the stand-in v1 copy carries this build\'s version label', async ({ page }) => {
  test.skip(existsSync('releases/v1'), 'a real v1 is frozen: its label is its own');
  await page.goto(pathToFileURL(path.join(site, 'v1', 'index.html')).href);
  await expect(page.locator('meta[name="wormsim-version"]')).toHaveAttribute('content', VERSION_LABEL);
});
