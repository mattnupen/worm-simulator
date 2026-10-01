import { describe, it, expect } from 'vitest';
import { FpsMeter, summarize } from '../../src/render/fps';

function frames(count: number, intervalMs: number, start = 0): number[] {
  return Array.from({ length: count }, (_, i) => start + i * intervalMs);
}

describe('FpsMeter', () => {
  it('reports about 30 fps for 33.3 ms frames', () => {
    const m = new FpsMeter(1000);
    for (const t of frames(90, 1000 / 30)) m.frame(t);
    expect(m.fps).toBeCloseTo(30, 0);
  });
  it('reports 0 with fewer than 2 frames', () => {
    const m = new FpsMeter();
    m.frame(0);
    expect(m.fps).toBe(0);
  });
});

describe('summarize', () => {
  it('steady 30 fps gives avg 30 and low 30', () => {
    const s = summarize(frames(101, 1000 / 30));
    expect(s.avgFps).toBeCloseTo(30, 1);
    expect(s.lowFps).toBeCloseTo(30, 1);
    expect(s.frames).toBe(101);
  });
  it('hitches pull the low number down', () => {
    const times = [0];
    for (let i = 1; i <= 100; i++) times.push(times[i - 1] + (i % 10 === 0 ? 100 : 1000 / 30));
    const s = summarize(times);
    expect(s.lowFps).toBeCloseTo(10, 1);
    expect(s.avgFps).toBeLessThan(30);
  });
  it('handles empty input', () => {
    expect(summarize([])).toEqual({ avgFps: 0, lowFps: 0, frames: 0, maxGapMs: 0 });
  });
  it('reports the longest frame gap', () => {
    const times = [0, 33, 66, 1066, 1099];
    const s = summarize(times);
    expect(s.maxGapMs).toBe(1000);
  });
  it('rolling window recovers after a slowdown', () => {
    const m = new FpsMeter(1000);
    const times = frames(60, 1000 / 30);
    for (const t of times) m.frame(t);
    const lastTime = times[times.length - 1];
    const slowTimes = frames(30, 1000 / 15, lastTime);
    for (const t of slowTimes) m.frame(t);
    expect(m.fps).toBeCloseTo(15, 0);
  });
});
