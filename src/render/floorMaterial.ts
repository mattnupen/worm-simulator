import * as THREE from 'three';
import { TERRAIN_GLSL } from '../surface/terrain';
import { sharedLighting, PAINTED_VERTEX_GLSL, PAINTED_LIGHT_GLSL, GRADE_GLSL } from './paintedMaterial';
import { groundUniforms, SPINE_POINTS } from './groundUniforms';
import { TRAIL_GROUND_GLSL } from './leafGlsl';
import { glslFloat as f } from './glslNumber';

/**
 * Side of the floor patch (m), centred on the middle of the body: half the body (1.65) plus what
 * the hole shows round it, at a slant, either way. Small, as even its rejected pixels cost.
 */
export const FLOOR_SIZE = 7;
/** Quads per side: 0.25 m cells, fine enough that the patch follows the floor within a millimetre. */
export const FLOOR_SEGS = 28;
/** The spine point the patch centres on (of SPINE_POINTS, head first): the middle of the body. */
export const FLOOR_CENTRE = 7;
const CELL = FLOOR_SIZE / FLOOR_SEGS;
/**
 * How much of the light reaches the floor under 2 to 5 cm of leaves: the pocket the worm travels
 * in reads as shaded, damp and deep.
 */
export const FLOOR_LIGHT = 0.6;

/**
 * The F layer's top round the worm (V2 spec 5.1 and 8.2; Matt's photos IMG_2427 and IMG_2428):
 * dark brown to black, wet, matted fragments of last years' leaves, white fungal threads, a sprig
 * of moss here and there, and the worm's fresh trail darker still. One square patch of FLOOR_SIZE
 * that the vertex shader keeps under the middle of the body (uSpine's FLOOR_CENTRE point, snapped
 * to its cells, so nothing swims), each vertex
 * on the floor (TERRAIN_GLSL, the twin of floorHeight). It is drawn after the litter top, so only
 * what the hole over the worm shows is shaded: everywhere else the depth test rejects it.
 * Position attribute: (x, z) in cells from the patch's centre (y unused).
 */
const vertexShader = /* glsl */ `
  uniform vec3 uSpine[${SPINE_POINTS}];
  uniform vec3 uLightDir;
  uniform vec3 uLightColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec3 vPosW;
  varying vec3 vNoise;
  varying vec4 vFog;
  ${PAINTED_VERTEX_GLSL}
  ${TERRAIN_GLSL}
  void main() {
    vec2 xz = floor(uSpine[${FLOOR_CENTRE}].xz / ${f(CELL)} + 0.5) * ${f(CELL)} + position.xz * ${f(CELL)};
    vec3 wp = vec3(xz.x, terrainHeight(xz), xz.y);
    vPosW = wp;
    vec3 toCam = cameraPosition - wp;
    float dist = length(toCam);
    vNoise = worldBrushCoord(wp, dist);
    vFog = distanceHaze(toCam, dist);
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
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
  varying vec3 vPosW;
  varying vec3 vNoise;
  varying vec4 vFog;
  ${PAINTED_LIGHT_GLSL}
  ${GRADE_GLSL}
  ${TRAIL_GROUND_GLSL}
  void main() {
    // Two fetches of the shared noise: leaf-fragment plates (about 2 cm) and fine detail.
    vec4 big = texture2D(uNoise, vPosW.xz * 0.11);
    vec4 fine = texture2D(uNoise, vPosW.xz * 0.47 + 0.37);
    // Matted fragments: plates of near-black and dark brown with darker seams between them.
    float plate = smoothstep(0.38, 0.62, big.r + (fine.g - 0.5) * 0.35);
    vec3 col = mix(vec3(0.035, 0.022, 0.013), vec3(0.11, 0.065, 0.032), plate);
    col *= 0.7 + 0.6 * fine.b;
    float seam = 1.0 - smoothstep(0.0, 0.06, abs(big.r + (fine.g - 0.5) * 0.35 - 0.5));
    col *= 1.0 - 0.45 * seam;
    // White fungal threads: thin ridges of the stroke channel, only in some patches.
    float thread = (1.0 - smoothstep(0.0, 0.025, abs(fine.g - 0.5))) * smoothstep(0.62, 0.8, big.a);
    col = mix(col, vec3(0.62, 0.58, 0.48), thread * 0.7);
    // A sprig of moss creeping over here and there.
    float moss = smoothstep(0.74, 0.8, fine.b) * smoothstep(0.45, 0.65, big.g);
    col = mix(col, vec3(0.16, 0.24, 0.05), moss);
    // The worm's fresh trail: darker, freshly turned.
    col *= trailShade(vPosW.xz);
    vec3 n = vec3(0.0, 1.0, 0.0);
    vec3 v = normalize(cameraPosition - vPosW);
    float b = (fine.g - 0.5) * 0.3;
    vec3 lit = paintedLight(col, n, v, b, 1.0) * ${f(FLOOR_LIGHT)};
    // Wet: a soft sheen on the plates.
    vec3 h = normalize(uLightDir + v);
    float spec = pow(max(dot(normalize(n + vec3(fine.r - 0.5, 0.0, fine.a - 0.5) * 0.6), h), 0.0), 24.0);
    lit += uLightColor * spec * 0.12 * plate;
    lit = mix(lit, vFog.rgb, vFog.a);
    gl_FragColor = vec4(paintedGrade(lit), 1.0);
    #include <colorspace_fragment>
  }
`;

export function createFloorMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...sharedLighting,
      uSpine: groundUniforms.uSpine,
      uDisturbTrail: groundUniforms.uDisturbTrail,
      uDistOrigin: groundUniforms.uDistOrigin,
      uDistFade: groundUniforms.uDistFade,
      uLeafReact: groundUniforms.uLeafReact,
    },
    vertexShader,
    fragmentShader,
  });
}
