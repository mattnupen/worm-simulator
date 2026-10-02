import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Crawl, WORM_SEGMENTS, CAM_GROUND_MARGIN } from '../../src/game/crawl';
import { bellyHeight, litterTop, wormSurface } from '../../src/worm/surfaceHeight';
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

  it('rests every segment on its own worm surface, and records under per segment', () => {
    const c = new Crawl();
    for (let i = 0; i < 240; i++) c.step(DT, { x: 0.3, y: 1 });
    c.body.forEach((s, i) => {
      const surf = wormSurface(s.x, s.z);
      expect(s.y).toBeCloseTo(bellyHeight(surf), 9);
      expect(c.under[i]).toBeCloseTo(surf.under, 6);
    });
  });

  it('with leaf reaction off, rides on top everywhere', () => {
    const c = new Crawl();
    c.setReaction(false);
    for (let i = 0; i < 120; i++) c.step(DT, { x: 0, y: 1 });
    c.body.forEach((s, i) => {
      expect(s.y).toBeCloseTo(bellyHeight(wormSurface(s.x, s.z, false)), 9);
      expect(c.under[i]).toBe(0);
    });
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
