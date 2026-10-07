import { valueNoise2 } from '../core/noise';
import { footprints } from '../surface/obstacles';
import { boundaryAt, slabU, B_B, B_F, B_H, type Slab } from './slab';
import { SOLID_ROOT } from './soilGrid';
import { addCap, blockerDepth, BLOCKER_GAP, MAX_ROOT_SEGS, ROOT_STRIDE, type SolidHit, type Solids } from './solidShapes';

/** The entry's sink (the head arcs down 0.45 u ahead to 0.85 u below the F top, bodyPath.ts) stays
 *  clear: no stone or root comes within this u range of the entry and ENTRY_DEPTH of the F top. */
export const ENTRY_LO = -0.5;
export const ENTRY_HI = 1.0;
export const ENTRY_DEPTH = 1.3;
/** A trunk whose footprint comes within this of the playable slab sends 2-3 big roots through it. */
export const ROOT_REACH = 10;
/** A growing root tries its way on, then steers down, further down, or up around a blocker. */
const NUDGES = [0, -0.12, -0.24, 0.12] as const;

const hit: SolidHit = { nu: 0, nv: 0 };

/** Where a big root's centre may run at u: through H, A and E (below F's fine roots), under the entry. */
function rootTop(s: Slab, u: number, r: number): number {
  const top = boundaryAt(s, B_H, u) - r - 0.08;
  return u > ENTRY_LO - 1.2 && u < ENTRY_HI + 1.2 ? Math.min(top, boundaryAt(s, B_F, u) - ENTRY_DEPTH - r - 0.05) : top;
}
const rootBottom = (s: Slab, u: number) => boundaryAt(s, B_B, u) - 0.2;

// One root's points while it grows (committed only if it is long enough).
const gu: number[] = [];
const gv: number[] = [];
const gr: number[] = [];

/** True when a root segment from the last grown point to (u, v, r) is clear of the placed blockers. */
function clearSeg(o: Solids, u: number, v: number, r: number): boolean {
  const n = gu.length - 1;
  for (let t = 0.25; t <= 1; t += 0.25) {
    const pu = gu[n] + (u - gu[n]) * t;
    const pv = gv[n] + (v - gv[n]) * t;
    const pr = gr[n] + (r - gr[n]) * t;
    if (blockerDepth(o, pu, pv, pr + BLOCKER_GAP, o.capCount, hit) > 0) return false;
  }
  return true;
}

/**
 * Grows one root from (u, v) with radius r toward `dir` (into gu, gv, gr, starting fresh when
 * `fresh`): segments of 0.7-1 u tapering 10% each, nearly level (big lateral roots run through
 * the upper soil) with a gentle downward slope and a slow wobble,
 * kept in its band and clear of other blockers (it steers down, or up, around them, else stops).
 */
function grow(s: Slab, o: Solids, rand: () => number, u: number, v: number, r: number, dir: number, n: number, fresh: boolean): void {
  if (fresh) { gu.length = 0; gv.length = 0; gr.length = 0; }
  gu.push(u); gv.push(v); gr.push(r);
  let slope = -0.03 - 0.1 * rand();
  const segs = 7 + Math.floor(rand() * 4);
  for (let i = 0; i < segs && gu.length < MAX_ROOT_SEGS; i++) {
    const len = 0.7 + 0.3 * rand();
    const wob = (valueNoise2(i * 0.7, n * 3.1 + (dir > 0 ? 0 : 1.7), s.seed + 17) - 0.5) * 0.3;
    const nu = u + dir * len;
    const nr = Math.max(0.06, r * 0.9);
    const want = v + (slope + wob) * len;
    let placed = false;
    for (const nudge of NUDGES) {
      const nv = Math.max(rootBottom(s, nu), Math.min(rootTop(s, nu, nr), want + nudge));
      if (!clearSeg(o, nu, nv, nr)) continue;
      gu.push(nu); gv.push(nv); gr.push(nr);
      u = nu; v = nv; r = nr;
      placed = true;
      break;
    }
    if (!placed || u < s.playLo - 1 || u > s.playHi + 1) break;
    slope *= 0.8;
  }
}

/** Commits the grown points as a chain of root segments (and their capsules). */
function commit(o: Solids): void {
  for (let i = 0; i + 1 < gu.length && o.rootCount < MAX_ROOT_SEGS; i++) {
    const k = o.rootCount++ * ROOT_STRIDE;
    o.roots[k] = gu[i]; o.roots[k + 1] = gv[i]; o.roots[k + 2] = gr[i];
    o.roots[k + 3] = gu[i + 1]; o.roots[k + 4] = gv[i + 1]; o.roots[k + 5] = gr[i + 1];
    addCap(o, SOLID_ROOT, gu[i], gv[i], gr[i], gu[i + 1], gv[i + 1], gr[i + 1]);
  }
}

/** A clear start for a root at u: the highest depth in its band (from `from` down), or NaN. */
function startDepth(s: Slab, o: Solids, u: number, r: number, from: number): number {
  for (let v = Math.min(from, rootTop(s, u, r)); v >= rootBottom(s, u); v -= 0.04) {
    if (blockerDepth(o, u, v, r + BLOCKER_GAP, o.capCount, hit) <= 0) return v;
  }
  return NaN;
}

/**
 * Big roots (spec 5.2), placed after the sections and before the stones. A trunk near the slab
 * sends 2-3: with the trunk beside the cut, one root runs through the slab from the trunk's point
 * both ways (two roots, thickest at the trunk) and a third may enter from the nearer end; with the
 * trunk past an end, they enter from that end, one below the other. With no trunk near, one
 * thinner root enters from a random end.
 */
export function placeRoots(s: Slab, o: Solids, rand: () => number): void {
  const { round } = footprints();
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
    const r = 0.14 + 0.12 * near + 0.04 * rand();
    const v = startDepth(s, o, ut, r, rootTop(s, ut, r) - 0.1 * rand());
    if (!Number.isNaN(v)) {
      grow(s, o, rand, ut, v, r, -1, 0, true);
      gu.reverse(); gv.reverse(); gr.reverse();
      gu.pop(); gv.pop(); gr.pop();
      grow(s, o, rand, ut, v, r, 1, 1, false);
      if (gu.length >= 3) { commit(o); done = 2; }
    }
  }
  const from = near > 0 ? (ut < (s.playLo + s.playHi) / 2 ? -1 : 1) : rand() < 0.5 ? -1 : 1;
  below[0] = Infinity;
  below[1] = Infinity;
  for (let n = done; n < count; n++) {
    const r0 = near > 0 ? (0.14 + 0.12 * near + 0.04 * rand()) * 0.85 ** n : 0.12 + 0.03 * rand();
    // From the trunk's end; if a rock, the log or another root fills that end, from the other.
    if (!fromEnd(s, o, rand, r0, from, n) && !fromEnd(s, o, rand, r0, -from, n)) break;
  }
}

/** How deep the next root from each end (index 0: the low end) may start: below the last one. */
const below = [Infinity, Infinity];

/**
 * One root entering from an end (-1: playLo, +1: playHi), at the highest clear depth below the
 * last root from that end; at the end, or a little further in and thinner if the way is blocked.
 * False if none fits or it would be too short.
 */
function fromEnd(s: Slab, o: Solids, rand: () => number, r0: number, end: number, n: number): boolean {
  const e = end < 0 ? 0 : 1;
  for (let shift = 0; shift <= 4; shift += 0.5) {
    const u = (end < 0 ? s.playLo - 0.4 : s.playHi + 0.4) - end * shift;
    for (let r = r0, shrink = 0; shrink < 4; shrink++, r = Math.max(0.08, r * 0.8)) {
      const v = startDepth(s, o, u, r, below[e]);
      if (Number.isNaN(v)) continue;
      grow(s, o, rand, u, v, r, -end, n, true);
      if (gu.length < 3) return false;
      commit(o);
      below[e] = v - r - BLOCKER_GAP;
      return true;
    }
  }
  return false;
}
