import { PAINTED_LIGHT_GLSL, GRADE_GLSL } from './paintedMaterial';
import { OCCLUDE_GLSL } from './occlusion';

/**
 * The painted leaves' fragment shader (leafMaterial.ts): a midrib and main veins, faint lateral
 * veins, darker dried margins, a wet sheen on damp leaves and a warm glow where the sun shines
 * through the blade. With OCCLUDE defined, pixels between the camera and the worm's body drop out
 * in a fixed screen-space dither (occlusion.ts); with LOD defined (distant low-detail litter) it
 * skips the veins and the wet sheen.
 */
export const LEAF_FRAGMENT = /* glsl */ `
  uniform vec3 uLightDir;
  uniform vec3 uLightColor;
  uniform vec3 uSkyColor;
  uniform vec3 uGroundColor;
  uniform vec3 uRimColor;
  uniform float uRim;
  uniform vec2 uResolution;
  uniform sampler2D uNoise;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec4 vColor;
  varying vec4 vLeaf;
  varying float vLat;
  varying vec3 vNoise;
  varying vec4 vNz;
  varying vec4 vFog;
  ${PAINTED_LIGHT_GLSL}
  ${GRADE_GLSL}
  #ifdef OCCLUDE
  ${OCCLUDE_GLSL}
  #endif

  void main() {
    #ifndef LOD
    // The vein bands' derivatives come first: after a discard that only some pixels of a 2 x 2
    // quad take, derivatives are undefined on some drivers, and the veins of a fading leaf
    // would sparkle.
    float lc = (vLeaf.y - abs(vLeaf.x) * 0.85) * 11.0;
    vec2 fws = fwidth(vec2(vLeaf.w, lc));
    #endif
    #ifdef OCCLUDE
      if (fadedOut()) discard;
    #endif
    vec3 n = normalize(vNormalW);
    if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(cameraPosition - vPosW);
    float detail = vNoise.z;
    vec4 nz = vNz;
    float b = (nz.g * 0.6 + nz.b * 0.4 - 0.5) * 0.5 * detail;
    float dapple = dappleLight(mix(0.5, nz.r, detail), b, 0.9);

    #ifdef LOD
    // Distant litter: too small on screen for veins or the wet sheen, so skip them. The margins
    // and the mottle stay, so the blade's tone matches the full leaf's across the switch.
    vec3 col = vColor.rgb * (1.0 - smoothstep(0.78, 1.0, vLeaf.z) * 0.32) * (1.0 + (nz.r - 0.5) * 0.25 * detail)
      * (1.0 + b * 0.4);
    vec3 lit = paintedLight(col, n, v, b, dapple);
    float ndl = dot(n, uLightDir);
    lit += col * uLightColor * max(-ndl, 0.0) * smoothstep(0.0, 0.3, dot(n, v)) * 0.9 * dapple;
    #else
    // Main veins: vLeaf.w is 1 along the vein edges of the leaf mesh, so a band near 1 is
    // a line of even width that tapers toward the margin. Fades out before it can alias.
    // (lc and its fwidth, fws, are taken at the top of main, before the discard.)
    // Guard against equal smoothstep edges (undefined in GLSL) where a triangle has a
    // constant vein weight (fwidth 0, e.g. the petiole). w > 0 always, and lw >= 0 keeps the
    // lateral-vein edges below apart.
    float fw = max(fws.x, 1e-3);
    float lw = fws.y;
    float w = 0.11 * (1.25 - vLeaf.z) * (0.3 + 0.7 * smoothstep(0.0, 0.3, vLeaf.z));
    float vein = smoothstep(1.0 - w - fw, 1.0 - w + fw, vLeaf.w) * clamp(w / (fw * 2.5 + 1e-4) - 0.4, 0.0, 1.0);
    // Lateral veins: chevrons leaving the midrib toward the tip.
    float d = abs(fract(lc) - 0.5);
    float lat = smoothstep(0.38, 0.47 + lw, d) * vLat * (1.0 - smoothstep(0.12, 0.35, lw)) * (1.0 - vLeaf.z * 0.6);

    vec3 col = vColor.rgb;
    // Dried, darker margins and a soft mottle that rides with the paint strokes.
    float rim = smoothstep(0.78, 1.0, vLeaf.z);
    col *= (1.0 - rim * 0.32) * (1.0 + (nz.r - 0.5) * 0.25 * detail);
    // Autumn veins read paler and yellower than the blade.
    vec3 veinCol = col * vec3(1.15, 1.5, 1.7) + vec3(0.05, 0.04, 0.012);
    col = mix(col, veinCol, max(vein * 0.9, lat * 0.5) * mix(0.45, 1.0, detail));
    col *= 1.0 + b * 0.4;

    vec3 lit = paintedLight(col, n, v, b, dapple);

    // Sun through the blade: light on the far side of the leaf glows warm through it.
    float ndl = dot(n, uLightDir);
    float through = max(-ndl, 0.0) * smoothstep(0.0, 0.3, dot(n, v));
    lit += col * uLightColor * through * 0.9 * dapple;
    // Damp leaves: a soft wet sheen.
    vec3 h = normalize(uLightDir + v);
    float spec = max(dot(n, h), 0.0);
    spec *= spec;
    spec *= spec;
    spec *= spec;
    spec *= spec * smoothstep(-0.05, 0.25, ndl) * dapple;
    lit += uLightColor * spec * (0.04 + vColor.a * 0.4);
    #endif

    lit = mix(lit, vFog.rgb, vFog.a);
    gl_FragColor = vec4(paintedGrade(lit), 1.0);
    #include <colorspace_fragment>
  }
`;
