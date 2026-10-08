import { hypot2 } from '../core/vec';
import { SPACING } from '../game/crawl';
import { ix, shapeBody, SMOOTH, TRAIL_CAP, type BodyTrail } from './trailShape';

/**
 * The way the burrower's body follows its head (V2 spec 6): through the tunnel the head dug, not
 * cutting its corners. The trail is the head's own path, newest first, with each point's place
 * along it (arc length, largest at the head); every body point has its place on the trail, and
 * moves along it like a rope: it stays put until the point ahead is more than SPACING ahead along
 * the trail, then follows it there. Where it lies at its place is the trail rounded (trailShape.ts).
 * So the body lies in the head's tunnel (follow-the-leader cut each bend's inside, about 0.15 u on a
 * gentle curve, and the body's dig made the tunnel half again as wide). Backing up runs the same
 * rope from the tail, back along the trail while there is one (burrowBack.ts). Typed arrays only:
 * allocates nothing per step, and passes no fractional number to a call (a number passed to a call
 * V8 does not inline is boxed on the heap: solidShapes.ts).
 */
export { createTrail, type BodyTrail } from './trailShape';

/**
 * The head's newest point stays on the trail once it is this far past the last. Until then it moves
 * with the head, so a head pressed into a stone and jiggling there adds nothing to the trail's
 * length (with a point every step the jiggles added up, pulled the neck onto the head and wobbled
 * its facing).
 */
const TRAIL_STEP = 0.02;
/**
 * A body point the caller pushed off its shape (out of a stone, or under the leaves' top) moves as
 * its shape's place moves, and back toward it by at most this share of that move: it never jumps
 * back (a point pushed out of a stone would flick to the stone's far side), and a point at rest
 * stays put.
 */
const CATCH = 0.2;

/** The body a trail moves: its points (head first), as a Burrower holds them. */
export interface TrailBody {
  readonly u: Float64Array;
  readonly v: Float64Array;
  readonly trail: BodyTrail;
}

/** The trail is the body as it lies (head first): its points, spaced as they are. The body stays put. */
export function resetTrail(b: TrailBody): void {
  const t = b.trail;
  const n = b.u.length;
  t.front = 0;
  t.count = n;
  for (let k = 0; k < n; k++) {
    t.u[k] = b.u[k];
    t.v[k] = b.v[k];
    t.s[k] = k === 0 ? 0 : t.s[k - 1] - hypot2(b.u[k] - b.u[k - 1], b.v[k] - b.v[k - 1]);
    t.at[k] = t.s[k];
  }
  // Where the shape puts each point now: only its moves from here move the body.
  shapeBody(t);
  t.onU.set(t.toU);
  t.onV.set(t.toV);
}

/**
 * Body points from..to-1 as their shape (t.toU, t.toV: shapeBody, then kept out of the solids by
 * the caller) moved, and a little toward it (CATCH); the shape kept for the next step.
 */
export function settleBody(b: TrailBody, from: number, to: number): void {
  const t = b.trail;
  for (let i = from; i < to; i++) {
    const pu = t.toU[i];
    const pv = t.toV[i];
    const mu = pu - t.onU[i];
    const mv = pv - t.onV[i];
    const cu = b.u[i] + mu;
    const cv = b.v[i] + mv;
    const eu = pu - cu;
    const ev = pv - cv;
    const off = hypot2(eu, ev);
    const most = CATCH * hypot2(mu, mv);
    const g = off > most ? most / off : 1;
    b.u[i] = cu + eu * g;
    b.v[i] = cv + ev * g;
  }
  t.onU.set(t.toU);
  t.onV.set(t.toV);
}

/** Drops the oldest points the tail no longer needs (those over SMOOTH behind it, but one). */
function trimBack(t: BodyTrail, n: number): void {
  while (t.count > 2 && t.s[ix(t, t.count - 2)] <= t.at[n - 1] - SMOOTH) t.count--;
}

/**
 * After the head moved (b.u[0], b.v[0]): the trail grows with it, and each body point's place
 * follows along it, at most SPACING behind the one ahead; their shape is worked out (t.toU, t.toV)
 * for the caller to keep out of the solids and settle the body on (settleBody).
 */
export function followHead(b: TrailBody): void {
  const t = b.trail;
  const n = b.u.length;
  // The newest point keeps up with the head, and stays on the trail once TRAIL_STEP past the last.
  let j = t.front;
  let j1 = ix(t, 1);
  if (t.count < TRAIL_CAP && hypot2(t.u[j] - t.u[j1], t.v[j] - t.v[j1]) >= TRAIL_STEP) {
    t.front = (t.front + TRAIL_CAP - 1) % TRAIL_CAP;
    t.count++;
    j1 = j;
    j = t.front;
  }
  t.u[j] = b.u[0];
  t.v[j] = b.v[0];
  t.s[j] = t.s[j1] + hypot2(b.u[0] - t.u[j1], b.v[0] - t.v[j1]);
  t.at[0] = t.s[j];
  for (let i = 1; i < n; i++) t.at[i] = Math.min(t.at[i - 1], Math.max(t.at[i], t.at[i - 1] - SPACING));
  trimBack(t, n);
  shapeBody(t);
}

/**
 * After backUp moved the tail back (from t.fromU, t.fromV to b.u[n-1], b.v[n-1]): that far back
 * along the trail while there is trail behind it, else the trail grows behind it to where backUp
 * put it; the rest of the body follows back along the trail, each point at most SPACING ahead of
 * the one behind, and the trail ahead of the head (where it no longer is) is dropped. The tail is
 * put back where it was: its shape moves it, as the rest (settleBody).
 */
export function followTail(b: TrailBody): void {
  const t = b.trail;
  const n = b.u.length;
  const d = hypot2(b.u[n - 1] - t.fromU, b.v[n - 1] - t.fromV);
  if (d > 0) {
    if (t.at[n - 1] - t.s[ix(t, t.count - 1)] < d) {
      // The trail ends: the tail's old place becomes its oldest point, then the new place behind it.
      while (t.count > 2 && t.s[ix(t, t.count - 2)] <= t.at[n - 1]) t.count--;
      let j = ix(t, t.count - 1);
      t.u[j] = t.fromU;
      t.v[j] = t.fromV;
      t.s[j] = t.at[n - 1];
      if (t.count < TRAIL_CAP) t.count++;
      j = ix(t, t.count - 1);
      t.u[j] = b.u[n - 1];
      t.v[j] = b.v[n - 1];
      t.s[j] = t.at[n - 1] - d;
    }
    t.at[n - 1] -= d;
  }
  for (let i = n - 2; i >= 0; i--) t.at[i] = Math.max(t.at[i + 1], Math.min(t.at[i], t.at[i + 1] + SPACING));
  // The head's place is now the trail's newest: drop what lies ahead of it.
  while (t.count > 2 && t.s[ix(t, 1)] >= t.at[0]) {
    t.front = ix(t, 1);
    t.count--;
  }
  const j0 = t.front;
  if (t.s[j0] > t.at[0]) {
    // The newest point moves back to the head's place (on its segment to the next).
    const j1 = ix(t, 1);
    const f = (t.s[j0] - t.at[0]) / (t.s[j0] - t.s[j1]);
    t.u[j0] += (t.u[j1] - t.u[j0]) * f;
    t.v[j0] += (t.v[j1] - t.v[j0]) * f;
    t.s[j0] = t.at[0];
  }
  b.u[n - 1] = t.fromU;
  b.v[n - 1] = t.fromV;
  shapeBody(t);
}
