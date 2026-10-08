import { sharedLighting } from '../render/paintedMaterial';
import { FACE_BELOW, FACE_PAST } from './cutFrame';
import { boundaryAt, B_TOP, type Slab } from './slab';

/**
 * How the cut face is lit (V2 spec 5.3), shared by its shader (cutFaceGlsl.ts) and by what is drawn
 * on it (faceShade, for cutShapes.ts), so stones, roots and life darken with depth exactly as the soil
 * around them does. tests/unit/faceLight.test.ts checks both use these.
 */
/** The soil is this bright (before gamma) DIM_DEPTH below the litter top, and stays so below. */
export const DIM_DEPTH = 6;
export const DIM_LEVEL = 0.45;
/** Just under the litter top, warm light adds this much (times the sun's colour), fading out by WARM_DEPTH. */
export const WARM_ADD = 0.3;
export const WARM_DEPTH = 1.2;
/** Past the playable slab the soil dims to this, over BEYOND_SPAN. */
export const BEYOND_LEVEL = 0.55;
export const BEYOND_SPAN = 2;
/**
 * Past the face's ends the soil carries on this far (at least FACE_PAST), fading to deep soil: the
 * camera's swing in and out of the cut can look along the face past its end, and a short fade there
 * read as a hard dark edge (the clear colour beyond is the same deep soil: cutScene.ts).
 */
export const FACE_FADE = Math.max(FACE_PAST, 4);
/** The fade to dark under the slab starts this far above its bottom (and ends FACE_BELOW under it). */
export const BOTTOM_FADE = 2;
/** The face's colours are written in a roughly perceptual space and raised to this power. */
export const FACE_GAMMA = 2.2;

/** GLSL's smoothstep (edge a below edge b). */
export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The face's own shading at plane point (u, v), as a linear-light factor: darker with depth below
 * the litter top, warmer just under it, dimmer past the playable slab and fading out past the
 * drawn face's ends and below the slab, as cutFaceGlsl.ts does before its gamma (faceLight.ts).
 * Above the litter top, 1 (the forest's own light).
 */
export function faceShade(s: Slab, u: number, v: number): number {
  const below = boundaryAt(s, B_TOP, u) - v;
  if (below <= 0) return 1;
  let f = (1 - (1 - DIM_LEVEL) * smooth(0, DIM_DEPTH, below)) * (1 + WARM_ADD * sunLum() * (1 - smooth(0, WARM_DEPTH, below)));
  f *= 1 - (1 - BEYOND_LEVEL) * smooth(0, BEYOND_SPAN, Math.max(s.playLo - u, u - s.playHi));
  f *= smooth(s.faceLo - FACE_FADE, s.faceLo, u) * (1 - smooth(s.faceHi, s.faceHi + FACE_FADE, u));
  f *= smooth(s.bottom - FACE_BELOW, s.bottom + BOTTOM_FADE, v);
  return Math.pow(Math.max(0, f), FACE_GAMMA);
}

/** The sun colour's luminance (the face's warm light is that colour; here it brightens as one number). */
function sunLum(): number {
  const c = sharedLighting.uLightColor.value;
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}
