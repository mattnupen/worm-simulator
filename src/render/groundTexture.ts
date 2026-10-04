import * as THREE from 'three';
import { heightGrid, MESH_GRID } from '../surface/terrainMesh';
import { glslFloat as f } from './glslNumber';

/**
 * The rendered ground (`meshGroundHeight`) baked for shaders that lay things on it themselves
 * (the detail leaves), so they rest on exactly the surface the terrain mesh draws and the worm
 * rests on: the height at every terrain-mesh vertex, one float each. meshGround() finds the mesh
 * cell from the grid's layout (uniform over the play area, widening rings past it), then
 * interpolates over the same triangle as the mesh (split on the same diagonal).
 */
export const GROUND_TEX_N = MESH_GRID.innerSegs + 2 * MESH_GRID.outerSegs + 1;

const { inner: IN, outer: OUT, innerSegs: NI, outerSegs: NO } = MESH_GRID;
const STEP = (2 * IN) / NI;

/** Mesh vertex heights, row j holding grid line j along z, for the active scale mode. */
export function groundTextureData(): Float32Array {
  return Float32Array.from(heightGrid().heights);
}

/** Grid line k's world coordinate (k from 0 to GROUND_TEX_N - 1). */
function line(k: number): number {
  const i = k - NO;
  if (i < 0) return -(IN + (OUT - IN) * (i / NO) ** 2);
  if (i > NI) return IN + (OUT - IN) * ((i - NI) / NO) ** 2;
  return -IN + i * STEP;
}

/** The grid cell [line(k), line(k + 1)] holding v (clamped to the grid). */
function cell(v: number): number {
  const a = Math.abs(v);
  // Past the uniform grid the rings widen with the square of their number.
  const g = a <= IN ? (v + IN) / STEP : Math.sign(v) * Math.sqrt(Math.min(1, (a - IN) / (OUT - IN))) * NO + (v > 0 ? NI : 0);
  return Math.min(GROUND_TEX_N - 2, Math.max(0, Math.floor(g + NO)));
}

/** TS twin of meshGround() over `data` (from groundTextureData), for tests. */
export function bakedGroundHeight(data: Float32Array, x: number, z: number): number {
  const n = GROUND_TEX_N;
  const i = cell(x);
  const j = cell(z);
  const x0 = line(i);
  const z0 = line(j);
  const u = Math.min(1, Math.max(0, (x - x0) / (line(i + 1) - x0)));
  const v = Math.min(1, Math.max(0, (z - z0) / (line(j + 1) - z0)));
  const a = data[j * n + i];
  const b = data[j * n + i + 1];
  const d = data[(j + 1) * n + i];
  const e = data[(j + 1) * n + i + 1];
  // Triangles (a, d, b) and (b, d, e), split on the diagonal b-d as the terrain mesh is.
  return u + v <= 1 ? a + u * (b - a) + v * (d - a) : e + (1 - u) * (d - e) + (1 - v) * (b - e);
}

let texture: THREE.DataTexture | null = null;

/** The shared baked ground texture (built on first use; read with texelFetch, never filtered). */
export function getGroundTexture(): THREE.DataTexture {
  if (!texture) {
    texture = new THREE.DataTexture(groundTextureData(), GROUND_TEX_N, GROUND_TEX_N, THREE.RedFormat, THREE.FloatType);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
  }
  return texture;
}

/** After a scale-mode change: the new ground's heights, in place (as refreshLitterTexture). */
export function refreshGroundTexture(): void {
  if (!texture) return;
  (texture.image.data as Float32Array).set(groundTextureData());
  texture.needsUpdate = true;
}

/** GLSL: meshGround(xz), the rendered ground height. Needs uniform uGround. */
export const GROUND_GLSL = /* glsl */ `
  uniform highp sampler2D uGround;
  vec2 meshLine(vec2 k) {
    vec2 i = k - ${f(NO)};
    vec2 lo = -(${f(IN)} + ${f(OUT - IN)} * (i / ${f(NO)}) * (i / ${f(NO)}));
    vec2 hi = ${f(IN)} + ${f(OUT - IN)} * ((i - ${f(NI)}) / ${f(NO)}) * ((i - ${f(NI)}) / ${f(NO)});
    return mix(mix(-${f(IN)} + i * ${f(STEP)}, hi, step(${f(NI)} + 0.5, i)), lo, step(i, vec2(-0.5)));
  }
  float meshGround(vec2 xz) {
    vec2 a = abs(xz);
    // Past the uniform grid the rings widen with the square of their number.
    vec2 ring = sign(xz) * sqrt(clamp((a - ${f(IN)}) / ${f(OUT - IN)}, 0.0, 1.0)) * ${f(NO)} + step(0.0, xz) * ${f(NI)};
    vec2 g = mix((xz + ${f(IN)}) / ${f(STEP)}, ring, 1.0 - step(a, vec2(${f(IN)})));
    vec2 k = clamp(floor(g + ${f(NO)}), 0.0, ${f(GROUND_TEX_N - 2)});
    vec2 p0 = meshLine(k);
    vec2 w = clamp((xz - p0) / (meshLine(k + 1.0) - p0), 0.0, 1.0);
    ivec2 c = ivec2(k);
    float h00 = texelFetch(uGround, c, 0).r;
    float h10 = texelFetch(uGround, c + ivec2(1, 0), 0).r;
    float h01 = texelFetch(uGround, c + ivec2(0, 1), 0).r;
    float h11 = texelFetch(uGround, c + ivec2(1, 1), 0).r;
    return w.x + w.y <= 1.0
      ? h00 + w.x * (h10 - h00) + w.y * (h01 - h00)
      : h11 + (1.0 - w.x) * (h01 - h11) + (1.0 - w.y) * (h10 - h11);
  }
`;
