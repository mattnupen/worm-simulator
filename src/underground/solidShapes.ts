import type { Slab, UV } from './slab';
import { createSection, type LogCut, type Section } from './sections';
import type { Hints } from './solidHints';

/**
 * The blockers of a slab (solids.ts places them) as data, and the distances the worm collides
 * and slides with: tapering capsules (stones, big roots, root discs and the hints) and convex outlines (rocks and the log
 * in section). The depth functions return how far (u, v) lies inside a shape grown by `pad`
 * (0 or less: clear) and write the way straight out. Nothing here allocates.
 *
 * The per-step paths (solidPush.ts) call the `...Into` forms: they take the point as an object and
 * leave the depth in `found`. A number passed to, or returned from, a call V8 does not inline is
 * boxed on the heap, so loose-number calls dozens of times a step are per-step garbage.
 */
export interface SolidHit { nu: number; nv: number }
export type { UV };
/** The depth the last `...Into` call found. */
export const found = { into: 0 };
const at: UV = { u: 0, v: 0 };

export const MAX_STONES = 16;
/** Floats per stone: u, v, radius, x scale, y scale, rotation, shade 0..1. The stone is the ellipse
 *  of radii radius * x scale and radius * y scale (one of them 1), turned by the rotation. */
export const STONE_STRIDE = 7;
/** Room for the big roots' segments: as grown (at most 64), with their fillet points (rootEnds.ts). */
export const MAX_ROOT_SEGS = 128;
/** Floats per root segment: u0, v0, r0, u1, v1, r1. A root is a chain of joined segments; a
 *  branch is a chain that starts on its parent. */
export const ROOT_STRIDE = 6;
/** Thick root ends in the playable slab that run on into the wall (rootEnds.ts), BURIED_STRIDE
 *  floats each: the end's u, v, radius, the way it goes in (du, dv) and the run it sinks over,
 *  each with one capsule. */
export const MAX_BURIED = 8;
export const BURIED_STRIDE = 6;
/** Small roots cut square across: discs of wood (DOT_STRIDE floats: u, v, radius). */
export const MAX_ROOT_DOTS = 3;
export const DOT_STRIDE = 3;
export const MAX_SECTIONS = 4;
/** Collision capsules (stones, root segments, buried ends, root discs and the two hints), CAP_STRIDE floats each as ROOT_STRIDE. */
const MAX_CAPS = MAX_STONES + MAX_ROOT_SEGS + MAX_BURIED + MAX_ROOT_DOTS + 2;
export const CAP_STRIDE = 6;
/**
 * Separate blockers stay at least this far apart: more than the worm is thick (2 x BODY_RADIUS,
 * about 0.27), so the worm never wedges into a crease between two of them (where pushing it out
 * of one pushes it into the other).
 */
export const BLOCKER_GAP = 0.32;
/**
 * The head never comes nearer than this to the litter's top: steering up never pops it out (spec
 * 4.2). Defined here, beside the blockers it is kept with (burrowMotion re-exports it).
 */
export const TOP_KEEP = 0.12;

export interface Solids {
  /** The slab they were placed in (placeSolids). */
  slab: Slab | null;
  readonly stones: Float32Array;
  stoneCount: number;
  readonly roots: Float32Array;
  rootCount: number;
  readonly buried: Float32Array;
  buriedCount: number;
  /** Rocks and the log the cut passes through, as outlines in the plane. */
  readonly sections: readonly Section[];
  sectionCount: number;
  /** The cut through the log, if the slab crosses it (rx 0: none); its outline is also in sections. */
  readonly log: LogCut;
  readonly dots: Float32Array;
  dotCount: number;
  /** The static hints that block like small stones (solidHints.ts). */
  readonly hints: Hints;
  /** Collision capsules: one per stone (its ellipse's) and one per root segment... */
  readonly caps: Float32Array;
  /** ...and each one's grid kind (soilGrid's SOLID_STONE or SOLID_ROOT). */
  readonly capKind: Uint8Array;
  capCount: number;
}

export function createSolids(): Solids {
  return {
    slab: null,
    stones: new Float32Array(MAX_STONES * STONE_STRIDE), stoneCount: 0,
    roots: new Float32Array(MAX_ROOT_SEGS * ROOT_STRIDE), rootCount: 0,
    buried: new Float32Array(MAX_BURIED * BURIED_STRIDE), buriedCount: 0,
    sections: Array.from({ length: MAX_SECTIONS }, createSection), sectionCount: 0,
    log: { u: 0, v: 0, rx: 0, ry: 0 },
    dots: new Float32Array(MAX_ROOT_DOTS * DOT_STRIDE), dotCount: 0,
    hints: { snailU: NaN, snailV: 0, snailSize: 0, snailTurn: 0, beetleU: NaN, beetleV: 0, beetleLen: 0, beetleDir: 0 },
    caps: new Float32Array(MAX_CAPS * CAP_STRIDE), capKind: new Uint8Array(MAX_CAPS), capCount: 0,
  };
}

export function addCap(o: Solids, kind: number, u0: number, v0: number, r0: number, u1: number, v1: number, r1: number): void {
  const i = o.capCount++;
  const k = i * CAP_STRIDE;
  o.caps[k] = u0; o.caps[k + 1] = v0; o.caps[k + 2] = r0; o.caps[k + 3] = u1; o.caps[k + 4] = v1; o.caps[k + 5] = r1;
  o.capKind[i] = kind;
}

/** The capsule at `k` in `caps` (u0, v0, r0, u1, v1, r1): its radius tapers along it. */
export function capDepth(caps: Float32Array, k: number, u: number, v: number, pad: number, out: SolidHit): number {
  at.u = u;
  at.v = v;
  capInto(caps, k, at, pad, out);
  return found.into;
}

/** capDepth of the point `p`, into `found`. */
function capInto(caps: Float32Array, k: number, p: UV, pad: number, out: SolidHit): void {
  const u = p.u;
  const v = p.v;
  const au = caps[k];
  const av = caps[k + 1];
  const eu = caps[k + 3] - au;
  const ev = caps[k + 4] - av;
  const len2 = eu * eu + ev * ev;
  const t = len2 > 1e-12 ? Math.max(0, Math.min(1, ((u - au) * eu + (v - av) * ev) / len2)) : 0;
  const du = u - (au + eu * t);
  const dv = v - (av + ev * t);
  const d = Math.sqrt(du * du + dv * dv);
  if (d > 1e-9) {
    out.nu = du / d;
    out.nv = dv / d;
  } else if (len2 > 1e-12) {
    const l = Math.sqrt(len2);
    out.nu = -ev / l;
    out.nv = eu / l;
  } else {
    out.nu = 0;
    out.nv = 1;
  }
  found.into = caps[k + 2] + (caps[k + 5] - caps[k + 2]) * t + pad - d;
}

/**
 * A convex, counter-clockwise outline. Outside, the way out is from its nearest point; inside,
 * it is the nearest edge's outward normal. Far outside its box grown by `pad`: -Infinity.
 */
export function sectionDepth(sec: Section, u: number, v: number, pad: number, out: SolidHit): number {
  at.u = u;
  at.v = v;
  sectionInto(sec, at, pad, out);
  return found.into;
}

/** sectionDepth of the point `q`, into `found`. */
function sectionInto(sec: Section, q: UV, pad: number, out: SolidHit): void {
  const u = q.u;
  const v = q.v;
  if (u < sec.uLo - pad || u > sec.uHi + pad || v < sec.vLo - pad || v > sec.vHi + pad) {
    found.into = -Infinity;
    return;
  }
  const p = sec.pts;
  const n = sec.count;
  // The largest signed distance to an edge's line (outward +): at most 0 means inside.
  let most = -Infinity;
  let edge = 0;
  for (let i = 0; i < n; i++) {
    const j = i + 1 < n ? i + 1 : 0;
    const eu = p[j * 2] - p[i * 2];
    const ev = p[j * 2 + 1] - p[i * 2 + 1];
    const l = Math.sqrt(eu * eu + ev * ev);
    if (l < 1e-9) continue;
    const sd = ((u - p[i * 2]) * ev - (v - p[i * 2 + 1]) * eu) / l;
    if (sd > most) { most = sd; edge = i; }
  }
  if (most <= 0) {
    const j = edge + 1 < n ? edge + 1 : 0;
    const eu = p[j * 2] - p[edge * 2];
    const ev = p[j * 2 + 1] - p[edge * 2 + 1];
    const l = Math.sqrt(eu * eu + ev * ev);
    out.nu = ev / l;
    out.nv = -eu / l;
    found.into = pad - most;
    return;
  }
  // Outside: the nearest point on the outline.
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const j = i + 1 < n ? i + 1 : 0;
    const au = p[i * 2];
    const av = p[i * 2 + 1];
    const eu = p[j * 2] - au;
    const ev = p[j * 2 + 1] - av;
    const len2 = eu * eu + ev * ev;
    const t = len2 > 1e-12 ? Math.max(0, Math.min(1, ((u - au) * eu + (v - av) * ev) / len2)) : 0;
    const du = u - (au + eu * t);
    const dv = v - (av + ev * t);
    const d2 = du * du + dv * dv;
    if (d2 < best) {
      best = d2;
      out.nu = du;
      out.nv = dv;
    }
  }
  const d = Math.sqrt(best);
  out.nu /= d;
  out.nv /= d;
  found.into = pad - d;
}

const deep: SolidHit = { nu: 0, nv: 0 };
/** The runner-up of the last blockerDepth call: how deep in the second deepest blocker, and its way out. */
export const second = { into: -Infinity, nu: 0, nv: 0 };

/** Keeps the deepest (into `out`) and the runner-up (into `second`) as blockerDepth goes through `deep`. */
function keep(into: number, best: number, out: SolidHit): number {
  if (into > best) {
    second.into = best;
    second.nu = out.nu;
    second.nv = out.nv;
    out.nu = deep.nu;
    out.nv = deep.nv;
    return into;
  }
  if (into > second.into) {
    second.into = into;
    second.nu = deep.nu;
    second.nv = deep.nv;
  }
  return best;
}

/** As solidDepth, counting only the first `capEnd` capsules (a growing root skips its own). */
export function blockerDepth(o: Solids, u: number, v: number, pad: number, capEnd: number, out: SolidHit): number {
  at.u = u;
  at.v = v;
  blockerInto(o, at, pad, capEnd, out);
  return found.into;
}

/** blockerDepth of the point `p`, into `found` (solidDepth: `capEnd` = o.capCount). */
export function blockerInto(o: Solids, p: UV, pad: number, capEnd: number, out: SolidHit): void {
  let best = -Infinity;
  second.into = -Infinity;
  for (let i = 0; i < capEnd; i++) {
    capInto(o.caps, i * CAP_STRIDE, p, pad, deep);
    best = keep(found.into, best, out);
  }
  for (let i = 0; i < o.sectionCount; i++) {
    sectionInto(o.sections[i], p, pad, deep);
    best = keep(found.into, best, out);
  }
  found.into = best;
}

/**
 * How far (u, v) lies inside the deepest blocker grown by `pad` (0 or less: clear of them all),
 * and in `out` the way straight out of it.
 */
export function solidDepth(o: Solids, u: number, v: number, pad: number, out: SolidHit): number {
  return blockerDepth(o, u, v, pad, o.capCount, out);
}
