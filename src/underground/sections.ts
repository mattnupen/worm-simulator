import { icosphere } from '../surface/meshWriter';
import { heroLog, rocks } from '../surface/propPlacement';
import { rockLump, rockLy, rockSeed } from '../surface/rockShape';
import { terrainHeight } from '../surface/terrain';
import { slabU, type Slab } from './slab';

/**
 * Where the cut passes through a surface rock or the fallen log (V2 spec 5.2): the outline of the
 * drawn prop in the cut plane, so the section lines up with the rock or log seen behind the cut.
 * A rock's is the section of propGeometry's writeRock mesh itself (its convex hull); the log's
 * follows writeLog's rings (radius and centre height, linear between rings) where the cut crosses
 * it. tests/unit/sections.test.ts checks both against the drawn meshes. Pure; once per dig.
 */
export const MAX_SECTION_PTS = 40;
/** Points on the log's outline, which sits just outside the round log (its edges touch it). */
const LOG_PTS = 36;
const LOG_OUT = 1 / Math.cos(Math.PI / LOG_PTS);
/** writeLog's ring count, and the seed groundProps.ts draws the hero log with. */
const LOG_RINGS = 11;
const LOG_SEED = 1.62;
const TAU = Math.PI * 2;

export interface Section {
  /** The rock's index in rocks() (its drawn seed and colour: rockSeed), or -1 for the log. */
  rock: number;
  /** Outline points as (u, v) pairs: convex, counter-clockwise. */
  count: number;
  readonly pts: Float32Array;
  /** Its bounding box. */
  uLo: number;
  uHi: number;
  vLo: number;
  vHi: number;
}

/** The log's section as an ellipse (its middle, unsheared): centre (u, v), radii along the cut and up. rx 0: none. */
export interface LogCut { u: number; v: number; rx: number; ry: number }

export function createSection(): Section {
  return { rock: -1, count: 0, pts: new Float32Array(MAX_SECTION_PTS * 2), uLo: 0, uHi: 0, vLo: 0, vHi: 0 };
}

// Scratch, sized for the icosphere (42 vertices) and every edge crossing of its 80 triangles.
const vu = new Float64Array(64);
const vy = new Float64Array(64);
const vd = new Float64Array(64);
const cu: number[] = [];
const cv: number[] = [];
const order: number[] = [];
const chain: number[] = [];

/**
 * The section of rock `i` (rocks()[i], drawn by writeRock with rockSeed(i)) into `out`, exactly as
 * the cut plane slices its mesh. False when the cut misses it.
 */
export function rockSection(s: Slab, i: number, out: Section): boolean {
  const k = rocks()[i];
  const reach = k.size * 1.15 * 1.3;
  const dn = (k.x - s.ox) * s.nx + (k.z - s.oz) * s.nz;
  if (Math.abs(dn) >= reach) return false;
  const um = slabU(s, k.x, k.z);
  if (um + reach < s.faceLo || um - reach > s.faceHi) return false;
  // writeRock's vertices.
  const { pos, index } = icosphere();
  const seed = rockSeed(i);
  const g = terrainHeight(k.x, k.z);
  const c = Math.cos(seed * TAU);
  const sn = Math.sin(seed * TAU);
  for (let j = 0, p = 0; p < pos.length; j++, p += 3) {
    const lump = rockLump(pos[p], pos[p + 1], pos[p + 2], seed);
    const lx = pos[p] * k.size * lump * 1.15;
    const lz = pos[p + 2] * k.size * lump * 0.9;
    const x = k.x + lx * c - lz * sn;
    const z = k.z + lx * sn + lz * c;
    vd[j] = (x - s.ox) * s.nx + (z - s.oz) * s.nz;
    vu[j] = slabU(s, x, z);
    vy[j] = g - k.size * 0.18 + rockLy(pos[p + 1], k.size, lump);
  }
  cu.length = 0;
  cv.length = 0;
  for (let t = 0; t < index.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = index[t + e];
      const b = index[t + ((e + 1) % 3)];
      if (vd[a] < 0 === vd[b] < 0) continue;
      const f = vd[a] / (vd[a] - vd[b]);
      cu.push(vu[a] + (vu[b] - vu[a]) * f);
      cv.push(vy[a] + (vy[b] - vy[a]) * f);
    }
  }
  out.rock = i;
  return hull(out);
}

const reach: number[] = [];

/**
 * How far rock `i` reaches from its centre as drawn, at any height. Below the ground it bulges
 * wider than its footprint (ROCK_FOOT), so where the worm may dig must keep off this, or the
 * rock's section could stand in the way down (Task 4's canDigAt).
 */
export function rockReach(i: number): number {
  if (reach[i] === undefined) {
    const k = rocks()[i];
    const seed = rockSeed(i);
    const { pos } = icosphere();
    let most = 0;
    for (let p = 0; p < pos.length; p += 3) {
      const lump = rockLump(pos[p], pos[p + 1], pos[p + 2], seed);
      most = Math.max(most, Math.hypot(pos[p] * k.size * lump * 1.15, pos[p + 2] * k.size * lump * 0.9));
    }
    reach[i] = most;
  }
  return reach[i];
}

/** writeLog's ring `i`: its radius and its centre's height. */
function ringRadius(i: number, radius: number): number {
  const f = i / (LOG_RINGS - 1);
  return radius * (1.06 - 0.12 * f) * (1 + 0.08 * Math.sin(f * 9 + LOG_SEED * 5));
}
function ringHeight(i: number, log: ReturnType<typeof heroLog>, dx: number, dz: number): number {
  const along = (i / (LOG_RINGS - 1) - 0.5) * log.length;
  return terrainHeight(log.x + dx * along, log.z + dz * along) + log.radius * 0.55;
}

/** The log's radius and centre height at `a` along its axis from its middle, as drawn (linear between rings). */
function logAt(a: number, log: ReturnType<typeof heroLog>, dx: number, dz: number, out: { r: number; y: number }): void {
  const fi = Math.max(0, Math.min(LOG_RINGS - 1, (a / log.length + 0.5) * (LOG_RINGS - 1)));
  const i = Math.min(LOG_RINGS - 2, Math.floor(fi));
  const t = fi - i;
  out.r = ringRadius(i, log.radius) * (1 - t) + ringRadius(i + 1, log.radius) * t;
  out.y = ringHeight(i, log, dx, dz) * (1 - t) + ringHeight(i + 1, log, dx, dz) * t;
}

const at = { r: 0, y: 0 };

/**
 * Where the cut crosses the fallen log (between its broken ends): its section ellipse into `cut`
 * (rx 0: none) and its outline into `out`, which follows the drawn log's radius and height along
 * the stretch of log the cut slants through. False when the cut misses it.
 */
export function logSection(s: Slab, cut: LogCut, out: Section): boolean {
  cut.rx = 0;
  const log = heroLog();
  const dx = Math.cos(log.yaw);
  const dz = Math.sin(log.yaw);
  const sin = dx * s.tz - dz * s.tx;
  if (Math.abs(sin) < 1e-3) return false;
  // o + u t = log + a d, solved for u (along the cut) and a (along the log).
  const px = log.x - s.ox;
  const pz = log.z - s.oz;
  const u = (px * dz - pz * dx) / -sin;
  const a = -(px * s.tz - pz * s.tx) / sin;
  if (Math.abs(a) > log.length / 2) return false;
  logAt(a, log, dx, dz, at);
  const rx = at.r / Math.abs(sin);
  if (u + rx < s.faceLo || u - rx > s.faceHi) return false;
  cut.u = u;
  cut.v = at.y;
  cut.rx = rx;
  cut.ry = at.r;
  // Moving du along the cut moves du * (t . d) along the log.
  const cos = s.tx * dx + s.tz * dz;
  out.rock = -1;
  out.count = LOG_PTS;
  for (let k = 0; k < LOG_PTS; k++) {
    const phi = (k / LOG_PTS) * TAU;
    const du = rx * Math.cos(phi);
    logAt(a + du * cos, log, dx, dz, at);
    out.pts[k * 2] = u + ((at.r * LOG_OUT) / Math.abs(sin)) * Math.cos(phi);
    out.pts[k * 2 + 1] = at.y + at.r * LOG_OUT * Math.sin(phi);
  }
  bounds(out);
  return true;
}

/** The convex hull of the crossing points (cu, cv) into `out`, counter-clockwise; false if degenerate. */
function hull(out: Section): boolean {
  const n = cu.length;
  if (n < 3) return false;
  order.length = 0;
  for (let i = 0; i < n; i++) order.push(i);
  order.sort((p, q) => cu[p] - cu[q] || cv[p] - cv[q]);
  // Andrew's monotone chain: lower hull left to right, then upper hull back.
  chain.length = 0;
  const turn = (o: number, p: number, q: number) => (cu[p] - cu[o]) * (cv[q] - cv[o]) - (cv[p] - cv[o]) * (cu[q] - cu[o]);
  for (let pass = 0; pass < 2; pass++) {
    const base = chain.length;
    for (let j = 0; j < n; j++) {
      const i = order[pass === 0 ? j : n - 1 - j];
      while (chain.length >= base + 2 && turn(chain[chain.length - 2], chain[chain.length - 1], i) <= 1e-12) chain.pop();
      chain.push(i);
    }
    chain.pop();
  }
  if (chain.length < 3 || chain.length > MAX_SECTION_PTS) return false;
  out.count = chain.length;
  for (let k = 0; k < chain.length; k++) {
    out.pts[k * 2] = cu[chain[k]];
    out.pts[k * 2 + 1] = cv[chain[k]];
  }
  bounds(out);
  return true;
}

function bounds(out: Section): void {
  out.uLo = Infinity;
  out.uHi = -Infinity;
  out.vLo = Infinity;
  out.vHi = -Infinity;
  for (let k = 0; k < out.count; k++) {
    const u = out.pts[k * 2];
    const v = out.pts[k * 2 + 1];
    if (u < out.uLo) out.uLo = u;
    if (u > out.uHi) out.uHi = u;
    if (v < out.vLo) out.vLo = v;
    if (v > out.vHi) out.vHi = v;
  }
}
