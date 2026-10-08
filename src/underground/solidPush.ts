import { hypot2 } from '../core/vec';
import { boundaryOf, bound, B_TOP } from './slab';
import { blockerInto, found, second, type SolidHit, type Solids, type UV } from './solidShapes';

/**
 * Pushing a point out of the blockers (solidShapes.ts), and out of the top: the worm's body points
 * slide along stones, roots, rocks and the log. `pushOutFrom` is the per-step form: it takes its
 * points as objects and returns nothing, so it boxes no numbers (solidShapes.ts). Allocates nothing.
 */

const hit: SolidHit = { nu: 0, nv: 0 };
const from: UV = { u: 0, v: 0 };

/**
 * Moves (u, v) out of every blocker grown by `radius` by the shortest way, a few times over for
 * curved edges: a head pushed into a stone slides along it. Inside two at once where they meet at
 * a wide angle (the crease under a root's joint), it moves out of both together, to the crease
 * itself: pushing out of one and then the other would leave it beside the crease, on a different
 * side each frame (a jitter). With `topKeep`, (u, v) also stays that far under the leaves' top,
 * kept the same way. In a tight corner (where the leaves' top meets a rock's or the log's flank)
 * the pushes may not settle: then, given the point it came from (`fromU`, `fromV`, itself clear),
 * it goes back there, stopping short of the corner rather than ending inside the rock; it stops
 * there too rather than be thrown back against the way it moved. Returns the distance moved.
 */
export function pushOutSolids(
  o: Solids, p: { u: number; v: number }, radius: number, topKeep = NaN, fromU = NaN, fromV = NaN,
): number {
  const u0 = p.u;
  const v0 = p.v;
  from.u = fromU;
  from.v = fromV;
  pushOutFrom(o, p, radius, topKeep, from);
  return hypot2(p.u - u0, p.v - v0);
}

/** pushOutSolids, from the point `came` (NaN in it: none). */
export function pushOutFrom(o: Solids, p: UV, radius: number, topKeep: number, came: UV): void {
  const u0 = p.u;
  const v0 = p.v;
  const fromU = came.u;
  const fromV = came.v;
  const has = fromU === fromU && fromV === fromV;
  let settled = false;
  for (let k = 0; k < 8 && !settled; k++) settled = !pushOnce(o, p, radius, topKeep);
  // Thrown back (in a root's crotch with its branch, back one frame and forward the next: a jitter).
  const back = has && (p.u - fromU) * (u0 - fromU) + (p.v - fromV) * (v0 - fromV) < 0;
  if ((back || (has && !settled && inside(o, p, radius, topKeep))) && !inside(o, came, radius, topKeep)) {
    p.u = fromU;
    p.v = fromV;
  }
}

/** How far `p` is above the height `topKeep` under the leaves' top, into `over.by` (-Infinity without one). */
const over = { by: 0 };
function overTop(o: Solids, p: UV, topKeep: number): void {
  if (o.slab && topKeep === topKeep) {
    boundaryOf(o.slab, B_TOP, p);
    over.by = p.v - (bound.v - topKeep);
  } else over.by = -Infinity;
}

/** True when `p` is inside a blocker grown by `radius`, or over the top. */
function inside(o: Solids, p: UV, radius: number, topKeep: number): boolean {
  overTop(o, p, topKeep);
  if (over.by > 1e-6) return true;
  blockerInto(o, p, radius, o.capCount, hit);
  return found.into > 1e-6;
}

/** One push out of the deepest blocker (or the top), or out of the two deepest together. True when it was inside one. */
function pushOnce(o: Solids, p: UV, radius: number, topKeep: number): boolean {
  blockerInto(o, p, radius, o.capCount, hit);
  let a = found.into;
  let au = hit.nu;
  let av = hit.nv;
  let b = second.into;
  let bu = second.nu;
  let bv = second.nv;
  overTop(o, p, topKeep);
  const by = over.by;
  if (by > a) {
    b = a; bu = au; bv = av;
    a = by; au = 0; av = -1;
  } else if (by > b) {
    b = by; bu = 0; bv = -1;
  }
  if (!(a > 0)) return false;
  let du = au * a;
  let dv = av * a;
  // The shortest move out of both half-planes n1 . d >= a, n2 . d >= b: out of the deepest alone if
  // that also clears the other, else onto their corner. Only for a wide corner (normals less than
  // 90 degrees apart): solving a tight one from straight edges overshoots on curved ones.
  const c = au * bu + av * bv;
  if (b > 0 && b - a * c > 0 && c > 0 && c < 1 - 1e-9) {
    const det = 1 - c * c;
    const s1 = (a - c * b) / det;
    const s2 = (b - c * a) / det;
    du = au * s1 + bu * s2;
    dv = av * s1 + bv * s2;
  }
  p.u += du;
  p.v += dv;
  return true;
}
