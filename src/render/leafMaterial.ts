import * as THREE from 'three';
import { TERRAIN_GLSL } from '../surface/terrain';
import {
  sharedLighting, PAINTED_VERTEX_GLSL, PAINTED_LIGHT_GLSL, GRADE_GLSL,
} from './paintedMaterial';

/**
 * Painted autumn leaves: the shared painted lighting plus, from leaf-local attributes, a
 * midrib and main veins, faint lateral veins, darker dried margins, a wet sheen on damp
 * leaves and a warm glow where the sun shines through the blade. One noise fetch per pixel.
 *
 * Attributes: aColor (rgb, wetness), aLeaf (u, v leaf-local; r 0 inside .. 1 on the margin;
 * vein weight), aLeaf2 (lateral-vein strength, per-leaf seed).
 * With FALLING defined, aFall (seed, spin rate, box x, box z) animates each leaf down
 * through the light around the camera, looping, entirely in the vertex shader.
 */
const vertexShader = /* glsl */ `
  uniform vec3 uLightDir;
  uniform vec3 uLightColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  attribute vec4 aColor;
  attribute vec4 aLeaf;
  attribute vec2 aLeaf2;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec4 vColor;
  varying vec4 vLeaf;
  varying float vLat;
  varying vec3 vNoise;
  varying vec4 vFog;
  ${PAINTED_VERTEX_GLSL}

  #ifdef FALLING
  uniform float uTime;
  attribute vec4 aFall;
  ${TERRAIN_GLSL}
  const float BOX = 12.0;
  const float FALL_H = 6.5;
  vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
  vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
  vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
  #endif

  void main() {
    vec3 nrm = normal;
    #ifdef FALLING
      float seed = aFall.x;
      float t = uTime;
      // One slow descent every 16..26 s, staggered; drifting on a light breeze.
      float ph = fract(t / (16.0 + 10.0 * seed) + seed * 7.13);
      vec2 drift = vec2(0.22, 0.1) * t * (0.6 + 0.4 * seed)
        + vec2(sin(t * 0.31 + seed * 20.0), cos(t * 0.27 + seed * 13.0)) * 0.5;
      vec2 local = mod(aFall.zw * BOX + drift - cameraPosition.xz + BOX * 0.5, BOX) - BOX * 0.5;
      // Pendulum flutter: swinging side to side, rocking with the swing (well under 1 Hz).
      float sw = sin(t * (0.9 + 0.5 * seed) + seed * 30.0);
      vec2 side = vec2(cos(seed * 6.28), sin(seed * 6.28));
      vec2 xz = cameraPosition.xz + local + side * sw * 0.3;
      float ground = terrainHeight(xz);
      // Ends a little below the ground, so each leaf settles into the litter and is gone.
      float y = ground - 0.35 + (1.0 - ph) * FALL_H;
      float spin = t * aFall.y + seed * 6.28;
      float rock = sw * 0.7 + 0.25;
      vec3 p = rotY(rotZ(rotX(position, 0.35 + 0.3 * cos(t * 0.7 + seed * 9.0)), rock), spin);
      nrm = rotY(rotZ(rotX(normal, 0.35 + 0.3 * cos(t * 0.7 + seed * 9.0)), rock), spin);
      // Shrink to nothing at the wrapping edges of the box and at the very top of the loop.
      vec2 e = abs(local) / (BOX * 0.5);
      vec3 centre = vec3(xz.x, y, xz.y);
      // Never sweep across the lens: shrink away within ~1.5 m of the camera.
      float fade = (1.0 - smoothstep(0.72, 1.0, max(e.x, e.y))) * smoothstep(0.0, 0.05, ph)
        * smoothstep(0.7, 1.6, distance(centre, cameraPosition));
      vec4 wp = vec4(centre + p * fade, 1.0);
      vNormalW = normalize(nrm);
    #else
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vNormalW = normalize(mat3(modelMatrix) * nrm);
    #endif
    vPosW = wp.xyz;
    vColor = aColor;
    vLeaf = aLeaf;
    vLat = aLeaf2.x;
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
  varying vec4 vColor;
  varying vec4 vLeaf;
  varying float vLat;
  varying vec3 vNoise;
  varying vec4 vFog;
  ${PAINTED_LIGHT_GLSL}
  ${GRADE_GLSL}

  void main() {
    vec3 n = normalize(vNormalW);
    if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(cameraPosition - vPosW);
    float detail = vNoise.z;
    vec4 nz = texture2D(uNoise, vNoise.xy);
    float b = (nz.g * 0.6 + nz.b * 0.4 - 0.5) * 0.5 * detail;
    float dapple = dappleLight(mix(0.5, nz.r, detail), b, 0.9);

    // Main veins: vLeaf.w is 1 along the vein edges of the leaf mesh, so a band near 1 is
    // a line of even width that tapers toward the margin. Fades out before it can alias.
    float lc = (vLeaf.y - abs(vLeaf.x) * 0.85) * 11.0;
    vec2 fws = fwidth(vec2(vLeaf.w, lc));
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

    lit = mix(lit, vFog.rgb, vFog.a);
    gl_FragColor = vec4(paintedGrade(lit), 1.0);
    #include <colorspace_fragment>
  }
`;

export function createLeafMaterial(falling = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...sharedLighting },
    defines: falling ? { FALLING: '' } : {},
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
  });
}
