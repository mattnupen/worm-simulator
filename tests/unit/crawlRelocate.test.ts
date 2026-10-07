import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { BODY_RADIUS, Crawl, SPACING, WORM_SEGMENTS } from '../../src/game/crawl';
import { CAM_OPTS } from '../../src/game/cameraClearance';
import { cameraTarget } from '../../src/surface/followCamera';
import { obstacleDepth, type ObstacleHit } from '../../src/surface/obstacles';
import { PLAY_HALF } from '../../src/surface/terrain';
import { DIST_CELL, DIST_N, DIST_REACH, originX, originZ } from '../../src/surface/disturbance';
import { HERO_RECYCLE } from '../../src/surface/heroLeaves';
import { bellyHeight, wormSurface } from '../../src/worm/surfaceHeight';
import { createBody } from '../../src/worm/body';
import type { Vec3 } from '../../src/core/vec';
import type { WormPose } from '../../src/worm/wormMesh';

const DT = 1 / 60;
const STILL = { x: 0, y: 0 };
const rest = (x: number, z: number): number => bellyHeight(wormSurface(x, z));
const hit: ObstacleHit = { nx: 0, nz: 0 };
const pose = (): WormPose => ({ spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 });

/**
 * The worm lying on the floor as coming up leaves it: head at (x, z), the body straight back from
 * `heading`, every point resting on the floor and SPACING (3D, a hair under) from the one ahead.
 */
function lying(x: number, z: number, heading: number): Vec3[] {
  const bx = -Math.sin(heading);
  const bz = -Math.cos(heading);
  const pts: Vec3[] = [{ x, y: rest(x, z), z }];
  for (let i = 1; i < WORM_SEGMENTS; i++) {
    const p = pts[i - 1];
    let lo = 0;
    let hi = SPACING;
    for (let k = 0; k < 60; k++) {
      const d = (lo + hi) / 2;
      const nx = p.x + bx * d;
      const nz = p.z + bz * d;
      if (Math.hypot(d, rest(nx, nz) - p.y) <= SPACING) lo = d;
      else hi = d;
    }
    const nx = p.x + bx * lo;
    const nz = p.z + bz * lo;
    pts.push({ x: nx, y: rest(nx, nz), z: nz });
  }
  return pts;
}

/** Whether the whole body lies off every trunk, rock and the log (as the emerge map picks). */
const clear = (pts: Vec3[]): boolean => pts.every((p) => obstacleDepth(p.x, p.z, BODY_RADIUS, hit) <= 0);

/** The first clear place to lie near (x, z) facing near `heading`: the head stepped round a spiral, the heading turned. */
function near(x: number, z: number, heading: number): { pts: Vec3[]; heading: number } | null {
  for (let k = 0; k < 40; k++) {
    const a = k * 2.4;
    const r = 0.25 * k;
    const h = heading + k * 0.9;
    const pts = lying(x + r * Math.cos(a), z + r * Math.sin(a), h);
    const inside = pts.every((p) => Math.abs(p.x) < PLAY_HALF - 0.5 && Math.abs(p.z) < PLAY_HALF - 0.5);
    if (inside && clear(pts)) return { pts, heading: h };
  }
  return null;
}

/** Places across the world to lie, each clear of props (as the emerge map picks): some with a prop behind the camera. */
function sites(): { pts: Vec3[]; heading: number }[] {
  const out: { pts: Vec3[]; heading: number }[] = [];
  for (let gx = -15; gx <= 15; gx += 5) {
    for (let gz = -15; gz <= 15; gz += 5) {
      const s = near(gx, gz, 0.7 * gx + 1.3 * gz);
      if (s) out.push(s);
    }
  }
  return out;
}

const moved = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe('the crawl can start anywhere (the worm coming up out of the cut)', () => {
  it('reset(count, points, heading): frame 0 is the points given, facing that way, its camera settled behind', () => {
    const c = new Crawl();
    const { pts, heading } = near(9.3, -6.4, 1.1)!;
    const given = pts.map((p) => ({ ...p }));
    c.reset(c.hero.count, pts, heading);
    // Its own copies: the caller's points are not kept.
    pts[0].x += 1;
    expect(c.motion.heading).toBe(heading);
    for (let i = 0; i < WORM_SEGMENTS; i++) {
      expect(c.body[i].x).toBe(given[i].x);
      expect(c.body[i].z).toBe(given[i].z);
      expect(c.body[i].y).toBeCloseTo(given[i].y, 12);
    }
    expect(c.motion.head).toEqual(c.body[0]);
    // Drawn there at once: between the last two steps is the same pose (nothing to interpolate).
    const camera = new THREE.PerspectiveCamera();
    for (const alpha of [0, 0.5, 1]) {
      const p = pose();
      c.interpolate(alpha, 0, p, camera);
      for (let i = 0; i < WORM_SEGMENTS; i++) {
        expect(p.spine[i * 3]).toBeCloseTo(given[i].x, 5);
        expect(p.spine[i * 3 + 1]).toBeCloseTo(given[i].y, 5);
        expect(p.spine[i * 3 + 2]).toBeCloseTo(given[i].z, 5);
      }
      expect(camera.position.distanceTo(new THREE.Vector3(c.cam.pos.x, c.cam.pos.y, c.cam.pos.z))).toBeLessThan(1e-9);
      expect(moved(c.focus, c.body[0])).toBeLessThan(1e-12);
    }
    // The camera behind the follow point over the head, along the heading, its height settled.
    const f = c.follow;
    expect(f.x).toBe(c.motion.head.x);
    expect(f.z).toBe(c.motion.head.z);
    expect(c.cameraReach).toBe(1);
    const t = cameraTarget(f, heading, CAM_OPTS.distance, CAM_OPTS.height);
    expect(c.cam.pos.x).toBeCloseTo(t.x, 9);
    expect(c.cam.pos.z).toBeCloseTo(t.z, 9);
    expect(c.cam.yaw).toBe(heading);
    expect(c.cam.yawVel).toBe(0);
  });

  it('an idle first step moves nothing (the worm by under 0.1 mm), anywhere: an exact hand-over', () => {
    const all = sites();
    expect(all.length).toBeGreaterThan(40);
    let craned = 0;
    for (const { pts, heading } of all) {
      const c = new Crawl();
      c.reset(c.hero.count, pts, heading);
      if (c.cameraReach < 1) craned++;
      const cam0 = { ...c.cam.pos };
      const reach0 = c.cameraReach;
      const follow0 = { ...c.follow };
      c.step(DT, STILL);
      for (let i = 0; i < WORM_SEGMENTS; i++) expect(moved(c.body[i], pts[i])).toBeLessThan(1e-4);
      expect(Math.abs(c.motion.heading - heading)).toBeLessThan(1e-12);
      expect(moved(c.follow, follow0)).toBeLessThan(1e-9);
      expect(Math.abs(c.cameraReach - reach0)).toBeLessThan(1e-9);
      // Nor the camera: it was already where following the worm there would have left it.
      expect(moved(c.cam.pos, cam0)).toBeLessThan(1e-6);
    }
    // Some of them come up with a prop in the camera's way: its reach starts settled too.
    expect(craned).toBeGreaterThan(0);
  });

  it('the camera aim holds still between the first steps where it starts pulled in by a prop', () => {
    const camera = new THREE.PerspectiveCamera();
    const p = pose();
    let craned = 0;
    for (const { pts, heading } of sites()) {
      const c = new Crawl();
      c.reset(c.hero.count, pts, heading);
      if (c.cameraReach >= 1) continue;
      craned++;
      c.interpolate(0, 0, p, camera);
      const q0 = camera.quaternion.clone();
      for (let k = 0; k < 3; k++) {
        for (const alpha of [0, 0.25, 0.5, 0.75, 1]) {
          c.interpolate(alpha, k * DT, p, camera);
          // Under a thousandth of a degree, at any alpha.
          expect(2 * Math.acos(Math.min(1, Math.abs(q0.dot(camera.quaternion)))) * (180 / Math.PI)).toBeLessThan(1e-3);
        }
        c.step(DT, STILL);
      }
    }
    expect(craned).toBeGreaterThan(0);
  });

  it('points spaced flat (createBody) on a slope are held to the body first: an idle first step still moves nothing', () => {
    let sloped = 0;
    let tried = 0;
    for (let gx = -16; gx <= 16; gx += 2) {
      for (let gz = -16; gz <= 16; gz += 2) {
        const heading = 0.37 * gx - 0.61 * gz;
        const pts = createBody(WORM_SEGMENTS, SPACING, { x: gx, y: 0, z: gz }, heading);
        if (!clear(pts) || !pts.every((q) => Math.abs(q.x) < PLAY_HALF - 0.5 && Math.abs(q.z) < PLAY_HALF - 0.5)) continue;
        // Flat spacing over the floor's rise and fall: some gaps are over SPACING in 3D.
        const over = pts.some((q, i) => i > 0 && Math.hypot(SPACING, rest(q.x, q.z) - rest(pts[i - 1].x, pts[i - 1].z)) > SPACING + 1e-4);
        if (over) sloped++;
        tried++;
        const c = new Crawl();
        c.reset(c.hero.count, pts, heading);
        // Held close to where they were given (the gaps shrink by well under a centimetre).
        for (let i = 0; i < WORM_SEGMENTS; i++) expect(Math.hypot(c.body[i].x - pts[i].x, c.body[i].z - pts[i].z)).toBeLessThan(0.05);
        expect(c.body[0].x).toBe(pts[0].x);
        expect(c.body[0].z).toBe(pts[0].z);
        const frame0 = c.body.map((b) => ({ ...b }));
        c.step(DT, STILL);
        for (let i = 0; i < WORM_SEGMENTS; i++) expect(moved(c.body[i], frame0[i])).toBeLessThan(1e-6);
      }
    }
    expect(tried).toBeGreaterThan(60);
    expect(sloped).toBeGreaterThan(50);
  });

  it('crawls on from there smoothly: the head speeds up as from rest, the camera never jumps', () => {
    for (const { pts, heading } of sites().slice(0, 12)) {
      const c = new Crawl();
      c.reset(c.hero.count, pts, heading);
      let last = 0;
      for (let k = 0; k < 30; k++) {
        const h = { ...c.motion.head };
        const cam = { ...c.cam.pos };
        c.step(DT, { x: 0.3, y: 1 });
        const d = Math.hypot(c.motion.head.x - h.x, c.motion.head.z - h.z);
        // Never faster than the crawl's top speed (1.6 u/s), and no step much bigger than the last.
        expect(d).toBeLessThanOrEqual(1.6 * DT + 1e-9);
        if (k > 0) expect(d).toBeLessThan(last + 0.01);
        last = d;
        expect(moved(c.cam.pos, cam)).toBeLessThan(0.06);
      }
    }
  });

  it('a jump across the world leaves no trail, leaf or camera sweep between the two places', () => {
    const c = new Crawl();
    c.setHeroCount(16);
    for (let k = 0; k < 120; k++) c.step(DT, { x: 0.2, y: 1 });
    const old = { ...c.motion.head };
    // The clear place farthest from it.
    const far = (q: { pts: Vec3[] }) => Math.hypot(q.pts[0].x - old.x, q.pts[0].z - old.z);
    const { pts, heading } = sites().reduce((a, b) => (far(b) > far(a) ? b : a));
    expect(Math.hypot(pts[0].x - old.x, pts[0].z - old.z)).toBeGreaterThan(15);
    c.reset(c.hero.count, pts, heading);
    // The leaf map is empty and centred on the new body; the hero leaves lie round the new head,
    // growing in from nothing where they appear (none slides over from the old place).
    expect(c.disturbance.data.every((v) => v === 0)).toBe(true);
    expect(c.disturbed).toBe(true);
    expect(c.hero.count).toBe(16);
    for (let i = 0; i < c.hero.count; i++) {
      for (const [x, z] of [[c.hero.x[i], c.hero.z[i]], [c.hero.px[i], c.hero.pz[i]]]) {
        expect(Math.hypot(x - pts[0].x, z - pts[0].z)).toBeLessThan(HERO_RECYCLE);
      }
      expect(c.hero.grow[i]).toBe(0);
      expect(c.hero.pgrow[i]).toBe(0);
    }
    // Drawn mid-step, nothing lies between the two places: the worm, the camera and the focus are
    // all at the new one.
    const camera = new THREE.PerspectiveCamera();
    const p = pose();
    const by = (x: number, z: number, r: number) => Math.hypot(x - pts[0].x, z - pts[0].z) < r;
    for (let k = 0; k < 4; k++) {
      c.interpolate(0.5, k * DT, p, camera);
      for (let i = 0; i < WORM_SEGMENTS; i++) expect(by(p.spine[i * 3], p.spine[i * 3 + 2], 3.6)).toBe(true);
      expect(by(camera.position.x, camera.position.z, 3.6)).toBe(true);
      expect(by(c.focus.x, c.focus.z, 0.5)).toBe(true);
      c.step(DT, { x: 0, y: 1 });
    }
    // The trail stamped since (path, body and trail alike) is only round the new body.
    const m = c.disturbance;
    let stamped = 0;
    for (let j = 0; j < DIST_N; j++) {
      for (let i = 0; i < DIST_N; i++) {
        const o = (j * DIST_N + i) * 4;
        if (m.data[o] === 0 && m.data[o + 2] === 0 && m.data[o + 3] === 0) continue;
        stamped++;
        const x = originX(m) + (i + 0.5) * DIST_CELL;
        const z = originZ(m) + (j + 0.5) * DIST_CELL;
        // Within the stamp's reach of the body now (it crawled a few cm since), far from the old place.
        const off = Math.min(...c.body.map((b) => Math.hypot(x - b.x, z - b.z)));
        expect(off).toBeLessThan(DIST_REACH + 0.3);
        expect(Math.hypot(x - old.x, z - old.z)).toBeGreaterThan(8);
      }
    }
    expect(stamped).toBeGreaterThan(0);
  });

  it('reset() with no points is still the spawn, exactly as a fresh crawl', () => {
    const fresh = new Crawl();
    const c = new Crawl();
    const there = near(9.3, -6.4, 1.1)!;
    c.reset(c.hero.count, there.pts, there.heading);
    c.step(DT, { x: 0.3, y: 1 });
    c.reset();
    expect(JSON.stringify(c.body)).toBe(JSON.stringify(fresh.body));
    expect(c.cam).toEqual(fresh.cam);
    expect(c.motion).toEqual(fresh.motion);
    expect(c.follow).toEqual(fresh.follow);
    expect(c.cameraReach).toBe(fresh.cameraReach);
    expect(c.disturbance.ci).toBe(fresh.disturbance.ci);
    expect(c.disturbance.cj).toBe(fresh.disturbance.cj);
    expect(Array.from(c.hero.x)).toEqual(Array.from(fresh.hero.x));
    expect(Array.from(c.hero.z)).toEqual(Array.from(fresh.hero.z));
    // And it steps on exactly as a fresh crawl does.
    c.step(DT, { x: 0.3, y: 1 });
    fresh.step(DT, { x: 0.3, y: 1 });
    expect(JSON.stringify(c.body)).toBe(JSON.stringify(fresh.body));
    expect(c.cam).toEqual(fresh.cam);
  });
});
