import { icosphere, MeshWriter } from '../surface/meshWriter';
import { rocks } from '../surface/propPlacement';
import { rockLump, rockLy, rockSeed } from '../surface/rockShape';
import { terrainHeight } from '../surface/terrain';
import { writeHeroLog } from '../surface/trunkGeometry';
import { slabU, type Slab } from './slab';

/**
 * Where the cut passes through a surface rock or the fallen log (V2 spec 5.2): the outline of the
 * drawn prop in the cut plane, so the section lines up with the rock or log seen behind the cut.
 * Each is the convex hull of where the plane slices the drawn mesh itself: propGeometry's
 * writeRock for a rock, trunkGeometry's writeHeroLog for the log (its broken ends and slanting cuts
 * included). tests/unit/sections.test.ts checks both against the drawn meshes. Pure; once per dig.
 */
export const MAX_SECTION_PTS = 40;
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

/** The log's section as an ellipse fitted to its outline's box: centre (u, v), half width and half height. rx 0: none. */
export interface LogCut { u: number; v: number; rx: number; ry: number }

export function createSection(): Section {
  return { rock: -1, count: 0, pts: new Float32Array(MAX_SECTION_PTS * 2), uLo: 0, uHi: 0, vLo: 0, vHi: 0 };
}

/** The hero log's drawn mesh (world positions and triangles), built once. */
let logMesh: { pos: Float64Array; idx: readonly number[] } | null = null;
function heroLogMesh(): { pos: Float64Array; idx: readonly number[] } {
  if (!logMesh) {
    const w = new MeshWriter('aBark', 4);
    writeHeroLog(w);
    logMesh = { pos: Float64Array.from(w.pos), idx: w.idx };
  }
  return logMesh;
}

// Scratch: a mesh's vertices in the plane (u, height, signed distance off it), and the crossings.
const ROCK_VERTS = 42;
const wp = new Float64Array(ROCK_VERTS * 3);
let vu = new Float64Array(0);
let vy = new Float64Array(0);
let vd = new Float64Array(0);
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
  for (let p = 0; p < pos.length; p += 3) {
    const lump = rockLump(pos[p], pos[p + 1], pos[p + 2], seed);
    const lx = pos[p] * k.size * lump * 1.15;
    const lz = pos[p + 2] * k.size * lump * 0.9;
    wp[p] = k.x + lx * c - lz * sn;
    wp[p + 1] = g - k.size * 0.18 + rockLy(pos[p + 1], k.size, lump);
    wp[p + 2] = k.z + lx * sn + lz * c;
  }
  cutMesh(s, wp, pos.length / 3, index);
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
  // Measured once (measureRock); small, so V8 inlines it (canDigAt asks every few steps).
  if (reach[i] === undefined) measureRock(i);
  return reach[i];
}

/** Measures rock `i`'s reach into the cache. */
function measureRock(i: number): void {
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

/** Where the plane slices the triangles of a mesh (world positions `pos`): every edge crossing into (cu, cv). */
function cutMesh(s: Slab, pos: ArrayLike<number>, verts: number, index: ArrayLike<number>): void {
  if (vd.length < verts) {
    vu = new Float64Array(verts);
    vy = new Float64Array(verts);
    vd = new Float64Array(verts);
  }
  for (let j = 0; j < verts; j++) {
    const x = pos[j * 3];
    const z = pos[j * 3 + 2];
    vd[j] = (x - s.ox) * s.nx + (z - s.oz) * s.nz;
    vu[j] = slabU(s, x, z);
    vy[j] = pos[j * 3 + 1];
  }
  cu.length = 0;
  cv.length = 0;
  for (let t = 0; t < index.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = index[t + e];
      const b = index[t + (e === 2 ? 0 : e + 1)];
      if (vd[a] < 0 === vd[b] < 0) continue;
      const f = vd[a] / (vd[a] - vd[b]);
      cu.push(vu[a] + (vu[b] - vu[a]) * f);
      cv.push(vy[a] + (vy[b] - vy[a]) * f);
    }
  }
}

/**
 * Where the cut passes through the fallen log: its outline into `out` (the hull of the drawn log's
 * section, broken ends and all) and, for drawing its rings, the box-fitted ellipse into `cut`
 * (rx 0: none). False when the cut misses the log, or meets it only beyond the drawn face.
 */
export function logSection(s: Slab, cut: LogCut, out: Section): boolean {
  cut.rx = 0;
  const { pos, idx } = heroLogMesh();
  cutMesh(s, pos, pos.length / 3, idx);
  out.rock = -1;
  if (!hull(out) || out.uHi < s.faceLo || out.uLo > s.faceHi) return false;
  cut.u = (out.uLo + out.uHi) / 2;
  cut.v = (out.vLo + out.vHi) / 2;
  cut.rx = (out.uHi - out.uLo) / 2;
  cut.ry = (out.vHi - out.vLo) / 2;
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
