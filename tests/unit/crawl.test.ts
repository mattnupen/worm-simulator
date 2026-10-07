import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Crawl, WORM_SEGMENTS } from '../../src/game/crawl';
import { CAM_GROUND_MARGIN } from '../../src/game/cameraClearance';
import { bellyHeight, litterTop, wormSurface } from '../../src/worm/surfaceHeight';
import { floorHeight, litterDepth } from '../../src/surface/litterDepth';
import type { WormPose } from '../../src/worm/wormMesh';

const DT = 1 / 60;
const pose = (): WormPose => ({ spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 });

describe('Crawl', () => {
  it('crawls forward along +z from the spawn, the body trailing behind', () => {
    const c = new Crawl();
    for (let i = 0; i < 60; i++) c.step(DT, { x: 0, y: 1 });
    expect(c.motion.head.z).toBeGreaterThan(1.4);
    expect(Math.abs(c.motion.head.x)).toBeLessThan(1e-6);
    for (let i = 1; i < c.body.length; i++) expect(c.body[i].z).toBeLessThan(c.body[i - 1].z);
  });

  it('ignores backward input', () => {
    const c = new Crawl();
    for (let i = 0; i < 30; i++) c.step(DT, { x: 0, y: -1 });
    expect(c.motion.head.z).toBeCloseTo(0, 6);
  });

  it('keeps the camera above the litter top plus its margin', () => {
    const c = new Crawl();
    for (let i = 0; i < 600; i++) {
      c.step(DT, { x: 0.6, y: 1 });
      expect(c.cam.pos.y).toBeGreaterThanOrEqual(litterTop(c.cam.pos.x, c.cam.pos.z) + CAM_GROUND_MARGIN - 1e-9);
    }
  });

  it('rests every segment on the floor, buried in the litter (V2 spec 8.2)', () => {
    const c = new Crawl();
    for (let i = 0; i < 240; i++) c.step(DT, { x: 0.3, y: 1 });
    c.body.forEach((s, i) => {
      expect(s.y).toBeCloseTo(bellyHeight(wormSurface(s.x, s.z)), 9);
      expect(s.y).toBeCloseTo(floorHeight(s.x, s.z) + 0.01, 9);
      // At least 2 cm of leaves over the belly.
      expect(litterTop(s.x, s.z) - s.y).toBeGreaterThan(0.4);
      expect(c.under[i]).toBe(1);
    });
  });

  it('is buried on every preset: with leaf reaction off (Low) too', () => {
    const c = new Crawl();
    c.setReaction(false);
    for (let i = 0; i < 120; i++) c.step(DT, { x: 0, y: 1 });
    c.body.forEach((s, i) => {
      expect(s.y).toBeCloseTo(floorHeight(s.x, s.z) + 0.01, 9);
      expect(c.under[i]).toBe(1);
    });
  });

  it('frames its camera over the top of the litter, not the buried worm', () => {
    const c = new Crawl();
    for (let i = 0; i < 300; i++) c.step(DT, { x: 0, y: 1 });
    const h = c.motion.head;
    // About the follow height (1.1) over the top of the litter above the head: 2 to 5 cm higher
    // than over the worm itself.
    expect(c.cam.pos.y - h.y).toBeGreaterThan(1.1 + litterDepth(h.x, h.z) - 0.2);
  });

  it('interpolates between the last two steps by alpha', () => {
    const c = new Crawl();
    for (let i = 0; i < 10; i++) c.step(DT, { x: 0, y: 1 });
    const p = pose();
    const cam = new THREE.PerspectiveCamera();
    c.interpolate(1, 2, p, cam);
    expect(p.spine[2]).toBeCloseTo(c.motion.head.z, 6);
    expect(c.focus.z).toBeCloseTo(c.motion.head.z, 6);
    expect(p.timeSec).toBe(2);
    const z1 = p.spine[2];
    c.interpolate(0, 2, p, cam);
    expect(p.spine[2]).toBeLessThan(z1);
    expect(p.spine.every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(cam.position.x + cam.position.y + cam.position.z)).toBe(true);
  });
});

describe('Crawl leaf disturbance', () => {
  const total = (c: Crawl) => c.disturbance.data.reduce((a, v) => a + Math.abs(v), 0);

  it('stamps the body into the map while it crawls, and marks it for upload', () => {
    const c = new Crawl();
    c.disturbed = false;
    for (let i = 0; i < 30; i++) c.step(DT, { x: 0, y: 1 });
    expect(c.disturbed).toBe(true);
    expect(total(c)).toBeGreaterThan(1);
  });

  it('leaves a trail behind that settles back', () => {
    const c = new Crawl();
    for (let i = 0; i < 60; i++) c.step(DT, { x: 0, y: 1 });
    const fresh = total(c);
    for (let i = 0; i < 60 * 30; i++) c.step(DT, { x: 0, y: 0 });
    // Resting still stamps the body, but the trail behind it has faded.
    expect(total(c)).toBeLessThan(fresh);
  });

  it('turning reaction off clears the map and stops stamping', () => {
    const c = new Crawl();
    for (let i = 0; i < 30; i++) c.step(DT, { x: 0, y: 1 });
    c.disturbed = false;
    c.setReaction(false);
    expect(c.disturbed).toBe(true);
    expect(total(c)).toBe(0);
    c.disturbed = false;
    for (let i = 0; i < 30; i++) c.step(DT, { x: 0, y: 1 });
    expect(total(c)).toBe(0);
    expect(c.disturbed).toBe(false);
  });
});

describe('Crawl hero leaves', () => {
  it('keeps the preset count of leaves near the head, shoving them as it crawls', () => {
    const c = new Crawl();
    c.setHeroCount(24);
    expect(c.hero.count).toBe(24);
    let moved = false;
    for (let i = 0; i < 600; i++) {
      c.step(DT, { x: 0.2, y: 1 });
      for (let k = 0; k < c.hero.count; k++) {
        if (c.hero.vx[k] !== 0 || c.hero.vz[k] !== 0) moved = true;
        const h = c.motion.head;
        expect(Math.hypot(c.hero.x[k] - h.x, c.hero.z[k] - h.z)).toBeLessThanOrEqual(4.1);
      }
    }
    expect(moved).toBe(true);
    c.setHeroCount(0);
    expect(c.hero.count).toBe(0);
  });
});

describe('Crawl reset', () => {
  it('puts everything back exactly as a freshly built crawl with the same settings', () => {
    const c = new Crawl();
    c.setHeroCount(24);
    // Wander: turns, crawls through piles, shoves and recycles leaves, leaves a trail.
    for (let i = 0; i < 900; i++) c.step(DT, { x: Math.sin(i / 90), y: i % 300 < 250 ? 1 : 0 });
    c.interpolate(0.5, 3, pose(), new THREE.PerspectiveCamera());
    expect(c.hero.spawned).toBeGreaterThan(24);
    c.reset();

    const fresh = new Crawl();
    fresh.setHeroCount(24);
    expect(c).toEqual(fresh);
  });

  it('keeps the hero count and the leaf reaction it had', () => {
    const c = new Crawl();
    c.setHeroCount(8);
    c.setReaction(false);
    for (let i = 0; i < 120; i++) c.step(DT, { x: 0.4, y: 1 });
    c.reset();
    expect(c.hero.count).toBe(8);
    expect(c.reaction).toBe(false);
    expect(c.motion.head.x).toBe(0);
    expect(c.motion.head.z).toBe(0);
    expect(c.motion.head.y).toBeCloseTo(bellyHeight(wormSurface(0, 0)), 9);
    expect(c.disturbed).toBe(true);
  });

  it('then crawls exactly as a fresh crawl does', () => {
    const c = new Crawl();
    c.setHeroCount(16);
    for (let i = 0; i < 300; i++) c.step(DT, { x: -0.5, y: 1 });
    c.reset();
    const fresh = new Crawl();
    fresh.setHeroCount(16);
    for (let i = 0; i < 120; i++) {
      c.step(DT, { x: 0.3, y: 1 });
      fresh.step(DT, { x: 0.3, y: 1 });
    }
    expect(c).toEqual(fresh);
  });
});
