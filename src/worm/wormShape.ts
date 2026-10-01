/**
 * Pure shape and motion helpers for the hero worm.
 * Body coordinates t / m run from 0 (head tip, the prostomium) to 1 (tail tip).
 */

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Fraction of the body length taken by the pointed head cap and the rounded tail cap. */
const HEAD_CAP = 0.085;
const TAIL_CAP = 0.035;
/** Body radius peaks here, in the anterior third (like a real Lumbricus). */
const THICKEST = 0.27;

/**
 * Radius as a fraction of the maximum at t in [0, 1], head to tail. Zero at both tips.
 * - Head: a slightly pointed lobe (the prostomium), narrower than the body behind it.
 * - Thickest in the anterior third.
 * - Long gentle taper to a rounded tail.
 */
export function radiusProfile(t: number): number {
  if (!(t > 0 && t < 1)) return 0;
  // Head cap: (1 - u^2)^0.75 tapers to a soft, blunt point, sharper than a hemisphere.
  const uh = 1 - clamp01(t / HEAD_CAP);
  const head = Math.pow(1 - uh * uh, 0.75);
  // Tail cap: an ellipse quadrant, so the end is round.
  const ut = 1 - clamp01((1 - t) / TAIL_CAP);
  const tail = Math.sqrt(1 - ut * ut);
  return bodyRadius(t) * head * tail;
}

/**
 * The body's radius fraction without the end caps closing it: the head stays narrower than
 * the anterior third, then a long gentle taper toward the tail. The tube's axis rides this
 * high above the belly line, so the caps close around the axis instead of nosing into the ground.
 */
export function bodyRadius(t: number): number {
  const tc = clamp01(t);
  const grow = 0.8 + 0.2 * smoothstep(0, THICKEST, tc);
  const taper = 1 - 0.34 * smoothstep(THICKEST, 1, tc);
  return grow * taper;
}

/**
 * Cross-section scale along the dorsal (up) axis. A worm's belly is a little flat, and the
 * tail flattens dorsoventrally into a paddle.
 */
export function verticalScale(t: number): number {
  return 0.9 - 0.36 * smoothstep(0.7, 0.98, t);
}

/** Cross-section scale along the lateral axis: the tail paddle widens a little. */
export function lateralScale(t: number): number {
  return 1 + 0.2 * smoothstep(0.72, 0.98, t);
}

/**
 * Fills `out` with ring body coordinates in [0, 1], strictly increasing, packed more
 * densely toward both tips so the end caps stay round.
 */
export function ringParams(out: Float32Array): void {
  const n = out.length;
  const k = 0.78;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    out[i] = u - (k * Math.sin(2 * Math.PI * u)) / (2 * Math.PI);
  }
  out[0] = 0;
  out[n - 1] = 1;
}

/**
 * Peristalsis as squash and stretch: a contraction wave that travels head to tail as `phase`
 * grows (one unit of phase = one wavelength). Each ring's body coordinate m is moved to `outS`
 * (still 0..1 and monotonic for amplitude < ~0.55); where the body shortens it thickens, so
 * volume is roughly kept: `outScale` = 1 / sqrt(local stretch). The tips stay put.
 */
export function peristalsis(
  m: Float32Array,
  phase: number,
  amplitude: number,
  waves: number,
  outS: Float32Array,
  outScale: Float32Array,
): void {
  const n = m.length;
  const tau = 2 * Math.PI;
  for (let i = 0; i < n; i++) {
    const mi = m[i];
    const env = smoothstep(0, 0.16, mi) * (1 - smoothstep(0.8, 1, mi));
    outS[i] = mi + (amplitude * env * Math.sin(tau * (waves * mi - phase))) / (tau * waves);
  }
  for (let i = 0; i < n; i++) {
    const a = i > 0 ? i - 1 : 0;
    const b = i < n - 1 ? i + 1 : n - 1;
    const dm = m[b] - m[a];
    const stretch = dm > 0 ? (outS[b] - outS[a]) / dm : 1;
    outScale[i] = Math.min(1.45, Math.max(0.72, 1 / Math.sqrt(Math.max(0.2, stretch))));
  }
}

/** Smooth, bounded pseudo-noise in [-1, 1] from incommensurate sines (no jitter). */
function wander(t: number, seed: number): number {
  return (
    0.5 * Math.sin(0.93 * t + seed)
    + 0.3 * Math.sin(1.71 * t + seed * 2.3 + 1.1)
    + 0.2 * Math.sin(0.41 * t + seed * 0.7 + 2.4)
  );
}

export interface HeadProbe {
  /** World units the head tip rises (always >= 0). */
  lift: number;
  /** World units the head tip swings sideways. */
  sway: number;
}

/**
 * The prostomium searching: the head tip gently lifts and sways. `idle` in [0, 1]:
 * 1 = resting (big, slow searching), 0 = crawling (small). Writes into `out`; allocates nothing.
 */
export function probeHead(timeSec: number, idle: number, out: HeadProbe): void {
  const w = clamp01(idle);
  const liftAmp = 0.03 + 0.11 * w;
  const swayAmp = 0.02 + 0.07 * w;
  out.lift = liftAmp * (0.55 + 0.45 * wander(timeSec * 1.1, 0.4));
  out.sway = swayAmp * wander(timeSec * 1.4, 3.7);
}

export interface WaveState {
  /** Peristalsis phase, in wavelengths. */
  phase: number;
  /** Smoothed 0 (resting) .. 1 (crawling at full speed). */
  activity: number;
}

/**
 * Advances the contraction wave by one simulation step. While crawling the phase follows the
 * distance travelled (`wavesPerUnit`), so the thick, shortened segments stay planted on the
 * ground as the body slides past them, like a real earthworm. At rest a slow `restHz`
 * breathing wave keeps the body alive. Mutates `state`.
 */
export function advanceWave(
  state: WaveState, moved: number, dt: number, fullSpeed: number, wavesPerUnit: number, restHz: number,
): void {
  if (!(dt > 0)) return;
  const target = Math.min(1, Math.max(0, moved / dt / fullSpeed));
  state.activity += (target - state.activity) * (1 - Math.exp(-3 * dt));
  state.phase += Math.max(0, moved) * wavesPerUnit + dt * restHz * (1 - state.activity);
}
