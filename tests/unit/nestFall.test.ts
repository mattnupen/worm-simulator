import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { NestScene } from '../../src/predators/nestScene';
import { NEST_TIMES } from '../../src/predators/nestScript';
import { WIGGLE } from '../../src/predators/nestWiggle';
import { DROP_CLEAR, clearOfTrunks, fallCamera, fallShot, ropeToBody } from '../../src/predators/nestFall';
import { WORM_POINTS } from '../../src/predators/wormCarry';
import { litterTopHeight } from '../../src/surface/litterDepth';
import { treeSites, trunkFootOf } from '../../src/surface/treeSites';
import { WORM_SEGMENTS, SPACING } from '../../src/game/crawl';
import { WORLD_HALF } from '../../src/surface/terrain';

const body = () => Array.from({ length: WORM_SEGMENTS }, () => ({ x: 0, y: 0, z: 0 }));
const DT = 1 / 60;

/** Plays a hunt's nest scene, pressing every `every` steps with a forced roll, to `until` seconds. */
function play(nest: NestScene, camera: THREE.PerspectiveCamera, every: number, until: number, reduced = false): void {
  nest.start(-3, 4, 2, reduced, true);
  for (let f = 0; nest.t < until && !nest.landed; f++) {
    if (f % every === 0) nest.press(() => 0);
    nest.step(DT);
    nest.pose(1, camera);
  }
}

describe('wiggling free in the nest scene', () => {
  it('mashing with a forced roll frees the worm: it falls to the floor and play takes it from there', () => {
    const nest = new NestScene(new THREE.Scene());
    const camera = new THREE.PerspectiveCamera(60, 1.6, 0.2, 120);
    play(nest, camera, 6, 9);
    expect(nest.wiggle.escaped).toBe(true);
    expect(nest.landed).toBe(true);
    // Never the fact card, the dark or a caption after it is free.
    expect(nest.done).toBe(false);
    expect(nest.dark).toBe(0);
    expect(nest.caption).toBeNull();
    nest.skip();
    expect(nest.done).toBe(false);
    // Lying on the litter, not hanging in the air.
    const p = new THREE.Vector3();
    for (let i = 0; i < WORM_POINTS; i++) {
      nest.nest.toWorld(nest.nest.worm.point(i, p));
      expect(p.y - litterTopHeight(p.x, p.z)).toBeLessThan(0.4);
      expect(p.y - litterTopHeight(p.x, p.z)).toBeGreaterThan(-0.01);
    }
    // The camera came down to watch it, above the floor and finite.
    expect(camera.position.toArray().every(Number.isFinite)).toBe(true);
    expect(camera.position.y).toBeGreaterThan(litterTopHeight(camera.position.x, camera.position.z));
    const out = body();
    const heading = nest.landing(SPACING, out);
    expect(Number.isFinite(heading)).toBe(true);
    nest.nest.toWorld(nest.nest.worm.point(0, p));
    expect(Math.hypot(out[0].x - p.x, out[0].z - p.z)).toBeLessThan(1e-6);
    for (let i = 1; i < out.length; i++) expect(Math.hypot(out[i].x - out[i - 1].x, out[i].z - out[i - 1].z)).toBeCloseTo(SPACING, 5);
    nest.stop();
  });

  it('never over a trunk\'s foot: wherever it drops, it lands on the litter clear of the bark', () => {
    const nest = new NestScene(new THREE.Scene());
    const camera = new THREE.PerspectiveCamera(60, 1.6, 0.2, 120);
    const p = new THREE.Vector3();
    // Mash all the way up from several catches; a forced roll frees it at the first chance it has.
    for (const [x, z] of [[-3, 4], [10, 5], [0, -20], [-12, -8]]) {
      nest.start(x, z, 1, false, true);
      for (let f = 0; f < 600 && !nest.landed; f++) {
        // From late in the flight, when the robin comes in over the maple's root flare.
        if (f % 4 === 0 && nest.t > 2.6) nest.press(() => 0);
        nest.step(DT);
        nest.pose(1, camera);
      }
      expect(nest.wiggle.escaped).toBe(true);
      for (let i = 0; i < WORM_POINTS; i++) {
        nest.nest.toWorld(nest.nest.worm.point(i, p));
        expect(clearOfTrunks(p.x, p.z, 0)).toBe(true);
      }
      nest.stop();
    }
  });

  it('with reduced motion too, and never once the robin is about to land', () => {
    const nest = new NestScene(new THREE.Scene());
    const camera = new THREE.PerspectiveCamera(60, 1.6, 0.2, 120);
    play(nest, camera, 6, 9, true);
    expect(nest.landed).toBe(true);
    nest.stop();
    nest.start(0, 0, 0, false, true);
    while (nest.t < WIGGLE.until) { nest.step(DT); nest.pose(1, camera); }
    for (let i = 0; i < 30; i++) expect(nest.press(() => 0)).toBe(false);
    expect(nest.wiggle.escaped).toBe(false);
    nest.stop();
  });

  it('the Start preview (no wiggle) and slow presses play the scene as before', () => {
    const nest = new NestScene(new THREE.Scene());
    const camera = new THREE.PerspectiveCamera(60, 1.6, 0.2, 120);
    nest.start(0, 0, 0, false);
    expect(nest.press(() => 0)).toBe(false);
    nest.stop();
    // One press a second never fills the meter, whatever the dice.
    play(nest, camera, 60, NEST_TIMES.end);
    expect(nest.wiggle.escaped).toBe(false);
    expect(nest.done).toBe(true);
    nest.stop();
  });
});

describe('the fall', () => {
  it('its shot stands clear of every trunk, low over the floor', () => {
    const out = [0, 0, 0];
    for (const t of treeSites()) {
      // As near a trunk as a drop can be, from each side, the camera on the trunk's side.
      const r = trunkFootOf(t) + DROP_CLEAR;
      for (let a = 0; a < 6.28; a += 0.8) {
        // (Drops happen inside the world.)
        if (Math.abs(t.x + Math.sin(a) * r) > WORLD_HALF - 1 || Math.abs(t.z + Math.cos(a) * r) > WORLD_HALF - 1) continue;
        fallShot(t.x + Math.sin(a) * r, t.z + Math.cos(a) * r, t.x, t.z, out);
        const near = Math.min(...treeSites().map((s) => Math.hypot(out[0] - s.x, out[2] - s.z) - trunkFootOf(s)));
        expect(near).toBeGreaterThan(0.5);
        expect(out[1]).toBeGreaterThan(litterTopHeight(out[0], out[2]));
      }
    }
  });

  it('the camera eases down to the shot; reduced motion cuts there and holds', () => {
    const from = [0, 10, 0], to = [5, 1, 5], worm = [1, 4, 1], ground = [1, 0, 1];
    const pos = [0, 0, 0], look = [0, 0, 0];
    fallCamera(0, from, to, worm, ground, false, pos, look);
    expect(pos).toEqual(from);
    expect(look).toEqual(worm);
    fallCamera(5, from, to, worm, ground, false, pos, look);
    expect(pos).toEqual(to);
    fallCamera(0, from, to, worm, ground, true, pos, look);
    expect(pos).toEqual(to);
    expect(look[1]).toBeGreaterThan(0);
  });

  it('a rope into play\'s body: straight back from the head toward the rest of it, gap apart', () => {
    const rope = new Float64Array(6 * 3);
    // A heap: the head at x 0, the rest curled about x -1.
    for (let i = 1; i < 6; i++) { rope[i * 3] = -1 + Math.cos(i) * 0.3; rope[i * 3 + 2] = Math.sin(i) * 0.3; }
    const out = body();
    const heading = ropeToBody(rope, 0.3, out);
    expect(Math.sin(heading)).toBeGreaterThan(0.9);
    expect(out[0].x).toBe(0);
    for (let i = 1; i < out.length; i++) {
      expect(Math.hypot(out[i].x - out[i - 1].x, out[i].z - out[i - 1].z)).toBeCloseTo(0.3, 5);
      expect(out[i].x).toBeLessThan(out[i - 1].x);
    }
  });
});
