import { describe, it, expect } from 'vitest';
import { terrainHeight, TERRAIN_GLSL } from '../../src/surface/terrain';

/**
 * Transliterates the GLSL twin of terrainHeight into JS and runs it, so a change to either
 * the TS function or the shader string without the other fails here.
 */
function glslToJs(src: string): (x: number, z: number) => number {
  const body = src.slice(src.indexOf('{') + 1, src.lastIndexOf('}'));
  // The JS side must understand every call the shader makes: fail loudly on anything new.
  const calls = new Set([...body.matchAll(/([A-Za-z_]\w*)\s*\(/g)].map((m) => m[1]));
  for (const c of calls) {
    if (!['length', 'smoothstep', 'sqrt', 'sin', 'cos'].includes(c)) throw new Error(`untranslated GLSL call: ${c}`);
  }
  const js = body
    .replace(/\bfloat\s+/g, 'let ')
    .replace(/\blength\(p\)/g, 'Math.hypot(px, py)')
    .replace(/\bp\.x\b/g, 'px')
    .replace(/\bp\.y\b/g, 'py')
    .replace(/\b(sqrt|sin|cos)\(/g, 'Math.$1(');
  if (/\bp\b|vec\d|\bfloat\b/.test(js)) throw new Error(`untranslated GLSL: ${js}`);
  const smoothstep = (a: number, b: number, v: number) => {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  // eslint-disable-next-line no-new-func
  const fn = new Function('px', 'py', 'smoothstep', js) as (x: number, z: number, s: typeof smoothstep) => number;
  return (x, z) => fn(x, z, smoothstep);
}

describe('TERRAIN_GLSL', () => {
  const glsl = glslToJs(TERRAIN_GLSL);
  it('matches terrainHeight everywhere (play area, spawn, berm and beyond)', () => {
    for (let x = -45; x <= 45; x += 1.37) {
      for (let z = -45; z <= 45; z += 1.53) {
        expect(glsl(x, z)).toBeCloseTo(terrainHeight(x, z), 9);
      }
    }
    for (const [x, z] of [[0, 0], [1, 1], [5, -3], [21, 0], [-30, 33]]) {
      expect(glsl(x, z)).toBeCloseTo(terrainHeight(x, z), 9);
    }
  });
});
