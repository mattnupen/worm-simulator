import * as THREE from 'three';

/**
 * The anatomy model's materials: physically based, wet and slightly glossy like living tissue in a
 * medical atlas. Colour comes from each mesh's vertex colours; these set how the surface reflects.
 */
export interface AnatomyMaterials {
  skin: THREE.MeshPhysicalMaterial;
  skinGhost: THREE.MeshPhysicalMaterial;
  wall: THREE.MeshPhysicalMaterial;
  setae: THREE.MeshPhysicalMaterial;
  gut: THREE.MeshPhysicalMaterial;
  blood: THREE.MeshPhysicalMaterial;
  nerve: THREE.MeshPhysicalMaterial;
  repro: THREE.MeshPhysicalMaterial;
  reproSac: THREE.MeshPhysicalMaterial;
  nephridia: THREE.MeshPhysicalMaterial;
  muscle: THREE.MeshPhysicalMaterial;
  septa: THREE.MeshPhysicalMaterial;
  /** The game's skin: one plain lit material, cheap on Chromebooks. */
  skinGame: THREE.MeshStandardMaterial;
}

const wet = (p: THREE.MeshPhysicalMaterialParameters): THREE.MeshPhysicalMaterial =>
  new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.25, ...p });

/**
 * A cheap stand-in for light scattering under living skin: where the surface turns away from the
 * viewer, a warm red glow shows through (thin tissue lit from behind), and the shadowed side never
 * goes fully grey. No extra passes; a few instructions per pixel.
 */
export function addScatter(m: THREE.MeshPhysicalMaterial, tint: string, rim: number, fill: number, micro = 0): THREE.MeshPhysicalMaterial {
  const color = new THREE.Color(tint);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.scatterTint = { value: color };
    if (micro > 0) {
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec3 vObjPos;\nvoid main() {')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `uniform vec3 scatterTint;\n${micro > 0 ? MICRO_GLSL : ''}\nvoid main() {`)
      .replace('#include <normal_fragment_maps>', micro > 0 ? `#include <normal_fragment_maps>
        // Fine surface texture (tiny folds and pores) breaks up the base highlight; the wet
        // clear coat above it stays smooth, so the highlight is tight and glossy.
        normal = normalize(normal + ${micro.toFixed(3)} * microBump(vObjPos * vec3(7.0, 11.0, 11.0)));` : '#include <normal_fragment_maps>')
      .replace('#include <opaque_fragment>', `
        float scatterRim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.2);
        outgoingLight += scatterTint * diffuseColor.rgb * (${rim.toFixed(3)} * scatterRim + ${fill.toFixed(3)});
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => `scatter-${tint}-${rim}-${fill}-${micro}`;
  return m;
}

/** Value noise in object space, turned into a view-space wobble for the normal. */
const MICRO_GLSL = `
varying vec3 vObjPos;
float microHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float microNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(microHash(i), microHash(i + vec3(1, 0, 0)), f.x), mix(microHash(i + vec3(0, 1, 0)), microHash(i + vec3(1, 1, 0)), f.x), f.y);
  float b = mix(mix(microHash(i + vec3(0, 0, 1)), microHash(i + vec3(1, 0, 1)), f.x), mix(microHash(i + vec3(0, 1, 1)), microHash(i + vec3(1, 1, 1)), f.x), f.y);
  return mix(a, b, f.z);
}
vec3 microBump(vec3 p) {
  vec3 n = vec3(microNoise(p), microNoise(p + 17.1), microNoise(p + 31.7)) - 0.5;
  n += 0.5 * (vec3(microNoise(p * 2.7), microNoise(p * 2.7 + 5.3), microNoise(p * 2.7 + 9.1)) - 0.5);
  return mat3(viewMatrix) * n;
}`;

export function createMaterials(): AnatomyMaterials {
  return {
    skin: addScatter(wet({
      roughness: 0.68, clearcoat: 0.45, clearcoatRoughness: 0.2, sheen: 0.12, sheenRoughness: 0.5,
      sheenColor: new THREE.Color('#c06060'), iridescence: 0.55, iridescenceIOR: 1.38,
      iridescenceThicknessRange: [260, 520],
    }), '#ff5a3c', 1.05, 0.14, 0.22),
    skinGhost: wet({
      transparent: true, opacity: 0.2, depthWrite: false, roughness: 0.45, clearcoat: 0.4, side: THREE.FrontSide,
    }),
    wall: wet({ roughness: 0.55, clearcoat: 0.5, side: THREE.FrontSide }),
    setae: wet({ roughness: 0.3, clearcoat: 0.8 }),
    gut: addScatter(wet({ roughness: 0.55, clearcoat: 0.5, clearcoatRoughness: 0.2 }), '#ff8a60', 0.5, 0.08, 0.12),
    blood: addScatter(wet({ roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }), '#ff3030', 0.6, 0.05),
    nerve: wet({ roughness: 0.42, clearcoat: 0.7 }),
    repro: addScatter(wet({ roughness: 0.5, clearcoat: 0.55, sheen: 0.4, sheenColor: new THREE.Color('#fff4e0') }), '#ffd0a0', 0.5, 0.08),
    reproSac: wet({ roughness: 0.5, clearcoat: 0.4 }),
    nephridia: wet({ roughness: 0.4, clearcoat: 0.8 }),
    muscle: wet({ roughness: 0.55, clearcoat: 0.5, side: THREE.DoubleSide }),
    skinGame: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }),
    septa: wet({ roughness: 0.35, clearcoat: 0.7, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }),
  };
}
