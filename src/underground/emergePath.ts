import { WORM_SEGMENTS } from '../game/crawl';
import { TOP_KEEP } from './burrowMotion';
import { arc, frame, push, restAt, wrap, TURN_RADIUS, type BodyPath } from './bodyPath';
import { OUT_S, RISE_S } from './modeMachine';
import { emergeSides, LAND_MAX, LAND_MIN, OUT_LENGTH, type EmergeMap } from './emergeMap';
import { boundaryAt, B_TOP, type Slab } from './slab';

/**
 * Coming up out of the cut (V2 spec 4.2): the path the body slides along, from the tail through the
 * head, up to the floor and along it. The rise is the shortest of: an arc (either way round) to a
 * climb or descent angle, a straight, and an arc levelling out on the floor, every bend TURN_RADIUS
 * wide (no kink however the head faced), kept under the litter's top where it can be. Then the
 * worm crawls OUT_LENGTH along the floor under the litter, so its whole body comes out, lying along
 * the cut. Built once per coming up (bodyPath.ts poses it). The slab's emerge map (emergeMap.ts)
 * says where coming up is possible at all.
 */
const N = WORM_SEGMENTS;
/** The steepest climb (or descent) toward the floor, in degrees. */
const CLIMB_MAX = 60;
const DEG = Math.PI / 180;
/** Coming up, the head cruises at no more than this (u/s; the crawl's top speed is 1.6)... */
export const HEAD_SPEED = 1.8;
/** ...after speeding up over this long, and before slowing down over the same (s). */
const RAMP_S = 0.6;
/** a in [0, 2 pi). */
const mod = (a: number): number => a - 2 * Math.PI * Math.floor(a / (2 * Math.PI));

/** Sweep of the turn from facing a0 to facing a1 going `rho` (+1 counterclockwise in the plane). */
const sweepOf = (a0: number, a1: number, rho: number): number => mod(rho * (a1 - a0));
/** Rise and run of a TURN_RADIUS arc from facing a0, turning `rho` through `sweep`. */
const arcRise = (a0: number, rho: number, sweep: number): number => -TURN_RADIUS * rho * (Math.cos(a0 + rho * sweep) - Math.cos(a0));
const arcRun = (a0: number, rho: number, sweep: number): number => TURN_RADIUS * rho * (Math.sin(a0 + rho * sweep) - Math.sin(a0));
/** The most such an arc rises above its start (at an end, or where it faces along u at its crest). */
function arcTop(a0: number, rho: number, sweep: number): number {
  let top = Math.max(0, arcRise(a0, rho, sweep));
  const crest = rho > 0 ? Math.PI : 0;
  if (sweepOf(a0, crest, rho) <= sweep) top = Math.max(top, -TURN_RADIUS * rho * (-rho - Math.cos(a0)));
  return top;
}

/** The rise chosen: the first arc's way, the climb angle and the straight's length. */
const plan = { rho: 1, climb: 0, straight: 0 };

/**
 * The shortest rise from the head (hu, hv) facing `dir` to the height `ev`, arriving facing `out`:
 * an arc either way round to a climb (or descent) angle, a straight, then an arc levelling out.
 * Never higher than `ceiling` (unless nothing else fits). Writes `plan`; returns where it lands (u).
 */
function planRise(hu: number, hv: number, dir: number, out: number, ev: number, ceiling: number): number {
  let best = Infinity;
  const sign = out === 0 ? 1 : -1;
  // Under the ceiling and landing within LAND_MIN..LAND_MAX if it can; then the landing alone; then anything.
  for (let pass = 0; pass < 3 && best === Infinity; pass++) {
    const roof = pass === 0 ? ceiling : Infinity;
    const land = pass < 2;
    for (let deg = -CLIMB_MAX; deg <= CLIMB_MAX; deg += 2) {
      if (deg === 0) continue;
      const phi = out === 0 ? deg * DEG : Math.PI - deg * DEG;
      const d3 = wrap(out - phi);
      const rho3 = d3 >= 0 ? 1 : -1;
      const rise3 = arcRise(phi, rho3, Math.abs(d3));
      for (let rho = -1; rho <= 1; rho += 2) {
        const sw = sweepOf(dir, phi, rho);
        const rise1 = arcRise(dir, rho, sw);
        const straight = (ev - hv - rise1 - rise3) / Math.sin(phi);
        if (straight < 0) continue;
        const top = Math.max(arcTop(dir, rho, sw), rise1 + Math.max(0, straight * Math.sin(phi)) + arcTop(phi, rho3, Math.abs(d3)));
        const length = TURN_RADIUS * (sw + Math.abs(d3)) + straight;
        if (hv + top > roof || length >= best) continue;
        const along = sign * (arcRun(dir, rho, sw) + straight * Math.cos(phi) + arcRun(phi, rho3, Math.abs(d3)));
        if (land && (along < LAND_MIN || along > LAND_MAX)) continue;
        best = length;
        plan.rho = rho;
        plan.climb = phi;
        plan.straight = straight;
      }
    }
  }
  const sw = sweepOf(dir, plan.climb, plan.rho);
  const d3 = wrap(out - plan.climb);
  return hu + arcRun(dir, plan.rho, sw) + plan.straight * Math.cos(plan.climb) + arcRun(plan.climb, d3 >= 0 ? 1 : -1, Math.abs(d3));
}

/**
 * The rise from the head (facing `dir`) to the floor, arriving level the way out (`sign`), every bend
 * as gentle as TURN_RADIUS and kept under the litter's top where it can be; then the run along the
 * floor.
 */
function rise(p: BodyPath, s: Slab, dir: number, sign: number): void {
  const base = p.count;
  const hu = p.u[base - 1];
  const hv = p.v[base - 1];
  const out = sign > 0 ? 0 : Math.PI;
  let ceiling = Infinity;
  for (let x = -1; x <= 1.5; x += 0.25) ceiling = Math.min(ceiling, boundaryAt(s, B_TOP, hu + sign * x) - TOP_KEEP);
  let eu = hu + sign * (LAND_MIN + LAND_MAX) / 2;
  // The floor's height where it lands depends on where it lands: settle that in a few passes.
  for (let pass = 0; pass < 3; pass++) {
    const ev = restAt(p, eu, 0);
    eu = planRise(hu, hv, dir, out, ev, Math.max(ceiling, hv, ev));
  }
  const { rho, climb, straight } = plan;
  arc(p, dir, rho, sweepOf(dir, climb, rho));
  if (straight > 1e-6) push(p, p.u[p.count - 1] + straight * Math.cos(climb), p.v[p.count - 1] + straight * Math.sin(climb));
  const d3 = wrap(out - climb);
  arc(p, climb, d3 >= 0 ? 1 : -1, Math.abs(d3));
  // Lands exactly on the floor: the last pass's small miss is spread along the rise.
  eu = p.u[p.count - 1];
  const miss = restAt(p, eu, 0) - p.v[p.count - 1];
  const from = p.s[base - 1];
  const span = Math.max(1e-9, p.s[p.count - 1] - from);
  for (let i = base; i < p.count; i++) p.v[i] += (miss * (p.s[i] - from)) / span;
  p.exitAt = p.s[p.count - 1];
  for (let x = 0.25; x <= OUT_LENGTH + 1e-9; x += 0.25) push(p, eu + sign * x, restAt(p, eu + sign * x, 0));
  p.headTo = p.s[p.count - 1];
  p.exitSign = sign;
  p.exitU = eu;
}

/**
 * Coming up from the burrower's body (head first, in the plane), the head facing `dir` (0 = +u,
 * pi / 2 = up), in slab `s` with its map `m` (`mapEmerge`). It comes out facing along the cut
 * (spec 4.2): the way its head points along u (or toward the slab's middle when it points up or
 * down), unless only the other way is clear (`emergeSides`), or both are and only the other stays
 * in the playable slab. Sets `p.seconds`: the move's length with the head's speed capped.
 */
export function buildEmerge(p: BodyPath, s: Slab, m: EmergeMap, us: ArrayLike<number>, vs: ArrayLike<number>, dir: number): void {
  frame(p, s);
  p.sink = false;
  p.count = 0;
  for (let i = N - 1; i >= 0; i--) push(p, us[i], vs[i]);
  const body = p.count;
  p.headFrom = p.s[body - 1];
  for (let i = 0; i < N; i++) p.back[i] = p.headFrom - p.s[body - 1 - i];
  const hu = us[0];
  const cu = Math.cos(dir);
  const want = Math.abs(cu) > 0.2 ? Math.sign(cu) : hu < (s.playLo + s.playHi) / 2 ? 1 : -1;
  const sides = emergeSides(m, hu);
  const ok = (sign: number): boolean => (sides & (sign > 0 ? 1 : 2)) !== 0;
  const inSlab = (sign: number): boolean => {
    const end = hu + sign * (LAND_MAX + OUT_LENGTH);
    return end >= s.playLo && end <= s.playHi;
  };
  let sign = want;
  if (ok(want) !== ok(-want)) sign = ok(want) ? want : -want;
  else if (!inSlab(want) && inSlab(-want)) sign = -want;
  rise(p, s, dir, sign);
  // Speeds up and slows down over RAMP_S, cruising at no more than HEAD_SPEED; never quicker than spec.
  const length = p.headTo - p.headFrom;
  p.seconds = Math.max(RISE_S + OUT_S, length / HEAD_SPEED + RAMP_S);
  p.ramp = RAMP_S / p.seconds;
}
