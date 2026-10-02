import { QualityController } from '../render/quality';
import {
  SpeedTest, PHASES, quickPhases, formatResults, verdict, type DeviceInfo, type PhaseSpec,
} from './speedTest';

/** What the runner needs from the game: frame cap, quality tiers, the running card, device info. */
export interface SpeedTestHost {
  /** Use Infinity for no cap. */
  setMaxFps(fps: number): void;
  /** Render at speed-test quality tier `tier` (0 = best). */
  applyTier(tier: number): void;
  /** A phase started: show its running card. */
  showPhase(phase: PhaseSpec): void;
  deviceInfo(): DeviceInfo;
}

export interface SpeedTestResult { text: string; pass: boolean; tier: number }

/**
 * The Step 0 speed test's control flow, unchanged: an uncapped full-quality phase, then a
 * capped auto-quality phase whose tier drops restart the measurement; a hidden tab restarts
 * it too. Moved out of the page script so the game shell can host it.
 */
export class SpeedTestRunner {
  readonly quality = new QualityController();
  result: SpeedTestResult | null = null;
  private test: SpeedTest | null = null;

  constructor(
    private readonly host: SpeedTestHost,
    private readonly quick: boolean,
    /** Leaf count printed in the report. */
    private readonly leaves: number,
  ) {}

  get running(): boolean {
    return this.test !== null;
  }

  start(): void {
    this.test = new SpeedTest(this.quick ? quickPhases() : PHASES);
    this.result = null;
    this.quality.reset();
    this.host.applyTier(0);
    const first = this.test.current!;
    this.host.setMaxFps(first.capped ? 30 : Infinity);
    this.host.showPhase(first);
  }

  /** Call once per rendered frame with the rolling fps. True on the frame the test finishes. */
  frame(nowMs: number, fps: number): boolean {
    const test = this.test;
    if (!test) return false;
    const phase = test.current;
    test.frame(nowMs);
    if (phase?.autoQuality && this.quality.update(nowMs, fps)) {
      this.host.applyTier(this.quality.tier);
      test.restartMeasurement(nowMs);
    }
    const next = test.current;
    if (next === phase) return false;
    if (next) {
      this.host.setMaxFps(next.capped ? 30 : Infinity);
      this.host.showPhase(next);
      return false;
    }
    this.host.setMaxFps(30);
    const { full, auto } = test.results;
    this.result = {
      text: formatResults(full, auto, this.quality.tier, this.leaves, this.host.deviceInfo(), test.restarts),
      pass: verdict(auto) === 'PASS',
      tier: this.quality.tier,
    };
    this.test = null;
    return true;
  }

  onHidden(): void {
    this.quality.interrupt();
  }

  /** The tab is visible again: the samples around the gap cannot be trusted. */
  onVisible(nowMs: number): void {
    if (!this.test) return;
    this.test.restartMeasurement(nowMs);
    this.quality.interrupt();
  }

  /** Stops a running test without a result (the graphics were lost). */
  abort(): void {
    this.test = null;
  }
}
