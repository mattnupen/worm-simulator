import { summarize, type FpsSummary } from '../render/fps';
import { TIERS } from '../render/quality';

export interface SpikeParams { leaves: number; quick: boolean }

export function parseParams(search: string): SpikeParams {
  const p = new URLSearchParams(search);
  const n = Number(p.get('leaves'));
  const leaves = Number.isFinite(n) && n > 0 ? Math.min(10000, Math.max(100, Math.round(n))) : 2000;
  return { leaves, quick: p.get('quick') === '1' };
}

export interface PhaseSpec {
  id: 'full' | 'auto';
  durationMs: number;
  capped: boolean;
  autoQuality: boolean;
  /** Ignore frames before this (warm-up). */
  measureFromMs: number;
}

export const PHASES: readonly PhaseSpec[] = [
  { id: 'full', durationMs: 10_000, capped: false, autoQuality: false, measureFromMs: 2_000 },
  { id: 'auto', durationMs: 15_000, capped: true, autoQuality: true, measureFromMs: 5_000 },
];

export function quickPhases(): PhaseSpec[] {
  return PHASES.map((p) => ({ ...p, durationMs: 1_500, measureFromMs: 200 }));
}

const EMPTY: FpsSummary = { avgFps: 0, lowFps: 0, frames: 0, maxGapMs: 0 };

export class SpeedTest {
  results: Record<PhaseSpec['id'], FpsSummary> = { full: EMPTY, auto: EMPTY };
  /** Times the measurement window was restarted (tier change or hidden tab). */
  restarts = 0;
  private index = 0;
  private phaseStart: number | null = null;
  private times: number[] = [];

  constructor(private readonly phases: readonly PhaseSpec[]) {}

  get current(): PhaseSpec | null {
    return this.phases[this.index] ?? null;
  }

  get done(): boolean {
    return this.current === null;
  }

  frame(nowMs: number): void {
    const phase = this.current;
    if (!phase) return;
    if (this.phaseStart === null) this.phaseStart = nowMs;
    const t = nowMs - this.phaseStart;
    if (t >= phase.measureFromMs) this.times.push(nowMs);
    if (t >= phase.durationMs) {
      this.results[phase.id] = summarize(this.times);
      this.index++;
      this.phaseStart = null;
      this.times = [];
    }
  }

  /**
   * Discard samples and restart the current phase's measurement, so the result reflects only
   * stable conditions. Sampling resumes settleMs after nowMs (a tier change resizes the
   * framebuffer and hitches), then the phase runs a full measurement window.
   */
  restartMeasurement(nowMs: number, settleMs = 1000): void {
    const phase = this.current;
    if (!phase) return;
    this.phaseStart = nowMs - phase.measureFromMs + settleMs;
    this.times = [];
    this.restarts++;
  }
}

/** The game caps at 30 fps, so 28+ average means it holds 30 with small hiccups. */
export function verdict(auto: FpsSummary): 'PASS' | 'FAIL' {
  return auto.avgFps >= 28 ? 'PASS' : 'FAIL';
}

export interface DeviceInfo {
  gpu: string;
  cores: number | string;
  memoryGb: number | string;
  screen: string;
  pixelRatio: number;
  userAgent: string;
}

export function formatResults(
  full: FpsSummary, auto: FpsSummary, finalTier: number, leaves: number, d: DeviceInfo,
): string {
  return [
    `Result: ${verdict(auto)}`,
    `Auto quality (30 fps cap): ${auto.avgFps.toFixed(1)} fps average, ${auto.lowFps.toFixed(1)} fps low`,
    `Longest pause (auto test): ${Math.round(auto.maxGapMs)} ms`,
    `Quality level used: ${finalTier} of ${TIERS.length - 1} (0 = best)`,
    `Full quality, no cap: ${full.avgFps.toFixed(1)} fps average, ${full.lowFps.toFixed(1)} fps low`,
    `Leaves: ${leaves}`,
    `GPU: ${d.gpu}`,
    `CPU cores: ${d.cores}`,
    `Memory: ${d.memoryGb} GB`,
    `Screen: ${d.screen} at ${d.pixelRatio}x`,
    `Browser: ${d.userAgent}`,
  ].join('\n');
}
