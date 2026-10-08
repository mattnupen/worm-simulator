import { SPACING, WORM_SEGMENTS } from '../game/crawl';
import {
  pt, restAt, sampleAt, worldOf, POINT_SPEED, SHORT, TURN_RATE, WARP_STEPS, type BodyPath,
} from './bodyPath';
import { cruise, smootherstep } from './easing';
import { hypot3 } from '../core/vec';

/**
 * Coming up out of the cut (V2 spec 4.2), posed: every body point slides along the path emergePath.ts
 * planned, from the tunnel it lay in, up and out along the floor. Progress `q` (0..1) runs through
 * the slide's shapes; the move's time maps to it unevenly (`fitSlide`), so the body slows only where
 * it must (a sharp bend of its own tunnel) and goes at the speed caps elsewhere. Pure; posing
 * allocates nothing.
 */
const N = WORM_SEGMENTS;
/**
 * When the head first turns where it lies (`turnFirst`), the share of the progress over which the
 * front bends round onto the path; the slide starts SLIDE_FROM of the way through it (the offsets,
 * fixed where the body lay, all but gone, so sliding under them cannot stretch it).
 */
const TURN_SHARE = 0.3;
const SLIDE_FROM = 0.5;
/** Otherwise the front's small offsets (it lay not quite on the path) ease out over this share. */
const SETTLE_SHARE = 0.12;
/** After a front's bend, the share of the slide it eases in (and out) over. */
const SLIDE_EASE = 0.15;
/** The body rounds its tunnel's bends by averaging the path this far either side of each point... */
const ROUND_OFF = 0.8;
/**
 * ...growing in over the slide's first ROUND_IN (its drift then always well behind the slide's own
 * motion, so it never turns a point back) and shrinking out over the last ROUND_OUT (on the floor's
 * run, where it barely shows).
 */
const ROUND_IN = 0.1;
const ROUND_OUT = 0.1;
/** The averaging's weights, at -1, -1/2, 0, 1/2 and 1 of the way either side. */
const AVERAGE = [1 / 9, 2 / 9, 3 / 9, 2 / 9, 1 / 9];
const one = new Float64Array(1);
const two = new Float64Array(1);
/** The fastest point speeds up and slows down at no more than this (u/s per second). */
const ACCEL = 6;
/** The caps are met with this much to spare between the samples the slide's speed is worked out on. */
const SPARE = 0.97;
/** The game's fixed steps a second: a move lasts a whole number of them. */
const STEPS_PER_S = 60;

/**
 * The body (head first) at progress q of the slide: each point slides along the path; a body bunched
 * up in a turn stretches out to its full spacing on the way (never sliding back). Each point is the
 * average of the path a little way either side of its place, so the body takes its own tunnel's sharp
 * bends rounder (none at the start or the end: exact there; the rise's crests only get lower).
 */
export function slideAt(p: BodyPath, q: number, outU: Float64Array, outV: Float64Array, outW: Float64Array): void {
  const pre = p.turnFirst ? TURN_SHARE : SETTLE_SHARE;
  const off = 1 - smootherstep(q / pre);
  const st = slid(p, q);
  const head = p.headFrom + (p.headTo - p.headFrom) * st;
  const win = p.turnFirst ? 0 : ROUND_OFF * smootherstep(st / ROUND_IN) * (1 - smootherstep((st - 1 + ROUND_OUT) / ROUND_OUT));
  for (let i = 0; i < N; i++) {
    const at = head - p.back[i] - (i * SPACING - p.back[i]) * st;
    let u = 0;
    let v = 0;
    if (win === 0) {
      sampleAt(p, at, one, two, 0);
      u = one[0];
      v = at >= p.exitAt ? restAt(p, u, 0) : two[0];
    } else {
      for (let k = 0; k < AVERAGE.length; k++) {
        const a = at + (k - 2) * 0.5 * win;
        sampleAt(p, a, one, two, 0);
        u += AVERAGE[k] * one[0];
        v += AVERAGE[k] * (a >= p.exitAt ? restAt(p, one[0], 0) : two[0]);
      }
    }
    outU[i] = u + p.offU[i] * off;
    outV[i] = v + p.offV[i] * off;
    outW[i] = 0;
  }
}

/** How far through its slide the body is (0..1) at progress q. */
function slid(p: BodyPath, q: number): number {
  const go = p.turnFirst ? TURN_SHARE * SLIDE_FROM : 0;
  // (Behind the front's bend the slide eases in, its speed in step with the bend's easing out.)
  return p.turnFirst ? cruise((q - go) / (1 - go), SLIDE_EASE) : Math.min(1, Math.max(0, q));
}

/** The slide's progress at linear time t (0..1) of the move (`p.warp`). */
function warped(p: BodyPath, t: number): number {
  const x = Math.min(1, Math.max(0, t)) * WARP_STEPS;
  const k = Math.min(WARP_STEPS - 1, Math.floor(x));
  return p.warp[k] + (p.warp[k + 1] - p.warp[k]) * (x - k);
}

/** The slide's progress at linear time t (0..1) of the move (`p.warp`, worked out by fitSlide). */
export function slidePose(p: BodyPath, t: number, outU: Float64Array, outV: Float64Array, outW: Float64Array): void {
  slideAt(p, warped(p, t), outU, outV, outW);
}

/**
 * Works out the slide's timing and returns its length in seconds (at least `least`, a whole number of
 * steps). Each stretch of progress may go as fast as the caps allow there (no point over POINT_SPEED,
 * the head over `headSpeed`, no segment turning over TURN_RATE); the slide speeds up from rest and
 * slows to rest with its fastest point's acceleration at most ACCEL. `longest`: the turn rate may not
 * stretch it past this (segments then turn faster, by the share in `p.turnRate`). Once per move.
 */
export function fitSlide(p: BodyPath, least: number, headSpeed: number, longest: number): number {
  const f = p.fit;
  const M = WARP_STEPS;
  const allow = p.allow;
  const reach = p.reach;
  let o = 0;
  slideAt(p, 0, f[0], f[1], f[2]);
  allow[0] = Infinity;
  for (let k = 1; k <= M; k++) {
    const n = 3 - o;
    slideAt(p, k / M, f[n], f[n + 1], f[n + 2]);
    let move = 0;
    let need = 0;
    let turn = 0;
    let px = 0; let py = 0; let pz = 0; let qx = 0; let qy = 0; let qz = 0;
    for (let i = 0; i < N; i++) {
      worldOf(p, o, i);
      const ax = pt.x; const ay = pt.y; const az = pt.z;
      worldOf(p, n, i);
      const d = hypot3(pt.x - ax, pt.y - ay, pt.z - az);
      move = Math.max(move, d);
      need = Math.max(need, d / (i === 0 ? Math.min(headSpeed, POINT_SPEED) : POINT_SPEED));
      if (i > 0) {
        const ux = ax - px; const uy = ay - py; const uz = az - pz;
        const vx = pt.x - qx; const vy = pt.y - qy; const vz = pt.z - qz;
        const lu = hypot3(ux, uy, uz);
        const lv = hypot3(vx, vy, vz);
        if (lu > SHORT && lv > SHORT) {
          const c = Math.max(-1, Math.min(1, (ux * vx + uy * vy + uz * vz) / (lu * lv)));
          turn = Math.max(turn, Math.acos(c) / TURN_RATE);
        }
      }
      px = ax; py = ay; pz = az;
      qx = pt.x; qy = pt.y; qz = pt.z;
    }
    // This stretch's speed limit (progress per second), and how far its fastest point goes per unit.
    allow[k] = (SPARE / M) / Math.max(1e-12, need, turn);
    reach[k] = move * M;
    o = n;
  }
  // Speeds at the samples: from rest, as fast as each stretch allows, its fastest point accelerating
  // no harder than ACCEL, to rest; warp[] holds them for now.
  // (Measured against the stretch that moves its fastest point furthest per unit of progress, so it
  // holds everywhere, however unevenly the shapes change.)
  let most = 1e-9;
  for (let k = 1; k <= M; k++) most = Math.max(most, reach[k]);
  const a = ACCEL / most;
  const speed = p.warp;
  speed[0] = 0;
  for (let k = 1; k <= M; k++) speed[k] = Math.min(allow[k], k < M ? allow[k + 1] : 0, Math.sqrt(speed[k - 1] ** 2 + (2 * a) / M));
  speed[M] = 0;
  for (let k = M - 1; k >= 0; k--) speed[k] = Math.min(speed[k], Math.sqrt(speed[k + 1] ** 2 + (2 * a) / M));
  // The time at each sample (allow[] reused), then the progress at even steps of time: within a
  // stretch the speed changes evenly with distance, so its progress there is a quadratic in time.
  allow[0] = 0;
  for (let k = 1; k <= M; k++) allow[k] = allow[k - 1] + 2 / M / Math.max(1e-9, speed[k - 1] + speed[k]);
  const raw = allow[M];
  let j = 0;
  for (let k = 0; k <= M; k++) {
    const at = (raw * k) / M;
    while (j < M - 1 && allow[j + 1] < at) j++;
    const v0 = speed[j];
    const v1 = speed[j + 1];
    const dt = Math.max(0, at - allow[j]);
    const acc = (v1 * v1 - v0 * v0) * (M / 2);
    p.reach[k] = Math.min(j + 1, j + (v0 * dt + 0.5 * acc * dt * dt) * M) / M;
  }
  // (reach[] held the stretch rates; it now holds the progress, which warp[] takes over.)
  for (let k = 0; k <= M; k++) p.warp[k] = p.reach[k];
  p.warp[0] = 0;
  p.warp[M] = 1;
  // Longer for `least`; never past `longest` (everything then a little faster, by `p.turnRate`).
  const whole = Math.ceil(Math.max(least, Math.min(raw, longest)) * STEPS_PER_S - 1e-6) / STEPS_PER_S;
  p.turnRate = TURN_RATE * Math.max(1, raw / whole);
  return whole;
}
