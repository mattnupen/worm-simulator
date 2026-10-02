import { glslFloat as f } from './glslNumber';
import { SPINE_POINTS } from './groundUniforms';

/**
 * Leaves between the camera and the worm fade (spec 5.2) with a dithered discard, so there is no
 * transparent pass and no sorting. The hole follows the whole visible body, not just the head:
 * a leaf pixel fades where the body's axis (the rendered spine, raised to the middle of the tube)
 * passes near it on screen and the leaf lies in front of the body there.
 *
 * Each frame occluderSegments (occluderSegments.ts) projects the axis once: per segment, both
 * ends in "tan space" (view x / depth, y / depth) with their inverse depth, clipped to what can
 * show. A pixel then needs only 2D work per segment: the miss (screen distance times the body's
 * depth there, the world gap between the body and the pixel's ray across the view) and the
 * depths compared.
 *
 * How much of a leaf drops: OCC_DROP for a leaf standing well clear of the body (a hero leaf or
 * a curled litter leaf between the camera and the worm), only OCC_DRAPE for a leaf lying on the
 * body (within OCC_TOUCH of its axis), so a worm under thin litter still reads as under it.
 */
/** The tube's axis sits this far above the spine (the belly line): a body radius, flattened. */
export const OCC_AXIS_UP = 0.1;
/** A miss within OCC_INNER of the axis fades fully; past OCC_OUTER not at all. */
export const OCC_INNER = 0.12;
export const OCC_OUTER = 0.24;
/** Share of a leaf's pixels dropped where it stands clear of the body (spec 5.2: 40% stays). */
export const OCC_DROP = 0.6;
/** Share dropped where the leaf lies on the body (its pixel within OCC_TOUCH of the axis). */
export const OCC_DRAPE = 0.4;
export const OCC_TOUCH = 0.18;
/** From OCC_TOUCH to OCC_CLEAR from the axis the drop rises from OCC_DRAPE to OCC_DROP. */
export const OCC_CLEAR = 0.4;
/**
 * Only body at this view depth or more counts (nearer is below the frame or at the lens), fading
 * in over OCC_NEAR_FADE. Segments are clipped there, so every projected point is in front.
 */
export const OCC_NEAR = 0.4;
export const OCC_NEAR_FADE = 0.2;
/**
 * The axis is simplified to within this (m) before projecting: a gently curving worm needs only
 * a few segments, so each pixel near it runs fewer loop steps. Far below OCC_INNER.
 */
export const OCC_SIMPLIFY = 0.02;

/**
 * The most segments occluderSegments writes: 8 floats each, (tan x, tan y, 1 / depth, k) for both
 * ends, k being 1 / (squared screen length) at the first end and 0 at the second.
 */
export const OCC_SEGMENTS = SPINE_POINTS - 1;

const smoothstep = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * TS twin of occlusion() below: the share of a leaf's pixels dropped at the pixel whose ray has
 * tan-space direction (tx, ty) (NDC x / p00, y / p11), for a leaf at view depth dl there. seg and
 * count are occluderSegments' output.
 */
export function occlusion(tx: number, ty: number, dl: number, seg: ArrayLike<number>, count: number): number {
  let best = 1e9;
  let bi = 0;
  let bu = 0;
  for (let i = 0; i < count; i++) {
    const o = i * 8;
    const abx = seg[o + 4] - seg[o];
    const aby = seg[o + 5] - seg[o + 1];
    const u = Math.min(1, Math.max(0, ((tx - seg[o]) * abx + (ty - seg[o + 1]) * aby) * seg[o + 3]));
    const qx = tx - seg[o] - abx * u;
    const qy = ty - seg[o + 1] - aby * u;
    const inv = seg[o + 2] + (seg[o + 6] - seg[o + 2]) * u;
    // Squared miss (screen distance / inverse depth), compared without dividing.
    const q2 = qx * qx + qy * qy;
    if (q2 < best * inv * inv) {
      best = q2 / (inv * inv);
      bi = i;
      bu = u;
    }
  }
  if (best >= OCC_OUTER * OCC_OUTER) return 0;
  const o = bi * 8;
  const ds = 1 / (seg[o + 2] + (seg[o + 6] - seg[o + 2]) * bu);
  // How near the leaf lies to the body: to the line of that segment (stretched to its neighbours'
  // reach, where a slanting ray meets the axis a segment or two from the leaf), in view space.
  const ad = 1 / seg[o + 2];
  const bd = 1 / seg[o + 6];
  const ax = seg[o] * ad;
  const ay = seg[o + 1] * ad;
  const ex = seg[o + 4] * bd - ax;
  const ey = seg[o + 5] * bd - ay;
  const ed = bd - ad;
  const lx = tx * dl - ax;
  const ly = ty * dl - ay;
  const lz = dl - ad;
  const v = Math.min(3, Math.max(-2, (lx * ex + ly * ey + lz * ed) / Math.max(ex * ex + ey * ey + ed * ed, 1e-8)));
  const touch = Math.hypot(lx - ex * v, ly - ey * v, lz - ed * v);
  return (1 - smoothstep(OCC_INNER, OCC_OUTER, Math.sqrt(best)))
    * smoothstep(0.02, 0.1, ds - dl)
    * smoothstep(OCC_NEAR, OCC_NEAR + OCC_NEAR_FADE, ds)
    * (OCC_DRAPE + (OCC_DROP - OCC_DRAPE) * smoothstep(OCC_TOUCH, OCC_CLEAR, touch));
}

/**
 * The dither threshold at a pixel (interleaved gradient noise, Jimenez 2014): fixed in screen
 * space, so the pattern never changes over time and nothing shimmers. TS twin of ign() below.
 */
export function ign(x: number, y: number): number {
  const fr = (v: number): number => v - Math.floor(v);
  return fr(52.9829189 * fr(x * 0.06711056 + y * 0.00583715));
}

/** GLSL occlusion(t, dl), stage-agnostic: needs uOccSeg and uOccCount declared. */
export const OCCLUSION_FN_GLSL = /* glsl */ `
  float occlusion(vec2 t, float dl) {
    float best = 1e9;
    int bi = 0;
    float bu = 0.0;
    for (int i = 0; i < ${OCC_SEGMENTS}; i++) {
      if (i >= uOccCount) break;
      vec4 a = uOccSeg[2 * i];
      vec4 b = uOccSeg[2 * i + 1];
      vec2 ab = b.xy - a.xy;
      float u = clamp(dot(t - a.xy, ab) * a.w, 0.0, 1.0);
      vec2 q = t - a.xy - ab * u;
      float inv = mix(a.z, b.z, u);
      float q2 = dot(q, q);
      if (q2 < best * inv * inv) { best = q2 / (inv * inv); bi = i; bu = u; }
    }
    if (best >= ${f(OCC_OUTER * OCC_OUTER)}) return 0.0;
    vec4 a = uOccSeg[2 * bi];
    vec4 b = uOccSeg[2 * bi + 1];
    float ds = 1.0 / mix(a.z, b.z, bu);
    vec3 A = vec3(a.xy, 1.0) / a.z;
    vec3 e = vec3(b.xy, 1.0) / b.z - A;
    vec3 l = vec3(t, 1.0) * dl - A;
    float v = clamp(dot(l, e) / max(dot(e, e), 1e-8), -2.0, 3.0);
    float touch = length(l - e * v);
    return (1.0 - smoothstep(${f(OCC_INNER)}, ${f(OCC_OUTER)}, sqrt(best)))
      * smoothstep(0.02, 0.1, ds - dl)
      * smoothstep(${f(OCC_NEAR)}, ${f(OCC_NEAR + OCC_NEAR_FADE)}, ds)
      * mix(${f(OCC_DRAPE)}, ${f(OCC_DROP)}, smoothstep(${f(OCC_TOUCH)}, ${f(OCC_CLEAR)}, touch));
  }
`;

/** GLSL ign(): the screen-space dither threshold at this pixel. */
export const IGN_GLSL = /* glsl */ `
  float ign(vec2 px) {
    return fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715))));
  }
`;

/**
 * Fragment GLSL: fadedOut() is true for the dropped pixels of this leaf fragment. Pixels outside
 * uOccBox (NDC) return at once, so only those near the worm on screen run the segment loop. The
 * pixel's ray comes from gl_FragCoord and uOccTan (1 / p00, 1 / p11), the leaf's view depth from
 * gl_FragCoord.w (1 / clip w). Needs uniform uResolution (drawing-buffer size).
 */
export const OCCLUDE_GLSL = /* glsl */ `
  uniform vec4 uOccSeg[${OCC_SEGMENTS * 2}];
  uniform int uOccCount;
  uniform vec4 uOccBox;
  uniform vec2 uOccTan;
  ${OCCLUSION_FN_GLSL}
  ${IGN_GLSL}
  bool fadedOut() {
    vec2 ndc = gl_FragCoord.xy / uResolution * 2.0 - 1.0;
    if (any(lessThan(ndc, uOccBox.xy)) || any(greaterThan(ndc, uOccBox.zw))) return false;
    return ign(gl_FragCoord.xy) < occlusion(ndc * uOccTan, 1.0 / gl_FragCoord.w);
  }
`;
