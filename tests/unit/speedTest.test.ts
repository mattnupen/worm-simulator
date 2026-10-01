import { describe, it, expect } from 'vitest';
import {
  parseParams, SpeedTest, PHASES, quickPhases, verdict, formatResults, type DeviceInfo,
} from '../../src/spike/speedTest';

describe('parseParams', () => {
  it('defaults to 2000 leaves, not quick', () => {
    expect(parseParams('')).toEqual({ leaves: 2000, quick: false });
  });
  it('reads and clamps leaves, reads quick', () => {
    expect(parseParams('?leaves=4000&quick=1')).toEqual({ leaves: 4000, quick: true });
    expect(parseParams('?leaves=999999')).toEqual({ leaves: 10000, quick: false });
    expect(parseParams('?leaves=abc')).toEqual({ leaves: 2000, quick: false });
  });
});

describe('PHASES', () => {
  it('runs full quality uncapped, then auto quality capped', () => {
    expect(PHASES.map((p) => p.id)).toEqual(['full', 'auto']);
    expect(PHASES[0]).toMatchObject({ capped: false, autoQuality: false });
    expect(PHASES[1]).toMatchObject({ capped: true, autoQuality: true });
  });
  it('quick phases are short', () => {
    for (const p of quickPhases()) expect(p.durationMs).toBeLessThanOrEqual(1500);
  });
});

describe('SpeedTest', () => {
  it('measures each phase after its warm-up and then finishes', () => {
    const t = new SpeedTest([
      { id: 'full', durationMs: 1000, capped: false, autoQuality: false, measureFromMs: 200 },
      { id: 'auto', durationMs: 1000, capped: true, autoQuality: true, measureFromMs: 200 },
    ]);
    expect(t.current?.id).toBe('full');
    let now = 0;
    while (!t.done) {
      t.frame(now);
      now += 1000 / 30;
    }
    expect(t.results.full.avgFps).toBeCloseTo(30, 0);
    expect(t.results.auto.avgFps).toBeCloseTo(30, 0);
    expect(t.current).toBeNull();
  });

  const restartPhases = () => new SpeedTest([
    { id: 'full', durationMs: 1000, capped: false, autoQuality: false, measureFromMs: 200 },
    { id: 'auto', durationMs: 1000, capped: true, autoQuality: true, measureFromMs: 200 },
  ]);

  it('restartMeasurement discards samples, waits out the settle delay and extends the phase', () => {
    const t = restartPhases();
    const step = 1000 / 30;
    for (let now = 0; now <= 600; now += step) t.frame(now);
    t.restartMeasurement(600); // default settle 1000 ms: sampling resumes at 1600
    expect(t.restarts).toBe(1);

    // Frames every 100 ms. Those before 1600 (settle period) must not be sampled.
    for (let now = 700; now <= 2300; now += 100) t.frame(now);
    expect(t.current?.id).toBe('full'); // would have ended at 1000 without the restart
    t.frame(2399);
    expect(t.current?.id).toBe('full');
    t.frame(2400); // 600 + 1000 + 800
    expect(t.current?.id).toBe('auto');

    // Only frames at now >= 1600 (1600..2300 = 8, plus 2399 and 2400), none from before the
    // restart or the settle period.
    expect(t.results.full.frames).toBe(10);
    expect(t.results.full.maxGapMs).toBeCloseTo(100, 5);
    expect(t.restarts).toBe(1);
  });

  it('restartMeasurement with settleMs 0 resumes sampling at once and ends at restart + 800', () => {
    const t = restartPhases();
    for (let now = 0; now <= 600; now += 100) t.frame(now);
    t.restartMeasurement(600, 0);
    t.frame(1300);
    expect(t.current?.id).toBe('full');
    t.frame(1399);
    expect(t.current?.id).toBe('full');
    t.frame(1400);
    expect(t.current?.id).toBe('auto');
    expect(t.results.full.frames).toBe(3); // 1300, 1399, 1400
  });

  it('restartMeasurement after done is a no-op', () => {
    const t = new SpeedTest([
      { id: 'full', durationMs: 1000, capped: false, autoQuality: false, measureFromMs: 200 },
      { id: 'auto', durationMs: 1000, capped: true, autoQuality: true, measureFromMs: 200 },
    ]);
    let now = 0;
    while (!t.done) {
      t.frame(now);
      now += 1000 / 30;
    }
    expect(() => t.restartMeasurement(now)).not.toThrow();
    expect(t.restarts).toBe(0);
    expect(t.done).toBe(true);
  });
});

describe('verdict', () => {
  it('passes at 28 fps or more', () => {
    expect(verdict({ avgFps: 28, lowFps: 20, frames: 300, maxGapMs: 40 })).toBe('PASS');
    expect(verdict({ avgFps: 27.9, lowFps: 25, frames: 300, maxGapMs: 40 })).toBe('FAIL');
  });
});

describe('formatResults', () => {
  it('leads with the verdict and includes tier, longest pause and device', () => {
    const device: DeviceInfo = {
      gpu: 'Mali-G52', cores: 8, memoryGb: 4, screen: '1366x768', pixelRatio: 1, userAgent: 'CrOS',
    };
    const text = formatResults(
      { avgFps: 55, lowFps: 40, frames: 400, maxGapMs: 30 },
      { avgFps: 29.6, lowFps: 26, frames: 300, maxGapMs: 123.4 },
      1, 2000, device,
    );
    const lines = text.split('\n');
    expect(lines[0]).toBe('Result: PASS');
    expect(text).toContain('29.6 fps average');
    expect(text).toContain('Quality level used: 1 of 3');
    expect(text).toContain('Longest pause (auto test): 123 ms');
    expect(lines[2]).toBe('Longest pause (auto test): 123 ms');
    expect(text).toContain('Mali-G52');
  });
});
