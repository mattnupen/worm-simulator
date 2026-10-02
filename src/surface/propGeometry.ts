import * as THREE from 'three';
import { icosphere, type MeshWriter } from './meshWriter';
import { terrainHeight } from './terrain';

/**
 * Low-poly, solid forest-floor props written into a shared MeshWriter ('aProp': linear rgb
 * and a surface code: 0 plain, 1 stone, 2 plant (glows when backlit), with the fractional
 * part carrying a 0..1 parameter such as height along a blade).
 */
export const PROP = { plain: 0, stone: 1, plant: 2 } as const;

const col = new THREE.Color();
const col2 = new THREE.Color();
const TAU = Math.PI * 2;

/** Ground height at (x, z): the soil, or the soil plus the litter mound clutter rests on. */
export type GroundAt = (x: number, z: number) => number;
/** Sedge and fern bases sit this far below the ground, so no blade root shows. */
export const CLUTTER_SINK = 0.02;

const code = (kind: number, param: number) => kind + Math.min(0.99, Math.max(0, param));

/** A lumpy granite boulder, settled into the ground. */
export function writeRock(w: MeshWriter, x: number, z: number, size: number, seed: number): void {
  const { pos, index } = icosphere();
  const first = w.vertexCount;
  const firstIdx = w.idx.length;
  const g = terrainHeight(x, z);
  const yaw = seed * TAU;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  col.set(['#948a7e', '#9c8e80', '#857d72'][Math.floor(seed * 3) % 3]);
  for (let i = 0; i < pos.length; i += 3) {
    const dx = pos[i];
    const dy = pos[i + 1];
    const dz = pos[i + 2];
    const lump = 1 + 0.16 * Math.sin(2.7 * dx + 1.9 * dz + seed * 17) * Math.cos(2.1 * dy + seed * 5) + 0.07 * Math.sin(6.1 * dx - 5.3 * dz);
    const lx = dx * size * lump * 1.15;
    const lz = dz * size * lump * 0.9;
    // Flattened, with a flat-ish bottom hidden in the soil.
    const ly = Math.max(dy, -0.35) * size * lump * 0.62;
    w.vertex(x + lx * c - lz * s, g - size * 0.18 + ly, z + lx * s + lz * c, 0, 1, 0, [col.r, col.g, col.b, code(PROP.stone, 0)]);
  }
  for (let i = 0; i < index.length; i += 3) w.tri(first + index[i], first + index[i + 1], first + index[i + 2]);
  w.smoothNormals(first, firstIdx);
}

/** One mushroom: a slightly bent stem, a domed cap and pale gills underneath. */
function writeMushroom(
  w: MeshWriter, x: number, z: number, g: number, capR: number, stemH: number, lean: number,
  cap: THREE.Color, capCentre: THREE.Color,
): void {
  const radial = 7;
  const stemR = capR * 0.2;
  const lx = Math.cos(lean) * stemH * 0.18;
  const lz = Math.sin(lean) * stemH * 0.18;
  let first = w.vertexCount;
  let firstIdx = w.idx.length;
  for (let r = 0; r < 2; r++) {
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * TAU;
      const rr = stemR * (r === 0 ? 1.25 : 0.9);
      w.vertex(x + Math.cos(a) * rr + lx * r, g - 0.03 + (stemH + 0.03) * r, z + Math.sin(a) * rr + lz * r,
        Math.cos(a), 0, Math.sin(a), [0.5, 0.4, 0.26, code(PROP.plain, 0)]);
    }
  }
  w.grid(first, 2, radial + 1);
  // Cap: top centre, a mid ring and a down-turned rim.
  const tx = x + lx;
  const tz = z + lz;
  const ty = g + stemH;
  first = w.vertexCount;
  firstIdx = w.idx.length;
  const top = w.vertex(tx, ty + capR * 0.55, tz, 0, 1, 0, [capCentre.r, capCentre.g, capCentre.b, code(PROP.plain, 0)]);
  const rings = [[0.55, 0.42], [1, 0.02]];
  for (const [rr, hh] of rings) {
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * TAU;
      col2.copy(capCentre).lerp(cap, rr);
      w.vertex(tx + Math.cos(a) * capR * rr, ty + capR * hh, tz + Math.sin(a) * capR * rr, 0, 1, 0,
        [col2.r, col2.g, col2.b, code(PROP.plain, 0)]);
    }
  }
  for (let k = 0; k < radial; k++) {
    const k1 = (k + 1) % radial;
    w.triFacing(top, top + 1 + k, top + 1 + k1, 0, 1, 0);
    const a = top + 1 + k;
    const b = top + 1 + k1;
    const a2 = a + radial;
    const b2 = b + radial;
    const ox = Math.cos(((k + 0.5) / radial) * TAU);
    const oz = Math.sin(((k + 0.5) / radial) * TAU);
    w.triFacing(a, a2, b2, ox, 0.6, oz);
    w.triFacing(a, b2, b, ox, 0.6, oz);
  }
  w.smoothNormals(first, firstIdx);
  // Gills: a pale disc under the cap, facing down.
  const under = w.vertex(tx, ty + capR * 0.08, tz, 0, -1, 0, [0.52, 0.42, 0.28, code(PROP.plain, 0)]);
  for (let k = 0; k < radial; k++) {
    const a = (k / radial) * TAU;
    w.vertex(tx + Math.cos(a) * capR * 0.97, ty + capR * 0.01, tz + Math.sin(a) * capR * 0.97, 0, -1, 0,
      [0.45, 0.36, 0.24, code(PROP.plain, 0)]);
  }
  for (let k = 0; k < radial; k++) w.triFacing(under, under + 1 + k, under + 1 + ((k + 1) % radial), 0, -1, 0);
}

const HONEY = [new THREE.Color('#c8954a'), new THREE.Color('#6e4422')];
const RUSSULA = [new THREE.Color('#c0392b'), new THREE.Color('#7a2018')];

/** A cluster of 3-5 mushrooms (honey mushrooms, or a red russula pair). */
export function writeMushrooms(
  w: MeshWriter, x: number, z: number, scale: number, rng: () => number, groundAt: GroundAt = terrainHeight,
): void {
  const red = rng() < 0.3;
  const n = red ? 2 : 3 + Math.floor(rng() * 3);
  const [cap, centre] = red ? RUSSULA : HONEY;
  for (let k = 0; k < n; k++) {
    const a = rng() * TAU;
    const d = k === 0 ? 0 : 0.12 + rng() * 0.16 * scale;
    const mx = x + Math.cos(a) * d;
    const mz = z + Math.sin(a) * d;
    const s = scale * (k === 0 ? 1 : 0.55 + rng() * 0.4);
    writeMushroom(w, mx, mz, groundAt(mx, mz), (red ? 0.3 : 0.24) * s, (red ? 0.24 : 0.26) * s, a, cap, centre);
  }
}

/** One arching blade or frond rib: a tapered ribbon, two vertices per row, facing up. */
function writeBlade(
  w: MeshWriter, x: number, g: number, z: number, yaw: number, len: number, width: number, arch: number,
  rows: number, base: THREE.Color, tip: THREE.Color,
): void {
  const first = w.vertexCount;
  const firstIdx = w.idx.length;
  const fx = Math.cos(yaw);
  const fz = Math.sin(yaw);
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    // Rises, then arches over and droops.
    const out = len * t * (0.35 + 0.65 * arch);
    const up = len * (t * (1 - arch * 0.85 * t));
    const half = width * (1 - t * 0.92) * 0.5;
    col2.copy(base).lerp(tip, t);
    for (let e = -1; e <= 1; e += 2) {
      w.vertex(x + fx * out - fz * half * e, g + up, z + fz * out + fx * half * e, 0, 1, 0,
        [col2.r, col2.g, col2.b, code(PROP.plant, t)]);
    }
  }
  w.grid(first, rows, 2, true);
  w.smoothNormals(first, firstIdx);
}

/** A tuft of Pennsylvania sedge in fall: fine, arching golden-green blades. */
export function writeSedge(
  w: MeshWriter, x: number, z: number, scale: number, rng: () => number, groundAt: GroundAt = terrainHeight,
): void {
  const g = groundAt(x, z) - CLUTTER_SINK;
  const base = new THREE.Color('#6f7a2e');
  const tip = new THREE.Color(rng() < 0.5 ? '#c8a860' : '#b8a048');
  const blades = 9;
  for (let k = 0; k < blades; k++) {
    const yaw = (k / blades) * TAU + rng() * 0.6;
    writeBlade(w, x + Math.cos(yaw) * 0.03, g, z + Math.sin(yaw) * 0.03, yaw, (0.45 + rng() * 0.4) * scale, 0.05 * scale,
      0.45 + rng() * 0.45, 3, base, tip);
  }
}

/** A fern clump turning golden-bronze: arching fronds with paired leaflets. */
export function writeFern(
  w: MeshWriter, x: number, z: number, scale: number, rng: () => number, groundAt: GroundAt = terrainHeight,
): void {
  const g = groundAt(x, z) - CLUTTER_SINK;
  const green = rng() < 0.3;
  const base = new THREE.Color(green ? '#5f6e28' : '#8a5a22');
  const tip = new THREE.Color(green ? '#a0a040' : '#d09a3a');
  const fronds = 5;
  for (let f = 0; f < fronds; f++) {
    const yaw = (f / fronds) * TAU + rng() * 0.5;
    const len = (0.9 + rng() * 0.5) * scale;
    const arch = 0.55 + rng() * 0.3;
    const fx = Math.cos(yaw);
    const fz = Math.sin(yaw);
    // Rachis.
    writeBlade(w, x, g, z, yaw, len, 0.025 * scale, arch, 4, base, base);
    // Leaflet pairs along it, longest a third of the way up.
    const pairs = 8;
    for (let p = 1; p <= pairs; p++) {
      const t = p / (pairs + 1);
      const out = len * t * (0.35 + 0.65 * arch);
      const up = len * (t * (1 - arch * 0.85 * t));
      const px = x + fx * out;
      const pz = z + fz * out;
      const pl = len * 0.32 * Math.sin(Math.PI * (0.25 + 0.75 * t)) * (1 - t * 0.5);
      col2.copy(base).lerp(tip, 0.4 + 0.6 * t);
      for (let e = -1; e <= 1; e += 2) {
        // Each leaflet: a slim triangle angled forward and drooping a little.
        const sx = -fz * e * 0.85 + fx * 0.5;
        const sz = fx * e * 0.85 + fz * 0.5;
        const a = w.vertex(px, g + up, pz, 0, 1, 0, [col2.r, col2.g, col2.b, code(PROP.plant, t)]);
        const b = w.vertex(px + fx * pl * 0.22, g + up + 0.005, pz + fz * pl * 0.22, 0, 1, 0, [col2.r, col2.g, col2.b, code(PROP.plant, t)]);
        const c = w.vertex(px + sx * pl, g + up - pl * 0.25, pz + sz * pl, 0, 1, 0, [col2.r, col2.g, col2.b, code(PROP.plant, Math.min(1, t + 0.2))]);
        w.triFacing(a, b, c, 0, 1, 0);
      }
    }
  }
}
