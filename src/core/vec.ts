export interface Vec2 { x: number; y: number }
export interface Vec3 { x: number; y: number; z: number }

export function dist3(a: Vec3, b: Vec3): number {
  return hypot3(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** `n` points at the origin. */
export function vec3s(n: number): Vec3[] {
  return Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0 }));
}

/** Copies src into dst. */
export function copy3(dst: Vec3, src: Vec3): void {
  dst.x = src.x;
  dst.y = src.y;
  dst.z = src.z;
}

/**
 * Math.hypot of two or three numbers, bit for bit, without its garbage. V8's builtin allocates an
 * array of the arguments' sizes and boxes its result on every call (about 50 bytes), so a step that
 * calls it dozens of times leaves kilobytes for the garbage collector (visual-quality brief: no
 * per-step allocation). These follow V8's own algorithm (math.tq MathHypot): each size scaled by
 * the largest, squared and summed in order with Kahan compensation, the root scaled back; an
 * infinite argument wins over NaN, then NaN, then 0. Kept small so V8 inlines them.
 * tests/unit/hypot.test.ts checks them against Math.hypot on edge cases and random values.
 */
export function hypot2(a: number, b: number): number {
  const x = Math.abs(a);
  const y = Math.abs(b);
  const m = Math.max(x, y);
  // m is 0, infinite or NaN: an infinite argument wins over NaN. (No call here: a path that
  // returned a call's result would box the fast path's number too.)
  if (!(m > 0 && m < Infinity)) return x === Infinity || y === Infinity ? Infinity : m;
  const p = x / m;
  const q = y / m;
  return Math.sqrt(p * p + q * q) * m;
}

export function hypot3(a: number, b: number, c: number): number {
  const x = Math.abs(a);
  const y = Math.abs(b);
  const z = Math.abs(c);
  const m = Math.max(x, y, z);
  if (!(m > 0 && m < Infinity)) return x === Infinity || y === Infinity || z === Infinity ? Infinity : m;
  const p = (x / m) * (x / m);
  const q = (y / m) * (y / m);
  const r = (z / m) * (z / m);
  const s = p + q;
  return Math.sqrt(s + (r - (s - p - q))) * m;
}
