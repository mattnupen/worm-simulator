import type { Vec3 } from '../core/vec';
import { probeReach, type HeadProbe, type WaveState } from '../worm/wormShape';
import { bodyCoordAt, peristalsisAmplitude, wormExtent, wormLength, type WormExtent } from '../worm/wormMesh';
import { swellRangeOf, type SwellAsk } from '../worm/swell';
import { PUSHER_SPAN, PUSHER_STRIDE } from '../surface/heroLeaves';

/**
 * The crawl's body as the hero leaves feel it (moved from crawl.ts): pushers at every segment and
 * the midpoints between them, head first. Per step it allocates nothing: the swell is asked in an
 * object (SwellAsk), as a number passed to a call V8 does not inline is boxed on the heap.
 */

/** The head pusher shoves hardest (>= 0.9 is the head to the leaf physics); the body gently. */
const HEAD_PUSH = 1;
const BODY_PUSH = 0.5;

export interface Pushers {
  /** How many pushers: every segment and the midpoints between them. */
  readonly count: number;
  /** PUSHER_STRIDE floats per pusher ([x, z, radius, strength, top, under, belly, fall]), for the hero leaves. */
  readonly out: Float32Array;
  /** Per pusher, its rest body coordinate, and the body it stands for at rest thickness (wormExtent): top, half-width, fall, probe share. */
  readonly m: Float32Array;
  readonly top: Float32Array;
  readonly half: Float32Array;
  readonly fall: Float32Array;
  readonly share: Float32Array;
  readonly ask: SwellAsk;
  readonly swell: { min: number; max: number };
  readonly head: HeadProbe;
}

export function createPushers(segments: number, spacing: number): Pushers {
  const count = 2 * segments - 1;
  /** A pusher stands for the rings within PUSHER_SPAN of it along the spine (in body coordinate). */
  const reach = PUSHER_SPAN / wormLength(segments, spacing);
  const p: Pushers = {
    count, out: new Float32Array(count * PUSHER_STRIDE),
    m: new Float32Array(count), top: new Float32Array(count), half: new Float32Array(count),
    fall: new Float32Array(count), share: new Float32Array(count),
    ask: { m: 0, reach, phase0: 0, phase1: 0, amp0: 0, amp1: 0 },
    swell: { min: 1, max: 1 }, head: { lift: 0, sway: 0 },
  };
  const ext: WormExtent = { top: 0, half: 0, fall: 0, probe: 0 };
  for (let k = 0; k < count; k++) {
    p.m[k] = bodyCoordAt((k * spacing) / 2, segments, spacing);
    wormExtent(p.m[k], reach, ext);
    p.top[k] = ext.top;
    p.half[k] = ext.half;
    p.fall[k] = ext.fall;
    p.share[k] = ext.probe;
  }
  return p;
}

/**
 * Packs the body for the hero leaves: where each pusher is, how wide, how hard it shoves (the head
 * hardest), the height of its top, how far under the litter it is, the height of its belly and how
 * far its top falls to its side. The worm is drawn between the last two steps (`prev`, `wave`), so
 * its thickness (swellRange) and the head's probing (probeReach) are bounded over the phase and
 * activity of both.
 */
export function packPushers(p: Pushers, b: readonly Vec3[], under: Float32Array, prev: WaveState, wave: WaveState): void {
  const out = p.out;
  const last = b.length - 1;
  const a0 = prev.activity;
  const a1 = wave.activity;
  const q = p.ask;
  q.phase0 = prev.phase;
  q.phase1 = wave.phase;
  q.amp0 = peristalsisAmplitude(a0);
  q.amp1 = peristalsisAmplitude(a1);
  const swell = p.swell;
  const probe = p.head;
  probeReach(1 - Math.min(a0, a1), probe);
  for (let k = 0; k < p.count; k++) {
    const i = k >> 1;
    const j = Math.min(last, i + (k & 1));
    const o = k * PUSHER_STRIDE;
    q.m = p.m[k];
    swellRangeOf(q, swell);
    const share = p.share[k];
    out[o] = (b[i].x + b[j].x) / 2;
    out[o + 1] = (b[i].z + b[j].z) / 2;
    out[o + 2] = p.half[k] * swell.max + probe.sway * share;
    out[o + 3] = k === 0 ? HEAD_PUSH : BODY_PUSH;
    // The segments rest at their belly height (bellyHeight of their surface).
    const belly = (b[i].y + b[j].y) / 2;
    out[o + 4] = belly + p.top[k] * swell.max + probe.lift * share;
    out[o + 5] = (under[i] + under[j]) / 2;
    out[o + 6] = belly;
    out[o + 7] = p.fall[k] * swell.min;
  }
}
