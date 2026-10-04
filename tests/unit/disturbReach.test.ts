import { describe, it, expect } from 'vitest';
import { disturbVertex, packedMapSampler, DRAPE_FOOT, type MapSampler } from '../../src/render/leafGlsl';
import {
  createDisturbance, recentre, stamp, stampBody, packDisturbance, DIST_N, DIST_CELL, DIST_REACH, DIST_SPAN,
  type DisturbanceMap,
} from '../../src/surface/disturbance';
import { disturbReach, leafReach, maxLeafRadius } from '../../src/surface/leafScale';
import { SCALE_MODES, SCALE_SPECS } from '../../src/surface/worldScale';
import type { Vec3 } from '../../src/core/vec';

/**
 * Each scale mode stamps the 12 m map only as far as its own leaves need (Step 1b spec 4.3), and
 * Classic must read it exactly as it read Step 1a's 8 m map (reach 1.6, on top 1.4 farther).
 */

const CLASSIC = disturbReach(SCALE_SPECS.classic);
/** Step 1a's map: nearness reached 1.6 m; a body on top counted as 1.4 m farther away. */
const OLD_REACH = 1.6;
const OLD_ON_TOP = 1.4;

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

/**
 * Step 1a's map, on the new grid: the full map stamped with Step 1a's on-top distance, every
 * nearness clamped at Step 1a's reach (an empty cell there read as 1.6 m away), and the trail only
 * where Step 1a stamped. The leaf shader reads distances, so this is exactly what it read then.
 */
function oldMap(b: Vec3[], under: ArrayLike<number>): Map {
  const m = stamped(b, under, DIST_REACH, OLD_ON_TOP);
  const d = m.data;
  for (let k = 0; k < d.length; k += 4) {
    const dist = (1 - d[k + 2]) * DIST_REACH;
    d[k + 3] = dist < OLD_REACH ? d[k + 3] : 0;
    for (const c of [0, 2]) d[k + c] = 1 - Math.min(OLD_REACH, (1 - d[k + c]) * DIST_REACH) / DIST_REACH;
  }
  return packed(m);
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

describe('each scale mode\'s reach on the disturbance map', () => {
  it('reaches past its biggest leaf plus the drape, inside its unfaded window', () => {
    for (const mode of SCALE_MODES) {
      const spec = SCALE_SPECS[mode];
      const r = disturbReach(spec);
      expect(leafReach(spec)).toBeCloseTo(maxLeafRadius(spec) + DRAPE_FOOT, 9);
      // Every lookup a reacting leaf takes (bilinear, at one-cell gradient taps) is stamped, or
      // lies past the map's reach, where even the full map is empty.
      expect(Math.min(DIST_REACH, leafReach(spec) + DIST_CELL * (1 + Math.SQRT2))).toBeLessThanOrEqual(r.stamp + 1e-9);
      expect(r.stamp).toBeLessThanOrEqual(DIST_REACH);
      // The map centres 7 segments (1.54 m) behind the head: a leaf reacting to the head sits inside
      // the unfaded window, and the window inside the map.
      expect(7 * 0.22 + leafReach(spec)).toBeLessThan(r.fadeFrom);
      expect(r.fadeFrom).toBeLessThan(r.fadeTo);
      expect(r.fadeTo).toBeLessThanOrEqual(0.97 * DIST_SPAN / 2 + 1e-9);
    }
    // Classic as in Step 1a: leaves react out to 1.6 m, a body on top counts as 1.4 m farther, and
    // the leaves stop reading the map from 3.4 to 3.88 m from its centre.
    expect(leafReach(SCALE_SPECS.classic)).toBeCloseTo(OLD_REACH, 9);
    expect(CLASSIC.onTop).toBeCloseTo(OLD_ON_TOP, 9);
    expect(CLASSIC.fadeFrom).toBeCloseTo(3.4, 9);
    expect(CLASSIC.fadeTo).toBeCloseTo(3.88, 9);
    expect(disturbReach(SCALE_SPECS.true).fadeTo).toBeCloseTo(0.97 * DIST_SPAN / 2, 9);
  });

  it('a body riding on top reaches only 0.2 m past each mode\'s biggest leaf', () => {
    for (const mode of SCALE_MODES) {
      const spec = SCALE_SPECS[mode];
      const r = disturbReach(spec);
      expect(leafReach(spec) - r.onTop).toBeCloseTo(0.2, 9);
      const m = createDisturbance();
      recentre(m, 0, 0);
      stamp(m, 0.0625, 0.0625, 0, r.stamp, r.onTop);
      for (let i = 0; i < 6; i++) {
        // Cell centres i cells from the stamp: a leaf of the mode reacts within 0.2 m and not past it.
        const k = ((DIST_N / 2) * DIST_N + DIST_N / 2 + i) * 4;
        const read = (1 - m.data[k + 2]) * DIST_REACH;
        if (i * DIST_CELL < 0.2) expect(read).toBeLessThan(leafReach(spec));
        else expect(read).toBeGreaterThan(leafReach(spec));
      }
    }
  });

  it('a Classic body partly under the litter lifts leaves as Step 1a\'s map did', () => {
    const a = [0, 0, 0, 0];
    const b4 = [0, 0, 0, 0];
    /** Whether any of a lookup's five taps read past Step 1a's 1.6 m clamp (its own edge artifact). */
    const clamped = (then: Map, unclamped: Map, x: number, z: number) => {
      const u0 = (x - then.ox) / DIST_SPAN;
      const v0 = (z - then.oz) / DIST_SPAN;
      for (const [du, dv] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        then.sample(u0 + du / DIST_N, v0 + dv / DIST_N, a);
        unclamped.sample(u0 + du / DIST_N, v0 + dv / DIST_N, b4);
        if (Math.abs(a[0] - b4[0]) + Math.abs(a[2] - b4[2]) + Math.abs(a[3] - b4[3]) > 1e-6) return true;
      }
      return false;
    };
    let lifted = 0;
    let compared = 0;
    for (const u of [1, 0.9, 0.75, 0.5]) {
      const under = new Float32Array(16).fill(u);
      const b = body(0.03, 0.05, 0);
      const now = packed(stamped(b, under, CLASSIC.stamp, CLASSIC.onTop));
      const then = oldMap(b, under);
      const unclamped = packed(stamped(b, under, DIST_REACH, OLD_ON_TOP));
      for (const r of [0.3, 0.6, 0.9, 1.2]) {
        for (let d = 0; d <= 1.8; d += 0.01) {
          for (const z of [-1.5, -1.46, -0.3]) {
            // Where Step 1a's lookups reached its clamp, the new map reads true distances instead
            // (smoother: see the sliding test below); everywhere else it must lift the same.
            if (clamped(then, unclamped, 0.03 + d, z)) continue;
            const y0 = lift(then, 0.03 + d, z, r);
            const y1 = lift(now, 0.03 + d, z, r);
            expect(Math.abs(y1 - y0), `u ${u} r ${r} d ${d.toFixed(2)} z ${z}`).toBeLessThan(0.001);
            compared++;
            if (u < 1 && y0 > 0.15) lifted++;
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(4000);
    // A partly buried body does lift leaves (Step 1a lifted them 0.18 to 0.3 m over it).
    expect(lifted).toBeGreaterThan(100);
  }, 120000);

  it('every leaf that can react reads what the full map holds, in each mode', () => {
    for (const mode of ['classic', 'true'] as const) {
      const spec = SCALE_SPECS[mode];
      const r = disturbReach(spec);
      const reach = leafReach(spec);
      const big = maxLeafRadius(spec);
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
            // Only a leaf the full map puts within the mode's reach (path or body) can react.
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
    }
  }, 120000);

  it('the biggest Classic leaf lifts as smoothly as in Step 1a while the worm slides past it', () => {
    const r = 1.243;
    let worstOld = 0;
    let worstNew = 0;
    for (const yaw of [0, 0.3]) {
      let prevOld = NaN;
      let prevNew = NaN;
      // The body slides sideways past a fixed leaf, 2 mm a step.
      for (let off = 0; off <= 0.45; off += 0.002) {
        const b = body(Math.cos(yaw) * off, -Math.sin(yaw) * off, yaw);
        const under = new Float32Array(16).fill(1);
        const ax = -Math.sin(yaw) * 7 * 0.22 + Math.cos(yaw) * 1.95;
        const az = -Math.cos(yaw) * 7 * 0.22 - Math.sin(yaw) * 1.95;
        const y0 = lift(oldMap(b, under), ax, az, r);
        const y1 = lift(packed(stamped(b, under, CLASSIC.stamp, CLASSIC.onTop)), ax, az, r);
        if (prevOld === prevOld) {
          worstOld = Math.max(worstOld, Math.abs(y0 - prevOld));
          worstNew = Math.max(worstNew, Math.abs(y1 - prevNew));
        }
        prevOld = y0;
        prevNew = y1;
      }
    }
    // Step 1a: at most 2.7 mm of lift per 2 mm of sliding.
    expect(worstOld).toBeGreaterThan(0.002);
    expect(worstNew).toBeLessThanOrEqual(worstOld + 0.0002);
  }, 120000);
});
