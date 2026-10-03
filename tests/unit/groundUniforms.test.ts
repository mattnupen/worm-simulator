import { describe, it, expect } from 'vitest';
import { groundUniforms, setFocus, uploadDisturbance } from '../../src/render/groundUniforms';
import { createDisturbance, recentre, stamp, DIST_CELL } from '../../src/surface/disturbance';
import { createLeafMaterial } from '../../src/render/leafMaterial';
import { createPaintedMaterial, sharedLighting } from '../../src/render/paintedMaterial';
import { createPropMaterial } from '../../src/render/propMaterial';

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
  it('the floor litter reads the shared disturbance map', () => {
    const m = createLeafMaterial();
    expect(m.defines).toHaveProperty('DISTURB');
    expect(m.uniforms.uDisturb).toBe(groundUniforms.uDisturb);
    expect(m.uniforms.uLightDir).toBe(sharedLighting.uLightDir);
    expect(m.vertexShader).toContain('disturb(wp.xyz, aAnchor');
  });
  it('the falling leaves do not', () => {
    const m = createLeafMaterial('falling');
    expect(m.defines).toHaveProperty('FALLING');
    expect(m.defines).not.toHaveProperty('DISTURB');
  });
});

describe('leaf occluder fade', () => {
  it('is on for every leaf layer the worm moves through (and Ultra\'s near clutter), off for the falling leaves', () => {
    const faded = [...(['litter', 'detail', 'hero'] as const).map((v) => createLeafMaterial(v)), createPropMaterial(true)];
    for (const m of faded) {
      expect(m.defines).toHaveProperty('OCCLUDE');
      for (const u of ['uOccSeg', 'uOccCount', 'uOccBox', 'uOccTan', 'uOccDepth'] as const) expect(m.uniforms[u]).toBe(groundUniforms[u]);
      expect(m.uniforms.uResolution).toBe(sharedLighting.uResolution);
      expect(m.fragmentShader).toContain('if (fadedOut()) discard;');
    }
    expect(createLeafMaterial('falling').defines).not.toHaveProperty('OCCLUDE');
    expect(createPropMaterial().defines).not.toHaveProperty('OCCLUDE');
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

describe('the ground', () => {
  it('darkens the soil along a fresh trail from the shared map', () => {
    const m = createPaintedMaterial({ color: '#ffffff', trail: true });
    expect(m.defines).toHaveProperty('TRAIL');
    expect(m.uniforms.uDisturb).toBe(groundUniforms.uDisturb);
    expect(m.fragmentShader).toContain('trailShade(vPosW.xz)');
    expect(createPaintedMaterial({ color: '#ffffff' }).defines).not.toHaveProperty('TRAIL');
  });
});
