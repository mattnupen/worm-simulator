import * as THREE from 'three';
import {
  sharedLighting, PAINTED_VERTEX_GLSL, PAINTED_LIGHT_GLSL, GRADE_GLSL,
} from '../render/paintedMaterial';

/**
 * Earthworm skin on the shared painted lighting: fine annuli (ring furrows), darker mauve back
 * and paler pink belly, a wet double specular, and warm subsurface glow at the terminator and
 * on backlit edges. Two fetches of the shared noise (body-space skin strokes, world-space
 * canopy dapple), no other textures.
 *
 * Attributes: position, normal, aTangent (spine direction toward the tail), aBody (x = body
 * coordinate 0 head .. 1 tail, y = around 0..1 with 0 on the dorsal midline).
 */
const vertexShader = /* glsl */ `
  uniform vec3 uLightDir;
  uniform vec3 uLightColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  attribute vec3 aTangent;
  attribute vec2 aBody;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vTanW;
  varying vec2 vBody;
  varying vec3 vNoise;
  varying vec4 vFog;
  ${PAINTED_VERTEX_GLSL}
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    vNormalW = mat3(modelMatrix) * normal;
    vTanW = mat3(modelMatrix) * aTangent;
    vBody = aBody;
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
  uniform vec3 uDorsal;
  uniform vec3 uVentral;
  uniform vec3 uAnterior;
  uniform vec3 uTail;
  uniform vec3 uVessel;
  uniform vec3 uSss;
  uniform float uAnnuli;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vTanW;
  varying vec2 vBody;
  varying vec3 vNoise;
  varying vec4 vFog;
  ${PAINTED_LIGHT_GLSL}
  ${GRADE_GLSL}

  const float TAU = 6.2831853;

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 tg = normalize(vTanW);
    vec3 v = normalize(cameraPosition - vPosW);
    float m = vBody.x;
    float around = vBody.y;

    // Annuli: fine ring furrows. Faded out before they get small enough to alias.
    float a = m * uAnnuli;
    float detail = 1.0 - smoothstep(0.14, 0.36, fwidth(a));
    float furrow = smoothstep(0.55, 1.0, cos(TAU * a)) * detail;
    // The glints use a gentler ring tilt, so they run as streaks instead of one dot per annulus.
    vec3 nSmooth = normalize(n - tg * (sin(TAU * a) * 0.03 * detail));
    n = normalize(n - tg * (sin(TAU * a) * 0.16 * detail));

    // Skin strokes ride on the body (so they never swim); dapple comes from the world.
    vec4 sk = texture2D(uNoise, vec2(around, m * 3.0));
    vec4 wz = texture2D(uNoise, vNoise.xy);
    float b = (sk.g * 0.6 + sk.b * 0.4 - 0.5) * 0.55;
    float dapple = dappleLight(mix(0.5, wz.r, vNoise.z), b, 1.0);

    // Colour: darker mauve-brown back, pale pink belly, pinker darker front, paler tail.
    float cosA = cos(TAU * around);
    float dorsal = smoothstep(-0.35, 0.8, cosA);
    vec3 col = mix(uVentral, uDorsal, dorsal);
    col = mix(col, uAnterior, (1.0 - smoothstep(0.02, 0.38, m)) * (0.3 + 0.45 * dorsal));
    col = mix(col, uTail, smoothstep(0.62, 1.0, m) * 0.55);
    // Dorsal blood vessel: a faint darker red line down the back.
    float mid = min(around, 1.0 - around);
    float vessel = (1.0 - smoothstep(0.006, 0.02, mid)) * detail * smoothstep(0.05, 0.15, m);
    col = mix(col, uVessel, vessel * 0.45);
    col *= (1.0 - furrow * 0.16) * mix(0.9, 1.1, sk.r) * (1.0 + b * 0.4);

    vec3 lit = paintedLight(col, n, v, b, dapple);

    // Subsurface: warm light bleeding past the terminator, glowing through backlit edges.
    float ndl = dot(n, uLightDir);
    float wrap = smoothstep(-0.55, 0.0, ndl) * (1.0 - smoothstep(0.0, 0.4, ndl));
    float edge = 1.0 - abs(dot(n, v));
    float back = max(dot(-v, uLightDir), 0.0);
    lit += uSss * uLightColor * (wrap * 0.3 + back * back * edge * edge * 0.7) * dapple;

    // Wet sheen: a crisp painted glint plus a broad soft one. Moisture comes in patches that
    // ride on the body, so the glints cluster into soft wet streaks.
    vec3 h = normalize(uLightDir + v);
    float ndh = max(dot(nSmooth, h), 0.0);
    float lightOn = smoothstep(-0.05, 0.25, ndl) * dapple;
    float moist = smoothstep(0.3, 0.7, sk.g * 0.75 + sk.r * 0.25);
    float tight = smoothstep(0.35, 0.9, pow(ndh, 64.0)) * mix(0.15, 1.0, moist);
    float broad = pow(max(dot(n, h), 0.0), 16.0);
    float wet = 0.65 + 0.5 * moist + 0.2 * sk.b;
    lit += uLightColor * (tight * 0.7 + broad * 0.2) * lightOn * wet;
    // Moist skin mirrors the bright canopy sky: a soft sheen that slides over the annuli,
    // stronger at grazing angles.
    float fres = 1.0 - max(dot(n, v), 0.0);
    vec3 rv = reflect(-v, nSmooth);
    float skyGlint = smoothstep(0.35, 0.85, rv.y) * (0.06 + 0.3 * fres * fres);
    lit += (uSkyColor + uLightColor * 0.3) * skyGlint * wet;

    lit = mix(lit, vFog.rgb, vFog.a);
    gl_FragColor = vec4(paintedGrade(lit), 1.0);
    #include <colorspace_fragment>
  }
`;

export function createWormMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...sharedLighting,
      uDorsal: { value: new THREE.Color('#7a4a4f') },
      uVentral: { value: new THREE.Color('#d6a698') },
      uAnterior: { value: new THREE.Color('#8e3f50') },
      uTail: { value: new THREE.Color('#ad8a80') },
      uVessel: { value: new THREE.Color('#5a1a28') },
      uSss: { value: new THREE.Color('#ff6a4a') },
      uAnnuli: { value: 120 },
    },
    vertexShader,
    fragmentShader,
  });
}

const shadowVertex = /* glsl */ `
  attribute vec2 aShade;
  varying vec2 vShade;
  void main() {
    vShade = aShade;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;

const shadowFragment = /* glsl */ `
  uniform vec3 uTint;
  varying vec2 vShade;
  void main() {
    // x: 0 at the ribbon edges, 1 on the centre line; y: strength along the body.
    float a = smoothstep(0.0, 1.0, vShade.x) * vShade.y;
    gl_FragColor = vec4(mix(vec3(1.0), uTint, a), 1.0);
  }
`;

/** Soft contact shadow: multiplies (darkens) what is already drawn beneath the worm. */
export function createWormShadowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    // Display-space multiplier (no colour-space conversion on a multiply).
    uniforms: { uTint: { value: new THREE.Vector3(0.38, 0.32, 0.33) } },
    vertexShader: shadowVertex,
    fragmentShader: shadowFragment,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.SrcColorFactor,
  });
}
