import { hypot2 } from '../core/vec';
import { floorHeight, litterTopHeight } from '../surface/litterDepth';
import type { Openings } from './openings';
import { heapAt, MOUND_R, MOUND_TOP } from './digMarkShape';
import { MOUND_SPOTS } from './moundSpots';
import { riseInto, RIDE_TOP, type WormRise } from '../worm/surfaceHeight';

/**
 * The casting mounds on the forest floor (V4, Matt's review: "Spread them out and they should not
 * disappear. Keep them there and the worm goes over them"): a fixed scatter over the play area
 * (moundSpots.ts, baked from moundScatter.ts), each where the worm can dig down. They never move.
 * A mound with an opening on it (the worm came up there) gives way to that opening's midden
 * (middens.ts: the same mound and hole) and comes back if the openings are cleared (the speed
 * test's fresh start), so the two never overlap.
 *
 * The worm crawls over a mound, no collision: wormSurface adds its lift (riseInto, set with
 * setWormRise), so its belly rides up out of the leaves onto the castings and down again. Digging
 * works anywhere it is allowed; a mound only shows a good spot. Only `rise` (tests) allocates.
 */

/** An opening closer than this to a mound takes its place (the midden and the mound would overlap). */
export const OPENING_CLEAR = MOUND_R * 2.2;
/**
 * The worm's ride over a mound: its belly is lifted flat over the hole and the rim (out to TOP_R)
 * to the heap's top, then eases down (smoothstep) to nothing at TOP_R + REACH_PER * lift, under the
 * leaves past the heap's foot, so the body is never inside the heap.
 */
export const TOP_R = RIDE_TOP;
export const REACH_PER = 1.5;
/** Over the heap's top, so the belly clears its lumps. */
export const RIDE_MARGIN = 0.03;

export class Mounds implements WormRise {
  readonly count: number;
  readonly x: Float64Array;
  readonly z: Float64Array;
  /** How far the belly is lifted at the centre (over the floor), and how far out the ride reaches. */
  readonly lift: Float64Array;
  readonly reach: Float64Array;
  /** 1 while drawn (and ridden over); 0 while an opening stands on it. */
  readonly shown: Uint8Array;
  /** Bumped whenever a mound is shown or hidden. */
  version = 0;
  private openingsVersion = -1;

  constructor(spots: readonly number[] = MOUND_SPOTS) {
    const n = (this.count = spots.length >> 1);
    this.x = new Float64Array(n);
    this.z = new Float64Array(n);
    this.lift = new Float64Array(n);
    this.reach = new Float64Array(n);
    this.shown = new Uint8Array(n).fill(1);
    for (let i = 0; i < n; i++) {
      const x = (this.x[i] = spots[i * 2]);
      const z = (this.z[i] = spots[i * 2 + 1]);
      const lift = litterTopHeight(x, z) - floorHeight(x, z) + MOUND_TOP + RIDE_MARGIN;
      this.lift[i] = lift;
      this.reach[i] = TOP_R + REACH_PER * lift;
      this.clearHeap(i);
    }
  }

  /**
   * Raises mound i's lift until the ride clears its heap all round (the leaves' depth varies under
   * it): its profile on the drawn ground, plus RIDE_MARGIN, from TOP_R out to its foot.
   */
  private clearHeap(i: number): void {
    const r = this.reach[i];
    let lift = this.lift[i];
    for (let a = 0; a < 24; a++) {
      const dx = Math.cos((a / 24) * Math.PI * 2);
      const dz = Math.sin((a / 24) * Math.PI * 2);
      for (let d = TOP_R; d <= MOUND_R + 1e-9; d += 0.04) {
        const x = this.x[i] + dx * d;
        const z = this.z[i] + dz * d;
        const t = (r - d) / (r - TOP_R);
        const need = litterTopHeight(x, z) - floorHeight(x, z) + heapAt(d) + RIDE_MARGIN;
        lift = Math.max(lift, need / (t * t * (3 - 2 * t)));
      }
    }
    this.lift[i] = lift;
  }

  /** The belly's lift (u) over the floor at (x, z) from the shown mounds (0 off them). Allocates: tests and set-up only. */
  rise(x: number, z: number): number {
    const out = { y: 0 };
    riseInto(this, new Float64Array([x, z]), out);
    return out.y;
  }

  /** Mounds with an opening on them hide, the rest show: rechecked when the openings change. */
  sync(o: Openings): void {
    if (o.version === this.openingsVersion) return;
    this.openingsVersion = o.version;
    for (let i = 0; i < this.count; i++) {
      let on = 1;
      for (let k = 0; k < o.count; k++) {
        if (hypot2(o.data[k * 4] - this.x[i], o.data[k * 4 + 2] - this.z[i]) < OPENING_CLEAR) on = 0;
      }
      if (on !== this.shown[i]) {
        this.shown[i] = on;
        this.version++;
      }
    }
  }
}
