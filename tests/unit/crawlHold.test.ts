import { describe, it, expect } from 'vitest';
import { Crawl, SPACING } from '../../src/game/crawl';

const still = { x: 0, y: 0 };
const flatGaps = (c: Crawl): number[] =>
  c.body.slice(1).map((p, i) => Math.hypot(p.x - c.body[i].x, p.z - c.body[i].z));

describe('the robin holds the worm (V4: crawl.held, release)', () => {
  it('held, the head eases up to the bill and the front hangs from it, never under the floor', () => {
    const c = new Crawl();
    c.held.on = true;
    c.held.x = 0; c.held.y = 1.5; c.held.z = 0.6;
    for (let i = 0; i < 120; i++) c.step(1 / 60, still);
    const h = c.motion.head;
    expect(h.y).toBeGreaterThan(1.3);
    expect(Math.hypot(h.x - 0, h.z - 0.6)).toBeLessThan(0.05);
    // A rope from the bill: each point within the gap of the one ahead (in 3D), the second off the floor.
    for (let i = 1; i < c.body.length; i++) {
      const a = c.body[i - 1], b = c.body[i];
      expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThanOrEqual(SPACING + 1e-6);
    }
    expect(c.body[1].y).toBeGreaterThan(0.5);
  });

  it('let go, the body lies back down at full spacing, not bunched under the bill', () => {
    const c = new Crawl();
    c.held.on = true;
    c.held.x = 0; c.held.y = 1.5; c.held.z = 0.6;
    for (let i = 0; i < 120; i++) c.step(1 / 60, still);
    c.release();
    expect(c.held.on).toBe(false);
    for (const g of flatGaps(c)) expect(g).toBeGreaterThan(SPACING * 0.99);
    expect(c.motion.head.y).toBeLessThan(0.2);
  });

  it('a new place (reset) lets go and stops looking up', () => {
    const c = new Crawl();
    c.held.on = true;
    c.lookUp = 0.8;
    c.reset();
    expect(c.held.on).toBe(false);
    expect(c.lookUp).toBe(0);
  });
});
