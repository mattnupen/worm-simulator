import { stretchInto, swellOf, type StretchAsk } from './wormShape';
import { RING_SLIDE, WAVES } from './wormMesh';

/** How thick peristalsis can make the body around a point (moved from wormMesh.ts). */
/** A ring's stretch is the mean over its neighbours, which lie at most this far (body coordinate). */
const RING_GAP = 0.04;
/** Stretch samples across a span, and the most the stretch can stray between them (x amplitude). */
const SWELL_SAMPLES = 9;
const SWELL_SLACK = 0.12;

/**
 * The least and most peristalsis scales the radius of any ring whose rest body coordinate lies
 * within `reach` of m (wherever it slides), at any phase and amplitude between (phase0, amp0)
 * and (phase1, amp1): the worm is drawn between two steps. The stretch is linear in the
 * amplitude, and the phase moves a hair per step (bounded by its slope). Allocates nothing.
 */
export function swellRange(
  m: number, reach: number, phase0: number, phase1: number, amp0: number, amp1: number,
  out: { min: number; max: number },
): { min: number; max: number } {
  asked.m = m;
  asked.reach = reach;
  asked.phase0 = phase0;
  asked.phase1 = phase1;
  asked.amp0 = amp0;
  asked.amp1 = amp1;
  return swellRangeOf(asked, out);
}

/**
 * swellRange's numbers in one object: the per-step form (the crawl's pushers) takes them so, as a
 * number passed to a call V8 does not inline is boxed on the heap (garbage every step).
 */
export interface SwellAsk { m: number; reach: number; phase0: number; phase1: number; amp0: number; amp1: number }
const asked: SwellAsk = { m: 0, reach: 0, phase0: 0, phase1: 0, amp0: 0, amp1: 0 };
const stretch: StretchAsk = { m: 0, phase: 0, amplitude: 0, waves: 0, stretch: 0 };

/** swellRange, asked with `q`. */
export function swellRangeOf(q: SwellAsk, out: { min: number; max: number }): { min: number; max: number } {
  const { m, reach, phase0, phase1, amp0, amp1 } = q;
  const r = reach + RING_SLIDE + RING_GAP;
  const ampLo = Math.min(amp0, amp1);
  const ampHi = Math.max(amp0, amp1);
  let lo = Infinity;
  let hi = -Infinity;
  const st = stretch;
  st.phase = phase1;
  st.amplitude = 1;
  st.waves = WAVES;
  for (let k = 0; k < SWELL_SAMPLES; k++) {
    st.m = Math.min(1, Math.max(0, m - r + (2 * r * k) / (SWELL_SAMPLES - 1)));
    stretchInto(st);
    // The stretch is 1 + amplitude x wave: its extremes over the amplitudes are at the ends.
    const wave = st.stretch - 1;
    const least = 1 + wave * (wave > 0 ? ampLo : ampHi);
    const most = 1 + wave * (wave > 0 ? ampHi : ampLo);
    if (least < lo) lo = least;
    if (most > hi) hi = most;
  }
  // Between samples, and back to phase0 (the wave moves at most 2 pi x 1.1 per unit of phase).
  const slack = ampHi * (SWELL_SLACK + 2 * Math.PI * 1.1 * Math.abs(phase1 - phase0));
  out.max = swellOf(lo - slack);
  out.min = swellOf(hi + slack);
  return out;
}
