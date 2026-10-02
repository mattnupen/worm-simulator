import * as THREE from 'three';
import { litterDepth, litterMound, LITTER_MAX } from '../surface/litterDepth';
import { WORLD_HALF } from '../surface/terrain';
import { makeShadeAt } from '../surface/treeShadows';
import { sharedLighting } from './paintedMaterial';
import { glslFloat } from './glslNumber';

/** Texels per side of the baked litter map: 0.16 m each over the 40 m world. */
export const LITTER_TEX_N = 256;
export const LITTER_SPAN = 2 * WORLD_HALF;

/** World x (or z) at the centre of texel i. */
export function texelCentre(i: number, n = LITTER_TEX_N): number {
  return ((i + 0.5) / n - 0.5) * LITTER_SPAN;
}

/**
 * The litter baked for shaders that place things near the worm on the GPU (detail leaves, near
 * clutter): R = litter mound / LITTER_MAX, G = litter depth / LITTER_MAX, B = baked trunk shade
 * (light multiplier), A = 255. Row j holds z = texelCentre(j). Built once; never re-uploaded.
 */
export function litterTextureData(n = LITTER_TEX_N): Uint8Array {
  const out = new Uint8Array(n * n * 4);
  const shadeAt = makeShadeAt(sharedLighting.uLightDir.value);
  for (let j = 0; j < n; j++) {
    const z = texelCentre(j, n);
    for (let i = 0; i < n; i++) {
      const x = texelCentre(i, n);
      const d = litterDepth(x, z);
      const k = (j * n + i) * 4;
      out[k] = Math.round((litterMound(d) / LITTER_MAX) * 255);
      out[k + 1] = Math.round((d / LITTER_MAX) * 255);
      out[k + 2] = Math.round(shadeAt(x, z) * 255);
      out[k + 3] = 255;
    }
  }
  return out;
}

let texture: THREE.DataTexture | null = null;

/** The shared baked litter texture (built on first use). */
export function getLitterTexture(): THREE.DataTexture {
  if (!texture) {
    texture = new THREE.DataTexture(litterTextureData(), LITTER_TEX_N, LITTER_TEX_N, THREE.RGBAFormat, THREE.UnsignedByteType);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
  }
  return texture;
}

/** GLSL: litterAt(xz) = (mound m, depth m, trunk shade). Needs uniform uLitter. */
export const LITTER_GLSL = /* glsl */ `
  vec3 litterAt(vec2 xz) {
    vec4 t = texture2D(uLitter, xz / ${glslFloat(LITTER_SPAN)} + 0.5);
    return vec3(t.rg * ${glslFloat(LITTER_MAX)}, t.b);
  }
`;

/**
 * TS twin of litterAt over baked bytes (`n` texels per side), filtered as the GPU does (bilinear,
 * clamped at the edges): writes (mound m, depth m, trunk shade) into `out`. For tests.
 */
export function sampleLitter(data: Uint8Array, x: number, z: number, out: number[], n = LITTER_TEX_N): void {
  const tx = (x / LITTER_SPAN + 0.5) * n - 0.5;
  const tz = (z / LITTER_SPAN + 0.5) * n - 0.5;
  const i = Math.floor(tx);
  const j = Math.floor(tz);
  const fx = tx - i;
  const fz = tz - j;
  const at = (a: number, b: number, ch: number) =>
    data[(Math.min(n - 1, Math.max(0, b)) * n + Math.min(n - 1, Math.max(0, a))) * 4 + ch] / 255;
  for (let ch = 0; ch < 3; ch++) {
    const top = at(i, j, ch) * (1 - fx) + at(i + 1, j, ch) * fx;
    const bottom = at(i, j + 1, ch) * (1 - fx) + at(i + 1, j + 1, ch) * fx;
    out[ch] = (top * (1 - fz) + bottom * fz) * (ch < 2 ? LITTER_MAX : 1);
  }
}
