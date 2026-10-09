import { hypot2 } from '../core/vec';
import { followHead, poseBehind } from './bodyTrail';
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
/**
 * A casting is left this far behind the tail, clear of its end (when the body dug, the next step's
 * dig at the tail itself ate about 44% of each one).
 */
const CAST_BACK = TUNNEL_R + CAST_R + 0.02;
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

/**
 * The head's tunnel (eating fresh soil feeds the gut: darker castings), then the body after it.
 * Only the head digs: where every body point dug too, each bend came out 0.4 to 0.6 u wide, twice
 * the worm; now the tunnel is the body's own width (V2: a round tube).
 */
export function digTunnel(b: Burrower, _s: Slab, g: SoilGrid, _o: Solids): void {
  pt.u = b.u[0];
  pt.v = b.v[0];
  digDiscAt(g, pt, TUNNEL_R, ate);
  if (ate.cells > 0) b.gut += (ate.organic / ate.cells - b.gut) * 0.15;
  trailBody(b);
}

/**
 * The body after the head: the head's trail recorded (its pursuit point), then every point placed
 * on it its link's length along the trail behind the one ahead (bodyTrail.ts). The trail is all open tunnel, so
 * the body never crosses undug soil, round sharp turns too. The body digs nothing.
 */
function trailBody(b: Burrower): void {
  followHead(b.trail, b);
  poseBehind(b.trail, b);
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
  cast.shade = 90 + 160 * b.gut;
  cast.dirU = tu;
  cast.dirV = tv;
  // Straight behind the tail, else a little to either side: a casting that finds no open tunnel
  // straight behind (an earlier casting there) is tried beside it.
  let filled = 0;
  for (let k = 0; k < CAST_SIDE.length && filled < CAST_MIN; k++) {
    cast.u = b.u[t] + (tu / tl) * CAST_BACK - (tv / tl) * CAST_SIDE[k];
    cast.v = b.v[t] + (tv / tl) * CAST_BACK + (tu / tl) * CAST_SIDE[k];
    filled += castBlobAt(g, cast, CAST_R);
  }
  if (filled >= CAST_MIN) b.castLeft = 0;
}
/** Offsets (u) to the side a casting is tried at, in turn. */
const CAST_SIDE = [0, 0.12, -0.12, 0.24, -0.24] as const;
