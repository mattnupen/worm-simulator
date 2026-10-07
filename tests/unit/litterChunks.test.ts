import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  CHUNKS, CHUNK_SIZE, LOD_NEAR, LOD_GAP, chunkIndex, chunkCentreX, chunkCentreZ, chunkDistance,
  groupByChunk, countBelow, nextLod, ACTIVE_MARGIN, boxesMeet, hullBox,
} from '../../src/surface/litterChunks';
import { occlusion, worldUpInView, OCC_REACH, OCC_SEGMENTS } from '../../src/render/occlusion';
import { occluderSegments } from '../../src/render/occluderSegments';
import { SPINE_POINTS } from '../../src/render/groundUniforms';
import { mulberry32 } from '../../src/core/random';
import { WORLD_HALF } from '../../src/surface/terrain';
import { placeLeaves } from '../../src/surface/leafLitter';

describe('litter chunks', () => {
  it('tile the world exactly', () => {
    expect(CHUNKS * CHUNK_SIZE).toBeCloseTo(2 * WORLD_HALF, 12);
    expect(chunkIndex(-WORLD_HALF, -WORLD_HALF)).toBe(0);
    expect(chunkIndex(WORLD_HALF, WORLD_HALF)).toBe(CHUNKS * CHUNKS - 1);
    expect(chunkIndex(999, -999)).toBe(CHUNKS - 1);
  });

  it('every point lies in the chunk whose square holds it', () => {
    for (let x = -WORLD_HALF; x <= WORLD_HALF; x += 0.73) {
      for (let z = -WORLD_HALF; z <= WORLD_HALF; z += 0.81) {
        const c = chunkIndex(x, z);
        expect(Math.abs(x - chunkCentreX(c))).toBeLessThanOrEqual(CHUNK_SIZE / 2 + 1e-9);
        expect(Math.abs(z - chunkCentreZ(c))).toBeLessThanOrEqual(CHUNK_SIZE / 2 + 1e-9);
        expect(chunkDistance(c, x, z)).toBe(0);
      }
    }
  });

  it('chunkDistance is the distance to the nearest point of the square', () => {
    const c = chunkIndex(0.1, 0.1);
    const edge = chunkCentreX(c) + CHUNK_SIZE / 2;
    expect(chunkDistance(c, edge + 3, chunkCentreZ(c))).toBeCloseTo(3, 9);
    const cornerX = chunkCentreX(c) + CHUNK_SIZE / 2;
    const cornerZ = chunkCentreZ(c) + CHUNK_SIZE / 2;
    expect(chunkDistance(c, cornerX + 3, cornerZ + 4)).toBeCloseTo(5, 9);
  });

  it('groups leaves so a global prefix is a per-chunk prefix', () => {
    const leaves = placeLeaves(3000, WORLD_HALF, 4);
    const groups = groupByChunk(leaves);
    expect(groups.reduce((a, g) => a + g.length, 0)).toBe(3000);
    for (const g of groups) for (let k = 1; k < g.length; k++) expect(g[k]).toBeGreaterThan(g[k - 1]);
    for (const n of [0, 1, 777, 3000]) {
      const total = groups.reduce((a, g) => a + countBelow(g, n), 0);
      expect(total).toBe(n);
    }
  });

  it('countBelow counts entries under n', () => {
    const s = [1, 4, 4, 9, 20];
    expect(countBelow(s, 0)).toBe(0);
    expect(countBelow(s, 4)).toBe(1);
    expect(countBelow(s, 5)).toBe(3);
    expect(countBelow(s, 100)).toBe(5);
    expect(countBelow([], 3)).toBe(0);
  });

  it('switches level of detail with hysteresis', () => {
    expect(nextLod(false, LOD_NEAR - 0.1)).toBe(true);
    expect(nextLod(true, LOD_NEAR + 1)).toBe(true);
    expect(nextLod(false, LOD_NEAR + 1)).toBe(false);
    expect(nextLod(true, LOD_NEAR + LOD_GAP + 0.1)).toBe(false);
  });

  it('pads chunks for the fade (the top leaves never move: they lie over the buried worm)', () => {
    expect(ACTIVE_MARGIN).toBe(OCC_REACH);
  });

  it('boxesMeet grows the first box by pad, and an empty box meets nothing', () => {
    const a = [0, 0, 1, 1];
    expect(boxesMeet(a, [0.5, 0.5, 0.6, 0.6], 0)).toBe(true);
    expect(boxesMeet(a, [1.4, 0, 2, 1], 0.5)).toBe(true);
    expect(boxesMeet(a, [1.6, 0, 2, 1], 0.5)).toBe(false);
    expect(boxesMeet(a, [0, -2, 1, -0.6], 0.5)).toBe(false);
    expect(boxesMeet(a, [-3, -3, 3, 3], 0)).toBe(true);
    expect(boxesMeet(a, [Infinity, Infinity, -Infinity, -Infinity], 100)).toBe(false);
  });

  it('hullBox spans the camera and every spine point, with no allocation', () => {
    const out = new Float32Array(4);
    hullBox(1, -2, [0, 5, 0, 3, 0, 4, -1, 2, 1], out);
    expect(Array.from(out)).toEqual([-1, -2, 3, 4]);
    hullBox(0, 0, [], out);
    expect(Array.from(out)).toEqual([0, 0, 0, 0]);
  });

  it('every pixel the fade drops lies within OCC_REACH of hullBox (random cameras, spines and pixels)', () => {
    const rng = mulberry32(11);
    const cam = new THREE.PerspectiveCamera(65, 1366 / 768, 0.05, 200);
    const seg = new Float32Array(OCC_SEGMENTS * 8);
    const box = new Float32Array(5);
    const spine = new Float32Array(SPINE_POINTS * 3);
    const hull = new Float32Array(4);
    const p = new THREE.Vector3();
    const up = new THREE.Vector3();
    let faded = 0;
    let worst = 0;
    for (let t = 0; t < 1500; t++) {
      // A wavy worm heading `h` from a head near the origin, a little above the ground.
      const hx = rng() * 6 - 3;
      const hz = rng() * 6 - 3;
      const h = rng() * Math.PI * 2;
      for (let i = 0; i < SPINE_POINTS; i++) {
        const s = i * 0.11;
        spine[i * 3] = hx - Math.cos(h) * s + Math.sin(h) * 0.3 * Math.sin(s * 3);
        spine[i * 3 + 1] = 0.02 + rng() * 0.05;
        spine[i * 3 + 2] = hz - Math.sin(h) * s;
      }
      // A camera behind it, near or far, low or high, looking roughly at the head.
      const back = 0.6 + rng() * 4;
      cam.position.set(
        hx - Math.cos(h) * back + rng() - 0.5, 0.15 + rng() * 2, hz - Math.sin(h) * back + rng() - 0.5,
      );
      cam.lookAt(hx + rng() - 0.5, 0.1, hz + rng() - 0.5);
      cam.updateMatrixWorld();
      const pe = cam.projectionMatrix.elements;
      const count = occluderSegments(spine, cam.matrixWorldInverse.elements, pe[0], pe[5], seg, box);
      worldUpInView(cam.matrixWorldInverse.elements, up);
      hullBox(cam.position.x, cam.position.z, spine, hull);
      for (let k = 0; k < 200; k++) {
        // A leaf pixel somewhere along the ray from the camera to a point near the body.
        const si = Math.floor(rng() * SPINE_POINTS) * 3;
        const f = rng() * 1.1;
        p.set(
          spine[si] + (rng() - 0.5) * 0.7, spine[si + 1] + 0.1 + (rng() - 0.5) * 0.7, spine[si + 2] + (rng() - 0.5) * 0.7,
        ).sub(cam.position).multiplyScalar(f).add(cam.position);
        const wx = p.x;
        const wz = p.z;
        p.applyMatrix4(cam.matrixWorldInverse);
        const dl = -p.z;
        if (dl <= 0.05) continue;
        if (occlusion(p.x / dl, p.y / dl, dl, seg, count, box[4], up.toArray()) <= 0) continue;
        faded++;
        const dx = Math.max(hull[0] - wx, 0, wx - hull[2]);
        const dz = Math.max(hull[1] - wz, 0, wz - hull[3]);
        worst = Math.max(worst, Math.hypot(dx, dz));
      }
    }
    // The sample is real: many faded pixels, some of them outside the box itself.
    expect(faded).toBeGreaterThan(50000);
    expect(worst).toBeGreaterThan(0.05);
    expect(worst).toBeLessThanOrEqual(OCC_REACH + 1e-4);
  });
});
