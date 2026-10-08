import { hypot2 } from '../core/vec';
import { SPACING } from '../game/crawl';
import { keepOut } from './burrowBack';
import { digDiscAt, type Eaten, type SoilGrid } from './soilGrid';
import { castBlobAt, type CastSpot } from './castings';
import type { Burrower } from './burrower';
import type { Slab } from './slab';
import type { Solids } from './solids';

/**
 * The burrower's body behind its head (moved from burrowMotion.ts): the tunnel it digs, the body
 * following the head through it, and its castings. Allocates nothing: points go to the calls in
 * objects (a number passed to a call V8 does not inline is boxed on the heap: solidShapes.ts).
 */
/** Open tunnel radius: about the body's half-width. */
export const TUNNEL_R = 0.14;
/** A casting every this far (about 1.3 body lengths). */
export const CAST_EVERY = 4.5;
const CAST_R = 0.15;
/** The body's points dig this wide (the body cuts corners, so every point keeps a tunnel). */
const BODY_DIG = TUNNEL_R * 0.85;
/**
 * A casting is left this far behind the tail: just out of the tail's own dig, so the body never
 * eats it (at the tail itself the next step's dig ate about 44% of each one).
 */
const CAST_BACK = BODY_DIG + CAST_R + 0.02;
/**
 * Where a casting finds no open tunnel to settle in (the tail swinging round a sharp turn, or an
 * earlier casting already there), it is tried again as the tail moves on, for up to this far,
 * until at least CAST_MIN cells fill.
 */
export const CAST_WINDOW = 0.8;
const CAST_MIN = 2;
const ate: Eaten = { cells: 0, organic: 0 };
const pt = { u: 0, v: 0 };
const cast: CastSpot = { u: 0, v: 0, shade: 0, dirU: 0, dirV: 0 };

/** The head's tunnel (eating fresh soil feeds the gut: darker castings), then the body after it. */
export function digTunnel(b: Burrower, s: Slab, g: SoilGrid, o: Solids): void {
  pt.u = b.u[0];
  pt.v = b.v[0];
  digDiscAt(g, pt, TUNNEL_R, ate);
  if (ate.cells > 0) b.gut += (ate.organic / ate.cells - b.gut) * 0.15;
  trailBody(b, s, g, o);
}

/** Follow the leader, then keep every body point in an open tunnel (the body cuts corners). */
function trailBody(b: Burrower, s: Slab, g: SoilGrid, o: Solids): void {
  for (let i = 1; i < b.u.length; i++) {
    const eu = b.u[i] - b.u[i - 1];
    const ev = b.v[i] - b.v[i - 1];
    const d = hypot2(eu, ev);
    if (d > SPACING) {
      b.u[i] = b.u[i - 1] + (eu * SPACING) / d;
      b.v[i] = b.v[i - 1] + (ev * SPACING) / d;
      keepOut(s, o, b.u, b.v, b.prevU, b.prevV, i);
    }
    pt.u = b.u[i];
    pt.v = b.v[i];
    digDiscAt(g, pt, BODY_DIG, ate);
  }
}

/**
 * The casting due, just behind the tail, while its window lasts (`spend`: first take off how far
 * the tail moved this step; the window is measured by the tail, as a head turning back moves
 * without pulling it along).
 */
export function castTail(b: Burrower, g: SoilGrid, spend: boolean): void {
  const t = b.u.length - 1;
  if (spend) b.castLeft = Math.max(0, b.castLeft - hypot2(b.u[t] - b.prevU[t], b.v[t] - b.prevV[t]));
  if (!(b.castLeft > 0)) return;
  const tu = b.u[t] - b.u[t - 1];
  const tv = b.v[t] - b.v[t - 1];
  const tl = hypot2(tu, tv) || 1;
  cast.u = b.u[t] + (tu / tl) * CAST_BACK;
  cast.v = b.v[t] + (tv / tl) * CAST_BACK;
  cast.shade = 90 + 160 * b.gut;
  cast.dirU = tu;
  cast.dirV = tv;
  if (castBlobAt(g, cast, CAST_R) >= CAST_MIN) b.castLeft = 0;
}
