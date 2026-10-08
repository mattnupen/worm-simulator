import { BODY_RADIUS, SPACING } from '../game/crawl';
import { hypot2 } from '../core/vec';
import { boundaryOf, bound, B_TOP, type Slab } from './slab';
import type { Solids } from './solids';
import { pushOutFrom } from './solidPush';
import { TOP_KEEP, type UV } from './solidShapes';
import { cellAt, cellU, cellV, colOf, rowOf, CELL, GRID_H, GRID_W, type SoilGrid } from './soilGrid';

/**
 * Backing up (V2 spec 6: nightcrawlers crawl backward as well as forward, and pull back into their
 * burrows). The head cannot turn back past its own neck, so a head pushed into a dead end (a
 * crease between a rock's flank and the line under the leaves' top, or a slab end) could neither go
 * on nor turn round. Pointing back against the body while the head is stuck, the worm backs up:
 * the tail leads, back along the tunnel it came along, and the rest follows it. It keeps backing
 * while the stick points back, and stops at the tunnel's end (a worm's tail does not dig); then the
 * head is free to turn. Allocates nothing.
 */

/**
 * The head is stuck once it has tried this long to move and got less than STUCK_SHARE of the way its
 * speed would have taken it from where it started trying (and under STUCK_REACH; a slow turn in
 * hard soil is not stuck)... Backing stops when the tail gets less than STUCK_SHARE of its way too.
 */
export const STUCK_S = 0.3;
export const STUCK_REACH = 0.03;
export const STUCK_SHARE = 0.2;
/** ...and only once its speed would have taken it this far (a head turning slowly from rest is not stuck). */
export const STUCK_TRIED = 0.1;
/** ...and backing starts when the stick points within about 37 degrees of straight back along the body (this far off the neck's way). */
export const BACK_ANGLE = 2.5;
/**
 * ...and once backing, it keeps on while the stick stays within about 60 degrees of straight back
 * (the neck's way swings as the body moves under the head: one threshold would flick it on and off).
 */
export const BACK_KEEP = 2.1;
/** Backing up is slow and steady: about half a crawl through its own tunnel. */
export const BACK_SPEED = 0.7;
/**
 * The tail follows its tunnel round bends: it goes the first of these turns (radians off the body's
 * last segment) that keeps it in open tunnel (castings included) FEEL_BACK past where it steps.
 * None does: it is at the tunnel's end, and stays.
 */
const TAIL_TURNS = [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9] as const;
const FEEL_BACK = 0.05;

const p: UV = { u: 0, v: 0 };
const from: UV = { u: 0, v: 0 };

/** Keeps a body point under the leaves' top and out of stones and roots, from where it was. */
export function keepOut(s: Slab, o: Solids, u: Float64Array, v: Float64Array, prevU: Float64Array, prevV: Float64Array, i: number): void {
  p.u = u[i];
  boundaryOf(s, B_TOP, p);
  p.v = Math.min(bound.v - TOP_KEEP, v[i]);
  from.u = prevU[i];
  from.v = prevV[i];
  pushOutFrom(o, p, BODY_RADIUS, TOP_KEEP, from);
  u[i] = p.u;
  v[i] = p.v;
}

/** The body backUp moves: its points now and at the last step (a Burrower). */
export interface BackBody {
  readonly u: Float64Array;
  readonly v: Float64Array;
  readonly prevU: Float64Array;
  readonly prevV: Float64Array;
}

const feel: UV = { u: 0.5, v: 0.5 };
/**
 * Open tunnel (castings included) within NEAR_OPEN of `p`. The tail, a chain cutting the bends'
 * insides, may lie beside its tunnel rather than in it (the body digs nothing); backing, it may
 * then go through the soil beside the tunnel, never away from it.
 */
function nearOpen(g: SoilGrid, p: UV): boolean {
  const c0 = colOf(p.u);
  const r0 = rowOf(g, p.v);
  const n = Math.ceil(NEAR_OPEN / CELL);
  for (let r = r0 - n; r <= r0 + n; r++) {
    if (r < 0 || r >= GRID_H) continue;
    const dv = cellV(g, r) - p.v;
    for (let c = c0 - n; c <= c0 + n; c++) {
      if (c < 0 || c >= GRID_W || !g.open[r * GRID_W + c]) continue;
      const du = cellU(c) - p.u;
      if (du * du + dv * dv <= NEAR_OPEN * NEAR_OPEN) return true;
    }
  }
  return false;
}
const NEAR_OPEN = 0.45;

/** backUp's step: how far the tail goes, the playable slab's ends and the bottom it keeps above. */
export interface BackLimits { step: number; lo: number; hi: number; bottom: number }

/**
 * One step backing up `lim.step` along its tunnel (from the body's last segment, round the tunnel's
 * bends), inside the playable slab (`lim.lo`..`lim.hi`, above `lim.bottom`). It digs nothing: the
 * body goes back through the tunnel it came along (and leaves its castings there), and at the
 * tunnel's end the tail stays put. The caller measures how far the tail moved (from prevU, prevV):
 * nothing here boxes a number (solidShapes.ts).
 */
export function backUp(s: Slab, o: Solids, g: SoilGrid, b: BackBody, lim: BackLimits): void {
  const { u, v, prevU, prevV } = b;
  const { step, lo, hi, bottom } = lim;
  const t = u.length - 1;
  const eu = u[t] - u[t - 1];
  const ev = v[t] - v[t - 1];
  const along = Math.atan2(ev, eu);
  const it = cellAt(g, u[t], v[t]);
  const inTunnel = it >= 0 && g.open[it] === 1;
  for (let k = 0; k < TAIL_TURNS.length; k++) {
    const a = along + TAIL_TURNS[k];
    const cu = Math.cos(a);
    const cv = Math.sin(a);
    feel.u = u[t] + cu * (step + FEEL_BACK);
    feel.v = v[t] + cv * (step + FEEL_BACK);
    const i = cellAt(g, feel.u, feel.v);
    if (i < 0) continue;
    // Into open tunnel; or, from a tail lying beside its tunnel, into soil beside it.
    if (!g.open[i] && (inTunnel || !nearOpen(g, feel))) continue;
    u[t] = Math.max(lo, Math.min(hi, u[t] + cu * step));
    v[t] = Math.max(bottom, v[t] + cv * step);
    break;
  }
  keepOut(s, o, u, v, prevU, prevV, t);
  // The rest follows the tail, each point drawn after the one behind it (drawLink).
  for (let i = t - 1; i >= 0; i--) linkOut(b, s, o, i, i + 1, i + 2 <= t ? i + 2 : -1);
}

/**
 * Point i drawn after point `lead` (follow the leader, as the crawl's body): the way it lay, pulled
 * to SPACING from the lead when farther, pushed out to SLACK x SPACING when nearer (a rope alone let
 * the links close up where the leader came back toward it, and the worm shrank; a little slack
 * keeps the chain from jolting), and turned no more than MAX_BEND off the lead's own link (from
 * point `before`; -1: none), so the chain never curls tighter than the worm is thick or folds back
 * on itself. Allocates nothing.
 */
/** Point i drawn after `lead` (drawLink), then kept out of the top and the solids (keepOut). */
export function linkOut(b: BackBody, s: Slab, o: Solids, i: number, lead: number, before: number): void {
  drawLink(b, i, lead, before);
  keepOut(s, o, b.u, b.v, b.prevU, b.prevV, i);
}

export function drawLink(b: BackBody, i: number, lead: number, before: number): void {
  const { u, v } = b;
  let du = u[i] - u[lead];
  let dv = v[i] - v[lead];
  const d = hypot2(du, dv);
  if (!(d > 1e-9)) return;
  const len = d > SPACING ? SPACING : d < SLACK * SPACING ? SLACK * SPACING : d;
  du /= d;
  dv /= d;
  let turned = false;
  if (before >= 0) {
    // The lead's link carried on straight, and how far this one turns off it.
    const pu = u[lead] - u[before];
    const pv = v[lead] - v[before];
    const pl = hypot2(pu, pv);
    if (pl > 1e-9) {
      const bend = Math.atan2((pu * dv - pv * du) / pl, (pu * du + pv * dv) / pl);
      // A joint a stone or the top pressed past MAX_BEND is eased back BEND_EASE a step, not at once.
      lastBend(b, i, lead, before);
      const most = Math.max(MAX_BEND, Math.abs(lb.a) - BEND_EASE);
      if (Math.abs(bend) > most) {
        // Turned well back, which side is unsure (round past straight back it flips): the side
        // this joint bent at the last step.
        const side = Math.abs(bend) > Math.PI / 2 ? lb.a : bend;
        const c = Math.cos(most);
        const sn = side > 0 ? Math.sin(most) : -Math.sin(most);
        du = (pu * c - pv * sn) / pl;
        dv = (pu * sn + pv * c) / pl;
        turned = true;
      }
    }
  }
  if (!turned && len === d) return;
  u[i] = u[lead] + du * len;
  v[i] = v[lead] + dv * len;
}
/** The bend at the joint at `lead` at the last step (from prevU, prevV), into lb.a. */
const lb = { a: 0.5 };
function lastBend(b: BackBody, i: number, lead: number, before: number): void {
  const { prevU, prevV } = b;
  const pu = prevU[lead] - prevU[before];
  const pv = prevV[lead] - prevV[before];
  const cu = prevU[i] - prevU[lead];
  const cv = prevV[i] - prevV[lead];
  lb.a = Math.atan2(pu * cv - pv * cu, pu * cu + pv * cv);
}
/** A link may go this slack (share of SPACING) before it is pushed out. */
const SLACK = 0.95;
/** The most a link turns off the one before it (radians): a radius of about 0.37 u, near MIN_TURN_R. */
export const MAX_BEND = 0.6;
const BEND_EASE = 0.05;
