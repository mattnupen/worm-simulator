export interface Vec2 { x: number; y: number }
export interface Vec3 { x: number; y: number; z: number }

export function dist3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
