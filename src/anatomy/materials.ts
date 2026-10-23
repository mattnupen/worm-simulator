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
export function addScatter(m: THREE.MeshPhysicalMaterial, tint: string, rim: number, fill: number): THREE.MeshPhysicalMaterial {
  const color = new THREE.Color(tint);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.scatterTint = { value: color };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `uniform vec3 scatterTint;\nvoid main() {`)
      .replace('#include <opaque_fragment>', `
        float scatterRim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.2);
        outgoingLight += scatterTint * diffuseColor.rgb * (${rim.toFixed(3)} * scatterRim + ${fill.toFixed(3)});
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => `scatter-${tint}-${rim}-${fill}`;
  return m;
}

export function createMaterials(): AnatomyMaterials {
  return {
    skin: addScatter(wet({
      roughness: 0.62, clearcoat: 0.3, clearcoatRoughness: 0.38, sheen: 0.2, sheenRoughness: 0.5,
      sheenColor: new THREE.Color('#c06060'), iridescence: 0.35, iridescenceIOR: 1.35,
      iridescenceThicknessRange: [180, 420],
    }), '#ff5a3c', 0.9, 0.12),
    skinGhost: wet({
      transparent: true, opacity: 0.2, depthWrite: false, roughness: 0.45, clearcoat: 0.4, side: THREE.FrontSide,
    }),
    wall: wet({ roughness: 0.55, clearcoat: 0.5, side: THREE.FrontSide }),
    setae: wet({ roughness: 0.3, clearcoat: 0.8 }),
    gut: addScatter(wet({ roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.32 }), '#ff8a60', 0.5, 0.08),
    blood: addScatter(wet({ roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }), '#ff3030', 0.6, 0.05),
    nerve: wet({ roughness: 0.42, clearcoat: 0.7 }),
    repro: addScatter(wet({ roughness: 0.5, clearcoat: 0.55, sheen: 0.4, sheenColor: new THREE.Color('#fff4e0') }), '#ffd0a0', 0.5, 0.08),
    reproSac: wet({ roughness: 0.5, clearcoat: 0.4, transparent: true, opacity: 0.65, depthWrite: false }),
    nephridia: wet({ roughness: 0.4, clearcoat: 0.8 }),
    muscle: wet({ roughness: 0.55, clearcoat: 0.5, side: THREE.DoubleSide }),
    skinGame: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }),
    septa: wet({ roughness: 0.35, clearcoat: 0.7, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide }),
  };
}
