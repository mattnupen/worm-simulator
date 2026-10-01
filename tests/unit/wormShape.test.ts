import { describe, it, expect } from 'vitest';
import {
  radiusProfile, verticalScale, lateralScale, ringParams, peristalsis, probeHead,
} from '../../src/worm/wormShape';
import { createSpine, fitSpine, sampleSpine, catmullRom, transportFrames } from '../../src/worm/spine';
import { ringTrig, writeTube, tubeVertexCount, tubeIndices } from '../../src/worm/tube';

const dot = (a: Float32Array, i: number, b: Float32Array, j: number) =>
  a[i] * b[j] + a[i + 1] * b[j + 1] + a[i + 2] * b[j + 2];
const len = (a: Float32Array, i: number) => Math.sqrt(dot(a, i, a, i));
const allFinite = (a: Float32Array) => a.every((v) => Number.isFinite(v));

describe('radiusProfile', () => {
  const samples = Array.from({ length: 1001 }, (_, i) => i / 1000);
  const r = samples.map(radiusProfile);
  const max = Math.max(...r);
  const tMax = samples[r.indexOf(max)];

  it('closes to a point at both tips', () => {
    expect(radiusProfile(0)).toBe(0);
    expect(radiusProfile(1)).toBe(0);
  });
  it('is thickest in the anterior third, peaking at 1', () => {
    expect(max).toBeCloseTo(1, 2);
    expect(tMax).toBeGreaterThan(0.15);
    expect(tMax).toBeLessThan(1 / 3);
  });
  it('has a narrower head than the body', () => {
    expect(radiusProfile(0.06)).toBeLessThan(0.8 * max);
  });
  it('tapers gently toward the tail', () => {
    expect(radiusProfile(0.6)).toBeLessThan(max);
    expect(radiusProfile(0.9)).toBeLessThan(radiusProfile(0.6));
    expect(radiusProfile(0.9)).toBeGreaterThan(0.45);
  });
  it('rises steeply out of each tip (rounded caps) and stays in [0, 1]', () => {
    expect(radiusProfile(0.01)).toBeGreaterThan(0.25);
    expect(radiusProfile(0.995)).toBeGreaterThan(0.2);
    for (const v of r) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1.0001);
    }
  });
  it('clamps outside [0, 1]', () => {
    expect(radiusProfile(-1)).toBe(0);
    expect(radiusProfile(2)).toBe(0);
  });
});

describe('cross-section', () => {
  it('flattens the tail dorsoventrally into a paddle', () => {
    expect(verticalScale(0.97)).toBeLessThan(verticalScale(0.4));
    expect(lateralScale(0.97)).toBeGreaterThan(lateralScale(0.4));
    expect(verticalScale(0.97) / lateralScale(0.97)).toBeLessThan(0.65);
  });
  it('is close to round along the body', () => {
    expect(verticalScale(0.3)).toBeGreaterThan(0.85);
    expect(lateralScale(0.3)).toBeCloseTo(1, 5);
  });
});

describe('ringParams', () => {
  it('runs 0..1, strictly increasing, denser at the tips', () => {
    const m = new Float32Array(50);
    ringParams(m);
    expect(m[0]).toBe(0);
    expect(m[49]).toBeCloseTo(1, 6);
    for (let i = 1; i < 50; i++) expect(m[i]).toBeGreaterThan(m[i - 1]);
    expect(m[1] - m[0]).toBeLessThan((m[25] - m[24]) * 0.5);
  });
});

describe('peristalsis', () => {
  const n = 50;
  const m = new Float32Array(n);
  ringParams(m);
  const s = new Float32Array(n);
  const k = new Float32Array(n);

  it('is the identity with zero amplitude', () => {
    peristalsis(m, 0.3, 0, 2.5, s, k);
    for (let i = 0; i < n; i++) {
      expect(s[i]).toBeCloseTo(m[i], 6);
      expect(k[i]).toBeCloseTo(1, 6);
    }
  });
  it('keeps the tips fixed and the order monotonic', () => {
    for (const phase of [0, 0.25, 0.6, 3.9]) {
      peristalsis(m, phase, 0.4, 2.5, s, k);
      expect(s[0]).toBeCloseTo(0, 6);
      expect(s[n - 1]).toBeCloseTo(1, 6);
      for (let i = 1; i < n; i++) expect(s[i]).toBeGreaterThan(s[i - 1]);
      expect(allFinite(s) && allFinite(k)).toBe(true);
    }
  });
  it('thickens where the body shortens (squash) and thins where it stretches', () => {
    peristalsis(m, 0.1, 0.4, 2.5, s, k);
    let thick = 0;
    let thin = 0;
    for (let i = 1; i < n - 1; i++) {
      const stretch = (s[i + 1] - s[i - 1]) / (m[i + 1] - m[i - 1]);
      if (stretch < 0.9) { expect(k[i]).toBeGreaterThan(1); thick++; }
      if (stretch > 1.1) { expect(k[i]).toBeLessThan(1); thin++; }
    }
    expect(thick).toBeGreaterThan(3);
    expect(thin).toBeGreaterThan(3);
  });
  it('travels head to tail as the phase advances', () => {
    const fattest = (phase: number) => {
      peristalsis(m, phase, 0.4, 2.5, s, k);
      let best = 0;
      for (let i = 0; i < n; i++) if (m[i] > 0.4 && m[i] < 0.8 && k[i] > k[best]) best = i;
      return m[best];
    };
    const a = fattest(0.0);
    const b = fattest(0.15);
    expect(b).toBeGreaterThan(a);
  });
});

describe('probeHead', () => {
  it('is smooth, small, and larger when idle', () => {
    const out = { lift: 0, sway: 0 };
    let maxIdle = 0;
    let maxCrawl = 0;
    let prevLift = 0;
    let prevSway = 0;
    for (let i = 0; i < 2000; i++) {
      const t = i / 60;
      probeHead(t, 1, out);
      expect(out.lift).toBeGreaterThanOrEqual(0);
      if (i > 0) {
        expect(Math.abs(out.lift - prevLift)).toBeLessThan(0.01);
        expect(Math.abs(out.sway - prevSway)).toBeLessThan(0.01);
      }
      prevLift = out.lift;
      prevSway = out.sway;
      maxIdle = Math.max(maxIdle, Math.abs(out.sway), out.lift);
      probeHead(t, 0, out);
      maxCrawl = Math.max(maxCrawl, Math.abs(out.sway), out.lift);
    }
    expect(maxIdle).toBeLessThan(0.15);
    expect(maxIdle).toBeGreaterThan(maxCrawl * 1.5);
  });
});

describe('catmullRom', () => {
  it('passes through its inner control points', () => {
    expect(catmullRom(0, 1, 2, 3, 0)).toBe(1);
    expect(catmullRom(0, 1, 2, 3, 1)).toBe(2);
    expect(catmullRom(0, 1, 2, 3, 0.5)).toBeCloseTo(1.5);
  });
});

describe('spine', () => {
  const straight = (n: number, spacing: number) => {
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c[i * 3 + 2] = -i * spacing;
    return c;
  };

  it('measures arc length through the control points', () => {
    const sp = createSpine(16, 4);
    fitSpine(sp, straight(16, 0.22));
    expect(sp.length).toBeCloseTo(15 * 0.22, 4);
    const out = new Float32Array(3);
    sampleSpine(sp, 1.1, out, 0);
    expect(out[2]).toBeCloseTo(-1.1, 4);
  });
  it('extrapolates past both ends along the end tangents', () => {
    const sp = createSpine(16, 4);
    fitSpine(sp, straight(16, 0.22));
    const out = new Float32Array(3);
    sampleSpine(sp, -0.1, out, 0);
    expect(out[2]).toBeCloseTo(0.1, 4);
    sampleSpine(sp, sp.length + 0.2, out, 0);
    expect(out[2]).toBeCloseTo(-15 * 0.22 - 0.2, 4);
  });
  it('survives fully coincident control points', () => {
    const sp = createSpine(16, 4);
    fitSpine(sp, new Float32Array(48).fill(2));
    expect(sp.length).toBe(0);
    const out = new Float32Array(3);
    sampleSpine(sp, 0.5, out, 0);
    expect(allFinite(out)).toBe(true);
  });
});

describe('transportFrames', () => {
  const n = 40;
  const frames = (pos: Float32Array) => {
    const T = new Float32Array(n * 3);
    const N = new Float32Array(n * 3);
    const B = new Float32Array(n * 3);
    transportFrames(pos, n, T, N, B);
    return { T, N, B };
  };
  const checkOrthonormal = ({ T, N, B }: { T: Float32Array; N: Float32Array; B: Float32Array }) => {
    for (let i = 0; i < n * 3; i += 3) {
      expect(len(T, i)).toBeCloseTo(1, 5);
      expect(len(N, i)).toBeCloseTo(1, 5);
      expect(len(B, i)).toBeCloseTo(1, 5);
      expect(dot(T, i, N, i)).toBeCloseTo(0, 5);
      expect(dot(T, i, B, i)).toBeCloseTo(0, 5);
      expect(dot(N, i, B, i)).toBeCloseTo(0, 5);
    }
  };

  it('is orthonormal and continuous along a 3D S-curve over a slope', () => {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      pos[i * 3] = 0.6 * Math.sin(t * Math.PI * 2);
      pos[i * 3 + 1] = 0.4 * t + 0.1 * Math.sin(t * 7);
      pos[i * 3 + 2] = -3 * t;
    }
    const f = frames(pos);
    checkOrthonormal(f);
    for (let i = 3; i < n * 3; i += 3) expect(dot(f.N, i, f.N, i - 3)).toBeGreaterThan(0.95);
  });
  it('keeps the normal pointing up on a flat curve (no twist)', () => {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = Math.cos(i * 0.1);
      pos[i * 3 + 2] = Math.sin(i * 0.1);
    }
    const f = frames(pos);
    for (let i = 0; i < n * 3; i += 3) expect(f.N[i + 1]).toBeCloseTo(1, 4);
  });
  it('is finite and orthonormal for coincident and collinear points', () => {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos[i * 3 + 2] = i < 10 ? 0 : -(i - 10) * 0.1;
    const f = frames(pos);
    expect(allFinite(f.T) && allFinite(f.N) && allFinite(f.B)).toBe(true);
    checkOrthonormal(f);
    const g = frames(new Float32Array(n * 3));
    expect(allFinite(g.T) && allFinite(g.N) && allFinite(g.B)).toBe(true);
    checkOrthonormal(g);
  });
  it('handles a vertical spine (tangent parallel to up)', () => {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos[i * 3 + 1] = i * 0.1;
    const f = frames(pos);
    expect(allFinite(f.N)).toBe(true);
    checkOrthonormal(f);
  });
});

describe('writeTube', () => {
  const rings = 8;
  const radial = 6;
  const centers = new Float32Array(rings * 3);
  const T = new Float32Array(rings * 3);
  const N = new Float32Array(rings * 3);
  const B = new Float32Array(rings * 3);
  for (let i = 0; i < rings; i++) {
    centers[i * 3 + 2] = -i * 0.1;
    T[i * 3 + 2] = -1;
    N[i * 3 + 1] = 1;
    B[i * 3] = 1;
  }
  const rN = new Float32Array([0, 0.05, 0.1, 0.1, 0.1, 0.1, 0.05, 0]);
  const rB = new Float32Array([0, 0.06, 0.12, 0.12, 0.12, 0.12, 0.06, 0]);
  const slope = new Float32Array([2, 1, 0, 0, 0, 0, -1, -2]);

  it('counts vertices with a seam column per ring', () => {
    expect(tubeVertexCount(rings, radial)).toBe(rings * (radial + 1));
    const idx = tubeIndices(rings, radial);
    expect(idx.length).toBe((rings - 1) * radial * 6);
    for (const v of idx) expect(v).toBeLessThan(tubeVertexCount(rings, radial));
  });
  it('writes finite positions on the ellipse and unit normals', () => {
    const count = tubeVertexCount(rings, radial);
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    writeTube(rings, ringTrig(radial), centers, T, N, B, rN, rB, slope, pos, nor);
    expect(allFinite(pos) && allFinite(nor)).toBe(true);
    for (let v = 0; v < count; v++) expect(len(nor, v * 3)).toBeCloseTo(1, 5);
    // Ring 3, vertex 0 sits on the dorsal (N) side at rN above the centre.
    const v0 = (3 * (radial + 1)) * 3;
    expect(pos[v0 + 1]).toBeCloseTo(0.1, 5);
    expect(nor[v0 + 1]).toBeCloseTo(1, 5);
    // Tips: every vertex at the centre, normals along the spine (forward at the head).
    expect(nor[2]).toBeCloseTo(1, 5);
    const tail = ((rings - 1) * (radial + 1)) * 3;
    expect(nor[tail + 2]).toBeCloseTo(-1, 5);
    // Seam column duplicates column 0.
    const seam = (3 * (radial + 1) + radial) * 3;
    expect(pos[seam]).toBeCloseTo(pos[v0], 5);
    expect(pos[seam + 1]).toBeCloseTo(pos[v0 + 1], 5);
  });
});
