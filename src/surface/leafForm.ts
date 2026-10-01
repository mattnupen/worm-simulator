import type { Vec3 } from '../core/vec';

/**
 * Gentle 3D form for a flat leaf silhouette, in leaf units (the leaf is ~1 across):
 * - fold: a V crease along the midrib (x = 0), edges rising by `fold` per unit across;
 * - cup:  the blade dishing up toward its sides (quadratic across);
 * - curl: tip and base curling up (quadratic along).
 * Local axes: u across (+x), v along the midrib (tip at +v), lift up (+y). Pure.
 */
export interface LeafForm { fold: number; cup: number; curl: number }

/** Height of the leaf surface above its base plane at leaf-local (u, v). Never negative. */
export function leafLift(u: number, v: number, f: LeafForm): number {
  return f.fold * Math.abs(u) + f.cup * u * u + f.curl * v * v;
}

/**
 * Unit surface normal at (u, v) in the local frame where the leaf is laid out as
 * (x = u, y = lift, z = -v). On the midrib the fold's two slopes average out to level.
 */
export function leafNormal(u: number, v: number, f: LeafForm, out: Vec3): Vec3 {
  const du = f.fold * Math.sign(u) + 2 * f.cup * u;
  const dv = 2 * f.curl * v;
  // Surface (u, h(u, v), -v): tangents (1, du, 0) and (0, dv, -1); their cross is (-du, 1, dv).
  const nx = -du;
  const ny = 1;
  const nz = dv;
  const len = Math.hypot(nx, ny, nz);
  out.x = nx / len;
  out.y = ny / len;
  out.z = nz / len;
  return out;
}
