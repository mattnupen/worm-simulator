import * as THREE from 'three';
import { buildDetailLeaves, type DetailLeaves } from './detailLeaves';
import { IndexList } from '../render/indexSplit';
import { ballInHole, ballMayFade, type FadeFrame } from '../render/fadeBall';
import {
  detailVertex, POCKET_AHEAD, POCKET_BEHIND, POCKET_BOX, POCKET_FAR, type DetailInputs,
} from '../render/detailGlsl';
import { disturbBound } from '../render/leafGlsl';
import { DIST_CELL, DIST_N, type DisturbanceMap } from './disturbance';
import { FLOOR_SLOPE } from '../render/floorMaterial';
import { SPINE_POINTS } from '../render/groundUniforms';
import { getLitterTexture } from '../render/litterTexture';
import { createLeafMaterial } from '../render/leafMaterial';
import { wrapAround } from '../render/wrap';

/** Far above the map's 16-bit packing (0.06 mm) and float rounding (m). */
const MAP_SLACK = 0.005;
const near2 = [0, 0];
const bound = [0, 0];

/**
 * The most the map's path and body nearness (channels 0 and 2) can read at world (x, z), as the
 * shader filters them (bilinear between four cells, clamped at the edges): the largest of the four.
 * Writes out[0] (path), out[1] (body). No object allocation.
 */
function nearnessMax(m: DisturbanceMap, x: number, z: number, out: number[]): void {
  const tx = (x - m.ci * DIST_CELL) / DIST_CELL - 0.5;
  const tz = (z - m.cj * DIST_CELL) / DIST_CELL - 0.5;
  const i = Math.floor(tx);
  const j = Math.floor(tz);
  out[0] = 0;
  out[1] = 0;
  for (let c = 0; c < 4; c++) {
    const a = Math.min(DIST_N - 1, Math.max(0, i + (c & 1)));
    const b = Math.min(DIST_N - 1, Math.max(0, j + (c >> 1)));
    const k = (b * DIST_N + a) * 4;
    out[0] = Math.max(out[0], m.data[k]);
    out[1] = Math.max(out[1], m.data[k + 2]);
  }
}

export interface PocketLeaves extends DetailLeaves {
  /** How many leaves the last update listed (drawn this frame)... */
  readonly listed: number;
  /** ...which (ascending; the first `listed`)... */
  readonly parts: Int32Array;
  /** ...and how many of them carry the fade (the rest are drawn without it), which (ascending). */
  readonly fading: number;
  readonly fadeParts: Int32Array;
  /**
   * Once per rendered frame, after the fade's segments are set (`fade`): lists only the leaves the
   * hole over the worm may show, from the rendered `spine`, the head (uFocus x, z), the wrap
   * centre (uWrapCentre) and the disturbance map (`map`, as uploaded), as the shader places and
   * drapes them. Returns how many. No object allocation.
   */
  update(
    fade: FadeFrame, spine: ArrayLike<number>, focusX: number, focusZ: number, wrapX: number, wrapZ: number,
    map: DisturbanceMap,
  ): number;
}

/**
 * The leaves in the buried worm's pocket (V2 spec 8.2): detail leaves placed on the floor round the
 * body (detailGlsl.ts POCKET), drawn after the top of the litter, which hides them everywhere but
 * the hole over the worm. Every pixel a draw covers costs, even one the top hides, and the fade's
 * discard keeps hidden pixels from being rejected before they are shaded. So each frame the CPU
 * lists only the leaves the hole may show (ballInHole: a ball holding the whole leaf as the shader
 * lays, drapes and slides it), and of those only the ones the fade may thin (ballMayFade) carry it:
 * two draws over the full mesh's buffers (IndexList; the full mesh is never drawn). A leaf left out
 * is hidden by the top on every pixel, and one drawn without the fade has no pixel the fade would
 * drop, so neither changes anything on screen (tests/unit/pocketLeaves.test.ts).
 * `mesh` draws the leaves without the fade; its sibling `beside`, the ones with it. Each hides when
 * it holds no leaves (no empty draw).
 */
export function buildPocketLeaves(count: number, seed = 5): PocketLeaves {
  const src = buildDetailLeaves(count, seed, true);
  const g = src.mesh.geometry;
  const plainList = new IndexList(g, src.ends);
  const fadeList = new IndexList(g, src.ends);
  const mesh = new THREE.Mesh(plainList.geometry, createLeafMaterial('pocketPlain'));
  const faded = new THREE.Mesh(fadeList.geometry, src.mesh.material);
  for (const m of [mesh, faded]) {
    m.frustumCulled = false;
    m.renderOrder = src.mesh.renderOrder;
  }
  mesh.name = 'pocketLeaves';
  faded.name = 'pocketLeavesFaded';
  // Per leaf: its aDetail (home in the tile, yaw, radius) and its layer (aLeaf2.y).
  const homes = new Float32Array(count * 4);
  const layers = new Float32Array(count);
  const det = g.getAttribute('aDetail');
  const leaf2 = g.getAttribute('aLeaf2');
  const index = g.index!.array;
  for (let p = 0; p < count; p++) {
    const v = index[p > 0 ? src.ends[p - 1] : 0];
    homes.set([det.getX(v), det.getY(v), det.getZ(v), det.getW(v)], p * 4);
    layers[p] = leaf2.getY(v);
  }
  const inp: DetailInputs = {
    focusX: 0, focusZ: 0, wrapX: 0, wrapZ: 0, litter: getLitterTexture().image.data as Uint8Array,
    // Placing a pocket leaf reads the floor (terrainHeight), not the baked top: never read here.
    ground: new Float32Array(0),
  };
  const all = new Int32Array(count);
  const plain = new Int32Array(count);
  const fading = new Int32Array(count);
  const d4 = [0, 0, 0, 0];
  const zero = [0, 0, 0];
  const centre = [0, 0, 0];
  const anchor = [0, 0, 0, 0];
  let listed = 0;
  // The first frame after it is built draws both (empty, if nothing is listed), so their shaders
  // compile with the top's detail leaves rather than whenever a leaf first enters the hole.
  let warm = true;
  const show = () => {
    mesh.visible = src.drawn > 0 && (plainList.count > 0 || warm);
    faded.visible = src.drawn > 0 && (fadeList.count > 0 || warm);
  };
  return {
    mesh,
    beside: faded,
    max: count,
    ends: src.ends,
    get drawn() {
      return src.drawn;
    },
    get listed() {
      return listed;
    },
    parts: all,
    get fading() {
      return fadeList.count;
    },
    fadeParts: fadeList.parts,
    setCount(n: number) {
      src.setCount(n);
      show();
    },
    update(fade, spine, focusX, focusZ, wrapX, wrapZ, map) {
      inp.focusX = focusX;
      inp.focusZ = focusZ;
      inp.wrapX = wrapX;
      inp.wrapZ = wrapZ;
      inp.spine = spine;
      // The spine's box grown by the most a live leaf's home lies off it (pocketDistance): a leaf
      // whose home lies outside it is shrunk to nothing.
      let x0 = Infinity;
      let x1 = -Infinity;
      let z0 = Infinity;
      let z1 = -Infinity;
      for (let i = 0; i < SPINE_POINTS * 3; i += 3) {
        x0 = Math.min(x0, spine[i]);
        x1 = Math.max(x1, spine[i]);
        z0 = Math.min(z0, spine[i + 2]);
        z1 = Math.max(z1, spine[i + 2]);
      }
      const m = POCKET_FAR + Math.max(POCKET_AHEAD, POCKET_BEHIND);
      let k = 0;
      let kp = 0;
      let kf = 0;
      for (let p = 0; fade.count > 0 && p < src.drawn; p++) {
        const o = p * 4;
        const hx = wrapAround(homes[o], wrapX, POCKET_BOX);
        const hz = wrapAround(homes[o + 1], wrapZ, POCKET_BOX);
        if (hx < x0 - m || hx > x1 + m || hz < z0 - m || hz > z1 + m) continue;
        d4[0] = homes[o];
        d4[1] = homes[o + 1];
        d4[2] = homes[o + 2];
        d4[3] = homes[o + 3];
        // Its centre on the floor, its radius after the shrink and its rest, as the shader has them.
        detailVertex(inp, d4, zero, layers[p], centre, anchor, true);
        const r = anchor[2];
        if (r <= 0) continue;
        // Every vertex lies within r across of its centre, slid out of the worm's path and draped
        // over its body by at most disturbBound (pocketCap only lowers it), and from the floor's
        // slope below its rest to its curl (r) and the slope above.
        nearnessMax(map, hx, hz, near2);
        disturbBound(r, near2[0], near2[1], MAP_SLACK, bound);
        const slide = bound[0];
        const lift = bound[1];
        const half = (r + lift) / 2 + r * FLOOR_SLOPE;
        const R = Math.hypot(r + slide, half);
        const cy = centre[1] + (r + lift) / 2;
        if (!ballInHole(fade, hx, cy, hz, R)) continue;
        all[k++] = p;
        if (ballMayFade(fade, hx, cy, hz, R)) fading[kf++] = p;
        else plain[kp++] = p;
      }
      listed = k;
      plainList.set(plain, kp);
      fadeList.set(fading, kf);
      show();
      if (mesh.visible) warm = false;
      return k;
    },
  };
}
