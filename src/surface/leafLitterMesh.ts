import * as THREE from 'three';
import { mulberry32 } from '../core/random';
import { createLeafMaterial } from '../render/leafMaterial';
import { placeLeaves, wetnessLayer, type LeafPlacement } from './leafLitter';
import { leafShape } from './leafShapes';
import { lodShape } from './leafLod';
import { leafTint, LEAF_SIZE, LATERAL_VEINS } from './leafPalette';
import { WORLD_HALF } from './terrain';
import { groundNormal, litterDepth } from './litterDepth';
import { meshGroundHeight } from './terrainMesh';
import { makeShadeAt } from './treeShadows';
import { sharedLighting } from '../render/paintedMaterial';
import { LeafBuffers, type LeafLook } from './leafWriter';
import {
  ACTIVE_MARGIN, DRAPE_MARGIN, boxesMeet, chunkCentreX, chunkCentreZ, chunkDistance, countBelow,
  groupByChunk, hullBox, nextLod,
} from './litterChunks';

/** Draw order: after the hero and detail leaves that lie on top, before the ground. */
export const LITTER_RENDER_ORDER = 3;

export interface LitterChunk {
  /** Full leaves, shown when the camera is near (and always while the chunk is active). */
  readonly near: THREE.Mesh;
  /** Low-detail leaves (6 triangles, no petiole), shown when it is far. */
  readonly far: THREE.Mesh;
  /** Global indices (placement order) of this chunk's leaves, ascending. */
  readonly leaves: Uint32Array;
  readonly nearEnds: Uint32Array;
  readonly farEnds: Uint32Array;
  /** World x, z box (min x, min z, max x, max z) of every full-leaf vertex at rest. */
  readonly box: Float32Array;
  /** Leaves drawn now (the preset's prefix). */
  count: number;
  /** Showing full leaves. */
  isNear: boolean;
  /** Drawn with the reacting material (disturbance map and occluder fade). */
  active: boolean;
}

export interface LeafLitter {
  /** Every chunk's two meshes. */
  readonly group: THREE.Group;
  readonly chunks: readonly LitterChunk[];
  /** The three programs, built once: reacting full leaves, plain full leaves, low-detail leaves. */
  readonly materials: { readonly active: THREE.ShaderMaterial; readonly plain: THREE.ShaderMaterial; readonly far: THREE.ShaderMaterial };
  /** Leaves built: the most it can draw. */
  readonly max: number;
  /** Leaves drawn right now (what setCount last clamped to). */
  readonly drawn: number;
  /** Draws the first `n` leaves overall (placement order is random: an even thinning). */
  setCount(n: number): void;
  /**
   * Once per rendered frame: per chunk, the reacting material where its leaves can be moved by the
   * map (`disturbed`, disturbedBox) or faded (the hull of the camera and the rendered `spine`),
   * the plain one elsewhere; full leaves near the camera (and on every reacting chunk), low-detail
   * ones far away. Swaps materials only (all compiled up front). Allocates nothing.
   */
  update(camX: number, camZ: number, spine: ArrayLike<number>, disturbed: ArrayLike<number>): void;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Size, curl, colour and pose of every leaf, from a second seeded stream (placement stays as seeded). */
function looks(leaves: readonly LeafPlacement[], seed: number): LeafLook[] {
  const rng = mulberry32(seed * 7919 + 13);
  const slope = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const nrm = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const shadeAt = makeShadeAt(sharedLighting.uLightDir.value);
  return leaves.map((l) => {
    const size = l.scale * LEAF_SIZE[l.kind];
    // Dry oak curls hardest; big leaves lie flatter, so no edge rises much over ~0.12.
    const flat = Math.min(1, 0.9 / size);
    const form = {
      fold: (0.04 + rng() * 0.2) * flat,
      cup: rng() * (l.kind === 'oak' ? 0.6 : 0.3) * flat,
      curl: rng() * (l.kind === 'oak' ? 0.45 : 0.25) * flat,
    };
    const inner = new THREE.Color();
    const edge = new THREE.Color();
    const petiole = new THREE.Color();
    const wet = leafTint(l.kind, wetnessLayer(l), rng, inner, edge, petiole);
    // Long trunk shadows, baked.
    const shade = shadeAt(l.x, l.z);
    inner.multiplyScalar(shade);
    edge.multiplyScalar(shade);
    petiole.multiplyScalar(shade);
    const lateral = LATERAL_VEINS[l.kind];
    const seedValue = rng();
    // Lie along the ground, including the slopes of leaf piles.
    const tn = groundNormal(l.x, l.z);
    slope.setFromUnitVectors(UP, nrm.set(tn.x, tn.y, tn.z));
    const q = new THREE.Quaternion().setFromEuler(euler.set(l.tilt * 0.3, l.rotY, 0)).premultiply(slope);
    // On the ground as the terrain mesh draws it (soil plus mound, at the mesh's own resolution), in
    // loose layers: each leaf at its own height, so overlaps never z-fight.
    const rest = 0.006 + l.y;
    pos.set(l.x, meshGroundHeight(l.x, l.z) + rest, l.z);
    const m = new THREE.Matrix4().compose(pos, q, scl.setScalar(size));
    return { kind: l.kind, x: l.x, z: l.z, rest, m, q, form, inner, edge, petiole, wet, lateral, seed: seedValue };
  });
}

function chunkMesh(b: LeafBuffers, material: THREE.Material, cx: number, cz: number, name: string): THREE.Mesh {
  const g = b.toGeometry();
  g.computeBoundingSphere();
  // Room for leaves the disturbance map lifts or slides (only reacting chunks move, but cheap).
  if (g.boundingSphere) g.boundingSphere.radius += DRAPE_MARGIN;
  const mesh = new THREE.Mesh(g, material);
  // At the chunk's centre, so three culls whole chunks and sorts them near-first.
  mesh.position.set(cx, 0, cz);
  mesh.renderOrder = LITTER_RENDER_ORDER;
  mesh.name = name;
  return mesh;
}

/**
 * The leaf litter in square chunks (see litterChunks.ts), each with a full-leaf and a low-detail
 * mesh: species silhouettes with a midrib fold, cup and curl, tinted per leaf and lying on the
 * rendered ground in loose layers. Presets trim every chunk with a draw range (no rebuild).
 */
export function buildLeafLitter(count: number, seed = 1): LeafLitter {
  const placed = placeLeaves(count, WORLD_HALF, seed, litterDepth);
  const all = looks(placed, seed);
  // Created in this order: three sorts opaque draws by material before depth, so the reacting
  // chunks (round the worm, nearest the camera) draw first.
  const active = createLeafMaterial('litter');
  const plain = createLeafMaterial('plain');
  const lowDetail = createLeafMaterial('far');
  const group = new THREE.Group();
  group.name = 'leafLitter';

  const chunks: LitterChunk[] = groupByChunk(placed).map((ids, c) => {
    let nv = 0; let ni = 0; let fv = 0; let fi = 0;
    for (const i of ids) {
      const a = LeafBuffers.size(leafShape(all[i].kind), true);
      const b = LeafBuffers.size(lodShape(all[i].kind), false);
      nv += a.verts; ni += a.indices; fv += b.verts; fi += b.indices;
    }
    const near = new LeafBuffers(nv, ni, ids.length);
    const far = new LeafBuffers(fv, fi, ids.length);
    const cx = chunkCentreX(c);
    const cz = chunkCentreZ(c);
    for (const i of ids) {
      near.write(all[i], leafShape(all[i].kind), true, cx, cz);
      far.write(all[i], lodShape(all[i].kind), false, cx, cz);
    }
    const chunk: LitterChunk = {
      near: chunkMesh(near, plain, cx, cz, `litterNear${c}`),
      far: chunkMesh(far, lowDetail, cx, cz, `litterFar${c}`),
      leaves: Uint32Array.from(ids),
      nearEnds: near.ends,
      farEnds: far.ends,
      box: Float32Array.from(near.box),
      count: ids.length,
      isNear: false,
      active: false,
    };
    chunk.near.visible = false;
    chunk.far.visible = ids.length > 0;
    group.add(chunk.near, chunk.far);
    return chunk;
  });

  const show = (ch: LitterChunk) => {
    ch.near.visible = ch.isNear && ch.count > 0;
    ch.far.visible = !ch.isNear && ch.count > 0;
  };
  const hull = new Float32Array(4);
  let drawn = count;

  return {
    group,
    chunks,
    materials: { active, plain, far: lowDetail },
    max: count,
    get drawn() {
      return drawn;
    },
    setCount(n: number) {
      const k = Math.max(0, Math.min(count, Math.floor(n)));
      drawn = k;
      for (const ch of chunks) {
        ch.count = countBelow(ch.leaves, k);
        ch.near.geometry.setDrawRange(0, ch.count > 0 ? ch.nearEnds[ch.count - 1] : 0);
        ch.far.geometry.setDrawRange(0, ch.count > 0 ? ch.farEnds[ch.count - 1] : 0);
        show(ch);
      }
    },
    update(camX, camZ, spine, disturbed) {
      hullBox(camX, camZ, spine, hull);
      for (let c = 0; c < chunks.length; c++) {
        const ch = chunks[c];
        // Conservative: a chunk any of whose leaves could move or fade reacts, so nothing snaps.
        ch.active = boxesMeet(ch.box, hull, ACTIVE_MARGIN) || boxesMeet(ch.box, disturbed, ACTIVE_MARGIN);
        // Only the full-leaf program reacts, so a reacting chunk always shows full leaves.
        ch.isNear = nextLod(ch.isNear, chunkDistance(c, camX, camZ)) || ch.active;
        ch.near.material = ch.active ? active : plain;
        show(ch);
      }
    },
  };
}
