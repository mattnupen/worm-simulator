import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Crawl, WORM_SEGMENTS } from '../../src/game/crawl';
import { HeroWorm, type WormPose } from '../../src/worm/wormMesh';
import { HeroLeafMesh, heroLeafMatrix } from '../../src/surface/heroLeafMesh';
import { HERO_MAX } from '../../src/surface/heroLeaves';
import { mulberry32 } from '../../src/core/random';

const DT = 1 / 60;
/** Vertices per worm ring (RADIAL 14, plus the seam). */
const RING_VERTS = 15;
/** A leaf over the worm clears every body vertex under it by this. */
const CLEAR = 0.003;

interface Stats {
  frames: number;
  /** Per held leaf and frame: the least height of the leaf above a worm vertex it covers. */
  gaps: number[];
  /**
   * Worm vertices found under a leaf whose surface there is above the body's underside (the
   * lowest point of that ring): a leaf lower than that lies under the worm, which crawls over it.
   */
  covered: number;
  violations: number;
  worst: number;
  worstAt: string;
}

/** Leaf-local triangles of every species, from the mesh's own geometry. */
function speciesTriangles(hero: HeroLeafMesh): Float32Array[] {
  const g = hero.mesh.geometry;
  const pos = g.getAttribute('position');
  const kind = g.getAttribute('aKind');
  const index = g.index!;
  const out: number[][] = [[], [], [], [], []];
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t);
    const k = kind.getX(a);
    for (let c = 0; c < 3; c++) {
      const v = index.getX(t + c);
      out[k].push(pos.getX(v), pos.getY(v), pos.getZ(v));
    }
  }
  return out.map((a) => new Float32Array(a));
}

/**
 * Replays the game's wiring (the real Crawl, its pushers and hero physics; the real HeroWorm
 * mesh; the leaves placed by the very instance-matrix code the renderer uses) and measures how
 * far any worm vertex rises into a hero leaf above it.
 */
function replay(seed: number, steps: number, alphas: readonly number[], stats: Stats, coil: number): void {
  const rng = mulberry32(seed);
  const crawl = new Crawl();
  crawl.setHeroCount(HERO_MAX);
  const worm = new HeroWorm(WORM_SEGMENTS);
  const wormMesh = worm.group.getObjectByName('worm') as THREE.Mesh;
  const wp = wormMesh.geometry.getAttribute('position').array as Float32Array;
  const nVerts = wp.length / 3;
  const rings = nVerts / RING_VERTS;
  const bottom = new Float32Array(rings);
  const hero = new HeroLeafMesh(crawl.hero);
  const tris = speciesTriangles(hero);
  const world = new Float32Array(3 * 4000);
  const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
  const camera = new THREE.PerspectiveCamera();
  const m = new THREE.Matrix4();
  const e = m.elements;
  const move = { x: 0, y: 1 };
  let t = 0;
  for (let s = 0; s < steps; s++) {
    if (s % 90 === 0) {
      // A random walk: mostly gentle turns, some hard ones, some rests (the head probes most
      // then); or, with `coil`, turning hard one way the whole time.
      const r = rng();
      move.x = coil || (rng() * 2 - 1) * (r < 0.2 ? 1 : 0.5);
      move.y = r < 0.1 ? 0 : 1;
    }
    crawl.step(DT, move);
    t += DT;
    for (const alpha of alphas) {
      crawl.interpolate(alpha, t, pose, camera);
      worm.update(pose);
      stats.frames++;
      let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
      for (let r = 0; r < rings; r++) {
        let b = Infinity;
        for (let j = 0; j < RING_VERTS; j++) b = Math.min(b, wp[(r * RING_VERTS + j) * 3 + 1]);
        bottom[r] = b;
      }
      for (let v = 0; v < nVerts; v++) {
        minX = Math.min(minX, wp[v * 3]); maxX = Math.max(maxX, wp[v * 3]);
        minZ = Math.min(minZ, wp[v * 3 + 2]); maxZ = Math.max(maxZ, wp[v * 3 + 2]);
      }
      const p = crawl.hero;
      for (let i = 0; i < p.count; i++) {
        let gap = Infinity;
        heroLeafMatrix(p, i, alpha, m);
        const reach = p.size[i] * 0.8;
        const cx = e[12];
        const cz = e[14];
        if (cx + reach < minX || cx - reach > maxX || cz + reach < minZ || cz - reach > maxZ) continue;
        const tri = tris[p.kind[i]];
        const n = tri.length / 3;
        for (let k = 0; k < n; k++) {
          const x = tri[k * 3]; const y = tri[k * 3 + 1]; const z = tri[k * 3 + 2];
          world[k * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
          world[k * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
          world[k * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        }
        for (let v = 0; v < nVerts; v++) {
          const vx = wp[v * 3]; const vy = wp[v * 3 + 1]; const vz = wp[v * 3 + 2];
          const dx = vx - cx; const dz = vz - cz;
          if (dx * dx + dz * dz > reach * reach) continue;
          for (let k = 0; k < n; k += 3) {
            const ax = world[k * 3]; const az = world[k * 3 + 2];
            const bx = world[k * 3 + 3]; const bz = world[k * 3 + 5];
            const qx = world[k * 3 + 6]; const qz = world[k * 3 + 8];
            const det = (bz - qz) * (ax - qx) + (qx - bx) * (az - qz);
            if (Math.abs(det) < 1e-12) continue;
            const l1 = ((bz - qz) * (vx - qx) + (qx - bx) * (vz - qz)) / det;
            const l2 = ((qz - az) * (vx - qx) + (ax - qx) * (vz - qz)) / det;
            const l3 = 1 - l1 - l2;
            if (l1 < 0 || l2 < 0 || l3 < 0) continue;
            const h = l1 * world[k * 3 + 1] + l2 * world[k * 3 + 4] + l3 * world[k * 3 + 7];
            const ring = Math.floor(v / RING_VERTS);
            // A leaf beneath the whole body there (the worm crawling over it) is not over it.
            if (h <= bottom[ring]) continue;
            stats.covered++;
            if (h - vy < gap) gap = h - vy;
            const into = vy + CLEAR - h;
            if (into > 0) {
              stats.violations++;
              if (into > stats.worst) {
                stats.worst = into;
                stats.worstAt = `seed ${seed} step ${s} alpha ${alpha} leaf ${i} ring ${ring}`;
              }
            }
          }
        }
        if (gap < Infinity && p.lift[i] > 0.02) stats.gaps.push(gap);
      }
    }
  }
}

describe('hero leaves never clip the worm', () => {
  it('over many seeded crawls, every worm vertex under a hero leaf is at least 3 mm below it', () => {
    const stats: Stats = { gaps: [], frames: 0, covered: 0, violations: 0, worst: 0, worstAt: '' };
    for (let seed = 1; seed <= 6; seed++) replay(seed, 1500, [0, 0.5, 1], stats, 0);
    expect(stats.covered).toBeGreaterThan(100000);
    expect(stats.violations, JSON.stringify({ ...stats, gaps: undefined })).toBe(0);
    // ...and a leaf held over the worm rests near it rather than floating high above: the bounds
    // are conservative, so the typical least gap is several cm (measured 0.10 m median).
    const g = stats.gaps.sort((a, b) => a - b);
    expect(g.length).toBeGreaterThan(10000);
    expect(g[g.length >> 1]).toBeLessThan(0.12);
  }, 120_000);

  it('in tight coils, and crawling along the world\'s edge (leaves recycled next to the body)', () => {
    const stats: Stats = { gaps: [], frames: 0, covered: 0, violations: 0, worst: 0, worstAt: '' };
    replay(7, 1200, [0, 0.5, 1], stats, 1);
    replay(8, 1200, [0, 0.5, 1], stats, -1);
    // Seeds 21 and 26 reach the edge of the playable world (z = 19).
    replay(21, 1400, [0, 0.5], stats, 0);
    replay(26, 900, [0, 0.5], stats, 0);
    expect(stats.covered).toBeGreaterThan(1000);
    expect(stats.violations, JSON.stringify({ ...stats, gaps: undefined })).toBe(0);
  }, 120_000);
});
