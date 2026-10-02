import * as THREE from 'three';
import { createSpine, fitSpine, sampleSpine, transportFrames, type Spine } from './spine';
import { ringTrig, tubeIndices, tubeVertexCount, writeTube } from './tube';
import {
  radiusProfile, bodyRadius, verticalScale, lateralScale, ringParams, peristalsis, peristalsisStretch,
  probeHead, swellOf, type HeadProbe,
} from './wormShape';
import { createWormMaterial } from './wormMaterial';
import { WormShadow, type GroundFn } from './wormShadow';

const RINGS = 48;
const RADIAL = 14;
/** Widest body radius (world units). */
export const WORM_RADIUS = 0.115;
/** Arc length the head and tail caps reach beyond the first and last spine points. */
const HEAD_EXT = 0.1;
const TAIL_EXT = 0.06;
/** Contraction waves along the body at once. */
export const WAVES = 2.6;
/** Head probing bends this fraction of the body (from the tip). */
const PROBE_SPAN = 0.2;
/** Contact shadow: one ribbon station per this many rings. */
const SHADOW_STEP = 2;

/** Nominal tip-to-tip body length for a spine of `points` evenly spaced by `spacing`. */
export function wormLength(points: number, spacing: number): number {
  return HEAD_EXT + (points - 1) * spacing + TAIL_EXT;
}

/** Peristalsis slides a ring along the body by at most this (in body coordinate). */
const RING_SLIDE = 0.02;
/** Peristalsis amplitude at `activity` (0 resting .. 1 crawling at full speed). */
export function peristalsisAmplitude(activity: number): number {
  return 0.08 + 0.18 * Math.min(1, Math.max(0, activity));
}

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
  const r = reach + RING_SLIDE + RING_GAP;
  const ampLo = Math.min(amp0, amp1);
  const ampHi = Math.max(amp0, amp1);
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < SWELL_SAMPLES; k++) {
    const mi = Math.min(1, Math.max(0, m - r + (2 * r * k) / (SWELL_SAMPLES - 1)));
    // The stretch is 1 + amplitude x wave: its extremes over the amplitudes are at the ends.
    const wave = peristalsisStretch(mi, phase1, 1, WAVES) - 1;
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

/** Body coordinate (0 head tip .. 1 tail tip) of the spine point `arc` behind the first one. */
export function bodyCoordAt(arc: number, points: number, spacing: number): number {
  return (HEAD_EXT + arc) / wormLength(points, spacing);
}

/** Bounds of the rendered body near a body coordinate, before peristalsis and probing (wormExtent). */
export interface WormExtent {
  /** Highest the tube's top rises above its belly line. */
  top: number;
  /** Widest the tube reaches to either side of the spine. */
  half: number;
  /** Least the top surface falls from its crest to the tube's side (its vertical radius). */
  fall: number;
  /** How much of the head's probing lift and sway reaches here (0..1). */
  probe: number;
}

/**
 * Bounds of the rendered body over every ring whose rest body coordinate lies within `reach`
 * of m, wherever peristalsis slides it, at rest thickness: scale `top`, `half` and `fall` by
 * swellRange (max, max, min) and add probeReach (lift, sway) x `probe` for the body as drawn.
 * Writes into `out` (allocates nothing).
 */
export function wormExtent(m: number, reach: number, out: WormExtent): WormExtent {
  let top = 0;
  let half = 0;
  let fall = Infinity;
  const r = reach + RING_SLIDE;
  for (let k = -8; k <= 8; k++) {
    const mi = Math.min(1, Math.max(0, m + (k * r) / 8));
    const vs = verticalScale(mi);
    const p = radiusProfile(mi);
    top = Math.max(top, WORM_RADIUS * vs * (bodyRadius(mi) + p));
    half = Math.max(half, WORM_RADIUS * p * lateralScale(mi));
    fall = Math.min(fall, WORM_RADIUS * vs * p);
  }
  const lo = Math.max(0, m - r);
  const u = lo < PROBE_SPAN ? 1 - lo / PROBE_SPAN : 0;
  out.top = top;
  out.half = half;
  out.fall = fall;
  out.probe = u * u;
  return out;
}

export interface WormPose {
  /** Spine points along the belly line, head first, xyz packed. */
  spine: Float32Array;
  /** Peristalsis phase (one unit = one wavelength travelled head to tail). */
  phase: number;
  /** 0 resting .. 1 crawling at full speed. */
  activity: number;
  timeSec: number;
}

/**
 * The hero worm: one continuous tube (1 draw) and a soft contact-shadow ribbon (1 draw),
 * rebuilt in place from the simulated spine each rendered frame. Allocates nothing per frame.
 */
export class HeroWorm {
  readonly group = new THREE.Group();
  private readonly spine: Spine;
  private readonly m = new Float32Array(RINGS);
  private readonly s = new Float32Array(RINGS);
  private readonly k = new Float32Array(RINGS);
  private readonly r = new Float32Array(RINGS);
  private readonly rN = new Float32Array(RINGS);
  private readonly rB = new Float32Array(RINGS);
  private readonly slope = new Float32Array(RINGS);
  private readonly c = new Float32Array(RINGS * 3);
  private readonly T = new Float32Array(RINGS * 3);
  private readonly N = new Float32Array(RINGS * 3);
  private readonly B = new Float32Array(RINGS * 3);
  private readonly trig = ringTrig(RADIAL);
  private readonly probe: HeadProbe = { lift: 0, sway: 0 };
  private readonly pos: THREE.BufferAttribute;
  private readonly nor: THREE.BufferAttribute;
  private readonly tan: THREE.BufferAttribute;
  private readonly shadow: WormShadow;

  /** `groundAt`: the surface the worm rests on; its contact shadow is draped over it. */
  constructor(spinePoints: number, groundAt?: GroundFn) {
    this.spine = createSpine(spinePoints, 4);
    ringParams(this.m);
    const verts = tubeVertexCount(RINGS, RADIAL);
    const geo = new THREE.BufferGeometry();
    this.pos = dynamicAttr(new Float32Array(verts * 3));
    this.nor = dynamicAttr(new Float32Array(verts * 3));
    this.tan = dynamicAttr(new Float32Array(verts * 3));
    const body = new Float32Array(verts * 2);
    for (let i = 0; i < RINGS; i++) {
      for (let j = 0; j <= RADIAL; j++) {
        const v = i * (RADIAL + 1) + j;
        body[v * 2] = this.m[i];
        body[v * 2 + 1] = j / RADIAL;
      }
    }
    geo.setAttribute('position', this.pos);
    geo.setAttribute('normal', this.nor);
    geo.setAttribute('aTangent', this.tan);
    geo.setAttribute('aBody', new THREE.BufferAttribute(body, 2));
    geo.setIndex(new THREE.BufferAttribute(tubeIndices(RINGS, RADIAL), 1));
    const mesh = new THREE.Mesh(geo, createWormMaterial());
    mesh.frustumCulled = false;
    mesh.name = 'worm';

    this.shadow = new WormShadow(this.m, SHADOW_STEP, groundAt);

    this.group.add(this.shadow.mesh, mesh);
    this.group.name = 'heroWorm';
  }

  update(pose: WormPose): void {
    const { spine, m, s, k, r, rN, rB, slope, c, T, N, B, probe } = this;
    fitSpine(spine, pose.spine);
    const total = HEAD_EXT + spine.length + TAIL_EXT;
    const act = Math.min(1, Math.max(0, pose.activity));
    peristalsis(m, pose.phase, peristalsisAmplitude(act), WAVES, s, k);
    probeHead(pose.timeSec, 1 - act, probe);

    // Head direction (for the sideways sway), from the first two spine points.
    let fx = pose.spine[0] - pose.spine[3];
    let fz = pose.spine[2] - pose.spine[5];
    const fl = Math.hypot(fx, fz);
    if (fl > 1e-6) { fx /= fl; fz /= fl; } else { fx = 0; fz = 1; }

    for (let i = 0; i < RINGS; i++) {
      const mi = m[i];
      const o = i * 3;
      sampleSpine(spine, s[i] * total - HEAD_EXT, c, o);
      const ri = WORM_RADIUS * radiusProfile(mi) * k[i];
      r[i] = ri;
      rN[i] = ri * verticalScale(mi);
      rB[i] = ri * lateralScale(mi);
      // The spine is the belly line; the axis sits a body radius above it (caps included).
      c[o + 1] += WORM_RADIUS * bodyRadius(mi) * k[i] * verticalScale(mi);
      if (mi < PROBE_SPAN) {
        const u = 1 - mi / PROBE_SPAN;
        const w = u * u;
        c[o] += fz * probe.sway * w;
        c[o + 1] += probe.lift * w;
        c[o + 2] -= fx * probe.sway * w;
      }
    }
    transportFrames(c, RINGS, T, N, B);
    for (let i = 0; i < RINGS; i++) {
      const a = i > 0 ? i - 1 : 0;
      const b = i < RINGS - 1 ? i + 1 : RINGS - 1;
      const ds = (s[b] - s[a]) * total;
      slope[i] = ds > 1e-6 ? (r[b] - r[a]) / ds : 0;
    }
    const pos = this.pos.array as Float32Array;
    const nor = this.nor.array as Float32Array;
    writeTube(RINGS, this.trig, c, T, N, B, rN, rB, slope, pos, nor);
    const tan = this.tan.array as Float32Array;
    for (let i = 0; i < RINGS; i++) {
      for (let j = 0; j <= RADIAL; j++) {
        const v = (i * (RADIAL + 1) + j) * 3;
        tan[v] = T[i * 3];
        tan[v + 1] = T[i * 3 + 1];
        tan[v + 2] = T[i * 3 + 2];
      }
    }
    this.pos.needsUpdate = true;
    this.nor.needsUpdate = true;
    this.tan.needsUpdate = true;
    this.shadow.update(c, T, rB);
  }
}

function dynamicAttr(arr: Float32Array): THREE.BufferAttribute {
  const a = new THREE.BufferAttribute(arr, 3);
  a.setUsage(THREE.DynamicDrawUsage);
  return a;
}
