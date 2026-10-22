import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Rollup } from 'vite';

// The robin grab's per-step paths make no garbage (visual-quality brief), measured as
// stepAllocation.test.ts measures the game's: the probe bundled as the game is, run under
// `node --expose-gc` after a long warm-up.

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PROBE = fileURLToPath(new URL('./huntAllocation.probe.ts', import.meta.url));

interface Measured { skipped?: string; grip: number; calls: number; look: number; held: number; shake: number; mode: string }

async function measure(): Promise<Measured> {
  const out = (await build({
    configFile: false,
    root: ROOT,
    logLevel: 'silent',
    ssr: { noExternal: true },
    build: { ssr: PROBE, write: false, minify: true, target: 'es2020' },
  })) as Rollup.RollupOutput;
  const dir = mkdtempSync(path.join(tmpdir(), 'hunt-allocation-'));
  try {
    const file = path.join(dir, 'probe.mjs');
    writeFileSync(file, out.output[0].code);
    const flags = ['--expose-gc', '--no-concurrent-recompilation', '--no-concurrent-osr'];
    const json = execFileSync(process.execPath, [...flags, file], { encoding: 'utf8', timeout: 120_000 });
    return JSON.parse(json.trim().split('\n').pop()!) as Measured;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('no per-step garbage in the robin grab, as built', () => {
  it('the grip, the grab\'s look, the held worm with its camera, and the wobble', async (ctx) => {
    const m = await measure();
    if (m.skipped) {
      console.warn(`huntAllocation.test.ts skipped: ${m.skipped}`);
      ctx.skip();
    }
    expect(m.calls).toBeGreaterThan(10);
    expect(m.mode).toBe('underground');
    // The grip and the robin's look.
    expect(m.grip).toBeLessThan(16);
    expect(m.look).toBeLessThan(16);
    // The held worm laid along its path, and the hunt view's frame: 63 measured, about half of it the
    // cut camera's own easing (stepCutCam, 31 alone, as in every underground step: stepAllocation).
    expect(m.held).toBeLessThan(96);
    expect(m.shake).toBeLessThan(16);
  }, 180_000);
});
