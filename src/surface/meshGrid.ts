import { WORLD_HALF } from './terrain';

/**
 * The layout of the drawn ground's height grid (pure): uniform 0.5 m cells over the play area,
 * a few widening rings out to the horizon under the fog. The terrain mesh draws the litter top on
 * it (terrainMesh.ts), litterTopHeight samples it exactly as drawn (litterDepth.ts), and the baked
 * ground texture rebuilds it in shaders (groundTexture.ts).
 */
const INNER = WORLD_HALF + 2;
const OUTER = 50;
const INNER_SEGS = 88;
const OUTER_SEGS = 8;
/** The grid's layout, for shaders that rebuild the rendered ground from its vertex heights (groundTexture). */
export const MESH_GRID = { inner: INNER, outer: OUTER, innerSegs: INNER_SEGS, outerSegs: OUTER_SEGS } as const;

/** Grid line coordinates: dense and uniform over the play area, coarse beyond it. */
export function gridLines(): number[] {
  const out: number[] = [];
  for (let i = OUTER_SEGS; i > 0; i--) {
    const t = i / OUTER_SEGS;
    out.push(-(INNER + (OUTER - INNER) * t * t));
  }
  for (let i = 0; i <= INNER_SEGS; i++) out.push(-INNER + (2 * INNER * i) / INNER_SEGS);
  for (let i = 1; i <= OUTER_SEGS; i++) {
    const t = i / OUTER_SEGS;
    out.push(INNER + (OUTER - INNER) * t * t);
  }
  return out;
}

/** Index of the grid cell [lines[i], lines[i + 1]] holding v (clamped to the grid). */
function cellOf(lines: readonly number[], v: number): number {
  let lo = 0;
  let hi = lines.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lines[mid] <= v) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * The height of the grid surface at (x, z) exactly as the mesh draws it: the same grid, the same
 * diagonal split (b-d, as in the index buffer) and barycentric interpolation of the vertex
 * heights (`heights`, row j holding grid line j along z).
 */
export function sampleGrid(lines: readonly number[], heights: ArrayLike<number>, x: number, z: number): number {
  const n = lines.length;
  const i = cellOf(lines, x);
  const j = cellOf(lines, z);
  const u = Math.min(1, Math.max(0, (x - lines[i]) / (lines[i + 1] - lines[i])));
  const v = Math.min(1, Math.max(0, (z - lines[j]) / (lines[j + 1] - lines[j])));
  const a = heights[j * n + i];
  const b = heights[j * n + i + 1];
  const d = heights[(j + 1) * n + i];
  const e = heights[(j + 1) * n + i + 1];
  // Triangles (a, d, b) and (b, d, e) share the diagonal b-d, where u + v = 1.
  return u + v <= 1 ? a + u * (b - a) + v * (d - a) : e + (1 - u) * (d - e) + (1 - v) * (b - e);
}
