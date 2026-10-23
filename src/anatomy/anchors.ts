import * as THREE from 'three';
import type { AnatomyPartId } from '../content/anatomy';
import { bodyPoint, insideWall } from './body';
import { dorsalVessel, floorY, nerveCord, ventralVessel } from './axes';
import { gutPoint } from './gut';
import { WALL, segAt, segMid, segStart, segmentLength } from './layout';

/**
 * Where each labelled part's leader line points, in the straight model (mm). Parts that come in
 * pairs point at the far one (the near one is removed in the cutaway). `inside`: the label only
 * makes sense while the wall is cut open or see-through.
 */
export interface Anchor {
  at: () => THREE.Vector3;
  inside: boolean;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const out = (at: () => THREE.Vector3): Anchor => ({ at, inside: false });
const inn = (at: () => THREE.Vector3): Anchor => ({ at, inside: true });
const SIDE = Math.PI / 2;

export const ANCHORS: Record<AnatomyPartId, Anchor> = {
  prostomium: out(() => bodyPoint(-0.7, 0.5, 0, V(0, 0, 0))),
  segments: out(() => bodyPoint(segMid(62), 0.7, 0, V(0, 0, 0))),
  setae: out(() => bodyPoint(segMid(24), Math.PI - 1.2, 0, V(0, 0, 0))),
  clitellum: out(() => bodyPoint(segMid(34), 0.6, 0, V(0, 0, 0))),
  skin: out(() => bodyPoint(segMid(100), 1.0, 0, V(0, 0, 0))),
  circular: out(() => insideWall(segMid(46), 0.8, WALL.epidermis, V(0, 0, 0))),
  longitudinal: out(() => insideWall(segMid(54), 0.8, WALL.epidermis + WALL.circular, V(0, 0, 0))),
  // On a septum, between the gut and the far wall.
  septa: inn(() => {
    const x = segStart(8) + 0.02;
    return gutPoint(x, -SIDE + 0.35, V(0, 0, 0)).lerp(insideWall(x, -SIDE + 0.35, 0, V(0, 0, 0)), 0.8);
  }),
  pharynx: inn(() => gutPoint(segMid(4), SIDE, V(0, 0, 0))),
  esophagus: inn(() => gutPoint(segMid(7), SIDE, V(0, 0, 0))),
  calciferous: inn(() => gutPoint(segAt(11, 0.5), SIDE, V(0, 0, 0))),
  crop: inn(() => gutPoint(segStart(16), SIDE, V(0, 0, 0))),
  gizzard: inn(() => gutPoint(segStart(18), SIDE, V(0, 0, 0))),
  intestine: inn(() => gutPoint(segMid(20), SIDE, V(0, 0, 0))),
  // On the near heart in segment 9, at the side of the esophagus (its fattest part).
  hearts: inn(() => gutPoint(segAt(9, 0.3), SIDE, V(0, 0, 0), 0.44)),
  dorsalVessel: inn(() => dorsalVessel(segMid(28), V(0, 0, 0))),
  ventralVessel: inn(() => ventralVessel(segMid(25), V(0, 0, 0))),
  brain: inn(() => gutPoint(segMid(3), 0, V(0, 0, 0), 0.3)),
  nerveCord: inn(() => nerveCord(segMid(23), V(0, 0, 0))),
  nerves: inn(() => insideWall(segAt(29, 0.5), -Math.PI * 0.72, 0.25, V(0, 0, 0))),
  seminalVesicles: inn(() => gutPoint(segAt(12, 0.66), -1.1, V(0, 0, 0), 0.8)),
  receptacles: inn(() => insideWall(segAt(10, 0.5), -(Math.PI - 1.15), 0.42, V(0, 0, 0))),
  ovaries: inn(() => { const x = segAt(13, 0.28); return V(x, floorY(x) + 0.42, -0.55); }),
  nephridia: inn(() => insideWall(segStart(26) + 0.5 * segmentLength(26), -(Math.PI - 1.3), 0.25, V(0, 0, 0))),
};
