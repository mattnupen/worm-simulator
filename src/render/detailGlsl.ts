import { wrapAround, WRAP_GLSL } from './wrap';
import { LITTER_GLSL, sampleLitter } from './litterTexture';
import { bakedGroundHeight, GROUND_GLSL } from './groundTexture';
import { glslFloat as f } from './glslNumber';
import { terrainHeight, TERRAIN_GLSL } from '../surface/terrain';
import { spineDistance, SPINE_DISTANCE_GLSL } from './nearClutterGlsl';
import { TOP_LAYER } from '../surface/litterDepth';

/** Side of the world tile the detail leaves repeat in (m); they fade out from 5 to 6 m. */
export const DETAIL_BOX = 13;
/** Detail leaves shrink to nothing between these distances from the worm's head (m). */
export const DETAIL_FADE_IN = 5;
export const DETAIL_FADE_OUT = 6;
/** A detail leaf rests this far above its surface (the drawn top, or the floor in the pocket)... */
export const REST_BASE = 0.008;
/** ...on the top, plus its place (aLeaf2.y, 0..1) in this share of the loose top leaves (TOP_LAYER)... */
const REST_SHARE = 0.6;
/**
 * ...in the pocket, plus its place squared (most lie low, round the worm) in the litter over the
 * floor, up to this far below the top of the thinnest litter it reaches (litterAt's y)...
 */
export const POCKET_TOP_GAP = 0.15;
/**
 * ...less what its curl lifts it (a detail leaf's curled edge rises up to 0.51 of its radius over
 * its rest plane), so it never shows through the top.
 */
export const POCKET_CURL = 0.55;
/**
 * A pocket leaf shrinks to nothing as its home goes from POCKET_NEAR to POCKET_FAR from the
 * spine: only the leaves round the body are drawn, so the few the hole shows cost little (the rest
 * would be shaded under the top of the litter for nothing). Its nearest edge is then still over
 * 0.8 from the spine, outside what the hole shows at the body's level.
 */
export const POCKET_NEAR = 1.6;
export const POCKET_FAR = 2.0;

/**
 * Vertex GLSL for the detail leaves. aDetail = (home x, z as 0..1 of the DETAIL_BOX tile, yaw,
 * radius m); the shape's positions are scaled so its farthest vertex is 1 out, so the leaf's
 * radius is aDetail.w. Draws the copy of the home nearest the worm (uWrapCentre, the head snapped
 * to a 1 m grid), shrunk to nothing from 5 to 6 m from the head (uFocus), turned by its yaw and
 * laid at one rest height for the whole leaf on its surface:
 * - the top leaves: on the drawn top of the litter (meshGround), in the loose top layer;
 * - with POCKET defined, the leaves in the buried worm's pocket (V2 spec 8.2), seen only through
 *   the hole over it: on the floor (terrainHeight, floorHeight's twin, where the worm rests),
 *   REST_BASE plus the layer squared times the thinnest litter it reaches less POCKET_TOP_GAP and
 *   its curl's lift (POCKET_CURL times its radius); and only round the body (POCKET_NEAR to
 *   POCKET_FAR from the spine, uSpine).
 * Every vertex follows the surface under it and lies at or above the leaf's rest plane over it
 * (the curl only lifts), so a leaf's dip is 0. Writes the baked trunk shade to `shade` and the
 * disturbance anchor (home x, z, radius, rest) to `anchor`. A leaf shrunk to nothing returns at
 * once with radius 0, all its vertices on one point: the caller skips disturb() for it. Needs
 * aLeaf2 and uniforms uFocus, uWrapCentre, uLitter and (the top leaves) uGround.
 */
export const DETAIL_GLSL = /* glsl */ `
  uniform vec3 uFocus;
  uniform vec2 uWrapCentre;
  uniform sampler2D uLitter;
  attribute vec4 aDetail;
  ${WRAP_GLSL}
  ${LITTER_GLSL}
  #ifdef POCKET
  ${TERRAIN_GLSL}
  ${SPINE_DISTANCE_GLSL}
  #else
  ${GROUND_GLSL}
  #endif
  vec4 detailPosition(inout vec3 n, out float shade, out vec4 anchor) {
    vec2 home = wrapAround(aDetail.xy, uWrapCentre, ${f(DETAIL_BOX)});
    float fade = 1.0 - smoothstep(${f(DETAIL_FADE_IN)}, ${f(DETAIL_FADE_OUT)}, distance(home, uFocus.xz));
    #ifdef POCKET
      if (fade > 0.0) fade *= 1.0 - smoothstep(${f(POCKET_NEAR)}, ${f(POCKET_FAR)}, spineDistance(home));
    #endif
    float r = aDetail.w * fade;
    if (r <= 0.0) {
      // Shrunk to nothing (about a third of the tile): every vertex of the leaf lands on one
      // point, so it draws nothing. Skip the texture reads (and, in the caller, the drape).
      shade = 1.0;
      anchor = vec4(home, 0.0, 0.0);
      return vec4(home.x, 0.0, home.y, 1.0);
    }
    float c = cos(aDetail.z);
    float s = sin(aDetail.z);
    vec3 p = position * r;
    p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
    n = vec3(c * n.x + s * n.z, n.y, -s * n.x + c * n.z);
    vec3 lit = litterAt(home);
    shade = lit.z;
    vec2 xz = home + p.xz;
    #ifdef POCKET
      float rest = ${f(REST_BASE)} + aLeaf2.y * aLeaf2.y * max(0.0, lit.y - ${f(POCKET_TOP_GAP)} - r * ${f(POCKET_CURL)});
      float ground = terrainHeight(xz);
    #else
      float rest = ${f(REST_BASE)} + aLeaf2.y * ${f(TOP_LAYER * REST_SHARE)};
      float ground = meshGround(xz);
    #endif
    anchor = vec4(home, r, rest);
    return vec4(xz.x, ground + rest + p.y, xz.y, 1.0);
  }
`;

const smooth = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lit = [0, 0, 0];

/** The shared uniforms detailPosition reads, and the baked textures' data, for detailVertex. */
export interface DetailInputs {
  /** The head as rendered (uFocus x, z) and its 1 m snap (uWrapCentre). */
  focusX: number; focusZ: number; wrapX: number; wrapZ: number;
  /** litterTextureData() and groundTextureData(). */
  litter: Uint8Array; ground: Float32Array;
  /** The pocket's leaves: uSpine, SPINE_POINTS x, y, z triples (the rendered spine). */
  spine?: ArrayLike<number>;
}

/**
 * TS twin of DETAIL_GLSL's detailPosition() (positions only), for tests: places leaf-local vertex
 * `position` of a leaf with `detail` (aDetail) and `layer` (aLeaf2.y), on the top of the litter
 * or (`pocket`) in the worm's pocket. Writes the world point into `out` and the disturbance anchor
 * into `anchor`; returns the trunk shade. When the anchor's radius is 0 the shader skips
 * disturb(), so callers replaying it must too.
 */
export function detailVertex(
  inp: DetailInputs, detail: ArrayLike<number>, position: ArrayLike<number>, layer: number,
  out: number[], anchor: number[], pocket = false,
): number {
  const hx = wrapAround(detail[0], inp.wrapX, DETAIL_BOX);
  const hz = wrapAround(detail[1], inp.wrapZ, DETAIL_BOX);
  let fade = 1 - smooth(DETAIL_FADE_IN, DETAIL_FADE_OUT, Math.hypot(hx - inp.focusX, hz - inp.focusZ));
  if (pocket && fade > 0) fade *= 1 - smooth(POCKET_NEAR, POCKET_FAR, spineDistance(inp.spine ?? [], hx, hz));
  const r = detail[3] * fade;
  if (r <= 0) {
    anchor[0] = hx;
    anchor[1] = hz;
    anchor[2] = 0;
    anchor[3] = 0;
    out[0] = hx;
    out[1] = 0;
    out[2] = hz;
    return 1;
  }
  const c = Math.cos(detail[2]);
  const s = Math.sin(detail[2]);
  const px = position[0] * r;
  const pz = position[2] * r;
  sampleLitter(inp.litter, hx, hz, lit);
  const rest = pocket
    ? REST_BASE + layer * layer * Math.max(0, lit[1] - POCKET_TOP_GAP - r * POCKET_CURL)
    : REST_BASE + layer * TOP_LAYER * REST_SHARE;
  anchor[0] = hx;
  anchor[1] = hz;
  anchor[2] = r;
  anchor[3] = rest;
  out[0] = hx + c * px + s * pz;
  out[2] = hz - s * px + c * pz;
  const ground = pocket ? terrainHeight(out[0], out[2]) : bakedGroundHeight(inp.ground, out[0], out[2]);
  out[1] = ground + rest + position[1] * r;
  return lit[2];
}
