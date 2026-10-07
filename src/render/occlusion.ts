import { glslFloat as f } from './glslNumber';
import { OCC_TILES, SPINE_POINTS } from './groundUniforms';

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
 *
 * The funnel (V2 spec 8.2: the worm travels buried in the litter, the leaves above it fade): the
 * higher above the body's axis a pixel lies (world up, uOccUp), the wider its hole (OCC_FUNNEL per
 * metre, up to OCC_FUNNEL_HEIGHT), and from OCC_DEEP_FROM to OCC_DEEP_TO above the axis it drops
 * completely. So the top of the litter (the drawn ground and the top leaves, 2 to 5 cm above the
 * worm) opens wide and clean over it, while the leaves round it in its pocket keep the V1 shares:
 * a look down into the litter, not an x-ray outline.
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
/** The hole widens by this (m) per metre a pixel lies above the body's axis... */
export const OCC_FUNNEL = 0.25;
/** ...up to this high (the deepest litter's top). */
export const OCC_FUNNEL_HEIGHT = 1.2;
/** The widest the hole gets (round the axis): occluderSegments' screen box covers this. */
export const OCC_REACH = OCC_OUTER + OCC_FUNNEL * OCC_FUNNEL_HEIGHT;
/** From this high above the axis (past the body's top) a pixel drops more, fully by OCC_DEEP_TO. */
export const OCC_DEEP_FROM = 0.15;
export const OCC_DEEP_TO = 0.3;
/**
 * Only body at this view depth or more counts (nearer is below the frame or at the lens), fading
 * in over OCC_NEAR_FADE. Segments are clipped there, so every projected point is in front.
 */
export const OCC_NEAR = 0.4;
export const OCC_NEAR_FADE = 0.2;
/** A leaf counts as in front of the body from OCC_FRONT nearer than it, fully from OCC_FRONT_FULL. */
export const OCC_FRONT = 0.02;
export const OCC_FRONT_FULL = 0.1;
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
 * count are occluderSegments' output; far its farthest kept depth (box[4], uOccDepth); up the
 * world's up in view space as (x, y, depth) (uOccUp, worldUpInView). Only segments lo to hi are
 * searched (occlusionIn; occlusionTiles.ts narrows them without changing the result).
 */
export function occlusion(
  tx: number, ty: number, dl: number, seg: ArrayLike<number>, count: number, far: number, up: ArrayLike<number>,
  lo = 0, hi = count - 1,
): number {
  // Behind the whole body: the "in front" factor below is 0 for every segment, so skip the loop.
  if (dl >= far - OCC_FRONT) return 0;
  let best = 1e9;
  let bi = 0;
  let bu = 0;
  for (let i = Math.max(0, lo); i <= Math.min(hi, count - 1); i++) {
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
  if (best >= OCC_REACH * OCC_REACH) return 0;
  const o = bi * 8;
  const ds = 1 / (seg[o + 2] + (seg[o + 6] - seg[o + 2]) * bu);
  const front = ds - dl;
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
  const tx3 = lx - ex * v;
  const ty3 = ly - ey * v;
  const td3 = lz - ed * v;
  const touch = Math.hypot(tx3, ty3, td3);
  // How high above the axis the leaf lies (world up): the funnel.
  const h = tx3 * up[0] + ty3 * up[1] + td3 * up[2];
  const grow = OCC_FUNNEL * Math.min(OCC_FUNNEL_HEIGHT, Math.max(0, h));
  const drop = OCC_DRAPE + (OCC_DROP - OCC_DRAPE) * smoothstep(OCC_TOUCH, OCC_CLEAR, touch);
  return (1 - smoothstep(OCC_INNER + grow, OCC_OUTER + grow, Math.sqrt(best)))
    * smoothstep(OCC_FRONT, OCC_FRONT_FULL, front)
    * smoothstep(OCC_NEAR, OCC_NEAR + OCC_NEAR_FADE, ds)
    * (drop + (1 - drop) * smoothstep(OCC_DEEP_FROM, OCC_DEEP_TO, h));
}

/**
 * The world's up (0, 1, 0) in view space as (x, y, depth), from a view matrix (three's
 * matrixWorldInverse elements, column-major): uOccUp. Writes `out`.
 */
export function worldUpInView(view: ArrayLike<number>, out: { set(x: number, y: number, z: number): unknown }): void {
  out.set(view[4], view[5], -view[6]);
}

/**
 * The dither threshold at a pixel (interleaved gradient noise, Jimenez 2014): fixed in screen
 * space, so the pattern never changes over time and nothing shimmers. TS twin of ign() below.
 */
export function ign(x: number, y: number): number {
  const fr = (v: number): number => v - Math.floor(v);
  return fr(52.9829189 * fr(x * 0.06711056 + y * 0.00583715));
}

/**
 * GLSL occlusionIn(t, dl, lo, hi), searching segments lo to hi only, and occlusion(t, dl), all of
 * them; stage-agnostic: needs uOccSeg, uOccAxis, uOccCount, uOccDepth and uOccUp declared.
 */
export const OCCLUSION_FN_GLSL = /* glsl */ `
  float occlusionIn(vec2 t, float dl, int lo, int hi) {
    float best = 1e9;
    int bi = 0;
    float bu = 0.0;
    // Behind the whole body: no segment can be in front, so search none.
    int last = dl < uOccDepth - ${f(OCC_FRONT)} ? min(hi, uOccCount - 1) : -1;
    for (int i = max(lo, 0); i <= last; i++) {
      vec4 a = uOccSeg[2 * i];
      vec4 b = uOccSeg[2 * i + 1];
      vec2 ab = b.xy - a.xy;
      float u = clamp(dot(t - a.xy, ab) * a.w, 0.0, 1.0);
      vec2 q = t - a.xy - ab * u;
      float inv = mix(a.z, b.z, u);
      float q2 = dot(q, q);
      if (q2 < best * inv * inv) { best = q2 / (inv * inv); bi = i; bu = u; }
    }
    if (best >= ${f(OCC_REACH * OCC_REACH)}) return 0.0;
    // The segment's ends in view space, from the CPU (occluderAxis): A with 1 / |e|^2, e = B - A.
    vec4 A = uOccAxis[2 * bi];
    vec4 e = uOccAxis[2 * bi + 1];
    float ds = 1.0 / mix(uOccSeg[2 * bi].z, uOccSeg[2 * bi + 1].z, bu);
    float front = ds - dl;
    vec3 l = vec3(t, 1.0) * dl - A.xyz;
    vec3 off = l - e.xyz * clamp(dot(l, e.xyz) * A.w, -2.0, 3.0);
    float touch = length(off);
    float h = dot(off, uOccUp);
    float grow = ${f(OCC_FUNNEL)} * clamp(h, 0.0, ${f(OCC_FUNNEL_HEIGHT)});
    float drop = mix(${f(OCC_DRAPE)}, ${f(OCC_DROP)}, smoothstep(${f(OCC_TOUCH)}, ${f(OCC_CLEAR)}, touch));
    // smoothstep(INNER + grow, OUTER + grow, miss), with the constant width multiplied, not divided.
    return (1.0 - smoothstep(0.0, 1.0, (sqrt(best) - grow - ${f(OCC_INNER)}) * ${f(1 / (OCC_OUTER - OCC_INNER))}))
      * smoothstep(${f(OCC_FRONT)}, ${f(OCC_FRONT_FULL)}, front)
      * smoothstep(${f(OCC_NEAR)}, ${f(OCC_NEAR + OCC_NEAR_FADE)}, ds)
      * mix(drop, 1.0, smoothstep(${f(OCC_DEEP_FROM)}, ${f(OCC_DEEP_TO)}, h));
  }
  float occlusion(vec2 t, float dl) { return occlusionIn(t, dl, 0, ${OCC_SEGMENTS - 1}); }
`;

export { OCC_TILES };

/**
 * Fragment GLSL occTileRange(ndc): the segments (lo, hi) the pixel's tile searches
 * (occlusionTiles.ts; lo > hi: none), unpacked from uOccTiles (groundUniforms.ts occTileWords): a
 * uniform read, cheaper than a texture fetch in a software rasterizer. Needs uOccBox and uOccTiles
 * declared.
 */
export const OCC_TILE_GLSL = /* glsl */ `
  ivec2 occTileRange(vec2 ndc) {
    vec2 uv = (ndc - uOccBox.xy) / (uOccBox.zw - uOccBox.xy);
    ivec2 c = clamp(ivec2(floor(uv * ${f(OCC_TILES)})), ivec2(0), ivec2(${OCC_TILES - 1}));
    int k = c.y * ${OCC_TILES} + c.x;
    int b = (uOccTiles[k >> 4][(k >> 2) & 3] >> ((k & 3) * 8)) & 255;
    return ivec2(b & 15, b >> 4);
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
 * uOccBox (NDC) return at once; those inside search only the segments their tile can need
 * (occTileRange, occlusionTiles.ts). The
 * pixel's ray comes from gl_FragCoord and uOccTan (1 / p00, 1 / p11), the leaf's view depth from
 * gl_FragCoord.w (1 / clip w). Needs uniform uResolution (drawing-buffer size).
 */
export const OCCLUDE_GLSL = /* glsl */ `
  uniform vec4 uOccSeg[${OCC_SEGMENTS * 2}];
  uniform vec4 uOccAxis[${OCC_SEGMENTS * 2}];
  uniform int uOccCount;
  uniform vec4 uOccBox;
  uniform vec2 uOccTan;
  uniform float uOccDepth;
  uniform vec3 uOccUp;
  uniform ivec4 uOccTiles[${(OCC_TILES * OCC_TILES) / 16}];
  ${OCCLUSION_FN_GLSL}
  ${OCC_TILE_GLSL}
  ${IGN_GLSL}
  bool fadedOut() {
    vec2 ndc = gl_FragCoord.xy / uResolution * 2.0 - 1.0;
    if (any(lessThan(ndc, uOccBox.xy)) || any(greaterThan(ndc, uOccBox.zw))) return false;
    ivec2 r = occTileRange(ndc);
    // 1 / gl_FragCoord.w is the view depth only for a perspective camera without setViewOffset.
    return ign(gl_FragCoord.xy) < occlusionIn(ndc * uOccTan, 1.0 / gl_FragCoord.w, r.x, r.y);
  }
`;
