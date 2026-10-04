import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Crawl, BODY_RADIUS } from '../../src/game/crawl';
import { footprints, obstacleDepth, slideMove } from '../../src/surface/obstacles';
import { PLAY_HALF } from '../../src/surface/terrain';
import { LOCOMOTION } from '../../src/game/drive';
import { DEFAULT_SCALE, setScale } from '../../src/surface/worldScale';

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

afterAll(() => { setScale(DEFAULT_SCALE); });

/**
 * Hybrid's log ends near x = PLAY_HALF, and its end's footprint crosses that edge. A slide along
 * the log's end used to carry the head past the edge, while the next step's clamp pulled it back
 * (before the log's broken ends grew with it, 0.11 past at up to 1.5 times its speed for about 15
 * steps; since, 0.02 past, into the notch). The play edges are fixed edges for the slide now: the
 * head stops in the notch where the log's end meets the edge.
 */
describe('hybrid: where the log\'s end crosses the play edge', () => {
  beforeAll(() => { setScale('hybrid'); });

  /** The log's end: the centre of its rounded cap, and the cap's radius grown by the body's. */
  const cap = () => {
    const { log } = footprints();
    return { x: log.x + log.dx * log.half, z: log.z + log.dz * log.half, r: log.r + BODY_RADIUS };
  };

  it('the log\'s end does cross x = PLAY_HALF (the case is real)', () => {
    const { x, r } = cap();
    expect(x).toBeLessThan(PLAY_HALF);
    expect(x + r).toBeGreaterThan(PLAY_HALF);
  });

  it('slideMove keeps a slide inside the play area, stopping in the notch', () => {
    const { x, z, r } = cap();
    // Where the grown cap meets x = PLAY_HALF on its upper side, and a step down the edge into it.
    const zMeet = z + Math.sqrt(r * r - (PLAY_HALF - x) ** 2);
    const from = { x: PLAY_HALF, z: zMeet + 0.01 };
    const step = LOCOMOTION.speed * DT;
    const free = { x: PLAY_HALF, z: from.z - step };
    slideMove(from, free, BODY_RADIUS);
    expect(free.x).toBeGreaterThan(PLAY_HALF); // without the edge, the slide leaves the play area
    const to = { x: PLAY_HALF, z: from.z - step };
    slideMove(from, to, BODY_RADIUS, PLAY_HALF);
    expect(to.x).toBeLessThanOrEqual(PLAY_HALF + 1e-12);
    expect(obstacleDepth(to.x, to.z, BODY_RADIUS, hit)).toBeLessThanOrEqual(1e-9);
    expect(Math.hypot(to.x - from.x, to.z - from.z)).toBeLessThanOrEqual(step);
  });

  it('a worm crawling down the edge into the log\'s end never leaves the play area or speeds up', () => {
    const c = new Crawl();
    // Round the log's far end and along the top of it, to the edge above the log's near end.
    for (const [x, z] of [[-4, 10], [-2, 17.5], [8, 15], [16, 8.5], [18.95, 9]]) driveTo(c, x, z, 600);
    expect(c.motion.head.x).toBeCloseTo(PLAY_HALF, 1);
    let last = { x: c.motion.head.x, z: c.motion.head.z };
    let fastest = 0;
    driveTo(c, 18.95, -10, 600, (cc) => {
      const h = cc.motion.head;
      expect(Math.abs(h.x)).toBeLessThanOrEqual(PLAY_HALF + 1e-9);
      expect(Math.abs(h.z)).toBeLessThanOrEqual(PLAY_HALF + 1e-9);
      fastest = Math.max(fastest, Math.hypot(h.x - last.x, h.z - last.z));
      last = { x: h.x, z: h.z };
    });
    expect(fastest).toBeLessThanOrEqual(LOCOMOTION.speed * DT * (1 + 1e-9));
    // It ends wedged in the notch, against the log's end, at the edge.
    const { x, z, r } = cap();
    const h = c.motion.head;
    expect(h.x).toBeCloseTo(PLAY_HALF, 6);
    expect(Math.hypot(h.x - x, h.z - z) - r).toBeLessThan(1e-3);
  });
});
