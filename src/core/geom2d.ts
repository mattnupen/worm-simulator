/** Plain 2D distances (no allocation). */

/** Distance from the point (x, y) to the box [x0, x1] x [y0, y1]. */
export function pointToBox(x: number, y: number, x0: number, x1: number, y0: number, y1: number): number {
  const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
  const dy = y < y0 ? y0 - y : y > y1 ? y - y1 : 0;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Distance from the point (x, y) to the segment (ax, ay)-(bx, by). */
export function pointToSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const sx = bx - ax;
  const sy = by - ay;
  const l2 = sx * sx + sy * sy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * sx + (y - ay) * sy) / l2)) : 0;
  const dx = ax + sx * t - x;
  const dy = ay + sy * t - y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Distance from the segment (ax, ay)-(bx, by) to the box [x0, x1] x [y0, y1]: 0 if they meet
 * (the segment clipped to the box is not empty), else the least of its ends to the box and the
 * box's corners to it (two disjoint convex shapes are closest at a corner of one of them).
 */
export function segmentToBox(
  ax: number, ay: number, bx: number, by: number, x0: number, x1: number, y0: number, y1: number,
): number {
  // Liang-Barsky: clip the segment to the box's four sides (p t <= q on each).
  const sx = bx - ax;
  const sy = by - ay;
  let t0 = 0;
  let t1 = 1;
  for (let side = 0; side < 4 && t0 <= t1; side++) {
    const p = side === 0 ? -sx : side === 1 ? sx : side === 2 ? -sy : sy;
    const q = side === 0 ? ax - x0 : side === 1 ? x1 - ax : side === 2 ? ay - y0 : y1 - ay;
    if (p === 0) {
      if (q < 0) t0 = 2;
    } else if (p < 0) {
      t0 = Math.max(t0, q / p);
    } else {
      t1 = Math.min(t1, q / p);
    }
  }
  if (t0 <= t1) return 0;
  return Math.min(
    pointToBox(ax, ay, x0, x1, y0, y1), pointToBox(bx, by, x0, x1, y0, y1),
    pointToSegment(x0, y0, ax, ay, bx, by), pointToSegment(x1, y0, ax, ay, bx, by),
    pointToSegment(x0, y1, ax, ay, bx, by), pointToSegment(x1, y1, ax, ay, bx, by),
  );
}
