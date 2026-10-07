import { WORM_SEGMENTS } from '../game/crawl';
import { TOP_KEEP } from './burrowMotion';
import { arc, fitSeconds, frame, push, restAt, sampleAt, wrap, TURN_RADIUS, type BodyPath } from './bodyPath';
import { OUT_S, RISE_S } from './modeMachine';
import { emergeSides, LAND_MAX, LAND_MIN, OUT_LENGTH, type EmergeMap } from './emergeMap';
import { arcRise, arcRun, bendFront, front, sweepOf } from './riseArcs';
import { boundaryAt, B_TOP, type Slab } from './slab';

/**
 * Coming up out of the cut (V2 spec 4.2): the path the body slides along, from the tail through the
 * head, up to the floor and along it. The rise is the shortest of: an arc (either way round) to a
 * climb or descent angle, a straight, and an arc arriving on the floor at its slope. It never goes
 * above the line TOP_KEEP under the litter's top (it would loop out of the leaves): where there is
 * no room it bends tighter (TIGHT_RADIUS), and if even that will not do, the body's front first
 * bends round into the way the rise must start (a head at the top facing up dips its head down
 * first), easing onto that bend as the move begins. Then the worm crawls OUT_LENGTH along the floor under
 * the litter, its whole body out, lying along the cut. Built once per coming up (bodyPath.ts poses
 * it); the slab's emerge map (emergeMap.ts) says where coming up is possible at all.
 */
const N = WORM_SEGMENTS;
/** The tightest bend the body takes smoothly (neighbouring segments then meet at about 39 degrees). */
const TIGHT_RADIUS = 0.33;
/** The steepest climb (or descent) toward the floor, in degrees. */
const CLIMB_MAX = 60;
/** With no room for a rise as the head faces, the front bends round this much at a time (radians)... */
const TURN_STEP = Math.PI / 18;
/** ...the body's last ROUND segments bending as one arc into the new way. */
const ROUND = 6;
/** Coming up, the head cruises at no more than this (u/s; the crawl's top speed is 1.6). */
export const HEAD_SPEED = 1.8;
const DEG = Math.PI / 180;
/** Plans keep this much under the top too: what the landing's small correction may lift a rise by. */
const ROOF_SPARE = 0.01;
/** A planned rise is checked against the top this often along it (u). */
const CHECK = 0.01;
/** The rise chosen: the start's facing, the bend radius, the first arc's way, the climb angle, the straight. */
const plan = { a0: 0, r: TURN_RADIUS, rho: 1, climb: 0, straight: 0 };
/** What planRise works against: the slab, the way out, the floor's height and slope where it lands, where the head lay. */
const goal = { s: null as Slab | null, sign: 1, ev: 0, out: 0, hu: 0 };

/** Whether (u, v) is under the line TOP_KEEP below the litter's top (or the landing height), with `spare` to boot. */
function underRoof(u: number, v: number, spare: number): boolean {
  return v <= Math.max(boundaryAt(goal.s!, B_TOP, u) - TOP_KEEP - spare, goal.ev);
}

/**
 * Whether the arc of radius r from (u, v) facing a0, turning `rho` through `sweep`, stays under the
 * top every CHECK, its spare growing from `done` to `done` + its length out of `total` (see underTop).
 */
function arcUnder(u: number, v: number, a0: number, rho: number, sweep: number, r: number, done: number, total: number): boolean {
  const n = Math.ceil((r * sweep) / CHECK);
  for (let k = 1; k <= n; k++) {
    const a = a0 + (rho * sweep * k) / n;
    const spare = (ROOF_SPARE * (done + (r * sweep * k) / n)) / total;
    if (!underRoof(u + r * rho * (Math.sin(a) - Math.sin(a0)), v - r * rho * (Math.cos(a) - Math.cos(a0)), spare)) return false;
  }
  return true;
}

/**
 * Whether the rise (from hu, hv) stays under the litter's top less TOP_KEEP, checked every CHECK along
 * its two arcs and the straight (a start along a top that slopes down shows at once). The landing's
 * small correction (spread along the rise from nothing at the head) may lift it by up to ROOF_SPARE
 * at the far end, so the spare grows along it the same way.
 */
function underTop(hu: number, hv: number, a0: number, r: number, rho: number, phi: number, straight: number): boolean {
  const sw1 = sweepOf(a0, phi, rho);
  const d3 = wrap(goal.out - phi);
  const l1 = r * sw1;
  const total = Math.max(1e-9, l1 + straight + r * Math.abs(d3));
  if (!arcUnder(hu, hv, a0, rho, sw1, r, 0, total)) return false;
  const u0 = hu + arcRun(r, a0, rho, sw1);
  const v0 = hv + arcRise(r, a0, rho, sw1);
  const n = Math.ceil(straight / CHECK);
  for (let k = 1; k <= n; k++) {
    const x = (straight * k) / n;
    if (!underRoof(u0 + x * Math.cos(phi), v0 + x * Math.sin(phi), (ROOF_SPARE * (l1 + x)) / total)) return false;
  }
  const u1 = u0 + straight * Math.cos(phi);
  const v1 = v0 + straight * Math.sin(phi);
  return arcUnder(u1, v1, phi, d3 >= 0 ? 1 : -1, Math.abs(d3), r, l1 + straight, total);
}

/**
 * The shortest rise from the head (hu, hv) facing a0 with bends of radius r, landing LAND_MIN to
 * LAND_MAX along the way out and under the litter's top (unless `free`). Writes `plan`; false if none.
 */
function planRise(hu: number, hv: number, a0: number, r: number, free: boolean): boolean {
  const { sign, ev, out } = goal;
  let best = Infinity;
  for (let deg = -CLIMB_MAX; deg <= CLIMB_MAX; deg += 2) {
    if (deg === 0) continue;
    const phi = sign > 0 ? deg * DEG : Math.PI - deg * DEG;
    const d3 = wrap(out - phi);
    const rho3 = d3 >= 0 ? 1 : -1;
    for (let rho = -1; rho <= 1; rho += 2) {
      const sw = sweepOf(a0, phi, rho);
      const straight = (ev - hv - arcRise(r, a0, rho, sw) - arcRise(r, phi, rho3, Math.abs(d3))) / Math.sin(phi);
      const length = r * (sw + Math.abs(d3)) + straight;
      if (straight < 0 || length >= best) continue;
      // Where it lands, from where the head lay (the emerge map counts from there).
      const along = sign * (hu - goal.hu + arcRun(r, a0, rho, sw) + straight * Math.cos(phi) + arcRun(r, phi, rho3, Math.abs(d3)));
      if (!free && (along < LAND_MIN || along > LAND_MAX || !underTop(hu, hv, a0, r, rho, phi, straight))) continue;
      best = length;
      plan.a0 = a0;
      plan.r = r;
      plan.rho = rho;
      plan.climb = phi;
      plan.straight = straight;
    }
  }
  return best < Infinity;
}

/** Whether the bent front stays under the litter's top (it is the start of what the head goes through). */
function frontUnderTop(): boolean {
  for (let k = 1; k <= 8; k++) {
    const sw = (front.turn * k) / 8;
    const u = Number.isFinite(front.r) ? front.bu + arcRun(front.r, front.from, front.rho, sw) : front.bu + (front.len * k * Math.cos(front.from)) / 8;
    const v = Number.isFinite(front.r) ? front.bv + arcRise(front.r, front.from, front.rho, sw) : front.bv + (front.len * k * Math.sin(front.from)) / 8;
    if (!underRoof(u, v, -1e-6)) return false;
  }
  return true;
}

/**
 * Plans the rise: from the head as it faces if it can; else from the front bent round as little as
 * will do (the head swinging to its new start as the move begins). Returns where it lands (u).
 */
function chooseRise(neck: number): number {
  let found = false;
  for (let k = 0; k <= 36 && !found; k++) {
    const a0 = neck + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * TURN_STEP;
    bendFront(a0);
    if (front.r < TIGHT_RADIUS * 2 || !frontUnderTop()) continue;
    found = planRise(front.fu, front.fv, a0, TURN_RADIUS, false) || planRise(front.fu, front.fv, a0, TIGHT_RADIUS, false);
  }
  // Nothing fits under the top: keep at least the front under it, the rise as short as it can be.
  for (let k = 0; k <= 36 && !found; k++) {
    const a0 = neck + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * TURN_STEP;
    bendFront(a0);
    if (front.r >= TIGHT_RADIUS * 2 && frontUnderTop()) found = planRise(front.fu, front.fv, a0, TURN_RADIUS, true);
  }
  if (!found) {
    bendFront(neck);
    planRise(front.fu, front.fv, neck, TURN_RADIUS, true);
  }
  const { a0, r, rho, climb, straight } = plan;
  bendFront(a0);
  const sw = sweepOf(a0, climb, rho);
  const d3 = wrap(goal.out - climb);
  return front.fu + arcRun(r, a0, rho, sw) + straight * Math.cos(climb) + arcRun(r, climb, d3 >= 0 ? 1 : -1, Math.abs(d3));
}

/** Aims the rise at the floor where it lands (u): its height and, the way out, its slope. */
function aimAt(p: BodyPath, eu: number): void {
  goal.ev = restAt(p, eu, 0);
  const g = (restAt(p, eu + 0.05, 0) - restAt(p, eu - 0.05, 0)) / 0.1;
  goal.out = Math.atan2(goal.sign * g, goal.sign);
}

/**
 * Coming up from the burrower's body (head first, in the plane), the head facing `dir` (0 = +u,
 * pi / 2 = up), in slab `s` with its map `m` (`mapEmerge`). It comes out facing along the cut
 * (spec 4.2): the way its head points along u (or toward the slab's middle when it points up or
 * down), unless only the other way is clear (`emergeSides`), or both are and only the other stays
 * in the playable slab. Sets `p.seconds` (fitted to the speed caps, at least RISE_S + OUT_S).
 */
export function buildEmerge(p: BodyPath, s: Slab, m: EmergeMap, us: ArrayLike<number>, vs: ArrayLike<number>, dir: number): void {
  frame(p, s);
  p.posing = null;
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
  goal.s = s;
  goal.sign = sign;
  goal.hu = hu;
  // The front: as it lies from point ROUND to the head.
  front.bu = us[ROUND];
  front.bv = vs[ROUND];
  front.from = Math.atan2(vs[ROUND] - vs[ROUND + 1], us[ROUND] - us[ROUND + 1]);
  front.len = 0;
  for (let i = 0; i < ROUND; i++) front.len += Math.hypot(us[i + 1] - us[i], vs[i + 1] - vs[i]);
  // The floor's height and slope where it lands depend on where it lands: settle that in a few passes.
  const neck = Math.atan2(vs[0] - vs[1], us[0] - us[1]);
  let eu = hu + (sign * (LAND_MIN + LAND_MAX)) / 2;
  for (let pass = 0; pass < 3; pass++) {
    aimAt(p, eu);
    eu = chooseRise(neck);
  }
  // The body up to point ROUND as it lies, then the front bent into its arc, then the rise.
  p.count = 0;
  for (let i = N - 1; i >= ROUND; i--) push(p, us[i], vs[i]);
  if (Number.isFinite(front.r)) arc(p, front.from, front.rho, front.turn, front.r);
  else push(p, front.fu, front.fv);
  const headAt = p.count - 1;
  p.headFrom = p.s[headAt];
  // Each point's place along it: as it lay along the body (the front's share of the arc by its own spacing).
  const curve = p.headFrom - p.s[N - 1 - ROUND];
  let along = 0;
  for (let i = 0; i < N; i++) {
    p.back[i] = i >= ROUND ? p.headFrom - p.s[N - 1 - i] : (along / Math.max(1e-9, front.len)) * curve;
    if (i < ROUND) along += Math.hypot(us[i + 1] - us[i], vs[i + 1] - vs[i]);
  }
  // The rise, landing exactly on the floor (the last pass's small miss spread along it), then the run.
  const { a0, r, rho, climb, straight } = plan;
  arc(p, a0, rho, sweepOf(a0, climb, rho), r);
  if (straight > 1e-6) push(p, p.u[p.count - 1] + straight * Math.cos(climb), p.v[p.count - 1] + straight * Math.sin(climb));
  const d3 = wrap(goal.out - climb);
  arc(p, climb, d3 >= 0 ? 1 : -1, Math.abs(d3), r);
  eu = p.u[p.count - 1];
  const miss = restAt(p, eu, 0) - p.v[p.count - 1];
  const span = Math.max(1e-9, p.s[p.count - 1] - p.headFrom);
  for (let i = headAt + 1; i < p.count; i++) p.v[i] += (miss * (p.s[i] - p.headFrom)) / span;
  p.exitAt = p.s[p.count - 1];
  for (let x = 0.25; x <= OUT_LENGTH + 1e-9; x += 0.25) push(p, eu + sign * x, restAt(p, eu + sign * x, 0));
  p.headTo = p.s[p.count - 1];
  p.exitSign = sign;
  p.exitU = eu;
  // Where each point really lay, less where the path puts it at the start (only the rounded part differs).
  let most = 0;
  for (let i = 0; i < N; i++) {
    sampleAt(p, p.headFrom - p.back[i], p.offU, p.offV, i);
    p.offU[i] = us[i] - p.offU[i];
    p.offV[i] = vs[i] - p.offV[i];
    most = Math.max(most, Math.hypot(p.offU[i], p.offV[i]));
  }
  p.turnFirst = most > 0.01;
  p.seconds = fitSeconds(p, RISE_S + OUT_S, HEAD_SPEED);
}
