import { DIST_CELL, DIST_REACH, DIST_SPAN } from '../surface/disturbance';

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

/** Height (above the ground) a leaf must clear `s` m from the spine: TS twin of the GLSL. */
export function drapeProfile(s: number): number {
  return DRAPE_HEIGHT * Math.min(1, Math.max(0, (DRAPE_FOOT - s) / (DRAPE_FOOT - DRAPE_FLAT)));
}

const f = (v: number): string => v.toFixed(4);

/**
 * Vertex GLSL: moves one leaf vertex at world position p by the disturbance map, as a rigid piece.
 * `anchor` is the leaf's (centre x, centre z, radius, rest height above the ground); every vertex
 * of a leaf passes the same one, so the whole leaf moves as one. Three texture fetches (at the
 * anchor and one cell along x and z) give how far the worm's path and body are and which way.
 * - Trail: a leaf the worm passed slides out from its path until its near edge clears FURROW_HALF,
 *   easing back as the trail fades.
 * - Drape: a leaf reaching over the body tilts up onto it, its far edge on the litter and its
 *   plane clear of the body (drapeProfile); a leaf centred on the body rests level on top.
 * Leaves outside the 8 m window skip the fetches. `n` (world normal) is tilted to match.
 * Needs uniforms uDisturb (packed by packDisturbance) and uDistOrigin.
 */
export const DISTURB_GLSL = /* glsl */ `
  uniform sampler2D uDisturb;
  uniform vec2 uDistOrigin;
  vec3 disturb(vec3 p, vec4 anchor, inout vec3 n) {
    vec2 uv = (anchor.xy - uDistOrigin) / ${DIST_SPAN.toFixed(1)};
    vec2 e = abs(uv - 0.5) * 2.0;
    float edge = 1.0 - smoothstep(0.85, 0.97, max(e.x, e.y));
    if (edge <= 0.0) return p;
    vec4 c = texture2D(uDisturb, uv);
    vec4 cx = texture2D(uDisturb, uv + vec2(${f(DIST_CELL / DIST_SPAN)}, 0.0));
    vec4 cz = texture2D(uDisturb, uv + vec2(0.0, ${f(DIST_CELL / DIST_SPAN)}));
    float r = anchor.z;
    // Nearness changes by this much per cell where it slopes evenly (off a path's or body's ridge).
    const float EVEN = ${f(DIST_CELL / DIST_REACH)};

    vec2 gp = vec2(cx.x - c.x, cz.x - c.x);
    float lp = length(gp);
    vec2 away = -gp / max(lp, 1e-6);
    float slide = clamp(${f(FURROW_HALF)} + r - (1.0 - c.x) * ${f(DIST_REACH)}, 0.0, ${f(PUSH_SLIDE)})
      * c.w * smoothstep(0.3, 0.8, lp / EVEN);
    vec2 move = away * slide;

    vec2 gb = vec2(cx.z - c.z, cz.z - c.z);
    float lb = length(gb);
    vec2 toBody = gb / max(lb, 1e-6);
    float db = (1.0 - c.z) * ${f(DIST_REACH)} + max(0.0, -dot(move, toBody));
    // The leaf's nearest reach toward the spine (no nearer than the flat top), and the height
    // its plane must clear there, above where the leaf rests.
    float sc = max(${f(DRAPE_FLAT)}, db - r);
    float lift = max(0.0, ${f(DRAPE_HEIGHT)}
      * clamp((${f(DRAPE_FOOT)} - sc) / ${f(DRAPE_FOOT - DRAPE_FLAT)}, 0.0, 1.0) - anchor.w);
    // Tilted about the far edge so the plane meets that height; level where the direction to the
    // body is unsure (on its ridge).
    float slope = lift / max(db - sc + r, 0.05);
    float tilt = smoothstep(0.3, 0.8, lb / EVEN);
    vec2 grad = toBody * (slope * tilt * edge);
    float y = (1.0 - tilt) * lift + slope * tilt * (dot(p.xz - anchor.xy, toBody) + r);
    p.xz += move * edge;
    p.y += max(y, 0.0) * edge;
    n = normalize(vec3(n.x - grad.x * n.y, n.y, n.z - grad.y * n.y));
    return p;
  }
`;

/**
 * Fragment GLSL for the ground: trailShade(xz) darkens the soil within FURROW_HALF of a fresh path
 * (seen where the leaves have parted), fading with the trail. One fetch, none outside the window.
 */
export const TRAIL_GROUND_GLSL = /* glsl */ `
  uniform sampler2D uDisturb;
  uniform vec2 uDistOrigin;
  float trailShade(vec2 xz) {
    vec2 uv = (xz - uDistOrigin) / ${DIST_SPAN.toFixed(1)};
    vec2 e = abs(uv - 0.5) * 2.0;
    float edge = 1.0 - smoothstep(0.85, 0.97, max(e.x, e.y));
    if (edge <= 0.0) return 1.0;
    vec4 d = texture2D(uDisturb, uv);
    float s = (1.0 - d.x) * ${f(DIST_REACH)};
    float band = 1.0 - smoothstep(${f(FURROW_HALF - 0.06)}, ${f(FURROW_HALF + 0.04)}, s);
    return 1.0 - ${f(TRAIL_DARKEN)} * band * d.w * edge;
  }
`;
