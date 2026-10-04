import { describe, it, expect } from 'vitest';
import {
  SpeedTest, PHASES, MAX_RESTARTS, quickPhases, verdict, formatResults, formatNoWebGLResults, formatContextLostResults, type DeviceInfo,
} from '../../src/perf/speedTest';

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

    // Frames at now >= 1600 (1600..2300 = 8, plus 2399 and 2400), plus the frame at 1500 that
    // precedes the first sample so the boundary gap is counted. Nothing from before that.
    expect(t.results.full.frames).toBe(11);
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

  it('caps restarts at MAX_RESTARTS and reports whether each one was taken', () => {
    const t = restartPhases();
    t.frame(0);
    const taken: boolean[] = [];
    for (let i = 0; i < MAX_RESTARTS + 1; i++) taken.push(t.restartMeasurement(100 + i, 0));
    expect(taken).toEqual([true, true, true, true, true, false]);
    expect(t.restarts).toBe(MAX_RESTARTS);
    expect(MAX_RESTARTS).toBe(5);
  });

  it('restartMeasurement returns false after done', () => {
    const t = restartPhases();
    let now = 0;
    while (!t.done) {
      t.frame(now);
      now += 1000 / 30;
    }
    expect(t.restartMeasurement(now)).toBe(false);
  });

  it('counts a stall that straddles the start of the measurement window', () => {
    const t = restartPhases();
    for (const now of [0, 33, 66, 100]) t.frame(now);
    // Stall: nothing from 100 to 900, then 30 fps frames until the phase ends.
    for (let now = 900; !t.done && t.current?.id === 'full'; now += 1000 / 30) t.frame(now);
    expect(t.results.full.maxGapMs).toBeGreaterThanOrEqual(800);
  });

  it('does not count a hidden-tab gap before a restart, nor a gap from the previous phase', () => {
    const t = restartPhases();
    for (const now of [0, 33, 66, 100]) t.frame(now);
    expect(t.restartMeasurement(900, 0)).toBe(true); // tab was hidden 100 -> 900
    for (let now = 900; t.current?.id === 'full'; now += 1000 / 30) t.frame(now);
    expect(t.results.full.maxGapMs).toBeLessThan(50);

    // The 'auto' phase starts without pulling in the last frame of 'full'.
    for (let now = 5000; !t.done; now += 1000 / 30) t.frame(now);
    expect(t.results.auto.maxGapMs).toBeLessThan(50);
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
  it('judges the value as displayed to one decimal', () => {
    expect(verdict({ avgFps: 27.96, lowFps: 25, frames: 300, maxGapMs: 40 })).toBe('PASS');
    expect(verdict({ avgFps: 27.94, lowFps: 25, frames: 300, maxGapMs: 40 })).toBe('FAIL');
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

  const device: DeviceInfo = {
    gpu: 'Mali-G52', cores: 8, memoryGb: 4, screen: '1366x768', pixelRatio: 1, userAgent: 'CrOS',
  };
  const full = { avgFps: 55, lowFps: 40, frames: 400, maxGapMs: 30 };
  const auto = { avgFps: 29.6, lowFps: 26, frames: 300, maxGapMs: 123.4 };

  it('reports the render size right after the screen line when known', () => {
    const lines = formatResults(full, auto, 1, 2000, { ...device, renderSize: '1024x576' }).split('\n');
    const i = lines.indexOf('Screen: 1366x768 at 1x');
    expect(i).toBeGreaterThan(0);
    expect(lines[i + 1]).toBe('Render size: 1024x576');
  });

  it('omits the render size line when not given', () => {
    expect(formatResults(full, auto, 1, 2000, device)).not.toContain('Render size');
  });

  it('adds no restarts line when there were none', () => {
    expect(formatResults(full, auto, 1, 2000, device)).not.toContain('Measurement restarts');
    expect(formatResults(full, auto, 1, 2000, device, 0)).not.toContain('Measurement restarts');
  });

  it('reports restarts directly after the longest pause line', () => {
    const lines = formatResults(full, auto, 1, 2000, device, 2).split('\n');
    expect(lines[2]).toBe('Longest pause (auto test): 123 ms');
    expect(lines[3]).toBe('Measurement restarts: 2');
  });

  it('names the world scale right after the leaves, when given', () => {
    const lines = formatResults(full, auto, 1, 368, device, 0, 'True').split('\n');
    expect(lines[lines.indexOf('Leaves: 368') + 1]).toBe('World scale: True');
    expect(formatResults(full, auto, 1, 368, device)).not.toContain('World scale');
  });

  it('flags when the restart limit was reached', () => {
    const lines = formatResults(full, auto, 1, 2000, device, MAX_RESTARTS).split('\n');
    expect(lines[3]).toBe(
      `Measurement restarts: ${MAX_RESTARTS} (limit reached: keep this tab open and visible, then run again)`,
    );
  });
});

describe('formatNoWebGLResults', () => {
  const device = { cores: 4, memoryGb: 2, screen: '1366x768', pixelRatio: 1, userAgent: 'CrOS' };

  it('leads with FAIL and the reason, then the device lines', () => {
    const lines = formatNoWebGLResults(device, 'Error creating WebGL context.').split('\n');
    expect(lines[0]).toBe('Result: FAIL');
    expect(lines[1]).toBe(
      'Reason: this computer could not start 3D graphics (WebGL 2). Error creating WebGL context.',
    );
    expect(lines.slice(2)).toEqual([
      'CPU cores: 4', 'Memory: 2 GB', 'Screen: 1366x768 at 1x', 'Browser: CrOS',
    ]);
  });
});

describe('formatContextLostResults', () => {
  const device = { cores: 4, memoryGb: 2, screen: '1366x768', pixelRatio: 1, userAgent: 'CrOS' };

  it('leads with FAIL and says the graphics system reset, then the device lines', () => {
    const lines = formatContextLostResults(device).split('\n');
    expect(lines[0]).toBe('Result: FAIL');
    expect(lines[1]).toBe('Reason: the graphics system reset during the test (WebGL context lost).');
    expect(lines).toContain('CPU cores: 4');
    expect(lines).toContain('Browser: CrOS');
  });
});
