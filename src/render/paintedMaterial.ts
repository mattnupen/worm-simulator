import * as THREE from 'three';

/** Shared by reference across every painted material. */
export const sharedLighting = {
  uLightDir: { value: new THREE.Vector3(0.45, 0.8, 0.35).normalize() },
  uLightColor: { value: new THREE.Color('#ffe2b0') },
  uSkyColor: { value: new THREE.Color('#ffd9a0') },
  uGroundColor: { value: new THREE.Color('#5a3d26') },
  uRimColor: { value: new THREE.Color('#ffb347') },
  uRim: { value: 1 },
};

const vertexShader = /* glsl */ `
  uniform vec3 uColor;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vColor;
  void main() {
    mat4 m = modelMatrix;
    vec3 col = uColor;
    #ifdef USE_INSTANCING
      m = modelMatrix * instanceMatrix;
    #endif
    #ifdef USE_INSTANCING_COLOR
      col *= instanceColor;
    #endif
    vec4 wp = m * vec4(position, 1.0);
    vPosW = wp.xyz;
    vNormalW = normalize(mat3(m) * normal);
    vColor = col;
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
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vColor;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
          mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
          mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }

  void main() {
    vec3 n = normalize(vNormalW);
    if (!gl_FrontFacing) n = -n;
    float ndl = dot(n, normalize(uLightDir));
    float brush = noise(vPosW * 6.0) * 0.5 + noise(vPosW * 17.0) * 0.25;
    float band = smoothstep(0.0, 0.15, ndl + (brush - 0.375) * uBrush) * 0.55
               + smoothstep(0.45, 0.6, ndl) * 0.25;
    vec3 hemi = mix(uGroundColor, uSkyColor, n.y * 0.5 + 0.5);
    vec3 lit = vColor * (hemi * 0.55 + uLightColor * band);
    vec3 v = normalize(cameraPosition - vPosW);
    float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * uRim;
    lit += uRimColor * rim * 0.6;
    lit *= 0.92 + brush * 0.16;
    gl_FragColor = vec4(lit, 1.0);
    #include <colorspace_fragment>
  }
`;

export interface PaintedOptions {
  color: THREE.ColorRepresentation;
  /** 0 = clean bands, 1 = strong brush breakup. */
  brush?: number;
  doubleSide?: boolean;
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
    side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
}

export function setRimLight(on: boolean): void {
  sharedLighting.uRim.value = on ? 1 : 0;
}
