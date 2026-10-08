import { footprints } from '../surface/obstacles';
import { boundaryAt, slabU, B_B, B_F, B_H, type Slab } from './slab';
import { SOLID_ROOT } from './soilGrid';
import { buryEnd, filletChain } from './rootEnds';
import {
  addCap, blockerDepth, capDepth, BLOCKER_GAP, CAP_STRIDE, MAX_ROOT_SEGS, ROOT_STRIDE,
  type SolidHit, type Solids,
} from './solidShapes';

/** The entry's sink (the head arcs down 0.45 u ahead to 0.85 u below the F top, bodyPath.ts) stays
 *  clear: no stone or root comes within this u range of the entry and ENTRY_DEPTH of the F top. */
export const ENTRY_LO = -0.5;
export const ENTRY_HI = 1.0;
export const ENTRY_DEPTH = 1.3;
/** A trunk whose footprint comes within this of the playable slab sends 2-3 big roots through it. */
export const ROOT_REACH = 10;
/** A big root leaves the trunk's side diving this steeply (radians below level), and levels out with depth. */
const DIVE_LO = (15 * Math.PI) / 180;
const DIVE_HI = (30 * Math.PI) / 180;
/** Its segments are this long, each this much thinner than the last, and it wanders this much (radians) each. */
const SEG_LO = 0.4;
const SEG_HI = 0.6;
const TAPER_LO = 0.82;
const TAPER_HI = 0.86;
const WANDER = 0.45;
/** It ends in a tip once it is this thin (after about 5-8 u). */
export const ROOT_TIP = 0.035;
/** A growing root that meets a blocker turns this much (radians) to get round it, either way. */
const DODGES = [0, -0.35, 0.35, -0.7, 0.7] as const;
/** The segments a slab's big roots may grow in all (their fillet points are stored on top). */
const ROOT_ROOM = 64;
/** The segments grown so far in this slab, and the slab (placeRoots). */
let grown = 0;
let band: Slab;

const hit: SolidHit = { nu: 0, nv: 0 };

/** Where a big root's centre may run at u: through H, A and E (below F's fine roots), under the entry. */
export function rootTop(s: Slab, u: number, r: number): number {
  const top = boundaryAt(s, B_H, u) - r - 0.08;
  return u > ENTRY_LO - 1.2 && u < ENTRY_HI + 1.2 ? Math.min(top, boundaryAt(s, B_F, u) - ENTRY_DEPTH - r - 0.05) : top;
}
export const rootBottom = (s: Slab, u: number) => boundaryAt(s, B_B, u) - 0.05;
/** True when a root's centre may run at (u, v), radius r. */
const inBand = (u: number, v: number, r: number) => v <= rootTop(band, u, r) + 1e-6 && v >= rootBottom(band, u) - 1e-6;

// One root's points while it grows, and a branch's (committed only if long enough).
const gu: number[] = [];
const gv: number[] = [];
const gr: number[] = [];
const bu: number[] = [];
const bv: number[] = [];
const br: number[] = [];

/** True when a segment from the last of (us, vs, rs) to (u, v, r) is clear of the placed blockers. */
function clearSeg(o: Solids, us: number[], vs: number[], rs: number[], u: number, v: number, r: number): boolean {
  const n = us.length - 1;
  for (let t = 0.25; t <= 1; t += 0.25) {
    const pu = us[n] + (u - us[n]) * t;
    const pv = vs[n] + (v - vs[n]) * t;
    const pr = rs[n] + (r - rs[n]) * t;
    if (blockerDepth(o, pu, pv, pr + BLOCKER_GAP, o.capCount, hit) > 0) return false;
  }
  return true;
}

/**
 * Grows a root from the last point of (us, vs, rs) toward `dir` (-1: down the cut, +1: up it),
 * starting `dive` radians below level: segments of SEG_LO-SEG_HI u, each TAPER_LO-TAPER_HI as thick
 * as the last, wandering up to WANDER each; it levels out near `level` of the way up its band (0:
 * its bottom), kept
 * in the band and clear of other blockers (it turns round them, else stops). It stops as a tip at
 * ROOT_TIP, or past the slab's ends. `room` caps its segments. With `first`, the first segment
 * heads exactly that way (radians from level toward `dir`, a branch leaving its parent), or none.
 */
function grow(
  s: Slab, o: Solids, rand: () => number, us: number[], vs: number[], rs: number[], dir: number, dive: number, room: number,
  level: number, first = NaN,
): void {
  let a = -dive;
  for (let i = 0; i < room; i++) {
    const n = us.length - 1;
    const u = us[n];
    const v = vs[n];
    // A root thins slowly for its first two segments (away from the trunk), then as TAPER_*.
    const nr = rs[n] * (i < 2 && first !== first ? 0.95 : TAPER_LO + (TAPER_HI - TAPER_LO) * rand());
    if (nr < ROOT_TIP) break;
    let len = SEG_LO + (SEG_HI - SEG_LO) * rand();
    const exact = i === 0 && first === first;
    if (exact) {
      a = first;
      // A branch's first segment is shorter where its parent runs low in the band.
      const fall = -Math.sin(a);
      if (fall > 0) len = Math.min(len, (v - rootBottom(s, u + dir * Math.cos(a) * len) - 0.02) / fall);
      if (len < 0.25) break;
    }
    else {
      // Dive until near the depth it levels out at (`level` of the way up its band), then run level.
      const lo = rootBottom(s, u);
      const at = lo + level * Math.max(0, rootTop(s, u, nr) - lo);
      const want = Math.max(-dive, Math.min(0.25, (at - v) * 1.5));
      a += (want - a) * 0.5 + (rand() - 0.5) * 2 * WANDER;
      a = Math.max(-1.2, Math.min(0.5, a));
    }
    let placed = false;
    for (const dodge of exact ? DODGES.slice(0, 1) : DODGES) {
      const want = v + Math.sin(a + dodge) * len;
      const nu = u + dir * Math.cos(a + dodge) * len;
      const nv = Math.max(rootBottom(s, nu), Math.min(rootTop(s, nu, nr), want));
      if ((exact && Math.abs(nv - want) > 1e-6) || !clearSeg(o, us, vs, rs, nu, nv, nr)) continue;
      us.push(nu); vs.push(nv); rs.push(nr);
      a = Math.atan2(nv - v, dir * (nu - u));
      placed = true;
      break;
    }
    if (!placed || us[n + 1] < s.playLo - 0.6 || us[n + 1] > s.playHi + 0.6) break;
  }
}

/**
 * Commits the points (us, vs, rs) as a chain of root segments and their capsules, its joints
 * rounded and its thick ends in the slab buried (rootEnds.ts; a branch's start lies in its parent).
 */
function commit(o: Solids, us: number[], vs: number[], rs: number[], branch = false): void {
  grown += us.length - 1;
  const capEnd = o.capCount;
  filletChain(o, capEnd, us, vs, rs);
  for (let i = 0; i + 1 < us.length && o.rootCount < MAX_ROOT_SEGS; i++) {
    const k = o.rootCount++ * ROOT_STRIDE;
    o.roots[k] = us[i]; o.roots[k + 1] = vs[i]; o.roots[k + 2] = rs[i];
    o.roots[k + 3] = us[i + 1]; o.roots[k + 4] = vs[i + 1]; o.roots[k + 5] = rs[i + 1];
    addCap(o, SOLID_ROOT, us[i], vs[i], rs[i], us[i + 1], vs[i + 1], rs[i + 1]);
  }
  if (us.length < 2) return;
  if (!branch) buryEnd(o, capEnd, us, vs, rs, 0, 1, inBand);
  buryEnd(o, capEnd, us, vs, rs, us.length - 1, us.length - 2, inBand);
}

/** True when the branch's points well past its fork keep BLOCKER_GAP off its parent (us, vs, rs). */
function offParent(us: number[], vs: number[], rs: number[]): boolean {
  for (let j = 3; j < bu.length; j++) {
    for (let i = 0; i + 1 < us.length; i++) {
      scratch[0] = us[i]; scratch[1] = vs[i]; scratch[2] = rs[i];
      scratch[3] = us[i + 1]; scratch[4] = vs[i + 1]; scratch[5] = rs[i + 1];
      if (capDepth(scratch, 0, bu[j], bv[j], br[j] + BLOCKER_GAP, hit) > 0) return false;
    }
  }
  return true;
}
const scratch = new Float32Array(CAP_STRIDE);

/**
 * Commits the grown root (gu, gv, gr) with one branch: from the middle of one of its first
 * segments, 0.6 as thick there, leaving 60-75 degrees below the parent's way (so the corner between
 * them is wide enough for the slide to settle in: a narrow fork would trap the worm's head between
 * two pushes) and then levelling out like any root. It touches its parent only at the fork.
 */
function commitWithBranch(s: Slab, o: Solids, rand: () => number): void {
  bu.length = 0; bv.length = 0; br.length = 0;
  const room = ROOT_ROOM - grown - (gu.length - 1);
  for (let tries = 0; tries < 6 && bu.length === 0 && room > 2; tries++) {
    const j = Math.floor(rand() * Math.max(1, Math.min(5, gu.length - 3)));
    const r = (gr[j] + gr[j + 1]) / 2;
    if (j + 3 > gu.length || r < 0.08) continue;
    const dir = gu[j + 1] > gu[j] ? 1 : -1;
    const slope = Math.atan2(gv[j + 1] - gv[j], dir * (gu[j + 1] - gu[j]));
    bu.push((gu[j] + gu[j + 1]) / 2); bv.push((gv[j] + gv[j + 1]) / 2); br.push(r * 0.6);
    grow(s, o, rand, bu, bv, br, dir, DIVE_HI, Math.min(8, room), 0.05, slope - (60 + 15 * rand()) * (Math.PI / 180));
    if (bu.length < 3 || !offParent(gu, gv, gr)) { bu.length = 0; bv.length = 0; br.length = 0; }
  }
  commit(o, gu, gv, gr);
  if (bu.length) commit(o, bu, bv, br, true);
}

/** A clear start for a root at u: the highest depth in its band from `from` down, or NaN. */
function startDepth(s: Slab, o: Solids, u: number, r: number, from: number): number {
  for (let v = Math.min(from, rootTop(s, u, r)); v >= rootBottom(s, u); v -= 0.04) {
    if (blockerDepth(o, u, v, r + BLOCKER_GAP, o.capCount, hit) <= 0) return v;
  }
  return NaN;
}

/** A random height in the band at u, from its top down to `share` of the way to its bottom. */
const anyDepth = (s: Slab, u: number, r: number, share: number, rand: () => number) =>
  rootTop(s, u, r) - share * rand() * Math.max(0, rootTop(s, u, r) - rootBottom(s, u));

/**
 * Big roots (spec 5.2), placed after the sections and before the stones. A trunk near the slab
 * sends 2-3: with the trunk beside the cut, one root runs from the trunk's point down both ways
 * (two roots, thickest at the trunk) and a third may enter from the nearer end; with the trunk past
 * an end, they enter from that end at random depths. With no trunk near, one thinner root enters
 * from a random end. Each dives from the trunk's side, levels out, and ends in a tip after 5-8 u,
 * with one branch heading down. (Then 1-3 small roots cut square across: solids.ts placeDots.)
 */
export function placeRoots(s: Slab, o: Solids, rand: () => number): void {
  const { round } = footprints();
  grown = 0;
  band = s;
  let best = Infinity;
  let ut = 0;
  for (let k = 0; k < round.length; k += 4) {
    if (round[k + 3] !== Infinity) continue; // rocks have a finite top; trunks do not
    const u = slabU(s, round[k], round[k + 1]);
    const across = (round[k] - s.ox) * s.nx + (round[k + 1] - s.oz) * s.nz;
    const d = Math.hypot(across, Math.max(0, s.playLo - u, u - s.playHi)) - round[k + 2];
    if (d < best) { best = d; ut = u; }
  }
  const near = Math.max(0, Math.min(1, 1 - best / ROOT_REACH));
  const count = near > 0 ? 2 + Math.floor(rand() * 2) : 1;
  let done = 0;
  if (near > 0 && ut > s.playLo && ut < s.playHi) {
    const r = 0.16 + 0.1 * near + 0.04 * rand();
    const v = startDepth(s, o, ut, r, rootTop(s, ut, r) - 0.1 * rand());
    if (!Number.isNaN(v)) {
      gu.length = 0; gv.length = 0; gr.length = 0;
      gu.push(ut); gv.push(v); gr.push(r);
      const half = (ROOT_ROOM - 16) / 2;
      const level = 0.4 + 0.25 * rand();
      grow(s, o, rand, gu, gv, gr, -1, DIVE_LO + (DIVE_HI - DIVE_LO) * rand(), half, level);
      gu.reverse(); gv.reverse(); gr.reverse();
      grow(s, o, rand, gu, gv, gr, 1, DIVE_LO + (DIVE_HI - DIVE_LO) * rand(), half, level);
      if (gu.length >= 5) { commitWithBranch(s, o, rand); done = 2; }
    }
  }
  const from = near > 0 ? (ut < (s.playLo + s.playHi) / 2 ? -1 : 1) : rand() < 0.5 ? -1 : 1;
  for (let n = done; n < count; n++) {
    const r0 = near > 0 ? (0.16 + 0.1 * near + 0.04 * rand()) * 0.85 ** n : 0.13 + 0.03 * rand();
    // From the trunk's end; if a rock, the log or another root fills that end, from the other.
    if (!fromEnd(s, o, rand, r0, from) && !fromEnd(s, o, rand, r0, -from)) break;
  }
}

/**
 * One root entering from an end (-1: playLo, +1: playHi) at a random clear depth, diving inward;
 * at the end, or a little further in and thinner if the way is blocked. False if none fits or it
 * would be too short.
 */
function fromEnd(s: Slab, o: Solids, rand: () => number, r0: number, end: number): boolean {
  for (let shift = 0; shift <= 4; shift += 0.5) {
    const u = (end < 0 ? s.playLo - 0.4 : s.playHi + 0.4) - end * shift;
    for (let r = r0, shrink = 0; shrink < 4; shrink++, r = Math.max(0.08, r * 0.8)) {
      // A random depth, or the highest clear one if everything below it is taken.
      let v = startDepth(s, o, u, r, anyDepth(s, u, r, 0.6, rand));
      if (Number.isNaN(v)) v = startDepth(s, o, u, r, Infinity);
      if (Number.isNaN(v)) continue;
      gu.length = 0; gv.length = 0; gr.length = 0;
      gu.push(u); gv.push(v); gr.push(r);
      grow(s, o, rand, gu, gv, gr, -end, DIVE_LO + (DIVE_HI - DIVE_LO) * rand(), Math.min(14, ROOT_ROOM - grown), 0.35 + 0.3 * rand());
      if (gu.length < 4) return false;
      commitWithBranch(s, o, rand);
      return true;
    }
  }
  return false;
}
