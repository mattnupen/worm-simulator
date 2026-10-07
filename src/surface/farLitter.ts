import * as THREE from 'three';
import { IndexList } from '../render/indexSplit';
import { CHUNKS, chunkIndex } from './litterChunks';
import { LeafBuffers, type LeafLook } from './leafWriter';
import { lodShape } from './leafLod';

/** What the far draw needs of a litter chunk. */
export interface FarChunk {
  /** Its first leaf in the shared low-detail buffer (its leaves follow, in placement order). */
  readonly farFirst: number;
  /** Leaves drawn now (the preset's prefix). */
  readonly count: number;
  /** Showing full leaves (its own draw), so none here. */
  readonly isNear: boolean;
}

/**
 * Every litter chunk's low-detail leaves in ONE draw. Each chunk drew its own until V2, which was
 * up to 32 draws from a corner (the budget is 40 for everything, visual-quality-brief.md); the
 * whole low-detail litter is under 3000 vertices, so frustum culling it chunk by chunk saved no
 * measurable work. The leaves of every chunk lie in one buffer in world space (`all`, never drawn
 * whole); this draw lists, in its own index buffer (IndexList), the drawn prefix of every chunk
 * that is not showing full leaves, the chunks nearest the camera's chunk first, so the depth test
 * still skips most hidden leaf pixels as the per-chunk sort did. The list is rewritten only when it
 * changes: a chunk crosses the LOD line, the preset's count changes, or the camera enters another
 * chunk (the order). Allocates nothing after construction.
 */
export class FarLitter {
  readonly mesh: THREE.Mesh;
  /** Every chunk's low-detail leaves (6 triangles, no petiole), chunk after chunk; never drawn whole. */
  readonly all: THREE.BufferGeometry;
  /** `ends[p]` is the index count of `all` after its leaf p. */
  readonly ends: Uint32Array;
  /** Per chunk, its first leaf in `all` (its leaves follow, in its own order). */
  readonly first: ArrayLike<number>;
  private readonly list: IndexList;
  /** Leaf (part) ids handed to the list, in draw order. */
  private readonly next: Int32Array;
  /** Chunk ids nearest-first from the camera's chunk, and their squared distances in chunks. */
  private readonly order = new Int32Array(CHUNKS * CHUNKS);
  private readonly dist = new Int32Array(CHUNKS * CHUNKS);
  /** The chunk the order is from (the camera's at the last update). */
  private camChunk = 0;

  /** `looks`: every litter leaf; `chunks`: the leaf ids of each chunk (groupByChunk). */
  constructor(looks: readonly LeafLook[], chunks: readonly (readonly number[])[], material: THREE.Material, renderOrder: number) {
    let verts = 0;
    let indices = 0;
    for (const l of looks) {
      const b = LeafBuffers.size(lodShape(l.kind), false);
      verts += b.verts;
      indices += b.indices;
    }
    const buf = new LeafBuffers(verts, indices, looks.length);
    const first = new Uint32Array(chunks.length);
    let p = 0;
    chunks.forEach((ids, c) => {
      first[c] = p;
      p += ids.length;
      for (const i of ids) buf.write(looks[i], lodShape(looks[i].kind), false, 0, 0);
    });
    this.first = first;
    this.all = buf.toGeometry();
    this.ends = buf.ends;
    this.list = new IndexList(this.all, this.ends);
    this.next = new Int32Array(this.ends.length);
    this.all.computeBoundingSphere();
    this.list.geometry.boundingSphere = this.all.boundingSphere!.clone();
    this.mesh = new THREE.Mesh(this.list.geometry, material);
    this.mesh.renderOrder = renderOrder;
    this.mesh.name = 'litterFar';
    this.mesh.visible = false;
    this.sortFrom(0);
  }

  /** Leaves drawn now. */
  get drawn(): number {
    return this.list.count;
  }

  /** The leaf ids drawn now, in draw order (the first `drawn`). */
  get parts(): Int32Array {
    return this.list.parts;
  }

  /**
   * Draws the drawn prefix of every chunk not showing full leaves, nearest the camera's chunk
   * first. `force`: a chunk's LOD changed since the last call; otherwise only a new camera chunk
   * rewrites the list.
   */
  update(chunks: readonly FarChunk[], camX: number, camZ: number, force: boolean): void {
    const at = chunkIndex(camX, camZ);
    if (!force && at === this.camChunk) return;
    if (at !== this.camChunk) this.sortFrom(at);
    this.refresh(chunks);
  }

  /** Rewrites the list in the current order (the chunks' counts or LOD changed). */
  refresh(chunks: readonly FarChunk[]): void {
    const { next, order } = this;
    let k = 0;
    for (let o = 0; o < order.length; o++) {
      const ch = chunks[order[o]];
      if (ch.isNear) continue;
      for (let i = 0; i < ch.count; i++) next[k++] = ch.farFirst + i;
    }
    this.list.set(next, k);
    this.mesh.visible = k > 0;
  }

  /** Orders the chunks by centre distance from chunk `at`'s centre (ties by id): insertion sort. */
  private sortFrom(at: number): void {
    this.camChunk = at;
    const { order, dist } = this;
    for (let c = 0; c < order.length; c++) {
      const di = (c % CHUNKS) - (at % CHUNKS);
      const dj = Math.floor(c / CHUNKS) - Math.floor(at / CHUNKS);
      const d = di * di + dj * dj;
      let j = c;
      while (j > 0 && dist[j - 1] > d) {
        order[j] = order[j - 1];
        dist[j] = dist[j - 1];
        j--;
      }
      order[j] = c;
      dist[j] = d;
    }
  }
}
