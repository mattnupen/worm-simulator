import * as THREE from 'three';
import { bodyPoint, sampleBody } from './body';
import { gutCentreY, gutPoint, liningPoint } from './gut';
import { Mesher } from './mesher';
import { R, dorsalVessel, nerveCord, subneural, ventralVessel } from './axes';
import { wallThickness } from './layout';
import { cordRadius } from './nerves';
import { cutX } from './skin';

/**
 * The cross-section where the cutaway stops (the front of segment 31), like a slice in an atlas:
 * the body cavity, the gut with its typhlosole and its soil-filled middle, the three main blood
 * vessels and the nerve cord with its giant fibres. Each piece belongs to its system.
 */

type Paint = (u: number, v: number, p: THREE.Vector3, o: THREE.Color) => void;
const flatColor = (hex: string): Paint => {
  const c = new THREE.Color(hex);
  return (_u, _v, _p, o) => { o.copy(c); };
};

/** A ring between two outlines at the section, facing forward (-x). */
function ring(m: Mesher, x: number, inner: (th: number, o: THREE.Vector3) => void, outer: (th: number, o: THREE.Vector3) => void, paint: Paint, cols = 64): void {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  m.surface(3, cols, (u, v, o) => {
    const th = v * Math.PI * 2;
    inner(th, a);
    outer(th, b);
    o.lerpVectors(a, b, u);
    o.x = x;
  }, paint, { wrapV: true });
}

/** A round disc of radius r round c at the section. */
function disc(m: Mesher, x: number, c: THREE.Vector3, r: number, paint: Paint): void {
  ring(m, x, (_th, o) => o.copy(c), (th, o) => o.set(x, c.y + Math.cos(th) * r, c.z + Math.sin(th) * r), paint, 20);
}

export interface SectionParts {
  cavity: Mesher;
  gut: Mesher;
  blood: Mesher;
  nerves: Mesher;
}

export function buildSection(): SectionParts {
  const out: SectionParts = { cavity: new Mesher(), gut: new Mesher(), blood: new Mesher(), nerves: new Mesher() };
  const x = cutX();
  const T = wallThickness();
  const front = x - 0.004;
  const top = x - 0.008;
  // The body cavity, from the gut out to the wall: clear fluid over the far wall's lining.
  ring(out.cavity, x, (th, o) => { gutPoint(x, th, o); }, (th, o) => { bodyPoint(x, th, T, o); }, flatColor('#e7c3b6'), 96);
  // The gut: wall (with the chloragogen coat outside), lining with the typhlosole, soil inside.
  const lining = (th: number, o: THREE.Vector3) => { liningPoint(x, th, o); };
  ring(out.gut, front, (th, o) => { gutPoint(x, th, o, -0.07); }, (th, o) => { gutPoint(x, th, o, 0.02); }, flatColor('#c39a45'), 96);
  ring(out.gut, front, lining, (th, o) => { gutPoint(x, th, o, -0.07); }, flatColor('#d7a993'), 96);
  const centre = new THREE.Vector3(x, gutCentreY(x, sampleBody(x, { s: 0, w: 0, h: 0, yc: 0 })) - 0.25, 0);
  ring(out.gut, front, (_th, o) => o.copy(centre), lining, flatColor('#7a5a3e'), 96);
  // Blood vessels and the nerve cord.
  const red = flatColor('#8e1222');
  disc(out.blood, top, dorsalVessel(x, new THREE.Vector3()), R.dorsal, red);
  disc(out.blood, top, ventralVessel(x, new THREE.Vector3()), R.ventral, red);
  disc(out.blood, top, subneural(x, new THREE.Vector3()), R.subneural, red);
  const cord = nerveCord(x, new THREE.Vector3());
  disc(out.nerves, top, cord, cordRadius(x), flatColor('#efc136'));
  for (const dz of [-0.075, 0, 0.075]) {
    disc(out.nerves, top - 0.004, cord.clone().add(new THREE.Vector3(0, cordRadius(x) * 0.55, dz)), 0.04, flatColor('#fff4c4'));
  }
  return out;
}
