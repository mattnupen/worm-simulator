import { describe, it, expect } from 'vitest';
import { Crawl, BODY_RADIUS } from '../../src/game/crawl';
import { footprints, obstacleDepth } from '../../src/surface/obstacles';
import { PLAY_HALF } from '../../src/surface/terrain';
import { LOCOMOTION } from '../../src/game/drive';

const DT = 1 / 60;
const hit = { nx: 0, nz: 0 };
const wrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

/** Steers toward (tx, tz) for `steps` steps; `each` sees the crawl after every step. */
function driveTo(c: Crawl, tx: number, tz: number, steps: number, each: (c: Crawl) => void = () => {}): void {
  const move = { x: 0, y: 1 };
  for (let s = 0; s < steps; s++) {
    const h = c.motion.head;
    const err = wrap(Math.atan2(tx - h.x, tz - h.z) - c.motion.heading);
    move.x = Math.max(-1, Math.min(1, -err * 3));
    c.step(DT, move);
    each(c);
  }
}

/**
 * The fallen log runs across the world and out past both play edges. A slide along its side into
 * the edge must stop in the notch where the two meet: the play edges are fixed edges for the slide
 * (obstacles.ts slideMove), so the head never leaves the play area or speeds up, and once wedged
 * it stays put while the wave settles to its breath.
 */
describe('where the fallen log crosses the play edge', () => {
  it('the log does cross both play edges (the case is real)', () => {
    const { log } = footprints();
    expect(Math.abs(log.dz)).toBeLessThan(1e-9);
    expect(log.x - log.half).toBeLessThan(-PLAY_HALF);
    expect(log.x + log.half).toBeGreaterThan(PLAY_HALF);
  });

  it('a worm crawling along the log into the edge never leaves the play area, speeds up or enters the log, and stops cleanly', () => {
    for (const side of [1, -1]) {
      const c = new Crawl();
      const { log } = footprints();
      // Up to the log's near side, then along it into the edge (and on, pressing into the corner).
      const beside = log.z - log.r - BODY_RADIUS - 0.4;
      driveTo(c, side * 12, beside, 900);
      let last = { x: c.motion.head.x, z: c.motion.head.z };
      let fastest = 0;
      driveTo(c, side * 25, log.z, 900, (cc) => {
        const h = cc.motion.head;
        expect(Math.abs(h.x)).toBeLessThanOrEqual(PLAY_HALF + 1e-9);
        expect(Math.abs(h.z)).toBeLessThanOrEqual(PLAY_HALF + 1e-9);
        expect(obstacleDepth(h.x, h.z, BODY_RADIUS, hit)).toBeLessThanOrEqual(1e-6);
        fastest = Math.max(fastest, Math.hypot(h.x - last.x, h.z - last.z));
        last = { x: h.x, z: h.z };
      });
      expect(fastest).toBeLessThanOrEqual(LOCOMOTION.speed * DT * (1 + 1e-9));
      // It ends in the notch: at the edge, against the log's side.
      const h = c.motion.head;
      expect(Math.abs(h.x)).toBeCloseTo(PLAY_HALF, 2);
      expect(log.z - h.z - log.r - BODY_RADIUS).toBeLessThan(0.01);

      // Pushing on into the corner moves the head nowhere (no chatter, no reversals), and the wave
      // advances as it does standing still (its breath).
      const still = new Crawl();
      const rest = { x: 0, y: 0 };
      for (let s = 0; s < 300; s++) still.step(DT, rest);
      const phase0 = c.wave.phase;
      const stillPhase0 = still.wave.phase;
      let moved = 0;
      last = { x: h.x, z: h.z };
      driveTo(c, side * 25, log.z, 300, (cc) => {
        const p = cc.motion.head;
        moved = Math.max(moved, Math.hypot(p.x - last.x, p.z - last.z));
        last = { x: p.x, z: p.z };
        still.step(DT, rest);
      });
      expect(moved).toBeLessThan(1e-4);
      expect(c.wave.phase - phase0).toBeCloseTo(still.wave.phase - stillPhase0, 3);
    }
  }, 60_000);
});
