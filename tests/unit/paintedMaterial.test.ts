import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createPaintedMaterial, setRimLight, sharedLighting } from '../../src/render/paintedMaterial';

describe('painted material', () => {
  it('builds a ShaderMaterial with its own color', () => {
    const m = createPaintedMaterial({ color: '#ff0000' });
    expect(m).toBeInstanceOf(THREE.ShaderMaterial);
    expect((m.uniforms.uColor.value as THREE.Color).r).toBeCloseTo(1);
  });
  it('shares lighting uniforms so one switch updates every material', () => {
    const a = createPaintedMaterial({ color: '#ffffff' });
    const b = createPaintedMaterial({ color: '#000000' });
    setRimLight(false);
    expect(a.uniforms.uRim.value).toBe(0);
    expect(b.uniforms.uRim.value).toBe(0);
    setRimLight(true);
    expect(a.uniforms.uRim).toBe(sharedLighting.uRim);
    expect(b.uniforms.uRim.value).toBe(1);
  });
  it('can be double-sided for leaves', () => {
    expect(createPaintedMaterial({ color: '#fff', doubleSide: true }).side).toBe(THREE.DoubleSide);
  });
});
