import * as THREE from 'three';
import type { Slab } from './slab';
import type { CutPose } from './cutCamera';
import { smootherstep } from './easing';
import { offCut } from './cutClip';

/**
 * The camera's swing between the surface's follow camera and the cut camera (V2 spec 4.1, 4.2),
 * at linear progress p (0: the surface camera, 1: the cut camera; coming up it runs back). It
 * orbits: the point it looks at slides from where the surface camera looks (at the worm) to the
 * cut camera's (the middle of its frame), and the camera goes round that point, out and down to
 * the cut camera, so the worm stays in view. It turns square to the cut while still over the
 * leaves, and only then comes down beside the cut while what lies in front of the cut is cut
 * away (cutClip.ts): sliced along the cut, from the camera's side in, so the face shows from the
 * bottom of the screen up behind a straight edge. Every ray of the screen then meets the face, the
 * ground, or the forest beyond the cut (never the empty space past the face's ends or under it,
 * which a slanting view of the cut shows). Exactly the surface camera at p = 0 and the cut camera
 * at p = 1, and smooth between. Pure; allocates nothing.
 */
/** The orbit rises this much at its middle, up over the leaves rather than through them. */
export const SWING_ARC = 1.2;
/** It is square to the cut by this share of the swing... */
export const TURN_BY = 0.6;
/** ...and comes down (and out) to the cut camera's height and distance from this share on. */
export const DROP_FROM = 0.3;
/** What lies in front of the cut is cut away over this part of the swing: just in front of the camera... */
export const CLIP_FROM = 0.45;
/** ...to `keep` in front of the cut (CLIP_GAP: how far in front of the camera it starts). */
export const CLIP_TO = 0.7;
export const CLIP_GAP = 0.5;

const pivotA = new THREE.Vector3();
const pivotB = new THREE.Vector3();
const pivot = new THREE.Vector3();
const fwd = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const look = new THREE.Matrix4();
const qA = new THREE.Quaternion();
const qB = new THREE.Quaternion();
const roll = new THREE.Quaternion();
const ident = new THREE.Quaternion();

/** The rotation of a camera at `eye` looking at `at`, world up (as Object3D.lookAt for a camera). */
function lookFrom(eye: THREE.Vector3, at: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  look.lookAt(eye, at, up);
  return out.setFromRotationMatrix(look);
}

/** The swing's shares: the turn round the cut, the drop to the cut camera, and the cut-away (0..1 each). */
export interface SwingShares { turn: number; drop: number; clip: number }

/** The shares at progress p (see the constants above). */
export function swingShares(p: number, out: SwingShares): SwingShares {
  out.turn = smootherstep(p / TURN_BY);
  out.drop = smootherstep((p - DROP_FROM) / (1 - DROP_FROM));
  out.clip = smootherstep((p - CLIP_FROM) / (CLIP_TO - CLIP_FROM));
  return out;
}

const share: SwingShares = { turn: 0, drop: 0, clip: 0 };

/**
 * Poses `out` (position and rotation) on the swing at progress p, from the surface camera `surf`
 * (looking at the worm, whose head is at `head`) to the cut camera at `cp`. Returns how far in
 * front of the cut things are still drawn (cutClip.ts's `ahead`), or Infinity: nothing cut away
 * yet. `keep`: the body still lying out in front of the cut, kept.
 */
export function swingPose(
  surf: THREE.Camera, head: THREE.Vector3, cp: CutPose, s: Slab, p: number, keep: number, out: THREE.Camera,
): number {
  swingShares(Math.min(1, Math.max(0, p)), share);
  // The surface camera's pivot: on its view axis, as far off as the head.
  fwd.set(0, 0, -1).applyQuaternion(surf.quaternion);
  pivotA.copy(surf.position).addScaledVector(fwd, Math.max(0.5, surf.position.distanceTo(head)));
  pivotB.set(cp.lx, cp.ly, cp.lz);
  pivot.lerpVectors(pivotA, pivotB, share.drop);
  // Round the pivot: the angle turns, the reach and height go over with the drop.
  const ax = surf.position.x - pivotA.x;
  const az = surf.position.z - pivotA.z;
  const bx = cp.px - pivotB.x;
  const bz = cp.pz - pivotB.z;
  const a0 = Math.atan2(ax, az);
  const da = Math.atan2(bx, bz) - a0;
  const a = a0 + (da - 2 * Math.PI * Math.round(da / (2 * Math.PI))) * share.turn;
  const r = Math.hypot(ax, az) + (Math.hypot(bx, bz) - Math.hypot(ax, az)) * share.drop;
  const y = surf.position.y - pivotA.y + (cp.py - pivotB.y - surf.position.y + pivotA.y) * share.drop;
  out.position.set(pivot.x + r * Math.sin(a), pivot.y + y + SWING_ARC * Math.sin(Math.PI * share.drop), pivot.z + r * Math.cos(a));
  // Looking at the pivot, with what the surface camera had besides (its tilt) easing out.
  lookFrom(surf.position, pivotA, qA);
  roll.copy(qA).invert().multiply(surf.quaternion);
  lookFrom(out.position, pivot, qB);
  out.quaternion.copy(qB).multiply(roll.slerp(ident, share.drop));
  if (!(share.clip > 0)) return Infinity;
  const from = offCut(s, out.position) - CLIP_GAP;
  return from + (keep - from) * share.clip;
}
