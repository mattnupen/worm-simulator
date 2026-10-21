import { WORM_SEGMENTS, wormBody } from '../worm/bodyLength';
import { arc, frame, push, restAt, sampleAt, wrap, TURN_RADIUS, type BodyPath } from './bodyPath';
import { fitSlide, slidePose } from './slidePath';
import { OUT_S, RISE_S } from './modeMachine';
import { emergeSides, LAND_MAX, LAND_MIN, OUT_LENGTH, type EmergeMap } from './emergeMap';
import { arcRun, bendFront, front, landOnFloor, nearestAlong, sweepOf } from './riseArcs';
import { frontUnderTop, goal, plan, planRise, RADII, TIGHT_RADIUS } from './risePlan';
import type { Slab } from './slab';
import { hypot2 } from '../core/vec';

/**
 * Coming up out of the cut (V2 spec 4.2): the path the body slides along. Coming up should look like
 * the worm simply crawling up and out: the body slides up its own tunnel and on along a rise from
 * the head as it lies (risePlan.ts: the rise that turns the head least and dips least, either way
 * out the emerge map allows, under the litter's top less TOP_KEEP), arriving on the floor at its
 * slope; then it crawls OUT_LENGTH along the floor under the litter, its whole body out, lying along
 * the cut. Only where no rise from the head fits (say, right at the top facing up) does the body's
 * front first bend round into the way the rise must start, easing onto that bend as the move
 * begins. Built once per coming up (slidePath.ts poses it); the slab's emerge map (emergeMap.ts)
 * says where coming up is possible at all.
 */
const N = WORM_SEGMENTS;
/** With no room for a rise as the head faces, the front bends round this much at a time (radians)... */
const TURN_STEP = Math.PI / 18;
/** ...the body's last ROUND segments bending as one arc into the new way. */
const ROUND = 6;
/** Coming up never takes longer than this for the sake of the speed caps (see fitSlide). */
export const LONGEST = 5.8;
/** Coming up, the head cruises at no more than this (u/s; the crawl's top speed is 1.6). */
export const HEAD_SPEED = 2.4;
/** A front point eases onto the path this far ahead of the nearest place to it (see buildEmerge). */
const LEAD = 0.03;
/** The run along the floor is drawn this finely (about 0.02 u, ending exactly OUT_LENGTH out): the body
 * lies on the floor itself there, so its points stay the worm's gap apart as the crawl keeps them. */
const RUN_DX = OUT_LENGTH / Math.ceil(OUT_LENGTH / 0.02);
/** The best plan over the ways out, with what it aimed at (see buildEmerge). */
const kept = { ...plan, sign: 1, ev: 0, out: 0, eu: 0, lie: true };
function keep(sign: number, eu: number): void {
  Object.assign(kept, plan);
  kept.sign = sign;
  kept.ev = goal.ev;
  kept.out = goal.out;
  kept.eu = eu;
  kept.lie = front.lie;
}
function restore(): void {
  plan.a0 = kept.a0; plan.r = kept.r; plan.rho = kept.rho; plan.climb = kept.climb; plan.straight = kept.straight;
  goal.sign = kept.sign; goal.ev = kept.ev; goal.out = kept.out;
  front.lie = kept.lie;
  if (!kept.lie) bendFront(kept.a0);
}
/**
 * Plans the rise, for the way out in `goal`. From the head as it lies (`fromHead`): the body slides
 * up its own tunnel and on along the rise. Otherwise from the front bent round as little as will
 * do (the head swinging to its new start as the move begins), for when no rise from the head fits.
 * Returns where it lands (u), or NaN if nothing fits.
 */
function chooseRise(neck: number, fromHead: boolean): number {
  plan.cost = Infinity;
  front.lie = fromHead;
  if (fromHead) {
    front.fu = goal.hu;
    front.fv = goal.hv;
    for (let k = 0; k < RADII.length; k++) planRise(front.fu, front.fv, neck, RADII[k], false);
    if (plan.cost === Infinity) return NaN;
  } else {
    for (let k = 0; k <= 36 && plan.cost === Infinity; k++) {
      const a0 = neck + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * TURN_STEP;
      bendFront(a0);
      if (front.r < TIGHT_RADIUS * 2 || !frontUnderTop()) continue;
      planRise(front.fu, front.fv, a0, TURN_RADIUS, false);
      planRise(front.fu, front.fv, a0, TIGHT_RADIUS, false);
    }
    // Nothing fits under the top: keep at least the front under it.
    for (let k = 0; k <= 36 && plan.cost === Infinity; k++) {
      const a0 = neck + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * TURN_STEP;
      bendFront(a0);
      if (front.r >= TIGHT_RADIUS * 2 && frontUnderTop()) planRise(front.fu, front.fv, a0, TURN_RADIUS, true);
    }
    if (plan.cost === Infinity) {
      bendFront(neck);
      planRise(front.fu, front.fv, neck, TURN_RADIUS, true);
    }
    bendFront(plan.a0);
  }
  const { a0, r, rho, climb, straight } = plan;
  const sw = sweepOf(a0, climb, rho);
  const d3 = wrap(goal.out - climb);
  return front.fu + arcRun(r, a0, rho, sw) + straight * Math.cos(climb) + arcRun(r, climb, d3 >= 0 ? 1 : -1, Math.abs(d3));
}

/** Settles the plan for the way out `sign`: where it lands sets the floor's height and slope it aims at. */
function settle(p: BodyPath, neck: number, sign: number, fromHead: boolean): number {
  goal.sign = sign;
  let eu = goal.hu + (sign * (LAND_MIN + LAND_MAX)) / 2;
  for (let pass = 0; pass < 8; pass++) {
    aimAt(p, eu);
    const was = eu;
    eu = chooseRise(neck, fromHead);
    if (Number.isNaN(eu) || Math.abs(eu - was) < 1e-4) break;
  }
  return eu;
}

/** Aims the rise at the floor where it lands (u): its height and, the way out, its slope. */
function aimAt(p: BodyPath, eu: number): void {
  goal.ev = restAt(p, eu, 0);
  // Along the run's first step: the rise arrives the way the run leaves (the floor can crease).
  const dx = goal.sign * RUN_DX;
  goal.out = Math.atan2(restAt(p, eu + dx, 0) - goal.ev, dx);
}

/**
 * Coming up from the burrower's body (head first, in the plane), the head facing `dir` (0 = +u,
 * pi / 2 = up), in slab `s` with its map `m` (`mapEmerge`). It comes out facing along the cut
 * (spec 4.2), crawling up and out the way that needs the least turning and no dip, on a way out the
 * map allows (`emergeSides`), and one that stays in the playable slab if either does. Sets
 * `p.seconds` (fitted to the speed caps, at least RISE_S + OUT_S).
 */
export function buildEmerge(p: BodyPath, s: Slab, m: EmergeMap, us: ArrayLike<number>, vs: ArrayLike<number>, dir: number): void {
  frame(p, s);
  p.posing = slidePose;
  // It comes out at the worm's length now (a change while it comes up eases in on the surface: crawl.ts).
  p.spacing = wormBody.spacing;
  const hu = us[0];
  const cu = Math.cos(dir);
  const want = Math.abs(cu) > 0.2 ? Math.sign(cu) : hu < (s.playLo + s.playHi) / 2 ? 1 : -1;
  const sides = emergeSides(m, hu);
  const ok = (sign: number): boolean => (sides & (sign > 0 ? 1 : 2)) !== 0;
  const inSlab = (sign: number): boolean => {
    const end = hu + sign * (LAND_MAX + OUT_LENGTH);
    return end >= s.playLo && end <= s.playHi;
  };
  goal.s = s;
  goal.hu = hu;
  goal.hv = vs[0];
  // The front: as it lies from point ROUND to the head.
  front.bu = us[ROUND];
  front.bv = vs[ROUND];
  front.from = Math.atan2(vs[ROUND] - vs[ROUND + 1], us[ROUND] - us[ROUND + 1]);
  front.len = 0;
  for (let i = 0; i < ROUND; i++) front.len += hypot2(us[i + 1] - us[i], vs[i + 1] - vs[i]);
  const neck = Math.atan2(vs[0] - vs[1], us[0] - us[1]);
  // From the head as it lies, either way out the map allows (one that stays in the playable slab if
  // there is one): the plan that turns the head least and dips least.
  const slabbed = ok(1) && ok(-1) && inSlab(1) !== inSlab(-1);
  kept.cost = Infinity;
  for (let sign = -1; sign <= 1; sign += 2) {
    if (!ok(sign) && (ok(-sign) || sign !== want)) continue;
    if (slabbed && !inSlab(sign)) continue;
    const eu = settle(p, neck, sign, true);
    if (!Number.isNaN(eu) && plan.cost < kept.cost) keep(sign, eu);
  }
  if (kept.cost === Infinity) {
    // No rise from the head fits (say, at the top facing up): the front bends round first.
    let sign = want;
    if (ok(want) !== ok(-want)) sign = ok(want) ? want : -want;
    else if (!inSlab(want) && inSlab(-want)) sign = -want;
    keep(sign, settle(p, neck, sign, false));
    kept.lie = false;
  }
  const sign = kept.sign;
  restore();
  // The body up to point ROUND as it lies, then the front bent into its arc, then the rise.
  p.count = 0;
  for (let i = N - 1; i >= (front.lie ? 0 : ROUND); i--) push(p, us[i], vs[i]);
  const roundAt = front.lie ? N - 1 - ROUND : p.count - 1;
  if (!front.lie && Number.isFinite(front.r)) arc(p, front.from, front.rho, front.turn, front.r);
  else if (!front.lie) push(p, front.fu, front.fv);
  const headAt = p.count - 1;
  const riseFrom = p.s[headAt];
  // The rise, landing exactly on the floor (the last pass's small miss spread along it), then the run.
  const { a0, r, rho, climb, straight } = plan;
  arc(p, a0, rho, sweepOf(a0, climb, rho), r);
  if (straight > 1e-6) push(p, p.u[p.count - 1] + straight * Math.cos(climb), p.v[p.count - 1] + straight * Math.sin(climb));
  const d3 = wrap(goal.out - climb);
  arc(p, climb, d3 >= 0 ? 1 : -1, Math.abs(d3), r);
  let eu = p.u[p.count - 1];
  landOnFloor(p, headAt, sign * RUN_DX);
  p.exitAt = p.s[p.count - 1];
  // The run along the floor, every RUN_DX and ending exactly OUT_LENGTH out.
  for (let k = 1; k * RUN_DX <= OUT_LENGTH + 1e-9; k++) {
    const x = k * RUN_DX;
    push(p, eu + sign * x, restAt(p, eu + sign * x, 0));
  }
  p.headTo = p.s[p.count - 1];
  p.exitSign = sign;
  p.exitU = eu;
  // Each front point's place along the path: the nearest to where it lay, a little ahead, so that
  // easing onto the path never moves it back against the way it will slide; the body's order kept.
  let ahead = p.s[roundAt];
  for (let i = ROUND - 1; i >= 0 && !front.lie; i--) {
    const near = nearestAlong(p, us[i], vs[i], roundAt, riseFrom + 1.5) + LEAD;
    // Never closer than half its segment to the next back, nor further than a hair over the gap
    // (under the 4% stretch the tests allow; any closer and easing on could pull it backward).
    ahead = Math.min(ahead + p.spacing * 1.03, Math.max(near, ahead + 0.5 * hypot2(us[i + 1] - us[i], vs[i + 1] - vs[i])));
    p.back[i] = ahead; // its place for now; made relative to the head's below
  }
  p.headFrom = front.lie ? p.s[headAt] : p.back[0];
  for (let i = 0; i < N; i++) p.back[i] = p.headFrom - (i >= ROUND || front.lie ? p.s[N - 1 - i] : p.back[i]);
  // Where each point really lay, less where the path puts it at the start (only the front differs).
  let most = 0;
  for (let i = 0; i < N; i++) {
    sampleAt(p, p.headFrom - p.back[i], p.offU, p.offV, i);
    p.offU[i] = us[i] - p.offU[i];
    p.offV[i] = vs[i] - p.offV[i];
    most = Math.max(most, hypot2(p.offU[i], p.offV[i]));
  }
  // The front bent round to start the rise (or lay well off the arc): it bends onto it before sliding.
  p.turnFirst = !front.lie && (Math.abs(wrap(plan.a0 - neck)) > 1e-6 || most > 0.03);
  p.seconds = fitSlide(p, RISE_S + OUT_S, HEAD_SPEED, LONGEST);
}
