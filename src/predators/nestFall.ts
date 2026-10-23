import { litterTopHeight } from '../surface/litterDepth';
import { WORLD_HALF } from '../surface/terrain';
import { treeSites, trunkFootOf } from '../surface/treeSites';
import type { Vec3 } from '../core/vec';

/**
 * The worm wiggled free of the robin (nestWiggle.ts): the shot of its fall to the forest floor, and
 * the body play starts from where it landed. World units; allocates nothing per frame.
 */

/** The fall shot: this far from where the worm comes down, this high over the litter (world units). */
const FALL_DIST = 4;
const FALL_UP = 3.2;
/** Seconds the camera takes to come down from where it was to the fall shot. */
const FALL_MOVE = 0.9;
/** How close the shot may come to a trunk's foot (world units). */
const BARK_CLEAR = 0.8;
/**
 * The worm can only be let go this far out from a trunk's foot (world units; about 13 cm): the
 * nest's maple stands right under its branch, and a worm must land on the litter, not in the bark.
 */
export const DROP_CLEAR = 3;

const ease = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/**
 * Where the fall shot's camera stands, into `out` (x y z): low on the forest floor, `FALL_DIST`
 * from the spot below the worm (`lx`, `lz`) on the side the camera was on (`cx`, `cz`), turned
 * round an eighth at a time (either way) until clear of every trunk, inside the world; failing
 * that, wherever keeps furthest from the bark.
 */
export function fallShot(lx: number, lz: number, cx: number, cz: number, out: number[]): number[] {
  const d = Math.hypot(cx - lx, cz - lz);
  const a0 = d > 1e-3 ? Math.atan2(cx - lx, cz - lz) : 0;
  const lim = WORLD_HALF - 1;
  let best = -Infinity;
  let bx = lx, bz = lz;
  for (let k = 0; k < 8 && best < BARK_CLEAR; k++) {
    // 0, +1, -1, +2, -2 ... eighths of a turn from where the camera was.
    const a = a0 + (k & 1 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 4);
    const x = Math.min(lim, Math.max(-lim, lx + Math.sin(a) * FALL_DIST));
    const z = Math.min(lim, Math.max(-lim, lz + Math.cos(a) * FALL_DIST));
    const c = trunkClearance(x, z);
    if (c > best) { best = c; bx = x; bz = z; }
  }
  out[0] = bx;
  out[2] = bz;
  out[1] = litterTopHeight(out[0], out[2]) + FALL_UP;
  return out;
}

/** (x, z) is at least `clear` out from every trunk's foot. */
export function clearOfTrunks(x: number, z: number, clear: number): boolean {
  return trunkClearance(x, z) >= clear;
}

/** How far (x, z) is from the nearest trunk's foot (negative: inside it). */
function trunkClearance(x: number, z: number): number {
  let min = Infinity;
  for (const t of treeSites()) min = Math.min(min, Math.hypot(x - t.x, z - t.z) - trunkFootOf(t));
  return min;
}

/**
 * The camera `s` seconds after the drop: from where it was (`from`) down to the shot (`to`),
 * looking at the falling worm (`worm`); with reduced motion it cuts to the shot at once and holds
 * still, looking just over the spot it lands on (`ground`). Into `pos` and `look`.
 */
export function fallCamera(s: number, from: number[], to: number[], worm: number[], ground: number[], reduced: boolean, pos: number[], look: number[]): void {
  const k = reduced ? 1 : ease(s / FALL_MOVE);
  for (let i = 0; i < 3; i++) {
    pos[i] = from[i] + (to[i] - from[i]) * k;
    look[i] = reduced ? ground[i] : worm[i];
  }
  if (reduced) look[1] += FALL_UP * 0.4;
}

/**
 * The worm as it landed, into play's body (`out`, head first, `gap` apart, world units): from its
 * head (the rope's first point; x y z per point in `rope`), laid straight back toward the middle of
 * the rest of it. A worm dropped from a height lands in a heap; play's body cannot lie across
 * itself, so it starts out straight from where the head came down, facing away from its tail.
 * Returns the heading the head faces (0 = +z).
 */
export function ropeToBody(rope: Float64Array, gap: number, out: Vec3[]): number {
  const m = rope.length / 3;
  let cx = 0, cz = 0;
  for (let i = 1; i < m; i++) { cx += rope[i * 3]; cz += rope[i * 3 + 2]; }
  cx /= m - 1;
  cz /= m - 1;
  const hx = rope[0], hz = rope[2];
  let dx = hx - cx, dz = hz - cz;
  const l = Math.hypot(dx, dz);
  // A heap with the head in its middle: the way the front few points run.
  if (l < 1e-3) { dx = hx - rope[9]; dz = hz - rope[11]; }
  const k = Math.hypot(dx, dz) || 1;
  dx /= k;
  dz /= k;
  if (Math.hypot(dx, dz) < 0.5) { dx = 0; dz = 1; }
  for (let i = 0; i < out.length; i++) {
    out[i].x = hx - dx * gap * i;
    out[i].y = 0;
    out[i].z = hz - dz * gap * i;
  }
  return Math.atan2(dx, dz);
}
