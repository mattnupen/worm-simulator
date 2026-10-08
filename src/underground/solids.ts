import { mulberry32 } from '../core/random';
import { rocks } from '../surface/propPlacement';
import { boundaryAt, B_A, B_F, type Slab } from './slab';
import { GRID_H, GRID_W, SOLID_ROOT, SOLID_STONE, cellU, cellV, colOf, rowOf, type SoilGrid } from './soilGrid';
import { dampen } from './soilGridEdit';
import { logSection, rockSection } from './sections';
import { ENTRY_DEPTH, ENTRY_HI, ENTRY_LO, placeRoots } from './solidRoots';
import { placeHints } from './solidHints';
import {
  addCap, blockerDepth, capDepth, sectionDepth, BLOCKER_GAP, CAP_STRIDE, MAX_SECTIONS, STONE_STRIDE,
  type SolidHit, type Solids,
} from './solidShapes';

/**
 * What blocks the worm in a slab (V2 spec 5.2): stones in the mineral soil, big roots from the
 * nearest trunk and small roots cut across (solidRoots.ts), the snail shell and beetle hints
 * (solidHints.ts), and the cut-through parts of surface rocks and the log
 * (sections.ts). Fine roots are only drawn: the worm passes through them. The worm slides along
 * blockers: collide-and-slide on circles, tapering capsules and the sections' convex outlines
 * (solidShapes.ts), as V1's props. Pure, deterministic per slab seed; fills preallocated arrays.
 * Placing and marking run once per dig.
 */
export {
  createSolids, pushOutSolids, solidDepth, BLOCKER_GAP, DOT_STRIDE, MAX_ROOT_DOTS, MAX_ROOT_SEGS, MAX_SECTIONS, MAX_STONES,
  ROOT_STRIDE, STONE_STRIDE, type SolidHit, type Solids,
} from './solidShapes';
export { ENTRY_DEPTH, ENTRY_HI, ENTRY_LO, ROOT_REACH, ROOT_TIP } from './solidRoots';
export { rockReach, type LogCut, type Section } from './sections';
export type { Hints } from './solidHints';

const hit: SolidHit = { nu: 0, nv: 0 };

/** True when a disc at (u, v) of radius r reaches into the entry's sink (ENTRY_*). */
function inEntry(s: Slab, u: number, v: number, r: number): boolean {
  const uc = Math.max(ENTRY_LO, Math.min(ENTRY_HI, u));
  const du = Math.abs(u - uc);
  if (du >= r) return false;
  const floor = Math.min(boundaryAt(s, B_F, uc), boundaryAt(s, B_F, Math.max(ENTRY_LO, uc - r)), boundaryAt(s, B_F, Math.min(ENTRY_HI, uc + r)));
  return v + Math.sqrt(r * r - du * du) > floor - ENTRY_DEPTH;
}

/** Places the slab's blockers (deterministic per slab seed). */
export function placeSolids(s: Slab, o: Solids): Solids {
  o.stoneCount = 0;
  o.rootCount = 0;
  o.capCount = 0;
  o.dotCount = 0;
  o.sectionCount = 0;
  o.slab = s;
  const rand = mulberry32(s.seed ^ 0x5f3759df);
  // Surface rocks and the log the cut passes through: real props, where they are.
  for (let i = 0; i < rocks().length && o.sectionCount < MAX_SECTIONS; i++) {
    if (rockSection(s, i, o.sections[o.sectionCount])) o.sectionCount++;
  }
  if (o.sectionCount < MAX_SECTIONS && logSection(s, o.log, o.sections[o.sectionCount])) o.sectionCount++;
  placeHints(s, o);
  placeRoots(s, o, rand);
  placeStones(s, o, rand);
  return o;
}

/** 6-10 stones in the mineral soil (A, E, B): more small than big, apart from every other blocker. */
function placeStones(s: Slab, o: Solids, rand: () => number): void {
  const want = 6 + Math.floor(rand() * 5);
  for (let tries = 0; o.stoneCount < want && tries < 400; tries++) {
    const r = 0.12 + 0.43 * rand() * rand();
    const u = s.playLo + 0.6 + rand() * (s.playHi - s.playLo - 1.2);
    const squash = 0.8 + 0.2 * rand();
    const wide = rand() < 0.5;
    const rot = rand() * Math.PI;
    const shade = rand();
    const top = Math.min(boundaryAt(s, B_A, u - r), boundaryAt(s, B_A, u), boundaryAt(s, B_A, u + r)) - 0.15 - r;
    const lo = s.bottom + 0.6 + r;
    if (top <= lo) continue;
    const v = lo + rand() * (top - lo);
    if (inEntry(s, u, v, r) || blockerDepth(o, u, v, r + BLOCKER_GAP, o.capCount, hit) > 0) continue;
    const k = o.stoneCount++ * STONE_STRIDE;
    o.stones[k] = u; o.stones[k + 1] = v; o.stones[k + 2] = r;
    o.stones[k + 3] = wide ? 1 : squash; o.stones[k + 4] = wide ? squash : 1;
    o.stones[k + 5] = rot; o.stones[k + 6] = shade;
    // The ellipse's capsule: along its long axis, as thick as its short one.
    const au = wide ? Math.cos(rot) : -Math.sin(rot);
    const av = wide ? Math.sin(rot) : Math.cos(rot);
    const half = r * (1 - squash);
    addCap(o, SOLID_STONE, u - au * half, v - av * half, r * squash, u + au * half, v + av * half, r * squash);
  }
}

/** Marks every grid cell whose centre lies in the capsule at `k` (never dug). */
function markCap(g: SoilGrid, o: Solids, i: number): void {
  const c = o.caps;
  const k = i * CAP_STRIDE;
  const r = Math.max(c[k + 2], c[k + 5]);
  const c0 = Math.max(0, colOf(Math.min(c[k], c[k + 3]) - r));
  const c1 = Math.min(GRID_W - 1, colOf(Math.max(c[k], c[k + 3]) + r));
  const r0 = Math.max(0, rowOf(g, Math.min(c[k + 1], c[k + 4]) - r));
  const r1 = Math.min(GRID_H - 1, rowOf(g, Math.max(c[k + 1], c[k + 4]) + r));
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      if (capDepth(c, k, cellU(col), cellV(g, row), 0, hit) >= 0) g.solid[row * GRID_W + col] = o.capKind[i];
    }
  }
}

/**
 * Writes the blockers into the grid so they are never dug: stones and rock sections as
 * SOLID_STONE, big roots and the log's wood as SOLID_ROOT. The soil under stones, rocks and the
 * log is damper (spec 5.2: damp and darker underneath). Fine roots are never marked.
 */
export function markSolids(g: SoilGrid, o: Solids): void {
  for (let i = 0; i < o.capCount; i++) markCap(g, o, i);
  for (let i = 0; i < o.sectionCount; i++) {
    const sec = o.sections[i];
    const kind = sec.rock < 0 ? SOLID_ROOT : SOLID_STONE;
    const c0 = Math.max(0, colOf(sec.uLo));
    const c1 = Math.min(GRID_W - 1, colOf(sec.uHi));
    const r0 = Math.max(0, rowOf(g, sec.vLo));
    const r1 = Math.min(GRID_H - 1, rowOf(g, sec.vHi));
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        if (sectionDepth(sec, cellU(col), cellV(g, row), 0, hit) >= 0) g.solid[row * GRID_W + col] = kind;
      }
    }
    const half = (sec.uHi - sec.uLo) / 2;
    dampen(g, sec.uLo + half, sec.vLo, Math.min(half, 3) + 0.4, sec.rock < 0 ? 90 : 70);
  }
  for (let i = 0; i < o.stoneCount; i++) {
    const k = i * STONE_STRIDE;
    const r = o.stones[k + 2];
    dampen(g, o.stones[k], o.stones[k + 1] - r * 0.6, r + 0.35, 70);
  }
}
