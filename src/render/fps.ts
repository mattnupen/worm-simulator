export interface FpsSummary { avgFps: number; lowFps: number; frames: number; maxGapMs: number }

/** FpsMeter's default window: its fps still includes frames from this long ago. */
export const FPS_WINDOW_MS = 1000;

/** Rolling frames-per-second over the last windowMs. */
export class FpsMeter {
  private times: number[] = [];
  constructor(private readonly windowMs = FPS_WINDOW_MS) {}

  frame(nowMs: number): void {
    this.times.push(nowMs);
    const cutoff = nowMs - this.windowMs;
    while (this.times.length > 0 && this.times[0] < cutoff) this.times.shift();
  }

  get fps(): number {
    if (this.times.length < 2) return 0;
    const span = this.times[this.times.length - 1] - this.times[0];
    return span > 0 ? ((this.times.length - 1) * 1000) / span : 0;
  }
}

/** Average fps and "low" fps (the 95th-percentile slowest frame), and longest frame gap for a run. */
export function summarize(times: number[]): FpsSummary {
  if (times.length < 2) return { avgFps: 0, lowFps: 0, frames: times.length, maxGapMs: 0 };
  const intervals: number[] = [];
  for (let i = 1; i < times.length; i++) intervals.push(times[i] - times[i - 1]);
  intervals.sort((a, b) => a - b);
  const p95 = intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * 0.95))];
  const span = times[times.length - 1] - times[0];
  return {
    avgFps: span > 0 ? ((times.length - 1) * 1000) / span : 0,
    lowFps: p95 > 0 ? 1000 / p95 : 0,
    frames: times.length,
    maxGapMs: intervals[intervals.length - 1],
  };
}
