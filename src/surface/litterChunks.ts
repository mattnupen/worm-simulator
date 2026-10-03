import { WORLD_HALF } from './terrain';

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
/** Chunks this close to the worm's head react to it (disturbance map, occluder fade). */
export const ACTIVE_RANGE = 5;

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
