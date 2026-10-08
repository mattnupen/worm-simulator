import * as THREE from 'three';
import { mulberry32 } from '../core/random';
import { createLeafMaterial } from '../render/leafMaterial';
import { placeLeaves, wetnessLayer, type LeafPlacement } from './leafLitter';
import { leafShape, type LeafShape } from './leafShapes';
import { leafLift, type LeafForm } from './leafForm';
import { leafTint, LEAF_SIZE, LATERAL_VEINS } from './leafPalette';
import { WORLD_HALF } from './terrain';
import { groundNormal, litterDepth, litterTopHeight } from './litterDepth';
import { meshGroundNormal } from './terrainMesh';
import { makeShadeAt } from './treeShadows';
import { sharedLighting } from '../render/paintedMaterial';
import { LeafBuffers, type LeafLook } from './leafWriter';
import { REAL_SCALE } from './realScale';
import { FarLitter } from './farLitter';
import {
  ACTIVE_MARGIN, boxesMeet, chunkCentreX, chunkCentreZ, chunkDistance, countBelow,
  groupByChunk, hullBox, nextLod,
} from './litterChunks';

/** Draw order: after the hero and detail leaves that lie on top, before the ground. */
export const LITTER_RENDER_ORDER = 3;

export interface LitterChunk {
  /** Full leaves, shown when the camera is near (and always while the chunk is active). */
  readonly near: THREE.Mesh;
  /** Global indices (placement order) of this chunk's leaves, ascending. */
  readonly leaves: Uint32Array;
  readonly nearEnds: Uint32Array;
  /** Its first leaf in the low-detail buffer (FarLitter.all; the rest follow, as in `leaves`). */
  readonly farFirst: number;
  /** World x, z box (min x, min z, max x, max z) of every full-leaf vertex at rest. */
  readonly box: Float32Array;
  /** Leaves drawn now (the preset's prefix). */
  count: number;
  /** Showing full leaves. */
  isNear: boolean;
  /** Drawn with the reacting material (the occluder fade). */
  active: boolean;
}

export interface LeafLitter {
  /** Every chunk's full-leaf mesh, and the one low-detail draw. */
  readonly group: THREE.Group;
  readonly chunks: readonly LitterChunk[];
  /** Every chunk's low-detail leaves, in one buffer and one draw (farLitter.ts). */
  readonly far: FarLitter;
  /** The three programs, built once: reacting full leaves, plain full leaves, low-detail leaves. */
  readonly materials: { readonly active: THREE.ShaderMaterial; readonly plain: THREE.ShaderMaterial; readonly far: THREE.ShaderMaterial };
  /** Leaves built: the most it can draw. */
  readonly max: number;
  /** Leaves drawn right now (what setCount last clamped to). */
  readonly drawn: number;
  /** Draws the first `n` leaves overall (placement order is random: an even thinning). */
  setCount(n: number): void;
  /**
   * Once per rendered frame: per chunk, the fading material where its leaves can fade over the
   * buried worm (the hull of the camera and the rendered `spine`), the plain one elsewhere; full
   * leaves near the camera (and on every fading chunk), low-detail ones far away. Swaps materials
   * (all compiled up front); rewrites the far draw's list only when it changes. `fades` false (the
   * worm in the cut, V2): no leaf can fade, so every chunk draws plain. Allocates nothing.
   */
  update(camX: number, camZ: number, spine: ArrayLike<number>, fades?: boolean): void;
}

const UP = new THREE.Vector3(0, 1, 0);
const slope = new THREE.Quaternion();
const euler = new THREE.Euler();
const probe = new THREE.Vector3();
const flatQ = new THREE.Quaternion();
const flatM = new THREE.Matrix4();

/** A leaf's orientation lying on ground with unit normal `n`, its own turn and tilt on top. Writes `out`. */
function pose(n: THREE.Vector3, l: LeafPlacement, out: THREE.Quaternion): THREE.Quaternion {
  slope.setFromUnitVectors(UP, n);
  return out.setFromEuler(euler.set(l.tilt * 0.3, l.rotY, 0)).premultiply(slope);
}

/**
 * A leaf any point of which sinks more than this into the rendered ground is laid at the mesh's
 * slope instead, where that sinks it less (looks); shallower dips are only draped
 * (LeafBuffers.write).
 */
const REPOSE_DIP = 0.05;

/** How far the deepest point of a leaf (`shape` with `form`, placed by `m`) sinks into the ground. */
function sink(shape: LeafShape, form: LeafForm, m: THREE.Matrix4): number {
  const pts = shape.points;
  let deepest = -Infinity;
  for (let p = 0; p < pts.length; p += 2) {
    const u = pts[p];
    const v = pts[p + 1];
    probe.set(u, leafLift(u, v, form), -v).applyMatrix4(m);
    deepest = Math.max(deepest, litterTopHeight(probe.x, probe.z) - probe.y);
  }
  return deepest;
}

/** Size, curl, colour and pose of every leaf, from a second seeded stream (placement stays as seeded). */
function looks(leaves: readonly LeafPlacement[], seed: number): LeafLook[] {
  const rng = mulberry32(seed * 7919 + 13);
  const nrm = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const shadeAt = makeShadeAt(sharedLighting.uLightDir.value);
  const grow = REAL_SCALE.leaf;
  return leaves.map((l) => {
    // Real-size leaves (realScale.ts).
    const size = l.scale * LEAF_SIZE[l.kind] * grow[l.kind];
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
    const q = pose(nrm.set(tn.x, tn.y, tn.z), l, new THREE.Quaternion());
    // On the ground as the terrain mesh draws it (soil plus mound, at the mesh's own resolution), in
    // loose layers: each leaf at its own height, so overlaps never z-fight.
    const rest = 0.006 + l.y;
    pos.set(l.x, litterTopHeight(l.x, l.z) + rest, l.z);
    const m = new THREE.Matrix4().compose(pos, q, scl.setScalar(size));
    // That normal is the ground's over a few cm, which a mound's edge can tip steeply (the mesh is
    // much smoother there). A leaf it tips well into the rendered ground lies at the mesh's slope
    // across the leaf's own size instead, if that sinks it less; the writer drapes whatever still
    // dips (LeafBuffers.write). Every other leaf keeps its pose.
    const deepest = sink(leafShape(l.kind), form, m);
    if (deepest > REPOSE_DIP) {
      pose(meshGroundNormal(l.x, l.z, size / 2, nrm), l, flatQ);
      flatM.compose(pos, flatQ, scl);
      // Only if it sinks less that way (a hollow under a big leaf can make the mesh slope worse).
      if (sink(leafShape(l.kind), form, flatM) < deepest) {
        q.copy(flatQ);
        m.copy(flatM);
      }
    }
    return { kind: l.kind, rest, m, q, form, inner, edge, petiole, wet, lateral, seed: seedValue };
  });
}

function chunkMesh(b: LeafBuffers, material: THREE.Material, cx: number, cz: number, name: string): THREE.Mesh {
  const g = b.toGeometry();
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, material);
  // At the chunk's centre, so three culls whole chunks and sorts them near-first.
  mesh.position.set(cx, 0, cz);
  mesh.renderOrder = LITTER_RENDER_ORDER;
  mesh.name = name;
  return mesh;
}

/**
 * The leaf litter in square chunks (see litterChunks.ts), each with a full-leaf mesh, and every
 * far chunk's low-detail leaves in one draw (farLitter.ts): species silhouettes with a midrib fold,
 * cup and curl, tinted per leaf and lying on the rendered ground in loose layers, at real leaf
 * sizes (pass the real-size count, scaledLeafCount). Presets trim every chunk to a prefix of its
 * leaves (draw ranges, and the far draw's list; no rebuild).
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

  const groups = groupByChunk(placed);
  const far = new FarLitter(all, groups, lowDetail, LITTER_RENDER_ORDER);
  const chunks: LitterChunk[] = groups.map((ids, c) => {
    let nv = 0; let ni = 0;
    for (const i of ids) {
      const a = LeafBuffers.size(leafShape(all[i].kind), true);
      nv += a.verts; ni += a.indices;
    }
    const near = new LeafBuffers(nv, ni, ids.length);
    const cx = chunkCentreX(c);
    const cz = chunkCentreZ(c);
    for (const i of ids) near.write(all[i], leafShape(all[i].kind), true, cx, cz);
    const chunk: LitterChunk = {
      near: chunkMesh(near, plain, cx, cz, `litterNear${c}`),
      leaves: Uint32Array.from(ids),
      nearEnds: near.ends,
      farFirst: far.first[c],
      box: Float32Array.from(near.box),
      count: ids.length,
      isNear: false,
      active: false,
    };
    chunk.near.visible = false;
    group.add(chunk.near);
    return chunk;
  });
  group.add(far.mesh);
  far.refresh(chunks);
  const hull = new Float32Array(4);
  let drawn = count;

  return {
    group,
    chunks,
    far,
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
        ch.near.visible = ch.isNear && ch.count > 0;
      }
      far.refresh(chunks);
    },
    update(camX, camZ, spine, fades = true) {
      hullBox(camX, camZ, spine, hull);
      let changed = false;
      for (let c = 0; c < chunks.length; c++) {
        const ch = chunks[c];
        // Conservative: a chunk any of whose leaves could fade reacts, so nothing snaps.
        ch.active = fades && boxesMeet(ch.box, hull, ACTIVE_MARGIN);
        // Only the full-leaf program reacts, so a reacting chunk always shows full leaves.
        const isNear = nextLod(ch.isNear, chunkDistance(c, camX, camZ)) || ch.active;
        changed ||= isNear !== ch.isNear;
        ch.isNear = isNear;
        ch.near.material = ch.active ? active : plain;
        ch.near.visible = ch.isNear && ch.count > 0;
      }
      far.update(chunks, camX, camZ, changed);
    },
  };
}
