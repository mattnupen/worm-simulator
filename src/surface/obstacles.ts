import { treeSites, trunkFootOf } from './treeSites';
import { heroLog, LOG_END, LOG_FOOT, logEnd, rocks, ROCK_FOOT } from './propPlacement';
import { rockRise, rockSeed } from './rockShape';

/**
 * The solid things on the forest floor, as footprints on the ground (pure; Step 1b spec 4.4):
 * circles for the trunks (their root flare) and rocks, a capsule for the fallen log, at real
 * size. The worm slides along them (crawl.ts), hero leaves are pushed back out of
 * them (heroObstacles.ts), and the camera stops short of the tall ones (crawl.ts).
 */

/** How far the drawn rocks and log reach past their size (propPlacement.ts, beside the props). */
export { LOG_END, LOG_FOOT, ROCK_FOOT };
/**
 * A rock's top above the ground: as drawn (rockRise), with this to spare (V4 hot fix: it was 0.6 of
 * its size, higher than any is drawn, which held a camera over a rock the worm sits on off to the
 * side). The log's top, per unit of its radius.
 */
const ROCK_TOP_SPARE = 0.05;
const LOG_TOP = 1.7;

export interface Footprints {
  /** Round footprints, [x, z, radius, top] each: trunks (top Infinity), then rocks. */
  readonly round: Float64Array;
  /** The log: centre, unit axis, half length, radius and top. */
  readonly log: { x: number; z: number; dx: number; dz: number; half: number; r: number; top: number };
}

let cache: Footprints | null = null;

/** The footprints (built once). Read-only. */
export function footprints(): Footprints {
  if (cache) return cache;
  const log = heroLog();
  const fp: Footprints = {
    round: Float64Array.from([
      ...treeSites().flatMap((t) => [t.x, t.z, trunkFootOf(t), Infinity]),
      ...rocks().flatMap((k, i) => [k.x, k.z, k.size * ROCK_FOOT, rockRise(k.size, rockSeed(i)) + ROCK_TOP_SPARE]),
    ]),
    log: {
      x: log.x, z: log.z, dx: Math.cos(log.yaw), dz: Math.sin(log.yaw), half: log.length / 2 + logEnd(),
      r: log.radius * LOG_FOOT, top: log.radius * LOG_TOP,
    },
  };
  cache = fp;
  return fp;
}

/** The way out of the deepest obstacle (unit ground vector), written by obstacleDepth. */
export interface ObstacleHit { nx: number; nz: number }

/** Which footprint the last obstacleDepth call found deepest (its offset in `round`, or -1 for the log). */
let deepestId = -1;

/**
 * How far (m) the point (x, z) lies inside the deepest footprint grown by `pad` (0 or less: clear
 * of them all), and in `out` the direction straight out of it. Footprints no taller than `climb`
 * are left out: the worm passes MAX_CLIMB (climbSurface.ts), so it crawls over the rocks and the log
 * and only the trunks stop it. Allocates nothing.
 */
export function obstacleDepth(x: number, z: number, pad: number, out: ObstacleHit, climb = -Infinity): number {
  const { round, log } = footprints();
  let best = -Infinity;
  deepestId = -1;
  for (let o = 0; o < round.length; o += 4) {
    if (round[o + 3] <= climb) continue;
    const dx = x - round[o];
    const dz = z - round[o + 1];
    const lim = round[o + 2] + pad;
    if (Math.abs(dx) >= lim || Math.abs(dz) >= lim) continue;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (lim - d > best) {
      best = lim - d;
      deepestId = o;
      if (d > 1e-9) {
        out.nx = dx / d;
        out.nz = dz / d;
      } else {
        out.nx = 1;
        out.nz = 0;
      }
    }
  }
  // The log: a capsule along its axis.
  if (log.top <= climb) return best;
  const t = Math.max(-log.half, Math.min(log.half, (x - log.x) * log.dx + (z - log.z) * log.dz));
  const dx = x - (log.x + log.dx * t);
  const dz = z - (log.z + log.dz * t);
  const d = Math.sqrt(dx * dx + dz * dz);
  const into = log.r + pad - d;
  if (into > best) {
    best = into;
    deepestId = -1;
    if (d > 1e-9) {
      out.nx = dx / d;
      out.nz = dz / d;
    } else {
      out.nx = -log.dz;
      out.nz = log.dx;
    }
  }
  return best;
}

const slideHit: ObstacleHit = { nx: 0, nz: 0 };

/**
 * Moves the ground point `p` (x, z) straight out of any footprint grown by `radius`, the deepest
 * first, a few times over for footprints that touch: a body point pushed into a trunk, rock or
 * the log slides along its edge. Returns how far it moved in all. Allocates nothing.
 */
export function pushOut(p: { x: number; z: number }, radius: number, climb = -Infinity): number {
  let moved = 0;
  for (let k = 0; k < 3; k++) {
    const into = obstacleDepth(p.x, p.z, radius, slideHit, climb);
    if (!(into > 0)) break;
    p.x += slideHit.nx * into;
    p.z += slideHit.nz * into;
    moved += into;
  }
  return moved;
}

const contact: ObstacleHit = { nx: 0, nz: 0 };

/** How far (x, z) lies inside the one footprint `id` (as deepestId) grown by `pad`, and the way out in `out`. */
function depthIn(id: number, x: number, z: number, pad: number, out: ObstacleHit): number {
  const { round, log } = footprints();
  let cx: number;
  let cz: number;
  let r: number;
  if (id >= 0) {
    cx = round[id];
    cz = round[id + 1];
    r = round[id + 2];
  } else {
    const t = Math.max(-log.half, Math.min(log.half, (x - log.x) * log.dx + (z - log.z) * log.dz));
    cx = log.x + log.dx * t;
    cz = log.z + log.dz * t;
    r = log.r;
  }
  const dx = x - cx;
  const dz = z - cz;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > 1e-9) {
    out.nx = dx / d;
    out.nz = dz / d;
  } else if (id >= 0) {
    out.nx = 1;
    out.nz = 0;
  } else {
    out.nx = -log.dz;
    out.nz = log.dx;
  }
  return r + pad - d;
}

/**
 * The edges a slideMove has met: which (a footprint's id as deepestId, or a play edge's, below),
 * the way back from each, and how far along it the move must reach to stay behind it (the move m
 * keeps behind edge i while m . n_i >= b_i). Up to three footprints and two play edges.
 */
const metIds = new Int32Array(5);
const metN = new Float64Array(10);
const metB = new Float64Array(5);
let met = 0;
/** Ids for the play area's edges (x = +half, x = -half, z = +half, z = -half), below the log's -1. */
const EDGE_X_HI = -2;
const EDGE_X_LO = -3;
const EDGE_Z_HI = -4;
const EDGE_Z_LO = -5;

/** Adds edge `id` (the way back n, reach b) to the edges met, unless it is met already; false if it was. */
function meet(id: number, nx: number, nz: number, b: number): boolean {
  for (let i = 0; i < met; i++) if (metIds[i] === id) return false;
  metIds[met] = id;
  metN[2 * met] = nx;
  metN[2 * met + 1] = nz;
  metB[met] = b;
  met++;
  return true;
}
/** The wanted move, and the nearest move to it found so far that keeps out of all of them. */
let wantX = 0;
let wantZ = 0;
let bestX = 0;
let bestZ = 0;
let bestD2 = Infinity;

/** Takes the move (ax, az) as the best so far if it keeps out of every footprint met and is nearer the wanted move. */
function consider(ax: number, az: number): void {
  for (let j = 0; j < met; j++) {
    if (ax * metN[2 * j] + az * metN[2 * j + 1] < metB[j] - 1e-12) return;
  }
  const d2 = (ax - wantX) * (ax - wantX) + (az - wantZ) * (az - wantZ);
  if (d2 < bestD2) {
    bestD2 = d2;
    bestX = ax;
    bestZ = az;
  }
}

/**
 * Collide and slide: `to` is where a point at `from` would move this step. Each footprint (grown
 * by `radius`) the move ends in becomes an edge to keep behind (the line touching it nearest
 * `from`), and the move becomes the nearest one that keeps behind them all: against one footprint
 * the point slides along its edge, and in a notch where two meet it stops in the notch and stays
 * there, instead of being pushed from one side to the other. The play area's edges (|x|, |z| up
 * to `half`) are fixed edges too: a slide never carries the point out of it, and where a footprint
 * crosses one the point stops in that notch. Writes the result into `to`, and leaves `to` exactly
 * as it was when the move is clear of every footprint. Footprints no taller than `climb` are not
 * edges (obstacleDepth). Allocates nothing.
 */
export function slideMove(
  from: { x: number; z: number }, to: { x: number; z: number }, radius: number, half = Infinity, climb = -Infinity,
): void {
  wantX = to.x - from.x;
  wantZ = to.z - from.z;
  met = 0;
  let props = 0;
  for (let k = 0; k < 5; k++) {
    if (obstacleDepth(to.x, to.z, radius, contact, climb) > 0) {
      // Three footprints with no way between them: pushOut sees to it.
      if (props === 3) return;
      // Its edge as seen from where the point was: the line touching it at its point nearest there.
      const id = deepestId;
      const b = depthIn(id, from.x, from.z, radius, contact);
      // Still a hair inside an edge already met (by rounding): pushOut sees to it.
      if (!meet(id, contact.nx, contact.nz, b)) return;
      props++;
    } else if (met === 0) {
      return;
    } else if (to.x > half + 1e-9) {
      if (!meet(EDGE_X_HI, -1, 0, from.x - half)) return;
    } else if (to.x < -half - 1e-9) {
      if (!meet(EDGE_X_LO, 1, 0, -half - from.x)) return;
    } else if (to.z > half + 1e-9) {
      if (!meet(EDGE_Z_HI, 0, -1, from.z - half)) return;
    } else if (to.z < -half - 1e-9) {
      if (!meet(EDGE_Z_LO, 0, 1, -half - from.z)) return;
    } else {
      return;
    }
    // The nearest allowed move is the wanted one, or on one edge, or where two edges cross.
    bestD2 = Infinity;
    consider(wantX, wantZ);
    for (let c = 0; c < met; c++) {
      const cx = metN[2 * c];
      const cz = metN[2 * c + 1];
      const short = metB[c] - (wantX * cx + wantZ * cz);
      consider(wantX + cx * short, wantZ + cz * short);
      for (let e = c + 1; e < met; e++) {
        const ex = metN[2 * e];
        const ez = metN[2 * e + 1];
        const det = cx * ez - cz * ex;
        if (Math.abs(det) < 1e-9) continue;
        consider((metB[c] * ez - metB[e] * cz) / det, (cx * metB[e] - ex * metB[c]) / det);
      }
    }
    // Edges with no way between them: pushOut sees to it.
    if (bestD2 === Infinity) return;
    to.x = from.x + bestX;
    to.z = from.z + bestZ;
  }
}

/** The camera's side of the props (insideTall, sightReach, pushOutTall) lives in propSight.ts. */
export { insideTall, pushOutTall, sightReach } from './propSight';
