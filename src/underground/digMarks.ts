import { hypot2 } from '../core/vec';
import type { WormMotion } from '../worm/locomotion';
import type { Openings } from './openings';
import {
  BEHIND_COS, DROP_FAR, FAILED, FRONT_WEIGHT, GAME_TESTS, GRID, KEEP_NEAR, LIM, MARK_BUDGET, MARK_FAR, MARK_GAP, MARK_NEAR,
  MARK_NONE, MARK_OPENING, MARK_SPOT, MAX_MARKS, NUDGE, OPENING_EVERY, OPENING_GAP, PATTERN, PATTERN_N, PLACE_COS,
  RECHECK_EVERY, REPLACE_MARGIN, SCAN_LOOKS, type DigTests, type MarkAsk, type MarkWorld,
} from './digMarkRules';

export * from './digMarkRules';

/**
 * Where the worm could dig, shown on the ground (V4 spec 4.2): up to MAX_MARKS spots near the head
 * where digging down works, found a few dig tests a step (canDigAt is costly: up to about 100 us,
 * more on a Chromebook), never more than MARK_BUDGET. Spots are tried front first on a fixed
 * pattern round the head, snapped to a world grid (with a steady per-cell nudge, so they do not
 * line up), so the same cells come up again as the worm moves. Each spot is tested for a worm
 * arriving there straight from where the head is now (heading from the head to the spot, no body:
 * a straight body behind it). A marker stays where it was put until it is too far, well behind the
 * worm, fails a recheck, or a much better spot replaces it: markers never jitter or swap.
 * Old openings that lead to a burrow (Openings.burrow) come first: the dig there goes back into
 * that burrow when the reuse test passes (or digs a new one where canDigAt allows).
 * Pure (no three.js); allocates nothing per step.
 */

export class DigMarks {
  /** Each slot: where (x, z), what (MARK_NONE, MARK_SPOT, MARK_OPENING) and, for an opening, which. */
  readonly x = new Float64Array(MAX_MARKS);
  readonly z = new Float64Array(MAX_MARKS);
  readonly kind = new Uint8Array(MAX_MARKS);
  readonly opening = new Int8Array(MAX_MARKS).fill(-1);
  /** Bumped whenever a slot changes. */
  version = 0;
  /** Dig tests made in the last step (MARK_BUDGET at most). */
  calls = 0;
  private cursor = 0;
  private openingCursor = 0;
  private recheckSlot = 0;
  private steps = 0;
  private openingsVersion = -1;
  private readonly failed = new Int32Array(FAILED).fill(-0x7fffffff);
  private failedAt = 0;
  private readonly ask = { head: { x: 0, y: 0, z: 0 }, heading: 0 };
  /** The head and its heading this step. */
  private hx = 0;
  private hz = 0;
  private fx = 0;
  private fz = 1;
  /**
   * The spot being looked at: x, z, its distance and score from the head. Numbers stay in typed
   * arrays across calls: a number passed to (or returned from) a call V8 does not inline is boxed.
   */
  private readonly cand = new Float64Array(4);
  /** Each slot's score from the head this step (lower is better). */
  private readonly scores = new Float64Array(MAX_MARKS);

  constructor(private readonly tests: DigTests = GAME_TESTS) {}

  /** No markers (and nothing remembered). */
  clear(): void {
    for (let i = 0; i < MAX_MARKS; i++) this.free(i);
    this.failed.fill(-0x7fffffff);
    this.openingsVersion = -1;
  }

  /** One game step on the surface, the worm (`m`, as Crawl.motion) over `w`'s openings. */
  step(m: WormMotion, w: MarkWorld): void {
    this.calls = 0;
    this.steps++;
    this.hx = m.head.x;
    this.hz = m.head.z;
    this.fx = Math.sin(m.heading);
    this.fz = Math.cos(m.heading);
    const o = w.openings;
    // Openings changed (one added or moved): their markers are found again.
    if (o.version !== this.openingsVersion) {
      this.openingsVersion = o.version;
      for (let i = 0; i < MAX_MARKS; i++) if (this.kind[i] === MARK_OPENING) this.free(i);
    }
    // Too far, or well behind the worm: dropped. The rest are scored.
    for (let i = 0; i < MAX_MARKS; i++) {
      if (this.kind[i] === MARK_NONE) continue;
      this.look(this.x[i], this.z[i]);
      const c = this.cand;
      if (c[2] > DROP_FAR || (c[2] > KEEP_NEAR && this.round() < BEHIND_COS * c[2])) this.free(i);
      else this.scores[i] = c[3];
    }
    if (this.steps % OPENING_EVERY === 0) this.checkOpening(w);
    if (this.steps % RECHECK_EVERY === 0) this.recheck();
    this.scan(o);
  }

  /** Looks at the spot (x, z): its distance and score from the head into `cand`. Inlined (small). */
  private look(x: number, z: number): void {
    const c = this.cand;
    c[0] = x;
    c[1] = z;
    const d = hypot2(x - this.hx, z - this.hz);
    c[2] = d;
    c[3] = d + FRONT_WEIGHT * (1 - (d > 1e-9 ? ((x - this.hx) * this.fx + (z - this.hz) * this.fz) / d : 1));
  }

  /** How far the spot looked at lies along the heading (its distance times the cos of its angle off it). */
  private round(): number {
    const c = this.cand;
    return (c[0] - this.hx) * this.fx + (c[1] - this.hz) * this.fz;
  }

  /** A dig test of the spot looked at, for a worm arriving there from the head (counted). */
  private aim(): MarkAsk {
    const a = this.ask;
    const c = this.cand;
    a.head.x = c[0];
    a.head.z = c[1];
    a.heading = Math.atan2(c[0] - this.hx, c[1] - this.hz);
    this.calls++;
    return a;
  }

  /** The next opening with a burrow, in reach (round robin): tested, then marked first or dropped. */
  private checkOpening(w: MarkWorld): void {
    const o = w.openings;
    if (o.count === 0 || MARK_BUDGET - this.calls < 2) return;
    const c = this.cand;
    for (let n = 0; n < o.count; n++) {
      const i = (this.openingCursor + n) % o.count;
      if (o.burrow[i] < 0) continue;
      const slot = this.slotOf(i);
      this.look(o.data[i * 4], o.data[i * 4 + 2]);
      if (slot < 0 && (c[2] > MARK_FAR + 1 || (c[2] > KEEP_NEAR && this.round() < PLACE_COS * c[2]))) continue;
      this.openingCursor = (i + 1) % o.count;
      const ok = this.tests.reuse(w, i, this.aim()) || this.tests.spot(this.aim());
      if (!ok) {
        if (slot >= 0) this.free(slot);
        return;
      }
      if (slot >= 0) return;
      // Marked first: a free slot, else the worst spot, else the worst opening if this one is better.
      let k = this.freeSlot();
      if (k < 0) k = this.worst(MARK_SPOT);
      if (k < 0) {
        k = this.worst(MARK_OPENING);
        if (k >= 0 && this.scores[k] <= c[3]) k = -1;
      }
      if (k >= 0) this.put(k, MARK_OPENING, i);
      return;
    }
  }

  /** One kept spot marker is tested again (round robin); dropped if it no longer works. */
  private recheck(): void {
    for (let n = 0; n < MAX_MARKS; n++) {
      const i = (this.recheckSlot + n) % MAX_MARKS;
      if (this.kind[i] !== MARK_SPOT) continue;
      this.recheckSlot = (i + 1) % MAX_MARKS;
      this.look(this.x[i], this.z[i]);
      if (this.calls < MARK_BUDGET && !this.tests.spot(this.aim())) this.free(i);
      return;
    }
  }

  /** Candidate spots from the pattern while the budget lasts (SCAN_LOOKS of them at most). */
  private scan(o: Openings): void {
    const c = this.cand;
    for (let n = 0; n < SCAN_LOOKS && this.calls < MARK_BUDGET; n++) {
      const p = this.cursor;
      this.cursor = (p + 1) % PATTERN_N;
      const f = PATTERN[p * 2];
      const r = PATTERN[p * 2 + 1];
      // Forward along the heading, right of it (the heading's right: (fz, -fx)); snapped, nudged.
      const ix = Math.round((this.hx + this.fx * f + this.fz * r) / GRID);
      const iz = Math.round((this.hz + this.fz * f - this.fx * r) / GRID);
      const nx = Math.sin(ix * 127.1 + iz * 311.7 + 74.7) * 43758.5453;
      const nz = Math.sin(ix * 127.1 + iz * 311.7 + 149.4) * 43758.5453;
      this.look((ix + (nx - Math.floor(nx) - 0.5) * 2 * NUDGE) * GRID, (iz + (nz - Math.floor(nz) - 0.5) * 2 * NUDGE) * GRID);
      if (Math.abs(c[0]) > LIM || Math.abs(c[1]) > LIM) continue;
      if (c[2] < MARK_NEAR || c[2] > MARK_FAR || this.round() < PLACE_COS * c[2]) continue;
      if (this.crowded(o) || this.hasFailed(ix, iz)) continue;
      let k = this.freeSlot();
      if (k < 0) {
        k = this.worst(MARK_SPOT);
        if (k < 0 || c[3] > this.scores[k] - REPLACE_MARGIN) continue;
      }
      if (this.tests.spot(this.aim())) this.put(k, MARK_SPOT, -1);
      else this.fail(ix, iz);
    }
  }

  /** The spot looked at is within MARK_GAP of a marker or OPENING_GAP of an opening. */
  private crowded(o: Openings): boolean {
    const x = this.cand[0];
    const z = this.cand[1];
    for (let i = 0; i < MAX_MARKS; i++) {
      if (this.kind[i] !== MARK_NONE && hypot2(this.x[i] - x, this.z[i] - z) < MARK_GAP) return true;
    }
    for (let i = 0; i < o.count; i++) {
      if (hypot2(o.data[i * 4] - x, o.data[i * 4 + 2] - z) < OPENING_GAP) return true;
    }
    return false;
  }

  private hasFailed(ix: number, iz: number): boolean {
    const key = ix * 4096 + iz;
    for (let i = 0; i < FAILED; i++) if (this.failed[i] === key) return true;
    return false;
  }

  private fail(ix: number, iz: number): void {
    this.failed[this.failedAt] = ix * 4096 + iz;
    this.failedAt = (this.failedAt + 1) % FAILED;
  }

  private slotOf(opening: number): number {
    for (let i = 0; i < MAX_MARKS; i++) if (this.kind[i] === MARK_OPENING && this.opening[i] === opening) return i;
    return -1;
  }

  private freeSlot(): number {
    for (let i = 0; i < MAX_MARKS; i++) if (this.kind[i] === MARK_NONE) return i;
    return -1;
  }

  /** The slot of that kind with the worst score, or -1. */
  private worst(kind: number): number {
    let k = -1;
    for (let i = 0; i < MAX_MARKS; i++) {
      if (this.kind[i] === kind && (k < 0 || this.scores[i] > this.scores[k])) k = i;
    }
    return k;
  }

  /** Slot i marks the spot looked at. */
  private put(i: number, kind: number, opening: number): void {
    this.x[i] = this.cand[0];
    this.z[i] = this.cand[1];
    this.scores[i] = this.cand[3];
    this.kind[i] = kind;
    this.opening[i] = opening;
    this.version++;
  }

  private free(i: number): void {
    if (this.kind[i] === MARK_NONE) return;
    this.kind[i] = MARK_NONE;
    this.opening[i] = -1;
    this.version++;
  }
}
