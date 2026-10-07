import { describe, it, expect } from 'vitest';
import { disturbVertex, packedMapSampler, DRAPE_FOOT, type MapSampler } from '../../src/render/leafGlsl';
import {
  createDisturbance, recentre, stamp, stampBody, packDisturbance, DIST_N, DIST_CELL, DIST_REACH, DIST_SPAN,
  type DisturbanceMap,
} from '../../src/surface/disturbance';
import { disturbReach, leafReach, maxLeafRadius } from '../../src/surface/leafScale';
import type { Vec3 } from '../../src/core/vec';

/** The 12 m map is stamped only as far as the real-size leaves need (Step 1b spec 4.3). */

/** 16 body points 0.22 apart, head at (x, z), heading `yaw` (0: along +z), bending by `curve`. */
function body(x: number, z: number, yaw: number, curve = 0): Vec3[] {
  const pts: Vec3[] = [];
  let a = yaw;
  let px = x;
  let pz = z;
  for (let i = 0; i < 16; i++) {
    pts.push({ x: px, y: 0, z: pz });
    px -= Math.sin(a) * 0.22;
    pz -= Math.cos(a) * 0.22;
    a += curve * 0.22;
  }
  return pts;
}

interface Map { sample: MapSampler; ox: number; oz: number }

function packed(m: DisturbanceMap): Map {
  const near = new Uint8Array(DIST_N * DIST_N * 4);
  const trail = new Uint8Array(DIST_N * DIST_N * 2);
  packDisturbance(m, near, trail);
  return { sample: packedMapSampler(near, trail), ox: m.ci * DIST_CELL, oz: m.cj * DIST_CELL };
}

function stamped(b: Vec3[], under: ArrayLike<number>, limit = DIST_REACH, onTop?: number): DisturbanceMap {
  const m = createDisturbance();
  recentre(m, b[7].x, b[7].z);
  stampBody(m, b, under, limit, onTop);
  return m;
}

const out = [0, 0, 0];
/** How high a leaf of radius r centred at (ax, az) lifts: the highest of 48 points across it. */
function lift(map: Map, ax: number, az: number, r: number): number {
  let y = 0;
  for (let a = 0; a < 16; a++) {
    const th = (a / 16) * Math.PI * 2;
    for (const f of [0, 0.5, 1]) {
      const p = [ax + Math.cos(th) * r * f, 0, az + Math.sin(th) * r * f];
      disturbVertex(map.sample, map.ox, map.oz, true, p, [ax, az, r, 0.006], 0, out);
      y = Math.max(y, out[1]);
    }
  }
  return y;
}

describe('the reach on the disturbance map', () => {
  it('reaches past the biggest leaf plus the drape, inside the unfaded window', () => {
    const r = disturbReach();
    expect(leafReach()).toBeCloseTo(maxLeafRadius() + DRAPE_FOOT, 9);
    // Every lookup a reacting leaf takes (bilinear, at one-cell gradient taps) is stamped, or
    // lies past the map's reach, where even the full map is empty.
    expect(Math.min(DIST_REACH, leafReach() + DIST_CELL * (1 + Math.SQRT2))).toBeLessThanOrEqual(r.stamp + 1e-9);
    expect(r.stamp).toBeLessThanOrEqual(DIST_REACH);
    // The map centres 7 segments (1.54 m) behind the head: a leaf reacting to the head sits inside
    // the unfaded window, and the window inside the map.
    expect(7 * 0.22 + leafReach()).toBeLessThan(r.fadeFrom);
    expect(r.fadeFrom).toBeLessThan(r.fadeTo);
    expect(r.fadeTo).toBeCloseTo(0.97 * DIST_SPAN / 2, 9);
  });

  it('a body riding on top reaches only 0.2 m past the biggest leaf', () => {
    const r = disturbReach();
    expect(leafReach() - r.onTop).toBeCloseTo(0.2, 9);
    const m = createDisturbance();
    recentre(m, 0, 0);
    stamp(m, 0.0625, 0.0625, 0, r.stamp, r.onTop);
    for (let i = 0; i < 6; i++) {
      // Cell centres i cells from the stamp: a leaf reacts within 0.2 m and not past it.
      const k = ((DIST_N / 2) * DIST_N + DIST_N / 2 + i) * 4;
      const read = (1 - m.data[k + 2]) * DIST_REACH;
      if (i * DIST_CELL < 0.2) expect(read).toBeLessThan(leafReach());
      else expect(read).toBeGreaterThan(leafReach());
    }
  });

  it('every leaf that can react reads what the full map holds', () => {
    const r = disturbReach();
    const reach = leafReach();
    const big = maxLeafRadius();
    let checked = 0;
    for (const [bx, yaw, curve, u] of [[0, 0, 0, 1], [0.07, 0.3, 0, 1], [0.04, 2.1, 0.6, 1], [0.09, -0.8, -0.4, 0.75], [0.02, 1.1, 0.2, 0]]) {
      const under = Float32Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? u : 1));
      const b = body(bx, 0.05, yaw, curve);
      const full = packed(stamped(b, under, DIST_REACH, r.onTop));
      const part = packed(stamped(b, under, r.stamp, r.onTop));
      const s0 = [0, 0, 0, 0];
      const s1 = [0, 0, 0, 0];
      for (let x = -5; x <= 5; x += 0.037) {
        for (let z = -6; z <= 4; z += 0.041) {
          const u0 = (x - full.ox) / DIST_SPAN;
          const v0 = (z - full.oz) / DIST_SPAN;
          // Only a leaf the full map puts within the reach (path or body) can react.
          full.sample(u0, v0, s0);
          if (Math.min(1 - s0[0], 1 - s0[2]) * DIST_REACH >= reach) continue;
          for (const [du, dv] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
            full.sample(u0 + du / DIST_N, v0 + dv / DIST_N, s0);
            part.sample(u0 + du / DIST_N, v0 + dv / DIST_N, s1);
            // Path and body, as distances: within a mm.
            expect(Math.abs(s1[0] - s0[0]) * DIST_REACH).toBeLessThan(0.001);
            expect(Math.abs(s1[2] - s0[2]) * DIST_REACH).toBeLessThan(0.001);
            expect(Math.abs(s1[3] - s0[3])).toBeLessThan(0.004);
          }
          if (checked++ % 7 === 0) {
            expect(Math.abs(lift(part, x, z, big) - lift(full, x, z, big))).toBeLessThan(0.001);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(2000);
  }, 120000);
});
