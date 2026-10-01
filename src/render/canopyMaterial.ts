import * as THREE from 'three';
import { SKY_TOP_COLOR } from './sky';
import {
  sharedLighting, PAINTED_VERTEX_GLSL, PAINTED_LIGHT_GLSL, GRADE_GLSL,
} from './paintedMaterial';

/**
 * Soft, clustered autumn foliage masses: painted lighting broken into leaf clumps, warm
 * light glowing through the leaves against the sun, sky gaps near the silhouette (painted
 * in, no alpha) and a gentle wind sway in the vertex shader. Attribute aCanopy: rgb colour,
 * w sway phase.
 */
const vertexShader = /* glsl */ `
  uniform vec3 uLightDir;
  uniform vec3 uLightColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uTime;
  uniform vec3 uSkyTop;
  attribute vec4 aCanopy;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vColor;
  varying vec3 vSky;
  varying vec3 vNoise;
  varying vec4 vFog;
  ${PAINTED_VERTEX_GLSL}
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    float ph = aCanopy.w * 6.2831;
    wp.xyz += vec3(sin(uTime * 0.5 + ph + wp.y * 0.35), 0.0, cos(uTime * 0.41 + ph * 1.3 + wp.x * 0.3)) * 0.14;
    vPosW = wp.xyz;
    vNormalW = mat3(modelMatrix) * normal;
    vColor = aCanopy.rgb;
    vec3 toCam = cameraPosition - wp.xyz;
    float dist = length(toCam);
    vec3 dir = -toCam / dist;
    vSky = mix(hazeColor(dir), uSkyTop, smoothstep(0.0, 0.75, max(dir.y, 0.0)));
    vNoise = vec3(worldBrushCoord(wp.xyz, dist).xy * 0.9, 1.0 - smoothstep(14.0, 40.0, dist));
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
  varying vec3 vColor;
  varying vec3 vSky;
  varying vec3 vNoise;
  varying vec4 vFog;
  ${PAINTED_LIGHT_GLSL}
  ${GRADE_GLSL}
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vPosW);
    vec4 nz = texture2D(uNoise, vNoise.xy);
    float detail = vNoise.z;
    // Leaf clumps: strong, blotchy value breaks that the light bands catch.
    float clump = mix(0.5, nz.b * 0.7 + nz.r * 0.3, detail);
    float b = (clump - 0.5) * 1.3;
    vec3 col = vColor * (0.75 + 0.5 * mix(0.5, nz.r, detail));
    vec3 lit = paintedLight(col, n, v, b, 1.0);
    // Sun through the leaves.
    float back = max(dot(-v, uLightDir), 0.0);
    lit += col * uLightColor * back * back * back * 0.8;
    // Sky gaps: clumps thin out toward the silhouette.
    float edge = 1.0 - abs(dot(n, v));
    float gap = smoothstep(0.64, 0.7, nz.b + edge * edge * 0.6 - 0.14) * detail;
    lit = mix(lit, vSky, gap * 0.85);
    lit = mix(lit, vFog.rgb, vFog.a);
    gl_FragColor = vec4(paintedGrade(lit), 1.0);
    #include <colorspace_fragment>
  }
`;

export function createCanopyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...sharedLighting, uSkyTop: { value: new THREE.Color(SKY_TOP_COLOR) } },
    vertexShader,
    fragmentShader,
  });
}
