export interface Vec2 { x: number; y: number }
export interface Vec3 { x: number; y: number; z: number }

export function dist3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** `n` points at the origin. */
export function vec3s(n: number): Vec3[] {
  return Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0 }));
}

/** Copies src into dst. */
export function copy3(dst: Vec3, src: Vec3): void {
  dst.x = src.x;
  dst.y = src.y;
  dst.z = src.z;
}
