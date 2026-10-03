import { WORLD_HALF } from './terrain';
import { OCC_OUTER } from '../render/occlusion';

/**
 * The base litter is cut into CHUNKS x CHUNKS square chunks over the world, so that the
 * camera's frustum culls whole chunks, the renderer draws them near-first (the depth test then
 * skips hidden leaf pixels), distant chunks swap to a low-detail leaf, and only the chunks
 * around the worm pay for the disturbance map and the occluder fade. Pure.
 */
export const CHUNKS = 6;
export const CHUNK_SIZE = (2 * WORLD_HALF) / CHUNKS;
/** A chunk whose nearest point is closer to the camera than this draws full leaves... */
export const LOD_NEAR = 9;
/** ...and switches back to low-detail leaves only beyond LOD_NEAR + LOD_GAP (no flicker at the line). */
export const LOD_GAP = 2;
/**
 * Slack (m) round a chunk's leaves for the disturbance map: a lifted leaf rises up to about 0.5
 * and slides up to PUSH_SLIDE (0.2) sideways (extreme probes moved a vertex 0.71). Pads the
 * bounding spheres and the active test.
 */
export const DRAPE_MARGIN = 0.75;
/**
 * A chunk reacts to the worm (the material with the disturbance map and the occluder fade) when
 * the x, z box of its leaves, grown by this, meets the disturbed part of the map or the fade's
 * hull (the camera and the body, see hullBox): the drape's slack plus the fade's reach round the
 * body's axis (OCC_OUTER). Elsewhere its leaves cannot move or fade, so the plain material draws
 * them identically, without the texture fetches or the discard.
 */
export const ACTIVE_MARGIN = DRAPE_MARGIN + OCC_OUTER;

/** Which chunk (x, z) falls in; points outside the world clamp to the edge chunks. */
export function chunkIndex(x: number, z: number): number {
  const i = Math.min(CHUNKS - 1, Math.max(0, Math.floor((x + WORLD_HALF) / CHUNK_SIZE)));
  const j = Math.min(CHUNKS - 1, Math.max(0, Math.floor((z + WORLD_HALF) / CHUNK_SIZE)));
  return j * CHUNKS + i;
}

/** World x of chunk c's centre. */
export function chunkCentreX(c: number): number {
  return -WORLD_HALF + ((c % CHUNKS) + 0.5) * CHUNK_SIZE;
}

/** World z of chunk c's centre. */
export function chunkCentreZ(c: number): number {
  return -WORLD_HALF + (Math.floor(c / CHUNKS) + 0.5) * CHUNK_SIZE;
}

/** Distance from (x, z) to the nearest point of chunk c's square; 0 inside it. */
export function chunkDistance(c: number, x: number, z: number): number {
  const half = CHUNK_SIZE / 2;
  const dx = Math.max(0, Math.abs(x - chunkCentreX(c)) - half);
  const dz = Math.max(0, Math.abs(z - chunkCentreZ(c)) - half);
  return Math.hypot(dx, dz);
}

/**
 * Leaf indices grouped by chunk, each list ascending. Because placement order is random, the
 * first n leaves overall are, in every chunk, exactly the chunk's leaves with index < n.
 */
export function groupByChunk(points: readonly { x: number; z: number }[]): number[][] {
  const out: number[][] = Array.from({ length: CHUNKS * CHUNKS }, () => []);
  points.forEach((p, i) => out[chunkIndex(p.x, p.z)].push(i));
  return out;
}

/** How many entries of an ascending list are below n (binary search). */
export function countBelow(sorted: ArrayLike<number>, n: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < n) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Full leaves (true) or low-detail (false) for a chunk `dist` from the camera, with hysteresis. */
export function nextLod(near: boolean, dist: number): boolean {
  if (dist < LOD_NEAR) return true;
  if (dist > LOD_NEAR + LOD_GAP) return false;
  return near;
}

/**
 * True if box a (min x, min z, max x, max z) grown by pad on every side meets box b. An empty b
 * (min > max, e.g. Infinity, Infinity, -Infinity, -Infinity) meets nothing.
 */
export function boxesMeet(a: ArrayLike<number>, b: ArrayLike<number>, pad: number): boolean {
  return a[0] - pad <= b[2] && b[0] <= a[2] + pad && a[1] - pad <= b[3] && b[1] <= a[3] + pad;
}

/**
 * The x, z box of the leaf fade's hull: the camera and every point of the rendered spine (x, y, z
 * per point). Every pixel the fade can drop lies within OCC_OUTER of the hull of the camera and
 * the body's axis (occlusion.ts), so within OCC_OUTER of this box seen from above. Allocates nothing.
 */
export function hullBox(camX: number, camZ: number, spine: ArrayLike<number>, out: number[] | Float32Array): void {
  out[0] = camX;
  out[1] = camZ;
  out[2] = camX;
  out[3] = camZ;
  for (let i = 0; i + 2 < spine.length; i += 3) {
    const x = spine[i];
    const z = spine[i + 2];
    if (x < out[0]) out[0] = x;
    if (x > out[2]) out[2] = x;
    if (z < out[1]) out[1] = z;
    if (z > out[3]) out[3] = z;
  }
}
