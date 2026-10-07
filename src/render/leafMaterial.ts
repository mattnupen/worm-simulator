import * as THREE from 'three';
import { TERRAIN_GLSL } from '../surface/terrain';
import { sharedLighting, PAINTED_VERTEX_GLSL } from './paintedMaterial';
import { groundUniforms } from './groundUniforms';
import { DISTURB_GLSL, HERO_GLSL } from './leafGlsl';
import { DETAIL_GLSL } from './detailGlsl';
import { getLitterTexture } from './litterTexture';
import { getGroundTexture } from './groundTexture';
import { LEAF_FRAGMENT } from './leafFragment';

/**
 * Painted autumn leaves: the shared painted lighting plus, from leaf-local attributes, a
 * midrib and main veins, faint lateral veins, darker dried margins, a wet sheen on damp
 * leaves and a warm glow where the sun shines through the blade (the fragment shader is in
 * leafFragment.ts). One noise fetch per vertex.
 *
 * Attributes: aColor (rgb, wetness), aLeaf (u, v leaf-local; r 0 inside .. 1 on the margin;
 * vein weight), aLeaf2 (lateral-vein strength, per-leaf seed).
 * With FALLING defined, aFall (seed, spin rate, box x, box z) animates each leaf down
 * through the light around the camera, looping, entirely in the vertex shader.
 * With DETAIL defined, aDetail (home x, z in the wrap tile, yaw, radius) places each leaf of the
 * close-up layer around the worm in the vertex shader: on the top of the litter, or with POCKET in
 * the litter round the buried worm (detailGlsl.ts). With DISTURB defined too (only the pocket's
 * leaves react to the worm), each drapes, slides and settles by the disturbance map as a rigid
 * piece about the anchor the placement gives (centre x, centre z, radius, rest height).
 * With HERO defined it is the instanced hero-leaf mesh (instanceMatrix, instanceColor tint).
 * With OCCLUDE defined, leaf pixels between the camera and the worm's body drop out in a fixed
 * screen-space dither (occlusion.ts), so the worm stays readable without a transparent pass.
 * With LOD defined (distant low-detail litter) the fragment shader skips the veins and the wet
 * sheen.
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
  // The painted-noise sample, fetched per vertex for every leaf layer alike (so their tones match
  // across layer and LOD seams): a leaf is small next to the noise's patches and strokes, and the
  // per-pixel fetch was a measurable share of the leaves' fill cost.
  varying vec4 vNz;
  uniform sampler2D uNoise;
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

  #ifdef DETAIL
  ${DETAIL_GLSL}
  #endif

  #ifdef HERO
  ${HERO_GLSL}
  #endif

  #ifdef DISTURB
  ${DISTURB_GLSL}
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
    #elif defined(DETAIL)
      float shade;
      vec4 anchor;
      vec4 wp = detailPosition(nrm, shade, anchor);
      vNormalW = normalize(nrm);
    #elif defined(HERO)
      vec4 wp = heroPosition(nrm);
      vNormalW = normalize(nrm);
    #else
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vNormalW = normalize(mat3(modelMatrix) * nrm);
    #endif
    #ifdef DISTURB
      vec3 nW = vNormalW;
      if (anchor.z > 0.0) wp.xyz = disturb(wp.xyz, anchor, 0.0, nW);
      vNormalW = nW;
    #endif
    #ifdef POCKET
      // Draped over the body, never up through the top of the litter.
      wp.xyz = pocketCap(wp.xyz);
    #endif
    vPosW = wp.xyz;
    vColor = aColor;
    #ifdef DETAIL
      vColor.rgb *= shade;
    #endif
    #ifdef USE_INSTANCING_COLOR
      vColor.rgb *= instanceColor;
    #endif
    vLeaf = aLeaf;
    vLat = aLeaf2.x;
    vec3 toCam = cameraPosition - wp.xyz;
    float dist = length(toCam);
    vNoise = worldBrushCoord(wp.xyz, dist);
    vNz = texture2D(uNoise, vNoise.xy);
    vFog = distanceHaze(toCam, dist);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

/**
 * Which leaves: litter chunks near the worm ('litter': they fade over it), other full-leaf litter
 * chunks ('plain'), distant low-detail litter ('far'), the close-up top leaves ('detail': they
 * fade), the leaves in the buried worm's pocket ('pocket': they drape and slide by the disturbance
 * map, and fade; 'pocketPlain': the same where they cannot fade, so hidden pixels are rejected
 * before they are shaded), the falling leaves (animated), or the hero leaves (instanced, moved by their own
 * physics). The litter swaps between the first three per chunk, never recompiling. The top leaves
 * lie 2 to 5 cm above the worm (V2 spec 8.2), so only the pocket's leaves react to it.
 */
export type LeafVariant = 'litter' | 'plain' | 'far' | 'falling' | 'detail' | 'pocket' | 'pocketPlain' | 'hero';

const DEFINES: Record<LeafVariant, Record<string, string>> = {
  litter: { OCCLUDE: '' },
  plain: {},
  far: { LOD: '' },
  falling: { FALLING: '' },
  detail: { DETAIL: '', OCCLUDE: '' },
  pocket: { DETAIL: '', POCKET: '', DISTURB: '', OCCLUDE: '' },
  pocketPlain: { DETAIL: '', POCKET: '', DISTURB: '' },
  hero: { HERO: '', OCCLUDE: '' },
};

export function createLeafMaterial(variant: LeafVariant = 'litter'): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...sharedLighting,
      ...groundUniforms,
      // Only the detail layers need the baked litter and ground, so only they pay for building them.
      ...('DETAIL' in DEFINES[variant]
        ? { uLitter: { value: getLitterTexture() }, uGround: { value: getGroundTexture() } } : {}),
    },
    defines: { ...DEFINES[variant] },
    vertexShader,
    fragmentShader: LEAF_FRAGMENT,
    side: THREE.DoubleSide,
  });
}
