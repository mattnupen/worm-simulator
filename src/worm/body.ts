import type { Vec3 } from '../core/vec';

export function createBody(count: number, spacing: number, head: Vec3, heading: number): Vec3[] {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  return Array.from({ length: count }, (_, i) => ({
    x: head.x - fx * spacing * i,
    y: head.y,
    z: head.z - fz * spacing * i,
  }));
}

/** Follow-the-leader: each segment is pulled toward the one ahead, never pushed. */
export function followHead(segments: Vec3[], head: Vec3, spacing: number): void {
  segments[0] = { ...head };
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1];
    const cur = segments[i];
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    const dz = cur.z - prev.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > spacing) {
      const k = spacing / d;
      segments[i] = { x: prev.x + dx * k, y: prev.y + dy * k, z: prev.z + dz * k };
    }
  }
}
