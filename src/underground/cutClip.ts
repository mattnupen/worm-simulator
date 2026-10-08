import * as THREE from 'three';
import type { Slab } from './slab';

/**
 * Cutting the forest away in front of the cut (V2 spec 4.1, 7: "the forest in front of the cut is
 * not drawn"), with the projection alone: no shader changes, nothing compiled, nothing per pixel.
 * The camera's near plane is replaced by a plane parallel to the cut (an oblique near plane: E.
 * Lengyel, "Oblique View Frustum Depth Projection and Clipping", 2005; three.js's Reflector does
 * the same). An ordinary near plane faces the camera, so while the camera looked at the cut at a
 * slant (mid-swing) it left a sheet of litter and floor hanging in front of one side of the cut
 * or cut into the face on the other; this one lies along the cut whichever way the camera looks.
 * Only the third row of the projection changes: x and y on screen (the leaf fade's p00 and p11,
 * the labels) and the view depth (gl_FragCoord.w) are as before. Allocates nothing.
 */
const plane = new THREE.Plane();
const normal = new THREE.Vector3();
const point = new THREE.Vector3();
const clip = new THREE.Vector4();
const q = new THREE.Vector4();
/** See clipBeyond. */
const FAR_REACH = 8;

/** The camera's distance off the cut's plane, on its side (negative behind the cut). */
export function offCut(s: Slab, p: THREE.Vector3): number {
  return s.nx * (p.x - s.ox) + s.nz * (p.z - s.oz);
}

/**
 * Sets the camera's projection (its own, from `updateProjectionMatrix`) to draw only what lies
 * less than `ahead` in front of the cut's plane (on the camera's side) or behind it. The camera's
 * world matrix must be current. Returns false, leaving the projection as it was, when the camera
 * is not more than `ahead` in front of the cut (nothing there to cut away).
 */
export function clipBeyond(camera: THREE.PerspectiveCamera, s: Slab, ahead: number): boolean {
  if (!(offCut(s, camera.position) > ahead)) return false;
  // The kept side faces away from the camera: the plane's normal points from the camera to the cut.
  normal.set(-s.nx, 0, -s.nz);
  point.set(s.ox + s.nx * ahead, 0, s.oz + s.nz * ahead);
  plane.setFromNormalAndCoplanarPoint(normal, point).applyMatrix4(camera.matrixWorldInverse);
  clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
  const m = camera.projectionMatrix;
  const e = m.elements;
  // The frustum's corner opposite the clip plane, in view space, FAR_REACH times as far as the
  // camera's far plane: the new far plane passes through it. (At the camera's own far, a slanting
  // clip plane tilts the far plane in to under a quarter of it on one side of the screen.)
  q.set((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14] / FAR_REACH);
  clip.multiplyScalar(2 / clip.dot(q));
  e[2] = clip.x;
  e[6] = clip.y;
  e[10] = clip.z + 1;
  e[14] = clip.w;
  camera.projectionMatrixInverse.copy(m).invert();
  return true;
}
