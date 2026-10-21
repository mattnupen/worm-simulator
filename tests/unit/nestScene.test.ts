import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Robin, restPose } from '../../src/predators/robin';
import { Nest } from '../../src/predators/nest';
import { NestScene, nestSite } from '../../src/predators/nestScene';
import { cameraAt, clearance, planCamera, STILL_CUTS } from '../../src/predators/nestCamera';
import {
  NEST_CAPTIONS, NEST_TIMES, curveAt, darkAt, makeSetup, nestCaptionAt, nestlingAt, robinAt,
} from '../../src/predators/nestScript';
import { HOLD, WORM_CM, WORM_POINTS } from '../../src/predators/wormCarry';
import { TEXT } from '../../src/content/text';
import { UNITS_PER_CM } from '../../src/surface/realScale';
import { litterTopHeight } from '../../src/surface/litterDepth';
import { sharedLighting } from '../../src/render/paintedMaterial';
import { treeSites, trunkFootOf, trunkRadiusOf } from '../../src/surface/treeSites';

const finite = (o: Record<string, unknown>): boolean => Object.values(o).every((v) => typeof v !== 'number' || Number.isFinite(v));

describe('nest scene script', () => {
  it('runs in order and ends after about 10 seconds', () => {
    const T = NEST_TIMES;
    const order = [0, T.takeoff, T.beg, T.land, T.leanIn[0], T.leanIn[1], T.fade[0], T.fed, T.fade[1], T.end];
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
    expect(T.leanOut[0]).toBeGreaterThan(T.fed);
    expect(T.leanOut[1]).toBeGreaterThan(T.leanOut[0]);
    expect(T.leanOut[1]).toBeLessThanOrEqual(T.end);
    expect(T.end).toBeGreaterThanOrEqual(9);
    expect(T.end).toBeLessThanOrEqual(12);
    for (let i = 1; i < NEST_CAPTIONS.length; i++) expect(NEST_CAPTIONS[i].at).toBeGreaterThan(NEST_CAPTIONS[i - 1].at);
    for (let i = 1; i < STILL_CUTS.length; i++) expect(STILL_CUTS[i]).toBeGreaterThan(STILL_CUTS[i - 1]);
  });

  it('is nearly dark when the worm is given, so nothing is shown being swallowed', () => {
    expect(darkAt(0)).toBe(0);
    expect(darkAt(NEST_TIMES.fed)).toBeGreaterThan(0.85);
    expect(darkAt(NEST_TIMES.end)).toBe(1);
  });

  it('every moment poses cleanly: robin, nestlings and both cameras, no NaN', () => {
    const s = makeSetup(1, 0.2, -2, 0.7, nestSite());
    const robin = restPose();
    const chick = { stretch: 0, open: 0, lean: 0, sway: 0 };
    const pos = [0, 0, 0];
    const look = [0, 0, 0];
    for (let t = 0; t <= NEST_TIMES.end; t += 0.05) {
      robinAt(t, s, robin);
      expect(finite(robin as unknown as Record<string, unknown>)).toBe(true);
      for (let i = 0; i < 3; i++) {
        nestlingAt(t, i, chick);
        expect(finite(chick as unknown as Record<string, unknown>)).toBe(true);
        expect(chick.open).toBeGreaterThanOrEqual(0);
        expect(chick.open).toBeLessThanOrEqual(1);
      }
      for (const reduced of [false, true]) {
        cameraAt(t, s, robin, reduced, pos, look);
        expect(pos.concat(look).every(Number.isFinite)).toBe(true);
        // Never under the forest floor.
        expect(pos[1]).toBeGreaterThan(litterTopHeight(pos[0], pos[2]));
      }
    }
  });

  it('starts on the ground where the robin caught the worm and ends perched on the nest', () => {
    const site = nestSite();
    const s = makeSetup(3, 0.4, 2, 0, site);
    const r = restPose();
    robinAt(0, s, r);
    expect([r.x, r.y, r.z]).toEqual([3, 0.4, 2]);
    robinAt(NEST_TIMES.end, s, r);
    expect(r.flying).toBe(false);
    // A robin's nest sits well up in the tree: about 1.8 m here (1.5 to 4.5 m is usual).
    expect((r.y - litterTopHeight(site.x, site.z)) / UNITS_PER_CM).toBeGreaterThan(150);
    expect(Math.hypot(r.x - site.x, r.z - site.z) / UNITS_PER_CM).toBeLessThan(10);
  });

  it('from anywhere on the floor, neither the robin nor the camera goes through a trunk', () => {
    const site = nestSite();
    const r = restPose();
    const p = [0, 0, 0];
    for (let x = -19; x <= 19; x += 3) {
      for (let z = -19; z <= 19; z += 3) {
        // (A worm can't be inside a trunk's footprint.)
        if (treeSites().some((t) => Math.hypot(x - t.x, z - t.z) < trunkFootOf(t) + 1)) continue;
        const s = makeSetup(x, litterTopHeight(x, z), z, 1, site);
        planCamera(s, r);
        expect(clearance(s, r)).toBeGreaterThan(0.5);
        for (const t of treeSites()) {
          for (let u = 0.1; u <= 1; u += 0.02) {
            curveAt(s, u, p);
            expect(Math.hypot(p[0] - t.x, p[2] - t.z)).toBeGreaterThan(trunkRadiusOf(t) + 1);
          }
        }
      }
    }
  });

  it('reduced motion cuts between still shots: the camera does not move within a shot', () => {
    const s = makeSetup(0, 0, 0, 0, nestSite());
    const r = restPose();
    const a = [0, 0, 0], b = [0, 0, 0], la = [0, 0, 0], lb = [0, 0, 0];
    for (const [from, to] of [[0.05, STILL_CUTS[1] - 0.05], [STILL_CUTS[1] + 0.05, STILL_CUTS[2] - 0.05], [STILL_CUTS[2] + 0.05, NEST_TIMES.end]]) {
      robinAt(from, s, r);
      cameraAt(from, s, r, true, a, la);
      robinAt(to, s, r);
      cameraAt(to, s, r, true, b, lb);
      expect(b).toEqual(a);
      expect(lb).toEqual(la);
    }
  });

  it('captions are sound lines in the content file', () => {
    expect(nestCaptionAt(0)).toBeNull();
    expect(nestCaptionAt(NEST_TIMES.takeoff + 0.1)).toBe('nestWings');
    expect(nestCaptionAt(NEST_TIMES.beg + 0.5)).toBe('nestCheep');
    expect(TEXT.nestFact.kind).toBe('fact');
    expect(TEXT.nestSeason.kind).toBe('gameChoice');
  });
});

describe('nest scene player', () => {
  it('plays to done, and stop hides its robin and nest and puts the haze back', () => {
    const scene = new THREE.Scene();
    const nest = new NestScene(scene);
    const camera = new THREE.PerspectiveCamera(60, 1.6, 0.2, 120);
    const fog = sharedLighting.uFogFar.value;
    nest.start(0, 0, 0.5, false);
    expect(nest.nest.mesh.visible).toBe(true);
    let frames = 0;
    while (!nest.done && frames < 2000) {
      nest.step(1 / 60);
      nest.pose(1, camera);
      frames++;
    }
    expect(nest.done).toBe(true);
    expect(frames).toBeLessThan(NEST_TIMES.end * 60 + 2);
    expect(camera.position.toArray().every(Number.isFinite)).toBe(true);
    expect(nest.dark).toBe(1);
    nest.stop();
    expect(nest.playing).toBe(false);
    expect(nest.robin.mesh.visible).toBe(false);
    expect(nest.nest.mesh.visible).toBe(false);
    expect(sharedLighting.uFogFar.value).toBe(fog);
  });

  it('skip ends it at once', () => {
    const nest = new NestScene(new THREE.Scene(), new Robin());
    nest.start(2, 3, 0, true);
    nest.step(1 / 60);
    expect(nest.done).toBe(false);
    nest.skip();
    expect(nest.done).toBe(true);
    nest.stop();
  });

  it('carries the worm in the bill, in one piece and never under the litter', () => {
    const nest = new NestScene(new THREE.Scene());
    const camera = new THREE.PerspectiveCamera(60, 1.6, 0.2, 120);
    nest.start(-3, 4, 2, false);
    const p = new THREE.Vector3();
    const q = new THREE.Vector3();
    const bill = new THREE.Vector3();
    for (let f = 0; f < 8 * 60; f++) {
      nest.step(1 / 60);
      nest.pose(1, camera);
      if (f % 20) continue;
      let length = 0;
      for (let i = 0; i < WORM_POINTS; i++) {
        nest.nest.worm.point(i, p);
        nest.nest.toWorld(p);
        expect(p.y).toBeGreaterThan(litterTopHeight(p.x, p.z) - 0.01);
        if (i > 0) length += p.distanceTo(q);
        q.copy(p);
      }
      // About its real length: stretched or bunched by no more than a little.
      expect(length / UNITS_PER_CM).toBeGreaterThan(WORM_CM * 0.85);
      expect(length / UNITS_PER_CM).toBeLessThan(WORM_CM * 1.15);
      nest.nest.worm.point(HOLD, p);
      nest.nest.toWorld(p);
      expect(p.distanceTo(nest.robin.billHold(bill))).toBeLessThan(0.05);
    }
    nest.stop();
  });

  it('stays small: few vertices to rewrite each frame', () => {
    const n = new Nest();
    expect(n.movingVertexCount).toBeLessThan(6000);
    expect(n.vertexCount).toBeLessThan(25000);
  });

  it('the robin holds things between the halves of its bill, in front of its eye', () => {
    const r = new Robin();
    Object.assign(r.pose, { visible: true });
    r.update();
    const hold = r.billHold(new THREE.Vector3());
    // Bird frame at the origin, facing +z: about 11 cm up and 9 cm forward.
    expect(hold.y / UNITS_PER_CM).toBeGreaterThan(10);
    expect(hold.y / UNITS_PER_CM).toBeLessThan(12.5);
    expect(hold.z / UNITS_PER_CM).toBeGreaterThan(7.5);
    expect(hold.z / UNITS_PER_CM).toBeLessThan(10);
    expect(Math.abs(hold.x)).toBeLessThan(1e-6);
  });
});
