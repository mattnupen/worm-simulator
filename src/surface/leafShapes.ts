import type { LeafKind } from './leafLitter';

/**
 * Flat leaf silhouettes for the litter, one per species, as tiny triangulated polygons in
 * leaf-local coordinates: +y runs from the petiole base to the tip, +x to the leaf's right.
 * Each shape is normalised so its longer bounding-box side is exactly 1, centred along y;
 * the midrib stays on x = 0. Pure and deterministic.
 */
export interface LeafShape {
  /** x,y pairs: the closed outline first (counter-clockwise, not repeated), then interior points. */
  points: Float32Array;
  /** Number of outline points (interior points follow them). */
  outline: number;
  /** Triangles, counter-clockwise seen from +z. None crosses the midrib (x = 0). */
  indices: Uint16Array;
  /** Per point: 1 on the main veins (midrib, palmate rays), less on minor ones, 0 elsewhere. */
  vein: Float32Array;
  /** Outline index of the petiole joint (on the midrib, x = 0). */
  base: number;
  /** Outline index of the apex (on the midrib, x = 0). */
  tip: number;
}

/** [angle in degrees from +x, radius, vein weight]. */
type Polar = readonly [number, number, number?];
type Pt = [number, number, number];

/** Polar keypoints (angles strictly increasing from -90 at the base to 270) to x,y,vein. */
function fromPolar(list: readonly Polar[]): Pt[] {
  return list.map(([deg, r, vein = 0]) => {
    const a = (deg * Math.PI) / 180;
    // The base and tip sit exactly on the midrib.
    const onMidrib = deg === 90 || deg === -90 || deg === 270;
    return [onMidrib ? 0 : r * Math.cos(a), r * Math.sin(a), vein];
  });
}

/** A symmetric outline from its right half (base at -90 .. tip at 90, both included). */
function mirrored(right: readonly Polar[], leftScale: (deg: number) => number = () => 1): Polar[] {
  const inner = right.slice(1, -1);
  const left = inner.map(([d, r, v]) => [180 - d, r * leftScale(d), v] as Polar).reverse();
  return [...right, ...left];
}

/** Fan triangulation from an interior centre: valid for any outline star-shaped about it. */
function fanShape(outline: Pt[], cx: number, cy: number): LeafShape {
  const n = outline.length;
  const pts = [...outline, [cx, cy, 1] as Pt];
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(n, i, (i + 1) % n);
  return finish(pts, n, idx);
}

/**
 * Midrib-strip triangulation for pinnately lobed leaves whose sides run base -> tip with
 * rising y: each side is zipped to a midrib polyline, so deep sinuses stay valid.
 * `right` and `left` exclude the base (0,0) and tip (0,1); `midrib` lists interior midrib y values.
 */
function stripShape(right: Pt[], left: Pt[], midrib: number[]): LeafShape {
  const base: Pt = [0, 0, 1];
  const tip: Pt = [0, 1, 1];
  // Outline: base, right side up, tip, left side down.
  const outline = [base, ...right, tip, ...[...left].reverse()];
  const n = outline.length;
  const tipIdx = right.length + 1;
  const pts = [...outline, ...midrib.map((y) => [0, y, 1] as Pt)];
  const mid = [0, ...midrib.map((_, k) => n + k), tipIdx];
  const rightIdx = [0, ...right.map((_, k) => 1 + k), tipIdx];
  const leftIdx = [0, ...left.map((_, k) => n - 1 - k), tipIdx];
  const idx: number[] = [];
  const y = (i: number) => pts[i][1];
  const zip = (side: number[], flip: boolean) => {
    let i = 0;
    let j = 0;
    const tri = (a: number, b: number, c: number) => {
      if (a === b || b === c || a === c) return;
      if (flip) idx.push(a, c, b);
      else idx.push(a, b, c);
    };
    while (i < mid.length - 1 || j < side.length - 1) {
      const advanceMid = j === side.length - 1 || (i < mid.length - 1 && y(mid[i + 1]) <= y(side[j + 1]));
      if (advanceMid) {
        tri(mid[i], side[j], mid[i + 1]);
        i++;
      } else {
        tri(mid[i], side[j], side[j + 1]);
        j++;
      }
    }
  };
  zip(rightIdx, false);
  zip(leftIdx, true);
  return finish(pts, n, idx, 0, tipIdx);
}

/** Centres the bounding box on the origin and scales its longer side to 1. */
function finish(pts: Pt[], outline: number, idx: number[], base = 0, tipIn = -1): LeafShape {
  let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  for (let i = 0; i < outline; i++) {
    x0 = Math.min(x0, pts[i][0]); x1 = Math.max(x1, pts[i][0]);
    y0 = Math.min(y0, pts[i][1]); y1 = Math.max(y1, pts[i][1]);
  }
  const s = 1 / Math.max(x1 - x0, y1 - y0);
  const oy = (y0 + y1) / 2;
  const points = new Float32Array(pts.length * 2);
  const vein = new Float32Array(pts.length);
  let tip = tipIn;
  pts.forEach(([x, y, v], i) => {
    // The midrib stays on x = 0 (uneven leaves are only nearly centred across).
    points[i * 2] = x * s;
    points[i * 2 + 1] = (y - oy) * s;
    vein[i] = v;
    if (tipIn < 0 && i < outline && x === 0 && (tip < 0 || y > pts[tip][1])) tip = i;
  });
  return { points, outline, indices: new Uint16Array(idx), vein, base, tip };
}

// ---- Species --------------------------------------------------------------------------

/** Sugar maple: 5 pointed lobes radiating from the petiole, U-shaped sinuses, a few big teeth. */
function maple(): LeafShape {
  const right: Polar[] = [
    [-90, 0.13, 1], [-68, 0.27], [-42, 0.4],
    [-17, 0.57, 1], // basal lobe
    [-1, 0.43], [11, 0.58, 0.5], [16, 0.54],
    [34, 0.86, 1], // lateral lobe
    [43, 0.64], [48, 0.69, 0.5], [57, 0.46], [64, 0.47], [71, 0.73, 0.5], [76, 0.69],
    [90, 1, 1], // terminal lobe
  ];
  return fanShape(fromPolar(mirrored(right)), 0, 0);
}

/** Bur / white oak: rounded, forward-pointing lobes, three down each side, deep sinuses. */
function oak(): LeafShape {
  const right: Pt[] = [
    [0.1, 0.11, 0], [0.15, 0.17, 0], [0.13, 0.22, 0], [0.06, 0.25, 0],
    [0.2, 0.3, 0], [0.25, 0.37, 0], [0.21, 0.42, 0], [0.07, 0.45, 0],
    [0.25, 0.52, 0], [0.3, 0.6, 0], [0.26, 0.66, 0], [0.1, 0.7, 0],
    [0.13, 0.81, 0], [0.08, 0.93, 0],
  ];
  // Slightly uneven sides, like a real leaf.
  const left: Pt[] = right.map(([x, y], k) => [-x * (k % 4 === 1 ? 0.95 : 1.02), Math.min(0.95, y + 0.012), 0]);
  return stripShape(right, left, [0.256, 0.456, 0.706]);
}

/** Quaking aspen: nearly round, with a short abrupt point. */
function aspen(): LeafShape {
  const right: Polar[] = [
    [-90, 0.46, 1], [-64, 0.52], [-36, 0.55], [-8, 0.57], [18, 0.57], [42, 0.56], [62, 0.56],
    [78, 0.6], [90, 0.74, 1],
  ];
  return fanShape(fromPolar(mirrored(right)), 0, 0);
}

/** Linear interpolation of a polar profile (angles ascending) at `deg`. */
function profile(keys: readonly Polar[], deg: number): number {
  for (let k = 1; k < keys.length; k++) {
    if (deg <= keys[k][0]) {
      const [d0, r0] = keys[k - 1];
      const [d1, r1] = keys[k];
      return r0 + ((r1 - r0) * (deg - d0)) / (d1 - d0);
    }
  }
  return keys[keys.length - 1][1];
}

/** American basswood: heart-shaped, an uneven (oblique) base, serrate, drawn-out tip. */
function basswood(): LeafShape {
  const heart: Polar[] = [
    [-90, 0.2], [-72, 0.34], [-50, 0.5], [-28, 0.6], [-5, 0.66], [18, 0.7], [38, 0.72],
    [56, 0.76], [70, 0.82], [81, 0.88], [90, 1],
  ];
  // Serrate: forward-leaning teeth (each tooth a little further round than its notch).
  const right: Polar[] = [[-90, 0.1, 1]];
  const steps = 12;
  for (let k = 0; k < steps; k++) {
    const d = -78 + (k * 160) / (steps - 1);
    const tooth = k % 2 === 1;
    right.push([d, profile(heart, d) * (tooth ? 1.06 : 0.95), tooth ? 0.4 : 0]);
  }
  right.push([90, 1.04, 1]);
  // Oblique base: the left basal lobe hangs lower and wider than the right.
  return fanShape(fromPolar(mirrored(right, (d) => (d < -20 ? 1.22 : 1))), 0, 0);
}

/** White ash: one narrow, lanceolate leaflet with a slightly uneven base. */
function ash(): LeafShape {
  const right: Pt[] = [
    [0.06, 0.05, 0], [0.12, 0.15, 0], [0.16, 0.3, 0], [0.165, 0.45, 0], [0.15, 0.6, 0],
    [0.11, 0.74, 0], [0.06, 0.87, 0],
  ];
  const left: Pt[] = right.map(([x, y]) => [-x * 0.95, Math.min(0.92, y + (y < 0.4 ? 0.035 : 0.01)), 0]);
  const outline: Pt[] = [[0, 0, 1], ...right, [0, 1, 1], ...[...left].reverse()];
  return fanShape(outline, 0, 0.42);
}

const BUILDERS: Record<LeafKind, () => LeafShape> = { maple, oak, aspen, basswood, ash };
const cache = new Map<LeafKind, LeafShape>();

/** The (cached, shared) silhouette for a species. Treat it as read-only. */
export function leafShape(kind: LeafKind): LeafShape {
  let s = cache.get(kind);
  if (!s) {
    s = BUILDERS[kind]();
    cache.set(kind, s);
  }
  return s;
}
