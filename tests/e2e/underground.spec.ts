import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TEXT, shown } from '../../src/content/text';

const PAGE = pathToFileURL(path.resolve('dist/index.html')).href;
/** SwiftShader is slow underground, and the game clock slows with it: generous waits on the game's place. */
const SLOW = 45_000;

/** Page errors and console errors. SwiftShader's "GPU stall due to ReadPixels" is a harmless driver note. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('GPU stall')) errors.push(m.text());
  });
  return errors;
}

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
/** The Action prompt (an icon and a word: actionPrompt.ts), found by its word. */
const prompt = (page: Page, word: string) => page.locator('.action-prompt').getByText(word, { exact: true });
const place = (page: Page, p: string) => expect(page.locator(`#app[data-place="${p}"]`)).toHaveCount(1, { timeout: SLOW });
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('wormsim.settings') ?? 'null'));
const LAYERS = [TEXT.layerLitter, TEXT.layerOld, TEXT.layerHumus, TEXT.layerTopsoil, TEXT.layerSubsoil].map(shown);

/**
 * Lets a few frames (and so game steps) run. Steps run inside rendered frames, and a frame can be
 * slow in SwiftShader: a key let go and pressed again within one frame would read as held throughout
 * (the keyboard keeps a quick tap down until a step has seen it), so the second press would be lost.
 */
async function frames(page: Page, n = 3): Promise<void> {
  await page.evaluate((count) => new Promise<void>((done) => {
    let k = 0;
    const next = (): void => { if (++k >= count) done(); else requestAnimationFrame(next); };
    requestAnimationFrame(next);
  }), n);
}

/** A real key press: held for 150 ms or more, so the 60 Hz game steps see it, then let go for some frames. */
async function hold(page: Page, key: string, ms = 150): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await frames(page);
  await page.keyboard.up(key);
  await page.waitForTimeout(150);
  await frames(page);
}

/** Holds a key until `until` passes (the worm steered somewhere), then lets go. */
async function holdUntil(page: Page, key: string, until: () => Promise<void>): Promise<void> {
  await page.keyboard.down(key);
  try {
    await until();
  } finally {
    await page.keyboard.up(key);
  }
  await frames(page);
}

/** Counts shader compiles and program links from the start of the page. */
async function countCompiles(page: Page): Promise<() => Promise<number>> {
  await page.addInitScript(() => {
    const w = window as unknown as { __compiles: number };
    w.__compiles = 0;
    const proto = WebGL2RenderingContext.prototype;
    const compile = proto.compileShader;
    const link = proto.linkProgram;
    proto.compileShader = function (s) { w.__compiles++; return compile.call(this, s); };
    proto.linkProgram = function (p) { w.__compiles++; return link.call(this, p); };
  });
  return () => page.evaluate(() => (window as unknown as { __compiles: number }).__compiles);
}

/**
 * Records, at every change to the game's place, the crawl card or the reduced-motion dip, what the
 * page shows then (window.__seen): the place, whether the first visit's hint card shows, and the
 * dip (-1 hidden, else its opacity), and when (ms).
 */
type Seen = { place: string; hint: boolean; dip: number; t: number };
async function recordPlaces(page: Page): Promise<() => Promise<Seen[]>> {
  await page.addInitScript(() => {
    type Seen = { place: string; hint: boolean; dip: number; t: number };
    const w = window as unknown as { __seen: Seen[] };
    w.__seen = [];
    const snap = (): void => {
      const app = document.getElementById('app');
      const panel = document.querySelector<HTMLElement>('.panel');
      const fade = document.querySelector<HTMLElement>('.cut-fade');
      if (!app?.dataset.place) return;
      w.__seen.push({
        place: app.dataset.place,
        hint: !!panel && panel.dataset.card === 'hint' && !panel.hidden,
        dip: !fade || fade.hidden ? -1 : Number(fade.style.opacity),
        t: performance.now(),
      });
    };
    document.addEventListener('DOMContentLoaded', () => {
      new MutationObserver(snap).observe(document.body, {
        subtree: true, attributes: true, attributeFilter: ['data-place', 'data-card', 'hidden', 'style'],
      });
    });
  });
  return () => page.evaluate(() => (window as unknown as { __seen: Seen[] }).__seen);
}

// These tests play as a returning student who has finished this version's lesson, so Crawl comes
// first on Start. The lesson's own flow, on a new device, is tests/e2e/lesson.spec.ts.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wormsim.lessons', JSON.stringify({ version: 1, done: ['predators'] })));
});

test('keyboard only: dig down, dig around, switch the camera, pause, come up', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await page.goto(PAGE);
  await expect(button(page, 'Crawl')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Crawling' })).toBeVisible();
  await expect(prompt(page, 'Dig down')).toBeVisible({ timeout: SLOW });
  await hold(page, 'Space');
  await place(page, 'underground');
  await expect(prompt(page, 'Close view')).toBeVisible({ timeout: SLOW });
  // Dig around.
  await hold(page, 'ArrowDown', 1200);
  await hold(page, 'ArrowRight', 1200);
  // Switch the camera: saved only now (the V1 rule), and the prompt offers the other view.
  expect((await saved(page))?.undergroundView).toBeUndefined();
  await hold(page, 'Space');
  await expect(prompt(page, 'Wide view')).toBeVisible({ timeout: SLOW });
  expect((await saved(page)).undergroundView).toBe('close');
  // Pause and resume underground.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Paused' })).toBeVisible();
  await expect(page.locator('.action-prompt')).toBeHidden();
  await page.keyboard.press('Escape');
  await place(page, 'underground');
  await expect(prompt(page, 'Wide view')).toBeVisible({ timeout: SLOW });
  // Up into the litter, then Action comes up.
  await holdUntil(page, 'ArrowUp', () => expect(prompt(page, 'Come up')).toBeVisible({ timeout: SLOW }));
  await place(page, 'underground');
  await hold(page, 'Space');
  await place(page, 'comingUp');
  await place(page, 'surface');
  await expect(page.getByRole('region', { name: 'Crawling' })).toBeVisible();
  await expect(prompt(page, 'Dig down')).toBeVisible({ timeout: SLOW });
  expect(errors).toEqual([]);
});

test('going down and coming up compiles no shader, offline, with zero network requests; the CSP holds', async ({ page, context }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  const compiles = await countCompiles(page);
  const outside: string[] = [];
  page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) outside.push(r.url()); });
  await context.setOffline(true);
  await page.goto(PAGE);
  await button(page, 'Crawl').click();
  // Let the first frames run (everything is compiled at load: warmShaders).
  await hold(page, 'ArrowUp', 800);
  await page.waitForTimeout(1500);
  const before = await compiles();
  expect(before).toBeGreaterThan(0);
  await expect(prompt(page, 'Dig down')).toBeVisible({ timeout: SLOW });
  await hold(page, 'Space');
  await place(page, 'underground');
  await hold(page, 'ArrowDown', 800);
  await expect(prompt(page, 'Close view')).toBeVisible({ timeout: SLOW });
  await hold(page, 'Space'); // Close view
  await expect(prompt(page, 'Wide view')).toBeVisible({ timeout: SLOW });
  await hold(page, 'Space'); // and back to Wide
  await expect(prompt(page, 'Close view')).toBeVisible({ timeout: SLOW });
  await holdUntil(page, 'ArrowUp', () => expect(prompt(page, 'Come up')).toBeVisible({ timeout: SLOW }));
  await hold(page, 'Space');
  await place(page, 'surface');
  await hold(page, 'ArrowUp', 800);
  expect(await compiles()).toBe(before);
  expect(outside).toEqual([]);
  expect(errors).toEqual([]);
  // The CSP still blocks every connection: the meta says so, and a fetch is refused.
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("connect-src 'none'");
  const refused = await page.evaluate(async () => {
    let directive = '';
    document.addEventListener('securitypolicyviolation', (e) => { directive = e.effectiveDirective; });
    const got = await fetch('https://wormsimulator.com/').then(() => 'fetched', () => 'refused');
    await new Promise((r) => setTimeout(r, 50));
    return `${got} ${directive}`;
  });
  expect(refused).toBe('refused connect-src');
  expect(outside).toEqual([]);
});

test('touch: the Action button digs down, switches the view and comes up; the joystick steers underground', async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 360, height: 640 } });
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto(PAGE);
  await button(page, 'Crawl').click();
  const cdp = await context.newCDPSession(page);
  type Box = { x: number; y: number; width: number; height: number };
  /** A finger down at the box's centre, or (dragged) from its lower part to (dx, dy) from its centre. */
  const touchDown = async (box: Box, dx = 0, dy = 0) => {
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const drag = dx !== 0 || dy !== 0;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: drag ? y + box.height * 0.35 : y }] });
    if (drag) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx, y: y + dy }] });
  };
  const touchUp = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  /** A tap on the Action button showing `word`, held 200 ms. */
  const action = async (word: string) => {
    await expect(prompt(page, word)).toBeVisible({ timeout: SLOW });
    await touchDown((await page.locator('.action-prompt').boundingBox())!);
    await page.waitForTimeout(200);
    await frames(page);
    await touchUp();
    await frames(page);
  };
  await action('Dig down');
  await place(page, 'underground');
  // The first visit's hint card, touch version: the touch controls first, "look, don't eat" last,
  // and compact (at most about 35% of the screen). It may be placed "off" (hidden over the head in
  // the middle of a short screen: hintPlace.ts), so this reads its layout box, not what is seen.
  const card = page.locator('.panel[data-card="hint"]');
  await expect(card).toHaveCount(1, { timeout: SLOW });
  const lines = await card.locator('p').allTextContents();
  expect(lines[0].trim()).toBe(shown(TEXT.undergroundHintTouch));
  expect(lines[lines.length - 1]).toBe(shown(TEXT.lookDontEat));
  const area = await card.evaluate((e) => { const r = e.getBoundingClientRect(); return r.width * r.height; });
  expect(area).toBeLessThanOrEqual(0.35 * 360 * 640);
  await action('Close view');
  await expect(prompt(page, 'Wide view')).toBeVisible({ timeout: SLOW });
  // The joystick points the way: up into the litter, where Action comes up.
  await touchDown((await page.locator('.joystick').boundingBox())!, 0, -40);
  try {
    await expect(prompt(page, 'Come up')).toBeVisible({ timeout: SLOW });
  } finally {
    await touchUp();
  }
  await action('Come up');
  await place(page, 'surface');
  expect(errors).toEqual([]);
  await context.close();
});

test('reduced motion: going down dips through dark soil instead of swinging the camera', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const seen = await recordPlaces(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  await button(page, 'Crawl').click();
  await expect(prompt(page, 'Dig down')).toBeVisible({ timeout: SLOW });
  await hold(page, 'Space');
  await place(page, 'underground');
  await expect(page.locator('.cut-fade')).toBeHidden();
  const s = await seen();
  const down = s.filter((e) => e.place === 'diggingDown');
  // The dip goes dark...
  expect(Math.max(...down.map((e) => e.dip))).toBeGreaterThanOrEqual(0.8);
  // ...and, once it starts, covers the whole move: no frame of the move is seen clear (the camera
  // cuts to the cut in the dark; it never swings in view).
  const first = down.findIndex((e) => e.dip > 0);
  expect(first).toBeGreaterThanOrEqual(0);
  expect(down.slice(first).filter((e) => e.dip <= 0)).toEqual([]);
  // Clear again once underground.
  expect(s[s.length - 1]).toMatchObject({ place: 'underground', dip: -1 });
  expect(errors).toEqual([]);
});

test('digging, the tunnels\' hollow tiles draw in the scene, within the 40 draw call budget (spec 2026-10-08 section 6)', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  // The speed test's scripted dig (the perf gates' underground run). ?speedtest=1 also sets
  // window.__wormDebug (main.ts); the full test, not ?quick=1, so it is still digging when checked.
  await page.goto(PAGE + '?speedtest=1&dig=1');
  await page.getByRole('button', { name: 'Start speed test' }).click();
  await place(page, 'underground');
  await page.waitForTimeout(1500);
  await frames(page);
  type Debug = { hollow(): { inScene: boolean; visible: boolean; count: number }; drawCalls(): number };
  const read = () => page.evaluate(() => {
    const d = (window as unknown as { __wormDebug: Debug }).__wormDebug;
    return { hollow: d.hollow(), calls: d.drawCalls() };
  });
  await expect.poll(async () => (await read()).hollow.count, { timeout: SLOW }).toBeGreaterThan(0);
  const got = await read();
  expect(got.hollow.inScene).toBe(true);
  expect(got.hollow.visible).toBe(true);
  expect(got.calls).toBeGreaterThan(0);
  expect(got.calls).toBeLessThanOrEqual(40);
  expect(errors).toEqual([]);
});

test.describe('at 1366 x 768', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('the nearer end names its five layers, 18 px+, clear of the controls', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await page.goto(PAGE);
    await button(page, 'Crawl').click();
    await expect(prompt(page, 'Dig down')).toBeVisible({ timeout: SLOW });
    await hold(page, 'Space');
    await place(page, 'underground');
    // The near end is the one screen readers hear (no aria-hidden); it always shows all five names.
    const near = page.locator('.cut-labels:not([hidden]):not([aria-hidden])');
    await expect(near).toHaveCount(1, { timeout: SLOW });
    for (const name of LAYERS) await expect(near.locator('.cut-label', { hasText: name })).toBeVisible();
    // Let the names settle where the camera rests (the control rects are read again every 60 frames).
    await page.waitForTimeout(1500);
    const got = await page.evaluate(() => {
      const rect = (e: Element) => {
        const r = e.getBoundingClientRect();
        return { l: r.left, t: r.top, r: r.right, b: r.bottom };
      };
      const box = document.querySelector('.cut-labels:not([hidden]):not([aria-hidden])')!;
      const labels = [...box.querySelectorAll<HTMLElement>('.cut-label:not([hidden])')].map((e) => ({
        text: e.textContent ?? '', size: parseFloat(getComputedStyle(e).fontSize), ...rect(e),
      }));
      const controls = ['.joystick', '.action-prompt', '.pause-btn'].map((sel) => {
        const e = document.querySelector(sel);
        return { sel, ...(e ? rect(e) : { l: 0, t: 0, r: 0, b: 0 }) };
      }).filter((c) => c.r > c.l && c.b > c.t);
      return { labels, controls };
    });
    expect(got.labels.map((l) => l.text).sort()).toEqual([...LAYERS].sort());
    // The Pause button and the Action prompt show on a desktop; the joystick too.
    expect(got.controls.map((c) => c.sel).sort()).toEqual(['.action-prompt', '.joystick', '.pause-btn']);
    for (const l of got.labels) {
      expect(l.size, l.text).toBeGreaterThanOrEqual(18);
      // On screen (docked at the edge when the end itself is off screen).
      expect(l.l, l.text).toBeGreaterThanOrEqual(0);
      expect(l.r, l.text).toBeLessThanOrEqual(1366);
      expect(l.t, l.text).toBeGreaterThanOrEqual(0);
      expect(l.b, l.text).toBeLessThanOrEqual(768);
      for (const c of got.controls) {
        const overlap = l.l < c.r && l.r > c.l && l.t < c.b && l.b > c.t;
        expect(overlap, `${l.text} over ${c.sel}`).toBe(false);
      }
    }
    expect(errors).toEqual([]);
  });

  test('the first visit\'s hint card comes after the swing: the fact, then the Game choice line, at an edge', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    const seen = await recordPlaces(page);
    await page.goto(PAGE);
    await button(page, 'Crawl').click();
    await expect(prompt(page, 'Dig down')).toBeVisible({ timeout: SLOW });
    await hold(page, 'Space');
    await place(page, 'underground');
    const card = page.locator('.panel[data-card="hint"]');
    await expect(card).toBeVisible({ timeout: SLOW });
    // Never shown over the surface view or the moves: only once the camera is at the cut.
    const s = await seen();
    // (The card is set by the game step that arrives, data-place by the next drawn frame: a step in
    // a frame the cap does not draw can show it one frame early, at the end of the move, never sooner.)
    const first = s.findIndex((e) => e.hint);
    expect(first).toBeGreaterThan(0);
    expect(s.slice(0, first).some((e) => e.place === 'diggingDown')).toBe(true);
    const arrived = s.findIndex((e, i) => i >= first && e.place === 'underground');
    expect(arrived).toBeGreaterThanOrEqual(first);
    expect(s.slice(first, arrived).map((e) => e.place)).toEqual(s.slice(first, arrived).map(() => 'diggingDown'));
    expect(s[arrived].t - s[first].t).toBeLessThan(400);
    expect(s.slice(arrived).filter((e) => e.place !== 'underground')).toEqual([]);
    // The real fact first, then the Game choice line (science honesty).
    const lines = await card.locator('p').allTextContents();
    const fact = lines.indexOf(shown(TEXT.burrowFact));
    expect(fact).toBeGreaterThanOrEqual(0);
    expect(lines[fact + 1]).toBe(shown(TEXT.burrowChoice));
    expect(shown(TEXT.burrowChoice)).toMatch(/^Game choice: /);
    // Then "look, don't eat", last (the puffball in the cut; parent spec 5).
    expect(lines[lines.length - 1]).toBe(shown(TEXT.lookDontEat));
    // Off the worm's head: hintPlace.ts keeps it at the top or the bottom edge, away from the head
    // (the head's screen position has no page hook, so this checks where it was put).
    await expect(card).toHaveAttribute('data-at', /^(top|bottom)$/);
    const at = await card.getAttribute('data-at');
    const box = (await card.boundingBox())!;
    if (at === 'top') expect(box.y).toBeLessThanOrEqual(24);
    else expect(box.y + box.height).toBeGreaterThanOrEqual(768 - 200);
    expect(box.height).toBeLessThan(768 / 3);
    expect(errors).toEqual([]);
  });
});
