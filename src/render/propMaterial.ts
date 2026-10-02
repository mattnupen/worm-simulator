import * as THREE from 'three';
import {
  sharedLighting, PAINTED_VERTEX_GLSL, PAINTED_LIGHT_GLSL, GRADE_GLSL,
} from './paintedMaterial';
import { groundUniforms } from './groundUniforms';
import { getLitterTexture } from './litterTexture';
import { getGroundTexture } from './groundTexture';
import { NEAR_CLUTTER_GLSL } from './nearClutterGlsl';
import { OCCLUDE_GLSL } from './occlusion';

export { NEAR_CLUTTER_BOX } from './nearClutterGlsl';

/**
 * Forest-floor props on the painted lighting. Attribute aProp: linear rgb, and a surface
 * code whose integer part picks the treatment (0 plain, 1 stone with lichen and moss,
 * 2 plant, glowing where the sun shines through) and whose fraction is a 0..1 parameter.
 * With WRAP defined (Ultra's near clutter), aWrap is each item's home in a world tile and the
 * vertex shader places the copy nearest the worm on the ground (nearClutterPosition), shrunk away
 * from the worm's body, and shades it by the baked trunk shade. Its tufts can stand between the
 * camera and the worm, so it also fades there like the leaves (OCCLUDE, occlusion.ts).
 */
const vertexShader = /* glsl */ `
  uniform vec3 uLightDir;
  uniform vec3 uLightColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  attribute vec4 aProp;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec4 vProp;
  varying vec3 vNoise;
  varying vec4 vFog;
  ${PAINTED_VERTEX_GLSL}
  #ifdef WRAP
  ${NEAR_CLUTTER_GLSL}
  #endif
  void main() {
    #ifdef WRAP
      float shade;
      vec4 wp = nearClutterPosition(position, shade);
      vNormalW = normal;
      vProp = vec4(aProp.rgb * shade, aProp.w);
    #else
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vNormalW = mat3(modelMatrix) * normal;
      vProp = aProp;
    #endif
    vPosW = wp.xyz;
    vec3 toCam = cameraPosition - wp.xyz;
    float dist = length(toCam);
    vNoise = worldBrushCoord(wp.xyz, dist);
    vFog = distanceHaze(toCam, dist);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragmentShader = /* glsl */ `
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
  varying vec4 vProp;
  varying vec3 vNoise;
  varying vec4 vFog;
  ${PAINTED_LIGHT_GLSL}
  ${GRADE_GLSL}
  #ifdef OCCLUDE
  ${OCCLUDE_GLSL}
  #endif
  void main() {
    #ifdef OCCLUDE
      if (fadedOut()) discard;
    #endif
    vec3 n = normalize(vNormalW);
    if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(cameraPosition - vPosW);
    float detail = vNoise.z;
    float kind = floor(vProp.w);
    float param = fract(vProp.w);
    // Stone gets a finer lookup (lichen rosettes, flecks); everything else the world strokes.
    vec2 uv = kind > 0.5 && kind < 1.5 ? vNoise.xy * 4.0 + vPosW.y * 0.3 : vNoise.xy;
    vec4 nz = texture2D(uNoise, uv);
    float b = (nz.g * 0.6 + nz.b * 0.4 - 0.5) * 0.6 * detail;
    float dapple = dappleLight(mix(0.5, nz.r, detail), b, 0.8);
    vec3 col = vProp.rgb;
    if (kind > 0.5 && kind < 1.5) {
      // Granite: speckles, pale grey-green lichen rosettes, rare orange lichen, moss on top.
      col *= 0.85 + 0.3 * nz.b;
      float lichen = smoothstep(0.68, 0.72, nz.r) * detail;
      col = mix(col, vec3(0.5, 0.52, 0.38), lichen * 0.75);
      col = mix(col, vec3(0.62, 0.3, 0.06), smoothstep(0.8, 0.83, nz.a) * detail * 0.8);
      float moss = smoothstep(0.62, 0.92, n.y + (nz.g - 0.5) * 0.4);
      col = mix(col, mix(vec3(0.08, 0.12, 0.02), vec3(0.2, 0.26, 0.05), nz.b), moss);
    }
    col *= 1.0 + b * 0.4;
    vec3 lit = paintedLight(col, n, v, b, dapple);
    if (kind > 1.5) {
      // Thin leaves and blades: light from behind glows through them, more toward the tips.
      float through = max(-dot(n, uLightDir), 0.0) + pow(max(dot(-v, uLightDir), 0.0), 3.0) * 0.5;
      lit += col * uLightColor * through * (0.4 + 0.5 * param) * dapple;
      // Darker in the crown of the tuft, where blades shade each other.
      lit *= 0.6 + 0.4 * smoothstep(0.0, 0.5, param);
    }
    lit = mix(lit, vFog.rgb, vFog.a);
    gl_FragColor = vec4(paintedGrade(lit), 1.0);
    #include <colorspace_fragment>
  }
`;

/** `wrap`: the near-worm clutter variant (placed around the worm in the vertex shader). */
export function createPropMaterial(wrap = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: wrap
      ? {
        ...sharedLighting,
        uFocus: groundUniforms.uFocus,
        uWrapCentre: groundUniforms.uWrapCentre,
        uSpine: groundUniforms.uSpine,
        uOccSeg: groundUniforms.uOccSeg,
        uOccCount: groundUniforms.uOccCount,
        uOccBox: groundUniforms.uOccBox,
        uOccTan: groundUniforms.uOccTan,
        uLitter: { value: getLitterTexture() },
        uGround: { value: getGroundTexture() },
      }
      : { ...sharedLighting },
    defines: wrap ? { WRAP: '', OCCLUDE: '' } : {},
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
  });
}
