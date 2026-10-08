import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { clipBeyond, offCut } from '../../src/underground/cutClip';
import { createSlab, slabX, slabZ, type Slab } from '../../src/underground/slab';
import { cutPose, frameTarget, CUT_MARGIN, FOV_DEG, type CutFrame, type CutPose } from '../../src/underground/cutCamera';

const frame: CutFrame = { cu: 0, cv: 0, h: 0, pitch: 0 };
const pose: CutPose = { px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0 };

/** A camera as main.ts makes it, at `eye` looking at `at`, its own projection current. */
function camera(eye: THREE.Vector3, at: THREE.Vector3, aspect = 16 / 9): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(FOV_DEG, aspect, 0.2, 120);
  c.position.copy(eye);
  c.lookAt(at);
  c.updateMatrixWorld();
  c.updateProjectionMatrix();
  return c;
}

/** Where the point `off` in front of the cut at (u, y) lands in clip space: NDC x, y, z, and w. */
function ndc(c: THREE.PerspectiveCamera, s: Slab, u: number, y: number, off: number): THREE.Vector4 {
  const p = new THREE.Vector4(slabX(s, u) + s.nx * off, y, slabZ(s, u) + s.nz * off, 1);
  p.applyMatrix4(c.matrixWorldInverse).applyMatrix4(c.projectionMatrix);
  return new THREE.Vector4(p.x / p.w, p.y / p.w, p.z / p.w, p.w);
}
const drawn = (v: THREE.Vector4) => v.w > 0 && v.z >= -1 && v.z <= 1;

describe('the forest in front of the cut is cut away along the cut (cutClip.ts)', () => {
  const s = createSlab(0, 0, 0.7, 1, 2);
  // The cut camera (Wide), and a camera looking at the cut at a slant (40 degrees off square) from
  // over the leaves, as mid-swing.
  frameTarget('wide', s, 0, -2, 0, -1, 16 / 9, frame);
  cutPose(s, frame.cu, frame.cv, frame.h, frame.pitch, pose);
  const at = new THREE.Vector3(pose.lx, pose.ly, pose.lz);
  const square = new THREE.Vector3(pose.px, pose.py, pose.pz);
  const yaw = (40 * Math.PI) / 180;
  const slant = new THREE.Vector3(
    pose.lx + 5 * (s.nx * Math.cos(yaw) + s.tx * Math.sin(yaw)), s.topMax + 1.2, pose.lz + 5 * (s.nz * Math.cos(yaw) + s.tz * Math.sin(yaw)),
  );

  for (const [name, eye] of [['square', square], ['slanting', slant]] as const) {
    it(`${name}: the cut and all behind it are drawn, anything more than the margin in front is not`, () => {
      const c = camera(eye, at);
      const before = c.projectionMatrix.clone();
      expect(clipBeyond(c, s, CUT_MARGIN)).toBe(true);
      let onScreen = 0;
      let cutAway = 0;
      for (let u = -8; u <= 8; u += 0.5) {
        for (let y = s.bottom; y <= s.topMax + 4; y += 0.25) {
          const on = ndc(c, s, u, y, 0);
          if (Math.abs(on.x) > 1 || Math.abs(on.y) > 1 || on.w <= 0) continue;
          onScreen++;
          // On the cut and just in front of it (the worm stands 0.13 out of it): drawn.
          expect(drawn(on)).toBe(true);
          expect(drawn(ndc(c, s, u, y, CUT_MARGIN - 0.05))).toBe(true);
          // Behind it, to the far forest: drawn.
          for (const back of [-1, -10, -40]) expect(drawn(ndc(c, s, u, y, back))).toBe(true);
          // In front of the margin, between the camera and the cut: not drawn.
          for (const k of [0.1, 0.4, 0.8]) {
            const front = ndc(c, s, u, y, CUT_MARGIN + 0.02 + k * (offCut(s, eye) - CUT_MARGIN));
            if (front.w > 0) {
              expect(drawn(front)).toBe(false);
              cutAway++;
            }
          }
        }
      }
      expect(onScreen).toBeGreaterThan(100);
      expect(cutAway).toBeGreaterThan(100);
      // Only the depth row changes: where a point lands on screen (and its view depth, w) is as
      // before; the inverse is kept with it.
      const e0 = before.elements;
      const e1 = c.projectionMatrix.elements;
      for (const i of [0, 1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15]) expect(e1[i]).toBe(e0[i]);
      const id = c.projectionMatrixInverse.clone().multiply(c.projectionMatrix).elements;
      id.forEach((v, i) => expect(v).toBeCloseTo(i % 5 === 0 ? 1 : 0, 6));
    });
  }

  it('leaves the projection alone while the camera is no further than that in front of the cut', () => {
    const c = camera(new THREE.Vector3(slabX(s, 0) + s.nx * 0.4, 1, slabZ(s, 0) + s.nz * 0.4), at);
    const before = c.projectionMatrix.clone();
    expect(clipBeyond(c, s, 0.5)).toBe(false);
    expect(c.projectionMatrix.equals(before)).toBe(true);
  });
});
