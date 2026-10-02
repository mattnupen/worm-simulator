import * as THREE from 'three';
import { DIST_N, DIST_CELL, packDisturbance, type DisturbanceMap } from '../surface/disturbance';

// An empty map packs to all zeros.
const distBytes = new Uint8Array(DIST_N * DIST_N * 4);
const distTexture = new THREE.DataTexture(distBytes, DIST_N, DIST_N, THREE.RGBAFormat, THREE.UnsignedByteType);
distTexture.magFilter = THREE.LinearFilter;
distTexture.minFilter = THREE.LinearFilter;
distTexture.needsUpdate = true;

/**
 * Uniforms shared by reference by every leaf material (and the near clutter): where the worm
 * is, and the disturbance map around it. Updated once per rendered frame.
 */
export const groundUniforms = {
  /** The worm's head as rendered (interpolated). */
  uFocus: { value: new THREE.Vector3() },
  /** uFocus snapped to the 1 m grid: the centre the near-worm layers wrap around. */
  uWrapCentre: { value: new THREE.Vector2() },
  /** The disturbance map, packed by packDisturbance. */
  uDisturb: { value: distTexture },
  /** World x, z of the disturbance grid's corner. */
  uDistOrigin: { value: new THREE.Vector2(-DIST_N * DIST_CELL / 2, -DIST_N * DIST_CELL / 2) },
  /** 1 when leaves react to the worm; 0 (Low) skips every disturbance fetch, without a recompile. */
  uLeafReact: { value: 1 },
};

/** Leaf reaction on or off (from the preset). */
export function setLeafReaction(on: boolean): void {
  groundUniforms.uLeafReact.value = on ? 1 : 0;
}

export function setFocus(x: number, y: number, z: number): void {
  groundUniforms.uFocus.value.set(x, y, z);
  groundUniforms.uWrapCentre.value.set(Math.round(x), Math.round(z));
}

/** The one per-frame texture upload: 16 KB into the same texture, no reallocation. */
export function uploadDisturbance(m: DisturbanceMap): void {
  packDisturbance(m, distBytes);
  distTexture.needsUpdate = true;
  groundUniforms.uDistOrigin.value.set(m.ci * DIST_CELL, m.cj * DIST_CELL);
}
