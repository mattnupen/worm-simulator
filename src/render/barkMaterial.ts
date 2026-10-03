import * as THREE from 'three';
import { TERRAIN_GLSL } from '../surface/terrain';
import {
  sharedLighting, PAINTED_VERTEX_GLSL, PAINTED_LIGHT_GLSL, GRADE_GLSL,
} from './paintedMaterial';

/**
 * Procedural bark on the painted lighting, from bark-space coordinates (no textures beyond
 * the shared noise; two fetches per pixel):
 * - paper birch (0): chalky white, dark horizontal lenticels, black chevrons over branch
 *   scars, torn patches showing salmon inner bark, dark rough bark near the base;
 * - sugar maple (1): grey-brown plates split by dark vertical furrows, lichen flecks;
 * - peeling birch curls (2 outer, 3 inner) and pale rotted wood on broken log ends (4).
 * Moss gathers on up-facing surfaces; the base darkens where it meets the ground.
 *
 * Attribute aBark: x around the trunk 0..1 (radial fraction on wood ends), y metres along it,
 * z surface kind, w per-tree seed 0..1 (plus 1 for a fallen log: no root-collar darkening,
 * a shallower contact shadow and more moss). w reaches the fragment shader flat (vSeedW): even a
 * constant varying comes out a hair off from pixel to pixel, and the scar hashes magnify that
 * into speckles.
 */
const vertexShader = /* glsl */ `
  uniform vec3 uLightDir;
  uniform vec3 uLightColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  attribute vec4 aBark;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec4 vBark;
  flat varying float vSeedW;
  varying float vAbove;
  varying vec3 vNoise;
  varying vec4 vFog;
  ${PAINTED_VERTEX_GLSL}
  ${TERRAIN_GLSL}
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    vNormalW = mat3(modelMatrix) * normal;
    vBark = aBark;
    vSeedW = aBark.w;
    vAbove = wp.y - terrainHeight(wp.xz);
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
  varying vec4 vBark;
  flat varying float vSeedW;
  varying float vAbove;
  varying vec3 vNoise;
  varying vec4 vFog;
  ${PAINTED_LIGHT_GLSL}
  ${GRADE_GLSL}

  float hash(float n) { return fract(sin(n) * 43758.5453); }

  vec3 birchBark(float around, float h, float seed, vec4 nb, float detail) {
    vec3 col = mix(vec3(0.74, 0.72, 0.66), vec3(0.86, 0.84, 0.8), nb.a);
    // Lenticels: short dark horizontal dashes.
    float lent = smoothstep(0.77, 0.83, nb.g) * mix(0.35, 1.0, detail);
    // Branch scars every ~1.5 m with the dark chevron "eyebrows" spreading down from them.
    float k = floor((h - 1.2 - seed * 0.9) / 1.5);
    float dh = h - (1.2 + seed * 0.9 + (k + 0.5) * 1.5);
    float da = (fract(around - hash(k * 7.31 + seed * 31.7) + 0.5) - 0.5) * 2.2;
    float here = step(0.3, hash(k * 12.99 + seed * 78.23)) * step(0.0, k) * step(h, 11.0);
    float scar = 1.0 - smoothstep(0.04, 0.07, length(vec2(da, dh * 1.7)));
    float armW = 0.012 + 0.03 * max(0.0, 1.0 - abs(da) * 3.5);
    float arm = (1.0 - smoothstep(armW, armW + 0.012, abs(dh + abs(da) * 0.55 - 0.03)))
      * (1.0 - smoothstep(0.1, 0.32, abs(da)));
    float chev = max(scar, arm) * here;
    // Occasional dark patches and torn spots showing the salmon inner bark.
    float patchDark = smoothstep(0.77, 0.83, nb.r);
    float peel = smoothstep(0.72, 0.76, nb.a) * smoothstep(0.5, 0.62, nb.g) * (1.0 - patchDark);
    col = mix(col, vec3(0.05, 0.045, 0.04), max(lent * 0.85, chev * 0.92));
    col = mix(col, vec3(0.09, 0.08, 0.075), patchDark * 0.8);
    col = mix(col, vec3(0.6, 0.27, 0.13), peel * 0.9);
    // Old base: rough, dark and fissured.
    float base = 1.0 - smoothstep(0.45, 1.5, h + (nb.r - 0.5) * 1.1);
    vec3 baseCol = mix(vec3(0.035, 0.032, 0.03), vec3(0.16, 0.15, 0.13), smoothstep(0.35, 0.7, nb.g));
    return mix(col, baseCol, base);
  }

  vec3 mapleBark(vec4 nb, float detail) {
    float furrow = 1.0 - smoothstep(0.25, 0.42, nb.g);
    vec3 plate = mix(vec3(0.11, 0.09, 0.07), vec3(0.2, 0.18, 0.15), nb.r);
    vec3 col = mix(plate, vec3(0.025, 0.018, 0.014), furrow * mix(0.5, 0.95, detail));
    // Pale ridges on the plate edges, and grey-green lichen flecks.
    col += vec3(0.05, 0.045, 0.04) * smoothstep(0.6, 0.75, nb.g) * detail;
    return mix(col, vec3(0.3, 0.33, 0.25), smoothstep(0.8, 0.86, nb.b) * 0.6 * detail);
  }

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vPosW);
    float around = vBark.x;
    float h = vBark.y;
    float kind = vBark.z;
    float lying = step(1.0, vSeedW);
    float seed = fract(vSeedW);
    float detail = vNoise.z;

    vec4 wz = texture2D(uNoise, vNoise.xy);
    // Bark space: birch features run around the trunk, maple furrows run up it.
    float maple = step(0.5, kind) * (1.0 - step(1.5, kind));
    vec2 bc = mix(vec2(h * 2.2, around * 2.0 + seed), vec2(around * 4.0 + seed, h * 0.22), maple);
    vec4 nb = texture2D(uNoise, bc);
    float b = (wz.g * 0.6 + wz.b * 0.4 - 0.5) * 0.55 * detail;
    float dapple = dappleLight(mix(0.5, wz.r, detail), b, 0.8);

    vec3 col;
    if (kind < 0.5) {
      col = birchBark(around, mix(h, h + 2.0, lying), seed, nb, detail);
    } else if (kind < 1.5) {
      col = mapleBark(nb, detail);
    } else if (kind < 2.5) {
      // Curl, outer face: papery white, browning at its torn edges.
      float edge = smoothstep(0.6, 1.0, abs(around * 2.0 - 1.0));
      col = mix(vec3(0.8, 0.76, 0.7), vec3(0.42, 0.3, 0.22), edge * 0.6);
      col = mix(col, vec3(0.05), smoothstep(0.7, 0.77, nb.g) * 0.7);
    } else if (kind < 3.5) {
      col = mix(vec3(0.62, 0.3, 0.16), vec3(0.78, 0.48, 0.3), nb.r);
    } else {
      // Rotted wood: soft growth rings, darker and punky toward the heart.
      float ring = smoothstep(0.35, 0.5, abs(fract(around * 6.0 + nb.r * 0.6) - 0.5));
      col = mix(vec3(0.42, 0.3, 0.18), vec3(0.27, 0.18, 0.1), ring * 0.6);
      col *= mix(0.45, 1.0, smoothstep(0.1, 0.55, around));
    }

    // Moss on top of logs and the root flare, and a little at the very base.
    float moss = smoothstep(0.35 - lying * 0.2, 0.75, n.y + (nb.r - 0.5) * 0.5 + (wz.b - 0.5) * 0.3);
    moss = max(moss, (1.0 - smoothstep(0.0, 0.3, vAbove + (nb.b - 0.5) * 0.25)) * 0.7) * step(kind, 1.5);
    vec3 mossCol = mix(vec3(0.07, 0.11, 0.02), vec3(0.2, 0.27, 0.05), wz.b);
    col = mix(col, mossCol, moss);
    // Contact darkening where the bark meets the litter.
    col *= mix(0.45, 1.0, smoothstep(0.0, mix(0.7, 0.2, lying), vAbove));
    col *= 1.0 + b * 0.5;

    vec3 lit = paintedLight(col, n, v, b, dapple);
    lit = mix(lit, vFog.rgb, vFog.a);
    gl_FragColor = vec4(paintedGrade(lit), 1.0);
    #include <colorspace_fragment>
  }
`;

export function createBarkMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...sharedLighting },
    vertexShader,
    fragmentShader,
  });
}
