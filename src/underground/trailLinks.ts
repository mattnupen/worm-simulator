import { hypot2 } from '../core/vec';
import { wormBody } from '../worm/bodyLength';
import type { TrailBody } from './bodyTrail';

/**
 * The burrowing body's links (moved from bodyTrail.ts): each one's arc length along the trail,
 * eased to the worm's gap (wormBody.spacing: shorter after a break, bodyLength.ts). Allocates
 * nothing, and no fractional number crosses a call (the body goes in as an object).
 */
export interface TrailLinks {
  /** len[i]: the link from body point i - 1 to point i (i >= 1), as arc length (u) along the trail. */
  readonly len: Float64Array;
  /** The worm's gap when the links last eased, and whether they are drawing in to a shorter one. */
  gap: number;
  drawIn: boolean;
}

/** Seeded links ease to the worm's gap at this share per unit (u) the head moves... */
const LEN_EASE = 2;
/**
 * ...but the body grows by at most this share of the head's move: short seeded links grew faster
 * than the head moved, and the tail slid back along the trail.
 */
const GROW_MOST = 0.5;
/**
 * While the worm is drawing in (it just got shorter), a link longer than its gap also shrinks by
 * at least this share a step, the head moving or not: the tail is drawn in along the trail over
 * about half a second...
 */
const SHRINK_STEP = 0.08;
/** ...until no link is this much (u) longer. A trail seeded with a link this much over the gap draws in too. */
const DRAWN_IN = 1e-6;
const SEED_OVER = 0.01;

/** The links as the body's points lie (they keep their lengths, eased to the gap as the worm moves: nothing pops). */
export function seedLinks(t: TrailLinks, b: Pick<TrailBody, 'u' | 'v'>): void {
  t.gap = wormBody.spacing;
  t.drawIn = false;
  for (let i = 1; i < t.len.length; i++) {
    t.len[i] = Math.max(1e-3, hypot2(b.u[i] - b.u[i - 1], b.v[i] - b.v[i - 1]));
    if (t.len[i] > t.gap + SEED_OVER) t.drawIn = true;
  }
}

/** After the head moved forward (`b`: now and at the last step): the links ease toward the worm's gap. */
export function easeLinks(t: TrailLinks, b: TrailBody): void {
  const n = t.len.length;
  const mu = b.u[0] - b.prevU[0];
  const mv = b.v[0] - b.prevV[0];
  // Math.sqrt, not hypot2: it runs every step (bodyTrail.ts followHead).
  const moved = Math.sqrt(mu * mu + mv * mv);
  const gap = wormBody.spacing;
  if (gap < t.gap) t.drawIn = true;
  t.gap = gap;
  let e = Math.min(1, moved * LEN_EASE);
  let grow = 0;
  for (let i = 1; i < n; i++) grow += (gap - t.len[i]) * e;
  if (grow > GROW_MOST * moved) e *= (GROW_MOST * moved) / grow;
  const shrink = t.drawIn ? SHRINK_STEP : 0;
  let over = 0;
  for (let i = 1; i < n; i++) {
    const d = gap - t.len[i];
    t.len[i] += d * (d < 0 ? Math.max(e, shrink) : e);
    over = Math.max(over, t.len[i] - gap);
  }
  if (over < DRAWN_IN) t.drawIn = false;
}
