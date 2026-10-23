import * as THREE from 'three';
import { valueNoise2 } from '../core/noise';
import { Mesher } from './mesher';

type Paint = (u: number, v: number, p: THREE.Vector3, out: THREE.Color) => void;

/**
 * A tube swept along a smooth curve through `points` (vessels, nerves, ducts, the nephridial
 * coils). `radius(t)` gives the radius at t in [0, 1] along it; `caps` rounds both ends shut.
 * Frames are parallel-transported, so a tube that coils never twists.
 */
export function sweep(
  m: Mesher, points: THREE.Vector3[], radius: (t: number) => number, paint: Paint,
  opts: { radial?: number; per?: number; caps?: boolean; closed?: boolean } = {},
): void {
  // At a lighter level of detail the finest threads (capillaries, fine nerves, setae) are left
  // out: too thin to see at a lesson's distance.
  if (Mesher.detail < 1 && radius(0.5) < 0.06) return;
  const curve = new THREE.CatmullRomCurve3(points, !!opts.closed, 'centripetal');
  const len = curve.getLength();
  const per = opts.per ?? 0.12;
  const rows = Math.max(4, Math.min(600, Math.ceil(len / per)));
  const samples = rows * 2;
  const frames = curve.computeFrenetFrames(samples, !!opts.closed);
  const P: THREE.Vector3[] = [];
  for (let i = 0; i <= samples; i++) P.push(curve.getPointAt(i / samples));
  const cap = (t: number): number => {
    if (!opts.caps) return 1;
    const e = Math.min(0.5, (radius(0) + radius(1)) / 2 / Math.max(len, 1e-6) * 1.2);
    const a = Math.min(1, t / e, (1 - t) / e);
    return Math.sqrt(Math.max(0, 1 - (1 - a) * (1 - a)));
  };
  const at = (u: number, v: number, out: THREE.Vector3): void => {
    const f = u * samples;
    const i = Math.min(samples - 1, Math.floor(f));
    const k = f - i;
    const n = frames.normals[i];
    const b = frames.binormals[i];
    const ang = v * Math.PI * 2;
    const r = radius(u) * cap(u);
    out.lerpVectors(P[i], P[i + 1], k);
    out.addScaledVector(n, Math.cos(ang) * r).addScaledVector(b, Math.sin(ang) * r);
  };
  m.surface(rows, opts.radial ?? 8, at, paint, { wrapV: true });
}

/**
 * A lumpy blob (seminal vesicles, ganglia, the brain): an ellipsoid with radii `r` at `centre`,
 * pushed in and out by noise of `amp` (a fraction of the radius) at `freq` bumps round it.
 */
export function blob(
  m: Mesher, centre: THREE.Vector3, r: THREE.Vector3, paint: Paint,
  opts: { amp?: number; freq?: number; seed?: number; rows?: number; cols?: number; rot?: THREE.Euler; half?: 'far' | 'near'; capColor?: THREE.Color; capTo?: Mesher } = {},
): void {
  const amp = opts.amp ?? 0;
  const freq = opts.freq ?? 4;
  const seed = opts.seed ?? 1;
  const q = new THREE.Quaternion().setFromEuler(opts.rot ?? new THREE.Euler());
  // A half blob keeps z <= 0 (far) or z >= 0 (near), closed by a flat cut face at z = 0.
  const v0 = opts.half === 'far' ? 0.5 : 0;
  const vs = opts.half ? 0.5 : 1;
  const at = (u: number, v: number, out: THREE.Vector3): void => {
    const th = u * Math.PI;
    const ph = (v0 + v * vs) * Math.PI * 2;
    const s = Math.sin(th);
    // Noise sampled on a sphere-ish chart that wraps cleanly in v.
    const bump = amp
      ? (valueNoise2(v * freq * 2, u * freq, seed, freq * 2) - 0.5) * 2 * amp
        + (valueNoise2(v * freq * 4, u * freq * 2, seed + 7, freq * 4) - 0.5) * amp
      : 0;
    const k = 1 + bump * s;
    out.set(Math.cos(th) * r.x * k, s * Math.cos(ph) * r.y * k, s * Math.sin(ph) * r.z * k);
    out.applyQuaternion(q).add(centre);
  };
  m.surface(opts.rows ?? 16, opts.cols ?? 24, at, paint, { wrapV: !opts.half });
  if (opts.half) {
    const cap = opts.capColor ?? new THREE.Color('#d98a83');
    const edge = new THREE.Vector3();
    // Round the cut outline: one side of it is the v = 0 edge, the other the v = 1 edge.
    (opts.capTo ?? m).surface(4, (opts.rows ?? 16) * 2, (u, w, out) => {
      if (w < 0.5) at(2 * w, 0, edge);
      else at(2 - 2 * w, 1, edge);
      out.copy(centre).lerp(edge, u);
    }, (_u, _v, _p, o) => o.copy(cap));
  }
}

/** Points along a quadratic Bezier, for gently bent ducts and nerves. */
export function bend(a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, n = 8): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s = 1 - t;
    out.push(new THREE.Vector3(
      s * s * a.x + 2 * s * t * c.x + t * t * b.x,
      s * s * a.y + 2 * s * t * c.y + t * t * b.y,
      s * s * a.z + 2 * s * t * c.z + t * t * b.z,
    ));
  }
  return out;
}
