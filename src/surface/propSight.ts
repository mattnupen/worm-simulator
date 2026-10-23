import { footprints } from './obstacles';
import { terrainHeight } from './terrain';
import { climbAt, MAX_CLIMB } from './climbSurface';

/**
 * The solid props as the follow camera sees them (moved out of obstacles.ts, V4 hot fix): whether a
 * point is inside one, how far a sight line gets, and keeping the camera out of them.
 */

/**
 * Whether ground point (x, z) at height y lies inside a footprint (grown by `pad`) that stands
 * taller than y there. A trunk counts as a prism its footprint's full width all the way up. The
 * rocks and the log, which the worm crawls over (MAX_CLIMB), count as ground: inside where y is
 * under the worm's ride over them (climbSurface.ts: their drawn tops, a little proud).
 */
export function insideTall(x: number, z: number, y: number, pad = 0): boolean {
  const { round, log } = footprints();
  let low = false;
  for (let o = 0; o < round.length; o += 4) {
    const dx = x - round[o];
    const dz = z - round[o + 1];
    const r = round[o + 2] + pad;
    if (!(dx * dx + dz * dz < r * r)) continue;
    if (round[o + 3] <= MAX_CLIMB) low = true;
    else if (terrainHeight(round[o], round[o + 1]) + round[o + 3] > y) return true;
  }
  const t = Math.max(-log.half, Math.min(log.half, (x - log.x) * log.dx + (z - log.z) * log.dz));
  const dx = x - (log.x + log.dx * t);
  const dz = z - (log.z + log.dz * t);
  const lr = log.r + pad;
  if (dx * dx + dz * dz < lr * lr) low = true;
  return low && climbAt(x, z) > y;
}

/** Samples along the sight line, then halvings of the first blocked stretch. */
const SIGHT_SAMPLES = 48;
const SIGHT_HALVINGS = 8;

/**
 * How far along the line from (hx, hy, hz) to (tx, ty, tz) the camera can go (0..1) without
 * entering a solid prop taller than the line there, stopping `margin` (m) short of it: 1 when the
 * line is clear. A rock or the log lower than the line is passed over. Allocates nothing.
 */
export function sightReach(
  hx: number, hy: number, hz: number, tx: number, ty: number, tz: number, margin: number,
): number {
  const len = Math.hypot(tx - hx, tz - hz);
  if (!(len > 1e-6)) return 1;
  let clear = 0;
  for (let k = 1; k <= SIGHT_SAMPLES; k++) {
    const t = k / SIGHT_SAMPLES;
    if (!insideTall(hx + (tx - hx) * t, hz + (tz - hz) * t, hy + (ty - hy) * t)) {
      clear = t;
      continue;
    }
    let lo = clear;
    let hi = t;
    for (let h = 0; h < SIGHT_HALVINGS; h++) {
      const mid = (lo + hi) / 2;
      if (insideTall(hx + (tx - hx) * mid, hz + (tz - hz) * mid, hy + (ty - hy) * mid)) hi = mid;
      else lo = mid;
    }
    return Math.max(0, lo - margin / len);
  }
  return 1;
}

/**
 * Over a rock or the log, the footprint pushOutTall keeps a point out of shrinks from its full
 * size at the prop's top to nothing this far (m) above it, so a point sinking past the top is
 * eased out instead of jumping sideways.
 */
const TOP_FADE = 0.5;

/** How much of its footprint a prop whose top is at `top` (m, absolute) keeps a point at height y out of. */
function pushShare(top: number, y: number): number {
  return Math.max(0, Math.min(1, (top + TOP_FADE - y) / TOP_FADE));
}

/**
 * Moves the point `p` (the camera) sideways, straight out of any footprint grown by `pad` that
 * stands taller than p.y there (insideTall), the deepest first: a camera that has come within
 * `pad` of a trunk, or of a rock or the log it is lower than, slides along its edge. Over a rock or
 * the log the footprint shrinks away within TOP_FADE above its top, so one the camera is well above
 * does not push it, and sinking past a top never makes it jump. Returns how far it moved in all.
 * Allocates nothing.
 */
export function pushOutTall(p: { x: number; y: number; z: number }, pad: number): number {
  const { round, log } = footprints();
  let moved = 0;
  for (let k = 0; k < 3; k++) {
    let best = 0;
    let nx = 0;
    let nz = 0;
    for (let o = 0; o < round.length; o += 4) {
      const dx = p.x - round[o];
      const dz = p.z - round[o + 1];
      const lim = round[o + 2] + pad;
      if (Math.abs(dx) >= lim || Math.abs(dz) >= lim) continue;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (!(lim - d > best)) continue;
      const push = lim * pushShare(terrainHeight(round[o], round[o + 1]) + round[o + 3], p.y) - d;
      if (push > best) {
        best = push;
        nx = d > 1e-9 ? dx / d : 1;
        nz = d > 1e-9 ? dz / d : 0;
      }
    }
    {
      const t = Math.max(-log.half, Math.min(log.half, (p.x - log.x) * log.dx + (p.z - log.z) * log.dz));
      const cx = log.x + log.dx * t;
      const cz = log.z + log.dz * t;
      const dx = p.x - cx;
      const dz = p.z - cz;
      const d = Math.sqrt(dx * dx + dz * dz);
      const push = (log.r + pad) * pushShare(terrainHeight(cx, cz) + log.top, p.y) - d;
      if (push > best) {
        best = push;
        nx = d > 1e-9 ? dx / d : -log.dz;
        nz = d > 1e-9 ? dz / d : log.dx;
      }
    }
    if (!(best > 0)) break;
    p.x += nx * best;
    p.z += nz * best;
    moved += best;
  }
  return moved;
}
