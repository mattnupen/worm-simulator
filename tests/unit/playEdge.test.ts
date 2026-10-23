import { describe, it, expect } from 'vitest';
import { Crawl, BODY_RADIUS } from '../../src/game/crawl';
import { footprints, obstacleDepth } from '../../src/surface/obstacles';
import { PLAY_HALF } from '../../src/surface/terrain';
import { LOCOMOTION } from '../../src/game/drive';
import { MAX_CLIMB } from '../../src/surface/climbSurface';
import { floorHeight } from '../../src/surface/litterDepth';
import { DT, driveTo } from './cameraPress';

const hit = { nx: 0, nz: 0 };

/**
 * The fallen log runs across the world and out past both play edges. Since the V4 hot fix the worm
 * crawls up onto it (climbSurface.ts): along its top into the edge, the play edge stops it (a fixed
 * edge for the slide, obstacles.ts slideMove), so the head never leaves the play area or speeds up,
 * and once there it stays put while the wave settles to its breath.
 */
describe('where the fallen log crosses the play edge', () => {
  it('the log does cross both play edges (the case is real)', () => {
    const { log } = footprints();
    expect(Math.abs(log.dz)).toBeLessThan(1e-9);
    expect(log.x - log.half).toBeLessThan(-PLAY_HALF);
    expect(log.x + log.half).toBeGreaterThan(PLAY_HALF);
  });

  it('a worm crawling onto the log and along it into the edge never leaves the play area or speeds up, and stops cleanly', () => {
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
        expect(obstacleDepth(h.x, h.z, BODY_RADIUS, hit, MAX_CLIMB)).toBeLessThanOrEqual(1e-6);
        fastest = Math.max(fastest, Math.hypot(h.x - last.x, h.z - last.z));
        last = { x: h.x, z: h.z };
      });
      expect(fastest).toBeLessThanOrEqual(LOCOMOTION.speed * DT * (1 + 1e-9));
      // It ends at the edge, up on the log.
      const h = c.motion.head;
      expect(Math.abs(h.x)).toBeCloseTo(PLAY_HALF, 2);
      expect(h.y - floorHeight(h.x, h.z)).toBeGreaterThan(3);

      // Pushing on into the edge keeps the head at it, never chattering off it. (Up on the log
      // nothing stops it along the edge any more: pressed in at a slant, it creeps along it.)
      let off = 0;
      driveTo(c, side * 25, h.z, 300, (cc) => {
        off = Math.max(off, PLAY_HALF - Math.abs(cc.motion.head.x));
      });
      expect(off).toBeLessThan(1e-6);
    }
  }, 60_000);
});
