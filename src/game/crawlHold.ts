import { copy3, type Vec3 } from '../core/vec';

/**
 * The robin lets go (V4, crawl.ts release): the part of the body that hung from its bill lies down
 * again. Each point goes back out to `gap` from the one ahead, the way it already lay (the crawl's
 * follow-the-leader only ever pulls, so a body bunched up under the bill would stay bunched), and
 * `restAt` puts it on the floor. Head first; `heading` breaks ties where two points coincide.
 * Allocates nothing.
 */
export function layDown(body: Vec3[], head: Vec3, heading: number, gap: number, restAt: (p: Vec3) => void): void {
  copy3(body[0], head);
  for (let i = 1; i < body.length; i++) {
    const p = body[i];
    const q = body[i - 1];
    let dx = p.x - q.x;
    let dz = p.z - q.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1e-4) {
      dx = -Math.sin(heading);
      dz = -Math.cos(heading);
    } else {
      dx /= d;
      dz /= d;
    }
    if (d < gap) {
      p.x = q.x + dx * gap;
      p.z = q.z + dz * gap;
    }
    restAt(p);
  }
}
