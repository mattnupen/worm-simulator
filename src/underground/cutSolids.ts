import { mulberry32 } from '../core/random';
import { PROP } from '../surface/propGeometry';
import { BURIED_STRIDE, DOT_STRIDE, ROOT_STRIDE, STONE_STRIDE, type Solids } from './solids';
import { buriedAt, wallDepth, BURY_STEPS, WALL_RUN } from './rootEnds';
import { writeBlob, writeTube, type Pen } from './cutShapes';
import { writeFill } from './cutSections';

/**
 * The cut's stones and big roots, drawn exactly where they block (V2 spec 5.2): where each meets
 * the face its outline is its collision capsule's, within about 0.02 u (tests/unit/cutSolids.test.ts),
 * so the worm never overlaps a root or stops short of one. Build-time only (once per dig).
 */

/** Glacial-till stones, from pale granite to dark greenstone; damp, so a little dark. */
const STONE_HEX = ['#9a9286', '#ab9d8e', '#7e7a72', '#a39484', '#6e7068'];
/** The most a drawn outline wanders off its capsule (lumps, knobs). */
const ROUGH = 0.012;

/** Each stone half sunk in the face: its outline there is its capsule, lit from above, damp and dark underneath. */
export function writeStones(p: Pen, o: Solids): void {
  for (let i = 0; i < o.stoneCount; i++) {
    const k = i * STONE_STRIDE;
    const [u, v, r, sx, sy, rot, shade] = o.stones.subarray(k, k + STONE_STRIDE);
    const hex = STONE_HEX[Math.floor(shade * STONE_HEX.length) % STONE_HEX.length];
    // The capsule (solids.ts placeStones): along the long axis, as thick as the short one.
    const wide = sx >= sy;
    const axis = wide ? rot : rot + Math.PI / 2;
    const rr = r * Math.min(sx, sy);
    const sr = Math.sin(axis);
    const cr = Math.cos(axis);
    writeBlob(p, u, v, 0, rr, rr, Math.min(0.55 * r, 0.25), axis, {
      hex: () => hex,
      mul: (x, y, z) => (0.86 + 0.28 * Math.sin(x * 23 + i) * Math.sin(y * 19 - z * 17)) * (0.75 + 0.5 * Math.max(-0.5, x * sr + y * cr)),
      code: PROP.plain, face: 0.6, lump: Math.min(0.06, (ROUGH * 0.6) / rr), seed: i, fine: true, stretch: r * Math.abs(sx - sy),
    });
  }
}

const ROOT_BARK = (i: number, a: number) => (Math.cos(a * 5 + i * 0.9) > 0.72 ? '#2e1e12' : i % 5 === 0 ? '#5e4028' : '#503521');

/** The big roots: each chain of segments as one tube through its capsules' axes. */
export function writeRoots(p: Pen, o: Solids): void {
  forChains(o, (us, vs, rs, branch) => writeRoot(p, o, us, vs, rs, branch));
}

/** Where a root past the playable slab is drawn as it bends into the wall, as shares of WALL_RUN (no one sees it closely). */
const SLAB_END_STEPS = [0.25, 0.5, 0.75, 1] as const;

/** Calls `f` with each root chain's points, and whether it branches off an earlier chain. */
function forChains(o: Solids, f: (us: number[], vs: number[], rs: number[], branch: boolean) => void): void {
  let us: number[] = [];
  let vs: number[] = [];
  let rs: number[] = [];
  let branch = false;
  const flush = () => {
    if (us.length > 1) f(us, vs, rs, branch);
    us = []; vs = []; rs = [];
  };
  for (let i = 0; i < o.rootCount; i++) {
    const k = i * ROOT_STRIDE;
    const joined = us.length > 0 && Math.hypot(o.roots[k] - us[us.length - 1], o.roots[k + 1] - vs[vs.length - 1]) < 1e-6;
    if (!joined) {
      flush();
      branch = i > 0 && onEarlier(o, i);
      us.push(o.roots[k]); vs.push(o.roots[k + 1]); rs.push(o.roots[k + 2]);
    }
    us.push(o.roots[k + 3]); vs.push(o.roots[k + 4]); rs.push(o.roots[k + 5]);
  }
  flush();
}

/** True when segment i starts inside an earlier segment (a branch leaving its parent). */
function onEarlier(o: Solids, i: number): boolean {
  const u = o.roots[i * ROOT_STRIDE];
  const v = o.roots[i * ROOT_STRIDE + 1];
  for (let j = 0; j < i; j++) {
    const k = j * ROOT_STRIDE;
    const eu = o.roots[k + 3] - o.roots[k];
    const ev = o.roots[k + 4] - o.roots[k + 1];
    const t = Math.max(0, Math.min(1, ((u - o.roots[k]) * eu + (v - o.roots[k + 1]) * ev) / (eu * eu + ev * ev || 1)));
    if (Math.hypot(u - o.roots[k] - eu * t, v - o.roots[k + 1] - ev * t) < o.roots[k + 2]) return true;
  }
  return false;
}

/**
 * One root through its chain's points, straight between them as its capsules are, with knobs of
 * at most ROUGH between its ends. A thin end inside the slab closes as the last capsule's round end
 * does; a thick one runs on into the wall where solidRoots buried it (its capsule is where it
 * crosses the face); an end past the playable slab bends into the wall over WALL_RUN; a branch
 * starts inside its parent.
 */
function writeRoot(p: Pen, o: Solids, cu: number[], cv: number[], cr: number[], branch: boolean): void {
  const s = p.s;
  const us = cu.slice();
  const vs = cv.slice();
  const ds = us.map(() => 0);
  // Knobs between the ends: each end's shape starts from its capsule's exact radius.
  const rs = cr.map((r, i) => r + (i > 0 && i < cr.length - 1 ? Math.min(ROUGH, 0.06 * r) * Math.sin(i * 2.7 + cu[0]) : 0));
  for (const first of [true, false]) {
    if (first && branch) continue;
    const e = first ? 0 : us.length - 1;
    const nb = first ? 1 : us.length - 2;
    const l = Math.hypot(us[e] - us[nb], vs[e] - vs[nb]) || 1;
    let tu = (us[e] - us[nb]) / l;
    let tv = (vs[e] - vs[nb]) / l;
    const add = (u: number, v: number, d: number, r: number) => {
      if (first) { us.unshift(u); vs.unshift(v); ds.unshift(d); rs.unshift(r); } else { us.push(u); vs.push(v); ds.push(d); rs.push(r); }
    };
    const u0 = us[e];
    const v0 = vs[e];
    const r = rs[e];
    const buried = buriedAt(o, u0, v0);
    // Past an end and heading on out (one that turned back there ends round, as its capsule does).
    const past = (u0 < s.playLo && tu < 0) || (u0 > s.playHi && tu > 0);
    if (past || buried >= 0) {
      // Into the wall: on along the root (or the way it was buried), sinking behind the face.
      const k = buried * BURIED_STRIDE;
      const run = buried >= 0 ? o.buried[k + 5] : WALL_RUN;
      if (buried >= 0) { tu = o.buried[k + 3]; tv = o.buried[k + 4]; }
      for (const g of buried >= 0 ? BURY_STEPS : SLAB_END_STEPS) add(u0 + tu * g * run, v0 + tv * g * run, wallDepth(g * run, r, run), r);
    } else {
      // Round off as the capsule's end does (a hemisphere).
      for (const f of [0.5, 0.8, 0.95, 1]) add(u0 + tu * r * f, v0 + tv * r * f, 0, r * Math.max(0.02, Math.sqrt(1 - f * f) - 0.01));
    }
  }
  writeTube(p, us, vs, ds, rs, ROOT_BARK, PROP.plain, 10, 0.6, 0.45, true);
}

/** A few fine rootlets off the big roots' undersides: thin enough to pass through (spec 5.2), drawn only. */
export function writeRootlets(p: Pen, o: Solids): void {
  const s = p.s;
  const rand = mulberry32(s.seed ^ 0x68e31da4);
  for (let i = 0; i < o.rootCount; i++) {
    const k = i * ROOT_STRIDE;
    const r = o.roots[k + 2];
    if (r < 0.1 || rand() > 0.3) continue;
    const ru = (o.roots[k] + o.roots[k + 3]) / 2;
    if (ru < s.playLo || ru > s.playHi) continue;
    let dir = (rand() - 0.5) * 1.8;
    const curl = (rand() - 0.5) * 0.9;
    const step = (0.3 + rand() * 0.4) / 4;
    const lu = [ru];
    const lv = [(o.roots[k + 1] + o.roots[k + 4]) / 2 - r * 0.8];
    for (let q = 0; q < 4; q++, dir += curl) {
      lu.push(lu[q] + Math.sin(dir) * step);
      lv.push(lv[q] - Math.cos(dir) * step);
    }
    writeTube(p, lu, lv, [0, 0, 0, 0, 0], [0.02, 0.014, 0.01, 0.006, 0.003], () => '#7a5a3e', PROP.plain, 4, 0.6, 0.3);
  }
}

/** Small roots cut square across: a disc of pale wood with growth rings inside a dark bark ring. */
export function writeDots(p: Pen, o: Solids): void {
  const pts = new Float32Array(48);
  for (let i = 0; i < o.dotCount; i++) {
    const [u, v, r] = o.dots.subarray(i * DOT_STRIDE, i * DOT_STRIDE + 3);
    for (let k = 0; k < 24; k++) {
      pts[k * 2] = u + Math.cos((k / 24) * Math.PI * 2) * r;
      pts[k * 2 + 1] = v + Math.sin((k / 24) * Math.PI * 2) * r;
    }
    writeFill(p, pts, 24, u, v, 0.012, [0.15, 0.4, 0.45, 0.7, 0.75, 0.78, 1], (f) => (
      f > 0.76 ? '#3e2818' : f === 0.4 || f === 0.7 ? '#8a6640' : f < 0.2 ? '#7a5634' : '#bf9c6c'
    ), PROP.plain, () => 1);
  }
}
