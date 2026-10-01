import * as THREE from 'three';
import { GRADE_GLSL, HAZE_GLSL, sharedLighting } from './paintedMaterial';

/** Must stay inside the camera far plane (120) from anywhere in the world (corners ~27 out). */
export const SKY_RADIUS = 80;

// Everything here is smooth, so it is evaluated per vertex on a fairly dense dome; each sky
// pixel pays only the grade and the output transfer. Measured under software GL, occluded
// sky pixels are still shaded, so the dome is a cap that stops just below the horizon
// (hidden by the berm) instead of a full sphere around the camera.
const vertexShader = /* glsl */ `
  uniform vec3 uLightDir;
  uniform vec3 uLightColor;
  uniform vec3 uFogColor;
  uniform vec3 uSkyTop;
  varying vec3 vSky;
  ${HAZE_GLSL}
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec3 dir = normalize(wp.xyz - cameraPosition);
    float h = max(dir.y, 0.0);
    // Warm haze band low down, easing into a soft blue-teal overhead, plus a soft sun glow.
    vec3 col = mix(hazeColor(dir), uSkyTop, pow(smoothstep(0.0, 0.75, h), 0.7));
    float s = max(dot(dir, uLightDir), 0.0);
    vSky = col + uLightColor * pow(s, 16.0) * 0.3;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec2 uResolution;
  varying vec3 vSky;
  ${GRADE_GLSL}
  void main() {
    gl_FragColor = vec4(paintedGrade(vSky), 1.0);
    #include <colorspace_fragment>
  }
`;

/** The dome reaches this far below the horizon (radians); the berm hides its rim. */
const BELOW_HORIZON = 0.14;

export function buildSky(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uLightDir: sharedLighting.uLightDir,
      uLightColor: sharedLighting.uLightColor,
      uFogColor: sharedLighting.uFogColor,
      uResolution: sharedLighting.uResolution,
      uSkyTop: { value: new THREE.Color('#92b3ba') },
    },
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 48, 18, 0, Math.PI * 2, 0, Math.PI / 2 + BELOW_HORIZON), mat);
  sky.name = 'sky';
  // Drawn after the opaque world: it never writes depth, and GPUs with early-z skip covered pixels.
  sky.renderOrder = 10;
  sky.frustumCulled = false;
  return sky;
}
