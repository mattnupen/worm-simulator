import { describe, it, expect } from 'vitest';
import { Crawl } from '../../src/game/crawl';
import { footprints, insideTall, pushOutTall } from '../../src/surface/obstacles';
import { rocks } from '../../src/surface/propPlacement';
import { terrainHeight } from '../../src/surface/terrain';
import { treeSites, trunkFootOf } from '../../src/surface/treeSites';
import { DT, driveTo } from './cameraPress';

describe('sliding round a trunk at a slant', () => {

  it('the camera\'s distance from the head never flickers from step to step', () => {
    // Its line to the head grazed the trunk, blocked one step and clear the next: snapping along
    // that line made the distance alternate (0.19, 0.37, 0.19...).
    const { round } = footprints();
    const c = new Crawl();
    const dist: number[] = [];
    const see = (cc: Crawl) => {
      const h = cc.motion.head;
      const p = cc.cam.pos;
      dist.push(Math.hypot(p.x - h.x, p.z - h.z));
    };
    driveTo(c, round[4] + 0.3, round[5] - 0.3, 900, see);
    const move = { x: 1, y: 0 };
    for (let s = 0; s < 300; s++) {
      c.step(DT, move);
      see(c);
    }
    let flicker = 0;
    for (let i = 2; i < dist.length; i++) {
      const a = dist[i - 1] - dist[i - 2];
      const b = dist[i] - dist[i - 1];
      if (a * b < 0 && Math.min(Math.abs(a), Math.abs(b)) > 0.01) flicker++;
    }
    expect(flicker).toBe(0);
  });
});

describe('pushOutTall', () => {

  it('slides a point that has come within the pad of a trunk straight back out to it', () => {
    const t = treeSites()[0];
    const foot = trunkFootOf(t);
    const p = { x: t.x + foot + 0.05, y: 1, z: t.z };
    expect(pushOutTall(p, 0.15)).toBeCloseTo(0.1, 9);
    expect(p.x).toBeCloseTo(t.x + foot + 0.15, 9);
    expect(p.z).toBe(t.z);
    expect(pushOutTall(p, 0.15)).toBe(0);
  });

  it('leaves a point well above a rock alone, and pushes one below its top fully clear', () => {
    const { round } = footprints();
    const k = rocks()[0];
    const o = round.indexOf(k.x);
    const r = round[o + 2];
    const top = terrainHeight(k.x, k.z) + round[o + 3];
    const above = { x: k.x + r * 0.5, y: top + 0.6, z: k.z };
    expect(pushOutTall(above, 0.15)).toBe(0);
    const below = { x: k.x + r * 0.5, y: top - 0.01, z: k.z };
    pushOutTall(below, 0.15);
    expect(below.x).toBeCloseTo(k.x + r + 0.15, 9);
    expect(insideTall(below.x, below.z, below.y)).toBe(false);
  });

  it('eases its push in as a point sinks past a rock\'s top, never jumping', () => {
    const { round } = footprints();
    const k = rocks()[0];
    const o = round.indexOf(k.x);
    const top = terrainHeight(k.x, k.z) + round[o + 3];
    // Halfway in, the full push is half the rock's footprint plus the pad. The footprint it keeps
    // the point out of grows with the sinking (over half a metre above the top), never all at once.
    const full = round[o + 2] * 0.5 + 0.15;
    let last = 0;
    for (let y = top + 0.6; y > top - 0.1; y -= 0.01) {
      const p = { x: k.x + round[o + 2] * 0.5, y, z: k.z };
      const push = pushOutTall(p, 0.15);
      expect(Math.abs(push - last)).toBeLessThanOrEqual((round[o + 2] + 0.15) * (0.01 / 0.5) + 1e-9);
      last = push;
    }
    expect(last).toBeCloseTo(full, 9);
  });
});
