import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  groundTextureData, bakedGroundHeight, getGroundTexture, GROUND_GLSL, GROUND_TEX_N,
} from '../../src/render/groundTexture';
import { heightGrid, meshGroundHeight, MESH_GRID } from '../../src/surface/terrainMesh';
import { mulberry32 } from '../../src/core/random';

describe('baked ground texture', () => {
  const data = groundTextureData();

  it('holds the terrain mesh vertex heights', () => {
    const { lines, heights } = heightGrid();
    expect(GROUND_TEX_N).toBe(lines.length);
    expect(data.length).toBe(heights.length);
    for (let k = 0; k < data.length; k += 97) expect(data[k]).toBeCloseTo(heights[k], 6);
  });

  it('reproduces the rendered ground exactly (cells, rings, diagonal and all)', () => {
    const rng = mulberry32(5);
    let worst = 0;
    const at = (x: number, z: number) => {
      worst = Math.max(worst, Math.abs(bakedGroundHeight(data, x, z) - meshGroundHeight(x, z)));
    };
    for (let k = 0; k < 20000; k++) at((rng() * 2 - 1) * MESH_GRID.inner, (rng() * 2 - 1) * MESH_GRID.inner);
    for (let k = 0; k < 20000; k++) at((rng() * 2 - 1) * MESH_GRID.outer, (rng() * 2 - 1) * MESH_GRID.outer);
    // On the grid lines, where a cell is chosen.
    for (const x of heightGrid().lines) for (const z of [-30.1, -22, -3.5, 0, 17.25, 22, 24.7, 49.9]) at(x, z);
    // Float32 storage only.
    expect(worst).toBeLessThan(2e-6);
  });

  it('is a float texture read texel by texel, built once', () => {
    const t = getGroundTexture();
    expect(getGroundTexture()).toBe(t);
    expect(t.type).toBe(THREE.FloatType);
    expect(t.format).toBe(THREE.RedFormat);
    expect(t.magFilter).toBe(THREE.NearestFilter);
    expect(t.image.width).toBe(GROUND_TEX_N);
    expect(GROUND_GLSL).toContain('texelFetch(uGround');
  });
});
