import * as THREE from 'three';
import { B_TOP, B_F, B_H, B_A, B_E, B_B, SLAB_HALF, boundaryOf, bound, slabX, slabZ, type Slab, type UV } from './slab';
import { GRID_H, GRID_W, CELL, HOLLOW_H, HOLLOW_MAX, HOLLOW_SHIFT, HOLLOW_STEP, HOLLOW_W, markHollowWhole, takeHollowCastDirty, takeHollowDirty, type HollowRect, type SoilGrid } from './soilGrid';
import { CUT_FRAGMENT, CUT_VERTEX } from './cutFaceGlsl';

/**
 * The tunnels in 3D (spec 2026-10-08 section 4.3): the hollow (soilGrid.ts) drawn as fine tiles
 * pushed back behind the face by its depth. One mesh, one draw: a pool of TILE_U square tiles over
 * the soil grid, every slot built at load and claimed in turn as tunnels reach a tile (the draw
 * range covers the claimed slots). Where a tile has no hollow it lies BEHIND the face, hidden;
 * where the face cuts its hole (cutFaceGlsl.ts) the tile shows the tunnel's back half, lit by its
 * own normals, in the same soil colours as the face (one shader, HOLLOW defined). Only tiles a dig
 * or a casting changed are rewritten, each uploaded as its own range: the head's digs and the
 * tail's castings (some 3 u apart) are two dirty rectangles, so the tiles between are not touched.
 * Allocates nothing after load.
 */
export const TILE_U = 0.5;
/** Quads along a tile's side: 1/24 u apart, about 7 across a tunnel. */
export const TILE_QUADS = 12;
const TV = TILE_QUADS + 1;
export const VERTS_PER_TILE = TV * TV;
export const INDICES_PER_TILE = TILE_QUADS * TILE_QUADS * 6;
export const TILES_W = Math.ceil((2 * SLAB_HALF) / TILE_U);
export const TILES_H = Math.ceil((GRID_H * CELL) / TILE_U);
const SLOTS = TILES_W * TILES_H;
/** Where there is no hollow, a tile lies this far (u) behind the face, hidden by it. */
export const BEHIND = 0.004;
/** A tile is claimed for hollow within this (u) of its edges: the face's hole reaches a little past the dig. */
const CLAIM_MARGIN = 0.1;
const QUAD = TILE_U / TILE_QUADS;
/** Hollow samples along a tile's side, and in its claim margin. */
const PER = Math.round(TILE_U / HOLLOW_STEP);
const MARGIN = Math.round(CLAIM_MARGIN / HOLLOW_STEP);

export interface HollowMesh {
  readonly mesh: THREE.Mesh;
  /**
   * A new slab: every slot freed, and the whole hollow marked changed, so the next upload scans
   * every tile (on a fresh slab from fillSoilGrid, which sets g.v0 and zeroes the hollow, it claims
   * none).
   */
  setSlab(s: Slab, g: SoilGrid): void;
  /** Claims and rewrites the tiles the hollow changed in since the last call. */
  upload(g: SoilGrid): void;
  /** Slot of each tile (row-major from the grid's bottom left), -1 unclaimed. */
  readonly slotOf: Int16Array;
  used(): number;
}

/** One hollow sample, 0..255 (0 outside the map). Integers only, so nothing is boxed. */
function sample(g: SoilGrid, c: number, r: number): number {
  return c < 0 || c >= HOLLOW_W || r < 0 || r >= HOLLOW_H ? 0 : g.hollow[r * HOLLOW_W + c];
}

/** Where depthAt reads, and what it found (u): its doubles cross no call (solidShapes.ts). */
const probe: UV = { u: 0, v: 0 };
const found = { d: 0 };

/** The hollow's depth (u) at `probe`, bilinear between samples, into `found.d`; 0 outside the map. */
function depthAt(g: SoilGrid): void {
  const fx = (probe.u + SLAB_HALF) / HOLLOW_STEP - 0.5;
  const fy = (probe.v - g.v0) / HOLLOW_STEP - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const s00 = sample(g, x0, y0);
  const s10 = sample(g, x0 + 1, y0);
  const s01 = sample(g, x0, y0 + 1);
  const s11 = sample(g, x0 + 1, y0 + 1);
  found.d = (((s00 * (1 - tx) + s10 * tx) * (1 - ty) + (s01 * (1 - tx) + s11 * tx) * ty) * HOLLOW_MAX) / 255;
}

export function createHollowMesh(uniforms: Record<string, THREE.IUniform>): HollowMesh {
  const nv = SLOTS * VERTS_PER_TILE;
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(nv * 3), 3);
  // Normals as normalized bytes, four to a vertex (the fourth is padding, 0): 4 B a vertex, not 12,
  // and an aligned vertex format that no GL backend has to convert (a 3-byte one may be).
  const nrm = new THREE.BufferAttribute(new Int8Array(nv * 4), 4, true);
  const depth = new THREE.BufferAttribute(new Float32Array(nv), 1);
  const plane = new THREE.BufferAttribute(new Float32Array(nv * 2), 2);
  const ba = new THREE.BufferAttribute(new Float32Array(nv * 4), 4);
  const bb = new THREE.BufferAttribute(new Float32Array(nv * 2), 2);
  const attrs = [pos, nrm, depth, plane, ba, bb] as const;
  for (const a of attrs) a.setUsage(THREE.DynamicDrawUsage);
  const index = new Uint32Array(SLOTS * INDICES_PER_TILE);
  for (let slot = 0, o = 0; slot < SLOTS; slot++) {
    const base = slot * VERTS_PER_TILE;
    for (let y = 0; y < TILE_QUADS; y++) {
      for (let x = 0; x < TILE_QUADS; x++) {
        const a = base + y * TV + x;
        index[o++] = a; index[o++] = a + 1; index[o++] = a + TV;
        index[o++] = a + TV; index[o++] = a + 1; index[o++] = a + TV + 1;
      }
    }
  }
  geo.setAttribute('position', pos);
  geo.setAttribute('aSlabNormal', nrm);
  geo.setAttribute('aDepth', depth);
  geo.setAttribute('aPlane', plane);
  geo.setAttribute('aBoundsA', ba);
  geo.setAttribute('aBoundsB', bb);
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.setDrawRange(0, 0);
  geo.boundingSphere = new THREE.Sphere();

  // One fixed update range per slot and attribute (in array elements, as three r186 reads them),
  // each queued once until the renderer uploads. three merges adjacent ranges in place by growing
  // the first one's count (WebGLAttributes), so a range's count is reset each time it is queued.
  // The first upload (bufferData) sends the whole buffer and leaves the queue as it was: clear it.
  const ranges = attrs.map((a) => Array.from({ length: SLOTS }, (_, k) => ({ start: k * VERTS_PER_TILE * a.itemSize, count: 0 })));
  const queued = attrs.map(() => new Uint8Array(SLOTS));
  attrs.forEach((a, j) => {
    a.onUpload(() => {
      a.clearUpdateRanges();
      queued[j].fill(0);
    });
  });
  function queue(j: number, slot: number): void {
    if (queued[j][slot]) return;
    queued[j][slot] = 1;
    const a = attrs[j];
    const r = ranges[j][slot];
    r.count = VERTS_PER_TILE * a.itemSize;
    a.updateRanges.push(r);
    a.needsUpdate = true;
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    defines: { HOLLOW: '' },
    vertexShader: CUT_VERTEX,
    fragmentShader: CUT_FRAGMENT,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'cutHollow';

  const slotOf = new Int16Array(SLOTS).fill(-1);
  let used = 0;
  let slab: Slab | null = null;
  const dirty: HollowRect = { c0: 0, c1: -1, r0: 0, r1: -1 };
  const castDirty: HollowRect = { c0: 0, c1: -1, r0: 0, r1: -1 };
  const at: UV = { u: 0, v: 0 };

  /**
   * Writes slot `slot`'s depths, positions and normals from the hollow, at the plane points claim()
   * wrote (rows above the soil's top lie on it).
   */
  function writeDepths(g: SoilGrid, s: Slab, slot: number): void {
    const P = pos.array as Float32Array;
    const Nn = nrm.array as Int8Array;
    const D = depth.array as Float32Array;
    const Q = plane.array as Float32Array;
    const h = HOLLOW_STEP;
    for (let y = 0; y < TV; y++) {
      for (let x = 0; x < TV; x++) {
        const k = slot * VERTS_PER_TILE + y * TV + x;
        const u = Q[k * 2];
        const v = Q[k * 2 + 1];
        probe.u = u; probe.v = v;
        depthAt(g);
        const d = found.d;
        const w = Math.max(BEHIND, d);
        P[k * 3] = s.ox + s.tx * u - s.nx * w;
        P[k * 3 + 1] = v;
        P[k * 3 + 2] = s.oz + s.tz * u - s.nz * w;
        D[k] = d;
        // The surface is w = -depth(u, v): its normal (slab frame: u, v, toward the camera) is
        // (dDepth/du, dDepth/dv, 1), normalised; the slopes by central differences one sample apart.
        probe.u = u + h; depthAt(g); const du1 = found.d;
        probe.u = u - h; depthAt(g); const du0 = found.d;
        probe.u = u; probe.v = v + h; depthAt(g); const dv1 = found.d;
        probe.v = v - h; depthAt(g); const dv0 = found.d;
        const gu = (du1 - du0) / (2 * h);
        const gv = (dv1 - dv0) / (2 * h);
        const l = 127 / Math.sqrt(gu * gu + gv * gv + 1);
        Nn[k * 4] = Math.round(gu * l);
        Nn[k * 4 + 1] = Math.round(gv * l);
        Nn[k * 4 + 2] = Math.round(l);
      }
    }
    queue(0, slot);
    queue(1, slot);
    queue(2, slot);
  }

  /**
   * Claims tile `tile` into the next slot: its plane points and layer boundaries, then its depths.
   * No vertex goes above its column's litter top (there is no face there to hide the tile): rows
   * above it lie on the top line, their triangles flat and empty.
   */
  function claim(g: SoilGrid, s: Slab, tile: number): void {
    const slot = used++;
    slotOf[tile] = slot;
    const tu = (tile % TILES_W) * TILE_U - SLAB_HALF;
    const tv = Math.floor(tile / TILES_W) * TILE_U + g.v0;
    const Q = plane.array as Float32Array;
    const A = ba.array as Float32Array;
    const B = bb.array as Float32Array;
    for (let x = 0; x < TV; x++) {
      at.u = tu + x * QUAD;
      boundaryOf(s, B_TOP, at); const top = bound.v;
      boundaryOf(s, B_F, at); const f = bound.v;
      boundaryOf(s, B_H, at); const hh = bound.v;
      boundaryOf(s, B_A, at); const a = bound.v;
      boundaryOf(s, B_E, at); const e = bound.v;
      boundaryOf(s, B_B, at); const b = bound.v;
      for (let y = 0; y < TV; y++) {
        const k = slot * VERTS_PER_TILE + y * TV + x;
        Q[k * 2] = at.u;
        Q[k * 2 + 1] = Math.min(tv + y * QUAD, top);
        A[k * 4] = top; A[k * 4 + 1] = f; A[k * 4 + 2] = hh; A[k * 4 + 3] = a;
        B[k * 2] = e; B[k * 2 + 1] = b;
      }
    }
    queue(3, slot);
    queue(4, slot);
    queue(5, slot);
    writeDepths(g, s, slot);
    geo.setDrawRange(0, used * INDICES_PER_TILE);
  }

  /**
   * Any hollow sample or open grid cell (castings included: the face's hole is cut there too) in
   * tile `tile`, its edges widened by CLAIM_MARGIN. The open cells matter where the face's hole
   * reaches past the last carved sample (a cell opened at the dig's rim, its samples just outside).
   */
  function needs(g: SoilGrid, tile: number): boolean {
    const tc = (tile % TILES_W) * PER;
    const tr = Math.floor(tile / TILES_W) * PER;
    const c0 = Math.max(0, tc - MARGIN);
    const c1 = Math.min(HOLLOW_W - 1, tc + PER - 1 + MARGIN);
    const r0 = Math.max(0, tr - MARGIN);
    const r1 = Math.min(HOLLOW_H - 1, tr + PER - 1 + MARGIN);
    for (let r = r0; r <= r1; r++) {
      const o = r * HOLLOW_W;
      for (let c = c0; c <= c1; c++) if (g.hollow[o + c]) return true;
    }
    for (let r = r0 >> HOLLOW_SHIFT; r <= r1 >> HOLLOW_SHIFT; r++) {
      const o = r * GRID_W;
      for (let c = c0 >> HOLLOW_SHIFT; c <= c1 >> HOLLOW_SHIFT; c++) if (g.open[o + c]) return true;
    }
    return false;
  }

  /** Tile columns t0..t1 and rows s0..s1 (t0 > t1: none), from span(). */
  const tiles = { t0: 0, t1: -1, s0: 0, s1: -1 };
  /**
   * The tiles rectangle `d` reaches, into `tiles`: a sample moves the vertices within one sample of
   * it (bilinear) and their normals one more, and a tile within MARGIN samples may need claiming.
   * Integers only.
   */
  function span(d: HollowRect): void {
    if (d.c0 > d.c1) {
      tiles.t0 = 0; tiles.t1 = -1; tiles.s0 = 0; tiles.s1 = -1;
      return;
    }
    tiles.t0 = Math.max(0, Math.floor((d.c0 - MARGIN) / PER));
    tiles.t1 = Math.min(TILES_W - 1, Math.floor((d.c1 + MARGIN) / PER));
    tiles.s0 = Math.max(0, Math.floor((d.r0 - MARGIN) / PER));
    tiles.s1 = Math.min(TILES_H - 1, Math.floor((d.r1 + MARGIN) / PER));
  }

  /**
   * Rewrites the claimed tiles in columns t0..t1, rows s0..s1, and claims those that now need it,
   * skipping the tiles in columns k0..k1, rows j0..j1 (already done). Integers only.
   */
  function rewrite(g: SoilGrid, s: Slab, t0: number, t1: number, s0: number, s1: number, k0: number, k1: number, j0: number, j1: number): void {
    for (let ty = s0; ty <= s1; ty++) {
      const skipRow = ty >= j0 && ty <= j1;
      for (let tx = t0; tx <= t1; tx++) {
        if (skipRow && tx >= k0 && tx <= k1) continue;
        const tile = ty * TILES_W + tx;
        const slot = slotOf[tile];
        if (slot >= 0) writeDepths(g, s, slot);
        else if (needs(g, tile)) claim(g, s, tile);
      }
    }
  }

  return {
    mesh,
    slotOf,
    used: () => used,
    setSlab(s, g) {
      slab = s;
      slotOf.fill(-1);
      used = 0;
      geo.setDrawRange(0, 0);
      // The whole soil grid (every tile the pool may claim), with 1 u to spare: one sphere for the
      // slab, so claiming tiles never touches it.
      geo.boundingSphere!.center.set(slabX(s, 0), g.v0 + (GRID_H * CELL) / 2, slabZ(s, 0));
      geo.boundingSphere!.radius = Math.hypot(SLAB_HALF, (GRID_H * CELL) / 2) + 1;
      markHollowWhole(g);
    },
    upload(g) {
      const s = slab;
      if (!s) return;
      takeHollowDirty(g, dirty);
      takeHollowCastDirty(g, castDirty);
      // The digs' tiles, then the castings' (skipping any the digs' already rewrote).
      span(dirty);
      const t0 = tiles.t0;
      const t1 = tiles.t1;
      const s0 = tiles.s0;
      const s1 = tiles.s1;
      rewrite(g, s, t0, t1, s0, s1, 0, -1, 0, -1);
      span(castDirty);
      rewrite(g, s, tiles.t0, tiles.t1, tiles.s0, tiles.s1, t0, t1, s0, s1);
    },
  };
}
