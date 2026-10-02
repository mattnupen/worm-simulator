import { describe, it, expect } from 'vitest';
import { groundUniforms, setFocus, uploadDisturbance } from '../../src/render/groundUniforms';
import { createDisturbance, recentre, stamp, DIST_CELL } from '../../src/surface/disturbance';
import { createLeafMaterial } from '../../src/render/leafMaterial';
import { sharedLighting } from '../../src/render/paintedMaterial';

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
    stamp(m, 1, 1, 0, 1, 1, 1);
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
    expect(m.vertexShader).toContain('disturb(wp.xyz)');
  });
  it('the falling leaves do not', () => {
    const m = createLeafMaterial('falling');
    expect(m.defines).toHaveProperty('FALLING');
    expect(m.defines).not.toHaveProperty('DISTURB');
  });
});
