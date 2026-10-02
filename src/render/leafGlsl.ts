import { DIST_SPAN } from '../surface/disturbance';

/** A leaf under the body lifts this high at full lift: one body width, so it drapes over it. */
export const DRAPE_HEIGHT = 0.22;
/** How far a fully pushed leaf slides outward. */
export const PUSH_SLIDE = 0.07;
/** How much a pushed leaf's near side rises, tilting it outward. */
export const PUSH_TILT = 0.05;
/** How deep the settling furrow sinks a freshly disturbed leaf. */
export const FURROW_DEPTH = 0.004;

const f = (v: number): string => v.toFixed(4);

/**
 * Vertex GLSL: moves a leaf vertex at world position p by the disturbance map near the worm.
 * Under the body leaves lift into a drape; beside it they tilt and slide outward; behind it the
 * decaying trail leaves a shallow furrow. Leaves outside the 8 m window skip the texture fetch.
 * Needs uniforms uDisturb (packed by packDisturbance) and uDistOrigin.
 */
export const DISTURB_GLSL = /* glsl */ `
  uniform sampler2D uDisturb;
  uniform vec2 uDistOrigin;
  vec3 disturb(vec3 p) {
    vec2 uv = (p.xz - uDistOrigin) / ${DIST_SPAN.toFixed(1)};
    vec2 e = abs(uv - 0.5) * 2.0;
    float edge = 1.0 - smoothstep(0.75, 0.95, max(e.x, e.y));
    if (edge <= 0.0) return p;
    vec4 d = texture2D(uDisturb, uv);
    vec2 push = (d.xy * 255.0 - 128.0) / 127.0;
    p.xz += push * (${f(PUSH_SLIDE)} * edge);
    p.y += (d.z * ${f(DRAPE_HEIGHT)} + length(push) * ${f(PUSH_TILT)} - d.w * ${f(FURROW_DEPTH)}) * edge;
    return p;
  }
`;
