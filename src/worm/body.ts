import { copy3, hypot3, type Vec3 } from '../core/vec';

export function createBody(count: number, spacing: number, head: Vec3, heading: number): Vec3[] {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  return Array.from({ length: count }, (_, i) => ({
    x: head.x - fx * spacing * i,
    y: head.y,
    z: head.z - fz * spacing * i,
  }));
}

/** Follow-the-leader: each segment is pulled toward the one ahead, never pushed. In place: allocates nothing. */
export function followHead(segments: Vec3[], head: Vec3, spacing: number): void {
  copy3(segments[0], head);
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1];
    const cur = segments[i];
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    const dz = cur.z - prev.z;
    const d = hypot3(dx, dy, dz);
    if (d > spacing) {
      const k = spacing / d;
      cur.x = prev.x + dx * k;
      cur.y = prev.y + dy * k;
      cur.z = prev.z + dz * k;
    }
  }
}

/**
 * followHead the other way round, for backing up tail first: the last segment goes to `tail` and
 * each one ahead of it is pulled toward the one behind, never pushed. In place: allocates nothing.
 */
export function followTail(segments: Vec3[], tail: Vec3, spacing: number): void {
  const n = segments.length;
  copy3(segments[n - 1], tail);
  for (let i = n - 2; i >= 0; i--) {
    const next = segments[i + 1];
    const cur = segments[i];
    const dx = cur.x - next.x;
    const dy = cur.y - next.y;
    const dz = cur.z - next.z;
    const d = hypot3(dx, dy, dz);
    if (d > spacing) {
      const k = spacing / d;
      cur.x = next.x + dx * k;
      cur.y = next.y + dy * k;
      cur.z = next.z + dz * k;
    }
  }
}
