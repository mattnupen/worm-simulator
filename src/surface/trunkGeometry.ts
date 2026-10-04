import type { Vec3 } from '../core/vec';
import type { MeshWriter } from './meshWriter';
import { trunkAxis, trunkRadius, RING_HEIGHTS, type TrunkParams } from './trunkShape';
import { LOG_END } from './propPlacement';

/** Bark surface kinds, read by the bark shader from aBark.z. */
export const BARK = { birch: 0, maple: 1, curlOuter: 2, curlInner: 3, wood: 4 } as const;

export interface TrunkSpec {
  x: number;
  z: number;
  /** Ground height at (x, z). */
  ground: number;
  params: TrunkParams;
  /** Horizontal offset of the top of the trunk (lean). */
  leanX: number;
  leanZ: number;
  species: number;
  seed: number;
  /**
   * The trunk's size against a Classic one (the world scale mode's): the bark pattern is laid out
   * in Classic metres (aBark.y divided by this), so a bigger trunk wears the same bark, bigger.
   * 1 when absent.
   */
  grow?: number;
}

const RADIAL = 14;
const TAU = Math.PI * 2;
const axis: Vec3 = { x: 0, y: 0, z: 0 };
const axis2: Vec3 = { x: 0, y: 0, z: 0 };

/** Point on the trunk surface at height h, angle a, pushed `off` out from the bark. */
export function trunkPoint(t: TrunkSpec, h: number, a: number, off: number, out: Vec3): Vec3 {
  trunkAxis(h, t.params.height, t.leanX, t.leanZ, axis);
  const r = trunkRadius(h, a, t.params) + off;
  out.x = t.x + axis.x + r * Math.cos(a);
  out.y = t.ground + axis.y;
  out.z = t.z + axis.z + r * Math.sin(a);
  return out;
}

/** Outward surface normal (unnormalised) from finite differences of the trunk surface. */
function trunkNormal(t: TrunkSpec, h: number, a: number, out: Vec3): Vec3 {
  const e = 0.01;
  const p = t.params;
  const r = trunkRadius(h, a, p);
  const dra = (trunkRadius(h, a + e, p) - trunkRadius(h, a - e, p)) / (2 * e);
  const drh = (trunkRadius(h + e, a, p) - trunkRadius(Math.max(-1, h - e), a, p)) / (2 * e);
  trunkAxis(h + e, p.height, t.leanX, t.leanZ, axis);
  trunkAxis(h - e, p.height, t.leanX, t.leanZ, axis2);
  const c = Math.cos(a);
  const s = Math.sin(a);
  // dP/da and dP/dh; outward normal = dP/dh x dP/da.
  const ax = dra * c - r * s;
  const az = dra * s + r * c;
  const hx = (axis.x - axis2.x) / (2 * e) + drh * c;
  const hz = (axis.z - axis2.z) / (2 * e) + drh * s;
  out.x = 1 * az - hz * 0;
  out.y = hz * ax - hx * az;
  out.z = hx * 0 - 1 * ax;
  return out;
}

/** A standing trunk with taper, lean and a buttressed root flare (buried at its base). */
export function writeTrunk(w: MeshWriter, t: TrunkSpec): void {
  const first = w.vertexCount;
  const p: Vec3 = { x: 0, y: 0, z: 0 };
  const n: Vec3 = { x: 0, y: 0, z: 0 };
  for (const hf of RING_HEIGHTS) {
    const h = hf * t.params.height;
    for (let c = 0; c <= RADIAL; c++) {
      const a = (c / RADIAL) * TAU;
      trunkPoint(t, h, a, 0, p);
      trunkNormal(t, h, a, n);
      w.vertex(p.x, p.y, p.z, n.x, n.y, n.z, [c / RADIAL, h / (t.grow ?? 1), t.species, t.seed]);
    }
  }
  w.grid(first, RING_HEIGHTS.length, RADIAL + 1);
}

/** Orthonormal u, v across a direction d, with u x v = -d (matches the trunk's winding). */
function frame(d: Vec3): [Vec3, Vec3] {
  const ref = Math.abs(d.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  let ux = d.y * ref.z - d.z * ref.y;
  let uy = d.z * ref.x - d.x * ref.z;
  let uz = d.x * ref.y - d.y * ref.x;
  const l = Math.hypot(ux, uy, uz);
  ux /= l; uy /= l; uz /= l;
  // v = u x d
  return [{ x: ux, y: uy, z: uz }, { x: uy * d.z - uz * d.y, y: uz * d.x - ux * d.z, z: ux * d.y - uy * d.x }];
}

/**
 * A tapered limb from `start` along unit `dir`; `along0` continues the bark's height coordinate
 * (in metres, divided by `grow` as TrunkSpec.grow).
 */
export function writeLimb(
  w: MeshWriter, start: Vec3, dir: Vec3, len: number, r0: number, r1: number,
  species: number, seed: number, along0: number, grow = 1,
): void {
  const [u, v] = frame(dir);
  const radial = 6;
  const rings = 3;
  const first = w.vertexCount;
  for (let i = 0; i < rings; i++) {
    const s = i / (rings - 1);
    const r = r0 + (r1 - r0) * s;
    // A slight upward bow.
    const bow = Math.sin(s * Math.PI) * len * 0.06;
    for (let c = 0; c <= radial; c++) {
      const a = (c / radial) * TAU;
      const nx = u.x * Math.cos(a) + v.x * Math.sin(a);
      const ny = u.y * Math.cos(a) + v.y * Math.sin(a);
      const nz = u.z * Math.cos(a) + v.z * Math.sin(a);
      w.vertex(
        start.x + dir.x * s * len + nx * r, start.y + dir.y * s * len + ny * r + bow, start.z + dir.z * s * len + nz * r,
        nx, ny, nz, [c / radial, (along0 + s * len) / grow, species, seed],
      );
    }
  }
  w.grid(first, rings, radial + 1);
}

/**
 * A curl of peeling paper-birch bark: a strip hanging from height h0, lifting away from the
 * trunk as it goes down. Two layers: chalky outer bark and the salmon inner face. `grow` scales
 * how far it lifts off the bark (the trunk's size against a Classic one).
 */
export function writeCurl(
  w: MeshWriter, t: TrunkSpec, a0: number, h0: number, len: number, width: number, grow = 1,
): void {
  const rows = 4;
  const p: Vec3 = { x: 0, y: 0, z: 0 };
  for (const layer of [0, 1]) {
    const first = w.vertexCount;
    // Rows from the bottom (most lifted) up to where the strip is still attached.
    for (let i = rows - 1; i >= 0; i--) {
      const s = i / (rows - 1);
      const off = (0.004 + 0.075 * s * s - layer * 0.004) * grow;
      const h = h0 - len * s + len * 0.25 * s * s * s;
      const tilt = -0.15 * s * grow / len;
      for (let c = 0; c < 2; c++) {
        const a = a0 + (c - 0.5) * width * (1 - 0.35 * s);
        trunkPoint(t, h, a, off, p);
        const sgn = layer === 0 ? 1 : -1;
        w.vertex(p.x, p.y, p.z, Math.cos(a) * sgn, tilt * sgn, Math.sin(a) * sgn,
          [c, h / (t.grow ?? 1), layer === 0 ? 2 : 3, t.seed]);
      }
    }
    w.grid(first, rows, 2, layer === 1);
  }
}

/**
 * A fallen trunk lying along `yaw`, settled into the ground (`groundAt`), with jagged,
 * rotted broken ends showing pale wood. `grow` as TrunkSpec.grow (the bark pattern's size).
 */
export function writeLog(
  w: MeshWriter, cx: number, cz: number, yaw: number, length: number, radius: number,
  species: number, seed: number, groundAt: (x: number, z: number) => number, grow = 1,
): void {
  const d: Vec3 = { x: Math.cos(yaw), y: 0, z: Math.sin(yaw) };
  const [u, v] = frame(d);
  const rings = 11;
  const radial = 12;
  const first = w.vertexCount;
  const centre = (s: number, out: Vec3) => {
    const x = cx + d.x * s;
    const z = cz + d.z * s;
    out.x = x;
    out.y = groundAt(x, z) + radius * 0.55;
    out.z = z;
    return out;
  };
  const c0: Vec3 = { x: 0, y: 0, z: 0 };
  const ends: number[][] = [[], []];
  for (let i = 0; i < rings; i++) {
    const f = i / (rings - 1);
    const sMid = (f - 0.5) * length;
    const r = radius * (1.06 - 0.12 * f) * (1 + 0.08 * Math.sin(f * 9 + seed * 5));
    for (let c = 0; c <= radial; c++) {
      const a = (c / radial) * TAU;
      // Broken ends are jagged, up to LOG_END past the length per unit of grow (a big log's
      // splinters are as big as it is, so its ends do not look sawn off). A grown log's seam
      // vertex (c = radial) repeats c = 0's jag so the end closes; Classic (grow 1) keeps Step 1a's
      // hairline open seam, as its geometry is pinned.
      const cj = grow === 1 ? c : c % radial;
      const jag = i === 0 || i === rings - 1 ? (Math.sin(cj * 2.7 + seed * 11) * 0.5 + 0.5) * LOG_END * grow * (i === 0 ? -1 : 1) : 0;
      centre(sMid + jag, c0);
      const nx = u.x * Math.cos(a) + v.x * Math.sin(a);
      const ny = u.y * Math.cos(a) + v.y * Math.sin(a);
      const nz = u.z * Math.cos(a) + v.z * Math.sin(a);
      const idx = w.vertex(c0.x + nx * r, c0.y + ny * r, c0.z + nz * r, nx, ny, nz, [c / radial, (f * length) / grow, species, seed]);
      if (i === 0) ends[0].push(idx);
      if (i === rings - 1) ends[1].push(idx);
    }
  }
  w.grid(first, rings, radial + 1);
  // End caps: rotted, hollowed pale wood (aBark.x = radial fraction for growth rings).
  ends.forEach((ring, e) => {
    const sgn = e === 0 ? -1 : 1;
    centre(sgn * (length / 2 - radius * 0.25), c0);
    const mid = w.vertex(c0.x, c0.y, c0.z, d.x * sgn, 0, d.z * sgn, [0, 0, BARK.wood, seed]);
    const rim = ring.map((k) => w.vertex(
      w.pos[k * 3], w.pos[k * 3 + 1], w.pos[k * 3 + 2], d.x * sgn, 0, d.z * sgn, [1, 0, BARK.wood, seed],
    ));
    for (let k = 0; k < rim.length - 1; k++) w.triFacing(mid, rim[k], rim[k + 1], d.x * sgn, 0, d.z * sgn);
  });
}
