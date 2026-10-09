import * as THREE from 'three';
import { sharedLighting } from '../render/paintedMaterial';
import {
  BOUNDS, COLUMN_STEP, FACE_EXTRA, SLAB_HALF, B_TOP, B_F, B_H, B_A, B_E, B_B, slabX, slabZ, type Slab,
} from './slab';
import { CELL, GRID_W, GRID_H, takeDirty, touch, type SoilGrid } from './soilGrid';
import { packRows } from './soilGridEdit';
import { FACE_BELOW } from './cutFrame';
import { FACE_FADE } from './faceLight';
import { CUT_FRAGMENT, CUT_VERTEX } from './cutFaceGlsl';
import { createSoilTiles } from './soilTiles';

/** Columns drawn past each end of the face (FACE_FADE), where it fades to deep soil. */
const PAST_COLS = Math.ceil(FACE_FADE / COLUMN_STEP);
/** Most columns any slab's face has: the full drawn width and the fading columns past its ends. */
const MAX_COLS = Math.round((2 * (SLAB_HALF + FACE_EXTRA)) / COLUMN_STEP) + 1 + 2 * PAST_COLS;
const ROW_BYTES = GRID_W * 4;

/**
 * 1 where the cell is tunnel, castings in it included: the face's hole is the whole tunnel, and the
 * hollow tiles behind draw a casting as a mound in it (cutFaceGlsl.ts). A casting leaves only a
 * one-cell band open, which a blur of open-only cells would close over on the face (a plug).
 */
const bore = (g: SoilGrid, i: number): number => g.open[i];

/**
 * Rows lo..hi's tunnel byte (R) as a 3 x 3 tent blur of the open cells: with the face's
 * bilinear reads on top, a tunnel's 0.1 u cells draw as a round bore, its edges free of stair steps.
 * Allocates nothing.
 */
function blurBores(g: SoilGrid, bytes: Uint8Array, lo: number, hi: number): void {
  for (let r = lo; r <= hi; r++) {
    const r0 = Math.max(0, r - 1) * GRID_W;
    const r1 = r * GRID_W;
    const r2 = Math.min(GRID_H - 1, r + 1) * GRID_W;
    for (let c = 0; c < GRID_W; c++) {
      const c0 = Math.max(0, c - 1);
      const c2 = Math.min(GRID_W - 1, c + 1);
      const sum = bore(g, r0 + c0) + 2 * bore(g, r0 + c) + bore(g, r0 + c2)
        + 2 * (bore(g, r1 + c0) + 2 * bore(g, r1 + c) + bore(g, r1 + c2))
        + bore(g, r2 + c0) + 2 * bore(g, r2 + c) + bore(g, r2 + c2);
      bytes[(r1 + c) * 4] = Math.round((sum * 255) / 16);
    }
  }
}

export interface CutFace {
  readonly mesh: THREE.Mesh;
  /** Lays the face along a new slab (positions and boundaries rewritten in place). */
  setSlab(s: Slab, g: SoilGrid): void;
  /** Uploads the grid rows that changed since the last call (all of them after setSlab). Allocates nothing. */
  upload(g: SoilGrid): void;
  /** The face's uniforms, shared with the hollow tiles (hollowMesh.ts). */
  readonly uniforms: Record<string, THREE.IUniform>;
}

/**
 * The cut face (V2 spec 5, 10): one strip mesh and one shader, built once at load at its biggest
 * and reused for every slab, with the layers' pattern tiles painted once (soilTiles.ts). It
 * reaches FACE_BELOW under the slab and FACE_FADE past the face's ends, fading to deep soil there, so
 * no frame of the cut camera (cutFrame.ts) shows its edge. The soil grid is a GRID_W x GRID_H
 * data texture (packRows, with the tunnels softened: blurBores): after a new slab it uploads
 * whole, then only the rows that changed, one update range per row (three r186 uploads each
 * range as a single row).
 */
export function createCutFace(): CutFace {
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(MAX_COLS * 2 * 3), 3);
  const plane = new THREE.BufferAttribute(new Float32Array(MAX_COLS * 2 * 2), 2);
  const ba = new THREE.BufferAttribute(new Float32Array(MAX_COLS * 2 * 4), 4);
  const bb = new THREE.BufferAttribute(new Float32Array(MAX_COLS * 2 * 2), 2);
  const index = new Uint16Array((MAX_COLS - 1) * 6);
  for (let c = 0; c < MAX_COLS - 1; c++) {
    // Vertex 2c is the column's top, 2c + 1 its bottom.
    const a = 2 * c;
    index.set([a, a + 1, a + 2, a + 2, a + 1, a + 3], c * 6);
  }
  geo.setAttribute('position', pos);
  geo.setAttribute('aPlane', plane);
  geo.setAttribute('aBoundsA', ba);
  geo.setAttribute('aBoundsB', bb);
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.boundingSphere = new THREE.Sphere();

  const bytes = new Uint8Array(GRID_W * GRID_H * 4);
  const soil = new THREE.DataTexture(bytes, GRID_W, GRID_H, THREE.RGBAFormat, THREE.UnsignedByteType);
  soil.magFilter = THREE.LinearFilter;
  soil.minFilter = THREE.LinearFilter;
  soil.generateMipmaps = false;
  soil.colorSpace = THREE.NoColorSpace;
  // One fixed update range per row, so queueing rows allocates nothing; each row is queued once
  // until the renderer has uploaded it. A whole upload stays whole until the renderer has made it
  // (the face may be off screen for a frame or two while the worm digs on).
  const rows = Array.from({ length: GRID_H }, (_, r) => ({ start: r * ROW_BYTES, count: ROW_BYTES }));
  const queued = new Uint8Array(GRID_H);
  const dirty = { lo: 0, hi: -1 };
  let whole = true;
  soil.onUpdate = () => {
    whole = false;
    queued.fill(0);
  };

  const tiles = createSoilTiles();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uNoise: sharedLighting.uNoise,
      uLitter: { value: tiles.litter },
      uOldLeaves: { value: tiles.oldLeaves },
      uGrain: { value: tiles.grain },
      uLightColor: sharedLighting.uLightColor,
      uResolution: sharedLighting.uResolution,
      uSoil: { value: soil },
      uGrid: { value: new THREE.Vector4(-SLAB_HALF, 0, 1 / (GRID_W * CELL), 1 / (GRID_H * CELL)) },
      uPlay: { value: new THREE.Vector2(-SLAB_HALF, SLAB_HALF) },
      uFace: { value: new THREE.Vector2(-SLAB_HALF, SLAB_HALF) },
      uBottom: { value: 0 },
    },
    vertexShader: CUT_VERTEX,
    fragmentShader: CUT_FRAGMENT,
    // The camera may be on either side of the cut: both faces draw (a side switch would recompile).
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'cutFace';

  return {
    mesh,
    uniforms: material.uniforms,
    setSlab(s, g) {
      const p = pos.array as Float32Array;
      const q = plane.array as Float32Array;
      const A = ba.array as Float32Array;
      const B = bb.array as Float32Array;
      const bottom = s.bottom - FACE_BELOW;
      const n = s.cols + 2 * PAST_COLS;
      for (let i = 0; i < n; i++) {
        // Past the face's ends the end column's boundaries carry on (it fades to dark there).
        const c = Math.min(s.cols - 1, Math.max(0, i - PAST_COLS));
        const u = s.faceLo + (i - PAST_COLS) * COLUMN_STEP;
        const x = slabX(s, u);
        const z = slabZ(s, u);
        const o = c * BOUNDS;
        const top = s.bounds[o + B_TOP];
        for (let k = 0; k < 2; k++) {
          const v = 2 * i + k;
          const y = k === 0 ? top : bottom;
          p[v * 3] = x; p[v * 3 + 1] = y; p[v * 3 + 2] = z;
          q[v * 2] = u; q[v * 2 + 1] = y;
          A[v * 4] = top; A[v * 4 + 1] = s.bounds[o + B_F]; A[v * 4 + 2] = s.bounds[o + B_H]; A[v * 4 + 3] = s.bounds[o + B_A];
          B[v * 2] = s.bounds[o + B_E]; B[v * 2 + 1] = s.bounds[o + B_B];
        }
      }
      for (const a of [pos, plane, ba, bb]) a.needsUpdate = true;
      geo.setDrawRange(0, (n - 1) * 6);
      const mid = (s.faceLo + s.faceHi) / 2;
      geo.boundingSphere!.center.set(slabX(s, mid), (s.topMax + bottom) / 2, slabZ(s, mid));
      geo.boundingSphere!.radius = Math.hypot((s.faceHi - s.faceLo) / 2 + PAST_COLS * COLUMN_STEP, (s.topMax - bottom) / 2);
      const m = material.uniforms;
      (m.uGrid.value as THREE.Vector4).set(-SLAB_HALF, g.v0, 1 / (GRID_W * CELL), 1 / (GRID_H * CELL));
      (m.uPlay.value as THREE.Vector2).set(s.playLo, s.playHi);
      (m.uFace.value as THREE.Vector2).set(s.faceLo, s.faceHi);
      m.uBottom.value = s.bottom;
      // The next upload sends every row (rows queued for the last slab go with it).
      whole = true;
      soil.clearUpdateRanges();
      queued.fill(0);
      touch(g, 0);
      touch(g, GRID_H - 1);
    },
    upload(g) {
      takeDirty(g, dirty);
      if (dirty.lo > dirty.hi) return;
      packRows(g, bytes, dirty.lo, dirty.hi);
      // The blur reaches one row past each changed row.
      const lo = Math.max(0, dirty.lo - 1);
      const hi = Math.min(GRID_H - 1, dirty.hi + 1);
      blurBores(g, bytes, lo, hi);
      if (!whole) {
        for (let r = lo; r <= hi; r++) {
          if (queued[r]) continue;
          queued[r] = 1;
          soil.updateRanges.push(rows[r]);
        }
      }
      soil.needsUpdate = true;
    },
  };
}
