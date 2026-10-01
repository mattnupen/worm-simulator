export interface QualityTier { resolutionScale: number; rimLight: boolean; leafDensity: number }

export const TIERS: readonly QualityTier[] = [
  { resolutionScale: 1, rimLight: true, leafDensity: 1 },
  { resolutionScale: 0.75, rimLight: true, leafDensity: 1 },
  { resolutionScale: 0.75, rimLight: false, leafDensity: 1 },
  { resolutionScale: 0.6, rimLight: false, leafDensity: 0.5 },
];

/** Steps quality down (never up, to avoid flicker) when fps stays under target. */
export class QualityController {
  tier = 0;
  private belowSince: number | null = null;
  private lastChange = -Infinity;

  constructor(
    private readonly targetFps = 30,
    private readonly holdMs = 2000,
    private readonly cooldownMs = 3000,
  ) {}

  /** Returns true when the tier changed. */
  update(nowMs: number, fps: number): boolean {
    if (nowMs - this.lastChange < this.cooldownMs) return false;
    if (fps >= this.targetFps - 1) {
      this.belowSince = null;
      return false;
    }
    if (this.belowSince === null) this.belowSince = nowMs;
    if (nowMs - this.belowSince >= this.holdMs && this.tier < TIERS.length - 1) {
      this.tier++;
      this.lastChange = nowMs;
      this.belowSince = null;
      return true;
    }
    return false;
  }

  /** Forget any low-fps streak in progress (e.g. the tab was hidden). Keeps the current tier. */
  interrupt(): void {
    this.belowSince = null;
  }

  reset(): void {
    this.tier = 0;
    this.belowSince = null;
    this.lastChange = -Infinity;
  }
}
