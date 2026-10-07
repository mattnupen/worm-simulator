import { describe, it, expect } from 'vitest';
import { groundUniforms, setFocus, uploadDisturbance } from '../../src/render/groundUniforms';
import { createDisturbance, recentre, stamp, DIST_CELL } from '../../src/surface/disturbance';
import { createLeafMaterial } from '../../src/render/leafMaterial';
import { createPaintedMaterial, sharedLighting } from '../../src/render/paintedMaterial';
import { createPropMaterial } from '../../src/render/propMaterial';
import { createFloorMaterial } from '../../src/render/floorMaterial';

describe('groundUniforms', () => {
  it('setFocus stores the head and snaps the wrap centre to the 1 m grid', () => {
    setFocus(2.6, 0.1, -3.4);
    expect(groundUniforms.uFocus.value.toArray()).toEqual([2.6, 0.1, -3.4]);
    expect(groundUniforms.uWrapCentre.value.toArray()).toEqual([3, -3]);
  });

  it('uploadDisturbance packs into the same texture and moves the origin with the grid', () => {
    const tex = groundUniforms.uDisturb.value;
    const data = tex.image.data;
    const version = tex.version;
    const m = createDisturbance();
    recentre(m, 1, 1);
    stamp(m, 1, 1, 1);
    uploadDisturbance(m);
    expect(tex.image.data).toBe(data);
    expect(tex.version).toBeGreaterThan(version);
    expect(groundUniforms.uDistOrigin.value.x).toBeCloseTo(m.ci * DIST_CELL, 12);
    expect(groundUniforms.uDistOrigin.value.y).toBeCloseTo(m.cj * DIST_CELL, 12);
    expect(Array.from(data as Uint8Array).some((v, k) => k % 4 === 2 && v > 200)).toBe(true);
  });
});

describe('createLeafMaterial', () => {
  it('the top leaves (litter and detail) lie above the buried worm: they fade over it, but never move', () => {
    for (const v of ['litter', 'detail'] as const) {
      const m = createLeafMaterial(v);
      expect(m.defines).not.toHaveProperty('DISTURB');
      expect(m.defines).toHaveProperty('OCCLUDE');
    }
  });
  it('the falling leaves do not', () => {
    const m = createLeafMaterial('falling');
    expect(m.defines).toHaveProperty('FALLING');
    expect(m.defines).not.toHaveProperty('DISTURB');
  });
});

describe('leaf occluder fade', () => {
  it('is on for every leaf layer over or round the worm, the ground (the top of the litter) and Ultra\'s near clutter, off for the falling leaves', () => {
    const faded = [
      ...(['litter', 'detail', 'hero'] as const).map((v) => createLeafMaterial(v)), createPropMaterial(true),
      createPaintedMaterial({ color: '#ffffff', occlude: true }),
    ];
    for (const m of faded) {
      expect(m.defines).toHaveProperty('OCCLUDE');
      for (const u of ['uOccSeg', 'uOccCount', 'uOccBox', 'uOccTan', 'uOccDepth', 'uOccUp'] as const) expect(m.uniforms[u]).toBe(groundUniforms[u]);
      expect(m.uniforms.uResolution).toBe(sharedLighting.uResolution);
      expect(m.fragmentShader).toContain('if (fadedOut()) discard;');
    }
    expect(createLeafMaterial('falling').defines).not.toHaveProperty('OCCLUDE');
    expect(createPropMaterial().defines).not.toHaveProperty('OCCLUDE');
  });
  it('takes every derivative before the fade\'s discard (after a discard they are undefined on some drivers)', () => {
    const faded = [
      ...(['litter', 'detail', 'hero'] as const).map((v) => createLeafMaterial(v)), createPropMaterial(true),
      createPaintedMaterial({ color: '#ffffff', occlude: true }),
    ];
    for (const m of faded) {
      const fs = m.fragmentShader;
      const main = fs.indexOf('void main()');
      const cut = fs.indexOf('if (fadedOut()) discard;', main);
      expect(cut).toBeGreaterThan(main);
      expect(fs.slice(cut)).not.toMatch(/\b(fwidth|dFdx|dFdy)\s*\(/);
    }
    // The vein bands still get theirs (the leaves use them; the props have none).
    expect(createLeafMaterial('litter').fragmentShader).toMatch(/fwidth\s*\(/);
  });
  it('the plain and low-detail litter neither react nor fade (no fetches, no discard)', () => {
    for (const v of ['plain', 'far'] as const) {
      const m = createLeafMaterial(v);
      expect(m.defines).not.toHaveProperty('DISTURB');
      expect(m.defines).not.toHaveProperty('OCCLUDE');
      // Same shared uniforms, so a chunk can swap between the variants with nothing to copy.
      expect(m.uniforms.uLightDir).toBe(sharedLighting.uLightDir);
    }
    expect(createLeafMaterial('far').defines).toHaveProperty('LOD');
    expect(createLeafMaterial('far').fragmentShader).toContain('#ifdef LOD');
  });
});

describe('the floor under the buried worm', () => {
  it('darkens along a fresh trail from the shared map', () => {
    const m = createFloorMaterial();
    expect(m.uniforms.uDisturbTrail).toBe(groundUniforms.uDisturbTrail);
    expect(m.uniforms.uSpine).toBe(groundUniforms.uSpine);
    expect(m.fragmentShader).toContain('trailShade(vPosW.xz)');
    expect(m.vertexShader).toContain('terrainHeight(xz)');
    expect(createPaintedMaterial({ color: '#ffffff' }).defines).not.toHaveProperty('OCCLUDE');
  });
});
