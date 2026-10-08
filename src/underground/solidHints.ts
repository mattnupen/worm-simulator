import { mulberry32 } from '../core/random';
import { boundaryAt, B_F, B_TOP, type Slab } from './slab';
import { SOLID_STONE } from './soilGrid';
import { ENTRY_HI, ENTRY_LO } from './solidRoots';
import { addCap, blockerDepth, BLOCKER_GAP, type SolidHit, type Solids } from './solidShapes';

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

const hit: SolidHit = { nu: 0, nv: 0 };

/** A u for something `half` wide in the playable slab, off the entry and the sections, or NaN. */
function spot(s: Slab, o: Solids, half: number, rand: () => number): number {
  for (let tries = 0; tries < 40; tries++) {
    const u = s.playLo + 0.8 + half + rand() * (s.playHi - s.playLo - 1.6 - 2 * half);
    if (u + half > ENTRY_LO - 0.6 && u - half < ENTRY_HI + 0.4) continue;
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
    const v = Math.max(floor(u) + 0.3, Math.min(top(u) - 0.3, (top(u) + floor(u)) / 2));
    if (blockerDepth(o, u, v, SNAIL_REACH + BLOCKER_GAP, o.capCount, hit) <= 0) {
      h.snailU = u; h.snailV = v; h.snailSize = SNAIL_SIZE; h.snailTurn = rand() * Math.PI * 2;
      addCap(o, SOLID_STONE, u, v, SNAIL_REACH, u, v, SNAIL_REACH);
    }
  }
  u = spot(s, o, BEETLE_LEN * 0.6, rand);
  if (!Number.isNaN(u)) {
    const v = floor(u) + 0.2;
    const dir = (rand() < 0.5 ? 0 : Math.PI) + (rand() - 0.5) * 0.5;
    const r = BEETLE_HALF_WIDTH * BEETLE_LEN;
    const c = Math.cos(dir) * BEETLE_LEN;
    const sn = Math.sin(dir) * BEETLE_LEN;
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
