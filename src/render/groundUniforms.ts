import * as THREE from 'three';
import { DIST_N, DIST_CELL, packDisturbance, type DisturbanceMap } from '../surface/disturbance';

/** Spine points the shaders read: the worm's segments, head first. */
export const SPINE_POINTS = 16;

function mapTexture(data: Uint8Array, format: THREE.PixelFormat): THREE.DataTexture {
  const t = new THREE.DataTexture(data, DIST_N, DIST_N, format, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// An empty map packs to all zeros.
const nearBytes = new Uint8Array(DIST_N * DIST_N * 4);
const trailBytes = new Uint8Array(DIST_N * DIST_N * 2);
const nearTexture = mapTexture(nearBytes, THREE.RGBAFormat);
const trailTexture = mapTexture(trailBytes, THREE.RGFormat);

/**
 * Uniforms shared by reference by every leaf material (and the near clutter): where the worm
 * is, and the disturbance map around it. Updated once per rendered frame.
 */
export const groundUniforms = {
  /** The worm's head as rendered (interpolated). */
  uFocus: { value: new THREE.Vector3() },
  /** uFocus snapped to the 1 m grid: the centre the near-worm layers wrap around. */
  uWrapCentre: { value: new THREE.Vector2() },
  /** The disturbance map, packed by packDisturbance: path and body nearness (two bytes each)... */
  uDisturb: { value: nearTexture },
  /** ...and the trail, with the path again in one byte. */
  uDisturbTrail: { value: trailTexture },
  /** World x, z of the disturbance grid's corner. */
  uDistOrigin: { value: new THREE.Vector2(-DIST_N * DIST_CELL / 2, -DIST_N * DIST_CELL / 2) },
  /** The worm's rendered spine (x, y, z per point, head first): the near clutter keeps clear of it. */
  uSpine: { value: new Float32Array(SPINE_POINTS * 3) },
  /** The leaf fade's view of the body (occluderSegments): projected axis segments, and how many. */
  uOccSeg: { value: new Float32Array((SPINE_POINTS - 1) * 8) },
  uOccCount: { value: 0 },
  /** NDC box (xmin, ymin, xmax, ymax) of the pixels the fade can touch; empty until set. */
  uOccBox: { value: new THREE.Vector4(2, 2, -2, -2) },
  /** 1 / p00, 1 / p11 of the camera's projection: NDC to the tan space the segments are in. */
  uOccTan: { value: new THREE.Vector2(1, 1) },
  /** The farthest view depth of the kept body: leaves beyond it skip the segment loop. */
  uOccDepth: { value: 0 },
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

/** Copies the rendered spine (SPINE_POINTS points) into the uniform. Allocates nothing. */
export function setSpine(spine: Float32Array): void {
  groundUniforms.uSpine.value.set(spine);
}

/** The per-frame upload: 16 KB and 8 KB into the same two textures, no reallocation. */
export function uploadDisturbance(m: DisturbanceMap): void {
  packDisturbance(m, nearBytes, trailBytes);
  nearTexture.needsUpdate = true;
  trailTexture.needsUpdate = true;
  groundUniforms.uDistOrigin.value.set(m.ci * DIST_CELL, m.cj * DIST_CELL);
}
