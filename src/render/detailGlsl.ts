import { wrapAround, WRAP_GLSL } from './wrap';
import { LITTER_GLSL, sampleLitter } from './litterTexture';
import { bakedGroundHeight, GROUND_GLSL } from './groundTexture';
import { glslFloat as f } from './glslNumber';

/** Side of the world tile the detail leaves repeat in (m); they fade out from 5 to 6 m. */
export const DETAIL_BOX = 13;
/** Detail leaves shrink to nothing between these distances from the worm's head (m). */
export const DETAIL_FADE_IN = 5;
export const DETAIL_FADE_OUT = 6;
/** A detail leaf rests this far above the rendered ground... */
const REST_BASE = 0.008;
/** ...plus its place (aLeaf2.y, 0..1) in this share of the loose layer above the mound... */
const REST_SHARE = 0.6;
/** ...counted as at least one leaf thick. */
const LOOSE_MIN = 0.02;

/**
 * Vertex GLSL for the detail layer. aDetail = (home x, z as 0..1 of the DETAIL_BOX tile, yaw,
 * radius m); the shape's positions are scaled so its farthest vertex is 1 out, so the leaf's
 * radius is aDetail.w. Draws the copy of the home nearest the worm (uWrapCentre, the head snapped
 * to a 1 m grid), shrunk to nothing from 5 to 6 m from the head (uFocus), turned by its yaw and
 * laid on the rendered ground (meshGround, the surface the worm rests on) at one rest height for
 * the whole leaf, in the loose litter above the mound. Every vertex follows the ground under it
 * and lies at or above the leaf's rest plane over it (the curl only lifts), so a leaf's dip is 0.
 * Writes the baked trunk shade to `shade` and the disturbance anchor (home x, z, radius, rest) to
 * `anchor`. A leaf shrunk to nothing returns at once with radius 0, all its vertices on one point:
 * the caller skips disturb() for it. Needs aLeaf2 and uniforms uFocus, uWrapCentre, uLitter and uGround.
 */
export const DETAIL_GLSL = /* glsl */ `
  uniform vec3 uFocus;
  uniform vec2 uWrapCentre;
  uniform sampler2D uLitter;
  attribute vec4 aDetail;
  ${WRAP_GLSL}
  ${LITTER_GLSL}
  ${GROUND_GLSL}
  vec4 detailPosition(inout vec3 n, out float shade, out vec4 anchor) {
    vec2 home = wrapAround(aDetail.xy, uWrapCentre, ${f(DETAIL_BOX)});
    float fade = 1.0 - smoothstep(${f(DETAIL_FADE_IN)}, ${f(DETAIL_FADE_OUT)}, distance(home, uFocus.xz));
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
    float rest = ${f(REST_BASE)} + aLeaf2.y * max(${f(LOOSE_MIN)}, lit.y - lit.x) * ${f(REST_SHARE)};
    anchor = vec4(home, r, rest);
    vec2 xz = home + p.xz;
    return vec4(xz.x, meshGround(xz) + rest + p.y, xz.y, 1.0);
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
}

/**
 * TS twin of DETAIL_GLSL's detailPosition() (positions only), for tests: places leaf-local vertex
 * `position` of a leaf with `detail` (aDetail) and `layer` (aLeaf2.y). Writes the world point into
 * `out` and the disturbance anchor into `anchor`; returns the trunk shade. When the anchor's radius
 * is 0 the shader skips disturb(), so callers replaying it must too.
 */
export function detailVertex(
  inp: DetailInputs, detail: ArrayLike<number>, position: ArrayLike<number>, layer: number,
  out: number[], anchor: number[],
): number {
  const hx = wrapAround(detail[0], inp.wrapX, DETAIL_BOX);
  const hz = wrapAround(detail[1], inp.wrapZ, DETAIL_BOX);
  const fade = 1 - smooth(DETAIL_FADE_IN, DETAIL_FADE_OUT, Math.hypot(hx - inp.focusX, hz - inp.focusZ));
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
  const rest = REST_BASE + layer * Math.max(LOOSE_MIN, lit[1] - lit[0]) * REST_SHARE;
  anchor[0] = hx;
  anchor[1] = hz;
  anchor[2] = r;
  anchor[3] = rest;
  out[0] = hx + c * px + s * pz;
  out[2] = hz - s * px + c * pz;
  out[1] = bakedGroundHeight(inp.ground, out[0], out[2]) + rest + position[1] * r;
  return lit[2];
}
