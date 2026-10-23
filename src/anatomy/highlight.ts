import * as THREE from 'three';

/**
 * The selected part glows, as in a medical atlas. Light blue, not BioDigital's yellow, which would
 * read as a nerve here. Every lesson material gets a cylinder test in world space (a line from A
 * to B and a radius, shared by all), switched on per material. Selecting changes uniforms only, so nothing
 * recompiles.
 */
export const HIGHLIGHT = {
  hlA: { value: new THREE.Vector3() },
  hlB: { value: new THREE.Vector3() },
  hlRadius: { value: 1 },
};

const GLOW = 'vec3(0.25, 0.75, 1.0)';

/** Adds the highlight to a material, keeping any shader change it already has. */
export function addHighlight(m: THREE.Material): void {
  const on = { value: 0 };
  m.userData.hlOn = on;
  const before = m.onBeforeCompile.bind(m);
  const key = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    shader.uniforms.hlA = HIGHLIGHT.hlA;
    shader.uniforms.hlB = HIGHLIGHT.hlB;
    shader.uniforms.hlRadius = HIGHLIGHT.hlRadius;
    shader.uniforms.hlOn = on;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vHlPos;\nvoid main() {')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvHlPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 hlA;\nuniform vec3 hlB;\nuniform float hlRadius;\nuniform float hlOn;\nvarying vec3 vHlPos;\nvoid main() {')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 hlD = hlB - hlA;
        float hlRaw = dot(vHlPos - hlA, hlD) / max(dot(hlD, hlD), 1e-6);
        float hlT = clamp(hlRaw, 0.0, 1.0);
        // A cylinder with flat ends (a point when A = B): the glow stops where the organ does.
        float hlEnds = hlRaw == hlT ? 1.0 : 0.0;
        float hlK = hlOn * hlEnds * (1.0 - smoothstep(hlRadius * 0.8, hlRadius, distance(vHlPos, hlA + hlD * hlT)));
        diffuseColor.rgb = mix(diffuseColor.rgb, ${GLOW}, 0.6 * hlK);`);
  };
  m.customProgramCacheKey = () => `${key()}-hl`;
}

/** Turns the glow on or off for one material. */
export function setHighlight(m: THREE.Material, on: boolean): void {
  const u = m.userData.hlOn as { value: number } | undefined;
  if (u) u.value = on ? 1 : 0;
}
