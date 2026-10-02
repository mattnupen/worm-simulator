import { describe, it, expect } from 'vitest';
import { SpeedTestRunner, type SpeedTestHost } from '../../src/perf/speedTestRunner';
import type { PhaseSpec } from '../../src/perf/speedTest';

function fakeHost() {
  const log: string[] = [];
  const host: SpeedTestHost = {
    setMaxFps: (fps) => log.push(`cap ${fps}`),
    applyTier: (t) => log.push(`tier ${t}`),
    showPhase: (p: PhaseSpec) => log.push(`phase ${p.id}`),
    deviceInfo: () => ({ gpu: 'Test GPU', cores: 4, memoryGb: 4, screen: '1366x768', pixelRatio: 1, userAgent: 'test' }),
  };
  return { host, log };
}

/** Runs frames every `stepMs` until the test finishes or `limitMs` passes; returns the end time. */
function runUntilDone(r: SpeedTestRunner, t0: number, stepMs: number, fps: (t: number) => number, limitMs = 60_000): number {
  let t = t0;
  while (t < t0 + limitMs) {
    if (r.frame(t, fps(t))) return t;
    t += stepMs;
  }
  throw new Error('speed test never finished');
}

describe('SpeedTestRunner', () => {
  it('runs both phases, switching the frame cap, and reports PASS at 30 fps', () => {
    const { host, log } = fakeHost();
    const r = new SpeedTestRunner(host, true, 5500);
    expect(r.running).toBe(false);
    r.start();
    expect(r.running).toBe(true);
    expect(log).toEqual(['tier 0', 'cap Infinity', 'phase full']);
    runUntilDone(r, 0, 1000 / 30, () => 30);
    expect(r.running).toBe(false);
    expect(log).toEqual(['tier 0', 'cap Infinity', 'phase full', 'cap 30', 'phase auto', 'cap 30']);
    expect(r.result?.pass).toBe(true);
    expect(r.result?.tier).toBe(0);
    expect(r.result?.text.split('\n')[0]).toBe('Result: PASS');
    expect(r.result?.text).toContain('Leaves: 5500');
    expect(r.result?.text).toContain('Test GPU');
  });

  it('steps the quality tier down in the auto phase when slow, and restarts the measurement', () => {
    const { host, log } = fakeHost();
    const r = new SpeedTestRunner(host, false, 1000);
    r.start();
    runUntilDone(r, 0, 50, () => 20, 120_000);
    expect(log).toContain('tier 1');
    expect(r.result?.tier).toBeGreaterThan(0);
    expect(r.result?.text).toContain('Measurement restarts:');
    expect(r.result?.pass).toBe(false);
  });

  it('restarts the measurement when the tab comes back', () => {
    const { host } = fakeHost();
    const r = new SpeedTestRunner(host, true, 1000);
    r.start();
    r.frame(0, 30);
    r.onHidden();
    r.onVisible(100);
    runUntilDone(r, 200, 1000 / 30, () => 30);
    expect(r.result?.text).toContain('Measurement restarts: 1');
  });

  it('abort() stops without a result, and frames after that do nothing', () => {
    const { host } = fakeHost();
    const r = new SpeedTestRunner(host, true, 1000);
    r.start();
    r.abort();
    expect(r.running).toBe(false);
    expect(r.frame(5000, 30)).toBe(false);
    expect(r.result).toBeNull();
  });
});
