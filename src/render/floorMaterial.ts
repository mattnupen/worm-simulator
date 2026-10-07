import * as THREE from 'three';
import { TERRAIN_GLSL } from '../surface/terrain';
import { sharedLighting, PAINTED_VERTEX_GLSL, PAINTED_LIGHT_GLSL, GRADE_GLSL } from './paintedMaterial';
import { groundUniforms, SPINE_POINTS } from './groundUniforms';
import { TRAIL_GROUND_GLSL } from './leafGlsl';
import { glslFloat as f } from './glslNumber';
import { OCC_REACH, OCC_SEGMENTS } from './occlusion';

/**
 * Side of the floor's grid (m), centred on the middle of the body: half the body (1.76 to the tail)
 * plus FLOOR_KEEP, and a cell for the snap, either way. Only the cells the hole can show draw.
 */
export const FLOOR_SIZE = 9.5;
/** Quads per side: 0.25 m cells, fine enough that the patch follows the floor within a millimetre. */
export const FLOOR_SEGS = 38;
/** The spine point the patch centres on (of SPINE_POINTS, head first): the middle of the body. */
export const FLOOR_CENTRE = 7;
export const FLOOR_CELL = FLOOR_SIZE / FLOOR_SEGS;
/**
 * How far from the spine (m, along the floor) the hole over the worm can show the floor: 2.16 at
 * most, measured by casting rays through the hole (litter 0.2 to 1.2 deep over the real floor at
 * eight places, the body straight, curved and curled, the camera at full reach or craned, from
 * behind or side-on), plus a margin (tests/unit/floorCoverage.test.ts). Even the floor's
 * depth-rejected pixels cost, so a cell whose centre lies farther than this plus half its diagonal
 * from the spine draws nothing; nor does one the hole cannot show on screen (floorCellShown).
 */
export const FLOOR_REACH = 2.4;
export const FLOOR_KEEP = FLOOR_REACH + FLOOR_CELL * Math.SQRT1_2;
/** The floor's slope stays under this anywhere in the world (0.17 at most: tests/unit/floorPatch.test.ts). */
export const FLOOR_SLOPE = 0.25;
/**
 * A cell (its corners on the floor, its triangles between them) lies within this (m) of its centre
 * on the floor: half its diagonal, tilted by the steepest slope, plus a hair. A cell whose ball of
 * this radius is seen wholly outside the hole draws nothing: farther than OCC_REACH, as
 * occlusion() measures it, from every segment of the body (uOccSeg), no pixel of the top of the
 * litter fades, so none shows the floor.
 */
export const FLOOR_CELL_BALL = FLOOR_CELL * Math.SQRT1_2 * Math.hypot(1, FLOOR_SLOPE) + 0.01;
const CELL = FLOOR_CELL;
/**
 * How much of the light reaches the floor under 2 to 5 cm of leaves: the pocket the worm travels
 * in reads as shaded, damp and deep.
 */
export const FLOOR_LIGHT = 0.6;

/**
 * floorCellShown(c): whether the floor's cell centred at world (x, z) = c is drawn (TS twin:
 * floorCellShown in floorPatch.ts). Needs uSpine, uOccSeg, uOccCount, viewMatrix and
 * TERRAIN_GLSL declared.
 */
export const FLOOR_CELL_GLSL = /* glsl */ `
  float floorSpineDistance(vec2 p) {
    float d2 = 1e9;
    for (int i = 0; i < ${SPINE_POINTS - 1}; i++) {
      vec2 a = uSpine[i].xz;
      vec2 ab = uSpine[i + 1].xz - a;
      vec2 q = p - a - ab * clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
      d2 = min(d2, dot(q, q));
    }
    return sqrt(d2);
  }
  // Whether the hole can show any of the cell centred at c (floorCellShown in floorPatch.ts is the
  // twin): near the spine, and its ball, as seen, within OCC_REACH of a segment of the body in
  // occlusion()'s measure (tan-space miss times the segment's depth), so the top may fade there.
  bool floorCellShown(vec2 c) {
    if (floorSpineDistance(c) > ${f(FLOOR_KEEP)}) return false;
    vec4 p = viewMatrix * vec4(c.x, terrainHeight(c), c.y, 1.0);
    float near = -p.z - ${f(FLOOR_CELL_BALL)};
    if (near < 0.05) return true;
    vec2 t = p.xy / -p.z;
    float r = ${f(FLOOR_CELL_BALL)} / near;
    for (int i = 0; i < ${OCC_SEGMENTS}; i++) {
      if (i >= uOccCount) break;
      vec4 a = uOccSeg[2 * i];
      vec4 b = uOccSeg[2 * i + 1];
      vec2 ab = b.xy - a.xy;
      vec2 q = t - a.xy - ab * clamp(dot(t - a.xy, ab) * a.w, 0.0, 1.0);
      if ((length(q) - r) / max(a.z, b.z) < ${f(OCC_REACH)}) return true;
    }
    return false;
  }
`;

/**
 * The F layer's top round the worm (V2 spec 5.1 and 8.2; Matt's photos IMG_2427 and IMG_2428):
 * dark brown to black, wet, matted fragments of last years' leaves, white fungal threads, a sprig
 * of moss here and there, and the worm's fresh trail darker still. A square grid of FLOOR_SIZE
 * that the vertex shader keeps under the middle of the body (uFloorBase: uSpine's FLOOR_CENTRE
 * point, snapped to its cells on the CPU, so nothing swims), each vertex on the floor
 * (TERRAIN_GLSL, the twin of floorHeight); of it, only the cells the hole over the worm can show
 * draw: the CPU lists them in the index buffer (floorPatch.ts updateFloorPatch), so the vertex
 * shader runs for them alone, and the shader checks each again (FLOOR_CELL_GLSL).
 * It is drawn after the litter top, so only what the hole shows is shaded: everywhere else the
 * depth test rejects it.
 * Attributes: position (x, z), in cells from the grid's centre (y unused); aCell, the centre of
 * the vertex's cell, in cells from the grid's centre.
 */
const vertexShader = /* glsl */ `
  uniform vec3 uSpine[${SPINE_POINTS}];
  uniform vec4 uOccSeg[${OCC_SEGMENTS * 2}];
  uniform int uOccCount;
  uniform vec2 uFloorBase;
  uniform vec3 uLightDir;
  uniform vec3 uLightColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec3 vPosW;
  varying vec3 vNoise;
  varying vec4 vFog;
  attribute vec2 aCell;
  ${PAINTED_VERTEX_GLSL}
  ${TERRAIN_GLSL}
  ${FLOOR_CELL_GLSL}
  void main() {
    vec2 base = uFloorBase;
    if (!floorCellShown(base + aCell * ${f(CELL)})) {
      // The hole cannot show it: all four corners of the cell land on one point outside the
      // view, so it draws nothing.
      vPosW = vec3(0.0);
      vNoise = vec3(0.0);
      vFog = vec4(0.0);
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    vec2 xz = base + position.xz * ${f(CELL)};
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
      uOccSeg: groundUniforms.uOccSeg,
      uOccCount: groundUniforms.uOccCount,
      uFloorBase: { value: new THREE.Vector2() },
      uDisturbTrail: groundUniforms.uDisturbTrail,
      uDistOrigin: groundUniforms.uDistOrigin,
      uDistFade: groundUniforms.uDistFade,
      uLeafReact: groundUniforms.uLeafReact,
    },
    vertexShader,
    fragmentShader,
  });
}
