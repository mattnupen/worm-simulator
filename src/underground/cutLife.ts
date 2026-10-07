import { PROP } from '../surface/propGeometry';
import { writeBlob, writeTube, type Pen } from './cutShapes';

/**
 * The cut's static life (V2 spec 5.2): hints of the vote's options in their real places, a snail
 * shell in the litter, a ground beetle low in it, a wolf spider on its top and puffballs at the
 * surface line, and the moss carpets with their red-stalked spore capsules. No behaviour: shapes
 * only, sized as the real animals next to a 15 cm worm (1 cm is about 0.23 u) and drawn so a 6th
 * grader can tell what each is at the Wide view (about 90 px per unit at 1366 x 768). Build-time
 * only (once per dig).
 */
const TAU = Math.PI * 2;
const PLAIN = PROP.plain;

/** A land snail's empty shell seen side on: a coiled whorl, tan with chestnut flames and a pale lip. */
export function writeSnail(p: Pen, u: number, v: number, size: number, turn: number): void {
  const us: number[] = [];
  const vs: number[] = [];
  const ds: number[] = [];
  const rs: number[] = [];
  const n = 40;
  // A log spiral whose whorls just touch: each turn 0.45 the size of the last, the tube 0.38 of its radius.
  const b = -Math.log(0.45) / TAU;
  const turns = 2.6;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = turn - t * turns * TAU;
    const rad = size * Math.exp(-b * t * turns * TAU);
    us.push(u + Math.cos(a) * rad);
    vs.push(v + Math.sin(a) * rad);
    ds.push(0.02);
    rs.push(rad * (i === 0 ? 0.46 : 0.38));
  }
  writeTube(p, us, vs, ds, rs, (i, a) => {
    if (i === 0) return '#e2cfa6';
    // Dark at the tube's in-plane edges (the sutures between whorls), a chestnut band, flames.
    const edge = Math.abs(Math.sin(a)) < 0.4;
    const flame = Math.sin(i * 1.9) > 0.35;
    const band = Math.abs(a - 1.2) < 0.35;
    return edge ? '#3a200c' : band ? '#4a2810' : flame ? '#7a4420' : '#b88a56';
  }, PLAIN, 8, 0.6, 0.35);
}

/**
 * A ground beetle seen from above, as if walking on the cut: glossy black wing cases with a seam,
 * its shield and head, jaws, two antennae and six legs. `dir` is the way it faces in the plane.
 */
export function writeBeetle(p: Pen, u: number, v: number, len: number, dir: number): void {
  const fu = Math.cos(dir);
  const fv = Math.sin(dir);
  // Plane point `along` the body and `across` it, at depth d.
  const pu = (along: number, across: number) => u + (fu * along - fv * across) * len;
  const pv = (along: number, across: number) => v + (fv * along + fu * across) * len;
  const d0 = 0.05;
  // Glossy black with a green-bronze sheen and bright margins, as many ground beetles.
  const shine = (x: number, y: number, z: number) => (z > 0.55 && Math.abs(y - 0.38) < 0.16 && x > -0.6 && x < 0.6 ? '#5e7a62' : z < 0.4 ? '#4e4224' : '#181c18');
  const dull = (_x: number, _y: number, z: number) => (z < 0.4 ? '#4e4224' : '#161816');
  writeBlob(p, pu(-0.12, 0), pv(-0.12, 0), d0, 0.34 * len, 0.2 * len, 0.13 * len, dir, { hex: shine, code: PLAIN, face: 0.45, lump: 0.02, seed: 3, fine: true });
  writeTube(p, [pu(-0.45, 0), pu(0.2, 0)], [pv(-0.45, 0), pv(0.2, 0)], [d0 + 0.12 * len, d0 + 0.12 * len], [0.012, 0.012], () => '#030202', PLAIN, 4, 0.8);
  writeBlob(p, pu(0.31, 0), pv(0.31, 0), d0, 0.11 * len, 0.15 * len, 0.09 * len, dir, { hex: dull, code: PLAIN, face: 0.45, lump: 0.03, seed: 5 });
  writeBlob(p, pu(0.47, 0), pv(0.47, 0), d0, 0.08 * len, 0.09 * len, 0.07 * len, dir, { hex: () => '#100d0b', code: PLAIN, face: 0.45, lump: 0.03, seed: 7 });
  for (const side of [-1, 1]) {
    // Jaws and antennae.
    writeTube(p, [pu(0.52, side * 0.04), pu(0.6, side * 0.05), pu(0.63, side * 0.01)], [pv(0.52, side * 0.04), pv(0.6, side * 0.05), pv(0.63, side * 0.01)], [d0, d0, d0], [0.014, 0.01, 0.005], () => '#1c1612', PLAIN, 4, 0.5);
    const ant = [[0.52, 0.07], [0.68, 0.16], [0.84, 0.24], [0.98, 0.36]];
    writeTube(p, ant.map(([a, c]) => pu(a, side * c)), ant.map(([a, c]) => pv(a, side * c)), ant.map(() => d0 + 0.02), [0.011, 0.009, 0.008, 0.006], () => '#2a201a', PLAIN, 4, 0.5);
    // Six legs: the front pair reaching forward, the middle out, the back pair back.
    const legs = [
      [0.3, 0.12, 0.42, 0.32, 0.58, 0.44],
      [0.12, 0.17, 0.12, 0.42, 0.0, 0.58],
      [-0.02, 0.17, -0.22, 0.38, -0.5, 0.48],
    ];
    for (const [a0, c0, a1, c1, a2, c2] of legs) {
      writeTube(p, [pu(a0, side * c0), pu(a1, side * c1), pu(a2, side * c2)], [pv(a0, side * c0), pv(a1, side * c1), pv(a2, side * c2)], [d0, d0 + 0.015, d0], [0.02, 0.014, 0.008], (i) => (i === 1 ? '#0e0b09' : '#241c16'), PLAIN, 4, 0.5);
    }
  }
}

/**
 * A wolf spider standing on the litter's top, side on: a striped body and eight jointed legs that
 * arch up from it and down to the leaves, spread round it toward the camera and away. `dir` is +1
 * to face up the cut, -1 down it.
 */
export function writeSpider(p: Pen, u: number, top: number, size: number, dir: number): void {
  const h = top + 0.55 * size;
  const stripe = (_x: number, y: number, z: number) => (y > 0.3 && Math.abs(z) < 0.3 ? '#d0b080' : y > -0.2 && Math.abs(z) < 0.55 ? '#3e2c1e' : '#6e5238');
  writeBlob(p, u - dir * 0.62 * size, h + 0.06 * size, 0.04, 0.5 * size, 0.36 * size, 0.38 * size, -dir * 0.15, { hex: stripe, code: PLAIN, face: 0.45, lump: 0.04, seed: 9, fine: true });
  writeBlob(p, u + dir * 0.12 * size, h + 0.04 * size, 0.04, 0.34 * size, 0.24 * size, 0.27 * size, 0, { hex: stripe, code: PLAIN, face: 0.45, lump: 0.03, seed: 11 });
  const legHex = (i: number) => (i === 1 || i === 2 ? '#4a3626' : '#7a5c40');
  // Legs round the body, each angle from straight ahead; the back pair longest.
  const legs = [[0.45, 1.25], [1.15, 1.05], [1.95, 1.05], [2.6, 1.4]];
  for (const side of [-1, 1]) {
    for (const [ang, reach] of legs) {
      const along = Math.cos(ang) * dir;
      const out = Math.sin(ang) * side * 0.7;
      const r = reach * size;
      const bu = u + dir * 0.14 * size + along * 0.15 * size;
      const bd = 0.04 + out * 0.15 * size;
      writeTube(
        p,
        [bu, bu + along * r * 0.38, bu + along * r * 0.75, bu + along * r],
        [h, h + 0.55 * size, h + 0.25 * size, top + 0.01],
        [bd, bd + out * r * 0.38, bd + out * r * 0.75, bd + out * r],
        [0.06 * size, 0.05 * size, 0.035 * size, 0.02 * size], legHex, PLAIN, 4, 0.45,
      );
    }
  }
}

/** A puffball at the surface line, sitting in moss: a pear-shaped tan ball, warty, with a dark pore on top (IMG_2439). */
export function writePuffball(p: Pen, u: number, top: number, r: number, seed: number): void {
  const base = top - 0.15 * r;
  writeBlob(p, u, base + r, 0.06, r * 0.95, r, r * 0.9, 0, {
    hex: (_x, y) => (y > 0.5 ? '#86603c' : y > -0.3 ? '#987048' : '#ae9068'),
    mul: (x, y, z) => (0.9 + 0.18 * Math.sin(x * 29 + seed) * Math.sin(y * 23 + z * 19)) * (0.85 + 0.25 * y),
    shape: (_x, y) => 0.72 + 0.28 * Math.min(1, (y + 1) * 0.75),
    code: PLAIN, face: 0.8, lump: 0.03, seed, fine: true,
  });
  // The pore it puffs its spores from.
  writeBlob(p, u + r * 0.12, base + r * 1.9, 0.06 + r * 0.25, r * 0.16, r * 0.07, r * 0.16, 0.25, { hex: () => '#24140a', code: PLAIN, face: 0.8, lump: 0, seed });
}

/**
 * A moss carpet along the surface line from u0 to u1: one soft mound, short shoots all over it, and
 * spore capsules on red stalks standing out of it (IMG_2431, IMG_2439). `topAt(u)` is the line.
 */
export function writeMoss(p: Pen, u0: number, u1: number, topAt: (u: number) => number, rand: () => number): void {
  if (!(u1 - u0 > 0.2)) return;
  const edge = (u: number) => Math.min(1, (u - u0) / 0.3, (u1 - u) / 0.3);
  // The mat: one soft mound along the line, low at its ends, darker underneath.
  const mu: number[] = [];
  const mv: number[] = [];
  const md: number[] = [];
  const mr: number[] = [];
  const ph = rand() * 6;
  const steps = Math.ceil((u1 - u0) / 0.05);
  for (let j = 0; j <= steps; j++) {
    const u = u0 + ((u1 - u0) * j) / steps;
    const r = (0.12 + 0.045 * Math.sin(u * 6.1 + ph) + 0.025 * Math.sin(u * 15.7 + ph)) * Math.sqrt(Math.max(0.05, edge(u)));
    mu.push(u); mv.push(topAt(u) + r * 0.2 - 0.03); md.push(0); mr.push(r);
  }
  const tone = ['#3e6a1c', '#5c8c26', '#78a830', '#4a7a22'];
  writeTube(p, mu, mv, md, mr, (i, a) => (a < 1.0 || a > 5.3 ? '#2c4614' : tone[Math.floor(Math.abs(Math.sin(i * 12.9898 + a * 78.233) * 43758.5453)) % 4]), PROP.plant + 0.6, 10, 0.3, 0.3);
  // Short fuzzy shoots all over the mat's front and top, and some behind it for its outline.
  for (let u = u0 + 0.02; u < u1 - 0.02; u += 0.012 + rand() * 0.016) {
    const k = Math.min(mr.length - 1, Math.round(((u - u0) / (u1 - u0)) * (mr.length - 1)));
    const r = mr[k];
    const th = rand() * Math.PI * 0.62;
    const back = rand() < 0.3 ? -0.08 - 0.08 * rand() : 0;
    const cu = Math.cos(th);
    const sv = Math.sin(th);
    const v = mv[k] + r * sv * 0.92;
    const d = r * cu * 0.92 + back;
    const h = (0.05 + rand() * 0.1) * (0.5 + 0.5 * edge(u));
    const lean = (rand() - 0.5) * 0.8;
    const tip = rand() < 0.5 ? '#b4d85a' : '#9ac63e';
    writeTube(
      p, [u, u + lean * h * 0.5, u + lean * h], [v, v + h * (0.3 + 0.5 * sv), v + h * (0.5 + 0.6 * sv)],
      [d, d + cu * h * 0.5, d + cu * h * 0.8], [0.026, 0.019, 0.006],
      (i) => (i === 0 ? '#4e7c22' : i === 1 ? '#78a830' : tip), PROP.plant, 3, 0.25,
    );
  }
  for (let u = u0 + 0.1 + rand() * 0.2; u < u1 - 0.1; u += 0.16 + rand() * 0.28) {
    const v = topAt(u);
    const h = 0.45 + rand() * 0.3;
    const bend = (rand() - 0.5) * 0.16;
    const d = (rand() - 0.3) * 0.2;
    const tu = u + bend;
    writeTube(p, [u, u + bend * 0.3, u + bend * 0.75, tu], [v, v + h * 0.4, v + h * 0.8, v + h], [d, d, d, d], [0.012, 0.01, 0.009, 0.008], (i) => (i < 2 ? '#9a3018' : '#c4542a'), PROP.plant, 3, 0.3);
    const nod = (bend > 0 ? -1 : 1) * (0.5 + 0.7 * rand());
    writeBlob(p, tu - Math.sin(nod) * 0.05, v + h + Math.cos(nod) * 0.05, d, 0.028, 0.06, 0.028, nod, {
      hex: (_x, y) => (y > 0.6 ? '#d8b070' : '#8a4a22'), code: PLAIN, face: 0.3, lump: 0.05, seed: u,
    });
  }
}
