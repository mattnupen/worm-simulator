import * as THREE from 'three';
import { getNoiseTexture } from './noiseTexture';

/** Shared by reference across every painted material (and the sky / atmosphere shaders). */
export const sharedLighting = {
  /** Low golden-afternoon sun, ahead and to the right of the starting view (backlight).
   *  Shaders assume it is unit length: keep it normalized if you change it. */
  uLightDir: { value: new THREE.Vector3(0.5, 0.5, 0.7).normalize() },
  uLightColor: { value: new THREE.Color('#ffd9a0') },
  uSkyColor: { value: new THREE.Color('#c3cdd0') },
  uGroundColor: { value: new THREE.Color('#7a5232') },
  uRimColor: { value: new THREE.Color('#ffb347') },
  uRim: { value: 1 },
  /** Horizon / distance-haze colour. The sky dome uses the same value at its horizon. */
  uFogColor: { value: new THREE.Color('#e6cc9c') },
  uFogNear: { value: 11 },
  uFogFar: { value: 58 },
  /** Seconds, for wind and drifting motes. */
  uTime: { value: 0 },
  /** Drawing-buffer size in pixels, for the screen-space vignette. */
  uResolution: { value: new THREE.Vector2(1366, 768) },
  uNoise: { value: getNoiseTexture() },
};

/**
 * Shared GLSL: horizon haze colour in a view direction (sun-warmed toward the light).
 * Needs uniforms uLightDir, uLightColor, uFogColor. Evaluated per vertex (it uses pow).
 */
export const HAZE_GLSL = /* glsl */ `
  vec3 hazeColor(vec3 dir) {
    float s = max(dot(normalize(dir), uLightDir), 0.0);
    float s2 = s * s;
    float s6 = s2 * s2 * s2;
    return uFogColor + uLightColor * (s6 * 0.28 + pow(s, 40.0) * 0.3);
  }
`;

/**
 * Shared GLSL: warm colour grade and soft warm vignette, in linear space before output.
 * Needs uniform uResolution. A handful of ALU ops; no post pass.
 */
export const GRADE_GLSL = /* glsl */ `
  vec3 paintedGrade(vec3 c) {
    vec2 q = gl_FragCoord.xy / uResolution - 0.5;
    return c * (vec3(1.04, 1.0, 0.93) - dot(q, q) * vec3(0.42, 0.56, 0.64));
  }
`;

const vertexShader = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uLightDir;
  uniform vec3 uLightColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vColor;
  varying vec3 vNoise;
  varying vec4 vFog;
  ${HAZE_GLSL}
  void main() {
    mat4 m = modelMatrix;
    vec3 col = uColor;
    #ifdef USE_INSTANCING
      m = modelMatrix * instanceMatrix;
    #endif
    #ifdef USE_INSTANCING_COLOR
      col *= instanceColor;
    #endif
    #ifdef USE_COLOR
      col *= color;
    #endif
    vec4 wp = m * vec4(position, 1.0);
    vPosW = wp.xyz;
    vNormalW = normalize(mat3(m) * normal);
    vColor = col;
    vec3 toCam = cameraPosition - wp.xyz;
    float dist = length(toCam);
    // Oblique planar projection: ground reads top-down, walls pick up vertical streaks (bark).
    // z = detail weight: fine brush detail fades out with distance so it never shimmers.
    vNoise = vec3((wp.xz + wp.y * vec2(0.55, -0.35)) * 0.2, 1.0 - smoothstep(9.0, 26.0, dist));
    // Distance haze, per vertex: colour toward the view direction, and amount.
    float f = smoothstep(uFogNear, uFogFar, dist);
    vFog = vec4(hazeColor(-toCam), f * f * (3.0 - 2.0 * f) * 0.92);
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
  uniform float uBrush;
  uniform vec2 uResolution;
  uniform sampler2D uNoise;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vColor;
  varying vec3 vNoise;
  varying vec4 vFog;
  ${GRADE_GLSL}

  void main() {
    vec3 n = normalize(vNormalW);
    if (!gl_FrontFacing) n = -n;
    float ndl = dot(n, uLightDir);
    // One fetch of the shared tiling noise: R patches, G strokes, B flecks, A hue drift.
    vec4 nz = texture2D(uNoise, vNoise.xy);
    float b = (nz.g * 0.6 + nz.b * 0.4 - 0.5) * uBrush * vNoise.z;
    // No mipmaps: fade the broad patches and hue drift toward their mean with distance too,
    // so far grazing ground doesn't crawl or sparkle.
    float patches = mix(0.5, nz.r, vNoise.z);
    float hue = mix(0.5, nz.a, vNoise.z);

    // Two soft light bands whose edges are broken up by the brush strokes.
    float sun = smoothstep(-0.02, 0.16, ndl + b * 0.35);
    float hi = smoothstep(0.4, 0.62, ndl + b * 0.55);
    // Dappled canopy light: broad soft patches of sun and shade, even on fully lit ground.
    float dapple = mix(1.0, smoothstep(0.3, 0.62, patches + b * 0.4) * 0.8 + 0.2, 0.7 * uBrush);
    float band = sun * (0.5 + 0.38 * hi) * dapple;

    vec3 hemi = mix(uGroundColor, uSkyColor, n.y * 0.5 + 0.5);
    // Warm/cool hue drift and value variation, so lit areas read as paint, not flat fill.
    vec3 tint = mix(vec3(1.08, 0.98, 0.84), vec3(0.88, 0.98, 1.06), hue);
    vec3 base = vColor * mix(vec3(1.0), tint, 0.7 * uBrush) * (1.0 + b * 0.45);
    vec3 lit = base * (hemi * 0.68 + uLightColor * band);

    vec3 v = normalize(cameraPosition - vPosW);
    float r = 1.0 - max(dot(n, v), 0.0);
    lit += uRimColor * (r * r * r * uRim * 0.6);

    lit = mix(lit, vFog.rgb, vFog.a);
    gl_FragColor = vec4(paintedGrade(lit), 1.0);
    #include <colorspace_fragment>
  }
`;

export interface PaintedOptions {
  color: THREE.ColorRepresentation;
  /** 0 = clean bands, 1 = strong brush breakup. */
  brush?: number;
  doubleSide?: boolean;
  /** Multiply by the geometry's `color` attribute (baked painted variation). */
  vertexColors?: boolean;
}

export function createPaintedMaterial(opts: PaintedOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...sharedLighting,
      uColor: { value: new THREE.Color(opts.color) },
      uBrush: { value: opts.brush ?? 0.6 },
    },
    vertexShader,
    fragmentShader,
    vertexColors: opts.vertexColors ?? false,
    side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
}

export function setRimLight(on: boolean): void {
  sharedLighting.uRim.value = on ? 1 : 0;
}

/** Call on resize and whenever the pixel ratio changes. */
export function setResolution(width: number, height: number): void {
  sharedLighting.uResolution.value.set(Math.max(1, width), Math.max(1, height));
}

export function setTime(seconds: number): void {
  sharedLighting.uTime.value = seconds;
}
