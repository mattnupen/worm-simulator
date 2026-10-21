import { mulberry32 } from '../core/random';
import { MeshWriter } from '../surface/meshWriter';
import { PROP } from '../surface/propGeometry';
import { lin, mix, type Rgb } from '../predators/robinGeom';

/**
 * One dig marker's shape (V4 spec 4.2), about its centre on the ground (y 0 the litter's top), at
 * real size: a small mound of loose, dark, crumbly soil 1.1 u across (about 5 cm next to the 15 cm
 * worm) and, floating over it, a round down-arrow (a lathe: the same from every side, so it reads as
 * "down" from the low follow camera wherever it stands). The shape carries the meaning, not colour.
 * Built once at load; the marker mesh (digMarkMesh.ts) places and scales copies of it.
 */

/** The mound: rings out from its top (share of MOUND_R) and their height (u) over the ground. */
const RING_AT = [0.22, 0.45, 0.68, 0.86, 1, 1.12];
const RING_UP = [0.25, 0.22, 0.16, 0.09, 0.03, -0.07];
const MOUND_R = 0.55;
const MOUND_TOP = 0.27;
const SEGS = 18;
/** Crumbs lying on it: little lumps (12 points each). */
const CRUMBS = 16;
/**
 * The arrow's outline from its tip up (radius, height over the tip): the head (a cone with a flat
 * top), then the shaft and its rounded end. A corner repeats a point, so the light breaks there.
 */
const ARROW: readonly (readonly [number, number])[] = [
  [0, 0], [0.22, 0.3], [0.22, 0.3], [0.22, 0.34], [0.22, 0.34], [0.1, 0.34], [0.1, 0.34],
  [0.1, 0.6], [0.075, 0.655], [0, 0.67],
];
const ARROW_SIDES = 14;
/** The arrow's tip floats this far over the ground (the mound's top, and a gap). */
export const ARROW_LIFT = 0.42;

/** Fresh, loose soil: darker than the litter, brown-black crumbs (sRGB). */
const SOIL = lin(0x2e2118);
const SOIL_LIGHT = lin(0x4a3626);
/** Its crumbs, drying paler on top (sRGB). */
const CRUMB_RGB = lin(0x6e5641);
/**
 * The arrow: pale birch-bark cream, its flat top a shade warmer and the rim of its head a dark band,
 * so its outline holds against pale birch bark and sky as well as the dark litter (sRGB).
 */
const ARROW_RGB = lin(0xf1e7cf);
const ARROW_TOP = lin(0xe2cfa6);
const ARROW_RIM = lin(0x5a3a22);

export interface MarkShape {
  /** Points, normals and aProp (linear rgb, surface code) of one marker: the mound's first. */
  readonly pos: Float32Array;
  readonly nor: Float32Array;
  readonly prop: Float32Array;
  readonly index: Uint16Array;
  /** How many of the points are the mound's (the arrow's follow). */
  readonly moundVerts: number;
}

function vertex(w: MeshWriter, x: number, y: number, z: number, c: Rgb): number {
  return w.vertex(x, y, z, 0, 1, 0, [c[0], c[1], c[2], PROP.plain]);
}

function writeMound(w: MeshWriter): void {
  const rand = mulberry32(4271);
  const first = w.vertexCount;
  const firstIdx = w.idx.length;
  vertex(w, 0, MOUND_TOP, 0, SOIL);
  for (let r = 0; r < RING_AT.length; r++) {
    for (let k = 0; k < SEGS; k++) {
      const a = (k / SEGS) * Math.PI * 2;
      // Loose and lumpy: an uneven outline, and rougher heights down the slope.
      const d = RING_AT[r] * MOUND_R * (1 + 0.1 * Math.sin(3 * a + 1.3) + (rand() - 0.5) * 0.22);
      const up = RING_UP[r] + (r < 4 ? (rand() - 0.5) * 0.08 : 0);
      vertex(w, Math.cos(a) * d, up, Math.sin(a) * d, mix(SOIL, SOIL_LIGHT, rand() * 0.6));
    }
  }
  for (let k = 0; k < SEGS; k++) w.triFacing(first, first + 1 + ((k + 1) % SEGS), first + 1 + k, 0, 1, 0);
  for (let r = 0; r < RING_AT.length - 1; r++) {
    const a0 = first + 1 + r * SEGS;
    const b0 = a0 + SEGS;
    for (let k = 0; k < SEGS; k++) {
      const k1 = (k + 1) % SEGS;
      w.quad(a0 + k, a0 + k1, b0 + k1, b0 + k);
    }
  }
  w.smoothNormals(first, firstIdx);
  for (let i = 0; i < CRUMBS; i++) writeCrumb(w, rand);
}

/** A crumb of soil on the mound: a small, flattened, lumpy ball, a little paler (drying). */
function writeCrumb(w: MeshWriter, rand: () => number): void {
  const a = rand() * Math.PI * 2;
  const t = 0.2 + rand() * 0.65;
  const cx = Math.cos(a) * t * MOUND_R;
  const cz = Math.sin(a) * t * MOUND_R;
  const cy = MOUND_TOP * (1 - t * t * 0.85) - 0.005;
  const s = 0.03 + rand() * 0.03;
  const c = mix(CRUMB_RGB, SOIL_LIGHT, rand() * 0.7);
  const first = w.vertexCount;
  const firstIdx = w.idx.length;
  const rings = 3;
  const sides = 5;
  // A coarse ball (a top, two rings, a bottom), squashed and nudged so no two look alike.
  vertex(w, cx, cy + s * 0.7, cz, c);
  for (let r = 1; r <= rings - 1; r++) {
    const el = Math.PI * (r / rings - 0.5);
    for (let k = 0; k < sides; k++) {
      const az = (k / sides) * Math.PI * 2 + r * 0.6;
      const j = s * (0.8 + rand() * 0.45);
      vertex(w, cx + Math.cos(az) * Math.cos(el) * j, cy - Math.sin(el) * s * 0.7, cz + Math.sin(az) * Math.cos(el) * j, c);
    }
  }
  vertex(w, cx, cy - s * 0.6, cz, c);
  const last = w.vertexCount - 1;
  for (let k = 0; k < sides; k++) {
    const k1 = (k + 1) % sides;
    w.triFacing(first, first + 1 + k1, first + 1 + k, 0, 1, 0);
    w.triFacing(last, first + 1 + sides + k, first + 1 + sides + k1, 0, -1, 0);
    w.quad(first + 1 + k, first + 1 + k1, first + 1 + sides + k1, first + 1 + sides + k);
  }
  w.smoothNormals(first, firstIdx);
}

/** The down-arrow: a lathe of ARROW round the vertical, its tip at ARROW_LIFT over the ground. */
function writeArrow(w: MeshWriter): void {
  const first = w.vertexCount;
  const n = ARROW.length;
  for (let i = 0; i < n; i++) {
    // The outline's normal, across its segment here: at a corner (a repeated point) the first copy
    // takes the segment before it and the second the one after, so the light breaks there.
    const same = (p: number, q: number): boolean => ARROW[p][0] === ARROW[q][0] && ARROW[p][1] === ARROW[q][1];
    const lo = i === 0 || (i < n - 1 && same(i, i + 1)) ? Math.max(0, i - 1) : i > 0 && same(i, i - 1) ? i : i - 1;
    const hi = i === 0 ? 1 : i < n - 1 && same(i, i + 1) ? i : Math.min(n - 1, i + 1);
    const nr = ARROW[hi][1] - ARROW[lo][1];
    const ny = -(ARROW[hi][0] - ARROW[lo][0]);
    const top = i === 4 || i === 5;
    const rim = i === 2 || i === 3;
    for (let k = 0; k <= ARROW_SIDES; k++) {
      const a = (k / ARROW_SIDES) * Math.PI * 2;
      const r = ARROW[i][0];
      const c = rim ? ARROW_RIM : top ? ARROW_TOP : ARROW_RGB;
      w.vertex(Math.cos(a) * r, ARROW_LIFT + ARROW[i][1], Math.sin(a) * r, Math.cos(a) * nr, ny, Math.sin(a) * nr, [c[0], c[1], c[2], PROP.plain]);
    }
  }
  w.grid(first, n, ARROW_SIDES + 1);
}

let shape: MarkShape | null = null;

/** The marker's shape (built on first use). */
export function markShape(): MarkShape {
  if (shape) return shape;
  const w = new MeshWriter('aProp', 4);
  writeMound(w);
  const moundVerts = w.vertexCount;
  writeArrow(w);
  shape = {
    pos: Float32Array.from(w.pos), nor: Float32Array.from(w.nor), prop: Float32Array.from(w.extra),
    index: Uint16Array.from(w.idx), moundVerts,
  };
  return shape;
}
