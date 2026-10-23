import * as THREE from 'three';
import { ANATOMY_PARTS, type AnatomyPartId } from '../content/anatomy';
import { bodyPoint, insideWall } from './body';
import { dorsalVessel, nerveCord, ventralVessel } from './axes';
import { gutPoint } from './gut';
import { ANCHORS } from './anchors';
import { CLITELLUM, LENGTH, ORGANS, SEGMENTS, segAt, segStart, segmentAt } from './layout';
import type { PoseMap } from './pose';
import type { SystemId } from './model';

/**
 * Tapping the model picks a part: the tap hits one system's mesh, and the nearest sample point of
 * that system's parts names it. Long parts (the gut, the vessels, the cord, the skin) have samples
 * all along them; paired parts have samples on both sides.
 */
interface Sample { id: AnatomyPartId; at: THREE.Vector3; posed: THREE.Vector3 }

const V = () => new THREE.Vector3();

function gutPart(s: number, th: number): AnatomyPartId {
  if (s < 5.5) return 'pharynx';
  if (s < ORGANS.crop[0] - 0.3) return s > 10.2 && s < 13 && Math.abs(Math.sin(th)) > 0.6 ? 'calciferous' : 'esophagus';
  if (s < ORGANS.gizzard[0] - 0.1) return 'crop';
  if (s < ORGANS.intestineFrom) return 'gizzard';
  return 'intestine';
}

function buildSamples(): Sample[] {
  const out: Sample[] = [];
  const add = (id: AnatomyPartId, at: THREE.Vector3) => {
    out.push({ id, at, posed: V() });
    if (Math.abs(at.z) > 0.05) out.push({ id, at: at.clone().setZ(-at.z), posed: V() });
  };
  for (const id of Object.keys(ANCHORS) as AnatomyPartId[]) add(id, ANCHORS[id].at());
  // Skin: the mouth lobe, the saddle, and the rest of the skin.
  for (let x = -1.2; x < LENGTH; x += 0.5) {
    const s = segmentAt(Math.max(0, x));
    const id: AnatomyPartId = x < segStart(2) ? 'prostomium' : s >= CLITELLUM[0] && s < CLITELLUM[1] + 1 ? 'clitellum' : 'skin';
    for (let k = 0; k < 8; k++) add(id, bodyPoint(x, (k / 8) * Math.PI * 2, 0, V()));
  }
  // The gut, along its length and round it.
  for (let x = 0.1; x < LENGTH - 0.2; x += 0.25) {
    const s = segmentAt(x);
    for (let k = 0; k < 8; k++) {
      const th = (k / 8) * Math.PI * 2;
      add(gutPart(s, th), gutPoint(x, th, V()));
    }
  }
  // Vessels, hearts, the cord and its nerves.
  for (let x = segStart(3); x < LENGTH - 1; x += 0.3) {
    add('dorsalVessel', dorsalVessel(x, V()));
    add('ventralVessel', ventralVessel(x, V()));
    add('nerveCord', nerveCord(x, V()));
  }
  for (let n = ORGANS.hearts[0]; n <= ORGANS.hearts[1]; n++) {
    for (let k = 1; k < 8; k++) add('hearts', gutPoint(segAt(n, 0.3), (k / 8) * Math.PI, V(), 0.4));
  }
  for (let n = 5; n < SEGMENTS; n += 2) {
    for (let k = 1; k < 6; k++) add('nerves', insideWall(segAt(n, 0.5), (k / 6) * Math.PI, 0.25, V()));
  }
  return out;
}

let samples: Sample[] | null = null;
let posedWith: PoseMap | null = null;

/** The part of `system` nearest a tapped point (world space), on the current pose. */
export function pickPart(system: SystemId, hit: THREE.Vector3, pose: PoseMap): AnatomyPartId | null {
  samples ??= buildSamples();
  if (posedWith !== pose) {
    for (const s of samples) pose.point(s.at, s.posed);
    posedWith = pose;
  }
  let best: AnatomyPartId | null = null;
  let d = Infinity;
  for (const s of samples) {
    if (ANATOMY_PARTS[s.id].system !== system) continue;
    const e = s.posed.distanceToSquared(hit);
    if (e < d) {
      d = e;
      best = s.id;
    }
  }
  return best;
}

/** Organs with a set place along the body: [first segment, last segment]. */
const SPANS: Partial<Record<AnatomyPartId, readonly [number, number]>> = {
  pharynx: [1.6, 5.4], esophagus: [5.5, 14.6], calciferous: [10, 12.9], crop: [ORGANS.crop[0], ORGANS.crop[1] + 0.9],
  gizzard: [ORGANS.gizzard[0], ORGANS.gizzard[1] + 0.9], hearts: [ORGANS.hearts[0], ORGANS.hearts[1] + 0.6],
  seminalVesicles: [9, 12.9], receptacles: [9, 10.9], ovaries: [13, 13.6], brain: [2.6, 3.6],
  prostomium: [-0.2, 1], clitellum: [CLITELLUM[0], CLITELLUM[1] + 1],
};

/**
 * Where the glow goes for a part, in world space: along the whole organ when it has a set place
 * (a line down its middle, as wide as the organ), otherwise round the tapped point (or the label's
 * point) on a long part.
 */
export function glowFor(id: AnatomyPartId, pose: PoseMap, hit?: THREE.Vector3): { a: THREE.Vector3; b: THREE.Vector3; radius: number } {
  const span = SPANS[id];
  if (span) {
    const xOf = (v: number) => segAt(Math.floor(v), v - Math.floor(v));
    const x0 = span[0] < 0 ? -1.2 : xOf(span[0]);
    const x1 = xOf(span[1]);
    const skin = id === 'prostomium' || id === 'clitellum';
    const mid = (x: number) => {
      if (skin) return bodyPoint(x, 0, 1, V());
      return gutPoint(x, 0, V()).add(gutPoint(x, Math.PI, V())).multiplyScalar(0.5);
    };
    const xm = (x0 + x1) / 2;
    const r = skin ? bodyPoint(xm, 0, 0, V()).distanceTo(bodyPoint(xm, Math.PI, 0, V())) * 0.9
      : gutPoint(xm, Math.PI / 2, V()).distanceTo(gutPoint(xm, -Math.PI / 2, V())) * 0.5 + 1.1;
    return { a: pose.point(mid(x0), V()), b: pose.point(mid(x1), V()), radius: r };
  }
  const c = hit?.clone() ?? pose.point(ANCHORS[id].at(), V());
  return { a: c, b: c.clone(), radius: id === 'nephridia' || id === 'setae' ? 1.3 : 2.6 };
}
