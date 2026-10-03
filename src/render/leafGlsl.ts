import { DIST_CELL, DIST_N, DIST_REACH, DIST_SPAN } from '../surface/disturbance';
import { glslFloat as f } from './glslNumber';

/**
 * A leaf over the body clears this height above the ground: the worm's top (at most 0.247 while
 * crawling under the leaves: belly 0.01 plus 0.237 of body) plus 1 cm, and a little spare.
 */
export const DRAPE_HEIGHT = 0.265;
/**
 * Within this of the spine a leaf clears the full height (the map reads a body up to ~9 cm farther
 * than it is: midpoint stamps 11 cm apart, bilinear 12.5 cm cells)...
 */
export const DRAPE_FLAT = 0.14;
/** ...easing to nothing this far out, past the body's side (0.128), so it always clears it. */
export const DRAPE_FOOT = 0.34;
/** The trail: leaves the worm passed are pushed out until their near edge is this far from its path... */
export const FURROW_HALF = 0.14;
/** ...sliding at most this far. */
export const PUSH_SLIDE = 0.2;
/** The soil the furrow bares reads this much darker (damp, freshly turned) while the trail is fresh. */
export const TRAIL_DARKEN = 0.35;
/**
 * Steepest a draped leaf leans (tan, 45 degrees). A small leaf close beside the body would
 * otherwise stand nearly upright (its far edge on the litter, its near edge at the body's top);
 * past this it leans on the body instead, raised so its near reach still clears the same height.
 * That only raises it, so it still clears the body.
 */
export const DRAPE_MAX_SLOPE = 1;

/** Height (above the ground) a leaf must clear `s` m from the spine: TS twin of the GLSL. */
export function drapeProfile(s: number): number {
  return DRAPE_HEIGHT * Math.min(1, Math.max(0, (DRAPE_FOOT - s) / (DRAPE_FOOT - DRAPE_FLAT)));
}

/**
 * Every number the leaf shaders use. The GLSL prints each with glslFloat (exact to float32), so
 * the TS twin (disturbVertex) computes what the shader does.
 */
const C = {
  span: DIST_SPAN,
  step: DIST_CELL / DIST_SPAN,
  even: DIST_CELL / DIST_REACH,
  reach: DIST_REACH,
  furrow: FURROW_HALF,
  slide: PUSH_SLIDE,
  height: DRAPE_HEIGHT,
  flat: DRAPE_FLAT,
  foot: DRAPE_FOOT,
  ramp: DRAPE_FOOT - DRAPE_FLAT,
  /** A lifted leaf's dips (parts below its rest plane) are raised by the time it has lifted this much. */
  unsag: 0.02,
  maxSlope: DRAPE_MAX_SLOPE,
};

/**
 * Vertex GLSL: moves one leaf vertex at world position p by the disturbance map, as a rigid piece.
 * `anchor` is the leaf's (centre x, centre z, radius, rest height above the ground); every vertex
 * of a leaf passes the same one, so the whole leaf moves as one. `dip` is how far this vertex lies
 * below the leaf's rest plane (tilt, curl, uneven ground): a lifted leaf raises those parts to the
 * plane, so every vertex clears the body. Five texture fetches (at the anchor and one cell either
 * side along x and z) give how far the worm's path and body are and which way, and one more (the
 * trail texture, at the anchor) how fresh the path is.
 * - Trail: a leaf the worm passed slides out from its path until its near edge clears FURROW_HALF,
 *   easing back as the trail fades.
 * - Drape: a leaf reaching over the body tilts up onto it, its far edge on the litter and its
 *   plane clear of the body (drapeProfile); a leaf centred on the body rests level on top.
 * Skipped (a uniform branch) when leaves do not react (uLeafReact 0), and for leaves outside the
 * 8 m window. `n` (world normal) is tilted to match.
 * Needs uniforms uDisturb and uDisturbTrail (packed by packDisturbance), uDistOrigin and uLeafReact.
 */
export const DISTURB_GLSL = /* glsl */ `
  uniform sampler2D uDisturb;
  uniform sampler2D uDisturbTrail;
  uniform vec2 uDistOrigin;
  uniform float uLeafReact;
  // Path and body nearness at uv, each packed in two bytes (packDisturbance).
  vec2 nearness(vec2 uv) {
    vec4 t = texture2D(uDisturb, uv);
    return t.xz + t.yw * ${f(1 / 255)};
  }
  vec3 disturb(vec3 p, vec4 anchor, float dip, inout vec3 n) {
    if (uLeafReact < 0.5) return p;
    vec2 uv = (anchor.xy - uDistOrigin) / ${f(C.span)};
    vec2 e = abs(uv - 0.5) * 2.0;
    float edge = 1.0 - smoothstep(0.85, 0.97, max(e.x, e.y));
    if (edge <= 0.0) return p;
    // x: path, y: body nearness; w: the trail.
    vec2 c = nearness(uv);
    float w = texture2D(uDisturbTrail, uv).x;
    // Central differences: level on a ridge (the body's or the path's), true slope beside it.
    vec2 dx = (nearness(uv + vec2(${f(C.step)}, 0.0)) - nearness(uv - vec2(${f(C.step)}, 0.0))) * 0.5;
    vec2 dz = (nearness(uv + vec2(0.0, ${f(C.step)})) - nearness(uv - vec2(0.0, ${f(C.step)}))) * 0.5;
    float r = anchor.z;

    vec2 gp = vec2(dx.x, dz.x);
    float lp = length(gp);
    vec2 away = -gp / max(lp, 1e-6);
    float slide = clamp(${f(C.furrow)} + r - (1.0 - c.x) * ${f(C.reach)}, 0.0, ${f(C.slide)})
      * w * smoothstep(0.3, 0.8, lp / ${f(C.even)});
    vec2 move = away * slide;

    vec2 gb = vec2(dx.y, dz.y);
    float lb = length(gb);
    vec2 toBody = gb / max(lb, 1e-6);
    float db = (1.0 - c.y) * ${f(C.reach)} + max(0.0, -dot(move, toBody));
    // The leaf's nearest reach toward the spine (no nearer than the flat top), and the height
    // its plane must clear there, above where the leaf rests.
    float sc = max(${f(C.flat)}, db - r);
    float lift = max(0.0, ${f(C.height)} * clamp((${f(C.foot)} - sc) / ${f(C.ramp)}, 0.0, 1.0) - anchor.w);
    // Tilted about the far edge so the plane meets that height; level where the direction to the
    // body is unsure (on its ridge). No steeper than maxSlope: a steeper leaf leans on the body
    // with its far edge raised (base) instead of standing upright.
    float span = max(db - sc + r, 0.05);
    float slope = min(lift / span, ${f(C.maxSlope)});
    float base = lift - slope * span;
    float tilt = smoothstep(0.3, 0.8, lb / ${f(C.even)});
    vec2 grad = toBody * (slope * tilt * edge);
    float y = max((1.0 - tilt) * lift + tilt * (base + slope * (dot(p.xz - anchor.xy, toBody) + r)), 0.0)
      + dip * smoothstep(0.0, ${f(C.unsag)}, lift);
    p.xz += move * edge;
    p.y += y * edge;
    n = normalize(vec3(n.x - grad.x * n.y, n.y, n.z - grad.y * n.y));
    return p;
  }
`;

/**
 * Map lookup at texture coordinates (u, v) as the shader reads it: writes path, 0, body and trail
 * nearness (0..1), each filtered bilinearly as the GPU filters its texture (packedMapSampler).
 */
export type MapSampler = (u: number, v: number, out: number[]) => void;

/**
 * The MapSampler for the two textures packDisturbance writes (`near` RGBA, `trail` RG, DIST_N
 * square), clamped at the edges, decoded as DISTURB_GLSL decodes them. For the TS twin and tests.
 */
export function packedMapSampler(near: ArrayLike<number>, trail: ArrayLike<number>): MapSampler {
  return (u, v, out) => {
    const tx = u * DIST_N - 0.5;
    const tz = v * DIST_N - 0.5;
    const i = Math.floor(tx);
    const j = Math.floor(tz);
    const fx = tx - i;
    const fz = tz - j;
    const cell = (a: number, b: number) => Math.min(DIST_N - 1, Math.max(0, b)) * DIST_N + Math.min(DIST_N - 1, Math.max(0, a));
    const lerp2 = (at: (c: number) => number) =>
      (at(cell(i, j)) * (1 - fx) + at(cell(i + 1, j)) * fx) * (1 - fz)
      + (at(cell(i, j + 1)) * (1 - fx) + at(cell(i + 1, j + 1)) * fx) * fz;
    const lo = 1 / 255;
    out[0] = lerp2((c) => near[c * 4] / 255) + lerp2((c) => near[c * 4 + 1] / 255) * lo;
    out[1] = 0;
    out[2] = lerp2((c) => near[c * 4 + 2] / 255) + lerp2((c) => near[c * 4 + 3] / 255) * lo;
    out[3] = lerp2((c) => trail[c * 2] / 255);
  };
}

const smooth = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const s0 = [0, 0, 0, 0];
const s1 = [0, 0, 0, 0];
const s2 = [0, 0, 0, 0];
const s3 = [0, 0, 0, 0];
const s4 = [0, 0, 0, 0];

/**
 * TS twin of DISTURB_GLSL's disturb() (positions only), for tests: moves world point `p` of a leaf
 * with `anchor` (x, z, radius, rest) and `dip`, reading the map through `sample` with its corner at
 * (originX, originZ). Writes the moved point into `out`.
 */
export function disturbVertex(
  sample: MapSampler, originX: number, originZ: number, react: boolean,
  p: readonly number[], anchor: readonly number[], dip: number, out: number[],
): void {
  out[0] = p[0];
  out[1] = p[1];
  out[2] = p[2];
  if (!react) return;
  const u = (anchor[0] - originX) / C.span;
  const v = (anchor[1] - originZ) / C.span;
  const edge = 1 - smooth(0.85, 0.97, Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 2);
  if (edge <= 0) return;
  sample(u, v, s0);
  sample(u + C.step, v, s1);
  sample(u - C.step, v, s2);
  sample(u, v + C.step, s3);
  sample(u, v - C.step, s4);
  const r = anchor[2];
  const gpx = (s1[0] - s2[0]) * 0.5;
  const gpz = (s3[0] - s4[0]) * 0.5;
  const lp = Math.hypot(gpx, gpz);
  const slide = Math.min(C.slide, Math.max(0, C.furrow + r - (1 - s0[0]) * C.reach))
    * s0[3] * smooth(0.3, 0.8, lp / C.even);
  const mx = (-gpx / Math.max(lp, 1e-6)) * slide;
  const mz = (-gpz / Math.max(lp, 1e-6)) * slide;
  const gbx = (s1[2] - s2[2]) * 0.5;
  const gbz = (s3[2] - s4[2]) * 0.5;
  const lb = Math.hypot(gbx, gbz);
  const tx = gbx / Math.max(lb, 1e-6);
  const tz = gbz / Math.max(lb, 1e-6);
  const db = (1 - s0[2]) * C.reach + Math.max(0, -(mx * tx + mz * tz));
  const sc = Math.max(C.flat, db - r);
  const lift = Math.max(0, C.height * Math.min(1, Math.max(0, (C.foot - sc) / C.ramp)) - anchor[3]);
  const span = Math.max(db - sc + r, 0.05);
  const slope = Math.min(lift / span, C.maxSlope);
  const base = lift - slope * span;
  const tilt = smooth(0.3, 0.8, lb / C.even);
  const y = Math.max((1 - tilt) * lift + tilt * (base + slope * ((p[0] - anchor[0]) * tx + (p[2] - anchor[1]) * tz + r)), 0)
    + dip * smooth(0, C.unsag, lift);
  out[0] = p[0] + mx * edge;
  out[1] = p[1] + y * edge;
  out[2] = p[2] + mz * edge;
}

/**
 * Fragment GLSL for the ground: trailShade(xz) darkens the soil within FURROW_HALF of a fresh path
 * (seen where the leaves have parted), fading with the trail. One fetch, taken before any branch
 * (so its filtering never depends on neighbouring pixels' branches); none when leaves do not react.
 */
export const TRAIL_GROUND_GLSL = /* glsl */ `
  uniform sampler2D uDisturbTrail;
  uniform vec2 uDistOrigin;
  uniform float uLeafReact;
  float trailShade(vec2 xz) {
    if (uLeafReact < 0.5) return 1.0;
    vec2 uv = (xz - uDistOrigin) / ${f(C.span)};
    // x: the trail, y: the path (one byte is plenty for the band).
    vec4 d = texture2D(uDisturbTrail, uv);
    vec2 e = abs(uv - 0.5) * 2.0;
    float edge = 1.0 - smoothstep(0.85, 0.97, max(e.x, e.y));
    float s = (1.0 - d.y) * ${f(C.reach)};
    float band = 1.0 - smoothstep(${f(FURROW_HALF - 0.06)}, ${f(FURROW_HALF + 0.04)}, s);
    return 1.0 - ${f(TRAIL_DARKEN)} * band * d.x * max(edge, 0.0);
  }
`;

/**
 * Vertex GLSL for the hero leaves: one instanced leaf of every species, of which each instance
 * keeps only its own (aKind per vertex, aHeroKind per instance); the rest collapse to a single
 * point far below the ground, so their triangles draw nothing.
 * The instance matrix is a rotation, a uniform scale and a squash of the leaf's own height (a
 * leaf pressed flat, heroLeafMatrix): the normal takes the inverse transpose of that squash,
 * built from the matrix's columns so it stays finite when the leaf is fully flat.
 */
export const HERO_GLSL = /* glsl */ `
  attribute float aKind;
  attribute float aHeroKind;
  vec4 heroPosition(inout vec3 n) {
    mat4 m = modelMatrix * instanceMatrix;
    mat3 r = mat3(m);
    float k = length(r[0]);
    float squash = length(r[1]) / k;
    vec3 up = cross(r[2], r[0]) / k;
    n = r[0] * (n.x * squash) + up * n.y + r[2] * (n.z * squash);
    if (abs(aKind - aHeroKind) > 0.5) return vec4(0.0, -50.0, 0.0, 1.0);
    return m * vec4(position, 1.0);
  }
`;
