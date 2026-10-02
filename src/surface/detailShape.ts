import { leafShape, type LeafShape } from './leafShapes';
import { LEAF_KINDS, type LeafKind } from './leafLitter';

/** The inner ring sits this far out from the fan centre toward every other outline point. */
const RING = 0.55;

/**
 * A leaf silhouette with more vertices for the close-up detail layer, so curl and cup bend
 * smoothly. Fan-triangulated shapes (all but oak) gain an inner ring through every other
 * outline point, about doubling the triangles; oak's midrib strips already have interior
 * points and are returned as they are. Same outline, base and tip indices. Pure.
 */
function ringed(s: LeafShape): LeafShape {
  const n = s.outline;
  const centre = n; // fanShape puts the centre right after the outline.
  const m = Math.ceil(n / 2);
  const cx = s.points[centre * 2];
  const cy = s.points[centre * 2 + 1];
  const points = new Float32Array((n + 1 + m) * 2);
  const vein = new Float32Array(n + 1 + m);
  points.set(s.points.subarray(0, (n + 1) * 2));
  vein.set(s.vein.subarray(0, n + 1));
  for (let j = 0; j < m; j++) {
    const o = (2 * j) % n;
    points[(n + 1 + j) * 2] = cx + (s.points[o * 2] - cx) * RING;
    points[(n + 1 + j) * 2 + 1] = cy + (s.points[o * 2 + 1] - cy) * RING;
    // Halfway along a main vein ray it is still a vein.
    vein[n + 1 + j] = (s.vein[o] + s.vein[centre]) / 2;
  }
  const idx: number[] = [];
  const ring = (j: number) => n + 1 + (j % m);
  for (let j = 0; j < m; j++) {
    const a = 2 * j;
    const rj = ring(j);
    const rn = ring(j + 1);
    idx.push(centre, rj, rn);
    if (a + 2 <= n) {
      idx.push(rj, a % n, (a + 1) % n, rj, (a + 1) % n, rn, rn, (a + 1) % n, (a + 2) % n);
    } else {
      // Odd outline: the last run has one edge, back to outline point 0 (ring 0's spoke).
      idx.push(rj, a % n, (a + 1) % n, rj, (a + 1) % n, rn);
    }
  }
  return { points, outline: n, indices: new Uint16Array(idx), vein, base: s.base, tip: s.tip };
}

const cache = new Map<LeafKind, LeafShape>();

/** The (cached, shared) detail silhouette for a species. Treat it as read-only. */
export function detailShape(kind: LeafKind): LeafShape {
  let s = cache.get(kind);
  if (!s) {
    const base = leafShape(kind);
    s = kind === 'oak' ? base : ringed(base);
    cache.set(kind, s);
  }
  return s;
}

/** Every species, for tests and the hero leaf mesh. */
export const DETAIL_KINDS: readonly LeafKind[] = LEAF_KINDS;
