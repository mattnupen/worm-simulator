import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Robin } from '../../src/predators/robin';
import { DEMO_SECONDS, demoPose } from '../../src/predators/robinDemo';
import { UNITS_PER_CM } from '../../src/surface/realScale';

const flat = (): number => 0;

/** World-space bounds of the robin's drawn vertices (hidden parts collapse to the origin; skip them). */
function bounds(r: Robin): THREE.Box3 {
  const pos = r.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (v.lengthSq() > 0) box.expandByPoint(v);
  }
  return box;
}

describe('robin model', () => {
  it('stays small enough to rewrite every frame', () => {
    expect(new Robin().vertexCount).toBeLessThan(8000);
  });

  it('stands on the ground at real size: about 21 cm long as it stands (25 cm laid out) and 14 cm tall', () => {
    const r = new Robin();
    Object.assign(r.pose, { x: 5, y: 2, z: -3, visible: true });
    r.update();
    const b = bounds(r);
    const cm = (u: number): number => u / UNITS_PER_CM;
    expect(cm(b.min.y - 2)).toBeGreaterThan(-0.2);
    expect(cm(b.min.y - 2)).toBeLessThan(0.5);
    expect(cm(b.max.z - b.min.z)).toBeGreaterThan(18);
    expect(cm(b.max.z - b.min.z)).toBeLessThan(26);
    expect(cm(b.max.y - b.min.y)).toBeGreaterThan(11);
    expect(cm(b.max.y - b.min.y)).toBeLessThan(17);
  });

  it('every moment of the preview loop poses cleanly: no NaN, never below the ground', () => {
    const r = new Robin();
    for (let t = 0; t < DEMO_SECONDS; t += 0.05) {
      demoPose(t, 0, 0, 0.7, 9, flat, r.pose);
      r.update();
      if (!r.pose.visible) continue;
      const pos = r.mesh.geometry.getAttribute('position').array as Float32Array;
      const nor = r.mesh.geometry.getAttribute('normal').array as Float32Array;
      expect(pos.every(Number.isFinite), `position at ${t}`).toBe(true);
      expect(nor.every(Number.isFinite), `normal at ${t}`).toBe(true);
      expect(bounds(r).min.y, `ground at ${t}`).toBeGreaterThan(-0.6 * UNITS_PER_CM);
    }
  });

  it('hides its mesh when the pose is hidden', () => {
    const r = new Robin();
    r.pose.visible = false;
    r.update();
    expect(r.mesh.visible).toBe(false);
  });
});
