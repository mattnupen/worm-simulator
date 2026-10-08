import { cellAt, AIR, type SoilGrid } from './soilGrid';
import { CAST_SPEED, EAT_SPEED, TUNNEL_SPEED, type LayerId } from './layers';
import type { Burrower } from './burrower';

/**
 * The soil just ahead of the burrower's head (moved from burrowMotion.ts, which steers by it).
 * Allocates nothing.
 *
 * The soil is felt this far ahead of the head, past its own dig (TUNNEL_R plus a cell's half
 * diagonal), and over a small spread: one cell would flick between open and fresh as the head
 * crosses the grid, and the speed with it.
 */
const FEEL_AHEAD = 0.24;
const FEEL = [[0, 0], [0, 0.08], [0, -0.08], [0.1, 0]] as const;
/** What soilAhead felt: the speed it allows, and the share of it that is fresh soil. */
export const ahead = { speed: 0, fresh: 0 };

/** The speed the soil just ahead of the head allows (into `ahead`), averaged over the FEEL points. */
export function soilAhead(g: SoilGrid, b: Burrower): void {
  const u = b.u[0];
  const v = b.v[0];
  const dir = b.dir;
  const cu = Math.cos(dir);
  const cv = Math.sin(dir);
  let sum = 0;
  let fresh = 0;
  let n = 0;
  for (let k = 0; k < FEEL.length; k++) {
    const along = FEEL_AHEAD + FEEL[k][0];
    const across = FEEL[k][1];
    const i = cellAt(g, u + cu * along - cv * across, v + cv * along + cu * across);
    if (i < 0) continue;
    n++;
    if (g.open[i]) sum += g.cast[i] ? CAST_SPEED : TUNNEL_SPEED;
    else if (g.layer[i] === AIR) sum += TUNNEL_SPEED * 0.5;
    else {
      sum += EAT_SPEED[g.layer[i] as LayerId];
      fresh++;
    }
  }
  ahead.speed = n ? sum / n : 0;
  ahead.fresh = n ? fresh / n : 0;
}
