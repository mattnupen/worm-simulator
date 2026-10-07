import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { occluderSegments } from '../../src/render/occluderSegments';
import {
  occlusion, ign, worldUpInView, OCCLUDE_GLSL, OCCLUSION_FN_GLSL, OCC_AXIS_UP, OCC_DEEP_TO, OCC_DRAPE, OCC_DROP,
  OCC_INNER, OCC_NEAR, OCC_NEAR_FADE, OCC_REACH, OCC_SEGMENTS,
} from '../../src/render/occlusion';
import { SPINE_POINTS } from '../../src/render/groundUniforms';
import { mulberry32 } from '../../src/core/random';

/** A spine (belly line) from the head at (x, 0, z) heading +z, bending by `curve` (1/m). */
function spineFrom(x: number, z: number, curve = 0): Float32Array {
  const s = new Float32Array(SPINE_POINTS * 3);
  for (let i = 0; i < SPINE_POINTS; i++) {
    const a = i * 0.22;
    const th = curve * a;
    const lx = curve === 0 ? 0 : (1 - Math.cos(th)) / curve;
    const lz = curve === 0 ? -a : -Math.sin(th) / curve;
    s.set([x + lx, 0, z + lz], i * 3);
  }
  return s;
}

/**
 * The follow camera's view of a head at the origin heading +z, buried in open litter (V2): 2.6 m
 * behind and 1.1 m over a point 0.1 above the top of the litter (0.55 deep), aiming 1 m ahead
 * and 0.6 up.
 */
function followCamera(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(60, 1366 / 768, 0.2, 120);
  c.position.set(0, 1.75, -2.6);
  c.lookAt(0, 0.6, 1);
  c.updateMatrixWorld();
  return c;
}

/** The fade's inputs for a camera and spine, and occlusion() at a world point. */
function view(c: THREE.PerspectiveCamera, spine: Float32Array) {
  const seg = new Float32Array(OCC_SEGMENTS * 8);
  const box = new Float32Array(5);
  const pe = c.projectionMatrix.elements;
  const count = occluderSegments(spine, c.matrixWorldInverse.elements, pe[0], pe[5], seg, box);
  const up = new THREE.Vector3();
  worldUpInView(c.matrixWorldInverse.elements, up);
  const upA = up.toArray();
  const v = new THREE.Vector3();
  /** NDC x, y and view depth of a world point. */
  const project = (p: number[]): number[] => {
    v.set(p[0], p[1], p[2]).applyMatrix4(c.matrixWorldInverse);
    const d = -v.z;
    return [(v.x / d) * pe[0], (v.y / d) * pe[5], d];
  };
  const at = (p: number[]): number => {
    const [nx, ny, d] = project(p);
    return occlusion(nx / pe[0], ny / pe[5], d, seg, count, box[4], upA);
  };
  return { seg, box, count, project, at, up: upA };
}

const camera = followCamera();
const cam = camera.position.toArray();
const spine = spineFrom(0, 0);
const fv = view(camera, spine);
const axis = (i: number): number[] => [spine[i * 3], spine[i * 3 + 1] + OCC_AXIS_UP, spine[i * 3 + 2]];
/** The point `t` of the way from the camera to body point i's axis, nudged sideways by `side`. */
const along = (i: number, t: number, side = 0): number[] => {
  const a = axis(i);
  return [cam[0] + (a[0] - cam[0]) * t + side, cam[1] + (a[1] - cam[1]) * t, cam[2] + (a[2] - cam[2]) * t];
};

describe('occlusion (which leaf pixels in front of the worm fade)', () => {
  it('drops a leaf well above the body completely, anywhere in front of the visible body (the top of the litter over the buried worm)', () => {
    for (const curve of [0, 0.8, -1.4]) {
      const s = spineFrom(0, 0, curve);
      const f = view(camera, s);
      let checked = 0;
      for (let i = 0; i < SPINE_POINTS; i++) {
        const a = [s[i * 3], s[i * 3 + 1] + OCC_AXIS_UP, s[i * 3 + 2]];
        const [nx, ny, d] = f.project(a);
        if (d < OCC_NEAR + OCC_NEAR_FADE || Math.abs(nx) > 1 || Math.abs(ny) > 1) continue;
        checked++;
        for (const t of [0.3, 0.5]) {
          const p = [0, 1, 2].map((k) => cam[k] + (a[k] - cam[k]) * t);
          // At least OCC_DEEP_TO above the axis: dropped in full.
          expect(p[1] - a[1]).toBeGreaterThan(OCC_DEEP_TO);
          expect(f.at(p), `curve ${curve} point ${i} at ${t}`).toBeCloseTo(1, 6);
        }
      }
      // The head and the body down to the bottom of the frame.
      expect(checked, `curve ${curve}`).toBeGreaterThan(4);
    }
  });

  it('only partly fades a leaf lying on the body, so the worm still reads as under it', () => {
    for (const i of [1, 3, 5]) {
      const a = axis(i);
      expect(fv.at([a[0], a[1] + 0.14, a[2]]), `point ${i}`).toBeCloseTo(OCC_DRAPE, 2);
    }
  });

  it('keeps V1\'s shares for the leaves round the body in its pocket, just in front of it', () => {
    for (const i of [2, 4]) {
      // 10% of the way back toward the camera from the axis: about 0.1 above it, 0.3 from it.
      const o = fv.at(along(i, 0.9));
      expect(o, `point ${i}`).toBeGreaterThan(OCC_DRAPE - 0.01);
      expect(o, `point ${i}`).toBeLessThan(OCC_DROP + 0.01);
    }
  });

  it('leaves alone a leaf beside the body, or behind it', () => {
    expect(fv.at(along(3, 0.5, OCC_REACH * 2))).toBe(0);
    expect(fv.at([1, 0.05, -1])).toBe(0);
    expect(fv.at(along(3, 1.3))).toBe(0);
    expect(fv.at(along(0, 1.15))).toBe(0);
  });

  it('falls off smoothly sideways, the hole wider the higher above the body (the funnel)', () => {
    const edge = (t: number): number => {
      let prev = 1;
      let first0 = -1;
      for (let k = 0; k <= 400; k++) {
        const off = k * 0.002;
        const o = fv.at(along(2, t, off));
        // Next to the body the drop share rises as the leaf leaves it (OCC_DRAPE to OCC_DROP), so
        // the fade may tick up by a hair; it never jumps.
        expect(o).toBeLessThanOrEqual(prev + 0.002);
        if (k > 0) expect(Math.abs(prev - o)).toBeLessThan(0.05);
        if (o === 0 && first0 < 0) first0 = off;
        prev = o;
      }
      // At t of the way the leaf is t as far: the miss at the body is the offset / t.
      return first0 / t;
    };
    const high = edge(0.6);
    const low = edge(0.9);
    expect(low).toBeGreaterThan(OCC_INNER);
    expect(high).toBeGreaterThan(low + 0.1);
    expect(high).toBeLessThan(OCC_REACH + 0.02);
  });

  it('keeps 40% of a clear occluder, as the spec says', () => {
    expect(1 - OCC_DROP).toBeCloseTo(0.4, 12);
    expect(OCC_DRAPE).toBeLessThan(OCC_DROP);
  });
});

describe('occluderSegments (the projected body and the screen box that skips the loop elsewhere)', () => {
  const rng = mulberry32(9);
  const ndc = new THREE.Vector3();
  const dir = new THREE.Vector3();

  /** Leaves anywhere on screen at any depth: every one that fades lies inside the box. */
  function holds(s: Float32Array, c: THREE.PerspectiveCamera): number {
    const f = view(c, s);
    let hits = 0;
    for (let k = 0; k < 60000; k++) {
      ndc.set(rng() * 2 - 1, rng() * 2 - 1, 0.5).unproject(c);
      dir.copy(ndc).sub(c.position).normalize();
      const t = 0.25 + rng() * 4;
      const p = [c.position.x + dir.x * t, c.position.y + dir.y * t, c.position.z + dir.z * t];
      const o = f.at(p);
      // The depth early-out is exact: without it, the same answer.
      const [tx, ty, d] = f.project(p);
      const pe = c.projectionMatrix.elements;
      expect(occlusion(tx / pe[0], ty / pe[5], d, f.seg, f.count, Infinity, f.up)).toBe(o);
      if (o <= 0) continue;
      hits++;
      const [nx, ny] = f.project(p);
      expect(nx).toBeGreaterThanOrEqual(f.box[0]);
      expect(nx).toBeLessThanOrEqual(f.box[2]);
      expect(ny).toBeGreaterThanOrEqual(f.box[1]);
      expect(ny).toBeLessThanOrEqual(f.box[3]);
    }
    return hits;
  }

  it('the box holds every pixel the fade touches: straight, curled, the tail under the camera', () => {
    expect(holds(spineFrom(0, 0), camera)).toBeGreaterThan(300);
    expect(holds(spineFrom(0, 0, 1.2), camera)).toBeGreaterThan(300);
    expect(holds(spineFrom(0.4, -1.2, -0.9), camera)).toBeGreaterThan(300);
    // The tail runs under and behind the camera, crossing the near limit.
    expect(holds(spineFrom(0, 0.6), camera)).toBeGreaterThan(300);
    const side = followCamera();
    side.position.set(1.5, 0.9, -1.2);
    side.lookAt(-0.5, 0.2, 0.5);
    side.updateMatrixWorld();
    expect(holds(spineFrom(0, 0, 0.6), side)).toBeGreaterThan(300);
  });

  it('keeps few segments: a straight worm is one, a gently curving one a handful', () => {
    expect(fv.count).toBe(1);
    const curving = view(camera, spineFrom(0, 0, 0.5));
    expect(curving.count).toBeGreaterThan(1);
    expect(curving.count).toBeLessThan(10);
    // A tight curl keeps every segment it needs.
    expect(view(camera, spineFrom(0, 0, 1.6)).count).toBeGreaterThan(curving.count);
  });

  it('keeps only the part in view: the straight worm from the follow camera, a box round it', () => {
    const b = fv.box;
    // NDC spans 2 x 2: under 40% of the screen (V1's tighter hole, without the funnel, under a sixth).
    expect(((Math.min(b[2], 1) - Math.max(b[0], -1)) * (Math.min(b[3], 1) - Math.max(b[1], -1))) / 4).toBeLessThan(0.4);
    // Every kept end is in front, at OCC_NEAR or deeper, and box[4] is the farthest of them.
    let far = 0;
    for (let i = 0; i < fv.count * 2; i++) {
      expect(1 / fv.seg[i * 4 + 2]).toBeGreaterThanOrEqual(OCC_NEAR - 1e-6);
      far = Math.max(far, 1 / fv.seg[i * 4 + 2]);
    }
    expect(fv.box[4]).toBeCloseTo(far, 4);
  });

  it('keeps nothing when the worm is behind the camera or well off the side of the view', () => {
    for (const s of [spineFrom(0, -4), spineFrom(-12, 1)]) {
      const f = view(camera, s);
      expect(f.count).toBe(0);
      expect(Array.from(f.box)).toEqual([2, 2, -2, -2, 0]);
    }
  });
});

describe('the dither', () => {
  it('drops the asked share of pixels, from a pattern fixed in screen space', () => {
    let below = 0;
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) if (ign(x + 0.5, y + 0.5) < OCC_DROP) below++;
    expect(below / 128 / 128).toBeCloseTo(OCC_DROP, 2);
    expect(ign(10.5, 20.5)).toBe(ign(10.5, 20.5));
  });

  it('has a GLSL twin that skips pixels outside the box, then searches only its tile\'s segments', () => {
    expect(OCCLUDE_GLSL).toContain('bool fadedOut()');
    expect(OCCLUDE_GLSL).toContain('uniform vec4 uOccBox;');
    const fn = OCCLUDE_GLSL.slice(OCCLUDE_GLSL.indexOf('bool fadedOut()'));
    expect(fn.indexOf('return false;')).toBeLessThan(fn.indexOf('occTileRange(ndc)'));
    expect(fn.indexOf('occTileRange(ndc)')).toBeLessThan(fn.indexOf('occlusionIn(ndc'));
    expect(OCCLUSION_FN_GLSL).toContain('for (int i = max(lo, 0); i <= last; i++)');
    expect(OCCLUSION_FN_GLSL).toContain(`occlusionIn(t, dl, 0, ${OCC_SEGMENTS - 1})`);
    expect(OCCLUSION_FN_GLSL).toContain('mix(0.400000000, 0.600000000');
  });
});
