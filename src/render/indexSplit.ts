import * as THREE from 'three';

/**
 * Splits an indexed geometry's parts (whole leaves, ground cells: runs of its index buffer) between
 * its own draw and a second geometry over the same vertex buffers, part by part, each frame.
 *
 * Why: the fade's dithered discard (occlusion.ts) stops the GPU from rejecting hidden pixels before
 * it shades them (the early depth test), and most of what carries the fade cannot fade at all this
 * frame. So the parts that may fade go to the `fade` geometry, drawn with the fade, and the rest stay
 * in the source geometry, drawn without it (early depth test kept). A part moved out of the source
 * collapses there (its indices all name its first vertex: nothing to draw), so every part is drawn
 * by exactly one of the two, and both draw the same vertices bit for bit (no crack, no double draw).
 * Only the index runs that change are uploaded. Allocates nothing after construction: setParts
 * copies index runs in plain loops and reuses its update-range records.
 */
export class IndexSplit {
  /** Shares every attribute of the source; draws only the parts handed to it (setParts). */
  readonly fade: THREE.BufferGeometry;
  /** The parts in `fade` now, ascending (the first `count`). */
  readonly parts: Int32Array;
  private n = 0;
  private readonly main: THREE.BufferAttribute;
  private readonly mainArr: Uint16Array | Uint32Array;
  private readonly pristine: Uint16Array | Uint32Array;
  private readonly fadeIndex: THREE.BufferAttribute;
  private readonly fadeArr: Uint16Array | Uint32Array;
  private readonly inFade: Uint8Array;
  private readonly want: Uint8Array;
  private readonly ends: ArrayLike<number>;
  /** Reused update-range records for the source's index buffer (one per moved part, at most). */
  private readonly pool: { start: number; count: number }[];
  private readonly fadeRange = { start: 0, count: 0 };

  /**
   * `src` must be indexed; part p holds its indices ends[p - 1] (0 for p = 0) to ends[p]. At most
   * `capacity` parts are ever handed over at once.
   */
  constructor(src: THREE.BufferGeometry, ends: ArrayLike<number>, readonly capacity: number) {
    this.main = src.index!;
    this.main.setUsage(THREE.DynamicDrawUsage);
    this.mainArr = this.main.array as Uint16Array | Uint32Array;
    this.pristine = this.mainArr.slice();
    this.ends = ends;
    const parts = ends.length;
    this.inFade = new Uint8Array(parts);
    this.want = new Uint8Array(parts);
    this.parts = new Int32Array(capacity);
    let most = 0;
    for (let p = 0; p < parts; p++) most = Math.max(most, ends[p] - (p > 0 ? ends[p - 1] : 0));
    const Arr = this.mainArr instanceof Uint16Array ? Uint16Array : Uint32Array;
    this.fadeArr = new Arr(Math.min(this.mainArr.length, most * capacity));
    this.fade = new THREE.BufferGeometry();
    for (const name of Object.keys(src.attributes)) this.fade.setAttribute(name, src.getAttribute(name));
    this.fadeIndex = new THREE.BufferAttribute(this.fadeArr, 1).setUsage(THREE.DynamicDrawUsage);
    this.fade.setIndex(this.fadeIndex);
    this.fade.setDrawRange(0, 0);
    if (src.boundingSphere) this.fade.boundingSphere = src.boundingSphere.clone();
    this.pool = Array.from({ length: 2 * capacity }, () => ({ start: 0, count: 0 }));
  }

  /** How many parts the fade geometry draws now. */
  get count(): number {
    return this.n;
  }

  /**
   * Hands parts next[0..k) (ascending, distinct, k <= capacity) to the fade geometry and gives every
   * other part back to the source. Returns false (uploading nothing) when they are already there.
   * Call it at most once per render: it replaces the pending upload ranges, so a second call before
   * the upload would lose the first's changes.
   */
  setParts(next: ArrayLike<number>, k: number): boolean {
    const cur = this.parts;
    let same = k === this.n;
    for (let a = 0; same && a < k; a++) same = next[a] === cur[a];
    if (same) return false;
    const { want, inFade, mainArr, pristine, ends } = this;
    let ranges = 0;
    for (let a = 0; a < k; a++) want[next[a]] = 1;
    for (let a = 0; a < this.n; a++) {
      const p = cur[a];
      if (want[p]) continue;
      const s = p > 0 ? ends[p - 1] : 0;
      for (let t = s; t < ends[p]; t++) mainArr[t] = pristine[t];
      inFade[p] = 0;
      ranges = this.range(ranges, s, ends[p] - s);
    }
    let f = 0;
    for (let a = 0; a < k; a++) {
      const p = next[a];
      want[p] = 0;
      const s = p > 0 ? ends[p - 1] : 0;
      if (!inFade[p]) {
        mainArr.fill(pristine[s], s, ends[p]);
        inFade[p] = 1;
        ranges = this.range(ranges, s, ends[p] - s);
      }
      for (let t = s; t < ends[p]; t++) this.fadeArr[f++] = pristine[t];
      cur[a] = p;
    }
    this.n = k;
    const ur = this.main.updateRanges;
    ur.length = 0;
    for (let r = 0; r < ranges; r++) ur[r] = this.pool[r];
    if (ranges > 0) this.main.needsUpdate = true;
    this.fadeRange.count = Math.max(1, f);
    this.fadeIndex.updateRanges.length = 0;
    this.fadeIndex.updateRanges[0] = this.fadeRange;
    this.fadeIndex.needsUpdate = true;
    this.fade.setDrawRange(0, f);
    return true;
  }

  private range(r: number, start: number, count: number): number {
    const rec = this.pool[r];
    rec.start = start;
    rec.count = count;
    return r + 1;
  }
}


/**
 * A geometry over another's vertex buffers that draws only the parts handed to it (set), in its own
 * index buffer: IndexSplit's second geometry without the source's side, for a mesh that is never
 * drawn whole (the worm's pocket leaves: pocketLeaves.ts). Allocates nothing after construction.
 */
export class IndexList {
  readonly geometry: THREE.BufferGeometry;
  /** The parts drawn now, in draw order (the first `count`). */
  readonly parts: Int32Array;
  private n = 0;
  private readonly src: Uint16Array | Uint32Array;
  private readonly arr: Uint16Array | Uint32Array;
  private readonly index: THREE.BufferAttribute;
  private readonly range = { start: 0, count: 0 };

  /** As IndexSplit: part p holds src's indices ends[p - 1] (0 for p = 0) to ends[p]. */
  constructor(src: THREE.BufferGeometry, private readonly ends: ArrayLike<number>) {
    this.src = src.index!.array as Uint16Array | Uint32Array;
    this.arr = this.src.slice();
    this.parts = new Int32Array(ends.length);
    this.geometry = new THREE.BufferGeometry();
    for (const name of Object.keys(src.attributes)) this.geometry.setAttribute(name, src.getAttribute(name));
    this.index = new THREE.BufferAttribute(this.arr, 1).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setIndex(this.index);
    this.geometry.setDrawRange(0, 0);
  }

  /** How many parts it draws now. */
  get count(): number {
    return this.n;
  }

  /**
   * Draws parts next[0..k) (distinct), in that order. Returns false (uploading nothing) when
   * unchanged.
   */
  set(next: ArrayLike<number>, k: number): boolean {
    let same = k === this.n;
    for (let a = 0; same && a < k; a++) same = next[a] === this.parts[a];
    if (same) return false;
    const { src, arr, ends } = this;
    let f = 0;
    for (let a = 0; a < k; a++) {
      const p = next[a];
      for (let t = p > 0 ? ends[p - 1] : 0; t < ends[p]; t++) arr[f++] = src[t];
      this.parts[a] = p;
    }
    this.n = k;
    this.range.count = Math.max(1, f);
    this.index.updateRanges.length = 0;
    this.index.updateRanges[0] = this.range;
    this.index.needsUpdate = true;
    this.geometry.setDrawRange(0, f);
    return true;
  }
}
