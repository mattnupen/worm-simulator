import * as THREE from 'three';
import { buildDetailLeaves, type DetailLeaves } from './detailLeaves';
import { IndexSplit } from '../render/indexSplit';
import { ballInHole, type FadeFrame } from '../render/fadeBall';
import { detailVertex, DETAIL_BOX, POCKET_FAR, type DetailInputs } from '../render/detailGlsl';
import { DRAPE_FLAT, DRAPE_FOOT, DRAPE_HEIGHT, PUSH_SLIDE } from '../render/leafGlsl';
import { FLOOR_SLOPE } from '../render/floorMaterial';
import { SPINE_POINTS } from '../render/groundUniforms';
import { getLitterTexture } from '../render/litterTexture';
import { spineDistance } from '../render/nearClutterGlsl';
import { wrapAround } from '../render/wrap';

/**
 * The disturbance map reads the body up to this much (m) farther than it is (leafGlsl.ts DRAPE_FLAT's
 * note: 9 cm), plus a margin: a leaf whose near edge lies within DRAPE_FOOT plus this of the spine
 * may be draped over the body.
 */
const MAP_SLACK = 0.15;

export interface PocketLeaves extends DetailLeaves {
  /** How many leaves the last update listed (drawn this frame). */
  readonly listed: number;
  /** Which leaves (ascending; the first `listed`). */
  readonly parts: Int32Array;
  /**
   * Once per rendered frame, after the fade's segments are set (`fade`): lists only the leaves the
   * hole over the worm may show, from the rendered `spine`, the head (uFocus x, z) and the wrap
   * centre (uWrapCentre), as the shader places them. Returns how many. Allocates nothing.
   */
  update(fade: FadeFrame, spine: ArrayLike<number>, focusX: number, focusZ: number, wrapX: number, wrapZ: number): number;
}

/**
 * The leaves in the buried worm's pocket (V2 spec 8.2): detail leaves placed on the floor round the
 * body (detailGlsl.ts POCKET), drawn after the top of the litter, which hides them everywhere but
 * the hole over the worm. Every pixel a draw covers costs, even one the top hides (and with the
 * fade's discard, occlusion.ts, hidden pixels can be shaded too). So each frame the CPU lists only
 * the leaves the hole may show (ballInHole: a ball holding the whole leaf as the shader lays, drapes
 * and slides it) into the index buffer of one draw (indexSplit.ts; the full mesh it splits from is
 * never drawn). A leaf left out is hidden by the top on every pixel, so leaving it out changes
 * nothing on screen (tests/unit/pocketLeaves.test.ts).
 */
export function buildPocketLeaves(count: number, seed = 5): PocketLeaves {
  const src = buildDetailLeaves(count, seed, true);
  const g = src.mesh.geometry;
  const split = new IndexSplit(g, src.ends, count);
  const mesh = new THREE.Mesh(split.fade, src.mesh.material);
  mesh.frustumCulled = false;
  mesh.renderOrder = src.mesh.renderOrder;
  mesh.name = 'pocketLeaves';
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
    // The pocket's leaves lie on the floor (terrainHeight), not the baked top: never read.
    ground: new Float32Array(0),
  };
  const next = new Int32Array(count);
  const d4 = [0, 0, 0, 0];
  const zero = [0, 0, 0];
  const centre = [0, 0, 0];
  const anchor = [0, 0, 0, 0];
  // The first frame after it is built draws it (empty, if nothing is listed), so its shader compiles
  // with the top's detail leaves rather than whenever a leaf first enters the hole.
  let warm = true;
  return {
    mesh,
    max: count,
    ends: src.ends,
    get drawn() {
      return src.drawn;
    },
    get listed() {
      return split.count;
    },
    parts: split.parts,
    setCount(n: number) {
      src.setCount(n);
      mesh.visible = src.drawn > 0 && (split.count > 0 || warm);
    },
    update(fade, spine, focusX, focusZ, wrapX, wrapZ) {
      inp.focusX = focusX;
      inp.focusZ = focusZ;
      inp.wrapX = wrapX;
      inp.wrapZ = wrapZ;
      inp.spine = spine;
      // The spine's box grown by POCKET_FAR: a leaf whose home lies outside it is shrunk to nothing.
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
      let k = 0;
      for (let p = 0; fade.count > 0 && p < src.drawn; p++) {
        const o = p * 4;
        const hx = wrapAround(homes[o], wrapX, DETAIL_BOX);
        const hz = wrapAround(homes[o + 1], wrapZ, DETAIL_BOX);
        if (hx < x0 - POCKET_FAR || hx > x1 + POCKET_FAR || hz < z0 - POCKET_FAR || hz > z1 + POCKET_FAR) continue;
        d4[0] = homes[o];
        d4[1] = homes[o + 1];
        d4[2] = homes[o + 2];
        d4[3] = homes[o + 3];
        // Its centre on the floor, its radius after the shrink and its rest, as the shader has them.
        detailVertex(inp, d4, zero, layers[p], centre, anchor, true);
        const r = anchor[2];
        if (r <= 0) continue;
        // Every vertex lies within r across of its centre, slid up to PUSH_SLIDE, and from the
        // floor's slope below its rest to its curl (r) and the slope above; draped over the body,
        // up to the drape's height and its own reach more.
        const lift = spineDistance(spine, hx, hz) - r < DRAPE_FOOT + MAP_SLACK ? DRAPE_HEIGHT + r + DRAPE_FLAT : 0;
        const half = (r + lift) / 2 + r * FLOOR_SLOPE;
        const R = Math.hypot(r + PUSH_SLIDE, half);
        if (ballInHole(fade, hx, centre[1] + (r + lift) / 2, hz, R)) next[k++] = p;
      }
      split.setParts(next, k);
      mesh.visible = src.drawn > 0 && (k > 0 || warm);
      if (mesh.visible) warm = false;
      return k;
    },
  };
}
