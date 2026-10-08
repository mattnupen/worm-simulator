import { TOP_KEEP } from './burrowMotion';
import { wrap, TURN_RADIUS } from './bodyPath';
import { LAND_MAX, LAND_MIN } from './emergeMap';
import { arcLow, arcRise, arcRun, front, sweepOf } from './riseArcs';
import { boundaryAt, B_TOP, type Slab } from './slab';

/**
 * Planning the rise out of the cut (emergePath.ts): from a start and facing, an arc (either way
 * round) to a climb or descent, a straight, and an arc arriving on the floor at its slope, under the
 * litter's top less TOP_KEEP. Of all such, the one that turns the head least and dips least below
 * where it starts or lands (a little for length and tight bends too). Pure.
 */
/** The tightest bend the body takes smoothly (neighbouring segments then meet at about 39 degrees). */
export const TIGHT_RADIUS = 0.33;
/** From the head as it lies, the bend radii tried: tighter ones only where there is no room (they cost more). */
export const RADII = [TURN_RADIUS, 0.39, TIGHT_RADIUS, 0.31];
/** A tighter bend's cost, per (TURN_RADIUS / r - 1). */
const TIGHT_COST = 1;
/** The steepest climb (or descent) toward the floor, in degrees: straight up or down at most. */
const CLIMB_MAX = 90;
/** A plan's cost: its head's total turn (radians), plus this per unit it dips, and this per unit long. */
const DIP_COST = 8;
const LENGTH_COST = 0.3;
const DEG = Math.PI / 180;
/** Plans keep this much under the top too: what the landing's small correction may lift a rise by. */
const ROOF_SPARE = 0.01;
/** A planned rise is checked against the top this often along it (u). */
const CHECK = 0.01;
/** The rise chosen: the start's facing, the bend radius, the first arc's way, the climb angle, the straight. */
export const plan = { a0: 0, r: TURN_RADIUS, rho: 1, climb: 0, straight: 0, cost: Infinity };
/** What planRise works against: the slab, the way out, the floor's height and slope where it lands, where the head lay. */
export const goal = { s: null as Slab | null, sign: 1, ev: 0, out: 0, hu: 0, hv: 0 };

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
 * The best rise from (hu, hv) facing a0 with bends of radius r, landing LAND_MIN to LAND_MAX along the
 * way out and under the litter's top (unless `free`): the one that turns the head least and dips
 * least below where it starts or lands (a little for length too). Writes `plan` when it beats it.
 */
export function planRise(hu: number, hv: number, a0: number, r: number, free: boolean): void {
  const { sign, ev, out } = goal;
  for (let deg = -CLIMB_MAX; deg <= CLIMB_MAX; deg += 2) {
    if (deg === 0) continue;
    const phi = sign > 0 ? deg * DEG : Math.PI - deg * DEG;
    const d3 = wrap(out - phi);
    const rho3 = d3 >= 0 ? 1 : -1;
    for (let rho = -1; rho <= 1; rho += 2) {
      const sw = sweepOf(a0, phi, rho);
      const rise1 = arcRise(r, a0, rho, sw);
      const straight = (ev - hv - rise1 - arcRise(r, phi, rho3, Math.abs(d3))) / Math.sin(phi);
      if (straight < 0) continue;
      const length = r * (sw + Math.abs(d3)) + straight;
      // How far it dips below the lower of its start and its landing.
      const low = Math.min(arcLow(r, a0, rho, sw), rise1 + Math.min(0, straight * Math.sin(phi)) + arcLow(r, phi, rho3, Math.abs(d3)));
      const dip = Math.max(0, Math.min(0, ev - hv) - low);
      const cost = sw + Math.abs(d3) + DIP_COST * dip + LENGTH_COST * length + TIGHT_COST * (TURN_RADIUS / r - 1);
      // The tightest bend only to keep under the top, never for a loop down and round.
      if (cost >= plan.cost || (r < TIGHT_RADIUS && dip > 0)) continue;
      // Where it lands, from where the head lay (the emerge map counts from there).
      const along = sign * (hu - goal.hu + arcRun(r, a0, rho, sw) + straight * Math.cos(phi) + arcRun(r, phi, rho3, Math.abs(d3)));
      if (!free && (along < LAND_MIN || along > LAND_MAX || !underTop(hu, hv, a0, r, rho, phi, straight))) continue;
      plan.cost = cost;
      plan.a0 = a0;
      plan.r = r;
      plan.rho = rho;
      plan.climb = phi;
      plan.straight = straight;
    }
  }
}

/** Whether the bent front stays under the litter's top (it is the start of what the head goes through). */
export function frontUnderTop(): boolean {
  for (let k = 1; k <= 8; k++) {
    const sw = (front.turn * k) / 8;
    const u = Number.isFinite(front.r) ? front.bu + arcRun(front.r, front.from, front.rho, sw) : front.bu + (front.len * k * Math.cos(front.from)) / 8;
    const v = Number.isFinite(front.r) ? front.bv + arcRise(front.r, front.from, front.rho, sw) : front.bv + (front.len * k * Math.sin(front.from)) / 8;
    if (!underRoof(u, v, -1e-6)) return false;
  }
  return true;
}

