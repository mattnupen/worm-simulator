import * as THREE from 'three';
import { fbm2, valueNoise2 } from '../core/noise';

export const NOISE_SIZE = 128;

/**
 * One small tiling RGBA noise texture, generated once and shared by every painted surface,
 * so a pixel pays for a single texture fetch instead of procedural 3D noise.
 *  R: broad soft patches (dappled light, value blotches)
 *  G: stretched brush strokes
 *  B: fine flecks
 *  A: slow warm/cool hue drift
 */
export function generateNoiseData(size = NOISE_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const to8 = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const u = i / size;
      const v = j / size;
      const k = (j * size + i) * 4;
      data[k] = to8(fbm2(u * 4, v * 4, 3, 101, 4));
      // Strokes: 6 cells across, 24 along, so each blob is a short dab of paint.
      const s = valueNoise2(u * 24, v * 6, 202, 24, 6) * 0.65 + valueNoise2(u * 48, v * 12, 203, 48, 12) * 0.35;
      data[k + 1] = to8((s - 0.5) * 1.6 + 0.5);
      data[k + 2] = to8(fbm2(u * 32, v * 32, 2, 303, 32));
      data[k + 3] = to8(fbm2(u * 8, v * 8, 2, 404, 8));
    }
  }
  return data;
}

let shared: THREE.DataTexture | null = null;

export function getNoiseTexture(): THREE.DataTexture {
  if (shared) return shared;
  const t = new THREE.DataTexture(generateNoiseData(), NOISE_SIZE, NOISE_SIZE, THREE.RGBAFormat);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  // Bilinear without mips: trilinear filtering measured ~2.5 ms/frame dearer under software
  // GL. Shaders fade the fine brush detail with distance instead, so far ground doesn't shimmer.
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  shared = t;
  return t;
}
