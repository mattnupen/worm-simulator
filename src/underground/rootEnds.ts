import { SOLID_ROOT } from './soilGrid';
import { addCap, blockerDepth, BLOCKER_GAP, BURIED_STRIDE, MAX_BURIED, MAX_ROOT_SEGS, type SolidHit, type Solids } from './solidShapes';

/**
 * The shape of a big root's chain where it bends and where it ends (spec 5.2), shared by its
 * capsules (solidRoots.ts) and its drawing (cutSolids.ts), so the worm slides along exactly what it
 * sees. Bends over FILLET_MIN get fillet points: the chain turns in two or three even steps round
 * the corner, not one sharp elbow. An end thicker than BURY_MIN inside the playable slab is not a
 * blunt round club: the root runs on into the soil behind the face, its centre sinking as wallDepth
 * says (as the roots past the slab's ends do), and blocks there as one more capsule fitted to where
 * it meets the face. Build-time only (once per dig): these allocate.
 */

/** Past the slab's end, a root bends into the wall over this run (u)... */
export const WALL_RUN = 0.6;
/** ...its centre sinking this many of its radii behind the face by the run's end. */
const WALL_SINK = 2.2;
/** How far behind the face a root's centre lies, `f` along a run into the wall of `run`. */
export const wallDepth = (f: number, r: number, run = WALL_RUN): number => -r * WALL_SINK * (Math.min(f, run) / run) ** 1.5;
/** A buried end's runs, longest first: one that stopped short of a blocker sinks more steeply. */
const RUNS = [WALL_RUN, 0.4, 0.25] as const;
/** The points a buried end is drawn at, as shares of its run: fine where it crosses the face. */
export const BURY_STEPS = [1 / 12, 2 / 12, 3 / 12, 4 / 12, 5 / 12, 6 / 12, 7 / 12, 8 / 12, 10 / 12, 1] as const;
/** Ends at least this thick are buried; thinner ones close as a tip does (a round end). */
export const BURY_MIN = 0.06;

/** A joint bending more than this gets a fillet point, and one more above FILLET_TWO. */
const FILLET_MIN = (20 * Math.PI) / 180;
const FILLET_TWO = (45 * Math.PI) / 180;
/** The fillet's centre line turns round a circle this much wider than the root. */
const FILLET_ROOM = 0.15;
/** Points closer than this are one point (a clamped step can leave a sliver of a segment). */
const MERGE = 0.05;

const hit: SolidHit = { nu: 0, nv: 0 };

/**
 * Where a root of radius r running into the wall meets the face, `f` along its run: how far along
 * the root (its centre's crossing moves on as it tilts) and how wide either side (0 once it is
 * behind the face). The ring square to the root's tilted centre line meets the face there.
 */
function crossing(f: number, r: number, run: number, out: number[]): void {
  const d = wallDepth(f, r, run);
  const slope = f > 0 ? (1.5 * d) / f : 0;
  out[0] = f + d * slope;
  out[1] = Math.sqrt(Math.max(0, r * r - d * d * (1 + slope * slope)));
}
const cross = [0, 0];

/**
 * The capsule a buried end of radius r (sinking over `run`) blocks as, beyond its last point (in u
 * along the root): to `out` [along, radius], its far round end's centre. Fitted to the crossing's
 * outline (within about 0.013 u): the far end sits where that fits best, some share of the way to
 * where the root leaves the face.
 */
export function buriedCap(r: number, run: number, out: number[]): void {
  let tip = 0;
  for (let f = 0; f <= run; f += run / 120) {
    crossing(f, r, run, cross);
    if (cross[1] <= 0) break;
    tip = f;
  }
  let best = Infinity;
  for (let share = 0.4; share < 0.96; share += 0.05) {
    crossing(tip * share, r, run, cross);
    const cx = cross[0];
    const cw = cross[1];
    // The worst miss of the outline's points from the capsule (0, r) .. (cx, cw), either way.
    let worst = 0;
    for (let k = 0; k <= 16; k++) {
      crossing((tip * k) / 16, r, run, cross);
      const t = Math.max(0, Math.min(1, cross[0] / cx));
      worst = Math.max(worst, Math.abs(Math.hypot(cross[0] - cx * t, cross[1]) - (r + (cw - r) * t)));
    }
    if (worst < best) { best = worst; out[0] = cx; out[1] = cw; }
  }
}
const far = [0, 0];

/** Turns that try a buried end's way into the wall: straight on, then a little either way (each with each run). */
const TURNS = [0, -0.35, 0.35, -0.7, 0.7] as const;

/**
 * Buries the end of the chain (us, vs, rs) at point `e` (its neighbour `nb`) if it is thick and in
 * the playable slab: records it in `o.buried` and adds its capsule, on along the root or turned a
 * little, sinking over the longest run that keeps BLOCKER_GAP off the blockers placed before the
 * chain (`capEnd`) and inside `band(u, v, r)`. Else (or no room) it stays a round end.
 */
export function buryEnd(
  o: Solids, capEnd: number, us: readonly number[], vs: readonly number[], rs: readonly number[], e: number, nb: number,
  band: (u: number, v: number, r: number) => boolean,
): void {
  const s = o.slab;
  const r = rs[e];
  if (!s || r < BURY_MIN || us[e] <= s.playLo || us[e] >= s.playHi || o.buriedCount >= MAX_BURIED) return;
  const l = Math.hypot(us[e] - us[nb], vs[e] - vs[nb]) || 1;
  const tu = (us[e] - us[nb]) / l;
  const tv = (vs[e] - vs[nb]) / l;
  for (const turn of TURNS) {
    const du = tu * Math.cos(turn) - tv * Math.sin(turn);
    const dv = tu * Math.sin(turn) + tv * Math.cos(turn);
    for (const run of RUNS) {
      buriedCap(r, run, far);
      let clear = band(us[e] + du * far[0], vs[e] + dv * far[0], far[1]);
      for (let k = 1; k <= 4 && clear; k++) {
        const t = k / 4;
        const pr = r + (far[1] - r) * t;
        clear = blockerDepth(o, us[e] + du * far[0] * t, vs[e] + dv * far[0] * t, pr + BLOCKER_GAP, capEnd, hit) <= 0;
      }
      if (!clear) continue;
      const k = o.buriedCount++ * BURIED_STRIDE;
      o.buried[k] = us[e]; o.buried[k + 1] = vs[e]; o.buried[k + 2] = r; o.buried[k + 3] = du; o.buried[k + 4] = dv; o.buried[k + 5] = run;
      addCap(o, SOLID_ROOT, us[e], vs[e], r, us[e] + du * far[0], vs[e] + dv * far[0], far[1]);
      return;
    }
  }
}

/** The buried end recorded at (u, v), as its index in `o.buried`, or -1. */
export function buriedAt(o: Solids, u: number, v: number): number {
  for (let i = 0; i < o.buriedCount; i++) {
    const k = i * BURIED_STRIDE;
    if (Math.abs(o.buried[k] - u) < 1e-5 && Math.abs(o.buried[k + 1] - v) < 1e-5) return i;
  }
  return -1;
}

// The chain being rebuilt with its fillets.
const fu: number[] = [];
const fv: number[] = [];
const fr: number[] = [];

/**
 * Rounds the chain (us, vs, rs) in place: slivers merged, and each joint bending more than
 * FILLET_MIN replaced by 2 points (3 over FILLET_TWO) on a polygon turning evenly round it, cut
 * back at most 0.3 of either segment (so a branch leaving a segment's middle still starts on it).
 * A fillet that would bring the root within BLOCKER_GAP of the blockers before the chain
 * (`capEnd`) is left out, and so is one there is no room for (MAX_ROOT_SEGS).
 */
export function filletChain(o: Solids, capEnd: number, us: number[], vs: number[], rs: number[]): void {
  fu.length = 0; fv.length = 0; fr.length = 0;
  for (let i = 0; i < us.length; i++) {
    const n = fu.length;
    // A sliver: keep the end (or the later point), drop the one before it.
    if (n > 0 && Math.hypot(us[i] - fu[n - 1], vs[i] - fv[n - 1]) < MERGE) {
      if (i === us.length - 1 && n > 1) { fu[n - 1] = us[i]; fv[n - 1] = vs[i]; fr[n - 1] = rs[i]; }
      continue;
    }
    fu.push(us[i]); fv.push(vs[i]); fr.push(rs[i]);
  }
  us.length = 0; vs.length = 0; rs.length = 0;
  let room = MAX_ROOT_SEGS - o.rootCount - (fu.length - 1);
  for (let i = 0; i < fu.length; i++) {
    const added = i > 0 && i < fu.length - 1 && room > 0 ? fillet(o, capEnd, i, us, vs, rs, room) : 0;
    if (added === 0) { us.push(fu[i]); vs.push(fv[i]); rs.push(fr[i]); }
    room -= added;
  }
}

/** Pushes the fillet of joint i of (fu, fv, fr) onto (us, vs, rs): the segments it adds (0: none, the joint stays). */
function fillet(o: Solids, capEnd: number, i: number, us: number[], vs: number[], rs: number[], room: number): number {
  const li = Math.hypot(fu[i] - fu[i - 1], fv[i] - fv[i - 1]);
  const lo = Math.hypot(fu[i + 1] - fu[i], fv[i + 1] - fv[i]);
  const au = (fu[i] - fu[i - 1]) / li;
  const av = (fv[i] - fv[i - 1]) / li;
  const bu = (fu[i + 1] - fu[i]) / lo;
  const bv = (fv[i + 1] - fv[i]) / lo;
  const turn = Math.acos(Math.max(-1, Math.min(1, au * bu + av * bv)));
  if (turn <= FILLET_MIN || turn > (150 * Math.PI) / 180) return 0;
  const steps = turn > FILLET_TWO && room >= 2 ? 3 : 2;
  const d = Math.min(0.3 * li, 0.3 * lo, (fr[i] + FILLET_ROOM) * Math.tan(turn / 2));
  if (d < 0.03) return 0;
  const side = au * bv - av * bu > 0 ? 1 : -1;
  const pu = [fu[i] - au * d];
  const pv = [fv[i] - av * d];
  const pr = [fr[i] + (fr[i - 1] - fr[i]) * (d / li)];
  if (steps === 3) {
    // The middle chord, turned a third of the way: as long as makes the last point land at d on.
    const l = (d * Math.cos(turn / 2)) / Math.cos(turn / 6);
    const a = (side * turn) / 3;
    pu.push(pu[0] + (au * Math.cos(a) - av * Math.sin(a)) * l);
    pv.push(pv[0] + (au * Math.sin(a) + av * Math.cos(a)) * l);
    pr.push(fr[i]);
  }
  pu.push(fu[i] + bu * d);
  pv.push(fv[i] + bv * d);
  pr.push(fr[i] + (fr[i + 1] - fr[i]) * (d / lo));
  // Clear of what lay near before (cutting the corner moves the root's inside in a little).
  for (let k = 0; k + 1 < pu.length; k++) {
    for (let t = 0; t <= 1; t += 0.25) {
      const r = pr[k] + (pr[k + 1] - pr[k]) * t;
      if (blockerDepth(o, pu[k] + (pu[k + 1] - pu[k]) * t, pv[k] + (pv[k + 1] - pv[k]) * t, r + BLOCKER_GAP, capEnd, hit) > 0) return 0;
    }
  }
  for (let k = 0; k < pu.length; k++) { us.push(pu[k]); vs.push(pv[k]); rs.push(pr[k]); }
  return pu.length - 1;
}
