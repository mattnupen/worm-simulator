import type { Vec3 } from '../core/vec';
import { createBody } from '../worm/body';
import { WORM_SEGMENTS, SPACING, type Crawl } from './crawl';

/** The body points for `?at=` (params.ts): straight behind a head at (x, z) facing `heading`. */
export function crawlStart(at: { x: number; z: number; heading: number }): Vec3[] {
  return createBody(WORM_SEGMENTS, SPACING, { x: at.x, y: 0, z: at.z }, at.heading);
}

/** What `?debug=1` puts on window.__wormDebug (e2e tests read the worm through it). */
export function crawlDebug(crawl: Crawl): { head(): { x: number; y: number; z: number; heading: number; tailX: number; tailZ: number } } {
  return {
    head: () => {
      const h = crawl.motion.head;
      const t = crawl.body[crawl.body.length - 1];
      return { x: h.x, y: h.y, z: h.z, heading: crawl.motion.heading, tailX: t.x, tailZ: t.z };
    },
  };
}
