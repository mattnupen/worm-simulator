import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { occlusion, worldUpInView, OCC_SEGMENTS, OCC_TILES } from '../../src/render/occlusion';
import { occluderAxis, occluderSegments } from '../../src/render/occluderSegments';
import { occlusionTiles, tileRange } from '../../src/render/occlusionTiles';
import { groundUniforms, occTileWords } from '../../src/render/groundUniforms';
import { LOCOMOTION } from '../../src/game/drive';
import { mulberry32 } from '../../src/core/random';
import { Crawl, WORM_SEGMENTS } from '../../src/game/crawl';
import type { WormPose } from '../../src/worm/wormMesh';

describe('the fade searches only the segments its screen tile can need (V2: the buried worm)', () => {
  it('packs every tile in the shader\'s ints, and starts with every tile searching nothing', () => {
    expect(groundUniforms.uOccTiles.value).toBe(occTileWords);
    expect(occTileWords.length).toBe((OCC_TILES * OCC_TILES) / 4);
    // 4 bits a bound: segments 0 to 14, and 15 for an empty tile.
    expect(OCC_SEGMENTS).toBeLessThan(16);
    const r = [0, 0];
    tileRange(0, 0, [-1, -1, 1, 1], new Int32Array(occTileWords.length).fill(0x0f0f0f0f), r);
    expect(r[0]).toBeGreaterThan(r[1]);
  });

  it('gives the shader each segment in view space, as occlusion() rebuilds it', () => {
    const seg = new Float32Array([0.1, -0.2, 0.5, 9, 0.3, 0.1, 0.25, 0]);
    const axis = new Float32Array(8);
    occluderAxis(seg, 1, axis);
    expect(axis[0]).toBeCloseTo(0.2, 6);
    expect(axis[1]).toBeCloseTo(-0.4, 6);
    expect(axis[2]).toBeCloseTo(2, 6);
    const e = [0.3 * 4 - 0.2, 0.1 * 4 + 0.4, 4 - 2];
    for (let k = 0; k < 3; k++) expect(axis[4 + k]).toBeCloseTo(e[k], 5);
    expect(axis[3]).toBeCloseTo(1 / (e[0] ** 2 + e[1] ** 2 + e[2] ** 2), 6);
  });

  it('crawling with sharp turns: the tiled search fades every pixel exactly as the full one, and searches far less', () => {
    const camera = new THREE.PerspectiveCamera(60, 1366 / 768, 0.2, 120);
    const seg = new Float32Array(OCC_SEGMENTS * 8);
    const box = new Float32Array(5);
    const up = new THREE.Vector3();
    const tiles = new Int32Array((OCC_TILES * OCC_TILES) / 4);
    const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
    const wrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
    const crawl = new Crawl();
    const rng = mulberry32(77);
    const H = LOCOMOTION.halfSize - 1.5;
    const move = { x: 0, y: 1 };
    const r = [0, 0];
    let tx = 0;
    let tz = 0;
    let sharp = 0;
    let pixels = 0;
    let faded = 0;
    let off = 0;
    let searched = 0;
    let full = 0;
    for (let s = 0; s < 2400; s++) {
      if (s % 300 === 0) {
        tx = (rng() * 2 - 1) * H;
        tz = (rng() * 2 - 1) * H;
        sharp = rng() < 0.5 ? 0 : rng() < 0.5 ? -1 : 1;
      }
      const h = crawl.motion.head;
      move.x = s % 300 < 120 && sharp ? sharp : Math.max(-1, Math.min(1, -wrap(Math.atan2(tx - h.x, tz - h.z) - crawl.motion.heading) * 3));
      crawl.step(1 / 60, move);
      if (s % 20 !== 0 || s < 120) continue;
      crawl.interpolate(1, 0, pose, camera);
      camera.updateMatrixWorld();
      const view = camera.matrixWorldInverse.elements;
      const pe = camera.projectionMatrix.elements;
      const count = occluderSegments(pose.spine, view, pe[0], pe[5], seg, box);
      worldUpInView(view, up);
      const upA = up.toArray();
      // As the world does: the box clipped to the screen, then its tiles.
      const b = [Math.max(-1, box[0]), Math.max(-1, box[1]), Math.min(1, box[2]), Math.min(1, box[3])];
      if (!(b[0] < b[2] && b[1] < b[3])) continue;
      occlusionTiles(seg, count, b, pe[0], pe[5], tiles);
      // Pixels over the box, a leaf at every depth along each (in front of, at and behind the body).
      for (let a = 0; a <= 40; a++) {
        for (let c = 0; c <= 40; c++) {
          const nx = b[0] + ((b[2] - b[0]) * a) / 40;
          const ny = b[1] + ((b[3] - b[1]) * c) / 40;
          tileRange(nx, ny, b, tiles, r);
          searched += Math.max(0, r[1] - r[0] + 1);
          full += count;
          for (const dl of [0.3, 0.8, 1.5, 2.5, 4]) {
            pixels++;
            const want = occlusion(nx / pe[0], ny / pe[5], dl, seg, count, box[4], upA);
            const got = occlusion(nx / pe[0], ny / pe[5], dl, seg, count, box[4], upA, r[0], r[1]);
            if (want > 0) faded++;
            if (got !== want) off++;
          }
        }
      }
    }
    expect(pixels).toBeGreaterThan(500000);
    expect(faded).toBeGreaterThan(20000);
    expect(off).toBe(0);
    // Measured: about a quarter of the segments searched.
    expect(searched / full).toBeLessThan(0.5);
  }, 180000);
});
