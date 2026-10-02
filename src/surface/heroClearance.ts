import { detailShape } from './detailShape';
import { LEAF_KINDS } from './leafLitter';
import { segmentToBox } from '../core/geom2d';
import { leafLift, type LeafForm } from './leafForm';

/**
 * How a hero leaf lies over the worm without cutting into it (pure; used by heroLeaves.ts).
 *
 * The leaf is a rigid plate: its base plane (every point of a face-up leaf lies on or above it;
 * the mesh raises a face-down leaf onto its rim) is tilted down away from the body by `tilt`
 * (tan of the pitch) and held `lift` above the litter at its centre. The body is a tube along
 * its pushers (consecutive ones joined): across it, a dome `top` high at the spine that falls
 * by `fall` to its side at `radius` (an ellipse, the drawn cross-section's shape), then a short
 * skirt. The leaf's plane must clear the tube by LEAF_CLEAR over the whole leaf (checked in
 * strips across the tilt, each bounded by the leaf's outline within it), its far edge must stay
 * on (or above) the litter, and among the tilts that do, the leaf takes the one with the lowest
 * centre (where a rigid plate comes to rest). Each constraint is linear in (lift, tilt), so the
 * least lift for a tilt is the top of a few lines; the best tilt is found by golden-section
 * search on that convex function. Module scratch only: nothing is allocated per call.
 */

/**
 * Floats per pusher: [x, z, radius, strength, top, under, belly, fall]. `fall`: how far the top
 * surface drops from the spine to the body's side (0, a flat-topped dome, is always safe).
 */
export const PUSHER_STRIDE = 8;
/**
 * A body point stands for the tube up to halfway to its neighbours along the spine (at most
 * this far: half the crawl's 0.11 m pusher spacing, plus the spine's bend between them).
 * Consecutive body points closer than LINK are one stretch of tube: each one's dome runs along
 * the spine to the midpoints with its neighbours, and the drawn spine (a curve through them)
 * strays at most BEND from those straight pieces.
 */
export const PUSHER_SPAN = 0.07;
const LINK = 0.2;
const BEND = 0.015;
/** A pusher with at least this strength is the head. */
export const HEAD_STRENGTH = 0.9;
/** A leaf over the worm clears its top by this (m). */
export const LEAF_CLEAR = 0.01;
/** Steepest tilt across the body (35 degrees): beyond 45 a cupped leaf's rim would dip under its plane. */
export const MAX_TILT = Math.tan(0.6);
/** A leaf flattens over this distance (m) before a body point riding over the litter can reach it. */
const PRESS_RAMP = 0.1;
/**
 * Beyond the body's side the leaf is eased up over this distance (m): a skirt falling from the
 * side of the dome to the litter, so a leaf rises as the worm noses under its edge instead of
 * jumping up when the side arrives.
 */
const SKIRT = 0.04;
/** The leaf is checked against the body in this many strips across its tilt. */
const STRIPS = 24;
const MAX_LINES = 1 + STRIPS;
/** The longest leaf outline (points): scratch for it in the tilt frame. */
const MAX_OUTLINE = 64;
const outA = new Float64Array(MAX_OUTLINE);
const outP = new Float64Array(MAX_OUTLINE);
/** The body points near the leaf (at most MAX_NEAR): their spine stretch in the tilt frame and dome. */
const MAX_NEAR = 64;
const NEAR_STRIDE = 7;
const nearBody = new Float64Array(MAX_NEAR * NEAR_STRIDE);
const GOLDEN = (Math.sqrt(5) - 1) / 2;

/** Leaf-local outline (u, v) of every species, and its farthest point from the centre. */
const OUTLINE = LEAF_KINDS.map((k) => {
  const s = detailShape(k);
  if (s.outline > MAX_OUTLINE) throw new Error(`heroClearance: ${k} outline exceeds ${MAX_OUTLINE} points`);
  return s.points.slice(0, s.outline * 2);
});
export const LEAF_REACH = Float32Array.from(OUTLINE, (o) => {
  let r = 0;
  for (let j = 0; j < o.length; j += 2) r = Math.max(r, Math.hypot(o[j], o[j + 1]));
  return r;
});
/** Half the leaf's width across its midrib: how far a leaf turning over swings below its centre. */
const LEAF_HALF_WIDTH = Float32Array.from(OUTLINE, (o) => {
  let r = 0;
  for (let j = 0; j < o.length; j += 2) r = Math.max(r, Math.abs(o[j]));
  return r;
});

/** The hero leaves' 3D form (leaf units): every point lies on or above the leaf's base plane. */
export const HERO_FORM: LeafForm = { fold: 0.16, cup: 0.3, curl: 0.24 };
/** Per species, the form's highest point above the base plane (leaf units). */
export const LEAF_RIM = Float32Array.from(LEAF_KINDS, (k) => {
  const pts = detailShape(k).points;
  let h = 0;
  for (let j = 0; j < pts.length; j += 2) h = Math.max(h, leafLift(pts[j], pts[j + 1], HERO_FORM));
  return h;
});
/** sin of the steepest tilt. */
const SIN_MAX_TILT = Math.sin(Math.atan(MAX_TILT));

/** The least lift above the litter for tilt t is max(0, A + B t) over these lines. */
const lineA = new Float64Array(MAX_LINES);
const lineB = new Float64Array(MAX_LINES);
let lines = 0;

/** Least centre lift (m above the litter) that clears every constraint at tilt t (tan of the pitch). */
export function liftForTilt(t: number): number {
  let l = 0;
  for (let j = 0; j < lines; j++) l = Math.max(l, lineA[j] + lineB[j] * t);
  return l;
}

/** The tilt in [0, MAX_TILT] needing the least lift (golden-section search on a convex function). */
export function bestTilt(): number {
  let a = 0;
  let b = MAX_TILT;
  let c = b - GOLDEN * (b - a);
  let d = a + GOLDEN * (b - a);
  let fc = liftForTilt(c);
  let fd = liftForTilt(d);
  for (let it = 0; it < 30; it++) {
    if (fc <= fd) {
      b = d; d = c; fd = fc;
      c = b - GOLDEN * (b - a);
      fc = liftForTilt(c);
    } else {
      a = c; c = d; fc = fd;
      d = a + GOLDEN * (b - a);
      fd = liftForTilt(d);
    }
  }
  const t = (a + b) / 2;
  // The flat leaf wins ties (a leaf lying level is the natural rest).
  return liftForTilt(0) <= liftForTilt(t) + 1e-6 ? 0 : t;
}

/**
 * How far the leaf (species `kind`, length `size`, as it lies: yaw and flip) reaches from its
 * centre in the ground direction (ux, uz): the most any outline point lies along it.
 */
export function reachToward(kind: number, size: number, yaw: number, flip: number, ux: number, uz: number): number {
  const o = OUTLINE[kind];
  const cf = Math.cos(flip);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  let r = 0;
  for (let j = 0; j < o.length; j += 2) {
    const xl = o[j] * cf;
    const zl = -o[j + 1];
    const proj = (xl * cy + zl * sy) * ux + (zl * cy - xl * sy) * uz;
    if (proj > r) r = proj;
  }
  return r * size;
}

/** Whether the head pusher at offset `o`, (dx, dz) from the leaf's centre, touches its outline. */
function touches(
  pushers: Float32Array, o: number, dx: number, dz: number, d2: number,
  kind: number, size: number, yaw: number, flip: number,
): boolean {
  const d = Math.sqrt(d2);
  if (d < 1e-6) return true;
  return d < pushers[o + 2] + reachToward(kind, size, yaw, flip, -dx / d, -dz / d);
}

/**
 * Whether a leaf resting at height `rest` goes over a body point: it lies above the worm's belly
 * there (the worm is in the litter beneath it), or it is already held up over the body. Below
 * the belly the worm passes over the leaf instead.
 */
function overIt(pushers: Float32Array, o: number, held: boolean, rest: number): boolean {
  return held || rest > pushers[o + 6];
}

/** Whether the body points at offsets o and q are consecutive along one stretch of tube. */
function linked(pushers: Float32Array, o: number, q: number): boolean {
  const dx = pushers[q] - pushers[o];
  const dz = pushers[q + 1] - pushers[o + 1];
  return dx * dx + dz * dz < LINK * LINK;
}

/**
 * Sets up the constraints for a leaf at (x, z) on litter of height `surf`, resting at `rest`
 * (its height with no body under it): its species `kind`, length `size`, yaw and flip, and the
 * body (`count` pushers). The leaf goes over the body if any body point within its reach (and
 * skirt; the head only once it touches the leaf's outline, so it can turn the leaf over first)
 * goes under it (overIt), and then it clears every body point it reaches: lifted by one part of the
 * body it must not come down into another. `held`: the leaf already lies over the body, so
 * every body point under it keeps it up (a worm climbing out of the litter carries it, rather
 * than rising through it). Returns the tilt direction (radians; the leaf tips down toward
 * (sin, cos) of it, away from the nearest body point), or NaN when the leaf does not go over.
 */
export function overBody(
  x: number, z: number, size: number, kind: number, yaw: number, flip: number, surf: number,
  rest: number, pushers: Float32Array, count: number, prevDir: number, held: boolean,
): number {
  const reach = size * LEAF_REACH[kind];
  let best = Infinity;
  let bx = 0;
  let bz = 0;
  let over = false;
  for (let k = 0; k < count; k++) {
    const o = k * PUSHER_STRIDE;
    const dx = x - pushers[o];
    const dz = z - pushers[o + 1];
    const lim = reach + pushers[o + 2] + PUSHER_SPAN + SKIRT;
    const d2 = dx * dx + dz * dz;
    if (d2 >= lim * lim) continue;
    if (overIt(pushers, o, held, rest) && (held || !(pushers[o + 3] >= HEAD_STRENGTH)
      || touches(pushers, o, dx, dz, d2, kind, size, yaw, flip))) over = true;
    if (d2 < best) {
      best = d2;
      bx = dx;
      bz = dz;
    }
  }
  lines = 0;
  if (!over) return NaN;
  const dir = best > 1e-8 ? Math.atan2(bx, bz) : prevDir;
  const ux = Math.sin(dir);
  const uz = Math.cos(dir);
  // The leaf's outline as it lies now, in its tilt frame: along the tilt (from its centre) and
  // across it. rf and rb: its reach toward the far side and back toward the body.
  const o2 = OUTLINE[kind];
  const n = o2.length >> 1;
  const cf = Math.cos(flip);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  let rf = 0;
  let rb = 0;
  for (let j = 0; j < n; j++) {
    const xl = o2[j * 2] * cf;
    const zl = -o2[j * 2 + 1];
    const wx = (xl * cy + zl * sy) * size;
    const wz = (zl * cy - xl * sy) * size;
    const al = wx * ux + wz * uz;
    outA[j] = al;
    outP[j] = wx * uz - wz * ux;
    if (al > rf) rf = al;
    if (-al > rb) rb = -al;
  }
  // The far edge rests on the litter or above it.
  lineA[0] = 0;
  lineB[0] = rf;
  lines = 1;
  // Part way through turning over, one side of the leaf hangs below its centre by `turning`,
  // and the leaf reaches out past its outline's footprint by `swing`: its cupped form stands
  // out sideways, and its hanging side swings along the tilt as it pitches.
  const sinFlip = Math.abs(Math.sin(flip));
  const turning = LEAF_HALF_WIDTH[kind] * size * sinFlip;
  const swing = (LEAF_RIM[kind] + LEAF_HALF_WIDTH[kind] * SIN_MAX_TILT) * size * sinFlip;
  // The body near the leaf, once: each body point's stretch of spine in the tilt frame (from
  // halfway to the previous body point to halfway to the next), and its dome.
  let near = 0;
  for (let k = 0; k < count && near < MAX_NEAR; k++) {
    const o = k * PUSHER_STRIDE;
    const w = pushers[o + 2];
    if (!(w > 0)) continue;
    const dx = pushers[o] - x;
    const dz = pushers[o + 1] - z;
    const lim = reach + PUSHER_SPAN + w + SKIRT + swing;
    if (dx * dx + dz * dz >= lim * lim) continue;
    const pa = dx * ux + dz * uz;
    const pp = dx * uz - dz * ux;
    let a1 = pa; let q1 = pp; let a2 = pa; let q2 = pp;
    if (k > 0 && linked(pushers, o, o - PUSHER_STRIDE)) {
      const ex = pushers[o - PUSHER_STRIDE] - x;
      const ez = pushers[o - PUSHER_STRIDE + 1] - z;
      a1 = (pa + ex * ux + ez * uz) / 2;
      q1 = (pp + ex * uz - ez * ux) / 2;
    }
    if (k + 1 < count && linked(pushers, o, o + PUSHER_STRIDE)) {
      const ex = pushers[o + PUSHER_STRIDE] - x;
      const ez = pushers[o + PUSHER_STRIDE + 1] - z;
      a2 = (pa + ex * ux + ez * uz) / 2;
      q2 = (pp + ex * uz - ez * ux) / 2;
    }
    const b = near * NEAR_STRIDE;
    nearBody[b] = a1; nearBody[b + 1] = q1; nearBody[b + 2] = a2; nearBody[b + 3] = q2;
    nearBody[b + 4] = w; nearBody[b + 5] = pushers[o + 4]; nearBody[b + 6] = Math.max(0, pushers[o + 7]);
    near++;
  }
  // The leaf in STRIPS across the tilt: each strip's box (its span along the tilt, and the
  // outline's extent across it within that span) needs the plane above the highest dome over
  // any point of the box, at the strip's far end, where the tilted plane is lowest.
  const step = (rf + rb) / STRIPS;
  for (let s = 0; s < STRIPS && near > 0; s++) {
    const a = -rb + step * s;
    const b = a + step;
    let p0 = Infinity;
    let p1 = -Infinity;
    for (let j = 0; j < n; j++) {
      const k2 = j + 1 < n ? j + 1 : 0;
      const qa = outA[j];
      const qb = outA[k2];
      const lo = qa < qb ? qa : qb;
      const hi = qa < qb ? qb : qa;
      if (hi < a || lo > b) continue;
      // The edge clipped to the strip: its ends' across positions bound it there.
      const d = qb - qa;
      const t0 = d === 0 ? 0 : Math.max(0, Math.min(1, ((d > 0 ? a : b) - qa) / d));
      const t1 = d === 0 ? 1 : Math.max(0, Math.min(1, ((d > 0 ? b : a) - qa) / d));
      const e0 = outP[j] + (outP[k2] - outP[j]) * t0;
      const e1 = outP[j] + (outP[k2] - outP[j]) * t1;
      p0 = Math.min(p0, e0, e1);
      p1 = Math.max(p1, e0, e1);
    }
    if (!(p1 >= p0)) continue;
    let need = 0;
    for (let q = 0; q < near; q++) {
      const o = q * NEAR_STRIDE;
      const a1 = nearBody[o];
      const a2 = nearBody[o + 2];
      const w = nearBody[o + 4];
      const out = w + SKIRT + BEND + swing;
      if ((a1 < a2 ? a1 : a2) - out >= b || (a1 < a2 ? a2 : a1) + out <= a) continue;
      // Every leaf point over the box is at least e from the spine, so the dome (falling with
      // distance) is no higher over it than at e.
      const e = Math.max(0, segmentToBox(a1, nearBody[o + 1], a2, nearBody[o + 3], a, b, p0, p1) - BEND - swing);
      if (e >= w + SKIRT) continue;
      const r = Math.min(1, e / w);
      const h = nearBody[o + 5] - nearBody[o + 6] * (1 - Math.sqrt(1 - r * r)) + LEAF_CLEAR - surf + turning;
      const nk = e < w ? h : h * (1 - (e - w) / SKIRT);
      if (nk > need) need = nk;
    }
    if (!(need > 0)) continue;
    lineA[lines] = need;
    lineB[lines] = b;
    lines++;
  }
  return dir;
}

/**
 * How flat (0 its natural cupped form, 1 pressed flat) a leaf at (x, z), resting at `rest`, must
 * be for the body points that pass over it (its rest is under their belly): the leaf's curled
 * rim would otherwise rise into them. Full before any of them can reach the leaf, easing in over
 * the PRESS_RAMP before that. `held`: the leaf lies over the body (no pressing).
 */
export function pressTarget(
  x: number, z: number, size: number, kind: number, rest: number,
  pushers: Float32Array, count: number, held: boolean,
): number {
  if (held) return 0;
  const reach = size * LEAF_REACH[kind];
  let press = 0;
  for (let k = 0; k < count; k++) {
    const o = k * PUSHER_STRIDE;
    if (overIt(pushers, o, false, rest)) continue;
    const dx = x - pushers[o];
    const dz = z - pushers[o + 1];
    const lim = reach + pushers[o + 2] + PUSHER_SPAN + PRESS_RAMP;
    const d2 = dx * dx + dz * dz;
    if (d2 >= lim * lim) continue;
    press = Math.max(press, Math.min(1, (lim - Math.sqrt(d2)) / PRESS_RAMP));
  }
  return press;
}
