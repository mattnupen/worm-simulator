import { describe, it, expect } from 'vitest';
import { createLeafMaterial, type LeafVariant } from '../../src/render/leafMaterial';

describe('cheaper leaf shading', () => {
  const variants: LeafVariant[] = ['litter', 'plain', 'far', 'falling', 'detail', 'hero'];

  it('every leaf variant samples the painted noise once per vertex, never per pixel', () => {
    for (const v of variants) {
      const m = createLeafMaterial(v);
      expect(m.vertexShader).toContain('vNz = texture2D(uNoise, vNoise.xy);');
      expect(m.fragmentShader).not.toContain('texture2D(uNoise');
      expect(m.fragmentShader).toContain('vec4 nz = vNz;');
    }
  });

  it('distant litter skips the veins and the wet sheen', () => {
    expect(createLeafMaterial('far').defines).toEqual({ LOD: '' });
    expect(createLeafMaterial('far').fragmentShader).toContain('#ifdef LOD');
  });
});
