import * as THREE from 'three';

/**
 * Bends the straight model (built along +x) into a pose. A pose turns the body's heading in the
 * ground plane as it goes back (`heading(x)`, radians) and lifts it (`lift(x)`); each cross-section
 * keeps its shape and turns with the heading, so organs stay inside the body.
 */
export interface Pose {
  heading: (x: number) => number;
  lift?: (x: number) => number;
}

export const STRAIGHT: Pose = { heading: () => 0 };

/** A relaxed S, like a worm lying on soil (the outside view). */
export const RESTING: Pose = {
  heading: (x) => 0.5 * Math.sin(x / 34 + 0.35) - 0.12 * Math.sin(x / 9),
};

const STEP = 0.25;

/** The posed centre line: maps a straight-model point to its posed place (and turns normals). */
export class PoseMap {
  private readonly x0: number;
  private readonly cx: Float64Array;
  private readonly cz: Float64Array;
  private readonly ang: Float64Array;

  constructor(private readonly pose: Pose, x0 = -3, x1 = 260) {
    this.x0 = x0;
    const n = Math.ceil((x1 - x0) / STEP) + 2;
    this.cx = new Float64Array(n);
    this.cz = new Float64Array(n);
    this.ang = new Float64Array(n);
    this.ang[0] = pose.heading(x0);
    this.cx[0] = x0;
    for (let i = 1; i < n; i++) {
      const x = x0 + i * STEP;
      const a = pose.heading(x - STEP / 2);
      this.cx[i] = this.cx[i - 1] + Math.cos(a) * STEP;
      this.cz[i] = this.cz[i - 1] + Math.sin(a) * STEP;
      this.ang[i] = pose.heading(x);
    }
  }

  /** Writes the posed position of straight point (x, y, z) into out[o..o+2], and the turn angle's cos/sin. */
  map(x: number, y: number, z: number, out: Float32Array | number[], o: number): [number, number] {
    const n = this.cx.length;
    const f = (x - this.x0) / STEP;
    const k = Math.min(n - 2, Math.max(0, Math.floor(f)));
    const t = f - k;
    const px = this.cx[k] + (this.cx[k + 1] - this.cx[k]) * t;
    const pz = this.cz[k] + (this.cz[k + 1] - this.cz[k]) * t;
    const a = this.ang[k] + (this.ang[k + 1] - this.ang[k]) * t;
    const c = Math.cos(a);
    const s = Math.sin(a);
    // The section's own z axis turns with the heading: local (0, 0, 1) -> (-sin, 0, cos).
    out[o] = px - s * z;
    out[o + 1] = y + (this.pose.lift ? this.pose.lift(x) : 0);
    out[o + 2] = pz + c * z;
    return [c, s];
  }

  point(p: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    const a = [0, 0, 0];
    this.map(p.x, p.y, p.z, a, 0);
    return out.set(a[0], a[1], a[2]);
  }
}

export function applyPose(g: THREE.BufferGeometry, map: PoseMap): void {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  if (!g.userData.basePos) {
    g.userData.basePos = (pos.array as Float32Array).slice();
    g.userData.baseNor = (nor.array as Float32Array).slice();
  }
  const bp = g.userData.basePos as Float32Array;
  const bn = g.userData.baseNor as Float32Array;
  const p = pos.array as Float32Array;
  const q = nor.array as Float32Array;
  for (let i = 0; i < bp.length; i += 3) {
    const [c, s] = map.map(bp[i], bp[i + 1], bp[i + 2], p, i);
    const nx = bn[i];
    const nz = bn[i + 2];
    q[i] = c * nx - s * nz;
    q[i + 1] = bn[i + 1];
    q[i + 2] = s * nx + c * nz;
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
  g.computeBoundingSphere();
}
