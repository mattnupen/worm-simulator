import type { Vec3 } from '../core/vec';

/** Half-width of the square forest-floor world (world units, ~metres at worm scale). */
export const WORLD_HALF = 20;
/** The worm is clamped to this half-width; tests check the terrain is gentle inside it. */
export const PLAY_HALF = WORLD_HALF - 1;

const smoothstep = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Low, rolling undulation: a few incommensurate sines along different directions so no
 * axis-aligned pattern shows. Peak amplitude is about 0.44.
 */
function undulation(x: number, z: number): number {
  return (
    0.2 * Math.sin(0.21 * x + 1.3) * Math.cos(0.17 * z - 0.7)
    + 0.13 * Math.sin(0.37 * (x + z) + 2.1)
    + 0.07 * Math.sin(0.71 * x - 0.53 * z + 0.4)
    + 0.04 * Math.cos(1.1 * z + 0.6 * x + 1.7)
  );
}

/**
 * Ground height at (x, z). Pure and deterministic.
 * - Flat (exactly 0) within ~1.5 of the origin, where the worm spawns, easing in by r = 7.
 * - Gentle rolls (|h| <= ~0.45) across the playable world.
 * - Beyond the world edge it rises into a soft berm that closes the horizon behind the
 *   distant tree ring. A rounded-square (L4) radius keeps the berm out of the play corners.
 */
export function terrainHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const spawnMask = smoothstep(1.5, 7, r);
  const sq = Math.sqrt(Math.sqrt(x ** 4 + z ** 4));
  const berm = smoothstep(WORLD_HALF + 1, WORLD_HALF + 14, sq) * 2.2;
  return undulation(x, z) * spawnMask + berm;
}

const EPS = 0.01;

/** Unit surface normal at (x, z), from central differences of terrainHeight. */
export function terrainNormal(x: number, z: number): Vec3 {
  const dx = (terrainHeight(x + EPS, z) - terrainHeight(x - EPS, z)) / (2 * EPS);
  const dz = (terrainHeight(x, z + EPS) - terrainHeight(x, z - EPS)) / (2 * EPS);
  const len = Math.hypot(dx, 1, dz);
  return { x: -dx / len, y: 1 / len, z: -dz / len };
}

/**
 * GLSL twin of terrainHeight (keep the two in step), for shaders that place things on the
 * ground themselves (falling leaves). A handful of sines: cheap per vertex, not per pixel.
 */
export const TERRAIN_GLSL = /* glsl */ `
  float terrainHeight(vec2 p) {
    float r = length(p);
    float spawnMask = smoothstep(1.5, 7.0, r);
    float sq = sqrt(sqrt(p.x * p.x * p.x * p.x + p.y * p.y * p.y * p.y));
    float berm = smoothstep(${WORLD_HALF + 1}.0, ${WORLD_HALF + 14}.0, sq) * 2.2;
    float u = 0.2 * sin(0.21 * p.x + 1.3) * cos(0.17 * p.y - 0.7)
      + 0.13 * sin(0.37 * (p.x + p.y) + 2.1)
      + 0.07 * sin(0.71 * p.x - 0.53 * p.y + 0.4)
      + 0.04 * cos(1.1 * p.y + 0.6 * p.x + 1.7);
    return u * spawnMask + berm;
  }
`;
