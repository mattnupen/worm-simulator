import { wrapAround, WRAP_GLSL } from './wrap';
import { LITTER_GLSL, sampleLitter } from './litterTexture';
import { bakedGroundHeight, GROUND_GLSL } from './groundTexture';
import { glslFloat as f } from './glslNumber';
import { SPINE_POINTS } from './groundUniforms';

/** Side of the world tile the near-worm clutter repeats in (m); it fades out from 3.5 to 4.5 m. */
export const NEAR_CLUTTER_BOX = 10;
export const NEAR_CLUTTER_FADE_IN = 3.5;
export const NEAR_CLUTTER_FADE_OUT = 4.5;
/**
 * No part of a clutter item comes nearer than this to the worm's spine (m): past the body's side
 * (0.128) with room to spare.
 */
export const NEAR_CLUTTER_CLEAR = 0.2;
/** The farthest any vertex of an item lies from its home on the ground (m); the build checks it. */
export const NEAR_CLUTTER_REACH = 0.8;

/**
 * Vertex GLSL for Ultra's near-worm clutter. aWrap is an item's home as 0..1 of the
 * NEAR_CLUTTER_BOX tile; the shape's positions are local to the home. Draws the copy of the home
 * nearest the worm (uWrapCentre, the head snapped to a 1 m grid), shrunk to nothing from 3.5 to
 * 4.5 m from the head (uFocus), and laid on the rendered ground (meshGround, the surface the worm
 * rests on), each vertex on the ground under it.
 *
 * Worm clearance: an item shrinks as its home nears the worm's spine (uSpine, the rendered spine,
 * 16 points head first): scale = (distance - CLEAR) / REACH, so even its farthest vertex stays
 * CLEAR from the spine and nothing pokes into the body. The disturbance map cannot tell this: a
 * worm riding on top of the litter stamps only 0.2 m around itself. A home 4.5 m or more from the
 * head returns early, before the spine loop. That skips only about a third of the items: about 64%
 * of the homes in the 10 m tile (pi * 4.5^2 / 10^2) lie within 4.5 m of the head, so most of the
 * mesh's vertices do run the 15-segment loop.
 *
 * Writes the baked trunk shade at the home to `shade`. Needs aWrap and uniforms uFocus, uWrapCentre,
 * uLitter, uGround and uSpine.
 */
export const NEAR_CLUTTER_GLSL = /* glsl */ `
  uniform vec3 uFocus;
  uniform vec2 uWrapCentre;
  uniform sampler2D uLitter;
  uniform vec3 uSpine[${SPINE_POINTS}];
  attribute vec2 aWrap;
  ${WRAP_GLSL}
  ${LITTER_GLSL}
  ${GROUND_GLSL}
  float spineDistance(vec2 p) {
    float d2 = 1e9;
    for (int i = 0; i < ${SPINE_POINTS - 1}; i++) {
      vec2 a = uSpine[i].xz;
      vec2 ab = uSpine[i + 1].xz - a;
      float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
      vec2 q = p - a - ab * t;
      d2 = min(d2, dot(q, q));
    }
    return sqrt(d2);
  }
  vec4 nearClutterPosition(vec3 position, out float shade) {
    vec2 home = wrapAround(aWrap, uWrapCentre, ${f(NEAR_CLUTTER_BOX)});
    float s = 1.0 - smoothstep(${f(NEAR_CLUTTER_FADE_IN)}, ${f(NEAR_CLUTTER_FADE_OUT)}, distance(home, uFocus.xz));
    if (s <= 0.0) {
      // Faded out: every vertex of the item lands on one point, so it draws nothing.
      shade = 1.0;
      return vec4(home.x, 0.0, home.y, 1.0);
    }
    s *= clamp((spineDistance(home) - ${f(NEAR_CLUTTER_CLEAR)}) / ${f(NEAR_CLUTTER_REACH)}, 0.0, 1.0);
    vec3 p = position * s;
    vec2 xz = home + p.xz;
    shade = litterAt(home).z;
    return vec4(xz.x, meshGround(xz) + p.y, xz.y, 1.0);
  }
`;

const smooth = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Distance from (x, z) to the polyline through `spine` (SPINE_POINTS x, y, z triples): TS twin of spineDistance. */
export function spineDistance(spine: ArrayLike<number>, x: number, z: number): number {
  let d2 = 1e9;
  for (let i = 0; i < SPINE_POINTS - 1; i++) {
    const ax = spine[i * 3];
    const az = spine[i * 3 + 2];
    const abx = spine[i * 3 + 3] - ax;
    const abz = spine[i * 3 + 5] - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * abx + (z - az) * abz) / Math.max(abx * abx + abz * abz, 1e-8)));
    const qx = x - ax - abx * t;
    const qz = z - az - abz * t;
    d2 = Math.min(d2, qx * qx + qz * qz);
  }
  return Math.sqrt(d2);
}

/** The scale an item at home (x, z) gets from the worm's spine alone: 0 on it, 1 from CLEAR + REACH out. */
export function clearScale(spine: ArrayLike<number>, x: number, z: number): number {
  return Math.min(1, Math.max(0, (spineDistance(spine, x, z) - NEAR_CLUTTER_CLEAR) / NEAR_CLUTTER_REACH));
}

/** The shared uniforms nearClutterPosition reads, and the baked textures' data, for nearClutterVertex. */
export interface NearClutterInputs {
  /** The head as rendered (uFocus x, z) and its 1 m snap (uWrapCentre). */
  focusX: number; focusZ: number; wrapX: number; wrapZ: number;
  /** uSpine: SPINE_POINTS x, y, z triples. */
  spine: ArrayLike<number>;
  /** litterTextureData() and groundTextureData(). */
  litter: Uint8Array; ground: Float32Array;
}

const lit = [0, 0, 0];

/**
 * TS twin of nearClutterPosition(), for tests: places local vertex `position` of an item with home
 * `wrap` (aWrap) and writes the world point into `out`. Returns the trunk shade.
 */
export function nearClutterVertex(
  inp: NearClutterInputs, wrap: ArrayLike<number>, position: ArrayLike<number>, out: number[],
): number {
  const hx = wrapAround(wrap[0], inp.wrapX, NEAR_CLUTTER_BOX);
  const hz = wrapAround(wrap[1], inp.wrapZ, NEAR_CLUTTER_BOX);
  let s = 1 - smooth(NEAR_CLUTTER_FADE_IN, NEAR_CLUTTER_FADE_OUT, Math.hypot(hx - inp.focusX, hz - inp.focusZ));
  if (s <= 0) {
    out[0] = hx;
    out[1] = 0;
    out[2] = hz;
    return 1;
  }
  s *= clearScale(inp.spine, hx, hz);
  const px = position[0] * s;
  const pz = position[2] * s;
  out[0] = hx + px;
  out[2] = hz + pz;
  out[1] = bakedGroundHeight(inp.ground, out[0], out[2]) + position[1] * s;
  sampleLitter(inp.litter, hx, hz, lit);
  return lit[2];
}
