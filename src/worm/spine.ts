/**
 * Pure spine helpers: a Catmull-Rom curve through the worm's segment points, sampled by arc
 * length, and parallel-transport (rotation-minimizing) frames along it. Everything writes
 * into preallocated typed arrays so the per-frame path allocates nothing.
 */

const EPS = 1e-6;

/** Uniform Catmull-Rom on one axis; passes through p1 at t = 0 and p2 at t = 1. */
export function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  return 0.5 * (
    2 * p1
    + (p2 - p0) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
    + (3 * p1 - p0 - 3 * p2 + p3) * t2 * t
  );
}

export interface Spine {
  readonly controls: number;
  readonly sub: number;
  /** Dense samples along the curve, xyz packed. */
  readonly pts: Float32Array;
  /** Cumulative arc length at each sample. */
  readonly cum: Float32Array;
  length: number;
}

export function createSpine(controls: number, sub = 4): Spine {
  const samples = (controls - 1) * sub + 1;
  return { controls, sub, pts: new Float32Array(samples * 3), cum: new Float32Array(samples), length: 0 };
}

/** Fits the curve through `ctrl` (xyz packed, `sp.controls` points) and measures it. */
export function fitSpine(sp: Spine, ctrl: ArrayLike<number>): void {
  const n = sp.controls;
  const { pts, cum, sub } = sp;
  let k = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < sub; j++, k++) {
      const t = j / sub;
      for (let a = 0; a < 3; a++) {
        const p1 = ctrl[i * 3 + a];
        const p2 = ctrl[(i + 1) * 3 + a];
        // Phantom end points mirror the neighbour, so the ends get a natural tangent.
        const p0 = i > 0 ? ctrl[(i - 1) * 3 + a] : 2 * p1 - p2;
        const p3 = i < n - 2 ? ctrl[(i + 2) * 3 + a] : 2 * p2 - p1;
        pts[k * 3 + a] = catmullRom(p0, p1, p2, p3, t);
      }
    }
  }
  for (let a = 0; a < 3; a++) pts[k * 3 + a] = ctrl[(n - 1) * 3 + a];
  cum[0] = 0;
  const count = cum.length;
  for (let s = 1; s < count; s++) {
    const dx = pts[s * 3] - pts[s * 3 - 3];
    const dy = pts[s * 3 + 1] - pts[s * 3 - 2];
    const dz = pts[s * 3 + 2] - pts[s * 3 - 1];
    cum[s] = cum[s - 1] + Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  sp.length = cum[count - 1];
}

/** Writes the end direction (unit, pointing outward past the end) into out[o..o+2]. */
function endDirection(sp: Spine, atTail: boolean, out: Float32Array, o: number): void {
  const { pts, cum } = sp;
  const last = cum.length - 1;
  for (let step = 1; step <= last; step++) {
    const a = atTail ? last - step : step;
    const b = atTail ? last : 0;
    const d = Math.abs(cum[b] - cum[a]);
    if (d > EPS) {
      out[o] = (pts[b * 3] - pts[a * 3]) / d;
      out[o + 1] = (pts[b * 3 + 1] - pts[a * 3 + 1]) / d;
      out[o + 2] = (pts[b * 3 + 2] - pts[a * 3 + 2]) / d;
      return;
    }
  }
  out[o] = 0;
  out[o + 1] = 0;
  out[o + 2] = atTail ? -1 : 1;
}

const dir = new Float32Array(3);

/**
 * Point at arc length `s` from the first control point, written to out[o..o+2].
 * Beyond either end it continues straight along the end tangent (room for the end caps).
 */
export function sampleSpine(sp: Spine, s: number, out: Float32Array, o: number): void {
  const { pts, cum } = sp;
  const last = cum.length - 1;
  if (s <= 0 || s >= sp.length) {
    const tail = s > 0;
    const i = tail ? last : 0;
    const d = tail ? s - sp.length : -s;
    endDirection(sp, tail, dir, 0);
    out[o] = pts[i * 3] + dir[0] * d;
    out[o + 1] = pts[i * 3 + 1] + dir[1] * d;
    out[o + 2] = pts[i * 3 + 2] + dir[2] * d;
    return;
  }
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const span = cum[hi] - cum[lo];
  const f = span > EPS ? (s - cum[lo]) / span : 0;
  for (let a = 0; a < 3; a++) out[o + a] = pts[lo * 3 + a] + (pts[hi * 3 + a] - pts[lo * 3 + a]) * f;
}

function normalizeAt(v: Float32Array, i: number): number {
  const l = Math.hypot(v[i], v[i + 1], v[i + 2]);
  if (l > EPS) {
    v[i] /= l;
    v[i + 1] /= l;
    v[i + 2] /= l;
  }
  return l;
}

/** c = a x b on packed arrays. */
function cross(a: Float32Array, ia: number, b: Float32Array, ib: number, c: Float32Array, ic: number): void {
  const x = a[ia + 1] * b[ib + 2] - a[ia + 2] * b[ib + 1];
  const y = a[ia + 2] * b[ib] - a[ia] * b[ib + 2];
  const z = a[ia] * b[ib + 1] - a[ia + 1] * b[ib];
  c[ic] = x;
  c[ic + 1] = y;
  c[ic + 2] = z;
}

/**
 * Parallel-transport frames for `n` points (xyz packed). T runs along increasing index;
 * N starts as `up` made perpendicular to the first tangent, then is carried along with the
 * least rotation, so the tube never twists or flips. B = T x N. Coincident or collinear
 * points reuse the neighbouring tangent, so the output is always finite and orthonormal.
 */
export function transportFrames(
  pos: Float32Array, n: number, T: Float32Array, N: Float32Array, B: Float32Array,
  upX = 0, upY = 1, upZ = 0,
): void {
  let firstValid = -1;
  for (let i = 0; i < n; i++) {
    const a = (i > 0 ? i - 1 : 0) * 3;
    const b = (i < n - 1 ? i + 1 : n - 1) * 3;
    const o = i * 3;
    T[o] = pos[b] - pos[a];
    T[o + 1] = pos[b + 1] - pos[a + 1];
    T[o + 2] = pos[b + 2] - pos[a + 2];
    if (normalizeAt(T, o) > EPS) {
      if (firstValid < 0) firstValid = i;
    } else if (i > 0 && firstValid >= 0) {
      T[o] = T[o - 3];
      T[o + 1] = T[o - 2];
      T[o + 2] = T[o - 1];
    } else {
      T[o] = NaN; // filled below from the first valid tangent
    }
  }
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    if (!Number.isNaN(T[o])) continue;
    const src = firstValid >= 0 ? firstValid * 3 : -1;
    T[o] = src >= 0 ? T[src] : 0;
    T[o + 1] = src >= 0 ? T[src + 1] : 0;
    T[o + 2] = src >= 0 ? T[src + 2] : 1;
  }

  // First normal: up, made perpendicular to T. If T is (nearly) vertical, use the axis least
  // aligned with it instead.
  const d0 = upX * T[0] + upY * T[1] + upZ * T[2];
  N[0] = upX - d0 * T[0];
  N[1] = upY - d0 * T[1];
  N[2] = upZ - d0 * T[2];
  if (normalizeAt(N, 0) < 1e-3) {
    const ax = Math.abs(T[0]) < 0.6 ? 1 : 0;
    const az = ax ? 0 : 1;
    const d = ax * T[0] + az * T[2];
    N[0] = ax - d * T[0];
    N[1] = -d * T[1];
    N[2] = az - d * T[2];
    normalizeAt(N, 0);
  }
  cross(T, 0, N, 0, B, 0);
  normalizeAt(B, 0);

  for (let i = 1; i < n; i++) {
    const o = i * 3;
    const p = o - 3;
    const d = N[p] * T[o] + N[p + 1] * T[o + 1] + N[p + 2] * T[o + 2];
    N[o] = N[p] - d * T[o];
    N[o + 1] = N[p + 1] - d * T[o + 1];
    N[o + 2] = N[p + 2] - d * T[o + 2];
    if (normalizeAt(N, o) < 1e-3) {
      // The tangent swung onto the old normal: carry the binormal instead.
      cross(B, p, T, o, N, o);
      normalizeAt(N, o);
    }
    cross(T, o, N, o, B, o);
    normalizeAt(B, o);
  }
}
