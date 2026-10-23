import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildPocketLeaves } from '../../src/surface/pocketLeaves';
import { buildDetailLeaves, pocketCount } from '../../src/surface/detailLeaves';
import type { FadeFrame } from '../../src/render/fadeBall';
import { detailVertex, pocketCap, type DetailInputs } from '../../src/render/detailGlsl';
import { disturbVertex, packedMapSampler } from '../../src/render/leafGlsl';
import { occlusion, worldUpInView, OCC_REACH, OCC_SEGMENTS } from '../../src/render/occlusion';
import { occluderSegments } from '../../src/render/occluderSegments';
import { litterTextureData } from '../../src/render/litterTexture';
import { groundTextureData } from '../../src/render/groundTexture';
import { litterTopHeight } from '../../src/surface/litterDepth';
import { POCKET_ORDER } from '../../src/render/drawOrder';
import { PRESETS } from '../../src/render/graphics';
import { DIST_CELL, DIST_N, DIST_SPAN, packDisturbance } from '../../src/surface/disturbance';
import { LOCOMOTION } from '../../src/game/drive';
import { mulberry32 } from '../../src/core/random';
import { Crawl, WORM_SEGMENTS } from '../../src/game/crawl';
import type { WormPose } from '../../src/worm/wormMesh';

/** The smallest miss (occlusion()'s measure: tan-space distance over inverse depth) from tan point (tx, ty) to any segment. */
function nearestMiss(tx: number, ty: number, seg: ArrayLike<number>, count: number): number {
  let best = Infinity;
  for (let i = 0; i < count; i++) {
    const o = i * 8;
    const abx = seg[o + 4] - seg[o];
    const aby = seg[o + 5] - seg[o + 1];
    const u = Math.min(1, Math.max(0, ((tx - seg[o]) * abx + (ty - seg[o + 1]) * aby) * seg[o + 3]));
    const inv = seg[o + 2] + (seg[o + 6] - seg[o + 2]) * u;
    best = Math.min(best, Math.hypot(tx - seg[o] - abx * u, ty - seg[o + 1] - aby * u) / inv);
  }
  return best;
}

describe('the pocket\'s leaves: only those the hole over the worm may show are drawn (V2 spec 8.2)', () => {
  it('is one draw after the top of the litter, sharing the pocket leaves\' buffers and material', () => {
    const p = buildPocketLeaves(60);
    expect(p.mesh.renderOrder).toBe(POCKET_ORDER);
    expect((p.mesh.material as THREE.ShaderMaterial).defines).toHaveProperty('POCKET');
    expect(p.mesh.geometry.getAttribute('aDetail').count).toBeGreaterThan(60 * 20);
    // Nothing listed before the first frame, but both draws shown (empty) so their shaders compile
    // with the layer. The fading draw is a sibling, not a child, so each hides on its own.
    p.setCount(60);
    expect(p.listed).toBe(0);
    expect(p.mesh.visible).toBe(true);
    expect(p.beside!.visible).toBe(true);
    expect(p.mesh.geometry.drawRange.count).toBe(0);
    expect(p.mesh.children).toHaveLength(0);
  });

  it('crawling over the real litter: every leaf left out lies where the top cannot fade, none drawn plain would fade, none shows through the top', () => {
    const count = pocketCount(PRESETS.ultra.detail);
    const pocket = buildPocketLeaves(count);
    pocket.setCount(count);
    // The same leaves, with their index buffer in leaf order (the pocket's own lists only the drawn).
    const g = buildDetailLeaves(count, 5, true).mesh.geometry;
    expect(g.getAttribute('aDetail').array).toEqual(pocket.mesh.geometry.getAttribute('aDetail').array);
    const pos = g.getAttribute('position');
    const det = g.getAttribute('aDetail');
    const leaf2 = g.getAttribute('aLeaf2');
    const index = g.index!.array;
    const camera = new THREE.PerspectiveCamera(60, 1366 / 768, 0.2, 120);
    const seg = new Float32Array(OCC_SEGMENTS * 8);
    const box = new Float32Array(5);
    const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
    const near = new Uint8Array(DIST_N * DIST_N * 4);
    const trail = new Uint8Array(DIST_N * DIST_N * 2);
    const sample = packedMapSampler(near, trail);
    const inp: DetailInputs = { focusX: 0, focusZ: 0, wrapX: 0, wrapZ: 0, litter: litterTextureData(), ground: groundTextureData() };
    const fades = new Uint8Array(count);
    const up = new THREE.Vector3();
    const listed = new Uint8Array(count);
    const d4 = [0, 0, 0, 0];
    const p3 = [0, 0, 0];
    const at = [0, 0, 0];
    const a4 = [0, 0, 0, 0];
    const moved = [0, 0, 0];
    const v = new THREE.Vector3();
    const wrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
    const crawl = new Crawl();
    const fadeWin = [crawl.reach.fadeFrom / (DIST_SPAN / 2), crawl.reach.fadeTo / (DIST_SPAN / 2)];
    const rng = mulberry32(97);
    const H = LOCOMOTION.halfSize - 1.5;
    const move = { x: 0, y: 1 };
    let tx = 0;
    let tz = 0;
    let sharp = 0;
    let frames = 0;
    let shown = 0;
    let most = 0;
    let checked = 0;
    let closest = Infinity;
    let fading = 0;
    let draped = 0;
    let plainChecked = 0;
    // Failures are counted (one expect per vertex is slow), with the first of each kind.
    const failures: Record<string, number> = { pokesThrough: 0, leftOutInHole: 0, plainWouldFade: 0, emptyDraw: 0 };
    let allFading = 0;
    const firstFailure: string[] = [];
    const fail = (kind: string, leaf: number, step: number) => {
      if (failures[kind]++ === 0) firstFailure.push(`${kind}: leaf ${leaf} at step ${step}`);
    };
    // 3000 steps, not 2400 (V4 hot fix): the worm now crawls up over rocks and the log, out of the
    // litter, so the same course spends less time buried; the longer drive keeps the sample as big.
    for (let s = 0; s < 3000; s++) {
      if (s % 300 === 0) {
        tx = (rng() * 2 - 1) * H;
        tz = (rng() * 2 - 1) * H;
        sharp = rng() < 0.5 ? 0 : rng() < 0.5 ? -1 : 1;
      }
      const h = crawl.motion.head;
      move.x = s % 300 < 120 && sharp ? sharp : Math.max(-1, Math.min(1, -wrap(Math.atan2(tx - h.x, tz - h.z) - crawl.motion.heading) * 3));
      crawl.step(1 / 60, move);
      if (s % 12 !== 0 || s < 120) continue;
      crawl.interpolate(1, 0, pose, camera);
      camera.updateMatrixWorld();
      const view = camera.matrixWorldInverse.elements;
      const pe = camera.projectionMatrix.elements;
      const n = occluderSegments(pose.spine, view, pe[0], pe[5], seg, box);
      const fade: FadeFrame = { view, seg, count: n, far: box[4] };
      const f = crawl.focus;
      const k = pocket.update(fade, pose.spine, f.x, f.z, Math.round(f.x), Math.round(f.z), crawl.disturbance);
      frames++;
      // Each draw shows only when it holds leaves (or none listed: both hidden).
      if (pocket.mesh.visible !== k - pocket.fading > 0 || pocket.beside!.visible !== pocket.fading > 0) fail('emptyDraw', -1, s);
      if (k > 0 && pocket.fading === k) allFading++;
      shown += k;
      most = Math.max(most, k);
      listed.fill(0);
      fades.fill(0);
      for (let a = 0; a < k; a++) listed[pocket.parts[a]] = 1;
      for (let a = 0; a < pocket.fading; a++) fades[pocket.fadeParts[a]] = 1;
      fading += pocket.fading;
      worldUpInView(view, up);
      const upA = up.toArray();
      // As the GPU places and drapes them.
      const m = crawl.disturbance;
      packDisturbance(m, near, trail);
      inp.focusX = f.x;
      inp.focusZ = f.z;
      inp.wrapX = Math.round(f.x);
      inp.wrapZ = Math.round(f.z);
      inp.spine = pose.spine;
      for (let p = 0; p < count; p++) {
        const end = pocket.ends[p];
        for (let t = p > 0 ? pocket.ends[p - 1] : 0; t < end; t++) {
          const vi = index[t];
          d4[0] = det.getX(vi); d4[1] = det.getY(vi); d4[2] = det.getZ(vi); d4[3] = det.getW(vi);
          p3[0] = pos.getX(vi); p3[1] = pos.getY(vi); p3[2] = pos.getZ(vi);
          detailVertex(inp, d4, p3, leaf2.getY(vi), at, a4, true);
          // Shrunk to nothing: draws nothing.
          if (a4[2] <= 0) break;
          disturbVertex(sample, m.ci * DIST_CELL, m.cj * DIST_CELL, true, at, a4, 0, moved, fadeWin);
          pocketCap(inp, moved);
          // Draped over the body or not, never up through the top of the litter.
          if (!(litterTopHeight(moved[0], moved[2]) - moved[1] > 0.02)) fail('pokesThrough', p, s);
          if (moved[1] - at[1] > 0.1) draped++;
          v.set(moved[0], moved[1], moved[2]).applyMatrix4(camera.matrixWorldInverse);
          const d = -v.z;
          // Behind the camera or at the lens: the near plane clips it.
          if (d < 0.2) continue;
          if (!listed[p]) {
            const miss = nearestMiss(v.x / d, v.y / d, seg, n);
            closest = Math.min(closest, miss);
            if (!(miss >= OCC_REACH)) fail('leftOutInHole', p, s);
            checked++;
          } else if (!fades[p]) {
            // Drawn without the fade: none of it would have faded.
            if (occlusion(v.x / d, v.y / d, d, seg, n, box[4], upA) !== 0) fail('plainWouldFade', p, s);
            plainChecked++;
          }
        }
      }
    }
    expect(failures, firstFailure.join('; ')).toEqual({ pokesThrough: 0, leftOutInHole: 0, plainWouldFade: 0, emptyDraw: 0 });
    // Frames where every listed leaf fades: the plain draw hides (the case is real).
    expect(allFading).toBeGreaterThan(0);
    expect(frames).toBeGreaterThan(150);
    expect(checked).toBeGreaterThan(40000);
    // Left-out leaves come close to the hole (the test is not vacuous)...
    expect(closest).toBeLessThan(OCC_REACH * 1.5);
    // ...and only a handful of the leaves round the body are drawn.
    expect(shown / frames).toBeGreaterThan(1);
    expect(most).toBeLessThan(count / 4);
    // Some are draped high over the body, and some of those drawn (about a sixth) need no fade.
    expect(draped).toBeGreaterThan(1000);
    expect(plainChecked).toBeGreaterThan(20000);
    expect(fading).toBeLessThan(shown);
  }, 180000);
});
