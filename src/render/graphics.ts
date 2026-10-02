import { QualityController, type QualityTier } from './quality';

/**
 * Graphics presets (spec 4.1) and Auto (spec 4.3). Pure: no DOM, no WebGL. Every mesh is
 * built once at Ultra size; a preset only picks draw ranges, counts, visibility and the
 * pixel ratio, so switching never allocates or recompiles shaders.
 */
export type PresetId = 'low' | 'medium' | 'high' | 'ultra';
/** What the player picked in the Graphics menu. */
export type GraphicsChoice = 'auto' | PresetId;

export interface PresetSpec {
  id: PresetId;
  /** Render scale on top of the pixel ratio below (0.6 = 60%). */
  resolution: number;
  /** Highest device pixel ratio used: 1 means CSS pixels, Ultra goes up to 1.5. */
  maxDpr: number;
  /** Base leaf litter across the whole floor. */
  litter: number;
  /** Detail leaves within 6 m of the worm. */
  detail: number;
  /** Hero physics leaves near the head. */
  hero: number;
  /** Leaves react to the worm (drape, trail, under/over). Off: the worm rides on top. */
  reaction: boolean;
  /** Light shafts, dust motes and falling leaves. */
  effects: boolean;
  /** 1.5x dust motes and falling leaves. */
  extraEffects: boolean;
  /** Fraction of the ground clutter drawn. */
  clutter: number;
  /** Extra clutter around the worm. */
  nearClutter: boolean;
  rim: boolean;
}

export const PRESET_IDS: readonly PresetId[] = ['low', 'medium', 'high', 'ultra'];
export const CHOICES: readonly GraphicsChoice[] = ['auto', ...PRESET_IDS];

export const PRESETS: Readonly<Record<PresetId, PresetSpec>> = {
  low: {
    id: 'low', resolution: 0.6, maxDpr: 1, litter: 1000, detail: 0, hero: 0, reaction: false,
    effects: false, extraEffects: false, clutter: 0.5, nearClutter: false, rim: false,
  },
  medium: {
    id: 'medium', resolution: 0.75, maxDpr: 1, litter: 2500, detail: 800, hero: 12, reaction: true,
    effects: true, extraEffects: false, clutter: 1, nearClutter: false, rim: true,
  },
  high: {
    id: 'high', resolution: 1, maxDpr: 1, litter: 4000, detail: 1500, hero: 24, reaction: true,
    effects: true, extraEffects: false, clutter: 1, nearClutter: false, rim: true,
  },
  ultra: {
    id: 'ultra', resolution: 1, maxDpr: 1.5, litter: 6000, detail: 2500, hero: 32, reaction: true,
    effects: true, extraEffects: true, clutter: 1, nearClutter: true, rim: true,
  },
};

export const CHOICE_LABELS: Readonly<Record<GraphicsChoice, string>> = {
  auto: 'Auto', low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra',
};

export const CHOICE_DESCRIPTIONS: Readonly<Record<GraphicsChoice, string>> = {
  auto: 'Starts on High and lowers detail if the game slows down.',
  low: 'Fewest leaves, simple light. For slow computers.',
  medium: 'More leaves and soft light effects.',
  high: 'Lots of leaves and full effects. Best for most school Chromebooks.',
  ultra: 'The most leaves and the sharpest picture. For fast computers.',
};

export function isPresetId(v: unknown): v is PresetId {
  return typeof v === 'string' && (PRESET_IDS as readonly string[]).includes(v);
}

export function isChoice(v: unknown): v is GraphicsChoice {
  return v === 'auto' || isPresetId(v);
}

/** The renderer pixel ratio for a preset on a screen with device pixel ratio `dpr`. */
export function pixelRatioFor(spec: PresetSpec, dpr: number): number {
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return Math.min(d, spec.maxDpr) * spec.resolution;
}

/** Auto steps down through these, in order. It never chooses Ultra. */
export const AUTO_ORDER: readonly PresetId[] = ['high', 'medium', 'low'];

/**
 * Auto (spec 4.3): starts at the saved preset (or High) and, with the QualityController's
 * timing (under 29 fps for 2 s, 3 s cooldown), steps down one preset at a time. Never up.
 */
export class AutoGraphics {
  private readonly start: number;
  private readonly q: QualityController;

  constructor(settled: PresetId | null) {
    const i = settled ? AUTO_ORDER.indexOf(settled) : -1;
    this.start = i < 0 ? 0 : i;
    this.q = new QualityController(30, 2000, 3000, AUTO_ORDER.length - this.start);
  }

  get preset(): PresetId {
    return AUTO_ORDER[this.start + this.q.tier];
  }

  /** Returns true when it stepped down. */
  update(nowMs: number, fps: number): boolean {
    if (!Number.isFinite(fps)) {
      this.q.interrupt();
      return false;
    }
    return this.q.update(nowMs, fps);
  }

  interrupt(): void {
    this.q.interrupt();
  }
}

/**
 * Where a new session's Auto starts: one step above the saved autoSettled (Low -> Medium,
 * Medium -> High, High stays High; never Ultra). One slow session (battery saver, a busy
 * machine) must not pin a computer at Low for good; if it is still slow, Auto steps down
 * again within seconds. null (nothing saved) stays null, which starts on High.
 */
export function autoSessionStart(settled: PresetId | null): PresetId | null {
  const i = settled ? AUTO_ORDER.indexOf(settled) : -1;
  return i < 0 ? null : AUTO_ORDER[Math.max(0, i - 1)];
}

/** Speed-test tier (0..3) to the preset "Use recommended setting" saves. */
const TIER_PRESETS: readonly PresetId[] = ['high', 'medium', 'medium', 'low'];

export function recommendedPreset(tier: number): PresetId {
  if (!Number.isFinite(tier)) return 'high';
  return TIER_PRESETS[Math.max(0, Math.min(TIER_PRESETS.length - 1, Math.round(tier)))];
}

/**
 * A speed-test quality tier layered on a base preset, so the test's tiers keep their Step 0
 * meaning: lower resolution, then no rim light or atmosphere extras, then half the leaves.
 */
export function tierSpec(base: PresetSpec, tier: QualityTier): PresetSpec {
  const d = tier.leafDensity;
  return {
    ...base,
    resolution: base.resolution * tier.resolutionScale,
    rim: base.rim && tier.rimLight,
    effects: base.effects && tier.rimLight,
    litter: Math.round(base.litter * d),
    detail: Math.round(base.detail * d),
    hero: Math.round(base.hero * d),
    clutter: base.clutter * d,
  };
}
