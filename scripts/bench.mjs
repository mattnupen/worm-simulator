// Benchmark: runs the built page in headless Chromium with software WebGL (SwiftShader) at
// 1366x768, runs the speed test, and prints its report plus draw calls / triangles over 1 s idle.
// Usage: node scripts/bench.mjs <repoDir> [label] [query]   e.g. "?speedtest=1&preset=high"
import { chromium } from '@playwright/test';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const repo = process.argv[2];
const label = process.argv[3] ?? 'run';
const query = process.argv[4] ?? '';
const url = pathToFileURL(path.join(repo, 'dist/index.html')).href + query;

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });

await page.addInitScript(() => {
  const stats = { frames: 0, draws: 0, tris: 0 };
  window.__bench = stats;
  const count = (mode, n, inst = 1) => {
    stats.draws++;
    if (mode === 4) stats.tris += (n / 3) * inst; // TRIANGLES
    else if (mode === 5 || mode === 6) stats.tris += Math.max(0, n - 2) * inst;
  };
  for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
    const p = C.prototype;
    const de = p.drawElements, da = p.drawArrays;
    p.drawElements = function (m, n, t, o) { count(m, n); return de.call(this, m, n, t, o); };
    p.drawArrays = function (m, f, n) { count(m, n); return da.call(this, m, f, n); };
    if (p.drawElementsInstanced) {
      const dei = p.drawElementsInstanced, dai = p.drawArraysInstanced;
      p.drawElementsInstanced = function (m, n, t, o, i) { count(m, n, i); return dei.call(this, m, n, t, o, i); };
      p.drawArraysInstanced = function (m, f, n, i) { count(m, n, i); return dai.call(this, m, f, n, i); };
    }
  }
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { stats.frames++; cb(t); });
});

await page.goto(url);
await page.waitForTimeout(1500);
const before = await page.evaluate(() => ({ ...window.__bench }));
await page.waitForTimeout(2000);
const after = await page.evaluate(() => ({ ...window.__bench }));
const rendered = Math.max(1, after.draws - before.draws);
await page.getByRole('button', { name: 'Start speed test' }).click();
await page.getByTestId('result').waitFor({ timeout: 120_000 });
const text = await page.getByTestId('result').innerText();
mkdirSync(path.resolve('test-results'), { recursive: true });
await page.screenshot({ path: path.resolve('test-results', `bench-${label}.png`) });

// Per-frame draw stats sampled while idle (30 fps cap): divide by rendered frames ~ draws/drawsPerFrame.
const sample = await page.evaluate(async () => {
  const s0 = { ...window.__bench };
  await new Promise((r) => setTimeout(r, 1000));
  const s1 = { ...window.__bench };
  return { draws: s1.draws - s0.draws, tris: s1.tris - s0.tris, rafs: s1.frames - s0.frames };
});
console.log(`=== ${label} ===`);
console.log(text);
console.log(`idle 1s: ${sample.draws} draw calls, ${Math.round(sample.tris)} tris over ${sample.rafs} rAFs`);
console.log(`errors: ${errors.length ? errors.join(' | ') : 'none'}`);
void rendered;
await browser.close();
