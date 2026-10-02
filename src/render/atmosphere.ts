import * as THREE from 'three';
import { mulberry32 } from '../core/random';
import { terrainHeight } from '../surface/terrain';
import { buildFallingLeaves, FALLING_COUNT, FALLING_MAX } from '../surface/fallingLeaves';
import { sharedLighting } from './paintedMaterial';

/**
 * Soft additive light shafts: thin quads laid along the sun direction, turned about that
 * axis to face the camera. They fade (and collapse) as the camera nears them, so they stay
 * small on screen and never become a full-screen overdraw quad.
 */
const shaftVertex = /* glsl */ `
  uniform vec3 uLightDir;
  varying vec2 vUv;
  varying float vFade;
  void main() {
    mat4 m = modelMatrix * instanceMatrix;
    vec3 base = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float width = length(m[0].xyz);
    float len = length(m[1].xyz);
    vec3 axis = uLightDir; // shared value is kept unit length
    vec3 mid = base + axis * len * 0.5;
    vec3 side = normalize(cross(axis, cameraPosition - mid));
    vec3 wp = base + axis * (position.y + 0.5) * len + side * position.x * width;
    vUv = uv;
    // Distance from the camera to the nearest point on the shaft's axis.
    float tAxis = clamp(dot(cameraPosition - base, axis), 0.0, len);
    float d = distance(cameraPosition, base + axis * tAxis);
    vFade = smoothstep(3.0, 9.0, d) * (1.0 - smoothstep(28.0, 40.0, d));
    gl_Position = vFade < 0.01 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;

const shaftFragment = /* glsl */ `
  uniform vec3 uLightColor;
  uniform float uTime;
  varying vec2 vUv;
  varying float vFade;
  void main() {
    float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
    float along = smoothstep(0.0, 0.2, vUv.y) * (1.0 - smoothstep(0.3, 0.85, vUv.y));
    float shimmer = 0.85 + 0.15 * sin(uTime * 0.6 + vUv.y * 6.0);
    float a = across * across * along * vFade * shimmer * 0.065;
    // Additive output still goes through colorspace_fragment (linear -> sRGB), so it reads
    // brighter on screen than the small linear constant above suggests.
    gl_FragColor = vec4(uLightColor * a, 1.0);
    #include <colorspace_fragment>
  }
`;

const SHAFT_SPOTS: readonly [number, number, number][] = [
  // x, z, width
  [2.5, 8, 1.0], [-4.5, 12, 0.8], [8, 3, 1.2], [-9, -2, 0.9], [5.5, -9, 0.9], [-12, 9, 1.1]
];

export function buildLightShafts(): THREE.InstancedMesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uLightDir: sharedLighting.uLightDir,
      uLightColor: sharedLighting.uLightColor,
      uTime: sharedLighting.uTime,
    },
    vertexShader: shaftVertex,
    fragmentShader: shaftFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, SHAFT_SPOTS.length);
  const tmp = new THREE.Object3D();
  SHAFT_SPOTS.forEach(([x, z, w], i) => {
    tmp.position.set(x, terrainHeight(x, z), z);
    tmp.scale.set(w, 22, 1);
    tmp.updateMatrix();
    mesh.setMatrixAt(i, tmp.matrix);
  });
  mesh.frustumCulled = false;
  mesh.name = 'lightShafts';
  return mesh;
}

/**
 * Warm dust motes drifting in a box that wraps around the camera, animated entirely in the
 * vertex shader from uTime (no per-frame CPU work). Brighter when backlit by the sun.
 */
const moteVertex = /* glsl */ `
  uniform float uTime;
  uniform vec3 uLightDir;
  uniform vec2 uResolution;
  attribute float aSeed;
  varying float vAlpha;
  const vec3 BOX = vec3(14.0, 4.0, 14.0);
  void main() {
    float t = uTime;
    vec3 drift = vec3(
      sin(t * 0.21 + aSeed * 6.3) * 0.5 + t * 0.06,
      sin(t * 0.17 + aSeed * 11.0) * 0.35 + t * 0.025,
      cos(t * 0.19 + aSeed * 8.1) * 0.5 + t * 0.04);
    vec3 centre = cameraPosition + vec3(0.0, -0.4, 0.0);
    vec3 local = mod(position * BOX + drift - centre + BOX * 0.5, BOX) - BOX * 0.5;
    vec3 wp = centre + local;
    vec3 e = abs(local) / (BOX * 0.5);
    float edge = 1.0 - smoothstep(0.7, 1.0, max(max(e.x, e.y), e.z));
    vec4 mv = viewMatrix * vec4(wp, 1.0);
    float depth = -mv.z;
    float back = pow(max(dot(normalize(wp - cameraPosition), uLightDir), 0.0), 2.0);
    float twinkle = 0.65 + 0.35 * sin(t * 1.3 + aSeed * 40.0);
    vAlpha = edge * twinkle * (0.35 + 0.9 * back) * smoothstep(0.4, 1.2, depth);
    gl_PointSize = clamp(5.0 * (uResolution.y / 768.0) / max(depth, 0.1), 1.0, 4.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const moteFragment = /* glsl */ `
  uniform vec3 uLightColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = (1.0 - smoothstep(0.1, 0.5, d)) * vAlpha;
    // Additive output goes through colorspace_fragment, so it reads brighter than linear a.
    gl_FragColor = vec4(uLightColor * vec3(1.0, 0.9, 0.7) * a, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Dust motes on Medium and High. */
export const MOTE_COUNT = 260;
/** Ultra's 1.5x; built at this size and trimmed with a draw range. */
export const MOTE_MAX = 390;

export function buildDustMotes(count = MOTE_MAX): THREE.Points {
  const rng = mulberry32(4242);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = rng();
    pos[i * 3 + 1] = rng();
    pos[i * 3 + 2] = rng();
    seed[i] = rng();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: sharedLighting.uTime,
      uLightDir: sharedLighting.uLightDir,
      uLightColor: sharedLighting.uLightColor,
      uResolution: sharedLighting.uResolution,
    },
    vertexShader: moteVertex,
    fragmentShader: moteFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.name = 'dustMotes';
  return pts;
}

export interface Atmosphere {
  /** Light shafts, dust motes and falling leaves. */
  group: THREE.Group;
  /** `on` false hides them all; `extra` draws Ultra's 1.5x motes and falling leaves. */
  setLevel(on: boolean, extra: boolean): void;
}

/** Atmosphere extras grouped so a preset can switch them off or up in one place. */
export function buildAtmosphere(): Atmosphere {
  const group = new THREE.Group();
  group.name = 'atmosphere';
  const motes = buildDustMotes();
  const falling = buildFallingLeaves();
  group.add(buildLightShafts(), motes, falling.mesh);
  return {
    group,
    setLevel(on, extra) {
      group.visible = on;
      motes.geometry.setDrawRange(0, extra ? MOTE_MAX : MOTE_COUNT);
      falling.setCount(extra ? FALLING_MAX : FALLING_COUNT);
    },
  };
}
