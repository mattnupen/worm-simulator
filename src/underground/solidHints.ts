import { mulberry32 } from '../core/random';
import { boundaryAt, B_F, B_TOP, type Slab } from './slab';
import { SOLID_STONE } from './soilGrid';
import { ENTRY_HI } from './solidRoots';
import { SPACING, WORM_SEGMENTS } from '../game/crawl';
import { TURN_RADIUS } from './bodyPath';
import { addCap, blockerDepth, BLOCKER_GAP, TOP_KEEP, type SolidHit, type Solids } from './solidShapes';
import { BODY_RADIUS } from '../game/crawl';

/**
 * The two static hints that lie in the litter (V2 spec 5.2): a snail shell midway down it and a
 * ground beetle low in it. They are never dug: each blocks as one small stone-kind capsule fitted
 * to its drawn outline (cutLife.ts), so the worm overlaps it by at most 0.02 u and stops short of
 * it by at most 0.04 u (the spiral shell; 0.02 u the beetle; tests/unit/cutSolids.test.ts).
 * Deterministic per slab seed; once per dig.
 */
/** The shell's coil size (its outer whorl's centre line), so it is about 2.4 cm across. */
export const SNAIL_SIZE = 0.19;
/** The shell reaches this far from its coil's centre (its mouth's lip included). */
export const SNAIL_REACH = SNAIL_SIZE * 1.46;
/**
 * The shell's capsule, in coil sizes from the coil's centre with the mouth toward +u (turned by
 * the shell's turn): from the mouth's lip, thin, to the coil, fat. It runs along the shell's long
 * axis, as the spiral is lopsided (its mouth sticks out); fitted to writeSnail's outline.
 */
export const SNAIL_CAP = [0.92, -0.37, 0.48, -0.02, -0.26, 0.97] as const;
/** The beetle's length (about 2.3 cm), and its body capsule in lengths along it: from the end of
 *  its wing cases to its head, as wide as each (writeBeetle's body; legs and feelers are not solid). */
export const BEETLE_LEN = 0.54;
export const BEETLE_CAP = [-0.24, 0.205, 0.44, 0.12] as const;

/**
 * Where the snail shell and the beetle lie (NaN u: not in this slab): the shell's coil centre,
 * size and turn; the beetle's middle, length and the way it faces. Each blocks as one capsule.
 */
export interface Hints {
  snailU: number; snailV: number; snailSize: number; snailTurn: number;
  beetleU: number; beetleV: number; beetleLen: number; beetleDir: number;
}

/**
 * How far back the worm's body can lie along the floor once it has sunk (sinkPath.ts: straight back
 * along -u from the hole at u = 0, its length less at least the dive's quarter turn): the hints
 * keep off it as well as the entry, or the body would lie through one, and the burrower's first
 * move push it out in a single step (a visible jump). At full length on purpose: a worm made
 * shorter by a break (bodyLength.ts) lies within it.
 */
export const BODY_BACK = -((WORM_SEGMENTS - 1) * SPACING - (TURN_RADIUS * Math.PI) / 2);

const hit: SolidHit = { nu: 0, nv: 0 };

/**
 * Between a hint and the line the head keeps under the leaves' top (TOP_KEEP) the head's centre has
 * either a passage at least PASS wide, or none at all with the hint reaching at least WALL through
 * the line. Anything between is a dead end: the head slides in along the top, over the hint, and
 * can neither go on nor turn round (its neck lies behind it), measured in the burrower.
 */
const PASS = 0.05;
const WALL = 0.1;

/**
 * Moves a hint up or down (its centre's height `v`, at most to `lo` and `hi`) so that over uA..uB,
 * where the head would lie on top of it, it leaves the head a passage or a wall under the top (see
 * PASS); `rise(u)` is how far its top, grown by the body's radius, stands over `v` at u (-Infinity
 * where it is not over u). Returns the new height, or NaN when neither fits.
 */
function clearOfTop(s: Slab, uA: number, uB: number, v: number, rise: (u: number) => number, lo: number, hi: number): number {
  let least = Infinity;
  let most = -Infinity;
  for (let k = 0; k <= 8; k++) {
    const u = uA + ((uB - uA) * k) / 8;
    const up = rise(u);
    if (up === -Infinity) continue;
    const gap = boundaryAt(s, B_TOP, u) - TOP_KEEP - (v + up);
    least = Math.min(least, gap);
    most = Math.max(most, gap);
  }
  if (least >= PASS || most <= -WALL) return v;
  if (v - (PASS - least) >= lo) return v - (PASS - least);
  if (v + most + WALL <= hi) return v + most + WALL;
  return NaN;
}

/** A u for something `half` wide in the playable slab, off the entry, the sunk body and the sections, or NaN. */
function spot(s: Slab, o: Solids, half: number, rand: () => number): number {
  for (let tries = 0; tries < 40; tries++) {
    const u = s.playLo + 0.8 + half + rand() * (s.playHi - s.playLo - 1.6 - 2 * half);
    if (u + half > BODY_BACK - 0.6 && u - half < ENTRY_HI + 0.4) continue;
    let clear = true;
    for (let i = 0; i < o.sectionCount; i++) {
      if (u + half > o.sections[i].uLo - 0.4 && u - half < o.sections[i].uHi + 0.4) clear = false;
    }
    if (clear) return u;
  }
  return NaN;
}

/** Where a hint's capsule lies, in the plane (u0, v0, r0, u1, v1, r1). */
const cap = [0, 0, 0, 0, 0, 0];

/** The capsule `c` in place: its local (along, across) points turned by `dir` and moved to (u, v), scaled by `k`. */
function placeCap(u: number, v: number, dir: number, k: number, a0: number, b0: number, r0: number, a1: number, b1: number, r1: number): void {
  const c = Math.cos(dir);
  const sn = Math.sin(dir);
  cap[0] = u + (a0 * c - b0 * sn) * k; cap[1] = v + (a0 * sn + b0 * c) * k; cap[2] = r0 * k;
  cap[3] = u + (a1 * c - b1 * sn) * k; cap[4] = v + (a1 * sn + b1 * c) * k; cap[5] = r1 * k;
}

/** How far the capsule (`cap`, set for a centre height of 0), grown by the body's radius, stands over 0 at u (-Infinity: not over it). */
function capRise(u: number): number {
  let most = -Infinity;
  for (let k = 0; k <= 16; k++) {
    const t = k / 16;
    const r = cap[2] + (cap[5] - cap[2]) * t + BODY_RADIUS;
    const du = u - (cap[0] + (cap[3] - cap[0]) * t);
    if (Math.abs(du) < r) most = Math.max(most, cap[1] + (cap[4] - cap[1]) * t + Math.sqrt(r * r - du * du));
  }
  return most;
}

/** The middle 70% of the capsule's u extent grown by the body's radius (`cap`): where the head would lie on top of it. */
function capMid(out: number[]): void {
  const lo = Math.min(cap[0] - cap[2], cap[3] - cap[5]) - BODY_RADIUS;
  const hi = Math.max(cap[0] + cap[2], cap[3] + cap[5]) + BODY_RADIUS;
  out[0] = (lo + hi) / 2 - 0.35 * (hi - lo);
  out[1] = (lo + hi) / 2 + 0.35 * (hi - lo);
}
const mid2 = [0, 0];

/**
 * True when the capsule (`cap`, lifted by v) keeps BLOCKER_GAP off every blocker placed so far
 * (with 0.02 to spare: a tapering capsule's distance is measured square to its axis, which is
 * not quite the shortest way between two of them).
 */
function capClear(o: Solids, v: number): boolean {
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    const r = cap[2] + (cap[5] - cap[2]) * t;
    if (blockerDepth(o, cap[0] + (cap[3] - cap[0]) * t, v + cap[1] + (cap[4] - cap[1]) * t, r + BLOCKER_GAP + 0.02, o.capCount, hit) > 0) return false;
  }
  return true;
}

/** Places the snail shell and the beetle (each NaN u when it finds no room), and their capsules. */
export function placeHints(s: Slab, o: Solids): void {
  const h = o.hints;
  const rand = mulberry32(s.seed ^ 0x2545f491);
  h.snailU = NaN;
  h.beetleU = NaN;
  const top = (u: number) => boundaryAt(s, B_TOP, u);
  const floor = (u: number) => boundaryAt(s, B_F, u);
  let u = spot(s, o, SNAIL_REACH, rand);
  if (!Number.isNaN(u)) {
    const turn = rand() * Math.PI * 2;
    const mid = Math.max(floor(u) + 0.3, Math.min(top(u) - 0.3, (top(u) + floor(u)) / 2));
    // Over its middle (the head on top of it); its flanks only make corners the head backs out of.
    placeCap(u, 0, turn, SNAIL_SIZE, ...SNAIL_CAP);
    capMid(mid2);
    const v = clearOfTop(s, mid2[0], mid2[1], mid, capRise, floor(u) + 0.05, top(u) - 0.05);
    if (!Number.isNaN(v) && capClear(o, v)) {
      h.snailU = u; h.snailV = v; h.snailSize = SNAIL_SIZE; h.snailTurn = turn;
      addCap(o, SOLID_STONE, cap[0], cap[1] + v, cap[2], cap[3], cap[4] + v, cap[5]);
    }
  }
  // The beetle tries a few spots: the snail may already lie in the first.
  for (let tries = 0; tries < 4 && Number.isNaN(h.beetleU); tries++) {
    u = spot(s, o, BEETLE_LEN * 0.6, rand);
    if (Number.isNaN(u)) break;
    const dir = (rand() < 0.5 ? 0 : Math.PI) + (rand() - 0.5) * 0.5;
    const [a0, r0, a1, r1] = BEETLE_CAP;
    placeCap(u, 0, dir, BEETLE_LEN, a0, 0, r0, a1, 0, r1);
    // Along its body's top (tail to head), grown by the body's radius.
    const v = clearOfTop(s, Math.min(cap[0], cap[3]), Math.max(cap[0], cap[3]), floor(u) + 0.2, capRise, floor(u) + 0.05, top(u) - 0.05);
    if (Number.isNaN(v) || !capClear(o, v)) continue;
    h.beetleU = u; h.beetleV = v; h.beetleLen = BEETLE_LEN; h.beetleDir = dir;
    addCap(o, SOLID_STONE, cap[0], cap[1] + v, cap[2], cap[3], cap[4] + v, cap[5]);
  }
}
