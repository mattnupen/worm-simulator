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
 * ground beetle low in it. They are never dug: each blocks as one small stone-kind capsule the
 * worm slides round (cutLife.ts draws them inside it). Deterministic per slab seed; once per dig.
 */
/** The shell's coil size (its outer whorl's centre line), so it is about 2.4 cm across. */
export const SNAIL_SIZE = 0.19;
/** The shell reaches this far from its coil's centre (its mouth's lip included). */
export const SNAIL_REACH = SNAIL_SIZE * 1.46;
/** The beetle's length (about 2.3 cm), and its body capsule: from its tail to its head, this thick. */
export const BEETLE_LEN = 0.54;
export const BEETLE_TAIL = -0.42;
export const BEETLE_HEAD = 0.52;
export const BEETLE_HALF_WIDTH = 0.2;

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
 * move push it out in a single step (a visible jump).
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
 * PASS); `rise(u)` is how far its top, grown by the body's radius, stands over `v` at u. Returns
 * the new height, or NaN when neither fits.
 */
function clearOfTop(s: Slab, uA: number, uB: number, v: number, rise: (u: number) => number, lo: number, hi: number): number {
  let least = Infinity;
  let most = -Infinity;
  for (let k = 0; k <= 8; k++) {
    const u = uA + ((uB - uA) * k) / 8;
    const gap = boundaryAt(s, B_TOP, u) - TOP_KEEP - (v + rise(u));
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
    const mid = Math.max(floor(u) + 0.3, Math.min(top(u) - 0.3, (top(u) + floor(u)) / 2));
    // Over its middle (the head on top of it); its flanks only make corners the head backs out of.
    const R = SNAIL_REACH + BODY_RADIUS;
    const su = u;
    const v = clearOfTop(s, u - R * 0.7, u + R * 0.7, mid, (x) => Math.sqrt(Math.max(0, R * R - (x - su) * (x - su))),
      floor(u) + 0.05, top(u) - 0.05);
    if (!Number.isNaN(v) && blockerDepth(o, u, v, SNAIL_REACH + BLOCKER_GAP, o.capCount, hit) <= 0) {
      h.snailU = u; h.snailV = v; h.snailSize = SNAIL_SIZE; h.snailTurn = rand() * Math.PI * 2;
      addCap(o, SOLID_STONE, u, v, SNAIL_REACH, u, v, SNAIL_REACH);
    }
  }
  // The beetle tries a few spots: the snail may already lie in the first.
  for (let tries = 0; tries < 4 && Number.isNaN(h.beetleU); tries++) {
    u = spot(s, o, BEETLE_LEN * 0.6, rand);
    if (Number.isNaN(u)) break;
    const dir = (rand() < 0.5 ? 0 : Math.PI) + (rand() - 0.5) * 0.5;
    const r = BEETLE_HALF_WIDTH * BEETLE_LEN;
    const c = Math.cos(dir) * BEETLE_LEN;
    const sn = Math.sin(dir) * BEETLE_LEN;
    // Along its body's top (tail to head), grown by the body's radius.
    const bu = u;
    const ta = Math.min(c * BEETLE_TAIL, c * BEETLE_HEAD);
    const tb = Math.max(c * BEETLE_TAIL, c * BEETLE_HEAD);
    const v = clearOfTop(s, u + ta, u + tb, floor(u) + 0.2, (x) => (Math.abs(c) > 1e-9 ? ((x - bu) * sn) / c : 0) + r + BODY_RADIUS,
      floor(u) + 0.05, top(u) - 0.05);
    if (Number.isNaN(v)) continue;
    const u0 = u + c * BEETLE_TAIL;
    const v0 = v + sn * BEETLE_TAIL;
    const u1 = u + c * BEETLE_HEAD;
    const v1 = v + sn * BEETLE_HEAD;
    let clear = true;
    for (let t = 0; t <= 1; t += 0.25) {
      if (blockerDepth(o, u0 + (u1 - u0) * t, v0 + (v1 - v0) * t, r + BLOCKER_GAP, o.capCount, hit) > 0) clear = false;
    }
    if (clear) {
      h.beetleU = u; h.beetleV = v; h.beetleLen = BEETLE_LEN; h.beetleDir = dir;
      addCap(o, SOLID_STONE, u0, v0, r, u1, v1, r);
    }
  }
}
