import { describe, it, expect } from 'vitest';
import { glslFloat } from '../../src/render/glslNumber';

describe('glslFloat', () => {
  it('prints a float literal GLSL accepts', () => {
    expect(glslFloat(13)).toBe('13.0000000');
    expect(glslFloat(-27)).toBe('-27.0000000');
    expect(glslFloat(0)).toBe('0.00000000');
    expect(glslFloat(1e21)).toMatch(/e\+21$/);
  });

  it('round-trips through float32: the shader gets the float32 nearest the TS value', () => {
    for (const v of [0.015625, 0.078125, 1 / 3, 0.14, 0.34 - 0.14, 2.2, 22, 0.25, Math.PI, 1e-7]) {
      expect(Math.fround(Number(glslFloat(v)))).toBe(Math.fround(v));
    }
  });
});
