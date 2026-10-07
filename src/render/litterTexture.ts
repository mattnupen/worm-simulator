import * as THREE from 'three';
import { litterDepth, LITTER_MAX } from '../surface/litterDepth';
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
 * How far round a texel the G channel looks for the thinnest litter (m): past the biggest pocket
 * leaf's radius (0.76) and a drawn ground cell's diagonal (0.71), so a leaf laid by its home's G
 * never reaches thinner litter, nor a drawn triangle cut lower by a drift's edge.
 */
export const THIN_REACH = 1.5;
/**
 * How far past the world's edge (m) the outermost texels' G looks too: lookups past the edge read
 * them (clamped), and the pocket's leaves can lie there (their homes up to POCKET_FAR, 2 m, from a
 * spine kept within PLAY_HALF, 1 m inside the edge), on litter the drawn top continues out to
 * WORLD_HALF + 2. So a leaf whose home lies up to 1.5 m past the edge never reaches thinner litter
 * than its G either.
 */
export const EDGE_REACH = 1.5 + THIN_REACH;

/**
 * The litter baked for shaders that place things near the worm on the GPU (detail leaves, near
 * clutter): R = litter depth / LITTER_MAX (the top above the floor), G = the thinnest depth within
 * THIN_REACH (a square round the texel; past the world's edge too for the outermost texels, see
 * EDGE_REACH) / LITTER_MAX, B = baked trunk shade (light multiplier),
 * A = 255. Row j holds z = texelCentre(j). Uploaded once.
 */
export function litterTextureData(n = LITTER_TEX_N): Uint8Array {
  const out = new Uint8Array(n * n * 4);
  const shadeAt = makeShadeAt(sharedLighting.uLightDir.value);
  for (let j = 0; j < n; j++) {
    const z = texelCentre(j, n);
    for (let i = 0; i < n; i++) {
      const x = texelCentre(i, n);
      const k = (j * n + i) * 4;
      out[k] = Math.round((litterDepth(x, z) / LITTER_MAX) * 255);
      out[k + 2] = Math.round(shadeAt(x, z) * 255);
      out[k + 3] = 255;
    }
  }
  // G: a separable min filter of R over the square, rounded down a step (never deeper than R's),
  // on R padded by `pad` texels past each edge; an edge texel's window runs out to the pad's end.
  const w = Math.ceil(THIN_REACH / (LITTER_SPAN / n)) + 1;
  const pad = Math.ceil(EDGE_REACH / (LITTER_SPAN / n));
  const m = n + 2 * pad;
  const depth = new Uint8Array(m * m);
  for (let jj = 0; jj < m; jj++) {
    const z = texelCentre(jj - pad, n);
    for (let ii = 0; ii < m; ii++) {
      const i = ii - pad;
      const j = jj - pad;
      depth[jj * m + ii] = i >= 0 && j >= 0 && i < n && j < n
        ? out[(j * n + i) * 4] : Math.round((litterDepth(texelCentre(i, n), z) / LITTER_MAX) * 255);
    }
  }
  /** The window (padded indices, inclusive) round texel k of n. */
  const from = (k: number) => (k === 0 ? 0 : k + pad - w);
  const to = (k: number) => (k === n - 1 ? m - 1 : k + pad + w);
  const rows = new Uint8Array(m * n);
  for (let jj = 0; jj < m; jj++) {
    for (let i = 0; i < n; i++) {
      let lo = 255;
      for (let d = from(i); d <= to(i); d++) lo = Math.min(lo, depth[jj * m + d]);
      rows[jj * n + i] = lo;
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let lo = 255;
      for (let d = from(j); d <= to(j); d++) lo = Math.min(lo, rows[d * n + i]);
      out[(j * n + i) * 4 + 1] = Math.max(0, lo - 1);
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

/** GLSL: litterAt(xz) = (depth m, thinnest depth near it m, trunk shade). Needs uniform uLitter. */
export const LITTER_GLSL = /* glsl */ `
  vec3 litterAt(vec2 xz) {
    vec4 t = texture2D(uLitter, xz / ${glslFloat(LITTER_SPAN)} + 0.5);
    return vec3(t.rg * ${glslFloat(LITTER_MAX)}, t.b);
  }
`;

/**
 * TS twin of litterAt over baked bytes (`n` texels per side), filtered as the GPU does (bilinear,
 * clamped at the edges): writes (depth m, thinnest depth near it m, trunk shade) into `out`.
 * Allocates nothing (the pocket's leaves are listed with it every frame: pocketLeaves.ts).
 */
export function sampleLitter(data: Uint8Array, x: number, z: number, out: number[], n = LITTER_TEX_N): void {
  const tx = (x / LITTER_SPAN + 0.5) * n - 0.5;
  const tz = (z / LITTER_SPAN + 0.5) * n - 0.5;
  const i = Math.floor(tx);
  const j = Math.floor(tz);
  const fx = tx - i;
  const fz = tz - j;
  const i0 = Math.min(n - 1, Math.max(0, i));
  const i1 = Math.min(n - 1, Math.max(0, i + 1));
  const r0 = Math.min(n - 1, Math.max(0, j)) * n;
  const r1 = Math.min(n - 1, Math.max(0, j + 1)) * n;
  for (let ch = 0; ch < 3; ch++) {
    const top = (data[(r0 + i0) * 4 + ch] / 255) * (1 - fx) + (data[(r0 + i1) * 4 + ch] / 255) * fx;
    const bottom = (data[(r1 + i0) * 4 + ch] / 255) * (1 - fx) + (data[(r1 + i1) * 4 + ch] / 255) * fx;
    out[ch] = (top * (1 - fz) + bottom * fz) * (ch < 2 ? LITTER_MAX : 1);
  }
}
