import { mulberry32 } from '../core/random';
import { MeshWriter } from '../surface/meshWriter';
import { PROP } from '../surface/propGeometry';
import { lin, mix, type Rgb } from '../predators/robinGeom';
import { writeLump } from './middenBits';

/**
 * One casting mound's shape (V4 spec, revision 1 item 3; placed by mounds.ts), about its centre on
 * the ground (y 0 the litter's top), at real size: a nightcrawler's casting mound with its burrow open in the middle.
 * A low heap of dark castings (piled, knobbly pellets, as the middens of old openings, middens.ts)
 * round a round, open hole: a pale crumbly lip, dark walls going down, a black floor, so from the
 * low follow camera you see into it. The shape carries the meaning ("a worm hole here"), not
 * colour. Built once at load; the mound mesh (moundMesh.ts) places copies of it.
 *
 * Game choice: a real midden is about 5 cm across and its hole about as wide as the worm (Great
 * Lakes Worm Watch). This one is a little bigger (1.5 u, about 6.5 cm, next to the 15 cm worm) and
 * its hole a little wider (about 1.5 worm widths), so it reads from a few worm lengths away.
 */

/**
 * The heap's rings out from the centre (u) and their height over the ground (u): the hole's floor
 * (well over the litter's top, so no drawn leaf crosses it), its walls up to the lip, the rim, the
 * slope of castings, its foot, then tucked in under the leaves.
 */
export const RING_R: readonly number[] = [0.14, 0.175, 0.19, 0.225, 0.3, 0.41, 0.53, 0.65, 0.75, 0.8];
export const RING_UP: readonly number[] = [0.11, 0.19, 0.28, 0.33, 0.34, 0.28, 0.19, 0.1, 0.02, -0.08];
/** The centre of the hole's floor (u over the ground). */
export const HOLE_FLOOR = 0.1;
/** Rings before this one are the hole (dark); this one is the lip. */
export const LIP_RING = 3;
/** The hole's radius (u) at the top of its walls. */
export const HOLE_R = RING_R[2];
/** The heap's outer edge (u), at the litter's top. */
export const MOUND_R = RING_R[8];
/** The heap's top over the ground (u): its highest ring, a little over for its lumps. */
export const MOUND_TOP = Math.max(...RING_UP) + 0.02;
const SEGS = 22;
/** Casting pellets piled on the heap (23 points each: about 780 points a mound; 10 mounds are always out). */
const PELLETS = 24;

/** Castings: dark grey-brown, as the middens' (sRGB); the pellets a little paler (drying). */
const CAST = [lin(0x2c231d), lin(0x382d25), lin(0x43372d), lin(0x30271f)];
const PELLET = [lin(0x4e3e31), lin(0x5a493b), lin(0x433528), lin(0x66533f)];
/** The lip: drier, paler crumbs, so the hole's round edge holds against the dark inside. */
export const LIP = lin(0x8a7461);
/** The hole: its walls darken going down to a near-black floor. */
export const WALL_TOP = lin(0x1a130e);
export const WALL = lin(0x0b0806);
const FLOOR: Rgb = [0.004, 0.003, 0.002];

export interface MarkShape {
  /** Points, normals and aProp (linear rgb, surface code) of one marker. */
  readonly pos: Float32Array;
  readonly nor: Float32Array;
  readonly prop: Float32Array;
  readonly index: Uint16Array;
}

function vertex(w: MeshWriter, x: number, y: number, z: number, c: Rgb): number {
  return w.vertex(x, y, z, 0, 1, 0, [c[0], c[1], c[2], PROP.plain]);
}

/** The heap and its hole: the floor's centre, then ring after ring out to the foot. */
function writeHeap(w: MeshWriter, rand: () => number): void {
  const first = w.vertexCount;
  const firstIdx = w.idx.length;
  vertex(w, 0, HOLE_FLOOR, 0, FLOOR);
  const p1 = rand() * 6.28;
  const p2 = rand() * 6.28;
  for (let r = 0; r < RING_R.length; r++) {
    // The hole stays round; the heap outside it is lumpy and a little lopsided.
    const out = r > LIP_RING && r < RING_R.length - 2;
    for (let k = 0; k < SEGS; k++) {
      const a = (k / SEGS) * Math.PI * 2;
      const d = RING_R[r] * (r > LIP_RING ? 1 + 0.1 * Math.sin(2 * a + p1) + 0.06 * Math.sin(5 * a + p2) + (rand() - 0.5) * 0.1 : 1);
      const up = out ? RING_UP[r] * (1 + 0.15 * Math.sin(a + p2)) + (rand() - 0.5) * 0.05 : RING_UP[r];
      const c = r === 0 ? WALL : r < LIP_RING ? WALL_TOP : r === LIP_RING ? mix(LIP, CAST[1], rand() * 0.3)
        : mix(CAST[Math.floor(rand() * CAST.length)], LIP, r === LIP_RING + 1 ? 0.35 : rand() * 0.2);
      vertex(w, Math.cos(a) * d, up, Math.sin(a) * d, c);
    }
  }
  for (let k = 0; k < SEGS; k++) w.triFacing(first, first + 1 + ((k + 1) % SEGS), first + 1 + k, 0, 1, 0);
  for (let r = 0; r < RING_R.length - 1; r++) {
    const a0 = first + 1 + r * SEGS;
    const b0 = a0 + SEGS;
    for (let k = 0; k < SEGS; k++) {
      const k1 = (k + 1) % SEGS;
      w.quad(a0 + k, a0 + k1, b0 + k1, b0 + k);
    }
  }
  w.smoothNormals(first, firstIdx);
}

/** The heap's height (u) at distance d from the centre, outside the hole (its rings, unjittered). */
export function heapAt(d: number): number {
  let k = LIP_RING + 1;
  while (k < RING_R.length - 1 && RING_R[k] < d) k++;
  const f = Math.min(1, Math.max(0, (d - RING_R[k - 1]) / (RING_R[k] - RING_R[k - 1])));
  return RING_UP[k - 1] + (RING_UP[k] - RING_UP[k - 1]) * f;
}

/**
 * Casting pellet n on the heap: a knobbly lump half sunk in it (as the middens' lumps), most of
 * them piled near the lip, where the worm pushes them out.
 */
function writePellet(w: MeshWriter, rand: () => number, n: number): void {
  const a = n * 2.39996 + rand() * 0.4;
  const d = HOLE_R + 0.06 + Math.pow(rand(), 1.2) * 0.45;
  const s = 0.045 + Math.pow(rand(), 2) * 0.045;
  const c = mix(PELLET[Math.floor(rand() * PELLET.length)], LIP, rand() * 0.3);
  writeLump(w, Math.cos(a) * d, heapAt(d) - s * 0.2, Math.sin(a) * d, s, c, rand);
}

let shape: MarkShape | null = null;

/** The marker's shape (built on first use). */
export function markShape(): MarkShape {
  if (shape) return shape;
  const w = new MeshWriter('aProp', 4);
  const rand = mulberry32(4271);
  writeHeap(w, rand);
  for (let n = 0; n < PELLETS; n++) writePellet(w, rand, n);
  shape = { pos: Float32Array.from(w.pos), nor: Float32Array.from(w.nor), prop: Float32Array.from(w.extra), index: Uint16Array.from(w.idx) };
  return shape;
}
