import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Rollup } from 'vite';

// Per-step garbage (visual-quality brief: no per-frame or per-step allocation; on Chromebooks,
// garbage-collection pauses show as hitches). V8 boxes a number on the heap wherever one crosses a
// call it does not inline, so the per-step paths pass their numbers in objects. How far V8 inlines
// depends on the code it is given, so stepAllocation.probe.ts is bundled as the game is and run
// under `node --expose-gc`, after a long warm-up (V8's optimizing compiler takes over some
// thousands of steps in). An object, array or closure made every step (32 bytes or more) shows.

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PROBE = fileURLToPath(new URL('./stepAllocation.probe.ts', import.meta.url));

interface Measured {
  /** Set when node could not expose its garbage collector: nothing measured. */
  skipped?: string;
  underground: number;
  /** Backing up along the trail, and how many times it backed to the trail's start. */
  backing: number;
  backs: number;
  canDigAt: number;
  surface: number;
  crawl: number;
  modes: string[];
  digs: number;
  offered: number;
}

async function measure(): Promise<Measured> {
  const out = (await build({
    configFile: false,
    root: ROOT,
    logLevel: 'silent',
    ssr: { noExternal: true },
    build: { ssr: PROBE, write: false, minify: true, target: 'es2020' },
  })) as Rollup.RollupOutput;
  const dir = mkdtempSync(path.join(tmpdir(), 'step-allocation-'));
  try {
    const file = path.join(dir, 'probe.mjs');
    writeFileSync(file, out.output[0].code);
    // Optimizing on the main thread: when V8 takes over a function then depends only on how often
    // it ran, not on how busy the machine is (the steady state is the same as the game's).
    const flags = ['--expose-gc', '--no-concurrent-recompilation', '--no-concurrent-osr'];
    const json = execFileSync(process.execPath, [...flags, file], { encoding: 'utf8', timeout: 120_000 });
    return JSON.parse(json.trim().split('\n').pop()!) as Measured;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('no per-step garbage, as built (bytes the heap grows per step)', () => {
  it('underground, canDigAt and what the game adds to the surface crawl box only a few numbers', async (ctx) => {
    const m = await measure();
    if (m.skipped) {
      console.warn(`stepAllocation.test.ts skipped: ${m.skipped}`);
      ctx.skip();
    }
    expect(m.modes).toEqual(['underground', 'surface']);
    expect(m.digs).toBeGreaterThan(0);
    expect(m.offered).toBeGreaterThan(0);
    // The worm digging about, its tunnel and castings, the cut camera and the prompt. Measured 32
    // (Node 26, V8 14.6: a few numbers still boxed where V8 does not inline a small helper; it was
    // about 2.8 KB). The bounds leave room for V8 inlining a little differently as code changes.
    expect(m.underground).toBeLessThan(64);
    // Backing up along the head's trail (bodyTrail.ts backAlong), to the trail's start and again
    // (0 measured, 2026-10-08).
    expect(m.backs).toBeGreaterThan(1);
    expect(m.backing).toBeLessThan(64);
    // The dig spot the prompt asks for every few steps on the surface (48 measured; it was 6.7 KB).
    expect(m.canDigAt).toBeLessThan(96);
    // What the game adds to the crawl on the surface: the mode machine, the dig spot it asks every
    // few steps, the prompt (24 measured, over a crawl replayed from a recording).
    expect(m.surface).toBeLessThan(64);
    // The V1 crawl itself still boxes about 3.5 KB a step in the litter-height and prop-collision
    // functions it calls (numbers passed between them): a bound only against it growing again
    // (it was about 16 KB; the hero leaves' pushers alone boxed 9 KB).
    expect(m.crawl).toBeLessThan(6144);
  }, 180_000);
});
