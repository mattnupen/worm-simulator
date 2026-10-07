import { describe, it, expect } from 'vitest';
import { detailVertex, DETAIL_BOX, DETAIL_FADE_OUT, DETAIL_GLSL, POCKET_FAR, type DetailInputs } from '../../src/render/detailGlsl';
import { spineDistance } from '../../src/render/nearClutterGlsl';
import { litterTextureData } from '../../src/render/litterTexture';
import { bakedGroundHeight, groundTextureData } from '../../src/render/groundTexture';
import { buildDetailLeaves } from '../../src/surface/detailLeaves';
import { floorHeight, litterTopHeight } from '../../src/surface/litterDepth';
import { BELLY_UNDER } from '../../src/worm/surfaceHeight';

describe('detail leaf placement (TS twin of detailPosition)', () => {
  const inp: DetailInputs = { focusX: 0, focusZ: 0, wrapX: 0, wrapZ: 0, litter: litterTextureData(), ground: groundTextureData() };
  const g = buildDetailLeaves(400).mesh.geometry;
  const pos = g.getAttribute('position');
  const det = g.getAttribute('aDetail');
  const leaf2 = g.getAttribute('aLeaf2');
  const out = [0, 0, 0];
  const anchor = [0, 0, 0, 0];
  const d4 = [0, 0, 0, 0];
  const p3 = [0, 0, 0];
  const place = (v: number) => {
    d4[0] = det.getX(v);
    d4[1] = det.getY(v);
    d4[2] = det.getZ(v);
    d4[3] = det.getW(v);
    p3[0] = pos.getX(v);
    p3[1] = pos.getY(v);
    p3[2] = pos.getZ(v);
    return detailVertex(inp, d4, p3, leaf2.getY(v), out, anchor);
  };
  const setFocus = (x: number, z: number) => {
    inp.focusX = x;
    inp.focusZ = z;
    inp.wrapX = Math.round(x);
    inp.wrapZ = Math.round(z);
  };

  it('lays every vertex on the rendered ground, at or above its leaf rest plane, within its radius', () => {
    for (const [fx, fz] of [[0.3, -0.2], [7.6, 3.1], [-12.4, 9.8], [15.2, -16.7]]) {
      setFocus(fx, fz);
      for (let v = 0; v < pos.count; v++) {
        const shade = place(v);
        expect(shade).toBeGreaterThan(0.4);
        expect(shade).toBeLessThanOrEqual(1);
        expect(Math.abs(anchor[0] - inp.wrapX)).toBeLessThanOrEqual(DETAIL_BOX / 2);
        expect(Math.abs(anchor[1] - inp.wrapZ)).toBeLessThanOrEqual(DETAIL_BOX / 2);
        // Shrunk to nothing: one point, nothing drawn (see below).
        if (anchor[2] === 0) continue;
        // So a detail leaf's dip is always 0.
        expect(out[1] - bakedGroundHeight(inp.ground, out[0], out[2]) - anchor[3]).toBeGreaterThanOrEqual(-1e-9);
        expect(anchor[3]).toBeGreaterThan(0.007);
        expect(anchor[3]).toBeLessThan(0.15);
        expect(Math.hypot(out[0] - anchor[0], out[2] - anchor[1])).toBeLessThanOrEqual(anchor[2] * (1 + 1e-6));
      }
    }
  });

  it('never pops: a leaf jumps to another tile copy only while it is shrunk to nothing', () => {
    const last = new Float64Array(pos.count * 3).fill(NaN);
    let jumps = 0;
    // The head crawls a long curve; the wrap centre snaps along behind it.
    for (let t = 0; t < 40; t += 0.02) {
      setFocus(8 * Math.sin(t * 0.21) + t * 0.3, 6 * Math.cos(t * 0.17) - t * 0.2);
      for (let v = 0; v < pos.count; v += 7) {
        place(v);
        const k = v * 3;
        if (!Number.isNaN(last[k]) && Math.hypot(anchor[0] - last[k], anchor[1] - last[k + 1]) > 1) {
          jumps++;
          // Gone at the snap itself; within one 2 cm step of it, under a millimetre across.
          expect(anchor[2]).toBeLessThan(1e-3);
          expect(last[k + 2]).toBeLessThan(1e-3);
        }
        last[k] = anchor[0];
        last[k + 1] = anchor[1];
        last[k + 2] = anchor[2];
      }
    }
    expect(jumps).toBeGreaterThan(100);
  });

  it('at the snap itself, every leaf that jumps is exactly gone on both sides', () => {
    let jumps = 0;
    const before = new Float64Array(pos.count * 3);
    for (let k = -18; k <= 18; k += 1) {
      for (const axis of [0, 1]) {
        const other = 0.37 * k - 2.1;
        const at = (eps: number, store: boolean) => {
          const s = k + 0.5 + eps;
          setFocus(axis ? other : s, axis ? s : other);
          for (let v = 0; v < pos.count; v += 3) {
            place(v);
            const i = v * 3;
            if (store) {
              before[i] = anchor[0];
              before[i + 1] = anchor[1];
              before[i + 2] = anchor[2];
            } else if (Math.hypot(anchor[0] - before[i], anchor[1] - before[i + 1]) > 1) {
              jumps++;
              expect(before[i + 2]).toBeLessThan(1e-9);
              expect(anchor[2]).toBeLessThan(1e-9);
            }
          }
        };
        at(-1e-9, true);
        at(1e-9, false);
      }
    }
    expect(jumps).toBeGreaterThan(1000);
  });

  it('a leaf shrunk to nothing returns at once: one point, no texture reads, no drape', () => {
    setFocus(0.2, 0.1);
    let gone = 0;
    for (let v = 0; v < pos.count; v++) {
      const shade = place(v);
      if (anchor[2] > 0) continue;
      gone++;
      expect(shade).toBe(1);
      expect(anchor[3]).toBe(0);
      expect(out).toEqual([anchor[0], 0, anchor[1]]);
    }
    // About a third of the tile lies outside the 6 m circle.
    expect(gone / pos.count).toBeGreaterThan(0.2);
    expect(gone / pos.count).toBeLessThan(0.5);
    expect(DETAIL_GLSL).toContain('if (r <= 0.0)');
  });

  it('shrinks leaves to nothing by 6 m from the head', () => {
    setFocus(1.2, -3.4);
    let seen = 0;
    for (let v = 0; v < pos.count; v++) {
      place(v);
      const d = Math.hypot(anchor[0] - inp.focusX, anchor[1] - inp.focusZ);
      if (d >= DETAIL_FADE_OUT) {
        seen++;
        expect(anchor[2]).toBe(0);
      } else if (d < 5) expect(anchor[2]).toBe(det.getW(v));
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('has a GLSL twin that reads the same textures and gives the same anchor', () => {
    expect(DETAIL_GLSL).toContain('wrapAround(aDetail.xy, uWrapCentre, 13.0000000)');
    expect(DETAIL_GLSL).toContain('float ground = meshGround(xz);');
    expect(DETAIL_GLSL).toContain('float ground = terrainHeight(xz);');
    expect(DETAIL_GLSL).toContain('return vec4(xz.x, ground + rest + p.y, xz.y, 1.0);');
    expect(DETAIL_GLSL).toContain('anchor = vec4(home, r, rest)');
  });
});

describe('the pocket\'s leaves (round the buried worm, V2 spec 8.2)', () => {
  const inp: DetailInputs = { focusX: 0, focusZ: 0, wrapX: 0, wrapZ: 0, litter: litterTextureData(), ground: groundTextureData() };
  const g = buildDetailLeaves(300, 5, true).mesh.geometry;
  const pos = g.getAttribute('position');
  const det = g.getAttribute('aDetail');
  const leaf2 = g.getAttribute('aLeaf2');
  const out = [0, 0, 0];
  const anchor = [0, 0, 0, 0];
  const d4 = [0, 0, 0, 0];
  const p3 = [0, 0, 0];

  /** A straight spine from the head at (x, z) heading +z. */
  const straight = (x: number, z: number) => Float32Array.from({ length: 48 }, (_, k) => (k % 3 === 0 ? x : k % 3 === 1 ? 0 : z - Math.floor(k / 3) * 0.22));

  it('are only round the body: shrunk to nothing past POCKET_FAR from the spine', () => {
    inp.focusX = 0.3; inp.focusZ = -0.2; inp.wrapX = 0; inp.wrapZ = 0;
    inp.spine = straight(0.3, -0.2);
    let kept = 0;
    for (let v = 0; v < pos.count; v++) {
      d4[0] = det.getX(v); d4[1] = det.getY(v); d4[2] = det.getZ(v); d4[3] = det.getW(v);
      p3[0] = pos.getX(v); p3[1] = pos.getY(v); p3[2] = pos.getZ(v);
      detailVertex(inp, d4, p3, leaf2.getY(v), out, anchor, true);
      const d = spineDistance(inp.spine, anchor[0], anchor[1]);
      if (d >= POCKET_FAR) expect(anchor[2]).toBe(0);
      else if (anchor[2] > 0) kept++;
    }
    expect(kept).toBeGreaterThan(20);
    expect(DETAIL_GLSL).toContain('spineDistance(home)');
  });

  it('lie in the litter over the floor, from the worm\'s belly up, and never show through its top', () => {
    let low = 0;
    let high = 0;
    // The last four lie along the world's edges, where the leaves reach past them (litterTexture.ts EDGE_REACH).
    for (const [fx, fz] of [[0.3, -0.2], [2.2, 6.5], [-12.4, 9.8], [15.2, -16.7], [18.9, 4], [-18.9, -12], [7, 18.9], [-3, -15.7]]) {
      inp.focusX = fx;
      inp.focusZ = fz;
      inp.wrapX = Math.round(fx);
      inp.wrapZ = Math.round(fz);
      inp.spine = straight(fx, fz);
      for (let v = 0; v < pos.count; v++) {
        d4[0] = det.getX(v); d4[1] = det.getY(v); d4[2] = det.getZ(v); d4[3] = det.getW(v);
        p3[0] = pos.getX(v); p3[1] = pos.getY(v); p3[2] = pos.getZ(v);
        detailVertex(inp, d4, p3, leaf2.getY(v), out, anchor, true);
        if (anchor[2] === 0) continue;
        // On the floor (where the worm's belly rests), at or above the leaf's rest plane.
        expect(out[1] - floorHeight(out[0], out[2]) - anchor[3]).toBeGreaterThanOrEqual(-1e-9);
        expect(anchor[3]).toBeGreaterThan(0.007);
        // Below the top of the litter as drawn (whose grid can sit up to 0.17 under the depth
        // the leaves read): never showing through it.
        expect(litterTopHeight(out[0], out[2]) - out[1]).toBeGreaterThan(0.02);
        if (anchor[3] < BELLY_UNDER + 0.1) low++;
        if (anchor[3] > 0.2) high++;
      }
    }
    // Most lie low, round the worm; some higher, over it.
    expect(low).toBeGreaterThan(high);
    expect(high).toBeGreaterThan(10);
  });
});
