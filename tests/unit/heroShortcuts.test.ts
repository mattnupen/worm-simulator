import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { Crawl } from '../../src/game/crawl';
import { HERO_MAX, type HeroLeaves } from '../../src/surface/heroLeaves';
import { heroShortcuts } from '../../src/surface/heroClearance';
import { mulberry32 } from '../../src/core/random';
import { DEFAULT_SCALE, SCALE_MODES, setScale } from '../../src/surface/worldScale';

const DT = 1 / 60;

/** Every per-slot array of the pool. */
function arrays(p: HeroLeaves): ArrayLike<number>[] {
  return Object.values(p).filter((v) => ArrayBuffer.isView(v)) as unknown as ArrayLike<number>[];
}

describe.each(SCALE_MODES)('%s: hero leaf shortcuts (sleeping far leaves, skipped strips)', (mode) => {
  beforeAll(() => { setScale(mode); });
  afterAll(() => { setScale(DEFAULT_SCALE); });
  afterEach(() => { heroShortcuts.on = true; });

  it('change nothing: the same seeded crawls with and without them give the same leaves', () => {
    let slept = 0;
    for (const seed of [1, 2, 3]) {
      const rng = mulberry32(seed);
      const fast = new Crawl();
      const full = new Crawl();
      fast.setHeroCount(HERO_MAX);
      full.setHeroCount(HERO_MAX);
      const move = { x: 0, y: 1 };
      for (let s = 0; s < 1500; s++) {
        if (s % 90 === 0) {
          const r = rng();
          move.x = (rng() * 2 - 1) * (r < 0.2 ? 1 : 0.5);
          move.y = r < 0.25 ? 0 : 1;
        }
        heroShortcuts.on = true;
        fast.step(DT, move);
        heroShortcuts.on = false;
        full.step(DT, move);
        const a = arrays(fast.hero);
        const b = arrays(full.hero);
        for (let f = 0; f < a.length; f++) {
          for (let i = 0; i < fast.hero.count; i++) {
            const d = Math.abs(a[f][i] - b[f][i]);
            if (!(d <= 1e-12)) expect.fail(`seed ${seed} step ${s} field ${f} slot ${i}: ${a[f][i]} vs ${b[f][i]}`);
          }
        }
        for (let i = 0; i < fast.hero.count; i++) if (fast.hero.vx[i] === 0 && fast.hero.lift[i] === 0) slept++;
        expect(fast.hero.spawned).toBe(full.hero.spawned);
      }
    }
    // The shortcuts had leaves to skip.
    expect(slept).toBeGreaterThan(10000);
  }, 120_000);
});
