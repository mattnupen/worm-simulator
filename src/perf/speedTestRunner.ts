import { QualityController } from '../render/quality';
import {
  SpeedTest, PHASES, quickPhases, formatResults, verdict, type DeviceInfo, type PhaseSpec,
} from './speedTest';

/** The game's frame cap (fps); the speed test lifts it only for its uncapped phase. */
export const FPS_CAP = 30;

/**
 * What the runner needs from the game: a fresh start, frame cap, quality tiers, the running
 * card, device info.
 */
export interface SpeedTestHost {
  /**
   * Put the worm, its camera and the leaves it moved back at the spawn, as on a fresh load,
   * so the numbers never depend on where the player had crawled.
   */
  resetWorld(): void;
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
    /** Leaves drawn right now (litter plus detail), read when the report is written. */
    private readonly leaves: () => number,
  ) {}

  get running(): boolean {
    return this.test !== null;
  }

  start(): void {
    this.host.resetWorld();
    this.test = new SpeedTest(this.quick ? quickPhases() : PHASES);
    this.result = null;
    this.quality.reset();
    this.host.applyTier(0);
    const first = this.test.current!;
    this.host.setMaxFps(first.capped ? FPS_CAP : Infinity);
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
      this.host.setMaxFps(next.capped ? FPS_CAP : Infinity);
      this.host.showPhase(next);
      return false;
    }
    this.host.setMaxFps(FPS_CAP);
    const { full, auto } = test.results;
    this.result = {
      text: formatResults(full, auto, this.quality.tier, this.leaves(), this.host.deviceInfo(), test.restarts),
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

  /**
   * Stops a running test without a result: the player left the test, the graphics were lost,
   * or the game loop crashed.
   */
  abort(): void {
    this.test = null;
  }
}
