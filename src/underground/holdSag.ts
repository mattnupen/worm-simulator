import { WORM_SEGMENTS } from '../game/crawl';
import { wormBody } from '../worm/bodyLength';
import { B_TOP, bound, boundaryOf, type UV } from './slab';
import type { Hold } from './burrowGrab';
import type { MoveState } from './burrowMoves';

/**
 * The worm's span out of the ground in the robin's bill sags a little when the robin isn't pulling
 * hard (V4 revision 4, Matt: the pulled worm looked like a stiff rod hanging in the air). Its part
 * from the bill to the hole bows down between them, most in the middle, more for a span lying
 * across than one standing up, never into the ground; the part in the hole stays put. Run after
 * poseHeld (burrowGrab.ts), on the points it laid. Allocates nothing.
 */

const N = WORM_SEGMENTS;
/** The bow at its most: this share of the span's length (a slack span lying flat; 40% of it standing up). */
const SAG = 0.16;
/** The bow stays this far above the litter's top. */
const ABOVE = 0.08;

// Fields start as fractions: a field that first held a whole number had V8 box every fraction written later.
const pt: UV = { u: 0.5, v: 0.5 };

/** Bows the held worm's span by `sag` (0 taut .. 1 slack). */
export function sagHeld(g: MoveState, h: Hold, sag: number): void {
  const s = g.slab;
  const len = h.cum[1];
  if (!s || sag <= 0 || h.n < 2 || len < 0.2) return;
  const du = h.pu[1] - h.pu[0];
  const dv = h.pv[1] - h.pv[0];
  const l = Math.hypot(du, dv) || 1;
  // Across the span, the way that points down.
  let px = dv / l;
  let py = -du / l;
  if (py > 0) {
    px = -px;
    py = -py;
  }
  const amp = SAG * len * sag * (0.4 + 0.6 * (Math.abs(du) / l));
  const w = g.worm;
  const from = h.slide + (1 - h.pull) * h.cum[2];
  for (let i = 0; i < N; i++) {
    const d = from + i * wormBody.spacing;
    if (d >= len) break;
    if (d <= 0) continue;
    const k = Math.sin((Math.PI * d) / len) * amp;
    const u = w.u[i] + px * k;
    pt.u = u;
    boundaryOf(s, B_TOP, pt);
    w.u[i] = u;
    w.v[i] = Math.max(bound.v + ABOVE, w.v[i] + py * k);
  }
}
