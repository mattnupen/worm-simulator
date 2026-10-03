# Step 1a: Game Shell and Forest Floor v2, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Step 0 speed-test page with the real game entry (Start, Crawl, Pause, Graphics and Speed test screens, with saved Auto/Low/Medium/High/Ultra presets), and give the forest floor depth: leaf litter the worm slips under and climbs over, a disturbance map that drapes, pushes and trails the leaves, a close-up detail leaf layer, physics hero leaves, and a dithered fade for leaves that hide the worm.

**Architecture:** Pure, tested modules hold every rule: the preset table and Auto (`src/render/graphics.ts`), the settings store (`src/save/settingsStore.ts`), the screen state machine (`src/game/screens.ts`), litter depth, the worm's surface, the disturbance map and hero-leaf physics. `src/main.ts` wires them to the Three.js scene through `src/game/world.ts` (builds every mesh once at Ultra size; a preset only changes draw ranges, counts, visibility, a uniform and the pixel ratio) and `src/game/crawl.ts` (the fixed-step worm, camera, disturbance stamping and hero leaves, interpolated by alpha). Leaves near the worm are placed and bent in vertex shaders from shared uniforms; the 64×64 disturbance `DataTexture` is the only per-frame texture upload. The base litter is drawn in 6×6 chunks (frustum culling, near-first order, a low-detail leaf far away, the reacting shader only near the worm), and leaf shading is trimmed so the presets can carry more leaves near the worm within the fps gates. The Step 0 speed test moves to `src/perf/` unchanged inside and runs from the menu.

**Tech Stack:** Vite 8, TypeScript 7 (strict), three 0.186 (WebGL 2), vite-plugin-singlefile (one `dist/index.html`, CSP blocks all network), Vitest 5 (unit), Playwright (e2e, SwiftShader).

**Spec:** docs/superpowers/specs/2026-10-01-game-shell-and-forest-floor-v2-design.md
---

## Before you start

- Work on the branch `step1a-shell-forest-v2` (already checked out). The untracked `.claude/` folder is not part of this work: always `git add` the exact files listed, never `git add -A`.
- Commands (from the repo root):
  - unit tests: `npx vitest run` (one file: `npx vitest run tests/unit/<name>.test.ts`)
  - types: `npx tsc --noEmit`
  - build and single-file check: `npm run verify:build`
  - browser tests: `npm run test:e2e` (builds first; one file: `npm run build && npx playwright test tests/e2e/<name>.spec.ts`)
- Before Task 1, `npx vitest run` reports **22 files, 224 tests passed**. Each task states the new totals.
- Conventions: named exports only; unit tests import from `'../../src/...'`; files stay focused (under about 250 lines); no allocation in per-frame render or per-step code you add (use preallocated objects and typed arrays); new shader code goes behind `#define`s that are fixed at build time, so switching presets never recompiles.
- Units: "m" in this plan means world units (the spec's metres). The worm is 0.23 thick and about 3.6 long.
- Accessibility rules carried from Step 0 for every screen: text at least 18 px, ink on parchment at least 7:1, a 4 px focus ring, targets at least 48 px, focus moved deliberately on every screen change, one `aria-live="polite"` panel, all UI motion off under `prefers-reduced-motion`, nothing flashing.
- The benchmark script lives outside the repo at
  `/private/tmp/claude-501/-Users-mattnupen-Desktop-Code-Projects-worm-simulator/ec744b05-5dfd-4f59-a583-c8632a1b38ce/scratchpad/bench.mjs`
  (call it `$BENCH`). Decision for this plan: **bench.mjs is not changed; its usage changes.** The new `?speedtest=1` URL parameter opens the game straight on the Speed test screen, where the button named "Start speed test" exists, so the script's click still works. Per preset: `node "$BENCH" "$PWD" <label> "?speedtest=1&preset=<low|medium|high|ultra>"` after `npm run build`.

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/render/graphics.ts` | Create | Preset table (Low/Medium/High/Ultra), labels and one-line descriptions, `pixelRatioFor`, `AutoGraphics` (High→Medium→Low, never Ultra, never up), `recommendedPreset` (speed-test tier → preset), `tierSpec` (speed-test tier layered on a preset) |
| `src/render/quality.ts` | Modify | `QualityController` gains a `levels` limit so Auto can use it with 3 presets |
| `src/save/settingsStore.ts` | Create | `wormsim.settings` JSON key: guarded load/save with fallback to defaults |
| `src/game/screens.ts` | Create | Pure screen state machine (start, crawl, pause, graphics, speedTest, results) |
| `src/game/params.ts` | Create | URL params: `?preset=`, `?fps=1`, `?quick=1`, `?speedtest=1` |
| `src/game/graphicsControl.ts` | Create | Active preset from forced param, menu choice or Auto; saves changes |
| `src/perf/speedTest.ts` | Move from `src/spike/` | Step 0 phases, verdict and report text (unchanged, minus `parseParams`) |
| `src/perf/speedTestRunner.ts` | Create | Step 0 speed-test control flow (phases, frame cap, tier drops, restarts) behind a small host interface |
| `src/perf/device.ts` | Create | Device lines for the report (`basicDeviceInfo`, `deviceInfo`) |
| `src/game/drive.ts` | Move from `src/spike/` | Speed-test auto-drive move and the locomotion options |
| `src/ui/icons.ts` | Move from `src/spike/` | Decorative inline SVG icons (adds pause, sliders, gauge, home, check) |
| `src/ui/dom.ts` | Create | `el`, `button`, `leafList`, `cardHead`, `menu` helpers |
| `src/ui/shell.ts` | Create | The aria-live card, the fps tag and the Pause button |
| `src/ui/menus.ts` | Create | Start, Crawl hint, Pause and "graphics stopped" cards |
| `src/ui/graphicsMenu.ts` | Create | Graphics screen: five radios with descriptions, live change |
| `src/ui/speedTestUi.ts` | Create | Speed-test intro, running and result cards (adds Use recommended setting and Back to start) |
| `src/ui/parchment.css` | Create | Card, title, button, radio and result styles (from `spike.css`) |
| `src/ui/hud.css` | Create | fps tag, Pause button, joystick |
| `src/main.ts` | Create | Entry: renderer (WebGL 2 FAIL card), world, crawl, loop, screens, settings, speed test, context loss, pause on hidden tab |
| `src/game/world.ts` | Create | Builds the scene once at Ultra size; `apply(preset)`; per-frame `sync` (worm pose, hero matrices, focus uniforms, disturbance upload) |
| `src/game/crawl.ts` | Create | Fixed-step worm, body on its surface, follow camera, disturbance stamping, hero-leaf pushes, interpolation |
| `index.html` | Modify | Points at `src/main.ts`; title "Worm Simulator" |
| `src/spike/` | Delete | Replaced by the files above |
| `src/surface/leafLitterMesh.ts` | Modify, then replace (Task 21) | `setCount(n)` instead of `setDensity` (Task 8); depth-weighted placement on the litter mound (Task 10); 6×6 chunks with full and low-detail meshes, per-chunk draw ranges and materials, `update` per frame (Task 21) |
| `src/surface/fallingLeaves.ts` | Modify | Built at Ultra's 1.5×, `setCount`; material variant name |
| `src/render/atmosphere.ts` | Modify | Dust motes at Ultra's 1.5×; `Atmosphere.setLevel(on, extra)` owns the falling leaves too |
| `src/surface/litterDepth.ts` | Create | `litterDepth`, drifts, piles, hollows, `underAmount`, `litterMound`, `groundHeight`, `groundNormal` |
| `src/surface/leafLitter.ts` | Modify | `placeLeaves` takes a depth field: more leaves where deeper, resting on the mound |
| `src/surface/terrainMesh.ts` | Modify | Ground mesh rises by the litter mound and takes a leaf-litter colour on piles |
| `src/worm/surfaceHeight.ts` | Create | `wormSurface`, `bellyHeight`, `litterTop` |
| `src/worm/wormMesh.ts` | Modify | Drops `BELLY_LIFT`; passes a ground function to the shadow |
| `src/worm/wormShadow.ts` | Modify | Contact shadow follows a given ground function |
| `src/surface/disturbance.ts` | Create | Disturbance map: stamp, decay, scroll, clear, pack |
| `src/render/groundUniforms.ts` | Create | Shared `uFocus`, `uWrapCentre`, disturbance texture and origin; `setFocus`, `uploadDisturbance` |
| `src/render/leafGlsl.ts` | Create | Leaf GLSL chunks: disturbance, detail placement, hero instancing; their constants |
| `src/render/leafMaterial.ts` | Modify | Variants `litter`, `plain`, `far`, `falling`, `detail`, `hero` with fixed defines; occluder fade; low-detail fragment path; noise sampled per vertex |
| `src/render/wrap.ts` | Create | World-anchored wrapping (TS and GLSL twins) |
| `src/surface/detailShape.ts` | Create | Higher-vertex leaf silhouettes (inner ring) |
| `src/render/litterTexture.ts` | Create | Baked litter texture (mound, depth, trunk shade) for GPU-placed layers |
| `src/surface/detailLeaves.ts` | Create | The detail leaf layer mesh (smaller leaves from Task 22) |
| `src/surface/heroLeaves.ts` | Create | Hero-leaf physics (pure) |
| `src/surface/heroLeafMesh.ts` | Create | Hero leaves as one instanced mesh |
| `src/surface/nearClutter.ts` | Create | Ultra's extra clutter near the worm |
| `src/render/propMaterial.ts` | Modify | `WRAP` variant for the near clutter |
| `src/render/occlusion.ts` | Create | Camera-to-head sight-line fade (TS and GLSL twins) |
| `src/surface/litterChunks.ts` | Create (Task 20), modify (Task 22 follow-up) | Litter chunk grid: chunk of a point, distances, per-chunk prefix counts, LOD hysteresis; `DRAPE_MARGIN` (0.75) and the fade-hull test that picks each chunk's program |
| `src/surface/leafLod.ts` | Create | 6-triangle leaf silhouettes for distant litter |
| `src/surface/leafWriter.ts` | Create | Writes litter leaves into typed buffers (for the full and low-detail chunk meshes) |
| `tests/unit/*.test.ts` | Create/Modify | One test file per pure module, plus scene tests |
| `tests/e2e/speedTest.spec.ts` | Modify | Speed test from the menu, `?speedtest=1`, Use recommended setting |
| `tests/e2e/shell.spec.ts` | Create | Keyboard-only flow, persistence, live preset switch, fps tag, hidden tab |
| `docs/step0-chromebook-test.md` | Modify | New menu path, Use recommended setting, presets, `?speedtest=1` |
| `docs/superpowers/specs/2026-10-01-game-shell-and-forest-floor-v2-design.md` | Modify (Task 23) | Tuned preset counts, the raised draw budget (≤ 40) and the measured results |

---

### Task 1: Graphics presets and Auto

**Files:**
- Create: `src/render/graphics.ts`, `tests/unit/graphics.test.ts`
- Modify: `src/render/quality.ts`, `tests/unit/quality.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/graphics.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  PRESETS, PRESET_IDS, CHOICES, CHOICE_LABELS, CHOICE_DESCRIPTIONS, AUTO_ORDER, AutoGraphics,
  recommendedPreset, tierSpec, pixelRatioFor, isPresetId, isChoice, type PresetSpec,
} from '../../src/render/graphics';
import { TIERS } from '../../src/render/quality';

const FIELDS: (keyof PresetSpec)[] = [
  'id', 'resolution', 'maxDpr', 'litter', 'detail', 'hero', 'reaction', 'effects', 'extraEffects',
  'clutter', 'nearClutter', 'rim',
];

describe('PRESETS', () => {
  it('has every field on every preset, with its own id', () => {
    for (const id of PRESET_IDS) {
      for (const f of FIELDS) expect(PRESETS[id][f], `${id}.${f}`).toBeDefined();
      expect(PRESETS[id].id).toBe(id);
    }
  });

  it('matches the spec table', () => {
    expect(PRESETS.low).toMatchObject({ resolution: 0.6, litter: 1000, detail: 0, hero: 0, reaction: false, effects: false, clutter: 0.5, rim: false });
    expect(PRESETS.medium).toMatchObject({ resolution: 0.75, litter: 2500, detail: 800, hero: 12, reaction: true, effects: true, clutter: 1, rim: true });
    expect(PRESETS.high).toMatchObject({ resolution: 1, maxDpr: 1, litter: 4000, detail: 1500, hero: 24, extraEffects: false, nearClutter: false });
    expect(PRESETS.ultra).toMatchObject({ resolution: 1, maxDpr: 1.5, litter: 6000, detail: 2500, hero: 32, extraEffects: true, nearClutter: true });
  });

  it('never costs less going from Low up to Ultra, and costs more at every step', () => {
    const num = (s: PresetSpec) => [s.resolution * s.maxDpr, s.litter, s.detail, s.hero, s.clutter];
    const flag = (s: PresetSpec) => [s.reaction, s.effects, s.extraEffects, s.nearClutter, s.rim].map(Number);
    for (let i = 1; i < PRESET_IDS.length; i++) {
      const a = PRESETS[PRESET_IDS[i - 1]];
      const b = PRESETS[PRESET_IDS[i]];
      num(b).forEach((v, k) => expect(v).toBeGreaterThanOrEqual(num(a)[k]));
      flag(b).forEach((v, k) => expect(v).toBeGreaterThanOrEqual(flag(a)[k]));
      expect(b.litter + b.detail).toBeGreaterThan(a.litter + a.detail);
    }
  });

  it('has a label and a one-line description for every choice', () => {
    expect(CHOICES).toEqual(['auto', 'low', 'medium', 'high', 'ultra']);
    for (const c of CHOICES) {
      expect(CHOICE_LABELS[c].length).toBeGreaterThan(0);
      expect(CHOICE_DESCRIPTIONS[c]).toMatch(/\.$/);
    }
    expect(CHOICE_DESCRIPTIONS.auto).toBe('Starts on High and lowers detail if the game slows down.');
  });
});

describe('type guards', () => {
  it('accept only known ids', () => {
    expect(isPresetId('high')).toBe(true);
    expect(isPresetId('auto')).toBe(false);
    expect(isPresetId(3)).toBe(false);
    expect(isChoice('auto')).toBe(true);
    expect(isChoice('ULTRA')).toBe(false);
  });
});

describe('pixelRatioFor', () => {
  it('uses CSS pixels up to High and the device ratio (max 1.5) on Ultra', () => {
    expect(pixelRatioFor(PRESETS.low, 2)).toBeCloseTo(0.6);
    expect(pixelRatioFor(PRESETS.medium, 1)).toBeCloseTo(0.75);
    expect(pixelRatioFor(PRESETS.high, 2)).toBe(1);
    expect(pixelRatioFor(PRESETS.ultra, 2)).toBe(1.5);
    expect(pixelRatioFor(PRESETS.ultra, 1)).toBe(1);
    expect(pixelRatioFor(PRESETS.high, 0.5)).toBe(0.5);
  });
});

describe('AutoGraphics', () => {
  it('never chooses Ultra and steps High -> Medium -> Low', () => {
    expect(AUTO_ORDER).toEqual(['high', 'medium', 'low']);
    expect(AUTO_ORDER).not.toContain('ultra');
  });

  it('starts on High without a saved preset', () => {
    expect(new AutoGraphics(null).preset).toBe('high');
    expect(new AutoGraphics('ultra').preset).toBe('high');
  });

  it('starts at the saved autoSettled preset', () => {
    expect(new AutoGraphics('medium').preset).toBe('medium');
    expect(new AutoGraphics('low').preset).toBe('low');
  });

  it('steps down one preset after 2 s under 29 fps, then waits a 3 s cooldown', () => {
    const a = new AutoGraphics(null);
    expect(a.update(0, 20)).toBe(false);
    expect(a.update(1900, 20)).toBe(false);
    expect(a.update(2000, 20)).toBe(true);
    expect(a.preset).toBe('medium');
    a.update(2100, 20);
    expect(a.update(4900, 20)).toBe(false);
    expect(a.preset).toBe('medium');
  });

  it('holds at 29 fps and above', () => {
    const a = new AutoGraphics(null);
    for (let t = 0; t < 20_000; t += 100) expect(a.update(t, 29)).toBe(false);
    expect(a.preset).toBe('high');
  });

  it('never goes below Low and never steps up', () => {
    const a = new AutoGraphics(null);
    const seen: string[] = [];
    for (let t = 0; t < 60_000; t += 100) {
      a.update(t, t < 30_000 ? 5 : 60);
      if (seen[seen.length - 1] !== a.preset) seen.push(a.preset);
    }
    expect(seen).toEqual(['high', 'medium', 'low']);
  });

  it('interrupt() forgets a slow streak', () => {
    const a = new AutoGraphics(null);
    a.update(0, 20);
    a.update(1500, 20);
    a.interrupt();
    expect(a.update(2500, 20)).toBe(false);
    expect(a.preset).toBe('high');
  });
});

describe('recommendedPreset', () => {
  it('maps the speed test tiers 0..3 to High, Medium, Medium, Low', () => {
    expect([0, 1, 2, 3].map(recommendedPreset)).toEqual(['high', 'medium', 'medium', 'low']);
  });
  it('clamps out-of-range tiers', () => {
    expect(recommendedPreset(-1)).toBe('high');
    expect(recommendedPreset(9)).toBe('low');
  });
});

describe('tierSpec', () => {
  it('leaves the base preset alone at tier 0', () => {
    expect(tierSpec(PRESETS.high, TIERS[0])).toEqual(PRESETS.high);
  });
  it('lowers resolution, then rim and effects, then leaf counts, like the Step 0 tiers', () => {
    const t1 = tierSpec(PRESETS.high, TIERS[1]);
    expect(t1.resolution).toBeCloseTo(0.75);
    expect(t1.rim).toBe(true);
    const t2 = tierSpec(PRESETS.high, TIERS[2]);
    expect(t2.rim).toBe(false);
    expect(t2.effects).toBe(false);
    expect(t2.litter).toBe(PRESETS.high.litter);
    const t3 = tierSpec(PRESETS.high, TIERS[3]);
    expect(t3.resolution).toBeCloseTo(0.6);
    expect(t3.litter).toBe(PRESETS.high.litter / 2);
    expect(t3.detail).toBe(PRESETS.high.detail / 2);
    expect(t3.hero).toBe(PRESETS.high.hero / 2);
    expect(t3.clutter).toBe(0.5);
    expect(t3.id).toBe('high');
  });
});
```

In `tests/unit/quality.test.ts`, append at the end of the file:

Replace:

```ts
    expect(q.tier).toBe(0);
  });
});
```

with:

```ts
    expect(q.tier).toBe(0);
  });
});

describe('QualityController levels', () => {
  it('stops at levels - 1 when given fewer levels than TIERS', () => {
    const q = new QualityController(30, 2000, 3000, 2);
    for (let t = 0; t < 60_000; t += 100) q.update(t, 5);
    expect(q.tier).toBe(1);
  });
  it('with one level never changes', () => {
    const q = new QualityController(30, 2000, 3000, 1);
    for (let t = 0; t < 10_000; t += 100) expect(q.update(t, 5)).toBe(false);
    expect(q.tier).toBe(0);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/graphics.test.ts tests/unit/quality.test.ts`
Expected: FAIL. `graphics.test.ts` cannot resolve `../../src/render/graphics`; the two new `QualityController levels` tests fail (the tier reaches 3, not 1).

- [ ] **Step 3: Let QualityController stop at a number of levels**

In `src/render/quality.ts`:

Replace:

```ts
];

/** Steps quality down (never up, to avoid flicker) when fps stays under target. */
export class QualityController {
  tier = 0;
```

with:

```ts
];

/**
 * Steps quality down (never up, to avoid flicker) when fps stays under target. `levels` is how
 * many tiers it may use (0 .. levels - 1); the speed test uses all of TIERS.
 */
export class QualityController {
  tier = 0;
```

Replace:

```ts
    private readonly holdMs = 2000,
    private readonly cooldownMs = 3000,
  ) {}

```

with:

```ts
    private readonly holdMs = 2000,
    private readonly cooldownMs = 3000,
    private readonly levels = TIERS.length,
  ) {}

```

Replace:

```ts
    }
    if (this.belowSince === null) this.belowSince = nowMs;
    if (nowMs - this.belowSince >= this.holdMs && this.tier < TIERS.length - 1) {
      this.tier++;
      this.lastChange = nowMs;
```

with:

```ts
    }
    if (this.belowSince === null) this.belowSince = nowMs;
    if (nowMs - this.belowSince >= this.holdMs && this.tier < this.levels - 1) {
      this.tier++;
      this.lastChange = nowMs;
```

- [ ] **Step 4: Create the preset table and Auto**

Create `src/render/graphics.ts`:

```ts
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
  return Math.min(dpr, spec.maxDpr) * spec.resolution;
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
    return this.q.update(nowMs, fps);
  }

  interrupt(): void {
    this.q.interrupt();
  }
}

/** Speed-test tier (0..3) to the preset "Use recommended setting" saves. */
const TIER_PRESETS: readonly PresetId[] = ['high', 'medium', 'medium', 'low'];

export function recommendedPreset(tier: number): PresetId {
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
```

- [ ] **Step 5: Run the tests and see them pass**

Run: `npx vitest run tests/unit/graphics.test.ts tests/unit/quality.test.ts && npx tsc --noEmit`
Expected: PASS, 25 tests (17 + 8). Then `npx vitest run`: 23 files, 243 tests passed.

- [ ] **Step 6: Commit**

```bash
git add src/render/graphics.ts src/render/quality.ts tests/unit/graphics.test.ts tests/unit/quality.test.ts
git commit -m "feat(graphics): preset table, Auto and speed-test mapping

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Settings store

**Files:**
- Create: `src/save/settingsStore.ts`, `tests/unit/settingsStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/settingsStore.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  loadSettings, saveSettings, DEFAULT_SETTINGS, SETTINGS_KEY, type KeyValueStore,
} from '../../src/save/settingsStore';

function memory(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
  };
}

const throwing: KeyValueStore = {
  getItem: () => { throw new Error('SecurityError'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
};

describe('settings store', () => {
  it('uses the wormsim.settings key', () => {
    expect(SETTINGS_KEY).toBe('wormsim.settings');
  });

  it('defaults to Auto with nothing settled', () => {
    expect(DEFAULT_SETTINGS).toEqual({ version: 1, graphics: 'auto', autoSettled: null });
    expect(loadSettings(memory())).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips what it saves', () => {
    const store = memory();
    expect(saveSettings(store, { version: 1, graphics: 'ultra', autoSettled: 'medium' })).toBe(true);
    expect(JSON.parse(store.data[SETTINGS_KEY])).toEqual({ version: 1, graphics: 'ultra', autoSettled: 'medium' });
    expect(loadSettings(store)).toEqual({ version: 1, graphics: 'ultra', autoSettled: 'medium' });
  });

  it('falls back to defaults on corrupt JSON', () => {
    expect(loadSettings(memory({ [SETTINGS_KEY]: '{not json' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memory({ [SETTINGS_KEY]: 'null' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memory({ [SETTINGS_KEY]: '[1,2]' }))).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to defaults on a wrong version', () => {
    const raw = JSON.stringify({ version: 2, graphics: 'low', autoSettled: 'low' });
    expect(loadSettings(memory({ [SETTINGS_KEY]: raw }))).toEqual(DEFAULT_SETTINGS);
  });

  it('replaces unknown field values with their defaults', () => {
    const raw = JSON.stringify({ version: 1, graphics: 'extreme', autoSettled: 'ultra' });
    expect(loadSettings(memory({ [SETTINGS_KEY]: raw }))).toEqual(DEFAULT_SETTINGS);
    const raw2 = JSON.stringify({ version: 1, graphics: 'low', autoSettled: 42 });
    expect(loadSettings(memory({ [SETTINGS_KEY]: raw2 }))).toEqual({ version: 1, graphics: 'low', autoSettled: null });
  });

  it('survives storage that throws, on read and on write', () => {
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(throwing, { version: 1, graphics: 'low', autoSettled: null })).toBe(false);
    expect(saveSettings(null, { version: 1, graphics: 'low', autoSettled: null })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/unit/settingsStore.test.ts`
Expected: FAIL with "Cannot find module '../../src/save/settingsStore'".

- [ ] **Step 3: Implement**

Create `src/save/settingsStore.ts`:

```ts
import { isChoice, isPresetId, AUTO_ORDER, type GraphicsChoice, type PresetId } from '../render/graphics';

/**
 * Player settings, one localStorage key (spec 3.2). Every read and write is guarded: missing,
 * corrupt, wrong-version or unreadable data gives the defaults, and a failed write (private
 * mode, blocked storage, full quota) just means the settings last for this session only.
 * The full save system (sub-project 5) will absorb this key later.
 */
export const SETTINGS_KEY = 'wormsim.settings';

export interface Settings {
  version: 1;
  graphics: GraphicsChoice;
  /** The preset Auto last settled on (never Ultra), or null. */
  autoSettled: PresetId | null;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  version: 1, graphics: 'auto', autoSettled: null,
});

/** The two Storage methods we use, so tests can pass a fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** window.localStorage, or null where even touching it throws (sandboxed or blocked). */
export function browserStore(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSettings(store: KeyValueStore | null): Settings {
  const defaults: Settings = { ...DEFAULT_SETTINGS };
  if (!store) return defaults;
  try {
    const raw = store.getItem(SETTINGS_KEY);
    if (raw === null) return defaults;
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return defaults;
    const o = v as Record<string, unknown>;
    if (o.version !== 1) return defaults;
    return {
      version: 1,
      graphics: isChoice(o.graphics) ? o.graphics : defaults.graphics,
      autoSettled: isPresetId(o.autoSettled) && AUTO_ORDER.includes(o.autoSettled) ? o.autoSettled : null,
    };
  } catch {
    return defaults;
  }
}

/** Returns false when the settings could not be stored. */
export function saveSettings(store: KeyValueStore | null, s: Settings): boolean {
  if (!store) return false;
  try {
    store.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, graphics: s.graphics, autoSettled: s.autoSettled }));
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run tests/unit/settingsStore.test.ts && npx tsc --noEmit`
Expected: PASS, 7 tests. `npx vitest run`: 24 files, 250 tests.

- [ ] **Step 5: Commit**

```bash
git add src/save/settingsStore.ts tests/unit/settingsStore.test.ts
git commit -m "feat(save): guarded settings store for the graphics choice

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Screen state machine and URL parameters

**Files:**
- Create: `src/game/screens.ts`, `src/game/params.ts`, `tests/unit/screens.test.ts`, `tests/unit/params.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/screens.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { initialScreens, transition, type ScreenEvent, type ScreenState } from '../../src/game/screens';

const run = (s: ScreenState, ...events: ScreenEvent[]) => events.reduce(transition, s);
const start = initialScreens();

describe('screens', () => {
  it('opens on Start, or straight on the speed test when asked', () => {
    expect(start).toEqual({ screen: 'start', graphicsFrom: 'start', recommended: null, applied: false });
    expect(initialScreens(true).screen).toBe('speedTest');
  });

  it('start -> Crawl -> crawl', () => {
    expect(run(start, { type: 'crawl' }).screen).toBe('crawl');
  });

  it('crawl -> Esc/P/Pause -> pause -> Resume -> crawl', () => {
    const paused = run(start, { type: 'crawl' }, { type: 'pause' });
    expect(paused.screen).toBe('pause');
    expect(run(paused, { type: 'resume' }).screen).toBe('crawl');
  });

  it('pauses when the tab is hidden during crawl', () => {
    expect(run(start, { type: 'crawl' }, { type: 'hidden' }).screen).toBe('pause');
  });

  it('a hidden tab changes nothing outside crawl', () => {
    for (const s of [start, run(start, { type: 'speedTest' }), run(start, { type: 'graphics' })]) {
      expect(transition(s, { type: 'hidden' })).toBe(s);
    }
  });

  it('start -> Graphics -> graphics -> Back -> start', () => {
    const g = run(start, { type: 'graphics' });
    expect(g.screen).toBe('graphics');
    expect(g.graphicsFrom).toBe('start');
    expect(run(g, { type: 'back' }).screen).toBe('start');
  });

  it('pause -> Graphics -> graphics -> Back -> pause', () => {
    const g = run(start, { type: 'crawl' }, { type: 'pause' }, { type: 'graphics' });
    expect(g.screen).toBe('graphics');
    expect(g.graphicsFrom).toBe('pause');
    expect(run(g, { type: 'back' }).screen).toBe('pause');
  });

  it('pause -> Back to start -> start', () => {
    expect(run(start, { type: 'crawl' }, { type: 'pause' }, { type: 'toStart' }).screen).toBe('start');
  });

  it('start -> Speed test -> speedTest -> done -> results -> Back to start -> start', () => {
    const t = run(start, { type: 'speedTest' });
    expect(t.screen).toBe('speedTest');
    const r = run(t, { type: 'testDone', recommended: 'medium' });
    expect(r).toMatchObject({ screen: 'results', recommended: 'medium', applied: false });
    expect(run(r, { type: 'toStart' }).screen).toBe('start');
  });

  it('the speed test intro can go back to start', () => {
    expect(run(start, { type: 'speedTest' }, { type: 'toStart' }).screen).toBe('start');
  });

  it('Use recommended setting marks the result applied, once', () => {
    const r = run(start, { type: 'speedTest' }, { type: 'testDone', recommended: 'low' });
    const used = run(r, { type: 'useRecommended' });
    expect(used).toMatchObject({ screen: 'results', recommended: 'low', applied: true });
    expect(transition(used, { type: 'useRecommended' })).toBe(used);
  });

  it('Use recommended setting does nothing without a recommendation (a FAIL report)', () => {
    const r = run(start, { type: 'speedTest' }, { type: 'testDone', recommended: null });
    expect(transition(r, { type: 'useRecommended' })).toBe(r);
  });

  it('a new speed test forgets the previous recommendation', () => {
    const used = run(start, { type: 'speedTest' }, { type: 'testDone', recommended: 'low' }, { type: 'useRecommended' }, { type: 'toStart' });
    expect(run(used, { type: 'speedTest' })).toMatchObject({ recommended: null, applied: false });
  });

  it('ignores events that do not apply to the current screen (same object back)', () => {
    const cases: [ScreenState, ScreenEvent][] = [
      [start, { type: 'pause' }], [start, { type: 'resume' }], [start, { type: 'back' }],
      [start, { type: 'toStart' }], [start, { type: 'testDone', recommended: 'high' }],
      [run(start, { type: 'crawl' }), { type: 'graphics' }],
      [run(start, { type: 'crawl' }), { type: 'speedTest' }],
      [run(start, { type: 'speedTest' }), { type: 'crawl' }],
      [run(start, { type: 'graphics' }), { type: 'crawl' }],
    ];
    for (const [s, e] of cases) expect(transition(s, e)).toBe(s);
  });
});
```

Create `tests/unit/params.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseParams } from '../../src/game/params';

describe('parseParams', () => {
  it('defaults: no forced preset, no fps tag, not quick, Start screen', () => {
    expect(parseParams('')).toEqual({ preset: null, fps: false, quick: false, speedTest: false });
  });
  it('reads ?preset=, ?fps=1, ?quick=1 and ?speedtest=1', () => {
    expect(parseParams('?preset=ultra&fps=1&quick=1&speedtest=1')).toEqual({ preset: 'ultra', fps: true, quick: true, speedTest: true });
  });
  it('ignores an unknown preset (and Auto, which is not a preset)', () => {
    expect(parseParams('?preset=extreme').preset).toBeNull();
    expect(parseParams('?preset=auto').preset).toBeNull();
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/screens.test.ts tests/unit/params.test.ts`
Expected: FAIL, both modules missing.

- [ ] **Step 3: Implement the state machine**

Create `src/game/screens.ts`:

```ts
import type { PresetId } from '../render/graphics';

/**
 * The game's screens as a small pure state machine (spec 3.1). The DOM for each screen lives
 * in src/ui/; src/main.ts dispatches events here and draws whatever screen comes back.
 *
 *   start --Crawl--> crawl --Esc/P/Pause/tab hidden--> pause --Resume--> crawl
 *   start --Graphics--> graphics --Back--> (the screen it came from)
 *   pause --Graphics--> graphics
 *   pause --Back to start--> start
 *   start --Speed test--> speedTest --done--> results --Back to start--> start
 */
export type Screen = 'start' | 'crawl' | 'pause' | 'graphics' | 'speedTest' | 'results';

export type ScreenEvent =
  | { type: 'crawl' }
  | { type: 'pause' }
  | { type: 'hidden' }
  | { type: 'resume' }
  | { type: 'graphics' }
  | { type: 'back' }
  | { type: 'toStart' }
  | { type: 'speedTest' }
  | { type: 'testDone'; recommended: PresetId | null }
  | { type: 'useRecommended' };

export interface ScreenState {
  readonly screen: Screen;
  /** Where Graphics goes back to. */
  readonly graphicsFrom: 'start' | 'pause';
  /** The preset the last speed test recommends; null for a FAIL with no 3D (nothing to save). */
  readonly recommended: PresetId | null;
  /** "Use recommended setting" was pressed for this result. */
  readonly applied: boolean;
}

export function initialScreens(openSpeedTest = false): ScreenState {
  return { screen: openSpeedTest ? 'speedTest' : 'start', graphicsFrom: 'start', recommended: null, applied: false };
}

/** The next state, or `s` itself (same object) when the event does not apply. */
export function transition(s: ScreenState, e: ScreenEvent): ScreenState {
  switch (e.type) {
    case 'crawl':
      return s.screen === 'start' ? { ...s, screen: 'crawl' } : s;
    case 'pause':
    case 'hidden':
      return s.screen === 'crawl' ? { ...s, screen: 'pause' } : s;
    case 'resume':
      return s.screen === 'pause' ? { ...s, screen: 'crawl' } : s;
    case 'graphics':
      return s.screen === 'start' || s.screen === 'pause'
        ? { ...s, screen: 'graphics', graphicsFrom: s.screen }
        : s;
    case 'back':
      return s.screen === 'graphics' ? { ...s, screen: s.graphicsFrom } : s;
    case 'toStart':
      return s.screen === 'pause' || s.screen === 'results' || s.screen === 'speedTest'
        ? { ...s, screen: 'start' }
        : s;
    case 'speedTest':
      return s.screen === 'start' ? { ...s, screen: 'speedTest', recommended: null, applied: false } : s;
    case 'testDone':
      return s.screen === 'speedTest' ? { ...s, screen: 'results', recommended: e.recommended, applied: false } : s;
    case 'useRecommended':
      return s.screen === 'results' && s.recommended !== null && !s.applied ? { ...s, applied: true } : s;
  }
}
```

- [ ] **Step 4: Implement the URL parameters**

Create `src/game/params.ts`:

```ts
import { isPresetId, type PresetId } from '../render/graphics';

export interface GameParams {
  /** `?preset=low|medium|high|ultra`: forces a preset for this session (benchmarks). Not saved. */
  preset: PresetId | null;
  /** `?fps=1`: show the fps tag while crawling. */
  fps: boolean;
  /** `?quick=1`: a short speed test (automated tests). */
  quick: boolean;
  /** `?speedtest=1`: open straight on the speed test screen (Chromebook checks, benchmarks). */
  speedTest: boolean;
}

export function parseParams(search: string): GameParams {
  const p = new URLSearchParams(search);
  const preset = p.get('preset');
  return {
    preset: isPresetId(preset) ? preset : null,
    fps: p.get('fps') === '1',
    quick: p.get('quick') === '1',
    speedTest: p.get('speedtest') === '1',
  };
}
```

- [ ] **Step 5: Run them and see them pass**

Run: `npx vitest run tests/unit/screens.test.ts tests/unit/params.test.ts && npx tsc --noEmit`
Expected: PASS, 17 tests (14 + 3). `npx vitest run`: 26 files, 267 tests.

- [ ] **Step 6: Commit**

```bash
git add src/game/screens.ts src/game/params.ts tests/unit/screens.test.ts tests/unit/params.test.ts
git commit -m "feat(game): screen state machine and URL parameters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Graphics control (forced preset, menu choice, Auto)

**Files:**
- Create: `src/game/graphicsControl.ts`, `tests/unit/graphicsControl.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/graphicsControl.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GraphicsControl } from '../../src/game/graphicsControl';
import { SETTINGS_KEY, type KeyValueStore } from '../../src/save/settingsStore';

function memory(initial?: object): KeyValueStore & { data: Record<string, string> } {
  const data: Record<string, string> = initial ? { [SETTINGS_KEY]: JSON.stringify(initial) } : {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
}
const saved = (s: { data: Record<string, string> }) => JSON.parse(s.data[SETTINGS_KEY]);

/** Feeds `fps` every 100 ms from t0 for `ms`. Returns the time reached. */
function slow(g: GraphicsControl, t0: number, ms: number, fps: number): number {
  let t = t0;
  for (; t <= t0 + ms; t += 100) g.updateAuto(t, fps);
  return t;
}

describe('GraphicsControl', () => {
  it('starts on Auto at High with fresh storage', () => {
    const g = new GraphicsControl(memory(), null);
    expect(g.choice).toBe('auto');
    expect(g.active).toBe('high');
  });

  it('Auto starts from the saved autoSettled preset', () => {
    const g = new GraphicsControl(memory({ version: 1, graphics: 'auto', autoSettled: 'low' }), null);
    expect(g.active).toBe('low');
  });

  it('picking a preset turns Auto off and saves it', () => {
    const store = memory();
    const g = new GraphicsControl(store, null);
    g.choose('ultra');
    expect(g.choice).toBe('ultra');
    expect(g.active).toBe('ultra');
    expect(saved(store)).toEqual({ version: 1, graphics: 'ultra', autoSettled: null });
    expect(slow(g, 0, 10_000, 5)).toBeGreaterThan(0);
    expect(g.active).toBe('ultra');
  });

  it('Auto steps down in crawl and saves where it settled', () => {
    const store = memory();
    const g = new GraphicsControl(store, null);
    let changed = false;
    for (let t = 0; t <= 2000; t += 100) changed = g.updateAuto(t, 20) || changed;
    expect(changed).toBe(true);
    expect(g.active).toBe('medium');
    expect(saved(store).autoSettled).toBe('medium');
  });

  it('picking Auto again starts from autoSettled', () => {
    const store = memory({ version: 1, graphics: 'high', autoSettled: 'medium' });
    const g = new GraphicsControl(store, null);
    expect(g.active).toBe('high');
    g.choose('auto');
    expect(g.active).toBe('medium');
    expect(saved(store).graphics).toBe('auto');
  });

  it('a forced ?preset= wins, is never saved, and Auto stays still', () => {
    const store = memory({ version: 1, graphics: 'low', autoSettled: null });
    const g = new GraphicsControl(store, 'ultra');
    expect(g.choice).toBe('ultra');
    expect(g.active).toBe('ultra');
    slow(g, 0, 10_000, 5);
    expect(g.active).toBe('ultra');
    expect(saved(store).graphics).toBe('low');
  });

  it('a menu choice ends the forced preset', () => {
    const g = new GraphicsControl(memory(), 'ultra');
    g.choose('medium');
    expect(g.active).toBe('medium');
  });

  it('useRecommended saves the preset and turns Auto off', () => {
    const store = memory();
    const g = new GraphicsControl(store, null);
    g.useRecommended('low');
    expect(g.choice).toBe('low');
    expect(saved(store)).toEqual({ version: 1, graphics: 'low', autoSettled: null });
  });

  it('keeps working for the session when storage throws', () => {
    const broken: KeyValueStore = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    const g = new GraphicsControl(broken, null);
    g.choose('medium');
    expect(g.active).toBe('medium');
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/unit/graphicsControl.test.ts`
Expected: FAIL with "Cannot find module '../../src/game/graphicsControl'".

- [ ] **Step 3: Implement**

Create `src/game/graphicsControl.ts`:

```ts
import { AutoGraphics, type GraphicsChoice, type PresetId } from '../render/graphics';
import { loadSettings, saveSettings, type KeyValueStore, type Settings } from '../save/settingsStore';

/**
 * Which preset is active: a forced `?preset=` (benchmarks, never saved), the player's menu
 * choice, or Auto. Saves every change. Pure apart from the injected store.
 */
export class GraphicsControl {
  private settings: Settings;
  private auto: AutoGraphics;

  constructor(private readonly store: KeyValueStore | null, private forced: PresetId | null) {
    this.settings = loadSettings(store);
    this.auto = new AutoGraphics(this.settings.autoSettled);
  }

  /** What the Graphics menu shows as selected. */
  get choice(): GraphicsChoice {
    return this.forced ?? this.settings.graphics;
  }

  /** The preset to render with now. */
  get active(): PresetId {
    if (this.forced) return this.forced;
    return this.settings.graphics === 'auto' ? this.auto.preset : this.settings.graphics;
  }

  /** A menu pick. Picking a preset turns Auto off; picking Auto restarts it from autoSettled. */
  choose(choice: GraphicsChoice): void {
    this.forced = null;
    this.settings = { ...this.settings, graphics: choice };
    if (choice === 'auto') this.auto = new AutoGraphics(this.settings.autoSettled);
    saveSettings(this.store, this.settings);
  }

  /** The speed test's "Use recommended setting": saves the preset and turns Auto off. */
  useRecommended(preset: PresetId): void {
    this.choose(preset);
  }

  /** Call every rendered frame while crawling. True when Auto stepped down (re-apply the preset). */
  updateAuto(nowMs: number, fps: number): boolean {
    if (this.forced || this.settings.graphics !== 'auto') return false;
    if (!this.auto.update(nowMs, fps)) return false;
    this.settings = { ...this.settings, autoSettled: this.auto.preset };
    saveSettings(this.store, this.settings);
    return true;
  }

  /** Forget a slow streak (tab hidden, pause, a screen change). */
  interruptAuto(): void {
    this.auto.interrupt();
  }
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run tests/unit/graphicsControl.test.ts && npx tsc --noEmit`
Expected: PASS, 9 tests. `npx vitest run`: 27 files, 276 tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/graphicsControl.ts tests/unit/graphicsControl.test.ts
git commit -m "feat(game): graphics control with forced preset, menu choice and Auto

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Move the speed test to src/perf and add its runner

The Step 0 page keeps working through this task: only imports move. `parseParams` (and the `?leaves=` option) is replaced by `src/game/params.ts`.

**Files:**
- Move: `src/spike/speedTest.ts` → `src/perf/speedTest.ts`, `src/spike/drive.ts` → `src/game/drive.ts`
- Create: `src/perf/speedTestRunner.ts`, `src/perf/device.ts`, `tests/unit/speedTestRunner.test.ts`
- Modify: `src/spike/main.ts`, `src/surface/propPlacement.ts`, `tests/unit/speedTest.test.ts`, `tests/unit/propPlacement.test.ts`

- [ ] **Step 1: Move the files**

```bash
mkdir -p src/perf
git mv src/spike/speedTest.ts src/perf/speedTest.ts
git mv src/spike/drive.ts src/game/drive.ts
```

- [ ] **Step 2: Remove parseParams from the speed test**

In `src/perf/speedTest.ts`:

Replace:

```ts
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
```

with:

```ts
import { summarize, type FpsSummary } from '../render/fps';
import { TIERS } from '../render/quality';

export interface PhaseSpec {
```

In `tests/unit/speedTest.test.ts`:

Replace:

```ts
import { describe, it, expect } from 'vitest';
import {
  parseParams, SpeedTest, PHASES, MAX_RESTARTS, quickPhases, verdict, formatResults, formatNoWebGLResults, formatContextLostResults, type DeviceInfo,
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
```

with:

```ts
import { describe, it, expect } from 'vitest';
import {
  SpeedTest, PHASES, MAX_RESTARTS, quickPhases, verdict, formatResults, formatNoWebGLResults, formatContextLostResults, type DeviceInfo,
} from '../../src/perf/speedTest';

describe('PHASES', () => {
```

- [ ] **Step 3: Point the imports at the new places**

In `src/surface/propPlacement.ts`:

Replace:

```ts
import { PLAY_HALF } from './terrain';
import { treeSites } from './treeSites';
import { AUTO_DRIVE_MOVE, LOCOMOTION } from '../spike/drive';

/**
```

with:

```ts
import { PLAY_HALF } from './terrain';
import { treeSites } from './treeSites';
import { AUTO_DRIVE_MOVE, LOCOMOTION } from '../game/drive';

/**
```

In `tests/unit/propPlacement.test.ts`:

Replace:

```ts
import { stepWorm, type WormMotion } from '../../src/worm/locomotion';
import { PLAY_HALF } from '../../src/surface/terrain';
import { AUTO_DRIVE_MOVE, LOCOMOTION } from '../../src/spike/drive';

/** The speed test's auto-drive: the exact move and locomotion options src/spike/main.ts uses. */
function autoDrivePath(seconds: number): { x: number; z: number }[] {
  let m: WormMotion = { head: { x: 0, y: 0, z: 0 }, heading: 0 };
```

with:

```ts
import { stepWorm, type WormMotion } from '../../src/worm/locomotion';
import { PLAY_HALF } from '../../src/surface/terrain';
import { AUTO_DRIVE_MOVE, LOCOMOTION } from '../../src/game/drive';

/** The speed test's auto-drive: the exact move and locomotion options the game uses. */
function autoDrivePath(seconds: number): { x: number; z: number }[] {
  let m: WormMotion = { head: { x: 0, y: 0, z: 0 }, heading: 0 };
```

In `src/spike/main.ts`:

Replace:

```ts
import { setRimLight, setResolution, setTime } from '../render/paintedMaterial';
import { buildScene } from './scene';
import { AUTO_DRIVE_MOVE, LOCOMOTION } from './drive';
import { terrainHeight } from '../surface/terrain';
import { createBody, followHead } from '../worm/body';
```

with:

```ts
import { setRimLight, setResolution, setTime } from '../render/paintedMaterial';
import { buildScene } from './scene';
import { AUTO_DRIVE_MOVE, LOCOMOTION } from '../game/drive';
import { parseParams } from '../game/params';
import { terrainHeight } from '../surface/terrain';
import { createBody, followHead } from '../worm/body';
```

Replace:

```ts
import { keysToCommands, mergeCommands, NO_COMMANDS, type Commands } from '../input/commands';
import {
  SpeedTest, PHASES, quickPhases, parseParams, formatResults, formatNoWebGLResults,
  formatContextLostResults, verdict,
  type DeviceInfo, type PhaseSpec,
} from './speedTest';
import { createUi } from './ui';

const WORM_SEGMENTS = 16;
const SPACING = 0.22;
const CAM_DISTANCE = 2.6;
```

with:

```ts
import { keysToCommands, mergeCommands, NO_COMMANDS, type Commands } from '../input/commands';
import {
  SpeedTest, PHASES, quickPhases, formatResults, formatNoWebGLResults,
  formatContextLostResults, verdict,
  type DeviceInfo, type PhaseSpec,
} from '../perf/speedTest';
import { createUi } from './ui';

const WORM_SEGMENTS = 16;
/** Step 0's leaf count; the presets replace it when the game shell lands. */
const LEAVES = 2000;
const SPACING = 0.22;
const CAM_DISTANCE = 2.6;
```

Replace:

```ts
  // nothing it normally looks at comes within 0.2 of the lens.
  const camera = new THREE.PerspectiveCamera(60, 1, 0.2, 120);
  const world = buildScene(params.leaves, WORM_SEGMENTS);

  const keyboard = new KeyboardInput();
```

with:

```ts
  // nothing it normally looks at comes within 0.2 of the lens.
  const camera = new THREE.PerspectiveCamera(60, 1, 0.2, 120);
  const world = buildScene(LEAVES, WORM_SEGMENTS);

  const keyboard = new KeyboardInput();
```

Replace:

```ts
    const { full, auto } = test!.results;
    finished = {
      text: formatResults(full, auto, quality.tier, params.leaves, deviceInfo(), test!.restarts),
      pass: verdict(auto) === 'PASS',
    };
```

with:

```ts
    const { full, auto } = test!.results;
    finished = {
      text: formatResults(full, auto, quality.tier, LEAVES, deviceInfo(), test!.restarts),
      pass: verdict(auto) === 'PASS',
    };
```

- [ ] **Step 4: Check nothing broke**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS, 27 files, 274 tests (the two `parseParams` tests moved to `params.test.ts` in Task 3).

- [ ] **Step 5: Write the failing runner test**

Create `tests/unit/speedTestRunner.test.ts`:

```ts
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
```

- [ ] **Step 6: Run it and see it fail**

Run: `npx vitest run tests/unit/speedTestRunner.test.ts`
Expected: FAIL with "Cannot find module '../../src/perf/speedTestRunner'".

- [ ] **Step 7: Implement the runner**

Create `src/perf/speedTestRunner.ts`:

```ts
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
```

- [ ] **Step 8: Add the device report helpers**

Create `src/perf/device.ts`:

```ts
import * as THREE from 'three';
import type { DeviceInfo } from './speedTest';

/** Everything in the speed-test report that does not need the GPU. */
export function basicDeviceInfo(): Omit<DeviceInfo, 'gpu'> {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    cores: navigator.hardwareConcurrency ?? 'unknown',
    memoryGb: nav.deviceMemory ?? 'unknown',
    screen: `${screen.width}x${screen.height}`,
    pixelRatio: window.devicePixelRatio,
    userAgent: navigator.userAgent,
  };
}

const size = new THREE.Vector2();

/** The full report header: the GPU name (when the browser shares it) and the drawing-buffer size. */
export function deviceInfo(renderer: THREE.WebGLRenderer): DeviceInfo {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  renderer.getDrawingBufferSize(size);
  return {
    renderSize: `${size.x}x${size.y}`,
    gpu: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown',
    ...basicDeviceInfo(),
  };
}
```

- [ ] **Step 9: Run and see it pass**

Run: `npx vitest run tests/unit/speedTestRunner.test.ts && npx tsc --noEmit && npx vitest run`
Expected: PASS, 4 tests; total 28 files, 278 tests.

- [ ] **Step 10: Commit**

```bash
git add src/perf src/game/drive.ts src/spike/main.ts src/surface/propPlacement.ts tests/unit/speedTest.test.ts tests/unit/propPlacement.test.ts tests/unit/speedTestRunner.test.ts
git commit -m "refactor(perf): move the speed test to src/perf and add its runner

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Shell UI components

DOM-only modules, checked by the type checker here and by the browser tests in Tasks 7 and 19. The Step 0 page keeps its own CSS until Task 7 deletes it.

**Files:**
- Move: `src/spike/icons.ts` → `src/ui/icons.ts`
- Create: `src/ui/dom.ts`, `src/ui/shell.ts`, `src/ui/menus.ts`, `src/ui/graphicsMenu.ts`, `src/ui/speedTestUi.ts`, `src/ui/parchment.css`, `src/ui/hud.css`
- Modify: `src/spike/ui.ts`

- [ ] **Step 1: Move the icons and add the new ones**

```bash
mkdir -p src/ui
git mv src/spike/icons.ts src/ui/icons.ts
```

In `src/ui/icons.ts`:

Replace:

```ts
/**
 * Small decorative inline SVG icons for the speed-test UI. Every icon is aria-hidden: the words
 * next to it carry the meaning. The markup is static (no user data), so innerHTML is safe here.
 */
```

with:

```ts
/**
 * Small decorative inline SVG icons for the menus and the speed test. Every icon is aria-hidden: the words
 * next to it carry the meaning. The markup is static (no user data), so innerHTML is safe here.
 */
```

Replace:

```ts
  drive: `<svg ${SVG} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l4 5h-8zM12 22l-4-5h8zM2 12l5-4v8zM22 12l-5 4V8z"/>
    <circle cx="12" cy="12" r="2.6"/></svg>`,
  /** Back arrow for returning to the results. */
  back: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
      stroke-linecap="round" stroke-linejoin="round"><path d="M10 5l-7 7 7 7M3 12h18"/></svg>`,
} as const;

```

with:

```ts
  drive: `<svg ${SVG} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l4 5h-8zM12 22l-4-5h8zM2 12l5-4v8zM22 12l-5 4V8z"/>
    <circle cx="12" cy="12" r="2.6"/></svg>`,
  /** Back arrow. */
  back: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
      stroke-linecap="round" stroke-linejoin="round"><path d="M10 5l-7 7 7 7M3 12h18"/></svg>`,
  /** Two bars: Pause. */
  pause: `<svg ${SVG} viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="5" height="16" rx="1.5"/>
    <rect x="14" y="4" width="5" height="16" rx="1.5"/></svg>`,
  /** Three sliders: Graphics. */
  sliders: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
      stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2.4" fill="currentColor"/>
    <circle cx="15" cy="12" r="2.4" fill="currentColor"/><circle cx="7" cy="18" r="2.4" fill="currentColor"/></svg>`,
  /** A speedometer: Speed test. */
  gauge: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
      stroke-linecap="round"><path d="M3.5 17a9 9 0 1 1 17 0"/><path d="M12 15l4.5-5.5"/>
    <circle cx="12" cy="15" r="1.8" fill="currentColor"/></svg>`,
  /** A little house: Back to start. */
  home: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
      stroke-linejoin="round"><path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/></svg>`,
  /** A tick: a saved setting. */
  check: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
      stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5 10-11"/></svg>`,
} as const;

```

In `src/spike/ui.ts`:

Replace:

```ts
import { icon, type IconName } from './icons';

export interface SpikeUi {
```

with:

```ts
import { icon, type IconName } from '../ui/icons';

export interface SpikeUi {
```

- [ ] **Step 2: Create the DOM helpers**

Create `src/ui/dom.ts`:

```ts
import { icon, type IconName } from './icons';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, text = '', className = '',
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.textContent = text;
  if (className) e.className = className;
  return e;
}

export interface Button { el: HTMLButtonElement; setLabel(text: string): void }

/** A button with a decorative icon. The accessible name is exactly `label`. */
export function button(
  label: string, iconName: IconName, variant: 'primary' | 'secondary', onClick: () => void,
): Button {
  const b = el('button', '', `btn btn-${variant}`);
  b.type = 'button';
  const text = el('span', label, 'btn-label');
  b.append(icon(iconName, 'btn-icon'), text);
  b.addEventListener('click', onClick);
  return { el: b, setLabel: (t) => { text.textContent = t; } };
}

export function leafList(items: string[]): HTMLUListElement {
  const ul = el('ul', '', 'leaf-list');
  for (const t of items) ul.appendChild(el('li', t));
  return ul;
}

/** The title-card heading: leaf seal, game title and a small eyebrow line. */
export function cardHead(eyebrow: string): HTMLDivElement {
  const titles = el('div', '', 'titles');
  titles.append(el('h1', 'Worm Simulator', 'title'), el('p', eyebrow, 'eyebrow'));
  const head = el('div', '', 'card-head');
  head.append(icon('leaf', 'seal'), titles);
  return head;
}

/** A vertical stack of menu buttons. */
export function menu(...buttons: Button[]): HTMLDivElement {
  const m = el('div', '', 'menu');
  m.append(...buttons.map((b) => b.el));
  return m;
}
```

- [ ] **Step 3: Create the shell (card, fps tag, Pause button)**

Create `src/ui/shell.ts`:

```ts
import { el, button } from './dom';

/** Which card is showing. CSS places the card and shows the joystick and Pause button from it. */
export type UiState =
  | 'start' | 'crawl' | 'pause' | 'graphics' | 'speedTest' | 'running' | 'results' | 'lost';

export interface Shell {
  readonly root: HTMLElement;
  /** The one aria-live card every screen draws into. */
  readonly panel: HTMLDivElement;
  /** Replaces the card's content. `label` names the region for screen readers. */
  show(state: UiState, label: string, children: HTMLElement[]): void;
  /** Updates the fps tag (at most 4 times a second). Shown with ?fps=1, and always mid-test. */
  setFps(fps: number, detail: string): void;
}

export function createShell(root: HTMLElement, showFps: boolean, onPause: () => void): Shell {
  const panel = el('div', '', 'panel');
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-live', 'polite');
  // Focusable by script only, so focus has somewhere sensible to land while crawling.
  panel.tabIndex = -1;
  const fpsTag = el('div', '', 'fps');
  const pause = button('Pause', 'pause', 'secondary', onPause);
  pause.el.classList.add('pause-btn');
  root.append(panel, fpsTag, pause.el);
  let lastFps = 0;

  return {
    root,
    panel,
    show(state, label, children) {
      root.dataset.ui = state;
      panel.dataset.state = state;
      panel.setAttribute('aria-label', label);
      panel.hidden = false;
      panel.replaceChildren(...children);
    },
    setFps(fps, detail) {
      const visible = showFps || root.dataset.ui === 'running';
      if (!visible) {
        if (fpsTag.textContent) fpsTag.textContent = '';
        return;
      }
      const now = performance.now();
      if (now - lastFps < 250) return;
      lastFps = now;
      fpsTag.textContent = `${Math.round(fps)} fps, ${detail}`;
    },
  };
}
```

- [ ] **Step 4: Create the Start, Crawl, Pause and "graphics stopped" cards**

Create `src/ui/menus.ts`:

```ts
import { el, button, cardHead, menu } from './dom';
import { icon } from './icons';
import type { Shell } from './shell';

export interface StartActions { onCrawl(): void; onGraphics(): void; onSpeedTest(): void }

/** Start: the parchment title card over the live forest. */
export function showStart(shell: Shell, a: StartActions): void {
  const crawl = button('Crawl', 'play', 'primary', a.onCrawl);
  shell.show('start', 'Start', [
    cardHead('A forest floor in fall'),
    el('p', 'You are an earthworm under the leaves of a northern forest.', 'lead'),
    menu(crawl, button('Graphics', 'sliders', 'secondary', a.onGraphics),
      button('Speed test', 'gauge', 'secondary', a.onSpeedTest)),
  ]);
  crawl.el.focus();
}

/** Crawl: a small hint card; focus rests on it so Space and arrows press no button. */
export function showCrawl(shell: Shell): void {
  const hint = el('p', '', 'hint');
  hint.append(
    icon('drive', 'hint-icon'),
    el('span', 'Crawl with the arrow keys, W A S D, or the joystick. Press Esc or P to pause.'),
  );
  shell.show('crawl', 'Crawling', [hint]);
  shell.panel.focus({ preventScroll: true });
}

export interface PauseActions { onResume(): void; onGraphics(): void; onStart(): void }

export function showPause(shell: Shell, a: PauseActions): void {
  const resume = button('Resume', 'play', 'primary', a.onResume);
  shell.show('pause', 'Paused', [
    el('h1', 'Paused', 'screen-title'),
    menu(resume, button('Graphics', 'sliders', 'secondary', a.onGraphics),
      button('Back to start', 'home', 'secondary', a.onStart)),
  ]);
  resume.el.focus();
}

/** The graphics context was lost outside the speed test: the only way on is a reload. */
export function showLost(shell: Shell): void {
  const reload = button('Reload the page', 'back', 'primary', () => location.reload());
  shell.show('lost', 'Graphics stopped', [
    el('h1', 'The graphics stopped', 'screen-title'),
    el('p', 'The computer reset its 3D graphics. Reload the page to keep playing.', 'lead'),
    menu(reload),
  ]);
  reload.el.focus();
}
```

- [ ] **Step 5: Create the Graphics screen**

Create `src/ui/graphicsMenu.ts`:

```ts
import { el, button, menu } from './dom';
import { CHOICES, CHOICE_LABELS, CHOICE_DESCRIPTIONS, type GraphicsChoice } from '../render/graphics';
import type { Shell } from './shell';

/**
 * The Graphics screen: five real radio buttons (Auto, Low, Medium, High, Ultra), each with a
 * one-line description. A change applies at once, live, and is saved by the caller.
 */
export function showGraphics(
  shell: Shell, current: GraphicsChoice, onChoose: (c: GraphicsChoice) => void, onBack: () => void,
): void {
  const set = el('fieldset', '', 'choices');
  set.append(el('legend', 'Graphics', 'screen-title'));
  let checked: HTMLInputElement | null = null;
  for (const c of CHOICES) {
    const id = `graphics-${c}`;
    const input = el('input');
    input.type = 'radio';
    input.name = 'graphics';
    input.id = id;
    input.value = c;
    input.checked = c === current;
    input.setAttribute('aria-describedby', `${id}-desc`);
    input.addEventListener('change', () => { if (input.checked) onChoose(c); });
    if (input.checked) checked = input;
    const label = el('label', '', 'choice');
    label.htmlFor = id;
    const words = el('span', '', 'choice-words');
    const desc = el('span', CHOICE_DESCRIPTIONS[c], 'choice-desc');
    desc.id = `${id}-desc`;
    words.append(el('span', CHOICE_LABELS[c], 'choice-name'), desc);
    label.append(input, words);
    set.append(label);
  }
  const back = button('Back', 'back', 'secondary', onBack);
  shell.show('graphics', 'Graphics', [set, menu(back)]);
  (checked ?? back.el).focus();
}
```

- [ ] **Step 6: Create the speed-test cards**

Create `src/ui/speedTestUi.ts`:

```ts
import { el, button, cardHead, leafList, menu } from './dom';
import { icon } from './icons';
import { CHOICE_LABELS, type PresetId } from '../render/graphics';
import type { Shell } from './shell';

/** The Step 0 speed-test card, plus a way back to the start. */
export function showTestIntro(shell: Shell, onStart: () => void, onBack: () => void): void {
  const start = button('Start speed test', 'play', 'primary', onStart);
  shell.show('speedTest', 'Speed test', [
    cardHead('Chromebook speed test'),
    el('p', 'This checks if the 3D forest runs smoothly on this computer.', 'lead'),
    leafList(['It takes about 30 seconds.', 'Please do not touch anything while it runs.']),
    menu(start, button('Back to start', 'home', 'secondary', onBack)),
  ]);
  start.el.focus();
}

/** step/steps (1-based) drive the small progress pips. */
export function showRunning(shell: Shell, label: string, step: number, steps: number): void {
  const p = el('p', label, 'running-label');
  p.dataset.testid = 'running';
  // Decorative: the label already says "Test 1 of 2".
  const pips = el('div', '', 'pips');
  pips.setAttribute('aria-hidden', 'true');
  for (let i = 1; i <= steps; i++) {
    pips.appendChild(el('span', '', i < step ? 'pip done' : i === step ? 'pip now' : 'pip'));
  }
  shell.show('running', 'Speed test', [
    el('p', 'Speed test running', 'eyebrow'), p, pips, el('p', 'Please wait. Hands off!', 'wait'),
  ]);
}

export interface ResultOptions {
  /** Replaces the default sentence under PASS or FAIL. */
  summary?: string;
  /** The preset to offer with "Use recommended setting"; null or absent hides it. */
  recommended?: PresetId | null;
  /** The recommendation was already saved: say so instead of offering it. */
  applied?: boolean;
  onUseRecommended?: () => void;
  /** "Back to start"; absent when there is no 3D to go back to. */
  onBack?: () => void;
}

export function showResult(shell: Shell, text: string, pass: boolean, o: ResultOptions = {}): void {
  const verdict = el('div', '', `verdict ${pass ? 'pass' : 'fail'}`);
  const words = el('div', '', 'verdict-words');
  words.append(
    el('h1', pass ? 'PASS' : 'FAIL', 'verdict-title'),
    el('p', o.summary ?? (pass
      ? 'This computer runs the forest smoothly.'
      : 'This computer had trouble keeping up. Please share these results with your teacher.'),
    'verdict-note'),
  );
  verdict.append(icon(pass ? 'pass' : 'fail', 'verdict-icon'), words);

  const pre = el('pre', text, 'report');
  pre.dataset.testid = 'result';
  // Keyboard users can scroll the report when it is taller than the card.
  pre.tabIndex = 0;
  pre.setAttribute('role', 'region');
  pre.setAttribute('aria-label', 'Full results');
  // Keep arrow keys and Space here: the browser scrolls the report and the worm stays put.
  pre.addEventListener('keydown', (e) => e.stopPropagation());

  const copy = button('Copy results', 'copy', 'primary', async () => {
    try {
      await navigator.clipboard.writeText(text);
      copy.setLabel('Copied!');
    } catch {
      const range = document.createRange();
      range.selectNodeContents(pre);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(range);
      copy.setLabel('Text selected. Press Ctrl + C.');
    }
  });
  const actions = el('div', '', 'actions');
  actions.append(copy.el);
  const children: HTMLElement[] = [verdict, pre];
  if (o.recommended && o.applied) {
    const saved = el('p', '', 'saved');
    saved.append(icon('check', 'saved-icon'),
      el('span', `Saved: ${CHOICE_LABELS[o.recommended]} graphics.`));
    children.push(saved);
  } else if (o.recommended && o.onUseRecommended) {
    actions.append(button(`Use recommended setting (${CHOICE_LABELS[o.recommended]})`, 'check', 'secondary',
      o.onUseRecommended).el);
  }
  let back: HTMLButtonElement | null = null;
  if (o.onBack) {
    back = button('Back to start', 'home', 'secondary', o.onBack).el;
    actions.append(back);
  }
  children.push(actions);
  shell.show('results', 'Speed test results', children);
  // After saving, the button that was pressed is gone: land on Back to start instead.
  (o.applied && back ? back : copy.el).focus();
}
```

- [ ] **Step 7: Create the styles**

Create `src/ui/parchment.css`:

```css
/* Menus and the speed test in the "painted naturalist" style: warm parchment cards with a
   hand-drawn edge. Accessibility: body text >= 18px, dark ink on light parchment (>= 7:1),
   4px focus rings, targets >= 48px tall, no flashing, all motion off under reduced motion. */
:root {
  --ink: #2b1a0c;
  --ink-soft: #4a2f16;
  --accent: #66290c;
  --bark: #5a3818;
  --bark-dark: #3d240c;
  --parchment: #f8eed6;
  --parchment-hi: #fffaea;
  --parchment-lo: #efdfbd;
  --moss: #4d7a2c;
  --focus: #0f2a5e;
  --edge: clamp(16px, 3vw, 40px);
  --edge-y: clamp(16px, 4vh, 40px);
  --font-body: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif;
  --font-display: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", "Noto Serif",
    Georgia, "Times New Roman", serif;
  /* Faint paper grain, painted once (a static SVG noise tile). */
  --grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .45 0 0 0 0 .28 0 0 0 0 .1 0 0 0 .09 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E");
  /* A slightly uneven, hand-cut corner. */
  --card-radius: 22px 30px 24px 32px / 30px 22px 32px 24px;
}

html, body {
  margin: 0; height: 100%; overflow: hidden; background: #f3c98b;
  font-family: var(--font-body); color: var(--ink);
}
canvas { display: block; }

/* ---------- Card ---------- */
.panel {
  position: fixed; z-index: 2; box-sizing: border-box;
  max-height: calc(100dvh - 32px); overflow: auto;
  padding: 24px 28px 26px;
  color: var(--ink); font-size: 20px; line-height: 1.4;
  background:
    radial-gradient(120% 70% at 0% 0%, var(--parchment-hi) 0%, rgba(255, 250, 234, 0) 60%),
    radial-gradient(90% 60% at 100% 100%, var(--parchment-lo) 0%, rgba(239, 223, 189, 0) 70%),
    radial-gradient(40% 30% at 85% 12%, rgba(232, 200, 140, 0.35) 0%, rgba(232, 200, 140, 0) 100%),
    var(--grain),
    var(--parchment);
  border: 3px solid var(--bark);
  border-radius: var(--card-radius);
  box-shadow:
    inset 0 2px 0 rgba(255, 255, 255, 0.6),
    inset 0 -10px 24px -14px rgba(122, 72, 24, 0.35),
    0 0 0 1px rgba(255, 238, 200, 0.5),
    0 4px 10px rgba(30, 14, 2, 0.3),
    0 22px 44px -10px rgba(30, 14, 2, 0.55);
}
/* Inner hairline, like the frame of a field-guide plate. */
.panel::before {
  content: ''; position: absolute; inset: 7px; pointer-events: none;
  border: 1.5px solid rgba(122, 72, 24, 0.3); border-radius: var(--card-radius);
}
.panel[hidden] { display: none; }
.panel:focus { outline: none; }
.panel p, .panel h1, .panel ul { margin: 0; }

/* Title-card screens sit bottom-left, clear of the worm. */
.panel[data-state="start"], .panel[data-state="speedTest"], .panel[data-state="pause"],
.panel[data-state="graphics"], .panel[data-state="lost"] {
  left: var(--edge); bottom: var(--edge-y); width: min(540px, calc(100vw - 32px));
  max-height: calc(100dvh - var(--edge-y) - 16px);
}
.panel[data-state="graphics"] { width: min(620px, calc(100vw - 32px)); }
/* Small top-left cards while the scene is the point. */
.panel[data-state="running"],
.panel[data-state="crawl"] { left: var(--edge); top: 16px; width: min(400px, calc(100vw - 32px)); padding: 18px 24px 20px; }
.panel[data-state="crawl"] { width: min(440px, calc(100vw - 140px)); }
.panel[data-state="results"] {
  left: var(--edge); bottom: var(--edge-y); width: min(700px, calc(100vw - 32px));
  /* Top stays below the fps tag, which it would otherwise cover on narrow screens. */
  max-height: calc(100dvh - var(--edge-y) - 64px);
  display: flex; flex-direction: column;
}

/* Children rise in gently, one after another. */
.panel > * { animation: rise 0.42s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.panel > :nth-child(2) { animation-delay: 0.06s; }
.panel > :nth-child(3) { animation-delay: 0.12s; }
.panel > :nth-child(4) { animation-delay: 0.18s; }
@keyframes rise { from { opacity: 0; transform: translateY(10px); } }

/* ---------- Title card ---------- */
.card-head {
  display: flex; align-items: center; gap: 18px; margin-bottom: 16px; padding-bottom: 14px;
  background: linear-gradient(90deg, rgba(122, 72, 24, 0.55), rgba(122, 72, 24, 0)) left bottom / 100% 2px no-repeat;
}
.seal {
  flex: none; display: grid; place-items: center; width: 72px; height: 72px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff6dc, #ecd29a 70%, #dcb878);
  border: 3px solid var(--bark);
  box-shadow: inset 0 0 0 4px rgba(255, 250, 234, 0.6), 0 3px 6px rgba(60, 30, 8, 0.3);
}
.seal svg { width: 50px; height: 50px; display: block; }
.title {
  font-family: var(--font-display); font-weight: 700; letter-spacing: -0.01em;
  font-size: clamp(36px, 2.4vw + 18px, 48px); line-height: 1.02; color: var(--ink);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.7);
}
.screen-title {
  font-family: var(--font-display); font-weight: 700; font-size: 36px; line-height: 1.1;
  color: var(--ink); padding: 0;
}
.eyebrow {
  font-size: 18px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--accent);
}
.titles .eyebrow { margin-top: 6px; }
.lead { font-size: 21px; color: var(--ink); }
.leaf-list { list-style: none; padding: 0; margin: 10px 0 0 !important; color: var(--ink-soft); }
.leaf-list li { position: relative; padding-left: 32px; margin-top: 6px; }
.leaf-list li::before {
  content: ''; position: absolute; left: 6px; top: 0.36em; width: 14px; height: 14px;
  background: linear-gradient(135deg, #e8892a, #b8481a);
  border-radius: 0 100% 0 100%; transform: rotate(-10deg);
  box-shadow: inset 0 0 0 1px rgba(90, 40, 10, 0.4);
}
.menu { display: grid; gap: 14px; margin-top: 22px; }

/* ---------- Buttons ---------- */
.btn {
  display: flex; align-items: center; justify-content: center; gap: 12px;
  box-sizing: border-box; width: 100%; min-height: 64px; padding: 10px 20px;
  font: 800 23px/1.15 var(--font-body); color: var(--ink); text-align: center;
  border: 3px solid var(--bark-dark);
  border-radius: 18px 22px 18px 22px / 22px 18px 22px 18px;
  cursor: pointer; -webkit-tap-highlight-color: transparent;
  transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
}
.btn-icon { display: inline-flex; flex: none; width: 26px; height: 26px; }
.btn-icon svg { width: 100%; height: 100%; }
.btn-primary {
  background: linear-gradient(180deg, #ffe08c 0%, #fbc75e 50%, #f4b244 100%);
  box-shadow:
    inset 0 2px 0 rgba(255, 255, 255, 0.65),
    inset 0 -4px 0 rgba(150, 80, 10, 0.22),
    0 4px 0 #6b3d12,
    0 9px 18px -6px rgba(40, 20, 4, 0.5);
}
.btn-secondary {
  background: linear-gradient(180deg, var(--parchment-hi) 0%, #f2e4c4 100%);
  box-shadow: inset 0 2px 0 #fff, 0 3px 0 #8a6a45, 0 8px 14px -8px rgba(40, 20, 4, 0.45);
}
.btn:hover { filter: brightness(1.05) saturate(1.05); }
.btn:active { transform: translateY(3px); box-shadow: inset 0 2px 4px rgba(90, 50, 10, 0.3), 0 1px 0 #6b3d12; }
.btn:focus-visible, .report:focus-visible, .choice:focus-within {
  outline: 4px solid var(--focus); outline-offset: 4px;
}

/* ---------- Graphics: big radio rows ---------- */
.choices { border: 0; margin: 0; padding: 0; display: grid; gap: 10px; }
.choices legend { margin-bottom: 12px; }
.choice {
  display: flex; align-items: center; gap: 14px; min-height: 64px; box-sizing: border-box;
  padding: 10px 16px; cursor: pointer;
  border: 3px solid rgba(90, 56, 24, 0.55); border-radius: 16px;
  background: rgba(255, 251, 241, 0.7);
}
.choice:has(input:checked) { border-color: var(--bark-dark); background: #fff3cf; }
.choice input { flex: none; width: 28px; height: 28px; margin: 0; accent-color: var(--accent); }
.choice input:focus { outline: none; }
.choice-words { display: grid; gap: 2px; }
.choice-name { font-size: 22px; font-weight: 800; }
.choice-desc { font-size: 18px; color: var(--ink-soft); }

/* ---------- Running: quest-tracker card, top-left so the worm stays clear ---------- */
.running-label { font-size: 24px; font-weight: 800; line-height: 1.2; margin-top: 4px !important; }
.pips { display: flex; gap: 8px; margin: 12px 0 10px; }
.pip {
  width: 56px; height: 12px; border-radius: 99px;
  border: 2px solid var(--bark); background: rgba(122, 72, 24, 0.12);
}
.pip.done { background: var(--moss); }
.pip.now { background: linear-gradient(90deg, #f4b244, #e07a26); animation: glow 1.6s ease-in-out infinite alternate; }
@keyframes glow { from { opacity: 0.6; } to { opacity: 1; } }
.wait { color: var(--ink-soft); }

/* ---------- Result ---------- */
.verdict {
  display: flex; align-items: center; gap: 16px; flex: none;
  margin: -6px -10px 0; padding: 8px 12px; border-radius: 16px;
}
.verdict.pass { background: linear-gradient(90deg, rgba(77, 122, 44, 0.2), rgba(77, 122, 44, 0) 85%); }
.verdict.fail { background: linear-gradient(90deg, rgba(168, 52, 28, 0.16), rgba(168, 52, 28, 0) 85%); }
.verdict-icon { flex: none; width: 64px; height: 64px; filter: drop-shadow(0 2px 2px rgba(40, 20, 4, 0.3)); }
.verdict-icon svg { width: 100%; height: 100%; display: block; }
.verdict-title {
  font-family: var(--font-display); font-size: 46px; line-height: 1; letter-spacing: 0.06em;
  font-weight: 700;
}
.verdict-note { font-size: 20px; margin-top: 4px !important; }
.report {
  flex: 1 1 auto; min-height: 4.5em; overflow: auto; margin: 16px 0 !important;
  padding: 12px 16px; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text;
  font: 18px/1.45 var(--font-body); color: var(--ink);
  border: 2px solid rgba(90, 56, 24, 0.5); border-radius: 12px;
  /* Scroll shadows: a soft edge appears only where more text is hidden (pure CSS). */
  background:
    linear-gradient(#fffbf1 30%, rgba(255, 251, 241, 0)) center top / 100% 36px no-repeat local,
    linear-gradient(rgba(255, 251, 241, 0), #fffbf1 70%) center bottom / 100% 36px no-repeat local,
    radial-gradient(farthest-side at 50% 0, rgba(90, 56, 24, 0.28), rgba(90, 56, 24, 0)) center top / 100% 14px no-repeat scroll,
    radial-gradient(farthest-side at 50% 100%, rgba(90, 56, 24, 0.28), rgba(90, 56, 24, 0)) center bottom / 100% 14px no-repeat scroll,
    #fffbf1;
}
.actions { flex: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 14px; padding-bottom: 4px; }
.actions .btn { font-size: 22px; }
.saved { display: flex; align-items: center; gap: 10px; margin: 0 0 12px !important; font-weight: 700; }
.saved-icon { flex: none; width: 28px; height: 28px; color: var(--moss); }
.saved-icon svg { width: 100%; height: 100%; }

/* ---------- Crawl hint ---------- */
.hint { display: flex; align-items: center; gap: 12px; font-weight: 600; }
.hint-icon { flex: none; width: 34px; height: 34px; color: var(--accent); }
.hint-icon svg { width: 100%; height: 100%; }

/* ---------- Small screens ---------- */
@media (max-height: 640px) {
  .panel { padding: 18px 24px 20px; }
  .card-head { margin-bottom: 10px; }
  .seal { width: 60px; height: 60px; }
  .seal svg { width: 42px; height: 42px; }
  .title { font-size: 36px; }
  .menu { margin-top: 16px; gap: 10px; }
  .btn, .choice { min-height: 56px; }
  .verdict-icon { width: 52px; height: 52px; }
  .verdict-title { font-size: 38px; }
  .report { margin: 12px 0 !important; }
}
@media (max-width: 560px) {
  .panel[data-state] { left: 16px; right: 16px; width: auto; }
  .panel[data-state="crawl"] { right: 128px; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
  .btn:active { transform: none; }
}
```

Create `src/ui/hud.css`:

```css
/* In-game HUD: the fps tag, the Pause button and the joystick. Same accessibility rules as
   the cards: 18px+ text, 7:1 ink on parchment, 4px focus ring, 48px+ targets. */

/* ---------- fps tag (?fps=1, and always while the speed test runs) ---------- */
.fps {
  position: fixed; z-index: 1; top: 12px; right: 12px; display: flex; align-items: center; gap: 8px;
  padding: 6px 14px 6px 12px; font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums;
  color: var(--ink); background: linear-gradient(180deg, var(--parchment-hi), #f3e5c4);
  border: 2px solid var(--bark); border-radius: 14px 18px 14px 18px / 18px 14px 18px 14px;
  box-shadow: 0 3px 8px rgba(30, 14, 2, 0.35);
}
.fps::before {
  content: ''; width: 10px; height: 10px; border-radius: 0 100% 0 100%;
  background: linear-gradient(135deg, #e8892a, #b8481a);
}
.fps:empty { display: none; }
/* While crawling the Pause button owns the top-right corner. */
[data-ui="crawl"] > .fps { top: 84px; }

/* ---------- Pause button (crawl only) ---------- */
.pause-btn.btn {
  position: fixed; z-index: 3; top: 12px; right: 12px; width: auto; min-width: 112px;
  min-height: 60px; padding: 8px 18px; font-size: 21px;
}
[data-ui]:not([data-ui="crawl"]) > .pause-btn { display: none; }

/* ---------- Joystick (crawl only) ---------- */
[data-ui]:not([data-ui="crawl"]) > .joystick { display: none; }
.joystick {
  position: fixed; z-index: 1; left: 24px; bottom: 24px; width: 140px; height: 140px; border-radius: 50%;
  touch-action: none; cursor: grab;
  background:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 140 140' fill='%235a3818' fill-opacity='.7'%3E%3Cpath d='M70 9l9 10H61zM70 131l-9-10h18zM9 70l10-9v18zM131 70l-10 9V61z'/%3E%3C/svg%3E") center / 100% 100% no-repeat,
    radial-gradient(circle, rgba(255, 248, 228, 0.35) 0 40%, rgba(255, 248, 228, 0.6) 41% 100%);
  border: 3px solid rgba(61, 36, 12, 0.85);
  box-shadow: inset 0 0 0 5px rgba(255, 250, 235, 0.35), 0 6px 18px rgba(30, 14, 2, 0.35);
}
.joystick-knob {
  position: absolute; left: 50%; top: 50%; width: 56px; height: 56px; margin: -28px 0 0 -28px;
  box-sizing: border-box; border-radius: 50%; pointer-events: none;
  background: radial-gradient(circle at 36% 30%, #fff8e2 0%, #f6cd73 55%, #d8913a 100%);
  border: 3px solid var(--bark-dark);
  box-shadow: inset 0 -3px 0 rgba(120, 60, 10, 0.25), 0 4px 8px rgba(30, 14, 2, 0.4);
}
```

- [ ] **Step 8: Type-check and run the suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; 28 files, 278 tests passed.

- [ ] **Step 9: Commit**

```bash
git add src/ui src/spike/ui.ts
git commit -m "feat(ui): parchment shell, menus, graphics screen and speed-test cards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Game shell: world, crawl and main replace the spike page

After this task `index.html` loads the game. Start shows Crawl, Graphics and Speed test over the live forest; Crawl drives the worm; Esc, P, the Pause button or a hidden tab pause it; Graphics switches presets live and saves them; the Step 0 speed test runs from the menu with its FAIL cards, restarts and context-loss handling. Presets already apply live through `world.apply` (Task 8 makes the effects and counts exact). Render interpolation by alpha is kept: `Crawl.interpolate` lerps every simulated value.

**Files:**
- Create: `src/game/crawl.ts`, `src/game/world.ts`, `src/main.ts`, `tests/unit/crawl.test.ts`
- Modify: `index.html`, `tests/unit/sceneTiers.test.ts`, `tests/e2e/speedTest.spec.ts`
- Delete: `src/spike/` (`main.ts`, `scene.ts`, `ui.ts`, `spike.css`)

- [ ] **Step 1: Write the failing crawl test**

Create `tests/unit/crawl.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Crawl, WORM_SEGMENTS, CAM_GROUND_MARGIN } from '../../src/game/crawl';
import { terrainHeight } from '../../src/surface/terrain';
import type { WormPose } from '../../src/worm/wormMesh';

const DT = 1 / 60;
const pose = (): WormPose => ({ spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 });

describe('Crawl', () => {
  it('crawls forward along +z from the spawn, the body trailing behind', () => {
    const c = new Crawl();
    for (let i = 0; i < 60; i++) c.step(DT, { x: 0, y: 1 });
    expect(c.motion.head.z).toBeGreaterThan(1.4);
    expect(Math.abs(c.motion.head.x)).toBeLessThan(1e-6);
    for (let i = 1; i < c.body.length; i++) expect(c.body[i].z).toBeLessThan(c.body[i - 1].z);
  });

  it('ignores backward input', () => {
    const c = new Crawl();
    for (let i = 0; i < 30; i++) c.step(DT, { x: 0, y: -1 });
    expect(c.motion.head.z).toBeCloseTo(0, 6);
  });

  it('keeps the camera above the ground margin', () => {
    const c = new Crawl();
    for (let i = 0; i < 600; i++) {
      c.step(DT, { x: 0.6, y: 1 });
      expect(c.cam.pos.y).toBeGreaterThanOrEqual(terrainHeight(c.cam.pos.x, c.cam.pos.z) + CAM_GROUND_MARGIN - 1e-9);
    }
  });

  it('interpolates between the last two steps by alpha', () => {
    const c = new Crawl();
    for (let i = 0; i < 10; i++) c.step(DT, { x: 0, y: 1 });
    const p = pose();
    const cam = new THREE.PerspectiveCamera();
    c.interpolate(1, 2, p, cam);
    expect(p.spine[2]).toBeCloseTo(c.motion.head.z, 6);
    expect(c.focus.z).toBeCloseTo(c.motion.head.z, 6);
    expect(p.timeSec).toBe(2);
    const z1 = p.spine[2];
    c.interpolate(0, 2, p, cam);
    expect(p.spine[2]).toBeLessThan(z1);
    expect(p.spine.every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(cam.position.x + cam.position.y + cam.position.z)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/unit/crawl.test.ts`
Expected: FAIL with "Cannot find module '../../src/game/crawl'".

- [ ] **Step 3: Implement the crawl simulation (moved from the spike page)**

Create `src/game/crawl.ts`:

```ts
import type * as THREE from 'three';
import type { Vec2, Vec3 } from '../core/vec';
import { terrainHeight } from '../surface/terrain';
import {
  createFollowCam, stepFollowCam, type FollowCamOptions, type FollowCamState,
} from '../surface/followCamera';
import { createBody, followHead } from '../worm/body';
import { clampToNeck, stepWorm, type WormMotion } from '../worm/locomotion';
import { advanceWave, type WaveState } from '../worm/wormShape';
import { BELLY_LIFT, WAVES, wormLength, type WormPose } from '../worm/wormMesh';
import { LOCOMOTION } from './drive';

export const WORM_SEGMENTS = 16;
const SPACING = 0.22;
/** The camera aims a little ahead of the head, so the worm sits low in frame and the forest looms. */
const LOOK_AHEAD = 1.0;
const LOOK_UP = 0.6;
const MAX_NECK_BEND = 1.3;
/** Slow resting "breath" of the contraction wave, in waves per second. */
const BREATH_HZ = 0.22;
/** The camera never dips closer than this to the ground beneath it. */
export const CAM_GROUND_MARGIN = 0.5;
const CAM_OPTS: FollowCamOptions = {
  distance: 2.6, height: 1.1, yawSmoothTime: 0.5, posRate: 10, maxYawSpeed: 1.8,
};
const WAVES_PER_UNIT = WAVES / wormLength(WORM_SEGMENTS, SPACING);

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function copy(dst: Vec3, src: Vec3): void {
  dst.x = src.x;
  dst.y = src.y;
  dst.z = src.z;
}

/**
 * The worm and its follow camera, stepped at the fixed simulation rate (moved from the Step 0
 * page). Keeps the previous step so rendering can interpolate by alpha.
 */
export class Crawl {
  motion: WormMotion;
  readonly body: Vec3[];
  cam: FollowCamState;
  readonly wave: WaveState = { phase: 0, activity: 0 };
  /** The head as last rendered (interpolated): leaf shaders and the detail layer centre on it. */
  readonly focus: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly prevBody: Vec3[];
  private readonly prevCam: Vec3;
  private readonly prevHead: Vec3;
  private readonly prevWave: WaveState = { phase: 0, activity: 0 };
  private prevYaw: number;
  private readonly move: Vec2 = { x: 0, y: 0 };

  constructor() {
    this.motion = { head: { x: 0, y: terrainHeight(0, 0) + BELLY_LIFT, z: 0 }, heading: 0 };
    this.body = createBody(WORM_SEGMENTS, SPACING, this.motion.head, this.motion.heading);
    this.cam = createFollowCam(this.motion.head, this.motion.heading, CAM_OPTS);
    this.prevBody = this.body.map((s) => ({ ...s }));
    this.prevCam = { ...this.cam.pos };
    this.prevHead = { ...this.motion.head };
    this.prevYaw = this.cam.yaw;
    copy(this.focus, this.motion.head);
  }

  /** One fixed step. `move`: x turns right, y crawls forward (backward input is ignored). */
  step(dt: number, move: Vec2): void {
    const { body, prevBody, wave } = this;
    for (let i = 0; i < body.length; i++) copy(prevBody[i], body[i]);
    copy(this.prevCam, this.cam.pos);
    this.prevYaw = this.cam.yaw;
    copy(this.prevHead, this.motion.head);
    this.prevWave.phase = wave.phase;
    this.prevWave.activity = wave.activity;

    this.move.x = move.x;
    this.move.y = Math.max(0, move.y);
    this.motion.heading = clampToNeck(this.motion.heading, body[0], body[1], MAX_NECK_BEND);
    this.motion = stepWorm(this.motion, this.move, dt, LOCOMOTION);
    const head = this.motion.head;
    // stepWorm stays flat and pure; the ground decides the height here.
    head.y = terrainHeight(head.x, head.z) + BELLY_LIFT;
    advanceWave(
      wave, Math.hypot(head.x - this.prevHead.x, head.z - this.prevHead.z), dt,
      LOCOMOTION.speed, WAVES_PER_UNIT, BREATH_HZ,
    );
    followHead(body, head, SPACING);
    // Settle each trailing segment onto the ground. On these gentle slopes (< ~20 degrees)
    // this changes the 3D spacing by a few percent at most.
    for (let i = 1; i < body.length; i++) {
      const s = body[i];
      s.y = terrainHeight(s.x, s.z) + BELLY_LIFT;
    }
    this.cam = stepFollowCam(this.cam, head, this.motion.heading, dt, CAM_OPTS);
    const floor = terrainHeight(this.cam.pos.x, this.cam.pos.z) + CAM_GROUND_MARGIN;
    if (this.cam.pos.y < floor) this.cam.pos.y = floor;
  }

  /** Writes the render pose, the camera and `focus`, between the last two steps by `alpha`. */
  interpolate(alpha: number, timeSec: number, pose: WormPose, camera: THREE.PerspectiveCamera): void {
    const sp = pose.spine;
    for (let i = 0; i < this.body.length; i++) {
      const a = this.prevBody[i];
      const b = this.body[i];
      sp[i * 3] = lerp(a.x, b.x, alpha);
      sp[i * 3 + 1] = lerp(a.y, b.y, alpha);
      sp[i * 3 + 2] = lerp(a.z, b.z, alpha);
    }
    pose.phase = lerp(this.prevWave.phase, this.wave.phase, alpha);
    pose.activity = lerp(this.prevWave.activity, this.wave.activity, alpha);
    pose.timeSec = timeSec;

    const h = this.motion.head;
    const f = this.focus;
    f.x = lerp(this.prevHead.x, h.x, alpha);
    f.y = lerp(this.prevHead.y, h.y, alpha);
    f.z = lerp(this.prevHead.z, h.z, alpha);
    const yaw = lerp(this.prevYaw, this.cam.yaw, alpha);
    const c = this.cam.pos;
    camera.position.set(lerp(this.prevCam.x, c.x, alpha), lerp(this.prevCam.y, c.y, alpha), lerp(this.prevCam.z, c.z, alpha));
    camera.lookAt(f.x + Math.sin(yaw) * LOOK_AHEAD, f.y + LOOK_UP, f.z + Math.cos(yaw) * LOOK_AHEAD);
  }
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run tests/unit/crawl.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Create the world composer**

Create `src/game/world.ts`:

```ts
import * as THREE from 'three';
import { buildSky } from '../render/sky';
import { buildAtmosphere } from '../render/atmosphere';
import { setRimLight } from '../render/paintedMaterial';
import { PRESETS, type PresetSpec } from '../render/graphics';
import { buildTerrain } from '../surface/terrainMesh';
import { buildForestTrees } from '../surface/forestTrees';
import { buildDistantTrees } from '../surface/distantTrees';
import { buildLeafLitter, type LeafLitter } from '../surface/leafLitterMesh';
import { buildFallingLeaves } from '../surface/fallingLeaves';
import { buildGroundProps, writeHeroLog, type GroundProps } from '../surface/groundProps';
import { HeroWorm, type WormPose } from '../worm/wormMesh';
import { WORM_SEGMENTS, type Crawl } from './crawl';

export interface World {
  scene: THREE.Scene;
  /** One merged mesh, built with Ultra's leaf count. */
  litter: LeafLitter;
  /** Rocks and ground clutter. */
  props: GroundProps;
  /** Light shafts, dust motes and falling leaves. */
  atmosphere: THREE.Group;
  /** Continuous tube body plus its contact shadow. */
  worm: HeroWorm;
  /** Shows a preset's counts, effects and rim light. The renderer's pixel ratio is the caller's. */
  apply(spec: PresetSpec): void;
  /** Poses everything that moves with the simulation for this rendered frame. Allocates nothing. */
  sync(crawl: Crawl, alpha: number, timeSec: number, camera: THREE.PerspectiveCamera): void;
}

/**
 * The forest floor, built once at Ultra size so presets only trim it. Thin composer: every
 * part is built in its own module.
 */
export function buildWorld(): World {
  const scene = new THREE.Scene();
  const litter = buildLeafLitter(PRESETS.ultra.litter);
  const props = buildGroundProps();
  const atmosphere = buildAtmosphere();
  atmosphere.add(buildFallingLeaves());
  // The hero worm: no eyes (spec 8.3); it is posed from the simulated spine every frame.
  const worm = new HeroWorm(WORM_SEGMENTS);
  const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };

  // The ground fills most of the screen: draw it after everything that sits on it, so the
  // depth test skips ground pixels already covered by leaves, props and trunks.
  const terrain = buildTerrain();
  terrain.renderOrder = 5;
  scene.add(
    terrain, buildForestTrees(writeHeroLog), buildDistantTrees(), litter.mesh, props.mesh, worm.group,
    buildSky(), atmosphere,
  );
  return {
    scene, litter, props, atmosphere, worm,
    apply(spec) {
      litter.setDensity(spec.litter / PRESETS.ultra.litter);
      props.setDensity(spec.clutter);
      atmosphere.visible = spec.effects;
      setRimLight(spec.rim);
    },
    sync(crawl, alpha, timeSec, camera) {
      crawl.interpolate(alpha, timeSec, pose, camera);
      worm.update(pose);
    },
  };
}
```

In `tests/unit/sceneTiers.test.ts`:

Replace:

```ts
import { buildGroundProps } from '../../src/surface/groundProps';
import { buildFallingLeaves, FALLING_COUNT } from '../../src/surface/fallingLeaves';
import { buildScene } from '../../src/spike/scene';

describe('leaf litter (merged)', () => {
```

with:

```ts
import { buildGroundProps } from '../../src/surface/groundProps';
import { buildFallingLeaves, FALLING_COUNT } from '../../src/surface/fallingLeaves';
import { buildWorld } from '../../src/game/world';

describe('leaf litter (merged)', () => {
```

Replace:

```ts
  });
  it('live with the atmosphere extras that the low tiers switch off', () => {
    const world = buildScene(200, 16);
    expect(world.atmosphere.getObjectByName('fallingLeaves')).toBeDefined();
  });
```

with:

```ts
  });
  it('live with the atmosphere extras that the low tiers switch off', () => {
    const world = buildWorld();
    expect(world.atmosphere.getObjectByName('fallingLeaves')).toBeDefined();
  });
```

- [ ] **Step 6: Create the entry**

Create `src/main.ts`:

```ts
import * as THREE from 'three';
import './ui/parchment.css';
import './ui/hud.css';
import { startLoop } from './core/loop';
import type { Vec2 } from './core/vec';
import { FpsMeter } from './render/fps';
import { TIERS } from './render/quality';
import {
  PRESETS, CHOICE_LABELS, pixelRatioFor, recommendedPreset, tierSpec, type PresetSpec,
} from './render/graphics';
import { setResolution, setTime } from './render/paintedMaterial';
import { KeyboardInput } from './input/keyboard';
import { TouchJoystick } from './input/touchJoystick';
import { keysToCommands, mergeCommands, NO_COMMANDS } from './input/commands';
import { parseParams } from './game/params';
import { initialScreens, transition, type ScreenEvent, type ScreenState } from './game/screens';
import { GraphicsControl } from './game/graphicsControl';
import { buildWorld } from './game/world';
import { Crawl } from './game/crawl';
import { AUTO_DRIVE_MOVE } from './game/drive';
import { browserStore } from './save/settingsStore';
import { SpeedTestRunner } from './perf/speedTestRunner';
import { formatContextLostResults, formatNoWebGLResults } from './perf/speedTest';
import { basicDeviceInfo, deviceInfo } from './perf/device';
import { createShell } from './ui/shell';
import { showCrawl, showLost, showPause, showStart } from './ui/menus';
import { showGraphics } from './ui/graphicsMenu';
import { showResult, showRunning, showTestIntro } from './ui/speedTestUi';

const RESET_AFTER_TEST_NOTE = 'The graphics reset after the test. These results are still valid.';
const RESET_NOTE = 'The graphics reset during the test. Reload the page and try again.';
const NO_MOVE: Vec2 = Object.freeze({ x: 0, y: 0 });

const params = parseParams(location.search);
const app = document.getElementById('app')!;
let onPauseButton = (): void => {};
// The card exists before any 3D setup, so a computer without WebGL 2 still gets a report.
const shell = createShell(app, params.fps, () => onPauseButton());

let renderer: THREE.WebGLRenderer | null = null;
try {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
} catch (e) {
  // Three r186 needs WebGL 2 and throws without it. That is a FAIL worth reporting, not a blank page.
  const reason = e instanceof Error ? e.message : String(e);
  showResult(shell, formatNoWebGLResults(basicDeviceInfo(), reason), false,
    { summary: 'This computer could not start the 3D graphics.' });
}
if (renderer) run(renderer);

function run(renderer: THREE.WebGLRenderer): void {
  app.appendChild(renderer.domElement);
  // Near plane 0.2 (not 0.1) doubles depth precision for the thin, layered leaf litter. The
  // camera stays >= 0.5 above the litter and 2.6 behind the worm, so nothing it normally looks
  // at comes within 0.2 of the lens.
  const camera = new THREE.PerspectiveCamera(60, 1, 0.2, 120);
  const world = buildWorld();
  const crawl = new Crawl();
  const keyboard = new KeyboardInput();
  const joystick = new TouchJoystick(app);
  const meter = new FpsMeter();
  const graphics = new GraphicsControl(browserStore(), params.preset);
  // The speed test measures a forced ?preset= or, normally, High.
  const testBase = PRESETS[params.preset ?? 'high'];
  const drawSize = new THREE.Vector2();
  let state: ScreenState = initialScreens(params.speedTest);
  let spec: PresetSpec = PRESETS[graphics.active];
  /** What the results screen shows. */
  let report: { text: string; pass: boolean; summary?: string } | null = null;
  let lost = false;
  /** Game clock (ms). It stands still while paused, so wind, dust and the worm's breath freeze. */
  let clock = 0;
  let lastNow = performance.now();
  /** Something changed while frozen (preset, size): draw one more frame. */
  let dirty = true;

  const runner = new SpeedTestRunner({
    setMaxFps: (fps) => loop.setMaxFps(fps),
    applyTier: (tier) => applySpec(tierSpec(testBase, TIERS[tier])),
    showPhase: (p) => showRunning(shell,
      p.id === 'full' ? 'Test 1 of 2: full quality' : 'Test 2 of 2: auto quality', p.id === 'full' ? 1 : 2, 2),
    deviceInfo: () => deviceInfo(renderer),
  }, params.quick, testBase.litter + testBase.detail);

  function updateResolution(): void {
    renderer.getDrawingBufferSize(drawSize);
    setResolution(drawSize.x, drawSize.y);
  }

  /** Applies live: pixel ratio, draw ranges, visibility, uniforms. No rebuilds, no recompiles. */
  function applySpec(s: PresetSpec): void {
    spec = s;
    renderer.setPixelRatio(pixelRatioFor(s, window.devicePixelRatio));
    world.apply(s);
    updateResolution();
    dirty = true;
  }

  /** The player's own preset: a forced ?preset=, a menu choice, or Auto's current pick. */
  function applyActive(): void {
    applySpec(PRESETS[graphics.active]);
  }

  function resize(): void {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    updateResolution();
    dirty = true;
  }

  function dispatch(e: ScreenEvent): void {
    if (lost) return;
    const next = transition(state, e);
    if (next === state) return;
    state = next;
    // A slow streak from before (or a menu over the scene) must not count against Auto.
    graphics.interruptAuto();
    draw();
  }

  function draw(): void {
    switch (state.screen) {
      case 'start':
        return showStart(shell, {
          onCrawl: () => dispatch({ type: 'crawl' }),
          onGraphics: () => dispatch({ type: 'graphics' }),
          onSpeedTest: () => dispatch({ type: 'speedTest' }),
        });
      case 'crawl':
        return showCrawl(shell);
      case 'pause':
        return showPause(shell, {
          onResume: () => dispatch({ type: 'resume' }),
          onGraphics: () => dispatch({ type: 'graphics' }),
          onStart: () => dispatch({ type: 'toStart' }),
        });
      case 'graphics':
        return showGraphics(shell, graphics.choice, (c) => {
          graphics.choose(c);
          applyActive();
        }, () => dispatch({ type: 'back' }));
      case 'speedTest':
        return showTestIntro(shell, () => runner.start(), () => dispatch({ type: 'toStart' }));
      case 'results':
        return showReport();
    }
  }

  function showReport(): void {
    if (!report) return;
    showResult(shell, report.text, report.pass, {
      summary: report.summary,
      recommended: lost ? null : state.recommended,
      applied: state.applied,
      onUseRecommended: () => {
        if (state.recommended) graphics.useRecommended(state.recommended);
        applyActive();
        dispatch({ type: 'useRecommended' });
      },
      onBack: lost ? undefined : () => dispatch({ type: 'toStart' }),
    });
  }

  function finishTest(): void {
    const r = runner.result!;
    report = { text: r.text, pass: r.pass };
    // Back to the player's own preset now the measuring is done.
    applyActive();
    dispatch({ type: 'testDone', recommended: recommendedPreset(r.tier) });
  }

  function move(): Vec2 {
    if (runner.running) return AUTO_DRIVE_MOVE.move;
    if (state.screen !== 'crawl') return NO_MOVE;
    return mergeCommands(keysToCommands(keyboard.down), { ...NO_COMMANDS, move: joystick.value }).move;
  }

  /** Paused (or the Graphics menu over a pause): the simulation stops, the last frame stays. */
  function frozen(): boolean {
    return lost || state.screen === 'pause' || (state.screen === 'graphics' && state.graphicsFrom === 'pause');
  }

  function update(dt: number): void {
    if (!frozen()) crawl.step(dt, move());
  }

  function render(now: number, alpha: number): void {
    meter.frame(now);
    const elapsed = Math.min(250, Math.max(0, now - lastNow));
    lastNow = now;
    const still = frozen();
    if (!still) clock += elapsed;
    if (runner.running) {
      if (runner.frame(now, meter.fps)) finishTest();
    } else if (state.screen === 'crawl' && graphics.updateAuto(now, meter.fps)) {
      applyActive();
    }
    if (still && !dirty) return;
    dirty = false;
    setTime(clock / 1000);
    world.sync(crawl, alpha, clock / 1000, camera);
    renderer.render(world.scene, camera);
    shell.setFps(meter.fps, runner.running ? `quality ${runner.quality.tier}` : CHOICE_LABELS[spec.id]);
  }

  applyActive();
  resize();
  window.addEventListener('resize', resize);
  const loop = startLoop(update, render, { maxFps: 30 });

  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    // Without preventDefault the browser never offers to restore the context; we do not restore
    // it anyway, because a mid-test reset means the numbers cannot be trusted.
    e.preventDefault();
    loop.stop();
    if (runner.running) {
      runner.abort();
      report = { text: formatContextLostResults(basicDeviceInfo()), pass: false, summary: RESET_NOTE };
      state = transition(state, { type: 'testDone', recommended: null });
      lost = true;
      showReport();
    } else if (state.screen === 'results' && report) {
      // The test already finished: the real verdict and report matter more than the reset.
      report = { ...report, summary: RESET_AFTER_TEST_NOTE };
      lost = true;
      showReport();
    } else {
      lost = true;
      showLost(shell);
    }
  });

  document.addEventListener('visibilitychange', () => {
    graphics.interruptAuto();
    if (document.hidden) {
      runner.onHidden();
      dispatch({ type: 'hidden' });
    } else {
      runner.onVisible(performance.now());
    }
  });

  // Esc or P pauses and resumes; Esc also leaves the Graphics menu.
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const pauseKey = e.code === 'Escape' || e.code === 'KeyP';
    if (state.screen === 'crawl' && pauseKey) dispatch({ type: 'pause' });
    else if (state.screen === 'pause' && pauseKey) dispatch({ type: 'resume' });
    else if (state.screen === 'graphics' && e.code === 'Escape') dispatch({ type: 'back' });
    else return;
    e.preventDefault();
  });
  onPauseButton = () => dispatch({ type: 'pause' });

  draw();
}
```

Replace `index.html` with:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Worm Simulator</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 7: Delete the spike page**

```bash
git rm -r src/spike
```

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; 29 files, 282 tests passed.

- [ ] **Step 8: Update the speed-test browser test for the menu**

Replace `tests/e2e/speedTest.spec.ts` with:

```ts
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PAGE = pathToFileURL(path.resolve('dist/index.html')).href + '?quick=1';

test('runs the speed test offline from a file with zero network requests', async ({ page, context }) => {
  const outside: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!/^(file|data|blob):/.test(u)) outside.push(u);
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Three reports shader compile and link failures as console errors.
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await context.setOffline(true);
  await page.goto(PAGE);
  await page.getByRole('button', { name: 'Speed test', exact: true }).click();
  await page.getByRole('button', { name: 'Start speed test' }).click();
  await expect(page.getByTestId('running')).toBeVisible();
  await expect(page.getByTestId('result')).toContainText('fps average', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Copy results' })).toBeFocused();

  expect(outside).toEqual([]);
  expect(errors).toEqual([]);
});

test('ships a CSP that blocks connections', async ({ page }) => {
  await page.goto(PAGE);
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("connect-src 'none'");
});

test('the speed test starts from the keyboard alone', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.getByRole('button', { name: 'Crawl' })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Speed test', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  const start = page.getByRole('button', { name: 'Start speed test' });
  await expect(start).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('running')).toBeVisible();
});

test('?speedtest=1 opens straight on the speed test (Chromebook link and benchmark)', async ({ page }) => {
  await page.goto(PAGE + '&speedtest=1');
  await expect(page.getByRole('button', { name: 'Start speed test' })).toBeFocused();
});

test('Use recommended setting saves a preset, then Back to start returns to the menu', async ({ page }) => {
  await page.goto(PAGE + '&speedtest=1');
  await page.getByRole('button', { name: 'Start speed test' }).click();
  await expect(page.getByTestId('result')).toContainText('fps average', { timeout: 30_000 });
  await page.getByRole('button', { name: /Use recommended setting/ }).click();
  await expect(page.getByText(/^Saved: (Low|Medium|High) graphics\.$/)).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wormsim.settings') ?? 'null'));
  expect(['low', 'medium', 'high']).toContain(saved.graphics);
  await expect(page.getByRole('button', { name: 'Back to start' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Crawl' })).toBeFocused();
});
```

- [ ] **Step 9: Build and run the browser tests**

Run: `npm run verify:build && npx playwright test`
Expected: "single-file build OK", then 6 passed (the no-WebGL FAIL card test is unchanged and still passes: the card is drawn before any 3D setup and has no "Try driving the worm" button).

- [ ] **Step 10: Commit**

```bash
git add src/game/crawl.ts src/game/world.ts src/main.ts index.html tests/unit/crawl.test.ts tests/unit/sceneTiers.test.ts tests/e2e/speedTest.spec.ts
git commit -m "feat(game): game shell with Start, Crawl, Pause, Graphics and the speed test

Replaces the Step 0 spike page. Presets apply live and are saved.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git rm` already staged the deleted spike files; they are part of this commit.)

---

### Task 8: Build every mesh at Ultra size; presets by draw range

**Files:**
- Modify: `src/surface/leafLitterMesh.ts`, `src/surface/fallingLeaves.ts`, `src/render/atmosphere.ts`, `src/game/world.ts`, `tests/unit/sceneTiers.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace `tests/unit/sceneTiers.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import type * as THREE from 'three';
import { buildLeafLitter } from '../../src/surface/leafLitterMesh';
import { buildGroundProps } from '../../src/surface/groundProps';
import { buildFallingLeaves, FALLING_COUNT, FALLING_MAX } from '../../src/surface/fallingLeaves';
import { buildDustMotes, MOTE_COUNT, MOTE_MAX } from '../../src/render/atmosphere';
import { buildWorld } from '../../src/game/world';
import { PRESETS } from '../../src/render/graphics';
import { sharedLighting } from '../../src/render/paintedMaterial';

describe('leaf litter (merged)', () => {
  const litter = buildLeafLitter(2000);
  const g = litter.mesh.geometry;
  const full = g.index!.count;

  it('is one mesh with a sane vertex budget', () => {
    expect(g.getAttribute('position').count).toBeLessThanOrEqual(60000);
    expect(full / 3).toBeLessThanOrEqual(60000);
  });
  it('draws a whole-leaf prefix of any count', () => {
    expect(litter.max).toBe(2000);
    litter.setCount(2000);
    expect(g.drawRange.count).toBe(full);
    litter.setCount(1000);
    expect(g.drawRange.count).toBeGreaterThan(full * 0.35);
    expect(g.drawRange.count).toBeLessThan(full * 0.65);
    expect(g.drawRange.count % 3).toBe(0);
    litter.setCount(0);
    expect(g.drawRange.count).toBe(0);
    litter.setCount(99_999);
    expect(g.drawRange.count).toBe(full);
  });
  it('keeps all positions finite', () => {
    for (const v of g.getAttribute('position').array as Float32Array) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('ground props', () => {
  it('keeps the rocks and thins the clutter with density', () => {
    const p = buildGroundProps();
    const g = p.mesh.geometry;
    p.setDensity(1);
    const full = g.drawRange.count;
    expect(full).toBe(g.index!.count);
    p.setDensity(0.5);
    const half = g.drawRange.count;
    p.setDensity(0);
    const rocks = g.drawRange.count;
    expect(rocks).toBeGreaterThan(0);
    expect(half).toBeGreaterThan(rocks);
    expect(half).toBeLessThan(full);
  });
});

describe('falling leaves and dust motes', () => {
  it('falling leaves are one small mesh, animated in the shader, built at Ultra size', () => {
    const f = buildFallingLeaves();
    expect(f.mesh.frustumCulled).toBe(false);
    const g = f.mesh.geometry;
    expect(g.getAttribute('aFall').count).toBe(g.getAttribute('position').count);
    expect(FALLING_COUNT).toBeGreaterThanOrEqual(12);
    expect(FALLING_COUNT).toBeLessThanOrEqual(24);
    expect(FALLING_MAX).toBe(Math.round(FALLING_COUNT * 1.5));
    f.setCount(FALLING_MAX);
    const all = g.drawRange.count;
    expect(all).toBe(g.index!.count);
    f.setCount(FALLING_COUNT);
    expect(g.drawRange.count).toBeLessThan(all);
    expect(g.drawRange.count).toBeGreaterThan(0);
  });
  it('dust motes are built at Ultra size', () => {
    expect(MOTE_MAX).toBe(Math.round(MOTE_COUNT * 1.5));
    expect(buildDustMotes().geometry.getAttribute('position').count).toBe(MOTE_MAX);
  });
});

describe('world.apply', () => {
  const world = buildWorld();
  const litterG = world.litter.mesh.geometry;
  const motes = world.atmosphere.group.getObjectByName('dustMotes') as THREE.Points;
  const falling = world.atmosphere.group.getObjectByName('fallingLeaves') as THREE.Mesh;

  it('builds the litter at Ultra size', () => {
    expect(world.litter.max).toBe(PRESETS.ultra.litter);
  });

  it('trims counts and switches effects and rim per preset, live', () => {
    world.apply(PRESETS.ultra);
    const ultraLeaves = litterG.drawRange.count;
    expect(ultraLeaves).toBe(litterG.index!.count);
    expect(world.atmosphere.group.visible).toBe(true);
    expect(motes.geometry.drawRange.count).toBe(MOTE_MAX);
    const ultraFalling = falling.geometry.drawRange.count;
    expect(sharedLighting.uRim.value).toBe(1);

    world.apply(PRESETS.high);
    expect(litterG.drawRange.count).toBeLessThan(ultraLeaves);
    expect(motes.geometry.drawRange.count).toBe(MOTE_COUNT);
    expect(falling.geometry.drawRange.count).toBeLessThan(ultraFalling);

    world.apply(PRESETS.low);
    expect(world.atmosphere.group.visible).toBe(false);
    expect(sharedLighting.uRim.value).toBe(0);
    expect(litterG.drawRange.count).toBeLessThan(ultraLeaves / 4);
  });

  it('switching presets does not touch the geometry buffers', () => {
    const pos = litterG.getAttribute('position');
    world.apply(PRESETS.medium);
    world.apply(PRESETS.ultra);
    expect(litterG.getAttribute('position')).toBe(pos);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/sceneTiers.test.ts`
Expected: FAIL: `FALLING_MAX` and `MOTE_MAX` are not exported, `litter.setCount` and `atmosphere.setLevel` do not exist.

- [ ] **Step 3: Litter draws a count**

In `src/surface/leafLitterMesh.ts`:

Replace:

```ts
export interface LeafLitter {
  mesh: THREE.Mesh;
  /** Shows the first `fraction` of the leaves (the order is random, so any prefix is uniform). */
  setDensity(fraction: number): void;
}

```

with:

```ts
export interface LeafLitter {
  mesh: THREE.Mesh;
  /** Leaves built: the most it can draw. */
  readonly max: number;
  /** Draws the first `n` leaves (the order is random, so any prefix is an even thinning). */
  setCount(n: number): void;
}

```

Replace:

```ts
 * The whole leaf litter as ONE merged, static mesh (one draw, no per-instance cost):
 * species silhouettes with a midrib fold, cup and curl, tinted per leaf and lying on the
 * terrain in loose overlapping layers. Density tiers trim it with a draw range.
 */
export function buildLeafLitter(count: number, seed = 1): LeafLitter {
```

with:

```ts
 * The whole leaf litter as ONE merged, static mesh (one draw, no per-instance cost):
 * species silhouettes with a midrib fold, cup and curl, tinted per leaf and lying on the
 * terrain in loose overlapping layers. Presets trim it with a draw range (no rebuild).
 */
export function buildLeafLitter(count: number, seed = 1): LeafLitter {
```

Replace:

```ts
  return {
    mesh,
    setDensity(fraction: number) {
      const k = Math.max(0, Math.min(count, Math.floor(count * fraction)));
      g.setDrawRange(0, k > 0 ? ends[k - 1] : 0);
    },
```

with:

```ts
  return {
    mesh,
    max: count,
    setCount(n: number) {
      const k = Math.max(0, Math.min(count, Math.floor(n)));
      g.setDrawRange(0, k > 0 ? ends[k - 1] : 0);
    },
```

- [ ] **Step 4: Falling leaves built at 1.5×**

In `src/surface/fallingLeaves.ts`:

Replace:

```ts
import { leafTint, LATERAL_VEINS } from './leafPalette';

export const FALLING_COUNT = 18;
/** Falling leaves come from the canopy overhead: maples and (aspen-shaped) birch leaves. */
const KINDS: readonly LeafKind[] = ['maple', 'aspen', 'maple', 'aspen', 'basswood'];
```

with:

```ts
import { leafTint, LATERAL_VEINS } from './leafPalette';

/** Falling leaves on Medium and High. */
export const FALLING_COUNT = 18;
/** Ultra's 1.5x; the mesh is built at this size and trimmed with a draw range. */
export const FALLING_MAX = 27;
/** Falling leaves come from the canopy overhead: maples and (aspen-shaped) birch leaves. */
const KINDS: readonly LeafKind[] = ['maple', 'aspen', 'maple', 'aspen', 'basswood'];
```

Replace:

```ts
 * costs no CPU per frame. One draw.
 */
export function buildFallingLeaves(count = FALLING_COUNT): THREE.Mesh {
  const rng = mulberry32(2024);
  const kinds = Array.from({ length: count }, (_, i) => KINDS[i % KINDS.length]);
```

with:

```ts
 * costs no CPU per frame. One draw.
 */
export interface FallingLeaves {
  mesh: THREE.Mesh;
  /** Draws the first `n` leaves. */
  setCount(n: number): void;
}

export function buildFallingLeaves(count = FALLING_MAX): FallingLeaves {
  const rng = mulberry32(2024);
  const kinds = Array.from({ length: count }, (_, i) => KINDS[i % KINDS.length]);
```

Replace:

```ts
  const fall = new Float32Array(verts * 4);
  const index = new Uint16Array(idx);
  const inner = new THREE.Color();
  const edge = new THREE.Color();
```

with:

```ts
  const fall = new Float32Array(verts * 4);
  const index = new Uint16Array(idx);
  const ends = new Uint32Array(count);
  const inner = new THREE.Color();
  const edge = new THREE.Color();
```

Replace:

```ts
    for (const t of s.indices) index[ii++] = v0 + t;
    v0 += np;
  });
  const g = new THREE.BufferGeometry();
```

with:

```ts
    for (const t of s.indices) index[ii++] = v0 + t;
    v0 += np;
    ends[li] = ii;
  });
  const g = new THREE.BufferGeometry();
```

Replace:

```ts
  mesh.frustumCulled = false;
  mesh.name = 'fallingLeaves';
  return mesh;
}
```

with:

```ts
  mesh.frustumCulled = false;
  mesh.name = 'fallingLeaves';
  return {
    mesh,
    setCount(n: number) {
      const k = Math.max(0, Math.min(count, Math.floor(n)));
      g.setDrawRange(0, k > 0 ? ends[k - 1] : 0);
    },
  };
}
```

- [ ] **Step 5: Atmosphere owns its level**

In `src/render/atmosphere.ts`:

Replace:

```ts
import { mulberry32 } from '../core/random';
import { terrainHeight } from '../surface/terrain';
import { sharedLighting } from './paintedMaterial';

```

with:

```ts
import { mulberry32 } from '../core/random';
import { terrainHeight } from '../surface/terrain';
import { buildFallingLeaves, FALLING_COUNT, FALLING_MAX } from '../surface/fallingLeaves';
import { sharedLighting } from './paintedMaterial';

```

Replace:

```ts
`;

export const MOTE_COUNT = 260;

export function buildDustMotes(): THREE.Points {
  const rng = mulberry32(4242);
  const pos = new Float32Array(MOTE_COUNT * 3);
  const seed = new Float32Array(MOTE_COUNT);
  for (let i = 0; i < MOTE_COUNT; i++) {
    pos[i * 3] = rng();
    pos[i * 3 + 1] = rng();
```

with:

```ts
`;

/** Dust motes on Medium and High. */
export const MOTE_COUNT = 260;
/** Ultra's 1.5x; built at this size and trimmed with a draw range. */
export const MOTE_MAX = 390;

export function buildDustMotes(count = MOTE_MAX): THREE.Points {
  const rng = mulberry32(4242);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = rng();
    pos[i * 3 + 1] = rng();
```

Replace:

```ts
}

/** Atmosphere extras grouped so the quality controller can switch them off in one place. */
export function buildAtmosphere(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'atmosphere';
  g.add(buildLightShafts(), buildDustMotes());
  return g;
}
```

with:

```ts
}

export interface Atmosphere {
  /** Light shafts, dust motes and falling leaves. */
  group: THREE.Group;
  /** `on` false hides them all; `extra` draws Ultra's 1.5x motes and falling leaves. */
  setLevel(on: boolean, extra: boolean): void;
}

/** Atmosphere extras grouped so a preset can switch them off or up in one place. */
export function buildAtmosphere(): Atmosphere {
  const group = new THREE.Group();
  group.name = 'atmosphere';
  const motes = buildDustMotes();
  const falling = buildFallingLeaves();
  group.add(buildLightShafts(), motes, falling.mesh);
  return {
    group,
    setLevel(on, extra) {
      group.visible = on;
      motes.geometry.setDrawRange(0, extra ? MOTE_MAX : MOTE_COUNT);
      falling.setCount(extra ? FALLING_MAX : FALLING_COUNT);
    },
  };
}
```

- [ ] **Step 6: The world applies exact counts**

In `src/game/world.ts`:

Replace:

```ts
import * as THREE from 'three';
import { buildSky } from '../render/sky';
import { buildAtmosphere } from '../render/atmosphere';
import { setRimLight } from '../render/paintedMaterial';
import { PRESETS, type PresetSpec } from '../render/graphics';
```

with:

```ts
import * as THREE from 'three';
import { buildSky } from '../render/sky';
import { buildAtmosphere, type Atmosphere } from '../render/atmosphere';
import { setRimLight } from '../render/paintedMaterial';
import { PRESETS, type PresetSpec } from '../render/graphics';
```

Replace:

```ts
import { buildDistantTrees } from '../surface/distantTrees';
import { buildLeafLitter, type LeafLitter } from '../surface/leafLitterMesh';
import { buildFallingLeaves } from '../surface/fallingLeaves';
import { buildGroundProps, writeHeroLog, type GroundProps } from '../surface/groundProps';
import { HeroWorm, type WormPose } from '../worm/wormMesh';
```

with:

```ts
import { buildDistantTrees } from '../surface/distantTrees';
import { buildLeafLitter, type LeafLitter } from '../surface/leafLitterMesh';
import { buildGroundProps, writeHeroLog, type GroundProps } from '../surface/groundProps';
import { HeroWorm, type WormPose } from '../worm/wormMesh';
```

Replace:

```ts
  props: GroundProps;
  /** Light shafts, dust motes and falling leaves. */
  atmosphere: THREE.Group;
  /** Continuous tube body plus its contact shadow. */
  worm: HeroWorm;
  /** Shows a preset's counts, effects and rim light. The renderer's pixel ratio is the caller's. */
  apply(spec: PresetSpec): void;
  /** Poses everything that moves with the simulation for this rendered frame. Allocates nothing. */
```

with:

```ts
  props: GroundProps;
  /** Light shafts, dust motes and falling leaves. */
  atmosphere: Atmosphere;
  /** Continuous tube body plus its contact shadow. */
  worm: HeroWorm;
  /**
   * Shows a preset: counts by draw range, effects by visibility, rim light by uniform. Allocates
   * nothing. The renderer's pixel ratio is the caller's.
   */
  apply(spec: PresetSpec): void;
  /** Poses everything that moves with the simulation for this rendered frame. Allocates nothing. */
```

Replace:

```ts
  const props = buildGroundProps();
  const atmosphere = buildAtmosphere();
  atmosphere.add(buildFallingLeaves());
  // The hero worm: no eyes (spec 8.3); it is posed from the simulated spine every frame.
  const worm = new HeroWorm(WORM_SEGMENTS);
```

with:

```ts
  const props = buildGroundProps();
  const atmosphere = buildAtmosphere();
  // The hero worm: no eyes (spec 8.3); it is posed from the simulated spine every frame.
  const worm = new HeroWorm(WORM_SEGMENTS);
```

Replace:

```ts
  scene.add(
    terrain, buildForestTrees(writeHeroLog), buildDistantTrees(), litter.mesh, props.mesh, worm.group,
    buildSky(), atmosphere,
  );
  return {
    scene, litter, props, atmosphere, worm,
    apply(spec) {
      litter.setDensity(spec.litter / PRESETS.ultra.litter);
      props.setDensity(spec.clutter);
      atmosphere.visible = spec.effects;
      setRimLight(spec.rim);
    },
```

with:

```ts
  scene.add(
    terrain, buildForestTrees(writeHeroLog), buildDistantTrees(), litter.mesh, props.mesh, worm.group,
    buildSky(), atmosphere.group,
  );
  return {
    scene, litter, props, atmosphere, worm,
    apply(spec) {
      litter.setCount(spec.litter);
      props.setDensity(spec.clutter);
      atmosphere.setLevel(spec.effects, spec.extraEffects);
      setRimLight(spec.rim);
    },
```

- [ ] **Step 7: Run and see it pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS, 29 files, 285 tests.

- [ ] **Step 8: Commit**

```bash
git add src/surface/leafLitterMesh.ts src/surface/fallingLeaves.ts src/render/atmosphere.ts src/game/world.ts tests/unit/sceneTiers.test.ts
git commit -m "feat(graphics): build meshes at Ultra size and apply presets by draw range

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Litter depth

**Files:**
- Create: `src/surface/litterDepth.ts`, `tests/unit/litterDepth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/litterDepth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  litterDepth, driftDepth, pileDepth, hollowAmount, underAmount, litterMound,
  LITTER_MIN, LITTER_MAX, LITTER_OPEN, UNDER_THIN, UNDER_DEEP, WIND, PILES,
} from '../../src/surface/litterDepth';
import { treeSites } from '../../src/surface/treeSites';
import { HERO_LOG, ROCKS } from '../../src/surface/propPlacement';
import { PLAY_HALF, WORLD_HALF } from '../../src/surface/terrain';

const grid = (half: number, step: number): [number, number][] => {
  const pts: [number, number][] = [];
  for (let x = -half; x <= half; x += step) for (let z = -half; z <= half; z += step) pts.push([x, z]);
  return pts;
};
const awayFromEverything = (x: number, z: number) => driftDepth(x, z) === 0 && pileDepth(x, z) === 0;

describe('litterDepth', () => {
  it('is deterministic', () => {
    for (const [x, z] of grid(20, 3.1)) expect(litterDepth(x, z)).toBe(litterDepth(x, z));
  });

  it('stays within [0.01, 0.25] everywhere, including beyond the world edge', () => {
    for (const [x, z] of grid(WORLD_HALF + 6, 0.37)) {
      const d = litterDepth(x, z);
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBeGreaterThanOrEqual(LITTER_MIN);
      expect(d).toBeLessThanOrEqual(LITTER_MAX);
    }
  });

  it('is about one leaf deep in the open (the flat spawn)', () => {
    expect(awayFromEverything(0, 0)).toBe(true);
    expect(litterDepth(0, 0)).toBeGreaterThan(LITTER_OPEN - 0.006);
    expect(litterDepth(0, 0)).toBeLessThan(LITTER_OPEN + 0.006);
  });

  it('is continuous: a 1 mm step never changes it by more than 2 mm', () => {
    for (const [x, z] of grid(PLAY_HALF, 0.29)) {
      const d = litterDepth(x, z);
      expect(Math.abs(litterDepth(x + 0.001, z) - d)).toBeLessThan(0.002);
      expect(Math.abs(litterDepth(x, z + 0.001) - d)).toBeLessThan(0.002);
    }
  });

  it('is deeper in hollows than on rises (away from drifts and piles)', () => {
    let hollow: [number, number] | null = null;
    let rise: [number, number] | null = null;
    for (const [x, z] of grid(PLAY_HALF, 0.5)) {
      if (Math.hypot(x, z) < 8 || !awayFromEverything(x, z)) continue;
      const h = hollowAmount(x, z);
      if (h > 0.9 && !hollow) hollow = [x, z];
      if (h === 0 && !rise) rise = [x, z];
    }
    expect(hollow).not.toBeNull();
    expect(rise).not.toBeNull();
    expect(litterDepth(...hollow!)).toBeGreaterThan(litterDepth(...rise!) + 0.04);
  });

  it('drifts against every trunk and rock, deeper downwind than upwind', () => {
    const round = [
      ...treeSites().map((t) => ({ x: t.x, z: t.z, r: (t.birch ? 0.32 : 0.48) * 1.3 })),
      ...ROCKS.map((k) => ({ x: k.x, z: k.z, r: k.size * 1.05 })),
    ];
    for (const o of round) {
      const gap = o.r + 0.15;
      const down = litterDepth(o.x + WIND.x * gap, o.z + WIND.z * gap);
      const up = litterDepth(o.x - WIND.x * gap, o.z - WIND.z * gap);
      expect(down).toBeGreaterThan(0.1);
      expect(down).toBeGreaterThan(up);
      expect(down).toBeGreaterThan(litterDepth(0, 0) + 0.05);
    }
  });

  it('drifts against the fallen log', () => {
    const nx = -Math.sin(HERO_LOG.yaw);
    const nz = Math.cos(HERO_LOG.yaw);
    const side = nx * WIND.x + nz * WIND.z > 0 ? 1 : -1;
    const gap = HERO_LOG.radius + 0.15;
    expect(litterDepth(HERO_LOG.x + nx * gap * side, HERO_LOG.z + nz * gap * side)).toBeGreaterThan(0.12);
  });

  it('has 4 to 6 windblown piles, deep in the middle', () => {
    expect(PILES.length).toBeGreaterThanOrEqual(4);
    expect(PILES.length).toBeLessThanOrEqual(6);
    for (const p of PILES) expect(litterDepth(p.x, p.z)).toBeGreaterThan(UNDER_DEEP + 0.05);
  });
});

describe('underAmount and litterMound', () => {
  it('under is 1 on thin litter, 0 on deep, smooth and monotonic between', () => {
    expect(underAmount(0.02)).toBe(1);
    expect(underAmount(UNDER_THIN)).toBe(1);
    expect(underAmount(UNDER_DEEP)).toBe(0);
    expect(underAmount(0.25)).toBe(0);
    let prev = 1;
    for (let d = UNDER_THIN; d <= UNDER_DEEP; d += 0.001) {
      const u = underAmount(d);
      expect(u).toBeLessThanOrEqual(prev + 1e-12);
      expect(prev - u).toBeLessThan(0.03);
      prev = u;
    }
  });
  it('the mound is flat under thin litter and the full depth on deep piles', () => {
    expect(litterMound(0.03)).toBe(0);
    expect(litterMound(0.2)).toBeCloseTo(0.2, 12);
    for (let d = 0.01; d <= 0.25; d += 0.005) {
      expect(litterMound(d)).toBeGreaterThanOrEqual(0);
      expect(litterMound(d)).toBeLessThanOrEqual(d);
    }
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/unit/litterDepth.test.ts`
Expected: FAIL with "Cannot find module '../../src/surface/litterDepth'".

- [ ] **Step 3: Implement**

Create `src/surface/litterDepth.ts`:

```ts
import { valueNoise2 } from '../core/noise';
import { terrainHeight } from './terrain';
import { treeSites } from './treeSites';
import { HERO_LOG, ROCKS } from './propPlacement';

/**
 * How deep the leaf litter lies at (x, z), in metres (world units), from LITTER_MIN to
 * LITTER_MAX (spec 5.1). Pure, deterministic, bounded and continuous:
 * - about one leaf (0.02) in the open and on rises;
 * - deeper in terrain hollows (positive curvature of terrainHeight);
 * - drifts against trunks, rocks and the fallen log, deeper on their downwind side;
 * - a few windblown piles.
 */
export const LITTER_MIN = 0.01;
export const LITTER_MAX = 0.25;
/** One leaf. */
export const LITTER_OPEN = 0.02;
/** Litter thinner than this: the worm slips under it. */
export const UNDER_THIN = 0.06;
/** Litter deeper than this: the worm rides on top. */
export const UNDER_DEEP = 0.12;

/** The fall wind blows toward +x, +z (unit vector). */
export const WIND = { x: 0.8, z: 0.6 };

/** Windblown piles: centre, radius (m) and peak depth (m). */
export const PILES: readonly { x: number; z: number; r: number; depth: number }[] = [
  { x: 2.2, z: 6.5, r: 1.3, depth: 0.23 },
  { x: -4.0, z: 3.0, r: 1.0, depth: 0.2 },
  { x: 5.5, z: -2.5, r: 1.2, depth: 0.22 },
  { x: -7.5, z: -8.0, r: 1.5, depth: 0.24 },
  { x: 9.0, z: 11.0, r: 1.4, depth: 0.22 },
];

const smoothstep = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Round obstacles that leaves drift against: trunks (with their root flare) and rocks. */
const ROUND: readonly { x: number; z: number; r: number }[] = [
  ...treeSites().map((t) => ({ x: t.x, z: t.z, r: (t.birch ? 0.32 : 0.48) * 1.3 })),
  ...ROCKS.map((k) => ({ x: k.x, z: k.z, r: k.size * 1.05 })),
];

const LOG_DX = Math.cos(HERO_LOG.yaw);
const LOG_DZ = Math.sin(HERO_LOG.yaw);

/** A drift against an obstacle surface `gap` metres away, in direction (nx, nz) from it. */
function drift(gap: number, nx: number, nz: number, peak: number): number {
  const downwind = nx * WIND.x + nz * WIND.z;
  const side = 0.55 + 0.45 * downwind;
  const reach = 0.45 + 0.6 * Math.max(0, downwind);
  return peak * side * (1 - smoothstep(0, reach, gap));
}

/** The deepest drift at (x, z) from trunks, rocks and the log. */
export function driftDepth(x: number, z: number): number {
  let best = 0;
  for (const o of ROUND) {
    const dx = x - o.x;
    const dz = z - o.z;
    const d = Math.hypot(dx, dz);
    if (d > o.r + 1.2) continue;
    const inv = d > 1e-9 ? 1 / d : 0;
    best = Math.max(best, drift(d - o.r, dx * inv, dz * inv, 0.17));
  }
  const t = Math.max(-HERO_LOG.length / 2, Math.min(HERO_LOG.length / 2,
    (x - HERO_LOG.x) * LOG_DX + (z - HERO_LOG.z) * LOG_DZ));
  const lx = x - (HERO_LOG.x + LOG_DX * t);
  const lz = z - (HERO_LOG.z + LOG_DZ * t);
  const ld = Math.hypot(lx, lz);
  if (ld < HERO_LOG.radius + 1.2) {
    const inv = ld > 1e-9 ? 1 / ld : 0;
    best = Math.max(best, drift(ld - HERO_LOG.radius, lx * inv, lz * inv, 0.2));
  }
  return best;
}

/** The deepest windblown pile at (x, z): an oval dome stretched along the wind. */
export function pileDepth(x: number, z: number): number {
  let best = 0;
  for (const p of PILES) {
    const dx = x - p.x;
    const dz = z - p.z;
    const along = (dx * WIND.x + dz * WIND.z) / 1.35;
    const across = dx * WIND.z - dz * WIND.x;
    const d = Math.hypot(along, across);
    best = Math.max(best, p.depth * (1 - smoothstep(p.r * 0.25, p.r, d)));
  }
  return best;
}

const CURVE_STEP = 0.6;

/** 0..1: how much of a hollow (x, z) sits in, from the terrain's curvature. */
export function hollowAmount(x: number, z: number): number {
  const h = terrainHeight(x, z);
  const e = CURVE_STEP;
  const lap = (terrainHeight(x + e, z) + terrainHeight(x - e, z) + terrainHeight(x, z + e)
    + terrainHeight(x, z - e) - 4 * h) / (e * e);
  return smoothstep(0.01, 0.08, lap);
}

export function litterDepth(x: number, z: number): number {
  const open = LITTER_OPEN + 0.008 * (valueNoise2(x * 0.6, z * 0.6, 91) - 0.5);
  const d = open + 0.07 * hollowAmount(x, z) + Math.max(driftDepth(x, z), pileDepth(x, z));
  return Math.min(LITTER_MAX, Math.max(LITTER_MIN, d));
}

/** 1 where the worm crawls under the litter (thin), 0 where it rides on top (deep), smooth between. */
export function underAmount(depth: number): number {
  return 1 - smoothstep(UNDER_THIN, UNDER_DEEP, depth);
}

/**
 * Height of the solid litter mound above the soil: 0 where litter is thin (the worm slips
 * under single leaves), the full depth where it is deep (the worm rides on the pile). The
 * ground mesh rises by this, so deep piles read as solid mounds with leaves on top.
 */
export function litterMound(depth: number): number {
  return depth * (1 - underAmount(depth));
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run tests/unit/litterDepth.test.ts && npx tsc --noEmit`
Expected: PASS, 10 tests. `npx vitest run`: 30 files, 295 tests.

- [ ] **Step 5: Commit**

```bash
git add src/surface/litterDepth.ts tests/unit/litterDepth.test.ts
git commit -m "feat(surface): litter depth with hollows, drifts and windblown piles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Depth-weighted litter and the ground mound

Deep litter would leave leaves floating with nothing under them, so the ground mesh rises by the same "mound" the worm rides on (`litterMound`: 0 under thin litter, the full depth on deep piles), and leaves rest on it.

**Files:**
- Create: `tests/unit/litterPlacement.test.ts`
- Modify: `src/surface/litterDepth.ts`, `src/surface/leafLitter.ts`, `src/surface/leafLitterMesh.ts`, `src/surface/terrainMesh.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/litterPlacement.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { placeLeaves } from '../../src/surface/leafLitter';
import { buildLeafLitter } from '../../src/surface/leafLitterMesh';
import { buildTerrainGeometry } from '../../src/surface/terrainMesh';
import { PILES, litterDepth, litterMound } from '../../src/surface/litterDepth';
import { terrainHeight } from '../../src/surface/terrain';

describe('placeLeaves with a depth field', () => {
  const field = (x: number) => (x > 0 ? 0.2 : 0.02);

  it('puts many more leaves where the litter is deeper', () => {
    const leaves = placeLeaves(3000, 10, 1, field);
    expect(leaves).toHaveLength(3000);
    const deep = leaves.filter((l) => l.x > 0).length;
    expect(deep).toBeGreaterThan((3000 - deep) * 2);
  });

  it('rests leaves on the mound, in a thin loose layer', () => {
    for (const l of placeLeaves(500, 10, 2, field)) {
      expect(l.mound).toBeCloseTo(litterMound(field(l.x)), 12);
      expect(l.y).toBeGreaterThanOrEqual(0);
      expect(l.y).toBeLessThan(0.05);
    }
  });

  it('is deterministic, and any prefix is the same leaves', () => {
    expect(placeLeaves(50, 10, 3, field)).toEqual(placeLeaves(50, 10, 3, field));
    expect(placeLeaves(20, 10, 3, field)).toEqual(placeLeaves(50, 10, 3, field).slice(0, 20));
  });
});

describe('litter and ground on a pile', () => {
  const pile = PILES[0];

  it('the ground mesh rises by the mound over a pile', () => {
    const g = buildTerrainGeometry();
    const pos = g.getAttribute('position').array as Float32Array;
    let best = 0;
    let bestD = Infinity;
    for (let v = 0; v < pos.length; v += 3) {
      const d = Math.hypot(pos[v] - pile.x, pos[v + 2] - pile.z);
      if (d < bestD) { bestD = d; best = v; }
    }
    const x = pos[best];
    const z = pos[best + 2];
    expect(pos[best + 1]).toBeCloseTo(terrainHeight(x, z) + litterMound(litterDepth(x, z)), 5);
    expect(pos[best + 1] - terrainHeight(x, z)).toBeGreaterThan(0.15);
  });

  it('leaves near a pile centre lie on top of it', () => {
    const litter = buildLeafLitter(6000);
    const pos = litter.mesh.geometry.getAttribute('position').array as Float32Array;
    let near = 0;
    for (let v = 0; v < pos.length; v += 3) {
      const x = pos[v];
      const z = pos[v + 2];
      if (Math.hypot(x - pile.x, z - pile.z) > pile.r * 0.2) continue;
      near++;
      expect(pos[v + 1] - terrainHeight(x, z)).toBeGreaterThan(0.12);
    }
    expect(near).toBeGreaterThan(20);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/unit/litterPlacement.test.ts`
Expected: FAIL: `placeLeaves` ignores the depth field (no `mound`), and the pile tests fail (the ground and leaves sit at soil height).

- [ ] **Step 3: Add the ground height and normal**

In `src/surface/litterDepth.ts`:

Replace:

```ts
import { valueNoise2 } from '../core/noise';
import { terrainHeight } from './terrain';
import { treeSites } from './treeSites';
```

with:

```ts
import { valueNoise2 } from '../core/noise';
import type { Vec3 } from '../core/vec';
import { terrainHeight } from './terrain';
import { treeSites } from './treeSites';
```

Replace:

```ts
  return depth * (1 - underAmount(depth));
}
```

with:

```ts
  return depth * (1 - underAmount(depth));
}

/** The visible ground: the soil plus the solid litter mound. */
export function groundHeight(x: number, z: number): number {
  return terrainHeight(x, z) + litterMound(litterDepth(x, z));
}

const N_EPS = 0.05;

/** Unit normal of groundHeight, from central differences. */
export function groundNormal(x: number, z: number): Vec3 {
  const dx = (groundHeight(x + N_EPS, z) - groundHeight(x - N_EPS, z)) / (2 * N_EPS);
  const dz = (groundHeight(x, z + N_EPS) - groundHeight(x, z - N_EPS)) / (2 * N_EPS);
  const len = Math.hypot(dx, 1, dz);
  return { x: -dx / len, y: 1 / len, z: -dz / len };
}
```

- [ ] **Step 4: Depth-weighted placement**

Replace `src/surface/leafLitter.ts` with:

```ts
import { mulberry32 } from '../core/random';
import { LITTER_MAX, LITTER_OPEN, litterMound } from './litterDepth';

export type LeafKind = 'ash' | 'basswood' | 'aspen' | 'maple' | 'oak';
export const LEAF_KINDS: readonly LeafKind[] = ['ash', 'basswood', 'aspen', 'maple', 'oak'];

/** Fall colors, for art only. Meaning never depends on these. */
export const LEAF_COLORS: Record<LeafKind, string> = {
  ash: '#b8a03a',
  basswood: '#d9b23a',
  aspen: '#f2c230',
  maple: '#e0582a',
  oak: '#8a5a2b',
};

export interface LeafPlacement {
  x: number; z: number;
  /** Height of the solid litter mound under the leaf, above the soil. */
  mound: number;
  /** The leaf's layer in the loose litter above the mound; the lowest leaves are the dampest. */
  y: number;
  rotY: number; tilt: number; scale: number;
  kind: LeafKind;
}

/** Litter depth (m) at (x, z). */
export type DepthField = (x: number, z: number) => number;

/** One leaf deep everywhere. */
const ONE_LEAF: DepthField = () => LITTER_OPEN;

/**
 * Seeded leaf placement over a square. Deeper litter holds more leaves (a deep pile keeps about
 * three times as many as open ground) and stacks them higher: each leaf rests on the litter mound,
 * somewhere in the loose layer above it. Placement order is random, so any prefix is an even
 * thinning (the presets draw a prefix).
 */
export function placeLeaves(count: number, halfSize: number, seed = 1, depthAt: DepthField = ONE_LEAF): LeafPlacement[] {
  const r = mulberry32(seed);
  const out: LeafPlacement[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 400) {
    const x = (r() * 2 - 1) * halfSize;
    const z = (r() * 2 - 1) * halfSize;
    const depth = depthAt(x, z);
    if (r() > 0.3 + 0.7 * (depth / LITTER_MAX)) continue;
    const mound = litterMound(depth);
    out.push({
      x, z, mound,
      y: r() * Math.max(LITTER_OPEN, depth - mound) * 0.8,
      rotY: r() * Math.PI * 2,
      tilt: (r() - 0.5) * 0.5,
      scale: 0.6 + r() * 0.6,
      kind: LEAF_KINDS[Math.floor(r() * LEAF_KINDS.length)],
    });
  }
  return out;
}
```

- [ ] **Step 5: Leaves rest on the mound**

In `src/surface/leafLitterMesh.ts`:

Replace:

```ts
import { leafLift, leafNormal, type LeafForm } from './leafForm';
import { leafTint, LEAF_SIZE, LATERAL_VEINS } from './leafPalette';
import { terrainHeight, terrainNormal, WORLD_HALF } from './terrain';
import { makeShadeAt } from './treeShadows';
import { sharedLighting } from '../render/paintedMaterial';
```

with:

```ts
import { leafLift, leafNormal, type LeafForm } from './leafForm';
import { leafTint, LEAF_SIZE, LATERAL_VEINS } from './leafPalette';
import { terrainHeight, WORLD_HALF } from './terrain';
import { groundNormal, litterDepth } from './litterDepth';
import { makeShadeAt } from './treeShadows';
import { sharedLighting } from '../render/paintedMaterial';
```

Replace:

```ts
 */
export function buildLeafLitter(count: number, seed = 1): LeafLitter {
  const leaves = placeLeaves(count, WORLD_HALF, seed);
  let verts = 0;
  let idxCount = 0;
```

with:

```ts
 */
export function buildLeafLitter(count: number, seed = 1): LeafLitter {
  const leaves = placeLeaves(count, WORLD_HALF, seed, litterDepth);
  let verts = 0;
  let idxCount = 0;
```

Replace:

```ts
    const leafSeed = rng();

    const tn = terrainNormal(l.x, l.z);
    slope.setFromUnitVectors(UP, nrm.set(tn.x, tn.y, tn.z));
    q.setFromEuler(euler.set(l.tilt * 0.3, l.rotY, 0)).premultiply(slope);
    // Loose layers: each leaf at its own small height, so overlaps never z-fight.
    const lift = 0.006 + l.y * 0.4;
    tmp.set(l.x, terrainHeight(l.x, l.z) + lift, l.z);
    m.compose(tmp, q, scl.setScalar(size));

```

with:

```ts
    const leafSeed = rng();

    // Lie along the ground, including the slopes of leaf piles.
    const tn = groundNormal(l.x, l.z);
    slope.setFromUnitVectors(UP, nrm.set(tn.x, tn.y, tn.z));
    q.setFromEuler(euler.set(l.tilt * 0.3, l.rotY, 0)).premultiply(slope);
    // On the litter mound, in loose layers: each leaf at its own height, so overlaps never z-fight.
    tmp.set(l.x, terrainHeight(l.x, l.z) + l.mound + 0.006 + l.y, l.z);
    m.compose(tmp, q, scl.setScalar(size));

```

- [ ] **Step 6: The ground mesh rises by the mound**

In `src/surface/terrainMesh.ts`:

Replace:

```ts
import { createPaintedMaterial, sharedLighting } from '../render/paintedMaterial';
import { makeShadeAt } from './treeShadows';
import { terrainHeight, terrainNormal, WORLD_HALF } from './terrain';

/** Uniform grid spacing covers +-INNER; a few wide rings reach out to +-OUTER under the fog. */
```

with:

```ts
import { createPaintedMaterial, sharedLighting } from '../render/paintedMaterial';
import { makeShadeAt } from './treeShadows';
import { terrainHeight, WORLD_HALF } from './terrain';
import { groundHeight, groundNormal, litterDepth } from './litterDepth';

/** Uniform grid spacing covers +-INNER; a few wide rings reach out to +-OUTER under the fog. */
```

Replace:

```ts
const LOAM = new THREE.Color('#87582f');
const FAR = new THREE.Color('#5a4630');

const smooth = (a: number, b: number, v: number): number => {
```

with:

```ts
const LOAM = new THREE.Color('#87582f');
const FAR = new THREE.Color('#5a4630');
/** Packed, half-rotted leaves: the colour of a deep pile's body. */
const LITTER = new THREE.Color('#8a5a2e');

const smooth = (a: number, b: number, v: number): number => {
```

Replace:

```ts
      const x = lines[i];
      const z = lines[j];
      const h = terrainHeight(x, z);
      const nn = terrainNormal(x, z);
      pos[k] = x;
      pos[k + 1] = h;
```

with:

```ts
      const x = lines[i];
      const z = lines[j];
      // The soil plus the solid litter mound, so deep piles are real mounds under their leaves.
      const h = groundHeight(x, z);
      const nn = groundNormal(x, z);
      pos[k] = x;
      pos[k + 1] = h;
```

Replace:

```ts
      nor[k + 1] = nn.y;
      nor[k + 2] = nn.z;
      groundColor(x, z, h, c).multiplyScalar(shadeAt(x, z));
      col[k] = c.r;
      col[k + 1] = c.g;
```

with:

```ts
      nor[k + 1] = nn.y;
      nor[k + 2] = nn.z;
      groundColor(x, z, terrainHeight(x, z), c).lerp(LITTER, smooth(0.05, 0.2, litterDepth(x, z)) * 0.6);
      c.multiplyScalar(shadeAt(x, z));
      col[k] = c.r;
      col[k + 1] = c.g;
```

- [ ] **Step 7: Run and see it pass**

Run: `npx vitest run tests/unit/litterPlacement.test.ts tests/unit/leafLitter.test.ts && npx tsc --noEmit && npx vitest run`
Expected: PASS (5 + 3 tests); total 31 files, 300 tests. The existing `leafLitter.test.ts` still passes: with the default one-leaf field every leaf's layer `y` stays under 0.08.

- [ ] **Step 8: Commit**

```bash
git add src/surface/litterDepth.ts src/surface/leafLitter.ts src/surface/leafLitterMesh.ts src/surface/terrainMesh.ts tests/unit/litterPlacement.test.ts
git commit -m "feat(surface): deeper litter holds more leaves on a solid mound

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Worm surface: worm, shadow and camera heights

**Files:**
- Create: `src/worm/surfaceHeight.ts`, `tests/unit/surfaceHeight.test.ts`
- Modify: `src/game/crawl.ts`, `src/game/world.ts`, `src/main.ts`, `src/worm/wormMesh.ts`, `src/worm/wormShadow.ts`, `tests/unit/crawl.test.ts`, `tests/unit/wormMesh.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/surfaceHeight.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  wormSurface, bellyHeight, litterTop, BELLY_UNDER, BELLY_ON_TOP, type WormSurface,
} from '../../src/worm/surfaceHeight';
import { litterDepth, PILES, LITTER_MIN, UNDER_THIN, UNDER_DEEP } from '../../src/surface/litterDepth';
import { terrainHeight, PLAY_HALF, WORLD_HALF } from '../../src/surface/terrain';

describe('wormSurface', () => {
  it('is under the leaves on thin litter: on the soil', () => {
    expect(litterDepth(0, 0)).toBeLessThan(UNDER_THIN);
    const s = wormSurface(0, 0);
    expect(s.under).toBe(1);
    expect(s.y).toBeCloseTo(terrainHeight(0, 0), 12);
  });

  it('rides on top of deep piles: on the litter top', () => {
    for (const p of PILES) {
      expect(litterDepth(p.x, p.z)).toBeGreaterThan(UNDER_DEEP);
      const s = wormSurface(p.x, p.z);
      expect(s.under).toBe(0);
      expect(s.y).toBeCloseTo(terrainHeight(p.x, p.z) + litterDepth(p.x, p.z), 12);
    }
  });

  it('blends smoothly from the open onto a pile (1 mm steps)', () => {
    const p = PILES[0];
    let prev = wormSurface(0, 0);
    let prevY = prev.y;
    let prevU = prev.under;
    const n = Math.round(Math.hypot(p.x, p.z) / 0.001);
    for (let i = 1; i <= n; i++) {
      const s = wormSurface((p.x * i) / n, (p.z * i) / n);
      expect(Math.abs(s.y - prevY)).toBeLessThan(0.003);
      expect(Math.abs(s.under - prevU)).toBeLessThan(0.03);
      prevY = s.y;
      prevU = s.under;
    }
    expect(prevU).toBe(0);
  });

  it('is always finite, with under in [0, 1], and never below the soil', () => {
    for (let x = -WORLD_HALF - 4; x <= WORLD_HALF + 4; x += 0.41) {
      for (let z = -WORLD_HALF - 4; z <= WORLD_HALF + 4; z += 0.43) {
        const s = wormSurface(x, z);
        expect(Number.isFinite(s.y)).toBe(true);
        expect(s.under).toBeGreaterThanOrEqual(0);
        expect(s.under).toBeLessThanOrEqual(1);
        expect(s.y).toBeGreaterThanOrEqual(terrainHeight(x, z));
      }
    }
  });

  it('with leaf reaction off (Low) always rides on top', () => {
    for (let x = -PLAY_HALF; x <= PLAY_HALF; x += 1.3) {
      for (let z = -PLAY_HALF; z <= PLAY_HALF; z += 1.7) {
        const s = wormSurface(x, z, false);
        expect(s.under).toBe(0);
        expect(s.y).toBeCloseTo(terrainHeight(x, z) + litterDepth(x, z), 12);
        expect(s.y).toBeGreaterThanOrEqual(terrainHeight(x, z) + LITTER_MIN);
      }
    }
  });

  it('writes into and returns the object it is given', () => {
    const out: WormSurface = { y: 0, under: 0 };
    expect(wormSurface(1, 2, true, out)).toBe(out);
  });
});

describe('bellyHeight and litterTop', () => {
  it('puts the belly on the soil when under and over the top leaves when on top', () => {
    expect(bellyHeight({ y: 0.3, under: 1 })).toBeCloseTo(0.3 + BELLY_UNDER, 12);
    expect(bellyHeight({ y: 0.3, under: 0 })).toBeCloseTo(0.3 + BELLY_ON_TOP, 12);
  });
  it('the litter top is the soil plus the full litter depth', () => {
    expect(litterTop(3, 4)).toBeCloseTo(terrainHeight(3, 4) + litterDepth(3, 4), 12);
  });
});
```

In `tests/unit/crawl.test.ts`:

Replace:

```ts
import * as THREE from 'three';
import { Crawl, WORM_SEGMENTS, CAM_GROUND_MARGIN } from '../../src/game/crawl';
import { terrainHeight } from '../../src/surface/terrain';
import type { WormPose } from '../../src/worm/wormMesh';

```

with:

```ts
import * as THREE from 'three';
import { Crawl, WORM_SEGMENTS, CAM_GROUND_MARGIN } from '../../src/game/crawl';
import { bellyHeight, litterTop, wormSurface } from '../../src/worm/surfaceHeight';
import type { WormPose } from '../../src/worm/wormMesh';

```

Replace:

```ts
  });

  it('keeps the camera above the ground margin', () => {
    const c = new Crawl();
    for (let i = 0; i < 600; i++) {
      c.step(DT, { x: 0.6, y: 1 });
      expect(c.cam.pos.y).toBeGreaterThanOrEqual(terrainHeight(c.cam.pos.x, c.cam.pos.z) + CAM_GROUND_MARGIN - 1e-9);
    }
  });

```

with:

```ts
  });

  it('keeps the camera above the litter top plus its margin', () => {
    const c = new Crawl();
    for (let i = 0; i < 600; i++) {
      c.step(DT, { x: 0.6, y: 1 });
      expect(c.cam.pos.y).toBeGreaterThanOrEqual(litterTop(c.cam.pos.x, c.cam.pos.z) + CAM_GROUND_MARGIN - 1e-9);
    }
  });

  it('rests every segment on its own worm surface, and records under per segment', () => {
    const c = new Crawl();
    for (let i = 0; i < 240; i++) c.step(DT, { x: 0.3, y: 1 });
    c.body.forEach((s, i) => {
      const surf = wormSurface(s.x, s.z);
      expect(s.y).toBeCloseTo(bellyHeight(surf), 9);
      expect(c.under[i]).toBeCloseTo(surf.under, 6);
    });
  });

  it('with leaf reaction off, rides on top everywhere', () => {
    const c = new Crawl();
    c.setReaction(false);
    for (let i = 0; i < 120; i++) c.step(DT, { x: 0, y: 1 });
    c.body.forEach((s, i) => {
      expect(s.y).toBeCloseTo(bellyHeight(wormSurface(s.x, s.z, false)), 9);
      expect(c.under[i]).toBe(0);
    });
  });

```

In `tests/unit/wormMesh.test.ts`, append:

Replace:

```ts
  }
});
```

with:

```ts
  }
});

describe('HeroWorm contact shadow', () => {
  it('lies on the ground function it is given', () => {
    const worm = new HeroWorm(N, () => 0.5);
    worm.update({ spine: SPINES.straight, phase: 0, activity: 0, timeSec: 0 });
    const shadow = (worm.group.children as THREE.Mesh[]).find((o) => o.name === 'wormShadow')!;
    const pos = shadow.geometry.getAttribute('position').array as Float32Array;
    for (let v = 1; v < pos.length; v += 3) expect(pos[v]).toBeCloseTo(0.57, 6);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/surfaceHeight.test.ts tests/unit/crawl.test.ts tests/unit/wormMesh.test.ts`
Expected: FAIL: `surfaceHeight` is missing; `crawl.under`/`setReaction` do not exist; the shadow ignores the ground function.

- [ ] **Step 3: Implement the worm surface**

Create `src/worm/surfaceHeight.ts`:

```ts
import { terrainHeight } from '../surface/terrain';
import { litterDepth, underAmount } from '../surface/litterDepth';

export interface WormSurface {
  /** Height the worm rests on (m). */
  y: number;
  /** 1: crawling on the soil under the leaves; 0: riding on top of them. */
  under: number;
}

/**
 * The surface under the worm at (x, z) (spec 5.2): where the litter is thin (< 0.06) the worm
 * crawls on the soil beneath it (under = 1); where it is deep (> 0.12) it rides on top
 * (under = 0); smooth between. y = terrainHeight + litterDepth * (1 - under). With
 * `reaction` off (the Low preset) under is always 0, so the worm always rides on top.
 * Writes into `out`, so the per-step calls allocate nothing.
 */
export function wormSurface(
  x: number, z: number, reaction = true, out: WormSurface = { y: 0, under: 0 },
): WormSurface {
  const depth = litterDepth(x, z);
  const under = reaction ? underAmount(depth) : 0;
  out.y = terrainHeight(x, z) + depth * (1 - under);
  out.under = under;
  return out;
}

/** The belly line just touches the soil when under the leaves... */
export const BELLY_UNDER = 0.01;
/** ...and clears the top leaves when riding on them. */
export const BELLY_ON_TOP = 0.035;

/** Height of the worm's belly line (its simulated spine) over a surface. */
export function bellyHeight(s: WormSurface): number {
  return s.y + BELLY_UNDER + (BELLY_ON_TOP - BELLY_UNDER) * (1 - s.under);
}

/** Top of the leaf litter (the leaves themselves included): the camera keeps its margin over this. */
export function litterTop(x: number, z: number): number {
  return terrainHeight(x, z) + litterDepth(x, z);
}
```

- [ ] **Step 4: The contact shadow follows a ground function**

In `src/worm/wormShadow.ts`:

Replace:

```ts
import { createWormShadowMaterial } from './wormMaterial';

/** Height of the ribbon above the ground: just over most of the leaf litter. */
const SHADOW_LIFT = 0.07;
/** How far the shadow slides away from the sun, per unit of sun height. */
```

with:

```ts
import { createWormShadowMaterial } from './wormMaterial';

/** Height of a point of ground under the worm (m). */
export type GroundFn = (x: number, z: number) => number;

/** Height of the ribbon above the worm's surface: just over most of the leaf litter. */
const SHADOW_LIFT = 0.07;
/** How far the shadow slides away from the sun, per unit of sun height. */
```

Replace:

```ts
  private readonly rings: Int16Array;

  /** `m`: the tube's ring body coordinates; one shadow station every `step` rings. */
  constructor(m: Float32Array, step: number) {
    const stations = Math.floor((m.length - 1) / step) + 1;
    this.rings = new Int16Array(stations);
```

with:

```ts
  private readonly rings: Int16Array;

  /**
   * `m`: the tube's ring body coordinates; one shadow station every `step` rings. `groundAt`:
   * the surface the worm rests on, so the shadow follows it over and under the litter.
   */
  constructor(m: Float32Array, step: number, private readonly groundAt: GroundFn = terrainHeight) {
    const stations = Math.floor((m.length - 1) / step) + 1;
    this.rings = new Int16Array(stations);
```

Replace:

```ts
        const v = (q * 3 + e) * 3;
        out[v] = x;
        out[v + 1] = terrainHeight(x, z) + SHADOW_LIFT;
        out[v + 2] = z;
      }
```

with:

```ts
        const v = (q * 3 + e) * 3;
        out[v] = x;
        out[v + 1] = this.groundAt(x, z) + SHADOW_LIFT;
        out[v + 2] = z;
      }
```

In `src/worm/wormMesh.ts` (`BELLY_LIFT` is replaced by `bellyHeight`):

Replace:

```ts
} from './wormShape';
import { createWormMaterial } from './wormMaterial';
import { WormShadow } from './wormShadow';

const RINGS = 48;
```

with:

```ts
} from './wormShape';
import { createWormMaterial } from './wormMaterial';
import { WormShadow, type GroundFn } from './wormShadow';

const RINGS = 48;
```

Replace:

```ts
/** Widest body radius (world units). */
export const WORM_RADIUS = 0.115;
/** The belly rides this far above the ground, on top of the thinnest litter. */
export const BELLY_LIFT = 0.035;
/** Arc length the head and tail caps reach beyond the first and last spine points. */
const HEAD_EXT = 0.1;
```

with:

```ts
/** Widest body radius (world units). */
export const WORM_RADIUS = 0.115;
/** Arc length the head and tail caps reach beyond the first and last spine points. */
const HEAD_EXT = 0.1;
```

Replace:

```ts
  private readonly shadow: WormShadow;

  constructor(spinePoints: number) {
    this.spine = createSpine(spinePoints, 4);
    ringParams(this.m);
```

with:

```ts
  private readonly shadow: WormShadow;

  /** `groundAt`: the surface the worm rests on; its contact shadow is draped over it. */
  constructor(spinePoints: number, groundAt?: GroundFn) {
    this.spine = createSpine(spinePoints, 4);
    ringParams(this.m);
```

Replace:

```ts
    mesh.name = 'worm';

    this.shadow = new WormShadow(this.m, SHADOW_STEP);

    this.group.add(this.shadow.mesh, mesh);
```

with:

```ts
    mesh.name = 'worm';

    this.shadow = new WormShadow(this.m, SHADOW_STEP, groundAt);

    this.group.add(this.shadow.mesh, mesh);
```

- [ ] **Step 5: Every segment rests on its own surface; the camera clears the litter top**

In `src/game/crawl.ts`:

Replace:

```ts
import type * as THREE from 'three';
import type { Vec2, Vec3 } from '../core/vec';
import { terrainHeight } from '../surface/terrain';
import {
  createFollowCam, stepFollowCam, type FollowCamOptions, type FollowCamState,
```

with:

```ts
import type * as THREE from 'three';
import type { Vec2, Vec3 } from '../core/vec';
import {
  createFollowCam, stepFollowCam, type FollowCamOptions, type FollowCamState,
```

Replace:

```ts
import { clampToNeck, stepWorm, type WormMotion } from '../worm/locomotion';
import { advanceWave, type WaveState } from '../worm/wormShape';
import { BELLY_LIFT, WAVES, wormLength, type WormPose } from '../worm/wormMesh';
import { LOCOMOTION } from './drive';

```

with:

```ts
import { clampToNeck, stepWorm, type WormMotion } from '../worm/locomotion';
import { advanceWave, type WaveState } from '../worm/wormShape';
import { WAVES, wormLength, type WormPose } from '../worm/wormMesh';
import { bellyHeight, litterTop, wormSurface, type WormSurface } from '../worm/surfaceHeight';
import { LOCOMOTION } from './drive';

```

Replace:

```ts
/** Slow resting "breath" of the contraction wave, in waves per second. */
const BREATH_HZ = 0.22;
/** The camera never dips closer than this to the ground beneath it. */
export const CAM_GROUND_MARGIN = 0.5;
const CAM_OPTS: FollowCamOptions = {
```

with:

```ts
/** Slow resting "breath" of the contraction wave, in waves per second. */
const BREATH_HZ = 0.22;
/** The camera never dips closer than this to the litter top beneath it. */
export const CAM_GROUND_MARGIN = 0.5;
const CAM_OPTS: FollowCamOptions = {
```

Replace:

```ts
/**
 * The worm and its follow camera, stepped at the fixed simulation rate (moved from the Step 0
 * page). Keeps the previous step so rendering can interpolate by alpha.
 */
export class Crawl {
```

with:

```ts
/**
 * The worm and its follow camera, stepped at the fixed simulation rate (moved from the Step 0
 * page). Every body segment rests on wormSurface, so the worm slips under thin litter and
 * climbs onto piles head first. Keeps the previous step so rendering can interpolate by alpha.
 */
export class Crawl {
```

Replace:

```ts
  /** The head as last rendered (interpolated): leaf shaders and the detail layer centre on it. */
  readonly focus: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly prevBody: Vec3[];
  private readonly prevCam: Vec3;
```

with:

```ts
  /** The head as last rendered (interpolated): leaf shaders and the detail layer centre on it. */
  readonly focus: Vec3 = { x: 0, y: 0, z: 0 };
  /** Per segment, head first: 1 under the litter, 0 on top (for the leaves it disturbs). */
  readonly under = new Float32Array(WORM_SEGMENTS);
  /** Leaves react to the worm (off on Low: it always rides on top). */
  reaction = true;
  private readonly surf: WormSurface = { y: 0, under: 0 };
  private readonly prevBody: Vec3[];
  private readonly prevCam: Vec3;
```

Replace:

```ts

  constructor() {
    this.motion = { head: { x: 0, y: terrainHeight(0, 0) + BELLY_LIFT, z: 0 }, heading: 0 };
    this.body = createBody(WORM_SEGMENTS, SPACING, this.motion.head, this.motion.heading);
    this.cam = createFollowCam(this.motion.head, this.motion.heading, CAM_OPTS);
```

with:

```ts

  constructor() {
    this.motion = { head: { x: 0, y: 0, z: 0 }, heading: 0 };
    this.motion.head.y = this.rest(0, 0, 0);
    this.body = createBody(WORM_SEGMENTS, SPACING, this.motion.head, this.motion.heading);
    this.cam = createFollowCam(this.motion.head, this.motion.heading, CAM_OPTS);
```

Replace:

```ts
    this.prevYaw = this.cam.yaw;
    copy(this.focus, this.motion.head);
  }

```

with:

```ts
    this.prevYaw = this.cam.yaw;
    copy(this.focus, this.motion.head);
  }

  /** Switches leaf reaction (from the preset). */
  setReaction(on: boolean): void {
    this.reaction = on;
  }

  /** Belly height at (x, z) for segment `i`; records whether that segment is under the litter. */
  private rest(i: number, x: number, z: number): number {
    const s = wormSurface(x, z, this.reaction, this.surf);
    this.under[i] = s.under;
    return bellyHeight(s);
  }

```

Replace:

```ts
    this.motion = stepWorm(this.motion, this.move, dt, LOCOMOTION);
    const head = this.motion.head;
    // stepWorm stays flat and pure; the ground decides the height here.
    head.y = terrainHeight(head.x, head.z) + BELLY_LIFT;
    advanceWave(
      wave, Math.hypot(head.x - this.prevHead.x, head.z - this.prevHead.z), dt,
```

with:

```ts
    this.motion = stepWorm(this.motion, this.move, dt, LOCOMOTION);
    const head = this.motion.head;
    // stepWorm stays flat and pure; the litter decides the height here.
    head.y = this.rest(0, head.x, head.z);
    advanceWave(
      wave, Math.hypot(head.x - this.prevHead.x, head.z - this.prevHead.z), dt,
```

Replace:

```ts
    );
    followHead(body, head, SPACING);
    // Settle each trailing segment onto the ground. On these gentle slopes (< ~20 degrees)
    // this changes the 3D spacing by a few percent at most.
    for (let i = 1; i < body.length; i++) {
      const s = body[i];
      s.y = terrainHeight(s.x, s.z) + BELLY_LIFT;
    }
    this.cam = stepFollowCam(this.cam, head, this.motion.heading, dt, CAM_OPTS);
    const floor = terrainHeight(this.cam.pos.x, this.cam.pos.z) + CAM_GROUND_MARGIN;
    if (this.cam.pos.y < floor) this.cam.pos.y = floor;
  }
```

with:

```ts
    );
    followHead(body, head, SPACING);
    // Settle each trailing segment onto its own surface, so the body climbs a pile head first.
    // On these gentle slopes (< ~20 degrees) this changes the 3D spacing by a few percent.
    for (let i = 1; i < body.length; i++) {
      const s = body[i];
      s.y = this.rest(i, s.x, s.z);
    }
    this.cam = stepFollowCam(this.cam, head, this.motion.heading, dt, CAM_OPTS);
    const floor = litterTop(this.cam.pos.x, this.cam.pos.z) + CAM_GROUND_MARGIN;
    if (this.cam.pos.y < floor) this.cam.pos.y = floor;
  }
```

- [ ] **Step 6: Wire the preset's leaf reaction**

In `src/game/world.ts`:

Replace:

```ts
import { buildGroundProps, writeHeroLog, type GroundProps } from '../surface/groundProps';
import { HeroWorm, type WormPose } from '../worm/wormMesh';
import { WORM_SEGMENTS, type Crawl } from './crawl';

```

with:

```ts
import { buildGroundProps, writeHeroLog, type GroundProps } from '../surface/groundProps';
import { HeroWorm, type WormPose } from '../worm/wormMesh';
import { wormSurface, type WormSurface } from '../worm/surfaceHeight';
import { WORM_SEGMENTS, type Crawl } from './crawl';

```

Replace:

```ts
  const atmosphere = buildAtmosphere();
  // The hero worm: no eyes (spec 8.3); it is posed from the simulated spine every frame.
  const worm = new HeroWorm(WORM_SEGMENTS);
  const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };

```

with:

```ts
  const atmosphere = buildAtmosphere();
  // The hero worm: no eyes (spec 8.3); it is posed from the simulated spine every frame.
  let reaction = true;
  const surf: WormSurface = { y: 0, under: 0 };
  // The contact shadow lies on the same surface the worm rests on.
  const worm = new HeroWorm(WORM_SEGMENTS, (x, z) => wormSurface(x, z, reaction, surf).y);
  const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };

```

Replace:

```ts
    scene, litter, props, atmosphere, worm,
    apply(spec) {
      litter.setCount(spec.litter);
      props.setDensity(spec.clutter);
```

with:

```ts
    scene, litter, props, atmosphere, worm,
    apply(spec) {
      reaction = spec.reaction;
      litter.setCount(spec.litter);
      props.setDensity(spec.clutter);
```

In `src/main.ts`:

Replace:

```ts
    renderer.setPixelRatio(pixelRatioFor(s, window.devicePixelRatio));
    world.apply(s);
    updateResolution();
    dirty = true;
```

with:

```ts
    renderer.setPixelRatio(pixelRatioFor(s, window.devicePixelRatio));
    world.apply(s);
    crawl.setReaction(s.reaction);
    updateResolution();
    dirty = true;
```

- [ ] **Step 7: Run and see it pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS, 32 files, 311 tests (`surfaceHeight` 8, `crawl` +2, `wormMesh` +1).

- [ ] **Step 8: Commit**

```bash
git add src/worm/surfaceHeight.ts src/worm/wormShadow.ts src/worm/wormMesh.ts src/game/crawl.ts src/game/world.ts src/main.ts tests/unit/surfaceHeight.test.ts tests/unit/crawl.test.ts tests/unit/wormMesh.test.ts
git commit -m "feat(worm): slip under thin litter and ride over deep piles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Disturbance map (pure)

**Files:**
- Create: `src/surface/disturbance.ts`, `tests/unit/disturbance.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/disturbance.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createDisturbance, recentre, stamp, decay, clearDisturbance, packDisturbance, cellAt,
  originX, originZ, DIST_N, DIST_SPAN, DIST_CELL, BODY_R, PUSH_R, type DisturbanceMap,
} from '../../src/surface/disturbance';

const sum = (m: DisturbanceMap) => m.data.reduce((a, v) => a + Math.abs(v), 0);
const cell = (m: DisturbanceMap, x: number, z: number) => {
  const k = cellAt(m, x, z);
  return k < 0 ? null : Array.from(m.data.subarray(k, k + 4));
};

describe('disturbance map', () => {
  it('covers 8 x 8 m with 64 x 64 cells', () => {
    expect(DIST_N).toBe(64);
    expect(DIST_SPAN).toBe(8);
    expect(DIST_CELL).toBeCloseTo(0.125, 12);
    expect(createDisturbance().data.length).toBe(64 * 64 * 4);
  });

  it('recentres so the point lies in the middle cell', () => {
    const m = createDisturbance();
    recentre(m, 3.3, -1.1);
    expect(originX(m)).toBeLessThanOrEqual(3.3 - DIST_SPAN / 2 + DIST_CELL);
    expect(originX(m)).toBeGreaterThan(3.3 - DIST_SPAN / 2 - DIST_CELL);
    expect(originZ(m)).toBeLessThanOrEqual(-1.1 - DIST_SPAN / 2 + DIST_CELL);
    expect(cellAt(m, 3.3, -1.1)).toBe(((DIST_N / 2) * DIST_N + DIST_N / 2) * 4);
  });

  describe('stamp', () => {
    it('lifts the cells under the body, more when the worm is under the leaves', () => {
      const under = createDisturbance();
      const onTop = createDisturbance();
      stamp(under, 0.06, 0.06, 0, 1, 1, 1);
      stamp(onTop, 0.06, 0.06, 0, 1, 1, 0);
      expect(cell(under, 0.06, 0.06)![2]).toBeGreaterThan(0.9);
      expect(cell(onTop, 0.06, 0.06)![2]).toBeGreaterThan(0.1);
      expect(cell(onTop, 0.06, 0.06)![2]).toBeLessThan(0.3);
    });

    it('pushes beside the body away from the spine, with nothing on the spine itself', () => {
      const m = createDisturbance();
      // Spine along +z through x = 0.0625 (a cell centre).
      stamp(m, 0.0625, 0.0625, 0, 1, 1, 1);
      const right = cell(m, 0.0625 - 0.2, 0.0625)!;
      const left = cell(m, 0.0625 + 0.2, 0.0625)!;
      const centre = cell(m, 0.0625, 0.0625)!;
      expect(Math.hypot(centre[0], centre[1])).toBeLessThan(1e-9);
      expect(right[0]).toBeLessThan(-0.1);
      expect(left[0]).toBeGreaterThan(0.1);
      expect(Math.abs(right[1])).toBeLessThan(1e-9);
    });

    it('stamps the head hardest, and nothing beyond PUSH_R', () => {
      const head = createDisturbance();
      const body = createDisturbance();
      stamp(head, 0, 0, 0, 1, 1, 1);
      stamp(body, 0, 0, 0, 1, 0.5, 1);
      expect(sum(head)).toBeGreaterThan(sum(body));
      expect(cell(head, PUSH_R + DIST_CELL, 0)!.every((v) => v === 0)).toBe(true);
    });

    it('stamping the same point twice changes nothing more', () => {
      const m = createDisturbance();
      stamp(m, 0.3, 0.2, 0.6, 0.8, 1, 0.5);
      const once = Float32Array.from(m.data);
      stamp(m, 0.3, 0.2, 0.6, 0.8, 1, 0.5);
      expect(m.data).toEqual(once);
    });

    it('keeps every value within its range', () => {
      const m = createDisturbance();
      for (let t = 0; t < 200; t++) stamp(m, Math.sin(t) * 2, Math.cos(t * 0.7) * 2, Math.cos(t), Math.sin(t), 1, (t % 3) / 2);
      for (let k = 0; k < m.data.length; k += 4) {
        expect(Math.hypot(m.data[k], m.data[k + 1])).toBeLessThanOrEqual(1 + 1e-6);
        expect(m.data[k + 2]).toBeLessThanOrEqual(1);
        expect(m.data[k + 3]).toBeLessThanOrEqual(1);
        expect(m.data[k + 2]).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('decay', () => {
    it('halves a trail in about 6 s and settles it in about 20 s', () => {
      const m = createDisturbance();
      stamp(m, 0, 0, 0, 1, 1, 1);
      const k = cellAt(m, 0, 0);
      const start = m.data[k + 3];
      for (let t = 0; t < 6 * 60; t++) decay(m, 1 / 60);
      expect(m.data[k + 3] / start).toBeCloseTo(0.5, 2);
      for (let t = 0; t < 14 * 60; t++) decay(m, 1 / 60);
      expect(m.data[k + 3] / start).toBeLessThan(0.11);
    });

    it('lets the drape fall back within about a second', () => {
      const m = createDisturbance();
      stamp(m, 0, 0, 0, 1, 1, 1);
      const k = cellAt(m, 0, 0);
      for (let t = 0; t < 60; t++) decay(m, 1 / 60);
      expect(m.data[k + 2]).toBeLessThan(0.11);
    });

    it('never goes negative', () => {
      const m = createDisturbance();
      stamp(m, 0, 0, 0, 1, 1, 1);
      for (let t = 0; t < 3000; t++) decay(m, 1 / 60);
      for (let k = 2; k < m.data.length; k += 4) expect(m.data[k]).toBeGreaterThanOrEqual(0);
    });
  });

  describe('scrolling', () => {
    it('keeps each stamp at its world place, with no loss and no doubling', () => {
      const m = createDisturbance();
      recentre(m, 0, 0);
      stamp(m, 0.5, -0.4, 0, 1, 1, 1);
      const before = cell(m, 0.5, -0.4);
      const total = sum(m);
      // Walk a few metres in odd directions, whole and part cells at a time.
      for (const [x, z] of [[0.3, 0.1], [1.1, -0.6], [-0.7, 1.4], [2.0, 2.0], [-2.5, -1.0]]) {
        recentre(m, x, z);
        expect(cell(m, 0.5, -0.4)).toEqual(before);
        expect(sum(m)).toBeCloseTo(total, 6);
      }
    });

    it('clears what scrolls off and exposes only empty cells', () => {
      const m = createDisturbance();
      recentre(m, 0, 0);
      stamp(m, 0, 0, 0, 1, 1, 1);
      recentre(m, 10, 0);
      expect(sum(m)).toBe(0);
      recentre(m, 0, 0);
      expect(sum(m)).toBe(0);
    });

    it('a big jump clears everything', () => {
      const m = createDisturbance();
      stamp(m, 0, 0, 0, 1, 1, 1);
      recentre(m, 100, -100);
      expect(sum(m)).toBe(0);
    });
  });

  it('clearDisturbance empties the map', () => {
    const m = createDisturbance();
    stamp(m, 0, 0, 0, 1, 1, 1);
    clearDisturbance(m);
    expect(sum(m)).toBe(0);
  });

  it('packs zero push to exactly 128 and full values to the ends', () => {
    const m = createDisturbance();
    const out = new Uint8Array(m.data.length);
    packDisturbance(m, out);
    expect(Array.from(out.subarray(0, 4))).toEqual([128, 128, 0, 0]);
    m.data.set([1, -1, 1, 0.5], 0);
    packDisturbance(m, out);
    expect(Array.from(out.subarray(0, 4))).toEqual([255, 1, 255, 128]);
    // The shader decodes (v - 128) / 127.
    expect((out[0] - 128) / 127).toBe(1);
  });

  it('BODY_R and PUSH_R fit the worm (radius 0.115)', () => {
    expect(BODY_R).toBeGreaterThan(0.115);
    expect(PUSH_R).toBeGreaterThan(BODY_R * 2);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/unit/disturbance.test.ts`
Expected: FAIL with "Cannot find module '../../src/surface/disturbance'".

- [ ] **Step 3: Implement**

Create `src/surface/disturbance.ts`:

```ts
/**
 * The leaf disturbance map (spec 5.3): a 64 x 64 grid covering 8 x 8 m, centred on the worm and
 * scrolled in whole cells as it moves. Each cell holds an outward push (x, z), a lift (the
 * drape over a body under the leaves) and a trail (how recently it was disturbed). Pure data
 * and math, no WebGL; the renderer packs it into a small texture once per frame.
 */
export const DIST_N = 64;
export const DIST_SPAN = 8;
export const DIST_CELL = DIST_SPAN / DIST_N;
/** Push and trail halve every 6 s, so a trail settles back in about 20 s. */
export const TRAIL_HALF_LIFE = 6;
/** The drape falls back fast behind the body, so it follows the worm instead of leaving a hump. */
export const LIFT_HALF_LIFE = 0.3;
/** Cells within this of a body point are under the body. */
export const BODY_R = 0.12;
/** Leaves beside the body are pushed out to this distance. */
export const PUSH_R = 0.32;

/** Floats per cell: push x, push z, lift, trail. */
const K = 4;

export interface DisturbanceMap {
  /** DIST_N * DIST_N cells, row-major (z rows of x cells), K floats each. */
  readonly data: Float32Array;
  /** World cell index of the grid's first column (x) and first row (z). */
  ci: number;
  cj: number;
}

export function createDisturbance(): DisturbanceMap {
  return { data: new Float32Array(DIST_N * DIST_N * K), ci: -DIST_N / 2, cj: -DIST_N / 2 };
}

/** World x, z of the grid's corner (where cell 0, 0 starts). */
export function originX(m: DisturbanceMap): number {
  return m.ci * DIST_CELL;
}
export function originZ(m: DisturbanceMap): number {
  return m.cj * DIST_CELL;
}

/** Index of the first float of the cell holding world point (x, z), or -1 outside the grid. */
export function cellAt(m: DisturbanceMap, x: number, z: number): number {
  const i = Math.floor(x / DIST_CELL) - m.ci;
  const j = Math.floor(z / DIST_CELL) - m.cj;
  if (i < 0 || j < 0 || i >= DIST_N || j >= DIST_N) return -1;
  return (j * DIST_N + i) * K;
}

/**
 * Scrolls the grid in whole cells so (x, z) lies in its centre cell. Data moves with the grid
 * (each cell keeps its world place); newly exposed edge cells are cleared. Nothing doubles.
 */
export function recentre(m: DisturbanceMap, x: number, z: number): void {
  const ci = Math.floor(x / DIST_CELL) - DIST_N / 2;
  const cj = Math.floor(z / DIST_CELL) - DIST_N / 2;
  const dx = ci - m.ci;
  const dz = cj - m.cj;
  if (dx === 0 && dz === 0) return;
  m.ci = ci;
  m.cj = cj;
  const d = m.data;
  if (Math.abs(dx) >= DIST_N || Math.abs(dz) >= DIST_N) {
    d.fill(0);
    return;
  }
  const row = DIST_N * K;
  if (dz > 0) {
    d.copyWithin(0, dz * row);
    d.fill(0, (DIST_N - dz) * row);
  } else if (dz < 0) {
    d.copyWithin(-dz * row, 0, (DIST_N + dz) * row);
    d.fill(0, 0, -dz * row);
  }
  if (dx !== 0) {
    for (let j = 0; j < DIST_N; j++) {
      const r0 = j * row;
      if (dx > 0) {
        d.copyWithin(r0, r0 + dx * K, r0 + row);
        d.fill(0, r0 + (DIST_N - dx) * K, r0 + row);
      } else {
        d.copyWithin(r0 - dx * K, r0, r0 + (DIST_N + dx) * K);
        d.fill(0, r0, r0 - dx * K);
      }
    }
  }
}

const smoothstep = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Stamps one body point at (x, z), its spine running along unit (tx, tz). Cells under the body
 * get lift (more when `under` is high: the leaves drape over it) and every nearby cell gets a
 * push away from the spine and a fresh trail. `strength` 1 is the head (it stamps hardest).
 * Values only ever rise to the new stamp (max), so stamping twice is the same as once.
 */
export function stamp(
  m: DisturbanceMap, x: number, z: number, tx: number, tz: number, strength: number, under: number,
): void {
  const d = m.data;
  const reach = Math.ceil(PUSH_R / DIST_CELL);
  const i0 = Math.floor(x / DIST_CELL) - m.ci;
  const j0 = Math.floor(z / DIST_CELL) - m.cj;
  const lift = strength * (0.15 + 0.85 * under);
  for (let j = Math.max(0, j0 - reach); j <= Math.min(DIST_N - 1, j0 + reach); j++) {
    for (let i = Math.max(0, i0 - reach); i <= Math.min(DIST_N - 1, i0 + reach); i++) {
      const cx = (m.ci + i + 0.5) * DIST_CELL - x;
      const cz = (m.cj + j + 0.5) * DIST_CELL - z;
      const dist = Math.hypot(cx, cz);
      if (dist >= PUSH_R) continue;
      const k = (j * DIST_N + i) * K;
      // Signed distance across the spine (which side of the body the cell is on).
      const side = cx * tz - cz * tx;
      const push = strength * (1 - smoothstep(BODY_R * 0.5, PUSH_R, dist)) * Math.min(1, Math.abs(side) / BODY_R);
      if (push > Math.hypot(d[k], d[k + 1])) {
        const s = side >= 0 ? 1 : -1;
        d[k] = tz * s * push;
        d[k + 1] = -tx * s * push;
      }
      d[k + 2] = Math.max(d[k + 2], lift * (1 - smoothstep(BODY_R * 0.6, BODY_R * 1.4, dist)));
      d[k + 3] = Math.max(d[k + 3], strength * (1 - smoothstep(BODY_R, PUSH_R, dist)));
    }
  }
}

/** Every cell eases back toward zero: push and trail with TRAIL_HALF_LIFE, lift with LIFT_HALF_LIFE. */
export function decay(m: DisturbanceMap, dt: number): void {
  const slow = Math.pow(0.5, dt / TRAIL_HALF_LIFE);
  const fast = Math.pow(0.5, dt / LIFT_HALF_LIFE);
  const d = m.data;
  for (let k = 0; k < d.length; k += K) {
    d[k] *= slow;
    d[k + 1] *= slow;
    d[k + 2] *= fast;
    d[k + 3] *= slow;
  }
}

export function clearDisturbance(m: DisturbanceMap): void {
  m.data.fill(0);
}

/**
 * Packs the map into RGBA bytes for the leaf shaders: R, G = push x, z as 128 + 127 * v (so 0
 * is exactly 128), B = lift, A = trail (0..255).
 */
export function packDisturbance(m: DisturbanceMap, out: Uint8Array): void {
  const d = m.data;
  for (let k = 0; k < d.length; k += K) {
    out[k] = Math.round(128 + 127 * Math.max(-1, Math.min(1, d[k])));
    out[k + 1] = Math.round(128 + 127 * Math.max(-1, Math.min(1, d[k + 1])));
    out[k + 2] = Math.round(255 * Math.max(0, Math.min(1, d[k + 2])));
    out[k + 3] = Math.round(255 * Math.max(0, Math.min(1, d[k + 3])));
  }
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run tests/unit/disturbance.test.ts && npx tsc --noEmit`
Expected: PASS, 16 tests. `npx vitest run`: 33 files, 327 tests.

- [ ] **Step 5: Commit**

```bash
git add src/surface/disturbance.ts tests/unit/disturbance.test.ts
git commit -m "feat(surface): scrolling leaf disturbance map with stamping and decay

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Disturbance texture and leaf shader (drape, push, trail)

The map is stamped every simulation step, packed into a 64×64 RGBA8 `DataTexture` once per rendered frame (the only per-frame upload, skipped when nothing changed), and sampled by the litter's vertex shader. Turning leaf reaction off (Low) clears the map once and stops stamping.

**Files:**
- Create: `src/render/groundUniforms.ts`, `src/render/leafGlsl.ts`, `tests/unit/groundUniforms.test.ts`
- Modify: `src/render/leafMaterial.ts`, `src/surface/fallingLeaves.ts`, `src/game/crawl.ts`, `src/game/world.ts`, `tests/unit/crawl.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/groundUniforms.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { groundUniforms, setFocus, uploadDisturbance } from '../../src/render/groundUniforms';
import { createDisturbance, recentre, stamp, DIST_CELL } from '../../src/surface/disturbance';
import { createLeafMaterial } from '../../src/render/leafMaterial';
import { sharedLighting } from '../../src/render/paintedMaterial';

describe('groundUniforms', () => {
  it('setFocus stores the head and snaps the wrap centre to the 1 m grid', () => {
    setFocus(2.6, 0.1, -3.4);
    expect(groundUniforms.uFocus.value.toArray()).toEqual([2.6, 0.1, -3.4]);
    expect(groundUniforms.uWrapCentre.value.toArray()).toEqual([3, -3]);
  });

  it('uploadDisturbance packs into the same texture and moves the origin with the grid', () => {
    const tex = groundUniforms.uDisturb.value;
    const data = tex.image.data;
    const version = tex.version;
    const m = createDisturbance();
    recentre(m, 1, 1);
    stamp(m, 1, 1, 0, 1, 1, 1);
    uploadDisturbance(m);
    expect(tex.image.data).toBe(data);
    expect(tex.version).toBeGreaterThan(version);
    expect(groundUniforms.uDistOrigin.value.x).toBeCloseTo(m.ci * DIST_CELL, 12);
    expect(groundUniforms.uDistOrigin.value.y).toBeCloseTo(m.cj * DIST_CELL, 12);
    expect(Array.from(data as Uint8Array).some((v, k) => k % 4 === 2 && v > 200)).toBe(true);
  });
});

describe('createLeafMaterial', () => {
  it('the floor litter reads the shared disturbance map', () => {
    const m = createLeafMaterial();
    expect(m.defines).toHaveProperty('DISTURB');
    expect(m.uniforms.uDisturb).toBe(groundUniforms.uDisturb);
    expect(m.uniforms.uLightDir).toBe(sharedLighting.uLightDir);
    expect(m.vertexShader).toContain('disturb(wp.xyz)');
  });
  it('the falling leaves do not', () => {
    const m = createLeafMaterial('falling');
    expect(m.defines).toHaveProperty('FALLING');
    expect(m.defines).not.toHaveProperty('DISTURB');
  });
});
```

In `tests/unit/crawl.test.ts`, append:

Replace:

```ts
  });
});
```

with:

```ts
  });
});

describe('Crawl leaf disturbance', () => {
  const total = (c: Crawl) => c.disturbance.data.reduce((a, v) => a + Math.abs(v), 0);

  it('stamps the body into the map while it crawls, and marks it for upload', () => {
    const c = new Crawl();
    c.disturbed = false;
    for (let i = 0; i < 30; i++) c.step(DT, { x: 0, y: 1 });
    expect(c.disturbed).toBe(true);
    expect(total(c)).toBeGreaterThan(1);
  });

  it('leaves a trail behind that settles back', () => {
    const c = new Crawl();
    for (let i = 0; i < 60; i++) c.step(DT, { x: 0, y: 1 });
    const fresh = total(c);
    for (let i = 0; i < 60 * 30; i++) c.step(DT, { x: 0, y: 0 });
    // Resting still stamps the body, but the trail behind it has faded.
    expect(total(c)).toBeLessThan(fresh);
  });

  it('turning reaction off clears the map and stops stamping', () => {
    const c = new Crawl();
    for (let i = 0; i < 30; i++) c.step(DT, { x: 0, y: 1 });
    c.disturbed = false;
    c.setReaction(false);
    expect(c.disturbed).toBe(true);
    expect(total(c)).toBe(0);
    c.disturbed = false;
    for (let i = 0; i < 30; i++) c.step(DT, { x: 0, y: 1 });
    expect(total(c)).toBe(0);
    expect(c.disturbed).toBe(false);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/groundUniforms.test.ts tests/unit/crawl.test.ts`
Expected: FAIL: `groundUniforms` is missing; `crawl.disturbance` does not exist.

- [ ] **Step 3: Shared uniforms and the per-frame upload**

Create `src/render/groundUniforms.ts`:

```ts
import * as THREE from 'three';
import { DIST_N, DIST_CELL, packDisturbance, type DisturbanceMap } from '../surface/disturbance';

const distBytes = new Uint8Array(DIST_N * DIST_N * 4);
// An empty map: zero push is 128 in the packed form.
for (let k = 0; k < distBytes.length; k += 4) {
  distBytes[k] = 128;
  distBytes[k + 1] = 128;
}
const distTexture = new THREE.DataTexture(distBytes, DIST_N, DIST_N, THREE.RGBAFormat, THREE.UnsignedByteType);
distTexture.magFilter = THREE.LinearFilter;
distTexture.minFilter = THREE.LinearFilter;
distTexture.needsUpdate = true;

/**
 * Uniforms shared by reference by every leaf material (and the near clutter): where the worm
 * is, and the disturbance map around it. Updated once per rendered frame.
 */
export const groundUniforms = {
  /** The worm's head as rendered (interpolated). */
  uFocus: { value: new THREE.Vector3() },
  /** uFocus snapped to the 1 m grid: the centre the near-worm layers wrap around. */
  uWrapCentre: { value: new THREE.Vector2() },
  /** The disturbance map, packed by packDisturbance. */
  uDisturb: { value: distTexture },
  /** World x, z of the disturbance grid's corner. */
  uDistOrigin: { value: new THREE.Vector2(-DIST_N * DIST_CELL / 2, -DIST_N * DIST_CELL / 2) },
};

export function setFocus(x: number, y: number, z: number): void {
  groundUniforms.uFocus.value.set(x, y, z);
  groundUniforms.uWrapCentre.value.set(Math.round(x), Math.round(z));
}

/** The one per-frame texture upload: 16 KB into the same texture, no reallocation. */
export function uploadDisturbance(m: DisturbanceMap): void {
  packDisturbance(m, distBytes);
  distTexture.needsUpdate = true;
  groundUniforms.uDistOrigin.value.set(m.ci * DIST_CELL, m.cj * DIST_CELL);
}
```

- [ ] **Step 4: The disturbance GLSL**

Create `src/render/leafGlsl.ts`:

```ts
import { DIST_SPAN } from '../surface/disturbance';

/** A leaf under the body lifts this high at full lift: one body width, so it drapes over it. */
export const DRAPE_HEIGHT = 0.22;
/** How far a fully pushed leaf slides outward. */
export const PUSH_SLIDE = 0.07;
/** How much a pushed leaf's near side rises, tilting it outward. */
export const PUSH_TILT = 0.05;
/** How deep the settling furrow sinks a freshly disturbed leaf. */
export const FURROW_DEPTH = 0.004;

const f = (v: number): string => v.toFixed(4);

/**
 * Vertex GLSL: moves a leaf vertex at world position p by the disturbance map near the worm.
 * Under the body leaves lift into a drape; beside it they tilt and slide outward; behind it the
 * decaying trail leaves a shallow furrow. Leaves outside the 8 m window skip the texture fetch.
 * Needs uniforms uDisturb (packed by packDisturbance) and uDistOrigin.
 */
export const DISTURB_GLSL = /* glsl */ `
  uniform sampler2D uDisturb;
  uniform vec2 uDistOrigin;
  vec3 disturb(vec3 p) {
    vec2 uv = (p.xz - uDistOrigin) / ${DIST_SPAN.toFixed(1)};
    vec2 e = abs(uv - 0.5) * 2.0;
    float edge = 1.0 - smoothstep(0.75, 0.95, max(e.x, e.y));
    if (edge <= 0.0) return p;
    vec4 d = texture2D(uDisturb, uv);
    vec2 push = (d.xy * 255.0 - 128.0) / 127.0;
    p.xz += push * (${f(PUSH_SLIDE)} * edge);
    p.y += (d.z * ${f(DRAPE_HEIGHT)} + length(push) * ${f(PUSH_TILT)} - d.w * ${f(FURROW_DEPTH)}) * edge;
    return p;
  }
`;
```

- [ ] **Step 5: Leaf material variants; the litter reads the map**

In `src/render/leafMaterial.ts`:

Replace:

```ts
  sharedLighting, PAINTED_VERTEX_GLSL, PAINTED_LIGHT_GLSL, GRADE_GLSL,
} from './paintedMaterial';

/**
```

with:

```ts
  sharedLighting, PAINTED_VERTEX_GLSL, PAINTED_LIGHT_GLSL, GRADE_GLSL,
} from './paintedMaterial';
import { groundUniforms } from './groundUniforms';
import { DISTURB_GLSL } from './leafGlsl';

/**
```

Replace:

```ts
 * With FALLING defined, aFall (seed, spin rate, box x, box z) animates each leaf down
 * through the light around the camera, looping, entirely in the vertex shader.
 */
const vertexShader = /* glsl */ `
```

with:

```ts
 * With FALLING defined, aFall (seed, spin rate, box x, box z) animates each leaf down
 * through the light around the camera, looping, entirely in the vertex shader.
 * With DISTURB defined, leaves near the worm drape, slide and settle by the disturbance map.
 */
const vertexShader = /* glsl */ `
```

Replace:

```ts
  vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
  vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
  #endif

```

with:

```ts
  vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
  vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
  #endif

  #ifdef DISTURB
  ${DISTURB_GLSL}
  #endif

```

Replace:

```ts
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vNormalW = normalize(mat3(modelMatrix) * nrm);
    #endif
    vPosW = wp.xyz;
```

with:

```ts
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vNormalW = normalize(mat3(modelMatrix) * nrm);
    #endif
    #ifdef DISTURB
      wp.xyz = disturb(wp.xyz);
    #endif
    vPosW = wp.xyz;
```

Replace:

```ts
`;

export function createLeafMaterial(falling = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...sharedLighting },
    defines: falling ? { FALLING: '' } : {},
    vertexShader,
    fragmentShader,
```

with:

```ts
`;

/** Which leaves: the floor litter (reacts to the worm) or the falling leaves (animated). */
export type LeafVariant = 'litter' | 'falling';

const DEFINES: Record<LeafVariant, Record<string, string>> = {
  litter: { DISTURB: '' },
  falling: { FALLING: '' },
};

export function createLeafMaterial(variant: LeafVariant = 'litter'): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...sharedLighting, ...groundUniforms },
    defines: { ...DEFINES[variant] },
    vertexShader,
    fragmentShader,
```

In `src/surface/fallingLeaves.ts`:

Replace:

```ts
  g.setAttribute('aFall', new THREE.BufferAttribute(fall, 4));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  const mesh = new THREE.Mesh(g, createLeafMaterial(true));
  // Positions are made in the shader around the camera.
  mesh.frustumCulled = false;
```

with:

```ts
  g.setAttribute('aFall', new THREE.BufferAttribute(fall, 4));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  const mesh = new THREE.Mesh(g, createLeafMaterial('falling'));
  // Positions are made in the shader around the camera.
  mesh.frustumCulled = false;
```

- [ ] **Step 6: The crawl stamps the body every step**

In `src/game/crawl.ts`:

Replace:

```ts
import { WAVES, wormLength, type WormPose } from '../worm/wormMesh';
import { bellyHeight, litterTop, wormSurface, type WormSurface } from '../worm/surfaceHeight';
import { LOCOMOTION } from './drive';

```

with:

```ts
import { WAVES, wormLength, type WormPose } from '../worm/wormMesh';
import { bellyHeight, litterTop, wormSurface, type WormSurface } from '../worm/surfaceHeight';
import {
  createDisturbance, recentre, stamp, decay, clearDisturbance, type DisturbanceMap,
} from '../surface/disturbance';
import { LOCOMOTION } from './drive';

```

Replace:

```ts
  /** Leaves react to the worm (off on Low: it always rides on top). */
  reaction = true;
  private readonly surf: WormSurface = { y: 0, under: 0 };
  private readonly prevBody: Vec3[];
```

with:

```ts
  /** Leaves react to the worm (off on Low: it always rides on top). */
  reaction = true;
  /** The leaves the worm has disturbed: stamped every step, decaying back. */
  readonly disturbance: DisturbanceMap = createDisturbance();
  /** The disturbance map changed since the renderer last uploaded it. */
  disturbed = true;
  private readonly surf: WormSurface = { y: 0, under: 0 };
  private readonly prevBody: Vec3[];
```

Replace:

```ts
  }

  /** Switches leaf reaction (from the preset). */
  setReaction(on: boolean): void {
    this.reaction = on;
  }

```

with:

```ts
  }

  /** Switches leaf reaction (from the preset). Off clears the map, and stamping stops. */
  setReaction(on: boolean): void {
    if (on === this.reaction) return;
    this.reaction = on;
    if (!on) {
      clearDisturbance(this.disturbance);
      this.disturbed = true;
    }
  }

  /** Stamps the body into the disturbance map: every segment and the midpoints between them. */
  private disturbLeaves(dt: number): void {
    const m = this.disturbance;
    const b = this.body;
    decay(m, dt);
    recentre(m, b[0].x, b[0].z);
    const last = b.length - 1;
    for (let k = 0; k <= 2 * last; k++) {
      const i = k >> 1;
      const j = Math.min(last, i + (k & 1));
      const x = (b[i].x + b[j].x) / 2;
      const z = (b[i].z + b[j].z) / 2;
      // Spine direction here, toward the head.
      const a = b[Math.max(0, i - 1)];
      const c = b[Math.min(last, j + 1)];
      let tx = a.x - c.x;
      let tz = a.z - c.z;
      const len = Math.hypot(tx, tz);
      if (len > 1e-6) {
        tx /= len;
        tz /= len;
      } else {
        tx = Math.sin(this.motion.heading);
        tz = Math.cos(this.motion.heading);
      }
      const strength = k === 0 ? 1 : 0.6 - 0.3 * (k / (2 * last));
      stamp(m, x, z, tx, tz, strength, (this.under[i] + this.under[j]) / 2);
    }
    this.disturbed = true;
  }

```

Replace:

```ts
    const floor = litterTop(this.cam.pos.x, this.cam.pos.z) + CAM_GROUND_MARGIN;
    if (this.cam.pos.y < floor) this.cam.pos.y = floor;
  }

```

with:

```ts
    const floor = litterTop(this.cam.pos.x, this.cam.pos.z) + CAM_GROUND_MARGIN;
    if (this.cam.pos.y < floor) this.cam.pos.y = floor;
    if (this.reaction) this.disturbLeaves(dt);
  }

```

- [ ] **Step 7: The world uploads it and moves the focus each frame**

In `src/game/world.ts`:

Replace:

```ts
import { buildAtmosphere, type Atmosphere } from '../render/atmosphere';
import { setRimLight } from '../render/paintedMaterial';
import { PRESETS, type PresetSpec } from '../render/graphics';
import { buildTerrain } from '../surface/terrainMesh';
```

with:

```ts
import { buildAtmosphere, type Atmosphere } from '../render/atmosphere';
import { setRimLight } from '../render/paintedMaterial';
import { setFocus, uploadDisturbance } from '../render/groundUniforms';
import { PRESETS, type PresetSpec } from '../render/graphics';
import { buildTerrain } from '../surface/terrainMesh';
```

Replace:

```ts
      crawl.interpolate(alpha, timeSec, pose, camera);
      worm.update(pose);
    },
  };
```

with:

```ts
      crawl.interpolate(alpha, timeSec, pose, camera);
      worm.update(pose);
      setFocus(crawl.focus.x, crawl.focus.y, crawl.focus.z);
      if (crawl.disturbed) {
        uploadDisturbance(crawl.disturbance);
        crawl.disturbed = false;
      }
    },
  };
```

- [ ] **Step 8: Run and see it pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS, 34 files, 334 tests.

- [ ] **Step 9: Check it in the browser**

Run: `npm run build && npx playwright test`
Expected: 6 passed. The first speed-test test fails on any console error, which is how Three reports a shader that does not compile, so this also proves the new GLSL compiles.

- [ ] **Step 10: Commit**

```bash
git add src/render/groundUniforms.ts src/render/leafGlsl.ts src/render/leafMaterial.ts src/surface/fallingLeaves.ts src/game/crawl.ts src/game/world.ts tests/unit/groundUniforms.test.ts tests/unit/crawl.test.ts
git commit -m "feat(leaves): leaves drape over, slide off and trail behind the worm

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Detail leaf layer

> NOTE (post-Task 13): the realism fix after Task 13 changed the disturbance interface; adapt the steps below (and Tasks 16, 21, 23) to it.
>
> 1. The GLSL entry point is now `vec3 disturb(vec3 p, vec4 anchor, float dip, inout vec3 n)`:
>    - Each leaf moves as one rigid piece about `anchor` = (centre x, centre z, radius, rest height above the ground the worm rests on).
>    - `dip` = max(0, rest − the vertex's height above `meshGroundHeight` at its own x, z) is how far that vertex lies below the leaf's rest plane; a lifted leaf raises it.
>    - `n` (world normal) is tilted to match.
>    - It reads the map 5 times (centre and ±1 cell on x and z, central differences) and returns at once when the uniform `uLeafReact` is 0 (Low).
>    - The litter passes the per-vertex attributes `aAnchor` (vec4) and `aDip` (float), declared under `#ifdef DISTURB` in `leafMaterial.ts`, and calls it as `vec3 nW = vNormalW; wp.xyz = disturb(wp.xyz, aAnchor, aDip, nW); vNormalW = nW;`.
>    - The detail variant has neither attribute. Declare them only for non-DETAIL builds (`#if defined(DISTURB) && !defined(DETAIL)`), and have `detailPosition` produce the anchor (the wrapped home x, z; radius = the shape's farthest vertex times `aDetail.w * fade`; rest = the height above the ground it adds) and a dip (0 if it rests flat), then pass those instead.
>    - `disturbVertex` in `leafGlsl.ts` is the TS twin, built from the same rounded constants. Keep it in step with any GLSL change: `tests/unit/leafGlsl.test.ts` replays it on the real litter against the real worm (400 placements, 5 mm clearance).
>    - **Task 21:** `LeafBuffers`/the leaf writer and both chunk meshes (full and the 6-triangle far shape) MUST carry `aAnchor` and `aDip`:
>      - `aAnchor` holds world x, z (not chunk-local, even when chunk positions are local), the radius measured from that LOD shape's own written vertices, and the rest height.
>      - `aDip` is computed from the world vertex position.
>      - Only the `litter` material reads them; `plain` and `far` ignore them.
> 2. The map's channels are now R path nearness (1 on the path, linear to 0 at `DIST_REACH` = 1.6 m), G unused, B body nearness (re-stamped every step), A trail freshness (halving every 6 s). The signature is now `stamp(m, x, z, under)`; `BODY_R`, `PUSH_R`, `LIFT_HALF_LIFE`, `FURROW_DEPTH` and `PUSH_TILT` are gone, and `DIST_REACH`, `ON_TOP_DISTANCE`, `DRAPE_FLAT`, `DRAPE_FOOT`, `FURROW_HALF`, `TRAIL_DARKEN`, `drapeProfile`, `disturbVertex`, `groundUniforms.uLeafReact` and `setLeafReaction` (called from `world.apply`) are new. The map centres on body segment 7, not the head.
> 3. Lifted leaves now rise up to about 0.5 m and slide up to 0.2 m, so Task 21's `DRAPE_MARGIN` must be at least 0.6. (Landed as 0.75 in `litterChunks.ts`: extreme probes moved a leaf vertex 0.71 m.)
> 4. Task 23's tuning ranges are out of date: `DRAPE_HEIGHT` must stay at 0.265 or more (tests/unit/leafGlsl.test.ts checks clearance over the worm), and `PUSH_SLIDE` is now the furrow's largest slide (0.2).
> 5. `createPaintedMaterial({ trail: true })` (the terrain) darkens the soil along a fresh trail from the same map.

A second leaf layer of smaller, more curled, higher-vertex leaves within 6 m of the worm. Each leaf has a fixed home in a repeating 13 m world tile; the vertex shader draws the copy nearest the worm's position snapped to a 1 m grid (`uWrapCentre`) and shrinks leaves to nothing from 5 to 6 m away from the worm's smooth position (`uFocus`). A leaf only jumps (by a whole tile) once it is at least 6 m away, where it is already invisible, so nothing pops and the CPU does no work. Leaves rest on the litter read from a baked texture (mound, depth and trunk shade, built once).

**Files:**
- Create: `src/render/wrap.ts`, `src/surface/detailShape.ts`, `src/render/litterTexture.ts`, `src/surface/detailLeaves.ts`, `tests/unit/wrap.test.ts`, `tests/unit/detailShape.test.ts`, `tests/unit/litterTexture.test.ts`, `tests/unit/detailLeaves.test.ts`
- Modify: `src/render/leafGlsl.ts`, `src/render/leafMaterial.ts`, `src/game/world.ts`

- [ ] **Step 1: Write the failing wrap test**

Create `tests/unit/wrap.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { wrapAround, WRAP_GLSL } from '../../src/render/wrap';

describe('wrapAround', () => {
  it('lands within half a box of the centre', () => {
    for (let c = -30; c <= 30; c += 0.77) {
      for (let b = 0; b < 1; b += 0.093) {
        const x = wrapAround(b, c, 13);
        expect(x).toBeGreaterThanOrEqual(c - 6.5 - 1e-9);
        expect(x).toBeLessThan(c + 6.5 + 1e-9);
      }
    }
  });

  it('is a copy of the item home, a whole number of boxes away', () => {
    for (const c of [-21.3, -2, 0, 4.4, 17.9]) {
      const k = (wrapAround(0.37, c, 13) - 0.37 * 13) / 13;
      expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-9);
    }
  });

  it('stays put while the centre moves, and jumps a whole box only past the far edge', () => {
    // Home 3 in a 10 m box: copies at -7, 3, 13.
    for (let c = -1.9; c < 7.85; c += 0.1) expect(wrapAround(0.3, c, 10)).toBeCloseTo(3, 9);
    expect(wrapAround(0.3, 8.1, 10)).toBeCloseTo(13, 9);
    expect(wrapAround(0.3, -2.1, 10)).toBeCloseTo(-7, 9);
  });

  it('has a GLSL twin with the same formula', () => {
    expect(WRAP_GLSL).toContain('mod(base * box - centre + box * 0.5, box) - box * 0.5');
  });
});
```

Run: `npx vitest run tests/unit/wrap.test.ts`
Expected: FAIL with "Cannot find module '../../src/render/wrap'".

- [ ] **Step 2: Implement the wrap**

Create `src/render/wrap.ts`:

```ts
/**
 * World-anchored wrapping for layers that live only near the worm (detail leaves, near
 * clutter): each item has a fixed home in a repeating `box`-sized tile of the world and is
 * drawn at the copy of that home nearest `centre`. Items stay put as the centre moves; one only
 * jumps (by a whole box) when it crosses the far edge, where the layer has faded it out.
 */

/** One axis: the copy of home `base` (0..1 of the box) nearest `centre`. */
export function wrapAround(base: number, centre: number, box: number): number {
  const v = base * box - centre + box * 0.5;
  return centre + (v - Math.floor(v / box) * box) - box * 0.5;
}

/** GLSL twin of wrapAround for both axes (GLSL mod is x - y * floor(x / y), like the TS above). */
export const WRAP_GLSL = /* glsl */ `
  vec2 wrapAround(vec2 base, vec2 centre, float box) {
    return centre + mod(base * box - centre + box * 0.5, box) - box * 0.5;
  }
`;
```

Run: `npx vitest run tests/unit/wrap.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 3: Write the failing detail-shape test**

Create `tests/unit/detailShape.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { detailShape } from '../../src/surface/detailShape';
import { leafShape } from '../../src/surface/leafShapes';
import { LEAF_KINDS } from '../../src/surface/leafLitter';

const area = (p: Float32Array, a: number, b: number, c: number) =>
  ((p[b * 2] - p[a * 2]) * (p[c * 2 + 1] - p[a * 2 + 1]) - (p[c * 2] - p[a * 2]) * (p[b * 2 + 1] - p[a * 2 + 1])) / 2;

describe('detailShape', () => {
  for (const kind of LEAF_KINDS) {
    describe(kind, () => {
      const base = leafShape(kind);
      const d = detailShape(kind);

      it('keeps the outline, base and tip', () => {
        expect(d.outline).toBe(base.outline);
        expect(d.base).toBe(base.base);
        expect(d.tip).toBe(base.tip);
        expect(Array.from(d.points.subarray(0, base.outline * 2))).toEqual(Array.from(base.points.subarray(0, base.outline * 2)));
      });

      it('has more vertices than the litter leaf (except oak, already detailed)', () => {
        if (kind === 'oak') expect(d).toBe(base);
        else {
          expect(d.points.length / 2).toBeGreaterThan(base.points.length / 2);
          expect(d.indices.length / 3).toBeGreaterThan(base.indices.length / 3);
          expect(d.indices.length / 3).toBeLessThanOrEqual(2 * base.indices.length / 3 + 2);
        }
      });

      it('uses every vertex, only valid indices, and covers the same area', () => {
        const np = d.points.length / 2;
        const used = new Set<number>();
        for (const i of d.indices) {
          expect(i).toBeLessThan(np);
          used.add(i);
        }
        expect(used.size).toBe(np);
        let a0 = 0;
        for (let t = 0; t < base.indices.length; t += 3) a0 += Math.abs(area(base.points, base.indices[t], base.indices[t + 1], base.indices[t + 2]));
        let a1 = 0;
        for (let t = 0; t < d.indices.length; t += 3) a1 += area(d.points, d.indices[t], d.indices[t + 1], d.indices[t + 2]);
        expect(a1).toBeCloseTo(a0, 6);
      });

      it('vein weights stay in [0, 1]', () => {
        for (const v of d.vein) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      });
    });
  }
});
```

Run: `npx vitest run tests/unit/detailShape.test.ts`
Expected: FAIL with "Cannot find module '../../src/surface/detailShape'".

- [ ] **Step 4: Implement the higher-vertex silhouettes**

Create `src/surface/detailShape.ts`:

```ts
import { leafShape, type LeafShape } from './leafShapes';
import { LEAF_KINDS, type LeafKind } from './leafLitter';

/** The inner ring sits this far out from the fan centre toward every other outline point. */
const RING = 0.55;

/**
 * A leaf silhouette with more vertices for the close-up detail layer, so curl and cup bend
 * smoothly. Fan-triangulated shapes (all but oak) gain an inner ring through every other
 * outline point, about doubling the triangles; oak's midrib strips already have interior
 * points and are returned as they are. Same outline, base and tip indices. Pure.
 */
function ringed(s: LeafShape): LeafShape {
  const n = s.outline;
  const centre = n; // fanShape puts the centre right after the outline.
  const m = Math.ceil(n / 2);
  const cx = s.points[centre * 2];
  const cy = s.points[centre * 2 + 1];
  const points = new Float32Array((n + 1 + m) * 2);
  const vein = new Float32Array(n + 1 + m);
  points.set(s.points.subarray(0, (n + 1) * 2));
  vein.set(s.vein.subarray(0, n + 1));
  for (let j = 0; j < m; j++) {
    const o = (2 * j) % n;
    points[(n + 1 + j) * 2] = cx + (s.points[o * 2] - cx) * RING;
    points[(n + 1 + j) * 2 + 1] = cy + (s.points[o * 2 + 1] - cy) * RING;
    // Halfway along a main vein ray it is still a vein.
    vein[n + 1 + j] = (s.vein[o] + s.vein[centre]) / 2;
  }
  const idx: number[] = [];
  const ring = (j: number) => n + 1 + (j % m);
  for (let j = 0; j < m; j++) {
    const a = 2 * j;
    const rj = ring(j);
    const rn = ring(j + 1);
    idx.push(centre, rj, rn);
    if (a + 2 <= n) {
      idx.push(rj, a % n, (a + 1) % n, rj, (a + 1) % n, rn, rn, (a + 1) % n, (a + 2) % n);
    } else {
      // Odd outline: the last run has one edge, back to outline point 0 (ring 0's spoke).
      idx.push(rj, a % n, (a + 1) % n, rj, (a + 1) % n, rn);
    }
  }
  return { points, outline: n, indices: new Uint16Array(idx), vein, base: s.base, tip: s.tip };
}

const cache = new Map<LeafKind, LeafShape>();

/** The (cached, shared) detail silhouette for a species. Treat it as read-only. */
export function detailShape(kind: LeafKind): LeafShape {
  let s = cache.get(kind);
  if (!s) {
    const base = leafShape(kind);
    s = kind === 'oak' ? base : ringed(base);
    cache.set(kind, s);
  }
  return s;
}

/** Every species, for tests and the hero leaf mesh. */
export const DETAIL_KINDS: readonly LeafKind[] = LEAF_KINDS;
```

Run: `npx vitest run tests/unit/detailShape.test.ts`
Expected: PASS, 20 tests (4 per species).

- [ ] **Step 5: Write the failing litter-texture test**

Create `tests/unit/litterTexture.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { litterTextureData, texelCentre, getLitterTexture, LITTER_TEX_N, LITTER_SPAN } from '../../src/render/litterTexture';
import { litterDepth, litterMound, LITTER_MAX, PILES } from '../../src/surface/litterDepth';

describe('baked litter texture', () => {
  const n = 64;
  const data = litterTextureData(n);

  it('covers the world, texel centres inside it', () => {
    expect(LITTER_SPAN).toBe(40);
    expect(texelCentre(0, n)).toBeCloseTo(-20 + 40 / n / 2, 12);
    expect(texelCentre(n - 1, n)).toBeCloseTo(20 - 40 / n / 2, 12);
  });

  it('stores mound and depth at each texel centre (within one 8-bit step)', () => {
    const step = LITTER_MAX / 255;
    for (let j = 0; j < n; j += 7) {
      for (let i = 0; i < n; i += 5) {
        const x = texelCentre(i, n);
        const z = texelCentre(j, n);
        const k = (j * n + i) * 4;
        const d = litterDepth(x, z);
        expect(Math.abs((data[k] / 255) * LITTER_MAX - litterMound(d))).toBeLessThanOrEqual(step);
        expect(Math.abs((data[k + 1] / 255) * LITTER_MAX - d)).toBeLessThanOrEqual(step);
        expect(data[k + 2]).toBeGreaterThan(0);
        expect(data[k + 3]).toBe(255);
      }
    }
  });

  it('shows the piles', () => {
    const p = PILES[0];
    const i = Math.floor((p.x / LITTER_SPAN + 0.5) * n);
    const j = Math.floor((p.z / LITTER_SPAN + 0.5) * n);
    expect(data[(j * n + i) * 4]).toBeGreaterThan(100);
  });

  it('is built once and shared', () => {
    const t = getLitterTexture();
    expect(getLitterTexture()).toBe(t);
    expect(t.image.width).toBe(LITTER_TEX_N);
  });
});
```

Run: `npx vitest run tests/unit/litterTexture.test.ts`
Expected: FAIL with "Cannot find module '../../src/render/litterTexture'".

- [ ] **Step 6: Implement the baked litter texture**

Create `src/render/litterTexture.ts`:

```ts
import * as THREE from 'three';
import { litterDepth, litterMound, LITTER_MAX } from '../surface/litterDepth';
import { WORLD_HALF } from '../surface/terrain';
import { makeShadeAt } from '../surface/treeShadows';
import { sharedLighting } from './paintedMaterial';

/** Texels per side of the baked litter map: 0.16 m each over the 40 m world. */
export const LITTER_TEX_N = 256;
export const LITTER_SPAN = 2 * WORLD_HALF;

/** World x (or z) at the centre of texel i. */
export function texelCentre(i: number, n = LITTER_TEX_N): number {
  return ((i + 0.5) / n - 0.5) * LITTER_SPAN;
}

/**
 * The litter baked for shaders that place things near the worm on the GPU (detail leaves, near
 * clutter): R = litter mound / LITTER_MAX, G = litter depth / LITTER_MAX, B = baked trunk shade
 * (light multiplier), A = 255. Row j holds z = texelCentre(j). Built once; never re-uploaded.
 */
export function litterTextureData(n = LITTER_TEX_N): Uint8Array {
  const out = new Uint8Array(n * n * 4);
  const shadeAt = makeShadeAt(sharedLighting.uLightDir.value);
  for (let j = 0; j < n; j++) {
    const z = texelCentre(j, n);
    for (let i = 0; i < n; i++) {
      const x = texelCentre(i, n);
      const d = litterDepth(x, z);
      const k = (j * n + i) * 4;
      out[k] = Math.round((litterMound(d) / LITTER_MAX) * 255);
      out[k + 1] = Math.round((d / LITTER_MAX) * 255);
      out[k + 2] = Math.round(shadeAt(x, z) * 255);
      out[k + 3] = 255;
    }
  }
  return out;
}

let texture: THREE.DataTexture | null = null;

/** The shared baked litter texture (built on first use). */
export function getLitterTexture(): THREE.DataTexture {
  if (!texture) {
    texture = new THREE.DataTexture(litterTextureData(), LITTER_TEX_N, LITTER_TEX_N, THREE.RGBAFormat, THREE.UnsignedByteType);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
  }
  return texture;
}

/** GLSL: litterAt(xz) = (mound m, depth m, trunk shade). Needs uniform uLitter. */
export const LITTER_GLSL = /* glsl */ `
  vec3 litterAt(vec2 xz) {
    vec4 t = texture2D(uLitter, xz / ${LITTER_SPAN.toFixed(1)} + 0.5);
    return vec3(t.rg * ${LITTER_MAX.toFixed(4)}, t.b);
  }
`;
```

Run: `npx vitest run tests/unit/litterTexture.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Write the failing detail-leaves test**

Create `tests/unit/detailLeaves.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildDetailLeaves } from '../../src/surface/detailLeaves';
import { DETAIL_BOX } from '../../src/render/leafGlsl';
import { PRESETS } from '../../src/render/graphics';

describe('detail leaves', () => {
  const d = buildDetailLeaves(300);
  const g = d.mesh.geometry;

  it('is one mesh placed by the shader, with a home for every vertex', () => {
    expect(d.mesh.frustumCulled).toBe(false);
    expect(d.mesh.material).toHaveProperty('defines.DETAIL');
    expect(d.mesh.material).toHaveProperty('defines.DISTURB');
    const n = g.getAttribute('position').count;
    expect(g.getAttribute('aDetail').count).toBe(n);
    const a = g.getAttribute('aDetail').array as Float32Array;
    for (let k = 0; k < a.length; k += 4) {
      expect(a[k]).toBeGreaterThanOrEqual(0);
      expect(a[k]).toBeLessThan(1);
      expect(a[k + 1]).toBeGreaterThanOrEqual(0);
      expect(a[k + 1]).toBeLessThan(1);
      expect(a[k + 3]).toBeGreaterThan(0.3);
      expect(a[k + 3]).toBeLessThan(1.1);
    }
  });

  it('every attribute value is finite', () => {
    for (const name of ['position', 'normal', 'aColor', 'aLeaf', 'aLeaf2', 'aDetail']) {
      expect((g.getAttribute(name).array as Float32Array).every(Number.isFinite)).toBe(true);
    }
  });

  it('draws a whole-leaf prefix and hides itself at zero', () => {
    d.setCount(300);
    const all = g.drawRange.count;
    expect(all).toBe(g.index!.count);
    d.setCount(150);
    expect(g.drawRange.count).toBeGreaterThan(all * 0.3);
    expect(g.drawRange.count).toBeLessThan(all * 0.7);
    expect(g.drawRange.count % 3).toBe(0);
    expect(d.mesh.visible).toBe(true);
    d.setCount(0);
    expect(d.mesh.visible).toBe(false);
  });

  it('covers the 6 m fade circle with its 13 m tile, and Ultra builds 2,500', () => {
    expect(DETAIL_BOX / 2).toBeGreaterThanOrEqual(6.5);
    expect(buildDetailLeaves().max).toBe(PRESETS.ultra.detail);
  });
});
```

Run: `npx vitest run tests/unit/detailLeaves.test.ts`
Expected: FAIL with "Cannot find module '../../src/surface/detailLeaves'".

- [ ] **Step 8: The detail GLSL**

In `src/render/leafGlsl.ts`:

Replace:

```ts
import { DIST_SPAN } from '../surface/disturbance';

/** A leaf under the body lifts this high at full lift: one body width, so it drapes over it. */
```

with:

```ts
import { DIST_SPAN } from '../surface/disturbance';
import { WRAP_GLSL } from './wrap';
import { LITTER_GLSL } from './litterTexture';

/** Side of the world tile the detail leaves repeat in (m); they fade out from 5 to 6 m. */
export const DETAIL_BOX = 13;

/** A leaf under the body lifts this high at full lift: one body width, so it drapes over it. */
```

Replace:

```ts
  }
`;
```

with:

```ts
  }
`;

/**
 * Vertex GLSL for the detail layer: the copy of the leaf's home nearest the worm (snapped to a
 * 1 m grid), shrunk to nothing from 5 to 6 m away, turned by its yaw, scaled by its size and
 * laid on the litter (soil + mound + a thin loose layer). Each vertex follows the ground under
 * it. Writes the baked trunk shade to `shade`. Needs terrainHeight (TERRAIN_GLSL), aLeaf2 and
 * uniforms uFocus, uWrapCentre and uLitter.
 */
export const DETAIL_GLSL = /* glsl */ `
  uniform vec3 uFocus;
  uniform vec2 uWrapCentre;
  uniform sampler2D uLitter;
  attribute vec4 aDetail;
  ${WRAP_GLSL}
  ${LITTER_GLSL}
  vec4 detailPosition(inout vec3 n, out float shade) {
    vec2 home = wrapAround(aDetail.xy, uWrapCentre, ${DETAIL_BOX.toFixed(1)});
    float fade = 1.0 - smoothstep(5.0, 6.0, distance(home, uFocus.xz));
    float c = cos(aDetail.z);
    float s = sin(aDetail.z);
    vec3 p = position * (aDetail.w * fade);
    p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
    n = vec3(c * n.x + s * n.z, n.y, -s * n.x + c * n.z);
    vec2 xz = home + p.xz;
    vec3 lit = litterAt(xz);
    shade = lit.z;
    float rest = 0.008 + aLeaf2.y * max(0.02, lit.y - lit.x) * 0.6;
    return vec4(xz.x, terrainHeight(xz) + lit.x + rest + p.y, xz.y, 1.0);
  }
`;
```

- [ ] **Step 9: The `detail` leaf material variant**

In `src/render/leafMaterial.ts`:

Replace:

```ts
} from './paintedMaterial';
import { groundUniforms } from './groundUniforms';
import { DISTURB_GLSL } from './leafGlsl';

/**
```

with:

```ts
} from './paintedMaterial';
import { groundUniforms } from './groundUniforms';
import { DISTURB_GLSL, DETAIL_GLSL } from './leafGlsl';
import { getLitterTexture } from './litterTexture';

/**
```

Replace:

```ts
 * through the light around the camera, looping, entirely in the vertex shader.
 * With DISTURB defined, leaves near the worm drape, slide and settle by the disturbance map.
 */
const vertexShader = /* glsl */ `
```

with:

```ts
 * through the light around the camera, looping, entirely in the vertex shader.
 * With DISTURB defined, leaves near the worm drape, slide and settle by the disturbance map.
 * With DETAIL defined, aDetail (home x, z in the wrap tile, yaw, size) places each leaf of the
 * close-up layer around the worm in the vertex shader.
 */
const vertexShader = /* glsl */ `
```

Replace:

```ts
  ${PAINTED_VERTEX_GLSL}

  #ifdef FALLING
  uniform float uTime;
  attribute vec4 aFall;
  ${TERRAIN_GLSL}
  const float BOX = 12.0;
  const float FALL_H = 6.5;
```

with:

```ts
  ${PAINTED_VERTEX_GLSL}

  #if defined(FALLING) || defined(DETAIL)
  ${TERRAIN_GLSL}
  #endif

  #ifdef FALLING
  uniform float uTime;
  attribute vec4 aFall;
  const float BOX = 12.0;
  const float FALL_H = 6.5;
```

Replace:

```ts
  vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
  vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
  #endif

```

with:

```ts
  vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
  vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
  #endif

  #ifdef DETAIL
  ${DETAIL_GLSL}
  #endif

```

Replace:

```ts
      vec4 wp = vec4(centre + p * fade, 1.0);
      vNormalW = normalize(nrm);
    #else
      vec4 wp = modelMatrix * vec4(position, 1.0);
```

with:

```ts
      vec4 wp = vec4(centre + p * fade, 1.0);
      vNormalW = normalize(nrm);
    #elif defined(DETAIL)
      float shade;
      vec4 wp = detailPosition(nrm, shade);
      vNormalW = normalize(nrm);
    #else
      vec4 wp = modelMatrix * vec4(position, 1.0);
```

Replace:

```ts
    vPosW = wp.xyz;
    vColor = aColor;
    vLeaf = aLeaf;
    vLat = aLeaf2.x;
```

with:

```ts
    vPosW = wp.xyz;
    vColor = aColor;
    #ifdef DETAIL
      vColor.rgb *= shade;
    #endif
    vLeaf = aLeaf;
    vLat = aLeaf2.x;
```

Replace:

```ts
`;

/** Which leaves: the floor litter (reacts to the worm) or the falling leaves (animated). */
export type LeafVariant = 'litter' | 'falling';

const DEFINES: Record<LeafVariant, Record<string, string>> = {
  litter: { DISTURB: '' },
  falling: { FALLING: '' },
};

export function createLeafMaterial(variant: LeafVariant = 'litter'): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...sharedLighting, ...groundUniforms },
    defines: { ...DEFINES[variant] },
    vertexShader,
```

with:

```ts
`;

/**
 * Which leaves: the floor litter and the close-up detail layer (both react to the worm), or the
 * falling leaves (animated).
 */
export type LeafVariant = 'litter' | 'falling' | 'detail';

const DEFINES: Record<LeafVariant, Record<string, string>> = {
  litter: { DISTURB: '' },
  falling: { FALLING: '' },
  detail: { DETAIL: '', DISTURB: '' },
};

export function createLeafMaterial(variant: LeafVariant = 'litter'): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...sharedLighting,
      ...groundUniforms,
      // Only the detail layer needs the baked litter, so only it pays for building it.
      ...(variant === 'detail' ? { uLitter: { value: getLitterTexture() } } : {}),
    },
    defines: { ...DEFINES[variant] },
    vertexShader,
```

- [ ] **Step 10: The detail mesh**

Create `src/surface/detailLeaves.ts`:

```ts
import * as THREE from 'three';
import { mulberry32 } from '../core/random';
import type { Vec3 } from '../core/vec';
import { createLeafMaterial } from '../render/leafMaterial';
import { PRESETS } from '../render/graphics';
import { LEAF_KINDS } from './leafLitter';
import { detailShape } from './detailShape';
import { leafLift, leafNormal, type LeafForm } from './leafForm';
import { leafTint, LEAF_SIZE, LATERAL_VEINS } from './leafPalette';

export interface DetailLeaves {
  mesh: THREE.Mesh;
  /** Leaves built: the most it can draw. */
  readonly max: number;
  /** Draws the first `n` leaves; hides the mesh at 0. */
  setCount(n: number): void;
}

/**
 * Smaller, more curled, higher-vertex leaves covering about 6 m around the worm (spec 5.5). One
 * static mesh in leaf-local space, built once: each leaf's home in a DETAIL_BOX world tile, its yaw
 * and size are attributes, and the vertex shader places the copy nearest the worm (snapped to a
 * 1 m grid), so the CPU does no work as the worm moves. Reads the disturbance map too.
 */
export function buildDetailLeaves(count = PRESETS.ultra.detail, seed = 3): DetailLeaves {
  const rng = mulberry32(seed);
  const kinds = Array.from({ length: count }, () => LEAF_KINDS[Math.floor(rng() * LEAF_KINDS.length)]);
  let verts = 0;
  let idx = 0;
  for (const k of kinds) {
    verts += detailShape(k).points.length / 2;
    idx += detailShape(k).indices.length;
  }
  const pos = new Float32Array(verts * 3);
  const nor = new Float32Array(verts * 3);
  const colr = new Float32Array(verts * 4);
  const leaf = new Float32Array(verts * 4);
  const leaf2 = new Float32Array(verts * 2);
  const detail = new Float32Array(verts * 4);
  const index = new Uint32Array(idx);
  const ends = new Uint32Array(count);
  const inner = new THREE.Color();
  const edge = new THREE.Color();
  const stem = new THREE.Color();
  const n: Vec3 = { x: 0, y: 0, z: 0 };
  const form: LeafForm = { fold: 0, cup: 0, curl: 0 };
  let v0 = 0;
  let ii = 0;
  kinds.forEach((kind, li) => {
    const s = detailShape(kind);
    const np = s.points.length / 2;
    const size = LEAF_SIZE[kind] * (0.35 + rng() * 0.3);
    form.fold = 0.1 + rng() * 0.2;
    form.cup = 0.2 + rng() * (kind === 'oak' ? 0.5 : 0.3);
    form.curl = 0.2 + rng() * (kind === 'oak' ? 0.35 : 0.25);
    // The top of the litter: drier than the damp bottom layer.
    const wet = leafTint(kind, 0.03 + rng() * 0.03, rng, inner, edge, stem);
    const home = [rng(), rng(), rng() * Math.PI * 2, size];
    const layer = rng();
    for (let p = 0; p < np; p++) {
      const u = s.points[p * 2];
      const v = s.points[p * 2 + 1];
      const k = v0 + p;
      pos.set([u, leafLift(u, v, form), -v], k * 3);
      leafNormal(u, v, form, n);
      nor.set([n.x, n.y, n.z], k * 3);
      const onEdge = p < s.outline ? 1 : 0;
      const c = onEdge ? edge : inner;
      colr.set([c.r, c.g, c.b, wet], k * 4);
      leaf.set([u, v, onEdge, s.vein[p]], k * 4);
      leaf2.set([LATERAL_VEINS[kind], layer], k * 2);
      detail.set(home, k * 4);
    }
    for (const t of s.indices) index[ii++] = v0 + t;
    v0 += np;
    ends[li] = ii;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(colr, 4));
  g.setAttribute('aLeaf', new THREE.BufferAttribute(leaf, 4));
  g.setAttribute('aLeaf2', new THREE.BufferAttribute(leaf2, 2));
  g.setAttribute('aDetail', new THREE.BufferAttribute(detail, 4));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  const mesh = new THREE.Mesh(g, createLeafMaterial('detail'));
  // Placed around the worm in the shader.
  mesh.frustumCulled = false;
  mesh.name = 'detailLeaves';
  return {
    mesh,
    max: count,
    setCount(c: number) {
      const k = Math.max(0, Math.min(count, Math.floor(c)));
      g.setDrawRange(0, k > 0 ? ends[k - 1] : 0);
      mesh.visible = k > 0;
    },
  };
}
```

- [ ] **Step 11: Add it to the world**

In `src/game/world.ts`:

Replace:

```ts
import { buildDistantTrees } from '../surface/distantTrees';
import { buildLeafLitter, type LeafLitter } from '../surface/leafLitterMesh';
import { buildGroundProps, writeHeroLog, type GroundProps } from '../surface/groundProps';
import { HeroWorm, type WormPose } from '../worm/wormMesh';
```

with:

```ts
import { buildDistantTrees } from '../surface/distantTrees';
import { buildLeafLitter, type LeafLitter } from '../surface/leafLitterMesh';
import { buildDetailLeaves, type DetailLeaves } from '../surface/detailLeaves';
import { buildGroundProps, writeHeroLog, type GroundProps } from '../surface/groundProps';
import { HeroWorm, type WormPose } from '../worm/wormMesh';
```

Replace:

```ts
  /** One merged mesh, built with Ultra's leaf count. */
  litter: LeafLitter;
  /** Rocks and ground clutter. */
  props: GroundProps;
```

with:

```ts
  /** One merged mesh, built with Ultra's leaf count. */
  litter: LeafLitter;
  /** The close-up leaf layer around the worm. */
  detail: DetailLeaves;
  /** Rocks and ground clutter. */
  props: GroundProps;
```

Replace:

```ts
  const scene = new THREE.Scene();
  const litter = buildLeafLitter(PRESETS.ultra.litter);
  const props = buildGroundProps();
  const atmosphere = buildAtmosphere();
```

with:

```ts
  const scene = new THREE.Scene();
  const litter = buildLeafLitter(PRESETS.ultra.litter);
  const detail = buildDetailLeaves(PRESETS.ultra.detail);
  const props = buildGroundProps();
  const atmosphere = buildAtmosphere();
```

Replace:

```ts
  terrain.renderOrder = 5;
  scene.add(
    terrain, buildForestTrees(writeHeroLog), buildDistantTrees(), litter.mesh, props.mesh, worm.group,
    buildSky(), atmosphere.group,
  );
  return {
    scene, litter, props, atmosphere, worm,
    apply(spec) {
      reaction = spec.reaction;
      litter.setCount(spec.litter);
      props.setDensity(spec.clutter);
      atmosphere.setLevel(spec.effects, spec.extraEffects);
```

with:

```ts
  terrain.renderOrder = 5;
  scene.add(
    terrain, buildForestTrees(writeHeroLog), buildDistantTrees(), litter.mesh, detail.mesh, props.mesh, worm.group,
    buildSky(), atmosphere.group,
  );
  return {
    scene, litter, detail, props, atmosphere, worm,
    apply(spec) {
      reaction = spec.reaction;
      litter.setCount(spec.litter);
      detail.setCount(spec.detail);
      props.setDensity(spec.clutter);
      atmosphere.setLevel(spec.effects, spec.extraEffects);
```

- [ ] **Step 12: Run and see it pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS, 38 files, 366 tests.

- [ ] **Step 13: Check the shaders compile**

Run: `npm run build && npx playwright test tests/e2e/speedTest.spec.ts`
Expected: 5 passed.

- [ ] **Step 14: Commit**

```bash
git add src/render/wrap.ts src/surface/detailShape.ts src/render/litterTexture.ts src/surface/detailLeaves.ts src/render/leafGlsl.ts src/render/leafMaterial.ts src/game/world.ts tests/unit/wrap.test.ts tests/unit/detailShape.test.ts tests/unit/litterTexture.test.ts tests/unit/detailLeaves.test.ts
git commit -m "feat(leaves): close-up detail leaf layer placed around the worm on the GPU

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Hero leaf physics (pure)

**Files:**
- Create: `src/surface/heroLeaves.ts`, `tests/unit/heroLeaves.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/heroLeaves.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createHeroLeaves, setHeroCount, snapshotHeroLeaves, stepHeroLeaves, HERO_MAX, HERO_RADIUS, HERO_RECYCLE,
  type HeroLeaves, type SurfaceFn,
} from '../../src/surface/heroLeaves';

const DT = 1 / 60;
const flat = () => 0.05;
const bumpy = (x: number, z: number) => 0.05 + 0.1 * Math.sin(3 * x) * Math.cos(2 * z);
const NONE = new Float32Array(0);

function fields(p: HeroLeaves): Float32Array[] {
  return [p.x, p.y, p.z, p.yaw, p.flip, p.vx, p.vy, p.vz, p.spin, p.flipRate];
}

function pool(n = HERO_MAX, surface: SurfaceFn = flat): HeroLeaves {
  const p = createHeroLeaves(HERO_MAX, 5);
  setHeroCount(p, n, 0, 0, 0, surface);
  return p;
}

describe('hero leaves', () => {
  it('scatters the active leaves within 3 m of the head, on the litter', () => {
    const p = pool();
    expect(p.count).toBe(HERO_MAX);
    for (let i = 0; i < p.count; i++) {
      expect(Math.hypot(p.x[i], p.z[i])).toBeLessThanOrEqual(HERO_RADIUS + 1e-6);
      expect(p.y[i]).toBeCloseTo(0.05, 6);
    }
  });

  it('setHeroCount clamps to the pool and keeps existing leaves where they are', () => {
    const p = pool(12);
    const x0 = p.x[3];
    setHeroCount(p, 24, 0, 0, 0, flat);
    expect(p.count).toBe(24);
    expect(p.x[3]).toBe(x0);
    setHeroCount(p, 999, 0, 0, 0, flat);
    expect(p.count).toBe(HERO_MAX);
    setHeroCount(p, 0, 0, 0, 0, flat);
    expect(p.count).toBe(0);
  });

  it('is deterministic', () => {
    const a = pool();
    const b = pool();
    expect(Array.from(a.x)).toEqual(Array.from(b.x));
  });

  it('stays finite under wild pushes and big steps', () => {
    const p = pool(HERO_MAX, bumpy);
    const pushers = new Float32Array(16 * 4);
    for (let t = 0; t < 2000; t++) {
      for (let k = 0; k < 16; k++) {
        pushers.set([Math.sin(t * 0.37 + k) * 2.5, Math.cos(t * 0.29 + k * 1.7) * 2.5, 0.14, k === 0 ? 1 : 0.5], k * 4);
      }
      stepHeroLeaves(p, t % 7 === 0 ? 0.1 : DT, pushers, 16, 0, 0, t * 0.01, bumpy);
    }
    for (const f of fields(p)) expect(f.every(Number.isFinite)).toBe(true);
  });

  it('never sinks below the litter surface', () => {
    const p = pool(HERO_MAX, bumpy);
    const pushers = new Float32Array(4);
    for (let t = 0; t < 1500; t++) {
      pushers.set([Math.sin(t * 0.02) * 2, Math.cos(t * 0.02) * 2, 0.14, 1]);
      stepHeroLeaves(p, DT, pushers, 1, 0, 0, 0, bumpy);
      for (let i = 0; i < p.count; i++) expect(p.y[i]).toBeGreaterThanOrEqual(bumpy(p.x[i], p.z[i]) - 1e-6);
    }
  });

  it('comes to rest: still, flat, face up or face down', () => {
    const p = pool();
    for (let i = 0; i < p.count; i++) {
      p.vx[i] = Math.sin(i) * 2;
      p.vz[i] = Math.cos(i) * 2;
      p.spin[i] = 3;
      p.flipRate[i] = i % 2 ? 4 : -4;
      p.vy[i] = 1;
    }
    for (let t = 0; t < 600; t++) stepHeroLeaves(p, DT, NONE, 0, 0, 0, 0, flat);
    for (let i = 0; i < p.count; i++) {
      expect(p.vx[i]).toBe(0);
      expect(p.vz[i]).toBe(0);
      expect(p.vy[i]).toBe(0);
      expect(p.spin[i]).toBe(0);
      expect(p.flipRate[i]).toBe(0);
      expect(Math.abs(Math.cos(p.flip[i]))).toBeCloseTo(1, 9);
      expect(p.y[i]).toBeCloseTo(0.05, 6);
    }
  });

  it('flips over under a strong push from the head', () => {
    const p = createHeroLeaves(1, 5);
    setHeroCount(p, 1, 0, 0, 0, flat);
    p.x[0] = 0;
    p.z[0] = 1;
    p.flip[0] = 0;
    const pushers = new Float32Array(4);
    // The head crawls at 1.6 m/s straight through the leaf.
    for (let t = 0; t < 120; t++) {
      pushers.set([0, -0.5 + 1.6 * t * DT, 0.14, 1]);
      stepHeroLeaves(p, DT, pushers, 1, 0, 0, 0, flat);
    }
    for (let t = 0; t < 300; t++) stepHeroLeaves(p, DT, NONE, 0, 0, 0, 0, flat);
    expect(Math.cos(p.flip[0])).toBeCloseTo(-1, 6);
  });

  it('a gentle body push slides a leaf without flipping it', () => {
    const p = createHeroLeaves(1, 5);
    setHeroCount(p, 1, 0, 0, 0, flat);
    p.x[0] = 0;
    p.z[0] = 1;
    p.flip[0] = 0;
    const pushers = new Float32Array(4);
    for (let t = 0; t < 300; t++) {
      pushers.set([0, -0.5 + 0.3 * t * DT, 0.14, 0.5]);
      stepHeroLeaves(p, DT, pushers, 1, 0, 0, 0, flat);
    }
    for (let t = 0; t < 300; t++) stepHeroLeaves(p, DT, NONE, 0, 0, 0, 0, flat);
    expect(Math.cos(p.flip[0])).toBeCloseTo(1, 6);
    expect(p.z[0]).toBeGreaterThan(1);
  });

  it('recycles a leaf more than 4 m away to a free spot ahead of the worm', () => {
    const p = pool();
    // The worm is now 10 m away, heading +x.
    stepHeroLeaves(p, DT, NONE, 0, 10, 0, Math.PI / 2, flat);
    for (let i = 0; i < p.count; i++) {
      const dx = p.x[i] - 10;
      const dz = p.z[i];
      expect(Math.hypot(dx, dz)).toBeLessThanOrEqual(HERO_RECYCLE);
      expect(dx).toBeGreaterThan(0);
      expect(p.vx[i]).toBe(0);
      // Recycled leaves do not streak across the screen: the previous step is the new spot.
      expect(p.px[i]).toBe(p.x[i]);
    }
  });

  it('snapshot copies the current state for interpolation', () => {
    const p = pool(4);
    p.x[2] = 1.25;
    snapshotHeroLeaves(p);
    expect(p.px[2]).toBe(1.25);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/unit/heroLeaves.test.ts`
Expected: FAIL with "Cannot find module '../../src/surface/heroLeaves'".

- [ ] **Step 3: Implement**

Create `src/surface/heroLeaves.ts`:

```ts
import { WORLD_HALF } from './terrain';

/**
 * Hero leaves (spec 5.4): a small pool of loose leaves lying on top of the litter near the
 * worm's head, with simple damped physics run every step. The head and body shove a leaf they
 * overlap (the head hardest); a strong shove from the head lifts its near edge so it flips
 * over; it slides with friction and settles on the litter, never below it. A leaf more than
 * HERO_RECYCLE from the head is recycled to a free spot ahead of the worm, chosen
 * deterministically. Pure: plain typed arrays, no allocation per step.
 */
export const HERO_MAX = 32;
/** Leaves start within this of the head... */
export const HERO_RADIUS = 3;
/** ...and are recycled beyond this. */
export const HERO_RECYCLE = 4;

const GRAVITY = 9.8;
/** A head shove faster than this (m/s) flips a resting leaf. */
const FLIP_SPEED = 0.6;
/** Flip spin (rad/s) and the little hop that goes with it (m/s). */
const FLIP_RATE = 9;
const HOP = 1.2;
/** Ground friction and air drag (1/s), and how fast a leaf settles flat (rad/s). */
const FRICTION = 8;
const DRAG = 1;
const SPIN_DAMP = 6;
const SETTLE = 14;
const MAX_SPEED = 3;
const MAX_SPIN = 10;
const MAX_FLIP_RATE = 15;
/** Below these a grounded leaf is at rest. */
const REST_SPEED = 1e-3;
const REST_ANGLE = 1e-4;
/** Two hero leaves start no closer than this. */
const SPACING = 0.6;

/** Height (m) of the litter top at (x, z): terrainHeight + litterDepth in the game. */
export type SurfaceFn = (x: number, z: number) => number;

export interface HeroLeaves {
  readonly max: number;
  /** Active leaves: the first `count` slots. */
  count: number;
  readonly seed: number;
  /** Respawns so far: feeds the deterministic choice of the next free spot. */
  spawned: number;
  readonly x: Float32Array; readonly y: Float32Array; readonly z: Float32Array;
  /** Turn about the vertical, and the flip about the leaf's own midrib (0 face up, pi face down). */
  readonly yaw: Float32Array; readonly flip: Float32Array;
  readonly vx: Float32Array; readonly vy: Float32Array; readonly vz: Float32Array;
  readonly spin: Float32Array; readonly flipRate: Float32Array;
  /** The previous step, for render interpolation. */
  readonly px: Float32Array; readonly py: Float32Array; readonly pz: Float32Array;
  readonly pyaw: Float32Array; readonly pflip: Float32Array;
  /** Leaf length (m) and species index (into LEAF_KINDS), fixed per slot. */
  readonly size: Float32Array;
  readonly kind: Uint8Array;
}

/** Integer hash to [0, 1). */
function hash01(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b + 0x632be5ab) | 0, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function createHeroLeaves(max = HERO_MAX, seed = 1): HeroLeaves {
  const f = () => new Float32Array(max);
  const p: HeroLeaves = {
    max, count: 0, seed, spawned: 0,
    x: f(), y: f(), z: f(), yaw: f(), flip: f(), vx: f(), vy: f(), vz: f(), spin: f(), flipRate: f(),
    px: f(), py: f(), pz: f(), pyaw: f(), pflip: f(), size: f(), kind: new Uint8Array(max),
  };
  for (let i = 0; i < max; i++) {
    p.size[i] = 0.55 + 0.45 * hash01(i, seed + 101);
    p.kind[i] = Math.floor(hash01(i, seed + 202) * 5);
  }
  return p;
}

/** Moves slot i to a free spot: around the head (`around`) or ahead of it. Resets its motion. */
function respawn(p: HeroLeaves, i: number, hx: number, hz: number, heading: number, surfaceAt: SurfaceFn, around: boolean): void {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  let x = hx;
  let z = hz;
  for (let c = 0; c < 4; c++) {
    const n = p.spawned * 4 + c;
    const h1 = hash01(n, p.seed);
    const h2 = hash01(n, p.seed + 7);
    if (around) {
      const r = 0.5 + (HERO_RADIUS - 0.5) * Math.sqrt(h1);
      const a = h2 * Math.PI * 2;
      x = hx + Math.cos(a) * r;
      z = hz + Math.sin(a) * r;
    } else {
      const ahead = 1.2 + 1.2 * h1;
      const side = (h2 * 2 - 1) * 1.6;
      x = hx + fx * ahead + fz * side;
      z = hz + fz * ahead - fx * side;
    }
    let free = true;
    for (let j = 0; j < p.count && free; j++) {
      if (j !== i && Math.hypot(p.x[j] - x, p.z[j] - z) < SPACING) free = false;
    }
    if (free) break;
  }
  const h3 = hash01(p.spawned, p.seed + 13);
  p.spawned++;
  p.x[i] = p.px[i] = x;
  p.z[i] = p.pz[i] = z;
  p.y[i] = p.py[i] = surfaceAt(x, z);
  p.yaw[i] = p.pyaw[i] = h3 * Math.PI * 2;
  p.flip[i] = p.pflip[i] = h3 < 0.25 ? Math.PI : 0;
  p.vx[i] = p.vy[i] = p.vz[i] = p.spin[i] = p.flipRate[i] = 0;
}

/** Sets how many leaves are active (the preset). New ones are scattered around the head. */
export function setHeroCount(p: HeroLeaves, n: number, hx: number, hz: number, heading: number, surfaceAt: SurfaceFn): void {
  const next = Math.max(0, Math.min(p.max, Math.floor(n)));
  const prev = p.count;
  p.count = next;
  for (let i = prev; i < next; i++) respawn(p, i, hx, hz, heading, surfaceAt, true);
}

/** Copies the current state to the previous-step arrays (call at the start of each step). */
export function snapshotHeroLeaves(p: HeroLeaves): void {
  const n = p.count;
  p.px.set(p.x.subarray(0, n));
  p.py.set(p.y.subarray(0, n));
  p.pz.set(p.z.subarray(0, n));
  p.pyaw.set(p.yaw.subarray(0, n));
  p.pflip.set(p.flip.subarray(0, n));
}

const clamp = (v: number, m: number): number => Math.max(-m, Math.min(m, v));

/**
 * One physics step. `pushers` packs [x, z, radius, strength] per body point (strength 1 at the
 * head); `count` of them are read. (hx, hz, heading): the head, for recycling.
 */
export function stepHeroLeaves(
  p: HeroLeaves, dt: number, pushers: Float32Array, count: number,
  hx: number, hz: number, heading: number, surfaceAt: SurfaceFn,
): void {
  if (!(dt > 0)) return;
  const friction = Math.exp(-FRICTION * dt);
  const drag = Math.exp(-DRAG * dt);
  const spinDamp = Math.exp(-SPIN_DAMP * dt);
  for (let i = 0; i < p.count; i++) {
    if (Math.hypot(p.x[i] - hx, p.z[i] - hz) > HERO_RECYCLE) {
      respawn(p, i, hx, hz, heading, surfaceAt, false);
      continue;
    }
    const grounded = p.y[i] <= surfaceAt(p.x[i], p.z[i]) + 1e-4;
    const r = p.size[i] * 0.4;
    for (let k = 0; k < count; k++) {
      const o = k * 4;
      let nx = p.x[i] - pushers[o];
      let nz = p.z[i] - pushers[o + 1];
      const d = Math.hypot(nx, nz);
      const overlap = pushers[o + 2] + r - d;
      if (overlap <= 0) continue;
      if (d > 1e-6) {
        nx /= d;
        nz /= d;
      } else {
        nx = Math.sin(heading);
        nz = Math.cos(heading);
      }
      const strength = pushers[o + 3];
      // Out of the overlap, carrying the shove on as velocity.
      p.x[i] += nx * overlap;
      p.z[i] += nz * overlap;
      const shove = overlap / dt;
      p.vx[i] += nx * shove * 0.5 * strength;
      p.vz[i] += nz * shove * 0.5 * strength;
      // Across the leaf: its own x axis is (cos yaw, -sin yaw) on the ground.
      const across = nx * Math.cos(p.yaw[i]) - nz * Math.sin(p.yaw[i]);
      p.spin[i] += across * shove * 0.8 * strength;
      if (grounded && strength >= 0.9 && shove > FLIP_SPEED && Math.abs(p.flipRate[i]) < 0.5) {
        // The near edge lifts: the leaf rolls over away from the push.
        p.flipRate[i] = across >= 0 ? -FLIP_RATE : FLIP_RATE;
        p.vy[i] = HOP;
      }
    }
    p.vx[i] = clamp(p.vx[i], MAX_SPEED);
    p.vz[i] = clamp(p.vz[i], MAX_SPEED);
    p.spin[i] = clamp(p.spin[i], MAX_SPIN);
    p.flipRate[i] = clamp(p.flipRate[i], MAX_FLIP_RATE);
    p.vy[i] -= GRAVITY * dt;
    p.x[i] = clamp(p.x[i] + p.vx[i] * dt, WORLD_HALF);
    p.z[i] = clamp(p.z[i] + p.vz[i] * dt, WORLD_HALF);
    p.y[i] += p.vy[i] * dt;
    p.yaw[i] += p.spin[i] * dt;
    p.flip[i] += p.flipRate[i] * dt;
    const floor = surfaceAt(p.x[i], p.z[i]);
    if (p.y[i] <= floor) {
      // Resting on the litter: never below it; friction; settles flat, face up or face down.
      p.y[i] = floor;
      if (p.vy[i] < 0) p.vy[i] = 0;
      p.vx[i] *= friction;
      p.vz[i] *= friction;
      p.spin[i] *= spinDamp;
      const target = Math.round(p.flip[i] / Math.PI) * Math.PI;
      p.flipRate[i] += (SETTLE * SETTLE * (target - p.flip[i]) - 2 * SETTLE * p.flipRate[i]) * dt;
      if (Math.hypot(p.vx[i], p.vz[i]) < REST_SPEED) p.vx[i] = p.vz[i] = 0;
      if (Math.abs(p.spin[i]) < REST_SPEED) p.spin[i] = 0;
      if (Math.abs(p.flipRate[i]) < REST_SPEED && Math.abs(p.flip[i] - target) < REST_ANGLE) {
        p.flipRate[i] = 0;
        p.flip[i] = target;
      }
    } else {
      p.vx[i] *= drag;
      p.vz[i] *= drag;
    }
  }
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run tests/unit/heroLeaves.test.ts && npx tsc --noEmit`
Expected: PASS, 10 tests. `npx vitest run`: 39 files, 376 tests.

- [ ] **Step 5: Commit**

```bash
git add src/surface/heroLeaves.ts tests/unit/heroLeaves.test.ts
git commit -m "feat(leaves): hero leaf physics that slide, flip, settle and recycle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Hero leaf mesh and wiring

> NOTE (post-Task 14): Task 14 moved the detail placement into its own file and changed some
> names; the steps below are already adjusted. In short:
> - `DETAIL_GLSL`, `DETAIL_BOX`, `DETAIL_FADE_IN/OUT` and the TS twin `detailVertex` live in
>   `src/render/detailGlsl.ts` (re-exporting them from `leafGlsl.ts` makes an import cycle:
>   terrainMesh -> paintedMaterial -> leafGlsl -> groundTexture -> terrainMesh). `HERO_GLSL` is
>   appended to the end of `leafGlsl.ts`.
> - `detailPosition(n, shade, anchor)` also writes the disturbance anchor; it rests leaves on
>   `meshGround` (the baked terrain-mesh heights, `src/render/groundTexture.ts`, uniform
>   `uGround`), and returns at once (radius 0, all vertices on one point) for leaves shrunk to
>   nothing, which then skip `disturb()`.
> - The world's detail layer is lazy (`buildDetailLayer`): add `detail.group` to the scene, not
>   `detail.mesh`; `detail.built` is the `DetailLeaves` (or null until a preset draws it).
> - Print GLSL constants with `glslFloat` (`src/render/glslNumber.ts`), never `toFixed`.
> - `tests/e2e/glslParity.spec.ts` runs the GLSL twins on the GPU; extend it when a new GLSL twin
>   gets a TS twin.

One instanced draw holds a leaf of every species; each instance shows only its own species (the vertex shader collapses the other four to a point below the ground). The crawl shoves the leaves with every body segment each step, and the world writes the instance matrices each rendered frame, interpolated by alpha.

**Files:**
- Create: `src/surface/heroLeafMesh.ts`, `tests/unit/heroLeafMesh.test.ts`
- Modify: `src/render/leafGlsl.ts`, `src/render/leafMaterial.ts`, `src/game/crawl.ts`, `src/game/world.ts`, `src/main.ts`, `tests/unit/crawl.test.ts`, `tests/unit/sceneTiers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/heroLeafMesh.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { HeroLeafMesh } from '../../src/surface/heroLeafMesh';
import { createHeroLeaves, setHeroCount, snapshotHeroLeaves, HERO_MAX } from '../../src/surface/heroLeaves';

describe('HeroLeafMesh', () => {
  const pool = createHeroLeaves(HERO_MAX, 2);
  const hero = new HeroLeafMesh(pool);
  const g = hero.mesh.geometry;

  it('is one instanced draw of every species, each instance keeping its own', () => {
    expect(hero.mesh.material).toHaveProperty('defines.HERO');
    const kinds = new Set(Array.from(g.getAttribute('aKind').array as Float32Array));
    expect(kinds.size).toBe(5);
    const perInstance = g.getAttribute('aHeroKind') as THREE.InstancedBufferAttribute;
    expect(perInstance.count).toBe(HERO_MAX);
    for (let i = 0; i < HERO_MAX; i++) expect(perInstance.getX(i)).toBe(pool.kind[i]);
    expect(hero.mesh.instanceColor).not.toBeNull();
  });

  it('starts hidden and shows exactly the active leaves', () => {
    expect(hero.mesh.visible).toBe(false);
    setHeroCount(pool, 12, 0, 0, 0, () => 0.05);
    hero.update(pool, 1);
    expect(hero.mesh.count).toBe(12);
    expect(hero.mesh.visible).toBe(true);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 12; i++) {
      hero.mesh.getMatrixAt(i, m);
      expect(m.elements.every(Number.isFinite)).toBe(true);
    }
  });

  it('interpolates between the last two physics steps', () => {
    snapshotHeroLeaves(pool);
    pool.x[0] += 1;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    hero.update(pool, 0);
    hero.mesh.getMatrixAt(0, m);
    expect(p.setFromMatrixPosition(m).x).toBeCloseTo(pool.px[0], 5);
    hero.update(pool, 0.5);
    hero.mesh.getMatrixAt(0, m);
    expect(p.setFromMatrixPosition(m).x).toBeCloseTo(pool.px[0] + 0.5, 5);
  });

  it('hides itself at zero leaves (Low)', () => {
    setHeroCount(pool, 0, 0, 0, 0, () => 0.05);
    hero.update(pool, 1);
    expect(hero.mesh.visible).toBe(false);
  });
});
```

In `tests/unit/crawl.test.ts`, append:

Replace:

```ts
    expect(c.disturbed).toBe(false);
  });
});
```

with:

```ts
    expect(c.disturbed).toBe(false);
  });
});

describe('Crawl hero leaves', () => {
  it('keeps the preset count of leaves near the head, shoving them as it crawls', () => {
    const c = new Crawl();
    c.setHeroCount(24);
    expect(c.hero.count).toBe(24);
    let moved = false;
    for (let i = 0; i < 600; i++) {
      c.step(DT, { x: 0.2, y: 1 });
      for (let k = 0; k < c.hero.count; k++) {
        if (c.hero.vx[k] !== 0 || c.hero.vz[k] !== 0) moved = true;
        const h = c.motion.head;
        expect(Math.hypot(c.hero.x[k] - h.x, c.hero.z[k] - h.z)).toBeLessThanOrEqual(4.1);
      }
    }
    expect(moved).toBe(true);
    c.setHeroCount(0);
    expect(c.hero.count).toBe(0);
  });
});
```

In `tests/unit/sceneTiers.test.ts` (the world now needs the crawl, whose hero pool it draws):

Replace:

```ts
import { buildDustMotes, MOTE_COUNT, MOTE_MAX } from '../../src/render/atmosphere';
import { buildWorld } from '../../src/game/world';
import { PRESETS } from '../../src/render/graphics';
import { sharedLighting } from '../../src/render/paintedMaterial';
```

with:

```ts
import { buildDustMotes, MOTE_COUNT, MOTE_MAX } from '../../src/render/atmosphere';
import { buildWorld } from '../../src/game/world';
import { Crawl } from '../../src/game/crawl';
import { PRESETS } from '../../src/render/graphics';
import { sharedLighting } from '../../src/render/paintedMaterial';
```

Replace:

```ts

describe('world.apply', () => {
  const world = buildWorld();
  const litterG = world.litter.mesh.geometry;
  const motes = world.atmosphere.group.getObjectByName('dustMotes') as THREE.Points;
```

with:

```ts

describe('world.apply', () => {
  const world = buildWorld(new Crawl());
  const litterG = world.litter.mesh.geometry;
  const motes = world.atmosphere.group.getObjectByName('dustMotes') as THREE.Points;
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/heroLeafMesh.test.ts tests/unit/crawl.test.ts tests/unit/sceneTiers.test.ts`
Expected: FAIL: `heroLeafMesh` is missing, `crawl.setHeroCount` does not exist, `buildWorld` takes no arguments.

- [ ] **Step 3: The hero GLSL**

Append to the end of `src/render/leafGlsl.ts`:

```ts

/**
 * Vertex GLSL for the hero leaves: one instanced leaf of every species, of which each instance
 * keeps only its own (aKind per vertex, aHeroKind per instance); the rest collapse to a single
 * point far below the ground, so their triangles draw nothing.
 */
export const HERO_GLSL = /* glsl */ `
  attribute float aKind;
  attribute float aHeroKind;
  vec4 heroPosition(inout vec3 n) {
    mat4 m = modelMatrix * instanceMatrix;
    n = mat3(m) * n;
    if (abs(aKind - aHeroKind) > 0.5) return vec4(0.0, -50.0, 0.0, 1.0);
    return m * vec4(position, 1.0);
  }
`;
```

- [ ] **Step 4: The `hero` leaf material variant**

In `src/render/leafMaterial.ts`:

Replace:

```ts
} from './paintedMaterial';
import { groundUniforms } from './groundUniforms';
import { DISTURB_GLSL } from './leafGlsl';
import { DETAIL_GLSL } from './detailGlsl';
import { getLitterTexture } from './litterTexture';
import { getGroundTexture } from './groundTexture';

```

with:

```ts
} from './paintedMaterial';
import { groundUniforms } from './groundUniforms';
import { DISTURB_GLSL, HERO_GLSL } from './leafGlsl';
import { DETAIL_GLSL } from './detailGlsl';
import { getLitterTexture } from './litterTexture';
import { getGroundTexture } from './groundTexture';

```

Replace:

```ts
 * With DETAIL defined, aDetail (home x, z in the wrap tile, yaw, radius) places each leaf of the
 * close-up layer around the worm in the vertex shader, which also gives its anchor (and no dip).
 */
const vertexShader = /* glsl */ `
```

with:

```ts
 * With DETAIL defined, aDetail (home x, z in the wrap tile, yaw, radius) places each leaf of the
 * close-up layer around the worm in the vertex shader, which also gives its anchor (and no dip).
 * With HERO defined it is the instanced hero-leaf mesh (instanceMatrix, instanceColor tint).
 */
const vertexShader = /* glsl */ `
```

Replace:

```ts
  #ifdef DETAIL
  ${DETAIL_GLSL}
  #endif

```

with:

```ts
  #ifdef DETAIL
  ${DETAIL_GLSL}
  #endif

  #ifdef HERO
  ${HERO_GLSL}
  #endif

```

Replace:

```ts
      vec4 wp = detailPosition(nrm, shade, anchor);
      vNormalW = normalize(nrm);
    #else
      vec4 wp = modelMatrix * vec4(position, 1.0);
```

with:

```ts
      vec4 wp = detailPosition(nrm, shade, anchor);
      vNormalW = normalize(nrm);
    #elif defined(HERO)
      vec4 wp = heroPosition(nrm);
      vNormalW = normalize(nrm);
    #else
      vec4 wp = modelMatrix * vec4(position, 1.0);
```

Replace:

```ts
    #ifdef DETAIL
      vColor.rgb *= shade;
    #endif
    vLeaf = aLeaf;
```

with:

```ts
    #ifdef DETAIL
      vColor.rgb *= shade;
    #endif
    #ifdef USE_INSTANCING_COLOR
      vColor.rgb *= instanceColor;
    #endif
    vLeaf = aLeaf;
```

Replace:

```ts

/**
 * Which leaves: the floor litter and the close-up detail layer (both react to the worm), or the
 * falling leaves (animated).
 */
export type LeafVariant = 'litter' | 'falling' | 'detail';

const DEFINES: Record<LeafVariant, Record<string, string>> = {
```

with:

```ts

/**
 * Which leaves: the floor litter and the close-up detail layer (both react to the worm), the
 * falling leaves (animated), or the hero leaves (instanced, moved by their own physics).
 */
export type LeafVariant = 'litter' | 'falling' | 'detail' | 'hero';

const DEFINES: Record<LeafVariant, Record<string, string>> = {
```

Replace:

```ts
  falling: { FALLING: '' },
  detail: { DETAIL: '', DISTURB: '' },
};

```

with:

```ts
  falling: { FALLING: '' },
  detail: { DETAIL: '', DISTURB: '' },
  hero: { HERO: '' },
};

```

- [ ] **Step 5: The instanced mesh**

Create `src/surface/heroLeafMesh.ts`:

```ts
import * as THREE from 'three';
import type { Vec3 } from '../core/vec';
import { createLeafMaterial } from '../render/leafMaterial';
import { LEAF_KINDS } from './leafLitter';
import { detailShape } from './detailShape';
import { leafLift, leafNormal, type LeafForm } from './leafForm';
import { leafTint, LATERAL_VEINS } from './leafPalette';
import { mulberry32 } from '../core/random';
import type { HeroLeaves } from './heroLeaves';

/** A leaf lying face down rests on its curled rim, this much (per unit of size) higher. */
const FLIP_LIFT = 0.12;
const FORM: LeafForm = { fold: 0.16, cup: 0.3, curl: 0.24 };

/**
 * All hero leaves in one instanced draw with the shared leaf material (species shapes, veins).
 * The geometry holds one leaf of every species; each instance shows only its own species (the
 * vertex shader collapses the others), so one draw covers them all. Matrices are rewritten from
 * the physics every rendered frame, interpolated by alpha; nothing is allocated.
 */
export class HeroLeafMesh {
  readonly mesh: THREE.InstancedMesh;
  private readonly obj = new THREE.Object3D();

  constructor(pool: HeroLeaves) {
    const rng = mulberry32(17);
    let verts = 0;
    let idx = 0;
    for (const k of LEAF_KINDS) {
      verts += detailShape(k).points.length / 2;
      idx += detailShape(k).indices.length;
    }
    const pos = new Float32Array(verts * 3);
    const nor = new Float32Array(verts * 3);
    const colr = new Float32Array(verts * 4);
    const leaf = new Float32Array(verts * 4);
    const leaf2 = new Float32Array(verts * 2);
    const kindAttr = new Float32Array(verts);
    const index = new Uint16Array(idx);
    const inner = new THREE.Color();
    const edge = new THREE.Color();
    const stem = new THREE.Color();
    const n: Vec3 = { x: 0, y: 0, z: 0 };
    let v0 = 0;
    let ii = 0;
    LEAF_KINDS.forEach((kind, ki) => {
      const s = detailShape(kind);
      const np = s.points.length / 2;
      const wet = leafTint(kind, 0.05, rng, inner, edge, stem);
      for (let p = 0; p < np; p++) {
        const u = s.points[p * 2];
        const v = s.points[p * 2 + 1];
        const k = v0 + p;
        pos.set([u, leafLift(u, v, FORM), -v], k * 3);
        leafNormal(u, v, FORM, n);
        nor.set([n.x, n.y, n.z], k * 3);
        const onEdge = p < s.outline ? 1 : 0;
        const c = onEdge ? edge : inner;
        colr.set([c.r, c.g, c.b, wet], k * 4);
        leaf.set([u, v, onEdge, s.vein[p]], k * 4);
        leaf2.set([LATERAL_VEINS[kind], 0.5], k * 2);
        kindAttr[k] = ki;
      }
      for (const t of s.indices) index[ii++] = v0 + t;
      v0 += np;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(colr, 4));
    g.setAttribute('aLeaf', new THREE.BufferAttribute(leaf, 4));
    g.setAttribute('aLeaf2', new THREE.BufferAttribute(leaf2, 2));
    g.setAttribute('aKind', new THREE.BufferAttribute(kindAttr, 1));
    const heroKind = new Float32Array(pool.max);
    for (let i = 0; i < pool.max; i++) heroKind[i] = pool.kind[i];
    g.setAttribute('aHeroKind', new THREE.InstancedBufferAttribute(heroKind, 1));
    g.setIndex(new THREE.BufferAttribute(index, 1));

    this.mesh = new THREE.InstancedMesh(g, createLeafMaterial('hero'), pool.max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const tint = new THREE.Color();
    for (let i = 0; i < pool.max; i++) this.mesh.setColorAt(i, tint.setScalar(0.85 + 0.3 * rng()));
    // Placed every frame from the physics; the instance bounds are never recomputed.
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.name = 'heroLeaves';
  }

  /** Writes every active leaf's matrix, between the last two physics steps by `alpha`. */
  update(p: HeroLeaves, alpha: number): void {
    const o = this.obj;
    for (let i = 0; i < p.count; i++) {
      const flip = p.pflip[i] + (p.flip[i] - p.pflip[i]) * alpha;
      const lift = (1 - Math.cos(flip)) * 0.5 * FLIP_LIFT * p.size[i];
      o.position.set(
        p.px[i] + (p.x[i] - p.px[i]) * alpha,
        p.py[i] + (p.y[i] - p.py[i]) * alpha + lift,
        p.pz[i] + (p.z[i] - p.pz[i]) * alpha,
      );
      o.rotation.set(0, p.pyaw[i] + (p.yaw[i] - p.pyaw[i]) * alpha, flip, 'YZX');
      o.scale.setScalar(p.size[i]);
      o.updateMatrix();
      this.mesh.setMatrixAt(i, o.matrix);
    }
    this.mesh.count = p.count;
    this.mesh.visible = p.count > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
```

- [ ] **Step 6: The crawl shoves the leaves**

In `src/game/crawl.ts`:

Replace:

```ts
  createDisturbance, recentre, stamp, decay, clearDisturbance, type DisturbanceMap,
} from '../surface/disturbance';
import { LOCOMOTION } from './drive';

```

with:

```ts
  createDisturbance, recentre, stamp, decay, clearDisturbance, type DisturbanceMap,
} from '../surface/disturbance';
import {
  createHeroLeaves, setHeroCount, snapshotHeroLeaves, stepHeroLeaves, HERO_MAX, type HeroLeaves,
} from '../surface/heroLeaves';
import { WORM_RADIUS } from '../worm/wormMesh';
import { LOCOMOTION } from './drive';

```

Replace:

```ts
  /** The disturbance map changed since the renderer last uploaded it. */
  disturbed = true;
  private readonly surf: WormSurface = { y: 0, under: 0 };
  private readonly prevBody: Vec3[];
```

with:

```ts
  /** The disturbance map changed since the renderer last uploaded it. */
  disturbed = true;
  /** Loose physics leaves near the head. */
  readonly hero: HeroLeaves = createHeroLeaves(HERO_MAX);
  /** [x, z, radius, strength] per body segment, for the hero leaves. */
  private readonly pushers = new Float32Array(WORM_SEGMENTS * 4);
  private readonly surf: WormSurface = { y: 0, under: 0 };
  private readonly prevBody: Vec3[];
```

Replace:

```ts
  }

  /** Belly height at (x, z) for segment `i`; records whether that segment is under the litter. */
  private rest(i: number, x: number, z: number): number {
```

with:

```ts
  }

  /** How many hero leaves are live (the preset). New ones are scattered around the head. */
  setHeroCount(n: number): void {
    const h = this.motion.head;
    setHeroCount(this.hero, n, h.x, h.z, this.motion.heading, litterTop);
  }

  /** Every segment shoves the hero leaves it overlaps; the head hardest. */
  private pushLeaves(dt: number): void {
    const b = this.body;
    for (let i = 0; i < b.length; i++) {
      this.pushers[i * 4] = b[i].x;
      this.pushers[i * 4 + 1] = b[i].z;
      this.pushers[i * 4 + 2] = WORM_RADIUS * 1.2;
      this.pushers[i * 4 + 3] = i === 0 ? 1 : 0.5;
    }
    const h = this.motion.head;
    stepHeroLeaves(this.hero, dt, this.pushers, b.length, h.x, h.z, this.motion.heading, litterTop);
  }

  /** Belly height at (x, z) for segment `i`; records whether that segment is under the litter. */
  private rest(i: number, x: number, z: number): number {
```

Replace:

```ts
    this.prevWave.phase = wave.phase;
    this.prevWave.activity = wave.activity;

    this.move.x = move.x;
```

with:

```ts
    this.prevWave.phase = wave.phase;
    this.prevWave.activity = wave.activity;
    snapshotHeroLeaves(this.hero);

    this.move.x = move.x;
```

Replace:

```ts
    if (this.cam.pos.y < floor) this.cam.pos.y = floor;
    if (this.reaction) this.disturbLeaves(dt);
  }

```

with:

```ts
    if (this.cam.pos.y < floor) this.cam.pos.y = floor;
    if (this.reaction) this.disturbLeaves(dt);
    this.pushLeaves(dt);
  }

```

- [ ] **Step 7: The world draws them; main sets the count**

In `src/game/world.ts`:

Replace:

```ts
import { buildLeafLitter, type LeafLitter } from '../surface/leafLitterMesh';
import { buildDetailLeaves, type DetailLeaves } from '../surface/detailLeaves';
import { buildGroundProps, writeHeroLog, type GroundProps } from '../surface/groundProps';
import { HeroWorm, type WormPose } from '../worm/wormMesh';
```

with:

```ts
import { buildLeafLitter, type LeafLitter } from '../surface/leafLitterMesh';
import { buildDetailLeaves, type DetailLeaves } from '../surface/detailLeaves';
import { HeroLeafMesh } from '../surface/heroLeafMesh';
import { buildGroundProps, writeHeroLog, type GroundProps } from '../surface/groundProps';
import { HeroWorm, type WormPose } from '../worm/wormMesh';
```

Replace:

```ts
  /** The close-up leaf layer around the worm. */
  detail: DetailLeaves;
  /** Rocks and ground clutter. */
  props: GroundProps;
```

with:

```ts
  /** The close-up leaf layer around the worm. */
  detail: DetailLeaves;
  /** The loose physics leaves near the head (one instanced draw). */
  hero: HeroLeafMesh;
  /** Rocks and ground clutter. */
  props: GroundProps;
```

Replace:

```ts
 * part is built in its own module.
 */
export function buildWorld(): World {
  const scene = new THREE.Scene();
  const litter = buildLeafLitter(PRESETS.ultra.litter);
  const detail = buildDetailLeaves(PRESETS.ultra.detail);
  const props = buildGroundProps();
  const atmosphere = buildAtmosphere();
```

with:

```ts
 * part is built in its own module.
 */
export function buildWorld(crawl: Crawl): World {
  const scene = new THREE.Scene();
  const litter = buildLeafLitter(PRESETS.ultra.litter);
  const detail = buildDetailLeaves(PRESETS.ultra.detail);
  const hero = new HeroLeafMesh(crawl.hero);
  const props = buildGroundProps();
  const atmosphere = buildAtmosphere();
```

Replace:

```ts
  terrain.renderOrder = 5;
  scene.add(
    terrain, buildForestTrees(writeHeroLog), buildDistantTrees(), litter.mesh, detail.group, props.mesh, worm.group,
    buildSky(), atmosphere.group,
  );
  return {
    scene, litter, detail, props, atmosphere, worm,
    apply(spec) {
      reaction = spec.reaction;
```

with:

```ts
  terrain.renderOrder = 5;
  scene.add(
    terrain, buildForestTrees(writeHeroLog), buildDistantTrees(), litter.mesh, detail.group, hero.mesh, props.mesh, worm.group,
    buildSky(), atmosphere.group,
  );
  return {
    scene, litter, detail, hero, props, atmosphere, worm,
    apply(spec) {
      reaction = spec.reaction;
```

Replace:

```ts
      crawl.interpolate(alpha, timeSec, pose, camera);
      worm.update(pose);
      setFocus(crawl.focus.x, crawl.focus.y, crawl.focus.z);
      if (crawl.disturbed) {
```

with:

```ts
      crawl.interpolate(alpha, timeSec, pose, camera);
      worm.update(pose);
      hero.update(crawl.hero, alpha);
      setFocus(crawl.focus.x, crawl.focus.y, crawl.focus.z);
      if (crawl.disturbed) {
```

In `src/main.ts`:

Replace:

```ts
  // at comes within 0.2 of the lens.
  const camera = new THREE.PerspectiveCamera(60, 1, 0.2, 120);
  const world = buildWorld();
  const crawl = new Crawl();
  const keyboard = new KeyboardInput();
  const joystick = new TouchJoystick(app);
```

with:

```ts
  // at comes within 0.2 of the lens.
  const camera = new THREE.PerspectiveCamera(60, 1, 0.2, 120);
  const crawl = new Crawl();
  const world = buildWorld(crawl);
  const keyboard = new KeyboardInput();
  const joystick = new TouchJoystick(app);
```

Replace:

```ts
    world.apply(s);
    crawl.setReaction(s.reaction);
    updateResolution();
    dirty = true;
```

with:

```ts
    world.apply(s);
    crawl.setReaction(s.reaction);
    crawl.setHeroCount(s.hero);
    updateResolution();
    dirty = true;
```

- [ ] **Step 8: Run and see it pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS, 40 files, 381 tests.

- [ ] **Step 9: Check the shaders compile**

Run: `npm run build && npx playwright test tests/e2e/speedTest.spec.ts`
Expected: 5 passed.

- [ ] **Step 10: Commit**

```bash
git add src/surface/heroLeafMesh.ts src/render/leafGlsl.ts src/render/leafMaterial.ts src/game/crawl.ts src/game/world.ts src/main.ts tests/unit/heroLeafMesh.test.ts tests/unit/crawl.test.ts tests/unit/sceneTiers.test.ts
git commit -m "feat(leaves): draw the hero leaves in one instanced mesh, pushed by the worm

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Ultra's extra clutter near the worm

> NOTE (post-Task 14): the near clutter rests on the rendered ground, as the litter, the detail
> leaves and the worm do: `meshGround(xz)` from `GROUND_GLSL`/`getGroundTexture()`
> (`src/render/groundTexture.ts`, uniform `uGround`), not `terrainHeight(xz) + lit.x`, which
> differs from the terrain mesh by up to ~18 cm at mound edges. `litterAt` is still read, for the
> trunk shade only. GLSL constants are printed with `glslFloat` (`src/render/glslNumber.ts`). The
> steps below are already adjusted; the world adds `detail.group` (lazy detail layer).

**Files:**
- Create: `src/surface/nearClutter.ts`, `tests/unit/nearClutter.test.ts`
- Modify: `src/render/propMaterial.ts`, `src/game/world.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/nearClutter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildNearClutter, NEAR_CLUTTER_COUNT } from '../../src/surface/nearClutter';
import { NEAR_CLUTTER_BOX } from '../../src/render/propMaterial';
import { buildWorld } from '../../src/game/world';
import { Crawl } from '../../src/game/crawl';
import { PRESETS } from '../../src/render/graphics';

describe('near-worm clutter (Ultra)', () => {
  const mesh = buildNearClutter();
  const g = mesh.geometry;

  it('is one hidden mesh placed by the WRAP shader, a home for every vertex', () => {
    expect(mesh.visible).toBe(false);
    expect(mesh.frustumCulled).toBe(false);
    expect(mesh.material).toHaveProperty('defines.WRAP');
    const homes = g.getAttribute('aWrap').array as Float32Array;
    expect(g.getAttribute('aWrap').count).toBe(g.getAttribute('position').count);
    expect(new Set(Array.from(homes)).size).toBeGreaterThanOrEqual(NEAR_CLUTTER_COUNT);
    for (const h of homes) {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });

  it('is small: local items around the origin, a few thousand triangles', () => {
    const pos = g.getAttribute('position').array as Float32Array;
    for (let v = 0; v < pos.length; v += 3) expect(Math.hypot(pos[v], pos[v + 2])).toBeLessThan(1.5);
    expect(g.index!.count / 3).toBeLessThan(6000);
  });

  it('its wrap tile covers the 4.5 m fade', () => {
    expect(NEAR_CLUTTER_BOX / 2 - 0.5).toBeGreaterThanOrEqual(4.5);
  });

  it('shows on Ultra only', () => {
    const world = buildWorld(new Crawl());
    world.apply(PRESETS.ultra);
    expect(world.nearClutter.visible).toBe(true);
    world.apply(PRESETS.high);
    expect(world.nearClutter.visible).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/unit/nearClutter.test.ts`
Expected: FAIL with "Cannot find module '../../src/surface/nearClutter'".

- [ ] **Step 3: The prop material's WRAP variant**

In `src/render/propMaterial.ts`:

Replace:

```ts
  sharedLighting, PAINTED_VERTEX_GLSL, PAINTED_LIGHT_GLSL, GRADE_GLSL,
} from './paintedMaterial';

/**
```

with:

```ts
  sharedLighting, PAINTED_VERTEX_GLSL, PAINTED_LIGHT_GLSL, GRADE_GLSL,
} from './paintedMaterial';
import { groundUniforms } from './groundUniforms';
import { getLitterTexture, LITTER_GLSL } from './litterTexture';
import { getGroundTexture, GROUND_GLSL } from './groundTexture';
import { WRAP_GLSL } from './wrap';
import { glslFloat } from './glslNumber';

/** Side of the world tile the near-worm clutter repeats in (m); it fades out from 3.5 to 4.5 m. */
export const NEAR_CLUTTER_BOX = 10;

/**
```

Replace:

```ts
 * code whose integer part picks the treatment (0 plain, 1 stone with lichen and moss,
 * 2 plant, glowing where the sun shines through) and whose fraction is a 0..1 parameter.
 */
const vertexShader = /* glsl */ `
```

with:

```ts
 * code whose integer part picks the treatment (0 plain, 1 stone with lichen and moss,
 * 2 plant, glowing where the sun shines through) and whose fraction is a 0..1 parameter.
 * With WRAP defined (Ultra's near clutter), aWrap is each item's home in a world tile and the
 * vertex shader places the copy nearest the worm on the ground, shaded by the baked trunk shade.
 */
const vertexShader = /* glsl */ `
```

Replace:

```ts
  varying vec4 vFog;
  ${PAINTED_VERTEX_GLSL}
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    vNormalW = mat3(modelMatrix) * normal;
    vProp = aProp;
    vec3 toCam = cameraPosition - wp.xyz;
    float dist = length(toCam);
```

with:

```ts
  varying vec4 vFog;
  ${PAINTED_VERTEX_GLSL}
  #ifdef WRAP
  uniform vec3 uFocus;
  uniform vec2 uWrapCentre;
  uniform sampler2D uLitter;
  attribute vec2 aWrap;
  ${GROUND_GLSL}
  ${WRAP_GLSL}
  ${LITTER_GLSL}
  #endif
  void main() {
    #ifdef WRAP
      vec2 home = wrapAround(aWrap, uWrapCentre, ${glslFloat(NEAR_CLUTTER_BOX)});
      vec3 p = position * (1.0 - smoothstep(3.5, 4.5, distance(home, uFocus.xz)));
      vec2 xz = home + p.xz;
      vec3 lit = litterAt(home);
      vec4 wp = vec4(xz.x, meshGround(xz) + p.y, xz.y, 1.0);
      vNormalW = normal;
      vProp = vec4(aProp.rgb * lit.z, aProp.w);
    #else
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vNormalW = mat3(modelMatrix) * normal;
      vProp = aProp;
    #endif
    vPosW = wp.xyz;
    vec3 toCam = cameraPosition - wp.xyz;
    float dist = length(toCam);
```

Replace:

```ts
`;

export function createPropMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...sharedLighting },
    vertexShader,
    fragmentShader,
```

with:

```ts
`;

/** `wrap`: the near-worm clutter variant (placed around the worm in the vertex shader). */
export function createPropMaterial(wrap = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: wrap
      ? {
        ...sharedLighting,
        uFocus: groundUniforms.uFocus,
        uWrapCentre: groundUniforms.uWrapCentre,
        uLitter: { value: getLitterTexture() },
        uGround: { value: getGroundTexture() },
      }
      : { ...sharedLighting },
    defines: wrap ? { WRAP: '' } : {},
    vertexShader,
    fragmentShader,
```

- [ ] **Step 4: The near clutter mesh**

Create `src/surface/nearClutter.ts`:

```ts
import * as THREE from 'three';
import { mulberry32 } from '../core/random';
import { createPropMaterial } from '../render/propMaterial';
import { MeshWriter } from './meshWriter';
import { writeMushrooms, writeSedge } from './propGeometry';

/** Extra clutter items around the worm on Ultra. */
export const NEAR_CLUTTER_COUNT = 40;

/**
 * Ultra's "extra clutter near the worm": small sedge tufts and mushroom clusters written once
 * in local space (at the flat spawn, where the ground is exactly 0), each with a home in the
 * wrap tile (aWrap). The prop shader's WRAP path places the copy nearest the worm on the
 * ground and shrinks it away from 3.5 to 4.5 m, so the CPU does nothing as the worm moves.
 * One draw; hidden below Ultra.
 */
export function buildNearClutter(count = NEAR_CLUTTER_COUNT, seed = 41): THREE.Mesh {
  const w = new MeshWriter('aProp', 4);
  const rng = mulberry32(seed);
  const homes: number[] = [];
  for (let k = 0; k < count; k++) {
    const first = w.vertexCount;
    const scale = 0.5 + rng() * 0.4;
    if (rng() < 0.7) writeSedge(w, 0, 0, scale, rng);
    else writeMushrooms(w, 0, 0, scale, rng);
    const hx = rng();
    const hz = rng();
    for (let v = first; v < w.vertexCount; v++) homes.push(hx, hz);
  }
  const g = w.toGeometry();
  g.setAttribute('aWrap', new THREE.Float32BufferAttribute(homes, 2));
  const mesh = new THREE.Mesh(g, createPropMaterial(true));
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.name = 'nearClutter';
  return mesh;
}
```

- [ ] **Step 5: Shown on Ultra only**

In `src/game/world.ts`:

Replace:

```ts
import { buildDetailLeaves, type DetailLeaves } from '../surface/detailLeaves';
import { HeroLeafMesh } from '../surface/heroLeafMesh';
import { buildGroundProps, writeHeroLog, type GroundProps } from '../surface/groundProps';
import { HeroWorm, type WormPose } from '../worm/wormMesh';
```

with:

```ts
import { buildDetailLeaves, type DetailLeaves } from '../surface/detailLeaves';
import { HeroLeafMesh } from '../surface/heroLeafMesh';
import { buildNearClutter } from '../surface/nearClutter';
import { buildGroundProps, writeHeroLog, type GroundProps } from '../surface/groundProps';
import { HeroWorm, type WormPose } from '../worm/wormMesh';
```

Replace:

```ts
  /** Rocks and ground clutter. */
  props: GroundProps;
  /** Light shafts, dust motes and falling leaves. */
  atmosphere: Atmosphere;
```

with:

```ts
  /** Rocks and ground clutter. */
  props: GroundProps;
  /** Ultra's extra clutter around the worm. */
  nearClutter: THREE.Mesh;
  /** Light shafts, dust motes and falling leaves. */
  atmosphere: Atmosphere;
```

Replace:

```ts
  const hero = new HeroLeafMesh(crawl.hero);
  const props = buildGroundProps();
  const atmosphere = buildAtmosphere();
  // The hero worm: no eyes (spec 8.3); it is posed from the simulated spine every frame.
```

with:

```ts
  const hero = new HeroLeafMesh(crawl.hero);
  const props = buildGroundProps();
  const nearClutter = buildNearClutter();
  const atmosphere = buildAtmosphere();
  // The hero worm: no eyes (spec 8.3); it is posed from the simulated spine every frame.
```

Replace:

```ts
  terrain.renderOrder = 5;
  scene.add(
    terrain, buildForestTrees(writeHeroLog), buildDistantTrees(), litter.mesh, detail.group, hero.mesh, props.mesh, worm.group,
    buildSky(), atmosphere.group,
  );
  return {
    scene, litter, detail, hero, props, atmosphere, worm,
    apply(spec) {
      reaction = spec.reaction;
```

with:

```ts
  terrain.renderOrder = 5;
  scene.add(
    terrain, buildForestTrees(writeHeroLog), buildDistantTrees(), litter.mesh, detail.group, hero.mesh, props.mesh, nearClutter, worm.group,
    buildSky(), atmosphere.group,
  );
  return {
    scene, litter, detail, hero, props, nearClutter, atmosphere, worm,
    apply(spec) {
      reaction = spec.reaction;
```

Replace:

```ts
      detail.setCount(spec.detail);
      props.setDensity(spec.clutter);
      atmosphere.setLevel(spec.effects, spec.extraEffects);
      setRimLight(spec.rim);
```

with:

```ts
      detail.setCount(spec.detail);
      props.setDensity(spec.clutter);
      nearClutter.visible = spec.nearClutter;
      atmosphere.setLevel(spec.effects, spec.extraEffects);
      setRimLight(spec.rim);
```

- [ ] **Step 6: Run and see it pass**

Run: `npx tsc --noEmit && npx vitest run && npm run build && npx playwright test tests/e2e/speedTest.spec.ts`
Expected: unit PASS, 41 files, 385 tests; browser 5 passed.

- [ ] **Step 7: Commit**

```bash
git add src/surface/nearClutter.ts src/render/propMaterial.ts src/game/world.ts tests/unit/nearClutter.test.ts
git commit -m "feat(graphics): Ultra adds sedge and mushrooms around the worm

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Camera-occluder dither fade

> NOTE (post-Task 18): the shipped design is a screen-space fade over the whole visible body, not
> the head cone below. Each frame `occluderSegments` (`src/render/occluderSegments.ts`) projects
> the body axis (the spine raised 0.1, simplified to 0.02 m, clipped to depth >= 0.4 and the
> widened frustum) into `uOccSeg`/`uOccCount`, with a conservative NDC box `uOccBox`, `uOccTan`
> (1 / p00, 1 / p11) and the farthest body depth `uOccDepth`. `OCCLUDE_GLSL` (`fadedOut()`, no
> argument) skips pixels outside the box or behind the body, then drops 60% of a clear occluder's
> pixels (40% stays, spec 5.2) and 40% of a leaf lying on the body, in a fixed screen-space dither.
> Litter, detail, hero and Ultra's near clutter (prop WRAP) fade. The `fadedOut(vPosW)`/head-cone
> code and tests in this task are superseded.

Leaves between the camera and the worm's head drop 60% of their pixels in a fixed screen-space pattern, so they read as 40% opacity with no transparent pass and no sorting. The pattern does not change over time, so nothing flickers.

**Files:**
- Create: `src/render/occlusion.ts`, `tests/unit/occlusion.test.ts`
- Modify: `src/render/leafMaterial.ts`, `tests/unit/groundUniforms.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/occlusion.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { occlusion, OCCLUDE_GLSL, OCC_HEAD_UP, OCC_OUTER, OCC_DROP } from '../../src/render/occlusion';

// Camera 2.6 m behind and 1.1 m above a head at the origin, like the follow camera.
const C = [0, 1.1, -2.6] as const;
const H = [0, 0, 0] as const;
const at = (t: number, off = 0) => {
  const ax = H[0] - C[0];
  const ay = H[1] + OCC_HEAD_UP - C[1];
  const az = H[2] - C[2];
  return occlusion(C[0] + ax * t + off, C[1] + ay * t, C[2] + az * t, ...C, ...H);
};

describe('occlusion', () => {
  it('is full on the sight line between camera and head', () => {
    expect(at(0.5)).toBeCloseTo(1, 9);
    expect(at(0.8)).toBeCloseTo(1, 9);
  });
  it('is zero away from the sight line', () => {
    expect(at(0.5, OCC_OUTER + 0.01)).toBe(0);
  });
  it('is zero at the camera and at the head itself', () => {
    expect(at(0.01)).toBe(0);
    expect(at(1)).toBe(0);
  });
  it('falls off smoothly sideways', () => {
    let prev = 1;
    for (let off = 0; off <= OCC_OUTER; off += 0.005) {
      const o = at(0.5, off);
      expect(o).toBeLessThanOrEqual(prev + 1e-12);
      prev = o;
    }
  });
  it('keeps 40% of an occluding leaf', () => {
    expect(1 - OCC_DROP).toBeCloseTo(0.4, 12);
  });
  it('has a GLSL twin', () => {
    expect(OCCLUDE_GLSL).toContain('bool fadedOut(vec3 p)');
    expect(OCCLUDE_GLSL).toContain('* (1.0 - smoothstep(0.92, 0.98, t))');
  });
});
```

In `tests/unit/groundUniforms.test.ts`, append:

Replace:

```ts
    expect(m.defines).not.toHaveProperty('DISTURB');
  });
});
```

with:

```ts
    expect(m.defines).not.toHaveProperty('DISTURB');
  });
});

describe('leaf occluder fade', () => {
  it('is on for every leaf layer the worm moves through, off for the falling leaves', () => {
    for (const v of ['litter', 'detail', 'hero'] as const) {
      const m = createLeafMaterial(v);
      expect(m.defines).toHaveProperty('OCCLUDE');
      expect(m.uniforms.uFocus).toBe(groundUniforms.uFocus);
      expect(m.fragmentShader).toContain('if (fadedOut(vPosW)) discard;');
    }
    expect(createLeafMaterial('falling').defines).not.toHaveProperty('OCCLUDE');
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/occlusion.test.ts tests/unit/groundUniforms.test.ts`
Expected: FAIL: `occlusion` is missing; no material has `OCCLUDE`.

- [ ] **Step 3: Implement the sight-line fade**

Create `src/render/occlusion.ts`:

```ts
import { glslFloat } from './glslNumber';

/**
 * Leaves between the camera and the worm's head fade to 40% (spec 5.2) with a dithered
 * discard, so there is no extra transparent pass. `occlusion` says how much a point sits in
 * that sight line: 1 within OCC_INNER of it, 0 beyond OCC_OUTER, and 0 at the camera and at the
 * head itself (so the leaves the head is pushing through stay solid).
 */
export const OCC_INNER = 0.18;
export const OCC_OUTER = 0.32;
/** The head's sight-line target sits this far above the head (the top of the body). */
export const OCC_HEAD_UP = 0.12;
/** At full occlusion this share of a leaf's pixels is dropped: 40% stays. */
export const OCC_DROP = 0.6;

const smoothstep = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** TS twin of the GLSL below: point p, camera c, worm head h (all world space). */
export function occlusion(
  px: number, py: number, pz: number, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number,
): number {
  const ax = hx - cx;
  const ay = hy + OCC_HEAD_UP - cy;
  const az = hz - cz;
  const len2 = ax * ax + ay * ay + az * az;
  if (len2 < 1e-12) return 0;
  const t = Math.min(1, Math.max(0, ((px - cx) * ax + (py - cy) * ay + (pz - cz) * az) / len2));
  const d = Math.hypot(px - (cx + ax * t), py - (cy + ay * t), pz - (cz + az * t));
  return (1 - smoothstep(OCC_INNER, OCC_OUTER, d)) * smoothstep(0.02, 0.1, t) * (1 - smoothstep(0.92, 0.98, t));
}

// Constants print exactly to float32, as every GLSL twin's do (post-Task 14).
const f = glslFloat;

/**
 * Fragment GLSL: fadedOut(p) is true for the dropped pixels of a leaf in the sight line. The
 * pattern is fixed in screen space (interleaved gradient noise), so it never flickers.
 * Needs uniform uFocus (the worm's head).
 */
export const OCCLUDE_GLSL = /* glsl */ `
  uniform vec3 uFocus;
  float occlusion(vec3 p) {
    vec3 ab = uFocus + vec3(0.0, ${f(OCC_HEAD_UP)}, 0.0) - cameraPosition;
    float t = clamp(dot(p - cameraPosition, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    float d = distance(p, cameraPosition + ab * t);
    return (1.0 - smoothstep(${f(OCC_INNER)}, ${f(OCC_OUTER)}, d)) * smoothstep(0.02, 0.1, t)
      * (1.0 - smoothstep(0.92, 0.98, t));
  }
  bool fadedOut(vec3 p) {
    float occ = occlusion(p);
    if (occ <= 0.0) return false;
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    return ign < occ * ${f(OCC_DROP)};
  }
`;
```

- [ ] **Step 4: Litter, detail and hero leaves use it**

In `src/render/leafMaterial.ts`:

Replace:

```ts
import { DISTURB_GLSL, HERO_GLSL } from './leafGlsl';
import { DETAIL_GLSL } from './detailGlsl';
import { getLitterTexture } from './litterTexture';
import { getGroundTexture } from './groundTexture';

/**
```

with:

```ts
import { DISTURB_GLSL, HERO_GLSL } from './leafGlsl';
import { DETAIL_GLSL } from './detailGlsl';
import { getLitterTexture } from './litterTexture';
import { getGroundTexture } from './groundTexture';
import { OCCLUDE_GLSL } from './occlusion';

/**
```

Replace:

```ts
 * With DETAIL defined, aDetail (home x, z in the wrap tile, yaw, size) places each leaf of the
 * close-up layer around the worm in the vertex shader. With HERO defined it is the instanced
 * hero-leaf mesh (instanceMatrix, instanceColor tint).
 */
const vertexShader = /* glsl */ `
```

with:

```ts
 * With DETAIL defined, aDetail (home x, z in the wrap tile, yaw, size) places each leaf of the
 * close-up layer around the worm in the vertex shader. With HERO defined it is the instanced
 * hero-leaf mesh (instanceMatrix, instanceColor tint). With OCCLUDE defined, leaves between the
 * camera and the worm's head fade to 40% with a dithered discard.
 */
const vertexShader = /* glsl */ `
```

Replace:

```ts
  ${PAINTED_LIGHT_GLSL}
  ${GRADE_GLSL}

  void main() {
    vec3 n = normalize(vNormalW);
    if (!gl_FrontFacing) n = -n;
```

with:

```ts
  ${PAINTED_LIGHT_GLSL}
  ${GRADE_GLSL}
  #ifdef OCCLUDE
  ${OCCLUDE_GLSL}
  #endif

  void main() {
    #ifdef OCCLUDE
      if (fadedOut(vPosW)) discard;
    #endif
    vec3 n = normalize(vNormalW);
    if (!gl_FrontFacing) n = -n;
```

Replace:

```ts

const DEFINES: Record<LeafVariant, Record<string, string>> = {
  litter: { DISTURB: '' },
  falling: { FALLING: '' },
  detail: { DETAIL: '', DISTURB: '' },
  hero: { HERO: '' },
};

```

with:

```ts

const DEFINES: Record<LeafVariant, Record<string, string>> = {
  litter: { DISTURB: '', OCCLUDE: '' },
  falling: { FALLING: '' },
  detail: { DETAIL: '', DISTURB: '', OCCLUDE: '' },
  hero: { HERO: '', OCCLUDE: '' },
};

```

- [ ] **Step 5: Run and see it pass**

Run: `npx tsc --noEmit && npx vitest run && npm run build && npx playwright test tests/e2e/speedTest.spec.ts`
Expected: unit PASS, 42 files, 392 tests; browser 5 passed.

- [ ] **Step 6: Commit**

```bash
git add src/render/occlusion.ts src/render/leafMaterial.ts tests/unit/occlusion.test.ts tests/unit/groundUniforms.test.ts
git commit -m "feat(leaves): dithered fade for leaves between the camera and the worm's head

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Browser tests for the shell, and the Chromebook guide

**Files:**
- Create: `tests/e2e/shell.spec.ts`
- Modify: `docs/step0-chromebook-test.md`

- [ ] **Step 1: Write the browser tests**

Create `tests/e2e/shell.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PAGE = pathToFileURL(path.resolve('dist/index.html')).href;

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

test('keyboard only: crawl, pause with Esc, resume, reach Graphics and back to start', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(PAGE);
  await expect(page.getByRole('button', { name: 'Crawl' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Crawling' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowUp');

  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Resume' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Crawling' })).toBeVisible();

  await page.keyboard.press('KeyP');
  await expect(page.getByRole('button', { name: 'Resume' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Graphics' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('radio', { name: /^Auto/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Resume' })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Back to start' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Crawl' })).toBeFocused();
  expect(errors).toEqual([]);
});

test('keyboard only: change the preset from the Start screen', async ({ page }) => {
  await page.goto(PAGE);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Graphics' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('radio', { name: /^Auto/ })).toBeChecked();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: /^Low/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /^Low/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Crawl' })).toBeFocused();
});

test('a chosen preset is still selected after a reload', async ({ page }) => {
  await page.goto(PAGE);
  await page.getByRole('button', { name: 'Graphics' }).click();
  await page.getByRole('radio', { name: /^High/ }).check();
  await page.reload();
  await page.getByRole('button', { name: 'Graphics' }).click();
  await expect(page.getByRole('radio', { name: /^High/ })).toBeChecked();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wormsim.settings') ?? 'null'));
  expect(saved).toEqual({ version: 1, graphics: 'high', autoSettled: null });
});

test('switching presets during Crawl causes no page errors', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(PAGE);
  await page.getByRole('button', { name: 'Crawl' }).click();
  for (const name of ['Ultra', 'Low', 'Medium', 'High', 'Ultra', 'Auto']) {
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.getByRole('button', { name: 'Graphics' }).click();
    await page.getByRole('radio', { name: new RegExp(`^${name}`) }).check();
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Resume' }).click();
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(300);
    await page.keyboard.up('ArrowUp');
  }
  expect(errors).toEqual([]);
});

test('the fps tag shows while crawling only with ?fps=1', async ({ page }) => {
  await page.goto(PAGE);
  await page.getByRole('button', { name: 'Crawl' }).click();
  await page.waitForTimeout(600);
  await expect(page.locator('.fps')).toBeHidden();
  await page.goto(PAGE + '?fps=1');
  await page.getByRole('button', { name: 'Crawl' }).click();
  await expect(page.locator('.fps')).toContainText('fps', { timeout: 5000 });
});

test('a hidden tab pauses the crawl', async ({ page }) => {
  await page.goto(PAGE);
  await page.getByRole('button', { name: 'Crawl' }).click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
});
```

- [ ] **Step 2: Run them**

Run: `npm run test:e2e`
Expected: 12 passed (noWebgl 1, speedTest 5, shell 6). These cover spec section 7's browser list: offline with zero network requests, the CSP, the no-WebGL FAIL card, keyboard-only Start → Crawl/Graphics/Speed test, changing the preset, pausing with Esc and resuming, a preset surviving a reload, and switching presets during Crawl without errors. If a keyboard test fails, fix the screen code (focus handling lives in `src/ui/*.ts`), not the test.

- [ ] **Step 3: Update the Chromebook guide**

Replace `docs/step0-chromebook-test.md` with:

```markdown
# Chromebook speed test

This checks whether the 3D forest floor runs at 30 fps on a student Chromebook, and which
graphics setting suits it. It takes about 30 seconds.

## Get the game onto the Chromebook

- **Website:** open wormsimulator.com.
- **As a file:** on the Mac, run `npm run verify:build`. This makes `dist/index.html`, one file.
  Copy it to the Chromebook in either of these ways:
  - **USB stick:** copy `index.html` onto it, plug it in, then open it from the Files app.
  - **Google Drive:** upload `index.html`. On the Chromebook, open the Files app, then
    Google Drive, then right-click the file and choose **Open with Chrome**.
    (Opening it on the drive.google.com website shows a preview instead of running it.)

Tip: adding `?speedtest=1` to the end of the address opens the speed test straight away.

## Run it

1. Plug the Chromebook in. Battery saver can slow it down.
2. Close other tabs.
3. On the start screen, choose **Speed test**, then **Start speed test**. Don't touch anything
   for about 30 seconds.
4. Read the big **PASS** or **FAIL**.
   - The report also lists the longest pause during the automatic test, and, if it
     happened, how many times the measurement restarted. If it says the restart limit
     was reached, the tab kept losing focus. Keep the tab open and visible, then run
     it again.
5. Click **Copy results** and paste them into the Claude session.
6. Click **Use recommended setting** to save the graphics setting the test suggests for this
   Chromebook. It stays saved on this Chromebook.
7. Click **Back to start**, then **Crawl** to try the worm. Steer with the arrow keys, W A S D,
   or the round joystick pad in the bottom left. Press **Esc** or **P**, or the **Pause**
   button in the top right, to pause.

## Graphics settings

**Graphics** (on the start screen and in the pause menu) has five choices. A change shows at
once and is remembered on this computer.

- **Auto** (the default): starts on High and lowers detail if the game slows down.
- **Low:** fewest leaves, simple light. For slow computers.
- **Medium:** more leaves and soft light effects.
- **High:** lots of leaves and full effects. Best for most school Chromebooks.
- **Ultra:** the most leaves and the sharpest picture. For fast computers.

## Extra checks (optional)

Add these to the end of the address:
- `?fps=1`: show the frame rate while crawling.
- `?preset=low` (or `medium`, `high`, `ultra`): use that setting for this visit only, without
  saving it. The speed test then measures that setting.

## What the quality level means

The report's "Quality level used" is what **Use recommended setting** saves:
- **0:** High.
- **1 or 2:** Medium.
- **3:** Low.
- **FAIL:** please send the copied results to Matt; this Chromebook may need a simpler forest.
```

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/shell.spec.ts docs/step0-chromebook-test.md
git commit -m "test(e2e): keyboard flow, saved preset, live preset switch; update the Chromebook guide

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: Litter chunks and low-detail leaf shapes (pure)

Why Tasks 20 to 22 exist: with the spec's leaf counts, the first full build missed the High and Ultra gates by a wide margin. While writing this plan, a profiler rendered one frame 20 times with a `readPixels` sync, so the timing excludes the frame loop. At the spec counts on High it measured about 45 ms per frame: about 33 ms of pixel shading and 10 ms of vertex work. The leaf fragment shader alone was about 20 ms (a flat-colour leaf shader halved the frame). The detail layer cost about 16 ms (12 of them pixels), the base litter about 15 to 20 ms, and the per-pixel noise texture fetch about 4 to 5 ms. Draw order and the occluder `discard` made no measurable difference, so SwiftShader is not saving hidden leaf pixels with an early depth test. The user wants more leaves, so Tasks 20 to 22 make each leaf cheaper before Task 23 sets the counts. Measured with the same profiler, interleaved, the result is:

| Preset | Before (ms per frame) | After (ms per frame) |
|---|---|---|
| Low, spec counts | 9.9 | 8.5 |
| Medium, spec counts | 23.0 | 17.2 |
| High, spec counts | 46.4 | 33.7 |
| High, 3,000 litter + 1,500 detail | 44.0 | 31.6 |
| Ultra, 3,500 litter + 2,500 detail | 57.7 | 40.0 |

This task adds the two pure pieces: the chunk grid and a 6-triangle leaf for distant chunks.

**Files:**
- Create: `src/surface/litterChunks.ts`, `src/surface/leafLod.ts`, `tests/unit/litterChunks.test.ts`, `tests/unit/leafLod.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/litterChunks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  CHUNKS, CHUNK_SIZE, LOD_NEAR, LOD_GAP, chunkIndex, chunkCentreX, chunkCentreZ, chunkDistance,
  groupByChunk, countBelow, nextLod,
} from '../../src/surface/litterChunks';
import { WORLD_HALF } from '../../src/surface/terrain';
import { placeLeaves } from '../../src/surface/leafLitter';

describe('litter chunks', () => {
  it('tile the world exactly', () => {
    expect(CHUNKS * CHUNK_SIZE).toBeCloseTo(2 * WORLD_HALF, 12);
    expect(chunkIndex(-WORLD_HALF, -WORLD_HALF)).toBe(0);
    expect(chunkIndex(WORLD_HALF, WORLD_HALF)).toBe(CHUNKS * CHUNKS - 1);
    expect(chunkIndex(999, -999)).toBe(CHUNKS - 1);
  });

  it('every point lies in the chunk whose square holds it', () => {
    for (let x = -WORLD_HALF; x <= WORLD_HALF; x += 0.73) {
      for (let z = -WORLD_HALF; z <= WORLD_HALF; z += 0.81) {
        const c = chunkIndex(x, z);
        expect(Math.abs(x - chunkCentreX(c))).toBeLessThanOrEqual(CHUNK_SIZE / 2 + 1e-9);
        expect(Math.abs(z - chunkCentreZ(c))).toBeLessThanOrEqual(CHUNK_SIZE / 2 + 1e-9);
        expect(chunkDistance(c, x, z)).toBe(0);
      }
    }
  });

  it('chunkDistance is the distance to the nearest point of the square', () => {
    const c = chunkIndex(0.1, 0.1);
    const edge = chunkCentreX(c) + CHUNK_SIZE / 2;
    expect(chunkDistance(c, edge + 3, chunkCentreZ(c))).toBeCloseTo(3, 9);
    const cornerX = chunkCentreX(c) + CHUNK_SIZE / 2;
    const cornerZ = chunkCentreZ(c) + CHUNK_SIZE / 2;
    expect(chunkDistance(c, cornerX + 3, cornerZ + 4)).toBeCloseTo(5, 9);
  });

  it('groups leaves so a global prefix is a per-chunk prefix', () => {
    const leaves = placeLeaves(3000, WORLD_HALF, 4);
    const groups = groupByChunk(leaves);
    expect(groups.reduce((a, g) => a + g.length, 0)).toBe(3000);
    for (const g of groups) for (let k = 1; k < g.length; k++) expect(g[k]).toBeGreaterThan(g[k - 1]);
    for (const n of [0, 1, 777, 3000]) {
      const total = groups.reduce((a, g) => a + countBelow(g, n), 0);
      expect(total).toBe(n);
    }
  });

  it('countBelow counts entries under n', () => {
    const s = [1, 4, 4, 9, 20];
    expect(countBelow(s, 0)).toBe(0);
    expect(countBelow(s, 4)).toBe(1);
    expect(countBelow(s, 5)).toBe(3);
    expect(countBelow(s, 100)).toBe(5);
    expect(countBelow([], 3)).toBe(0);
  });

  it('switches level of detail with hysteresis', () => {
    expect(nextLod(false, LOD_NEAR - 0.1)).toBe(true);
    expect(nextLod(true, LOD_NEAR + 1)).toBe(true);
    expect(nextLod(false, LOD_NEAR + 1)).toBe(false);
    expect(nextLod(true, LOD_NEAR + LOD_GAP + 0.1)).toBe(false);
  });
});
```

Create `tests/unit/leafLod.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { lodShape, LOD_POINTS } from '../../src/surface/leafLod';
import { leafShape } from '../../src/surface/leafShapes';
import { LEAF_KINDS } from '../../src/surface/leafLitter';

const area = (p: Float32Array, idx: ArrayLike<number>) => {
  let a = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const [i, j, k] = [idx[t], idx[t + 1], idx[t + 2]];
    a += ((p[j * 2] - p[i * 2]) * (p[k * 2 + 1] - p[i * 2 + 1]) - (p[k * 2] - p[i * 2]) * (p[j * 2 + 1] - p[i * 2 + 1])) / 2;
  }
  return a;
};

describe('lodShape', () => {
  for (const kind of LEAF_KINDS) {
    it(`${kind}: ${LOD_POINTS} triangles, keeps base and tip, faces up, same rough size`, () => {
      const full = leafShape(kind);
      const lod = lodShape(kind);
      expect(lod.indices.length / 3).toBe(LOD_POINTS);
      expect(lod.points.length / 2).toBe(LOD_POINTS + 1);
      expect(lod.points[lod.base * 2 + 1]).toBe(full.points[full.base * 2 + 1]);
      expect(lod.tip).toBeGreaterThanOrEqual(0);
      expect(lod.points[lod.tip * 2 + 1]).toBe(full.points[full.tip * 2 + 1]);
      for (let t = 0; t < lod.indices.length; t += 3) {
        expect(area(lod.points, lod.indices.subarray(t, t + 3))).toBeGreaterThan(0);
      }
      const a = area(lod.points, lod.indices);
      const b = Math.abs(area(full.points, full.indices));
      expect(a).toBeGreaterThan(b * 0.45);
      expect(a).toBeLessThan(b * 1.3);
    });
  }
  it('is cached', () => {
    expect(lodShape('maple')).toBe(lodShape('maple'));
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/litterChunks.test.ts tests/unit/leafLod.test.ts`
Expected: FAIL, both modules missing.

- [ ] **Step 3: Implement the chunk grid**

Create `src/surface/litterChunks.ts`:

```ts
import { WORLD_HALF } from './terrain';

/**
 * The base litter is cut into CHUNKS x CHUNKS square chunks over the world, so that the
 * camera's frustum culls whole chunks, the renderer draws them near-first (the depth test then
 * skips hidden leaf pixels), distant chunks swap to a low-detail leaf, and only the chunks
 * around the worm pay for the disturbance map and the occluder fade. Pure.
 */
export const CHUNKS = 6;
export const CHUNK_SIZE = (2 * WORLD_HALF) / CHUNKS;
/** A chunk whose nearest point is closer to the camera than this draws full leaves... */
export const LOD_NEAR = 9;
/** ...and switches back to low-detail leaves only beyond LOD_NEAR + LOD_GAP (no flicker at the line). */
export const LOD_GAP = 2;
/** Chunks this close to the worm's head react to it (disturbance map, occluder fade). */
export const ACTIVE_RANGE = 5;

/** Which chunk (x, z) falls in; points outside the world clamp to the edge chunks. */
export function chunkIndex(x: number, z: number): number {
  const i = Math.min(CHUNKS - 1, Math.max(0, Math.floor((x + WORLD_HALF) / CHUNK_SIZE)));
  const j = Math.min(CHUNKS - 1, Math.max(0, Math.floor((z + WORLD_HALF) / CHUNK_SIZE)));
  return j * CHUNKS + i;
}

/** World x of chunk c's centre. */
export function chunkCentreX(c: number): number {
  return -WORLD_HALF + ((c % CHUNKS) + 0.5) * CHUNK_SIZE;
}

/** World z of chunk c's centre. */
export function chunkCentreZ(c: number): number {
  return -WORLD_HALF + (Math.floor(c / CHUNKS) + 0.5) * CHUNK_SIZE;
}

/** Distance from (x, z) to the nearest point of chunk c's square; 0 inside it. */
export function chunkDistance(c: number, x: number, z: number): number {
  const half = CHUNK_SIZE / 2;
  const dx = Math.max(0, Math.abs(x - chunkCentreX(c)) - half);
  const dz = Math.max(0, Math.abs(z - chunkCentreZ(c)) - half);
  return Math.hypot(dx, dz);
}

/**
 * Leaf indices grouped by chunk, each list ascending. Because placement order is random, the
 * first n leaves overall are, in every chunk, exactly the chunk's leaves with index < n.
 */
export function groupByChunk(points: readonly { x: number; z: number }[]): number[][] {
  const out: number[][] = Array.from({ length: CHUNKS * CHUNKS }, () => []);
  points.forEach((p, i) => out[chunkIndex(p.x, p.z)].push(i));
  return out;
}

/** How many entries of an ascending list are below n (binary search). */
export function countBelow(sorted: ArrayLike<number>, n: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < n) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Full leaves (true) or low-detail (false) for a chunk `dist` from the camera, with hysteresis. */
export function nextLod(near: boolean, dist: number): boolean {
  if (dist < LOD_NEAR) return true;
  if (dist > LOD_NEAR + LOD_GAP) return false;
  return near;
}
```

- [ ] **Step 4: Implement the low-detail shapes**

Create `src/surface/leafLod.ts`:

```ts
import { leafShape, type LeafShape } from './leafShapes';
import type { LeafKind } from './leafLitter';

/** Outline points kept for a distant leaf (6 triangles). */
export const LOD_POINTS = 6;

/**
 * A low-detail silhouette for distant litter: LOD_POINTS outline points, always including the
 * base and the tip, fanned around the shape's centre (the fan centre for fan shapes, the middle
 * of the midrib for oak). At a distance it reads as the same leaf for a quarter of the
 * triangles. Same leaf-local frame as leafShape. Pure.
 */
function simplified(kind: LeafKind): LeafShape {
  const s = leafShape(kind);
  const n = s.outline;
  const picks: number[] = [];
  for (let m = 0; m < LOD_POINTS; m++) picks.push((s.base + Math.round((m * n) / LOD_POINTS)) % n);
  // Make sure the tip is one of them: replace the pick nearest to it along the outline.
  if (!picks.includes(s.tip)) {
    let best = 1;
    for (let m = 1; m < LOD_POINTS; m++) {
      const d = (k: number) => Math.min(Math.abs(picks[k] - s.tip), n - Math.abs(picks[k] - s.tip));
      if (d(m) < d(best)) best = m;
    }
    picks[best] = s.tip;
  }
  const fan = s.points.length / 2 === n + 1 && kind !== 'oak';
  const cx = fan ? s.points[n * 2] : 0;
  const cy = fan ? s.points[n * 2 + 1] : 0;
  const points = new Float32Array((LOD_POINTS + 1) * 2);
  const vein = new Float32Array(LOD_POINTS + 1);
  picks.forEach((p, m) => {
    points[m * 2] = s.points[p * 2];
    points[m * 2 + 1] = s.points[p * 2 + 1];
    vein[m] = s.vein[p];
  });
  points[LOD_POINTS * 2] = cx;
  points[LOD_POINTS * 2 + 1] = cy;
  vein[LOD_POINTS] = 1;
  const indices = new Uint16Array(LOD_POINTS * 3);
  for (let m = 0; m < LOD_POINTS; m++) indices.set([LOD_POINTS, m, (m + 1) % LOD_POINTS], m * 3);
  return { points, outline: LOD_POINTS, indices, vein, base: 0, tip: picks.indexOf(s.tip) };
}

const cache = new Map<LeafKind, LeafShape>();

/** The (cached, shared) low-detail silhouette for a species. Treat it as read-only. */
export function lodShape(kind: LeafKind): LeafShape {
  let s = cache.get(kind);
  if (!s) {
    s = simplified(kind);
    cache.set(kind, s);
  }
  return s;
}
```

- [ ] **Step 5: Run them and see them pass**

Run: `npx vitest run tests/unit/litterChunks.test.ts tests/unit/leafLod.test.ts && npx tsc --noEmit`
Expected: PASS, 12 tests (6 + 6). `npx vitest run`: 44 files, 404 tests.

- [ ] **Step 6: Commit**

```bash
git add src/surface/litterChunks.ts src/surface/leafLod.ts tests/unit/litterChunks.test.ts tests/unit/leafLod.test.ts
git commit -m "feat(perf): litter chunk grid and low-detail leaf shapes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 21: Chunked litter with distance LOD and per-chunk materials

> NOTE (post-Task 18): the reviewer measured that about 75% of Task 18's cost is the presence of
> `discard` in the leaf shaders (the GPU loses its early depth rejection), not the segment loop.
> So the chunked litter MUST keep two precompiled programs per litter LOD, one with `OCCLUDE` and
> one plain, and select per chunk each frame by swapping the material (no recompile). A chunk may
> use the plain program when its bounds cannot intersect the fade hull: the camera plus the body
> points, inflated by `OCC_OUTER` (0.24) plus the drape/slide margin (`DRAPE_MARGIN`, 0.75 in `litterChunks.ts`). The
> test is conservative, so nothing pops. Detail, hero and Ultra's props stay `OCCLUDE` (they are
> near the worm only). This path also gives Low a runtime switch, which it does not have today.

The base litter becomes 36 chunks (6 × 6 over the world). Each chunk has two meshes: full leaves and 6-triangle leaves. Each mesh sits at its chunk's centre with a tight bounding sphere, so three's frustum culling skips chunks off screen and the renderer sorts chunks near-first. Every rendered frame, a chunk shows full leaves when the camera is within 9 m of it (hysteresis to 11 m) and low-detail leaves otherwise. Only chunks within 5 m of the worm's head get the material that samples the disturbance map and does the occluder fade (`litter`). Other near chunks get `plain`, which has neither. Distant chunks get `far`, which also skips the veins and the wet sheen. The three materials are created once, so switching between them never recompiles. A preset still shows the first n leaves overall: each chunk keeps its leaves in placement order and draws its own prefix.

Draw calls rise to about 24 to 31 per frame, so this needs the raised draw budget (≤ 40) recorded in Task 23.

**Files:**
- Create: `src/surface/leafWriter.ts`
- Modify: `src/surface/leafLitterMesh.ts` (replaced), `src/render/leafMaterial.ts`, `src/game/world.ts`, `tests/unit/sceneTiers.test.ts`, `tests/unit/litterPlacement.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/sceneTiers.test.ts`:

Replace:

```ts
import { describe, it, expect } from 'vitest';
import type * as THREE from 'three';
import { buildLeafLitter } from '../../src/surface/leafLitterMesh';
import { buildGroundProps } from '../../src/surface/groundProps';
import { buildFallingLeaves, FALLING_COUNT, FALLING_MAX } from '../../src/surface/fallingLeaves';
```

with:

```ts
import { describe, it, expect } from 'vitest';
import type * as THREE from 'three';
import { buildLeafLitter, type LeafLitter } from '../../src/surface/leafLitterMesh';
import { CHUNKS, CHUNK_SIZE, chunkIndex } from '../../src/surface/litterChunks';
import { LOD_POINTS } from '../../src/surface/leafLod';
import { buildGroundProps } from '../../src/surface/groundProps';
import { buildFallingLeaves, FALLING_COUNT, FALLING_MAX } from '../../src/surface/fallingLeaves';
```

Replace:

```ts
import { sharedLighting } from '../../src/render/paintedMaterial';

describe('leaf litter (merged)', () => {
  const litter = buildLeafLitter(2000);
  const g = litter.mesh.geometry;
  const full = g.index!.count;

  it('is one mesh with a sane vertex budget', () => {
    expect(g.getAttribute('position').count).toBeLessThanOrEqual(60000);
    expect(full / 3).toBeLessThanOrEqual(60000);
  });
  it('draws a whole-leaf prefix of any count', () => {
    expect(litter.max).toBe(2000);
    litter.setCount(2000);
    expect(g.drawRange.count).toBe(full);
    litter.setCount(1000);
    expect(g.drawRange.count).toBeGreaterThan(full * 0.35);
    expect(g.drawRange.count).toBeLessThan(full * 0.65);
    expect(g.drawRange.count % 3).toBe(0);
    litter.setCount(0);
    expect(g.drawRange.count).toBe(0);
    litter.setCount(99_999);
    expect(g.drawRange.count).toBe(full);
  });
  it('keeps all positions finite', () => {
    for (const v of g.getAttribute('position').array as Float32Array) expect(Number.isFinite(v)).toBe(true);
  });
});
```

with:

```ts
import { sharedLighting } from '../../src/render/paintedMaterial';

/** Index counts drawn by every chunk's full-leaf mesh, and their totals. */
const drawn = (l: LeafLitter) => l.chunks.reduce((a, c) => a + c.near.geometry.drawRange.count, 0);
const total = (l: LeafLitter) => l.chunks.reduce((a, c) => a + c.near.geometry.index!.count, 0);

describe('leaf litter (chunked)', () => {
  const litter = buildLeafLitter(2000);

  it('is cut into CHUNKS x CHUNKS chunks, each a full and a low-detail mesh', () => {
    expect(litter.chunks).toHaveLength(CHUNKS * CHUNKS);
    expect(litter.group.children).toHaveLength(2 * CHUNKS * CHUNKS);
    expect(litter.chunks.reduce((a, c) => a + c.leaves.length, 0)).toBe(2000);
    const verts = litter.chunks.reduce((a, c) => a + c.near.geometry.getAttribute('position').count, 0);
    expect(verts).toBeLessThanOrEqual(60000);
    for (const c of litter.chunks) {
      // Low detail: 6 triangles a leaf.
      expect(c.far.geometry.index!.count).toBe(c.leaves.length * LOD_POINTS * 3);
    }
  });

  it('draws a whole-leaf prefix of any count, in every chunk', () => {
    expect(litter.max).toBe(2000);
    litter.setCount(2000);
    expect(drawn(litter)).toBe(total(litter));
    litter.setCount(1000);
    expect(drawn(litter)).toBeGreaterThan(total(litter) * 0.35);
    expect(drawn(litter)).toBeLessThan(total(litter) * 0.65);
    expect(litter.chunks.reduce((a, c) => a + c.count, 0)).toBe(1000);
    for (const c of litter.chunks) expect(c.near.geometry.drawRange.count % 3).toBe(0);
    litter.setCount(0);
    expect(drawn(litter)).toBe(0);
    expect(litter.chunks.every((c) => !c.near.visible && !c.far.visible)).toBe(true);
    litter.setCount(99_999);
    expect(drawn(litter)).toBe(total(litter));
  });

  it('shows full leaves near the camera and low-detail ones far away', () => {
    litter.setCount(2000);
    litter.update(0, 0, 0, 0);
    const here = litter.chunks[chunkIndex(0, 0)];
    const corner = litter.chunks[chunkIndex(19, 19)];
    expect(here.near.visible).toBe(true);
    expect(here.far.visible).toBe(false);
    expect(corner.near.visible).toBe(false);
    expect(corner.far.visible).toBe(true);
  });

  it('only chunks near the worm use the reacting material', () => {
    litter.update(0, 0, 0, 0);
    const here = litter.chunks[chunkIndex(0, 0)].near.material as THREE.ShaderMaterial;
    const away = litter.chunks[chunkIndex(-12, 0)].near.material as THREE.ShaderMaterial;
    expect(here.defines).toHaveProperty('DISTURB');
    expect(here.defines).toHaveProperty('OCCLUDE');
    expect(away.defines).not.toHaveProperty('DISTURB');
    const far = litter.chunks[0].far.material as THREE.ShaderMaterial;
    expect(far.defines).toHaveProperty('LOD');
  });

  it('keeps all positions finite, with tight bounds per chunk', () => {
    for (const c of litter.chunks) {
      for (const v of c.near.geometry.getAttribute('position').array as Float32Array) expect(Number.isFinite(v)).toBe(true);
      expect(c.near.geometry.boundingSphere!.radius).toBeLessThan(CHUNK_SIZE * 1.3);
    }
  });
});
```

Replace:

```ts
describe('world.apply', () => {
  const world = buildWorld(new Crawl());
  const litterG = world.litter.mesh.geometry;
  const motes = world.atmosphere.group.getObjectByName('dustMotes') as THREE.Points;
  const falling = world.atmosphere.group.getObjectByName('fallingLeaves') as THREE.Mesh;
```

with:

```ts
describe('world.apply', () => {
  const world = buildWorld(new Crawl());
  const motes = world.atmosphere.group.getObjectByName('dustMotes') as THREE.Points;
  const falling = world.atmosphere.group.getObjectByName('fallingLeaves') as THREE.Mesh;
```

Replace:

```ts
  it('trims counts and switches effects and rim per preset, live', () => {
    world.apply(PRESETS.ultra);
    const ultraLeaves = litterG.drawRange.count;
    expect(ultraLeaves).toBe(litterG.index!.count);
    expect(world.atmosphere.group.visible).toBe(true);
    expect(motes.geometry.drawRange.count).toBe(MOTE_MAX);
```

with:

```ts
  it('trims counts and switches effects and rim per preset, live', () => {
    world.apply(PRESETS.ultra);
    const ultraLeaves = drawn(world.litter);
    expect(ultraLeaves).toBe(total(world.litter));
    expect(world.atmosphere.group.visible).toBe(true);
    expect(motes.geometry.drawRange.count).toBe(MOTE_MAX);
```

Replace:

```ts

    world.apply(PRESETS.high);
    expect(litterG.drawRange.count).toBeLessThan(ultraLeaves);
    expect(motes.geometry.drawRange.count).toBe(MOTE_COUNT);
    expect(falling.geometry.drawRange.count).toBeLessThan(ultraFalling);
```

with:

```ts

    world.apply(PRESETS.high);
    expect(drawn(world.litter)).toBeLessThan(ultraLeaves);
    expect(motes.geometry.drawRange.count).toBe(MOTE_COUNT);
    expect(falling.geometry.drawRange.count).toBeLessThan(ultraFalling);
```

Replace:

```ts
    expect(world.atmosphere.group.visible).toBe(false);
    expect(sharedLighting.uRim.value).toBe(0);
    expect(litterG.drawRange.count).toBeLessThan(ultraLeaves / 4);
  });

  it('switching presets does not touch the geometry buffers', () => {
    const pos = litterG.getAttribute('position');
    world.apply(PRESETS.medium);
    world.apply(PRESETS.ultra);
    expect(litterG.getAttribute('position')).toBe(pos);
  });
});
```

with:

```ts
    expect(world.atmosphere.group.visible).toBe(false);
    expect(sharedLighting.uRim.value).toBe(0);
    expect(drawn(world.litter)).toBeLessThan(ultraLeaves * (PRESETS.low.litter / PRESETS.ultra.litter) * 1.2);
  });

  it('switching presets does not touch the geometry buffers', () => {
    const g = world.litter.chunks[0].near.geometry;
    const pos = g.getAttribute('position');
    world.apply(PRESETS.medium);
    world.apply(PRESETS.ultra);
    expect(g.getAttribute('position')).toBe(pos);
  });
});
```

In `tests/unit/litterPlacement.test.ts`:

Replace:

```ts
  it('leaves near a pile centre lie on top of it', () => {
    const litter = buildLeafLitter(6000);
    const pos = litter.mesh.geometry.getAttribute('position').array as Float32Array;
    let near = 0;
    for (let v = 0; v < pos.length; v += 3) {
      const x = pos[v];
      const z = pos[v + 2];
      if (Math.hypot(x - pile.x, z - pile.z) > pile.r * 0.2) continue;
      near++;
      expect(pos[v + 1] - terrainHeight(x, z)).toBeGreaterThan(0.12);
    }
    expect(near).toBeGreaterThan(20);
```

with:

```ts
  it('leaves near a pile centre lie on top of it', () => {
    const litter = buildLeafLitter(6000);
    let near = 0;
    for (const c of litter.chunks) {
      // Chunk geometry is relative to the chunk's centre (the mesh position).
      const pos = c.near.geometry.getAttribute('position').array as Float32Array;
      for (let v = 0; v < pos.length; v += 3) {
        const x = pos[v] + c.near.position.x;
        const z = pos[v + 2] + c.near.position.z;
        if (Math.hypot(x - pile.x, z - pile.z) > pile.r * 0.2) continue;
        near++;
        expect(pos[v + 1] - terrainHeight(x, z)).toBeGreaterThan(0.12);
      }
    }
    expect(near).toBeGreaterThan(20);
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/sceneTiers.test.ts tests/unit/litterPlacement.test.ts`
Expected: FAIL. `LeafLitter` has no `chunks`, `group` or `update`.

- [ ] **Step 3: The leaf buffer writer (moved out of the litter builder)**

Create `src/surface/leafWriter.ts`:

```ts
import * as THREE from 'three';
import type { Vec3 } from '../core/vec';
import type { LeafKind } from './leafLitter';
import type { LeafShape } from './leafShapes';
import { leafLift, leafNormal, type LeafForm } from './leafForm';

/** Petiole: two extra vertices per leaf (one thin triangle off the blade's base). */
export const PETIOLE_VERTS = 2;
const PETIOLE: Record<LeafKind, number> = { maple: 0.32, oak: 0.08, aspen: 0.3, basswood: 0.22, ash: 0.07 };

/** Everything about one litter leaf except its silhouette, worked out once at build time. */
export interface LeafLook {
  kind: LeafKind;
  /** Leaf-local (u, lift, -v) to world. */
  m: THREE.Matrix4;
  q: THREE.Quaternion;
  form: LeafForm;
  inner: THREE.Color;
  edge: THREE.Color;
  petiole: THREE.Color;
  wet: number;
  lateral: number;
  seed: number;
}

const tmp = new THREE.Vector3();
const nrm = new THREE.Vector3();
const n: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Typed buffers for a merged leaf mesh with the leaf material's attributes (position, normal,
 * aColor, aLeaf, aLeaf2), filled one leaf at a time. `ends[i]` is the index count after leaf i,
 * so a draw range can show any prefix of whole leaves. Build-time only.
 */
export class LeafBuffers {
  readonly pos: Float32Array;
  readonly nor: Float32Array;
  readonly colr: Float32Array;
  readonly leaf: Float32Array;
  readonly leaf2: Float32Array;
  readonly index: Uint16Array | Uint32Array;
  readonly ends: Uint32Array;
  private v0 = 0;
  private ii = 0;
  private count = 0;

  constructor(verts: number, indices: number, leaves: number) {
    this.pos = new Float32Array(verts * 3);
    this.nor = new Float32Array(verts * 3);
    this.colr = new Float32Array(verts * 4);
    this.leaf = new Float32Array(verts * 4);
    this.leaf2 = new Float32Array(verts * 2);
    this.index = verts > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
    this.ends = new Uint32Array(leaves);
  }

  /** Vertices and indices one leaf of `shape` needs. */
  static size(shape: LeafShape, petiole: boolean): { verts: number; indices: number } {
    return {
      verts: shape.points.length / 2 + (petiole ? PETIOLE_VERTS : 0),
      indices: shape.indices.length + (petiole ? 3 : 0),
    };
  }

  /** Writes one leaf, positions relative to (ox, 0, oz) (the chunk's centre). */
  write(look: LeafLook, shape: LeafShape, petiole: boolean, ox: number, oz: number): void {
    const pts = shape.points;
    const np = pts.length / 2;
    const v0 = this.v0;
    const put = (k: number, u: number, v: number, h: number, nx: number, ny: number, nz: number) => {
      tmp.set(u, h, -v).applyMatrix4(look.m);
      this.pos.set([tmp.x - ox, tmp.y, tmp.z - oz], k * 3);
      nrm.set(nx, ny, nz).applyQuaternion(look.q);
      this.nor.set([nrm.x, nrm.y, nrm.z], k * 3);
      this.leaf2[k * 2] = look.lateral;
      this.leaf2[k * 2 + 1] = look.seed;
    };
    for (let p = 0; p < np; p++) {
      const u = pts[p * 2];
      const v = pts[p * 2 + 1];
      leafNormal(u, v, look.form, n);
      const k = v0 + p;
      put(k, u, v, leafLift(u, v, look.form), n.x, n.y, n.z);
      const onEdge = p < shape.outline ? 1 : 0;
      const c = onEdge ? look.edge : look.inner;
      this.colr.set([c.r, c.g, c.b, look.wet], k * 4);
      this.leaf.set([u, v, onEdge, shape.vein[p]], k * 4);
    }
    for (let t = 0; t < shape.indices.length; t++) this.index[this.ii++] = v0 + shape.indices[t];
    let added = np;
    if (petiole) {
      // A thin sliver from the blade's base, curving a touch up off the ground.
      const bu = pts[shape.base * 2];
      const bv = pts[shape.base * 2 + 1];
      const len = PETIOLE[look.kind];
      const half = 0.012 + len * 0.03;
      const bh = leafLift(bu, bv, look.form);
      for (let e = 0; e < PETIOLE_VERTS; e++) {
        const k = v0 + np + e;
        const u = e === 0 ? bu + half : bu + 0.004;
        const v = e === 0 ? bv - 0.02 : bv - len;
        put(k, u, v, bh + (e === 0 ? 0.005 : 0.03 + len * 0.1), 0, 1, 0);
        this.colr.set([look.petiole.r, look.petiole.g, look.petiole.b, look.wet], k * 4);
        this.leaf.set([u, v, 0.5, 1], k * 4);
      }
      this.index[this.ii++] = v0 + shape.base;
      this.index[this.ii++] = v0 + np;
      this.index[this.ii++] = v0 + np + 1;
      added += PETIOLE_VERTS;
    }
    this.v0 += added;
    this.ends[this.count++] = this.ii;
  }

  toGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.colr, 4));
    g.setAttribute('aLeaf', new THREE.BufferAttribute(this.leaf, 4));
    g.setAttribute('aLeaf2', new THREE.BufferAttribute(this.leaf2, 2));
    g.setIndex(new THREE.BufferAttribute(this.index, 1));
    return g;
  }
}
```

- [ ] **Step 4: The chunked litter**

Replace `src/surface/leafLitterMesh.ts` with:

```ts
import * as THREE from 'three';
import { mulberry32 } from '../core/random';
import { createLeafMaterial } from '../render/leafMaterial';
import { placeLeaves, type LeafPlacement } from './leafLitter';
import { leafShape } from './leafShapes';
import { lodShape } from './leafLod';
import { leafTint, LEAF_SIZE, LATERAL_VEINS } from './leafPalette';
import { terrainHeight, WORLD_HALF } from './terrain';
import { groundNormal, litterDepth } from './litterDepth';
import { makeShadeAt } from './treeShadows';
import { sharedLighting } from '../render/paintedMaterial';
import { LeafBuffers, type LeafLook } from './leafWriter';
import {
  ACTIVE_RANGE, chunkCentreX, chunkCentreZ, chunkDistance, countBelow, groupByChunk, nextLod,
} from './litterChunks';

/** Draw order: after the hero and detail leaves that lie on top, before the ground. */
export const LITTER_RENDER_ORDER = 3;
/** Bounding-sphere slack for leaves the disturbance map lifts or slides. */
const DRAPE_MARGIN = 0.35; // Landed as DRAPE_MARGIN = 0.75, exported from litterChunks.ts (it also sets ACTIVE_MARGIN).

export interface LitterChunk {
  /** Full leaves, shown when the camera is near. */
  readonly near: THREE.Mesh;
  /** Low-detail leaves (6 triangles, no petiole), shown when it is far. */
  readonly far: THREE.Mesh;
  /** Global indices (placement order) of this chunk's leaves, ascending. */
  readonly leaves: Uint32Array;
  readonly nearEnds: Uint32Array;
  readonly farEnds: Uint32Array;
  /** Leaves drawn now (the preset's prefix). */
  count: number;
  /** Showing full leaves. */
  isNear: boolean;
}

export interface LeafLitter {
  /** Every chunk's two meshes. */
  readonly group: THREE.Group;
  readonly chunks: readonly LitterChunk[];
  /** Leaves built: the most it can draw. */
  readonly max: number;
  /** Draws the first `n` leaves overall (placement order is random: an even thinning). */
  setCount(n: number): void;
  /**
   * Once per rendered frame: full or low-detail leaves per chunk by camera distance, and the
   * reacting material (disturbance map, occluder fade) only on chunks near the worm. Allocates
   * nothing.
   */
  update(camX: number, camZ: number, focusX: number, focusZ: number): void;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Size, curl, colour and pose of every leaf, from a second seeded stream. */
function looks(leaves: readonly LeafPlacement[], seed: number): LeafLook[] {
  const rng = mulberry32(seed * 7919 + 13);
  const slope = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const nrm = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const shadeAt = makeShadeAt(sharedLighting.uLightDir.value);
  return leaves.map((l) => {
    const size = l.scale * LEAF_SIZE[l.kind];
    // Dry oak curls hardest; big leaves lie flatter, so no edge rises much over ~0.12.
    const flat = Math.min(1, 0.9 / size);
    const form = {
      fold: (0.04 + rng() * 0.2) * flat,
      cup: rng() * (l.kind === 'oak' ? 0.6 : 0.3) * flat,
      curl: rng() * (l.kind === 'oak' ? 0.45 : 0.25) * flat,
    };
    const inner = new THREE.Color();
    const edge = new THREE.Color();
    const petiole = new THREE.Color();
    const wet = leafTint(l.kind, l.y, rng, inner, edge, petiole);
    // Long trunk shadows, baked.
    const shade = shadeAt(l.x, l.z);
    inner.multiplyScalar(shade);
    edge.multiplyScalar(shade);
    petiole.multiplyScalar(shade);
    const seedValue = rng();
    // Lie along the ground, including the slopes of leaf piles.
    const tn = groundNormal(l.x, l.z);
    slope.setFromUnitVectors(UP, nrm.set(tn.x, tn.y, tn.z));
    const q = new THREE.Quaternion().setFromEuler(euler.set(l.tilt * 0.3, l.rotY, 0)).premultiply(slope);
    // On the litter mound, in loose layers: each leaf at its own height, so overlaps never z-fight.
    pos.set(l.x, terrainHeight(l.x, l.z) + l.mound + 0.006 + l.y, l.z);
    const m = new THREE.Matrix4().compose(pos, q, scl.setScalar(size));
    return { kind: l.kind, m, q, form, inner, edge, petiole, wet, lateral: LATERAL_VEINS[l.kind], seed: seedValue };
  });
}

function chunkMesh(b: LeafBuffers, material: THREE.Material, cx: number, cz: number, name: string): THREE.Mesh {
  const g = b.toGeometry();
  g.computeBoundingSphere();
  if (g.boundingSphere) g.boundingSphere.radius += DRAPE_MARGIN;
  const mesh = new THREE.Mesh(g, material);
  // At the chunk's centre, so the renderer sorts chunks near-first.
  mesh.position.set(cx, 0, cz);
  mesh.renderOrder = LITTER_RENDER_ORDER;
  mesh.name = name;
  return mesh;
}

/**
 * The leaf litter in square chunks (see litterChunks.ts), each with a full-leaf and a
 * low-detail mesh: species silhouettes with a midrib fold, cup and curl, tinted per leaf and
 * lying on the litter mound in loose layers. Presets trim every chunk with a draw range.
 */
export function buildLeafLitter(count: number, seed = 1): LeafLitter {
  const placed = placeLeaves(count, WORLD_HALF, seed, litterDepth);
  const all = looks(placed, seed);
  const active = createLeafMaterial('litter');
  const plain = createLeafMaterial('plain');
  const lowDetail = createLeafMaterial('far');
  const group = new THREE.Group();
  group.name = 'leafLitter';

  const chunks: LitterChunk[] = groupByChunk(placed).map((ids, c) => {
    let nv = 0; let ni = 0; let fv = 0; let fi = 0;
    for (const i of ids) {
      const a = LeafBuffers.size(leafShape(all[i].kind), true);
      const b = LeafBuffers.size(lodShape(all[i].kind), false);
      nv += a.verts; ni += a.indices; fv += b.verts; fi += b.indices;
    }
    const near = new LeafBuffers(nv, ni, ids.length);
    const far = new LeafBuffers(fv, fi, ids.length);
    const cx = chunkCentreX(c);
    const cz = chunkCentreZ(c);
    for (const i of ids) {
      near.write(all[i], leafShape(all[i].kind), true, cx, cz);
      far.write(all[i], lodShape(all[i].kind), false, cx, cz);
    }
    const chunk: LitterChunk = {
      near: chunkMesh(near, plain, cx, cz, `litterNear${c}`),
      far: chunkMesh(far, lowDetail, cx, cz, `litterFar${c}`),
      leaves: Uint32Array.from(ids),
      nearEnds: near.ends,
      farEnds: far.ends,
      count: ids.length,
      isNear: false,
    };
    chunk.near.visible = false;
    chunk.far.visible = ids.length > 0;
    group.add(chunk.near, chunk.far);
    return chunk;
  });

  const show = (ch: LitterChunk) => {
    ch.near.visible = ch.isNear && ch.count > 0;
    ch.far.visible = !ch.isNear && ch.count > 0;
  };

  return {
    group,
    chunks,
    max: count,
    setCount(n: number) {
      const k = Math.max(0, Math.min(count, Math.floor(n)));
      for (const ch of chunks) {
        ch.count = countBelow(ch.leaves, k);
        ch.near.geometry.setDrawRange(0, ch.count > 0 ? ch.nearEnds[ch.count - 1] : 0);
        ch.far.geometry.setDrawRange(0, ch.count > 0 ? ch.farEnds[ch.count - 1] : 0);
        show(ch);
      }
    },
    update(camX, camZ, focusX, focusZ) {
      for (let c = 0; c < chunks.length; c++) {
        const ch = chunks[c];
        ch.isNear = nextLod(ch.isNear, chunkDistance(c, camX, camZ));
        ch.near.material = chunkDistance(c, focusX, focusZ) < ACTIVE_RANGE ? active : plain;
        show(ch);
      }
    },
  };
}
```

- [ ] **Step 5: The `plain` and `far` leaf materials**

In `src/render/leafMaterial.ts`:

Replace:

```ts
 * close-up layer around the worm in the vertex shader. With HERO defined it is the instanced
 * hero-leaf mesh (instanceMatrix, instanceColor tint). With OCCLUDE defined, leaves between the
 * camera and the worm's head fade to 40% with a dithered discard.
 */
const vertexShader = /* glsl */ `
```

with:

```ts
 * close-up layer around the worm in the vertex shader. With HERO defined it is the instanced
 * hero-leaf mesh (instanceMatrix, instanceColor tint). With OCCLUDE defined, leaves between the
 * camera and the worm's head fade to 40% with a dithered discard. With LOD defined (distant
 * litter) the fragment shader skips the veins and the wet sheen.
 */
const vertexShader = /* glsl */ `
```

Replace:

```ts
    float dapple = dappleLight(mix(0.5, nz.r, detail), b, 0.9);

    // Main veins: vLeaf.w is 1 along the vein edges of the leaf mesh, so a band near 1 is
    // a line of even width that tapers toward the margin. Fades out before it can alias.
```

with:

```ts
    float dapple = dappleLight(mix(0.5, nz.r, detail), b, 0.9);

    #ifdef LOD
    // Distant litter: too small on screen for veins or the wet sheen, so skip them.
    vec3 col = vColor.rgb * (1.0 - smoothstep(0.78, 1.0, vLeaf.z) * 0.32) * (1.0 + b * 0.4);
    vec3 lit = paintedLight(col, n, v, b, dapple);
    float ndl = dot(n, uLightDir);
    lit += col * uLightColor * max(-ndl, 0.0) * smoothstep(0.0, 0.3, dot(n, v)) * 0.9 * dapple;
    #else
    // Main veins: vLeaf.w is 1 along the vein edges of the leaf mesh, so a band near 1 is
    // a line of even width that tapers toward the margin. Fades out before it can alias.
```

Replace:

```ts
    spec *= spec * smoothstep(-0.05, 0.25, ndl) * dapple;
    lit += uLightColor * spec * (0.04 + vColor.a * 0.4);

    lit = mix(lit, vFog.rgb, vFog.a);
```

with:

```ts
    spec *= spec * smoothstep(-0.05, 0.25, ndl) * dapple;
    lit += uLightColor * spec * (0.04 + vColor.a * 0.4);
    #endif

    lit = mix(lit, vFog.rgb, vFog.a);
```

Replace:

```ts

/**
 * Which leaves: the floor litter and the close-up detail layer (both react to the worm), the
 * falling leaves (animated), or the hero leaves (instanced, moved by their own physics).
 */
export type LeafVariant = 'litter' | 'falling' | 'detail' | 'hero';

const DEFINES: Record<LeafVariant, Record<string, string>> = {
  litter: { DISTURB: '', OCCLUDE: '' },
  falling: { FALLING: '' },
  detail: { DETAIL: '', DISTURB: '', OCCLUDE: '' },
```

with:

```ts

/**
 * Which leaves: litter chunks near the worm (react to it and fade in its sight line), other
 * near litter chunks ('plain'), distant low-detail litter ('far'), the close-up detail layer,
 * the falling leaves (animated), or the hero leaves (instanced, moved by their own physics).
 */
export type LeafVariant = 'litter' | 'plain' | 'far' | 'falling' | 'detail' | 'hero';

const DEFINES: Record<LeafVariant, Record<string, string>> = {
  litter: { DISTURB: '', OCCLUDE: '' },
  plain: {},
  far: { LOD: '' },
  falling: { FALLING: '' },
  detail: { DETAIL: '', DISTURB: '', OCCLUDE: '' },
```

- [ ] **Step 6: The world adds the chunks and updates them each frame**

In `src/game/world.ts`:

Replace:

```ts
export interface World {
  scene: THREE.Scene;
  /** One merged mesh, built with Ultra's leaf count. */
  litter: LeafLitter;
  /** The close-up leaf layer around the worm. */
```

with:

```ts
export interface World {
  scene: THREE.Scene;
  /** The base litter in chunks (full and low-detail meshes), built with Ultra's leaf count. */
  litter: LeafLitter;
  /** The close-up leaf layer around the worm. */
```

Replace:

```ts
  terrain.renderOrder = 5;
  scene.add(
    terrain, buildForestTrees(writeHeroLog), buildDistantTrees(), litter.mesh, detail.group, hero.mesh, props.mesh, nearClutter, worm.group,
    buildSky(), atmosphere.group,
  );
```

with:

```ts
  terrain.renderOrder = 5;
  scene.add(
    terrain, buildForestTrees(writeHeroLog), buildDistantTrees(), litter.group, detail.group, hero.mesh, props.mesh, nearClutter, worm.group,
    buildSky(), atmosphere.group,
  );
```

Replace:

```ts
    sync(crawl, alpha, timeSec, camera) {
      crawl.interpolate(alpha, timeSec, pose, camera);
      worm.update(pose);
      hero.update(crawl.hero, alpha);
```

with:

```ts
    sync(crawl, alpha, timeSec, camera) {
      crawl.interpolate(alpha, timeSec, pose, camera);
      litter.update(camera.position.x, camera.position.z, crawl.focus.x, crawl.focus.z);
      worm.update(pose);
      hero.update(crawl.hero, alpha);
```

- [ ] **Step 7: Run and see it pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS, 44 files, 406 tests.

- [ ] **Step 8: Check the shaders compile**

Run: `npm run build && npx playwright test tests/e2e/speedTest.spec.ts`
Expected: 5 passed.

- [ ] **Step 9: Commit**

```bash
git add src/surface/leafWriter.ts src/surface/leafLitterMesh.ts src/render/leafMaterial.ts src/game/world.ts tests/unit/sceneTiers.test.ts tests/unit/litterPlacement.test.ts
git commit -m "perf(leaves): chunked litter with distance LOD and per-chunk materials

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 22: Cheaper leaf shading

> NOTE (post-Task 14), perf findings. On High, the detail layer (1,500 leaves) took the SwiftShader
> speed test from about 27 to about 19.5 fps (+1 draw, +~72k triangles a frame). The regression is
> fragment/fill-bound: vertex work is not the cost (proven by clipping the detail geometry). The
> levers, in order:
> 1. A lighter DETAIL fragment variant: drop the lateral veins and the `fwidth` work for detail
>    leaves (fixed `#define`, no recompile on preset switch).
> 2. A smaller detail fade radius on High, e.g. 3.5 -> 4.5 m instead of 5 -> 6 m, which about
>    halves the fill. Keep `DETAIL_BOX / 2 >= DETAIL_FADE_OUT + 0.5` (tested in detailLeaves.test.ts).
> 3. Thinning the base litter under the detail circle, so the two layers do not both cover it.
> Vertex-side packing (RGBA32F corner heights for meshGround, an RGBA16F gradient texture for
> disturb) only if real hardware turns out vertex-bound.
> Also: the detail leaves' size now lives in `aDetail.w` as the leaf's radius (shapes are scaled so
> the farthest vertex is 1 out), so shrinking them to 0.6x means scaling that radius; the
> clearance test in leafGlsl.test.ts and the GPU parity test (tests/e2e/glslParity.spec.ts) must
> still pass.

Each lever was measured with interleaved A/B runs of the speed test. Two cuts were kept:
- The painted-noise sample is fetched once per vertex instead of once per pixel, for every leaf variant. Leaves are small next to the noise's dapple features, so the look holds.
- Detail leaves are 0.6 times their old size (`size` 0.21 to 0.62 m, 0.21 to 0.39 of the species' leaf size, against the litter's 0.6 to 1.9; a radius of 0.11 to 0.385 m). A leaf's cost is its area on screen, and the spec calls for smaller detail leaves. Task 23 spends the saving on more detail leaves.

Together, at the spec's first counts, they took High from about 17 to about 21 fps and Medium from about 33 to about 36 fps (three interleaved rounds each, on a loaded machine).

Dropped, because they gave no measurable gain or a visible loss: a lighter detail fragment path, a smaller detail fade radius on High, a haze early-out in the shared painted vertex shader (`paintedMaterial.ts` is unchanged), and thinning the base litter under the detail circle (it bared the ground round the worm).

A follow-up (from the Task 21/22 reviews) raised `DRAPE_MARGIN` in `litterChunks.ts` from 0.6 to 0.75 (extreme probes moved a leaf vertex 0.71 m) and added a property test for the fade hull (`hullBox`) in `tests/unit/litterChunks.test.ts`.

**Files:**
- Create: `tests/unit/leafShading.test.ts`
- Modify: `src/render/leafMaterial.ts`, `src/surface/detailLeaves.ts`, `tests/unit/detailLeaves.test.ts`
- Modify (follow-up): `src/surface/litterChunks.ts`, `tests/unit/litterChunks.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/leafShading.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createLeafMaterial, type LeafVariant } from '../../src/render/leafMaterial';

describe('cheaper leaf shading', () => {
  const variants: LeafVariant[] = ['litter', 'plain', 'far', 'falling', 'detail', 'hero'];

  it('every leaf variant samples the painted noise once per vertex, never per pixel', () => {
    for (const v of variants) {
      const m = createLeafMaterial(v);
      expect(m.vertexShader).toContain('vNz = texture2D(uNoise, vNoise.xy);');
      expect(m.fragmentShader).not.toContain('texture2D(uNoise');
      expect(m.fragmentShader).toContain('vec4 nz = vNz;');
    }
  });

  it('distant litter skips the veins and the wet sheen', () => {
    expect(createLeafMaterial('far').defines).toEqual({ LOD: '' });
    expect(createLeafMaterial('far').fragmentShader).toContain('#ifdef LOD');
  });
});
```

In `tests/unit/detailLeaves.test.ts`:

Replace:

```ts
      expect(a[k + 1]).toBeGreaterThanOrEqual(0);
      expect(a[k + 1]).toBeLessThan(1);
      expect(a[k + 3]).toBeGreaterThan(0.3);
      expect(a[k + 3]).toBeLessThan(1.1);
    }
  });
```

with:

```ts
      expect(a[k + 1]).toBeGreaterThanOrEqual(0);
      expect(a[k + 1]).toBeLessThan(1);
      // The leaf's radius (m): well under the litter's leaves (0.21 to 0.39 of a species' size,
      // against the litter's 0.6 to 1.2), as a leaf's cost is its area on screen.
      expect(a[k + 3]).toBeGreaterThan(0.1);
      expect(a[k + 3]).toBeLessThan(0.42);
    }
  });
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/leafShading.test.ts tests/unit/detailLeaves.test.ts`
Expected: FAIL: the per-vertex noise test (the noise is still fetched per pixel) and the detail size test (sizes up to 1.04).

- [ ] **Step 3: Noise per vertex**

In `src/render/leafMaterial.ts`:

Replace:

```ts
 * Painted autumn leaves: the shared painted lighting plus, from leaf-local attributes, a
 * midrib and main veins, faint lateral veins, darker dried margins, a wet sheen on damp
 * leaves and a warm glow where the sun shines through the blade. One noise fetch per pixel.
 *
 * Attributes: aColor (rgb, wetness), aLeaf (u, v leaf-local; r 0 inside .. 1 on the margin;
```

with:

```ts
 * Painted autumn leaves: the shared painted lighting plus, from leaf-local attributes, a
 * midrib and main veins, faint lateral veins, darker dried margins, a wet sheen on damp
 * leaves and a warm glow where the sun shines through the blade. One noise fetch per vertex.
 *
 * Attributes: aColor (rgb, wetness), aLeaf (u, v leaf-local; r 0 inside .. 1 on the margin;
```

Replace:

```ts
  varying float vLat;
  varying vec3 vNoise;
  varying vec4 vFog;
  ${PAINTED_VERTEX_GLSL}
```

with:

```ts
  varying float vLat;
  varying vec3 vNoise;
  // The painted-noise sample, fetched per vertex: leaves are small next to its features, and a
  // per-pixel fetch was the largest single cost of shading a leaf.
  varying vec4 vNz;
  uniform sampler2D uNoise;
  varying vec4 vFog;
  ${PAINTED_VERTEX_GLSL}
```

Replace:

```ts
    float dist = length(toCam);
    vNoise = worldBrushCoord(wp.xyz, dist);
    vFog = distanceHaze(toCam, dist);
    gl_Position = projectionMatrix * viewMatrix * wp;
```

with:

```ts
    float dist = length(toCam);
    vNoise = worldBrushCoord(wp.xyz, dist);
    vNz = texture2D(uNoise, vNoise.xy);
    vFog = distanceHaze(toCam, dist);
    gl_Position = projectionMatrix * viewMatrix * wp;
```

Replace:

```ts
  varying float vLat;
  varying vec3 vNoise;
  varying vec4 vFog;
  ${PAINTED_LIGHT_GLSL}
```

with:

```ts
  varying float vLat;
  varying vec3 vNoise;
  varying vec4 vNz;
  varying vec4 vFog;
  ${PAINTED_LIGHT_GLSL}
```

Replace:

```ts
    vec3 v = normalize(cameraPosition - vPosW);
    float detail = vNoise.z;
    vec4 nz = texture2D(uNoise, vNoise.xy);
    float b = (nz.g * 0.6 + nz.b * 0.4 - 0.5) * 0.5 * detail;
    float dapple = dappleLight(mix(0.5, nz.r, detail), b, 0.9);
```

with:

```ts
    vec3 v = normalize(cameraPosition - vPosW);
    float detail = vNoise.z;
    vec4 nz = vNz;
    float b = (nz.g * 0.6 + nz.b * 0.4 - 0.5) * 0.5 * detail;
    float dapple = dappleLight(mix(0.5, nz.r, detail), b, 0.9);
```

- [ ] **Step 4: Smaller detail leaves**

In `src/surface/detailLeaves.ts`:

Replace:

```ts
    const s = detailShape(kind);
    const np = s.points.length / 2;
    const size = LEAF_SIZE[kind] * (0.35 + rng() * 0.3);
    form.fold = 0.1 + rng() * 0.2;
    form.cup = 0.2 + rng() * (kind === 'oak' ? 0.5 : 0.3);
```

with:

```ts
    const s = detailShape(kind);
    const np = s.points.length / 2;
    // Small (0.6x the first cut): they are many and near the camera, and a leaf's cost is its
    // area on screen (the layer is fill-bound). `size` is the leaf's scale, 0.21 to 0.39 of its
    // species' LEAF_SIZE (0.21 to 0.62 m, against the litter's 0.6 to 1.9); its radius
    // (aDetail.w, size times the shape's reach) is 0.11 to 0.385 m.
    const size = LEAF_SIZE[kind] * (0.21 + rng() * 0.18);
    form.fold = 0.1 + rng() * 0.2;
    form.cup = 0.2 + rng() * (kind === 'oak' ? 0.5 : 0.3);
```

- [ ] **Step 5: Run and see it pass**

Run: `npx tsc --noEmit && npx vitest run && npm run build && npx playwright test tests/e2e/speedTest.spec.ts`
Expected: unit PASS, 45 files, 409 tests; browser 5 passed.

- [ ] **Step 6: Commit**

```bash
git add src/render/leafMaterial.ts src/surface/detailLeaves.ts tests/unit/leafShading.test.ts tests/unit/detailLeaves.test.ts
git commit -m "perf(leaves): per-vertex leaf noise and smaller detail leaves

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 23: Set the leaf counts, record the deviations, and check realism

> NOTE (post-Task 14), perf findings. The detail layer's cost is fragment/fill-bound, not vertex
> work (proven by clipping its geometry). Before raising or trading `detail`
> counts, prefer, in order: a lighter DETAIL fragment variant (drop lateral veins and `fwidth`);
> a smaller detail fade radius on High (e.g. 3.5 -> 4.5 m instead of 5 -> 6 m, about half the
> fill; keep `DETAIL_BOX / 2 >= DETAIL_FADE_OUT + 0.5`); thinning the base litter under the
> detail circle. Vertex-side packing (RGBA32F corner heights, an RGBA16F gradient texture) only
> if real hardware is vertex-bound. Measured at Task 14 on High (SwiftShader, interleaved):
> about 27 fps before, about 19.5 fps after. On Low the detail layer is never built
> (`buildDetailLayer`), so it costs Low nothing.
>
> (post-Task 18) The occluder fade's dither stipple is visible at DPR 1 (the High render is
> 819 x 460 scaled up): mention it in the realism check. Non-WRAP props (High's mushrooms, plants
> and rocks) intentionally do not fade; only leaves and Ultra's near clutter do.
>
> (outcome) The controller approved relative gates: Step 0 built from `main` in a scratch worktree
> and benchmarked interleaved with each preset (Step 0, X, X, Step 0, ...), gate = old gate / 45.9
> on the median of at least 4 pair ratios. With the counts below, High failed (0.71×) and Ultra
> failed (0.57×). Tuned counts: litter 1,500 on every preset, detail 0 / 900 / 1,000 / 1,600, hero
> 0 / 12 / 24 / 32. Medians 1.60 / 1.17 / 0.80 / 0.65 (gates 1.09 / 0.87 / 0.74 / 0.61); High at
> 1,100 detail was borderline (0.75, then 0.73) and Ultra at 1,800 failed (0.60). The spec and "Spec deviations" carry the final numbers.

Spec section 6: the fps gates are the hard requirement. Draw calls may now be up to 40 per frame on every preset; the controller authorized this so the litter could be chunked. Triangle gates are unchanged. Each preset must use the highest counts that pass its gate and be strictly richer than the preset below: `litter`, `detail` and `hero` must never decrease from Low to Ultra, and `litter + detail` must increase. The `PRESETS` cost test enforces both.

Calibrated starting counts, with the reference Mac's benchmark. Two interleaved rounds each; the Mac carried a load average of 8 to 10 from other sessions, so read these as lower bounds:

| Preset | Litter / detail / hero | Before Tasks 20 to 22 (spec counts) | After (these counts) | Gate |
|---|---|---|---|---|
| Low | 2,000 / 0 / 0 | 59.9, 60.0 fps | 52.8, 56.6 fps | ≥ 50 |
| Medium | 2,000 / 800 / 12 | 41.6, 34.9 fps | 49.8, 36.8 fps | ≥ 40 |
| High | 2,000 / 1,000 / 24 | 19.3, 13.9 fps | 32.4, 29.1 fps | ≥ 34 |
| Ultra | 2,500 / 1,500 / 32 | 11.4, 12.2 fps | 28.3, 25.4 fps | ≥ 28 |

Draw calls per frame after: 24 to 31. Triangles per frame after: Low 71k, Medium 109k, High 93k to 120k, Ultra 135k.

Leaves within 6 m of the worm, averaged over ten worm positions (the spawn, the speed-test loop and the play area):
- Step 0 (2,000 uniform leaves): 144.
- These counts: Low 138; Medium 691 (4.8×); High 836 (5.8×); Ultra 1,211 (8.4×). Detail leaves are smaller, so leaf-covered ground near the worm on High is about 1.5× Step 0's.

**Files:**
- Modify: `src/render/graphics.ts`, `tests/unit/graphics.test.ts`, `docs/superpowers/specs/2026-10-01-game-shell-and-forest-floor-v2-design.md`
- Create (outside the repo, in the scratchpad): `closeups.mjs`

- [ ] **Step 1: Apply the calibrated counts**

In `src/render/graphics.ts`:

Replace:

```ts
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
```

with:

```ts
export const PRESETS: Readonly<Record<PresetId, PresetSpec>> = {
  low: {
    id: 'low', resolution: 0.6, maxDpr: 1, litter: 2000, detail: 0, hero: 0, reaction: false,
    effects: false, extraEffects: false, clutter: 0.5, nearClutter: false, rim: false,
  },
  medium: {
    id: 'medium', resolution: 0.75, maxDpr: 1, litter: 2000, detail: 800, hero: 12, reaction: true,
    effects: true, extraEffects: false, clutter: 1, nearClutter: false, rim: true,
  },
  high: {
    id: 'high', resolution: 1, maxDpr: 1, litter: 2000, detail: 1000, hero: 24, reaction: true,
    effects: true, extraEffects: false, clutter: 1, nearClutter: false, rim: true,
  },
  ultra: {
    id: 'ultra', resolution: 1, maxDpr: 1.5, litter: 2500, detail: 1500, hero: 32, reaction: true,
    effects: true, extraEffects: true, clutter: 1, nearClutter: true, rim: true,
  },
```

In `tests/unit/graphics.test.ts`:

Replace:

```ts
  });

  it('matches the spec table', () => {
    expect(PRESETS.low).toMatchObject({ resolution: 0.6, litter: 1000, detail: 0, hero: 0, reaction: false, effects: false, clutter: 0.5, rim: false });
    expect(PRESETS.medium).toMatchObject({ resolution: 0.75, litter: 2500, detail: 800, hero: 12, reaction: true, effects: true, clutter: 1, rim: true });
    expect(PRESETS.high).toMatchObject({ resolution: 1, maxDpr: 1, litter: 4000, detail: 1500, hero: 24, extraEffects: false, nearClutter: false });
    expect(PRESETS.ultra).toMatchObject({ resolution: 1, maxDpr: 1.5, litter: 6000, detail: 2500, hero: 32, extraEffects: true, nearClutter: true });
  });

```

with:

```ts
  });

  it('matches the spec table (counts tuned to the section 6 gates)', () => {
    expect(PRESETS.low).toMatchObject({ resolution: 0.6, litter: 2000, detail: 0, hero: 0, reaction: false, effects: false, clutter: 0.5, rim: false });
    expect(PRESETS.medium).toMatchObject({ resolution: 0.75, litter: 2000, detail: 800, hero: 12, reaction: true, effects: true, clutter: 1, rim: true });
    expect(PRESETS.high).toMatchObject({ resolution: 1, maxDpr: 1, litter: 2000, detail: 1000, hero: 24, extraEffects: false, nearClutter: false });
    expect(PRESETS.ultra).toMatchObject({ resolution: 1, maxDpr: 1.5, litter: 2500, detail: 1500, hero: 32, extraEffects: true, nearClutter: true });
  });

```

Run: `npx vitest run`
Expected: PASS, 45 files, 409 tests.

- [ ] **Step 2: Benchmark every preset, three times each**

Close other heavy work first (other test runs, builds or browsers): the benchmark is CPU-bound and swings by 30% under load.

```bash
BENCH=/private/tmp/claude-501/-Users-mattnupen-Desktop-Code-Projects-worm-simulator/ec744b05-5dfd-4f59-a583-c8632a1b38ce/scratchpad/bench.mjs
npm run build
for r in 1 2 3; do for p in low medium high ultra; do node "$BENCH" "$PWD" "step1a-$p" "?speedtest=1&preset=$p"; done; done
```

For each preset take the best of its three "Full quality, no cap" averages (contention only ever lowers it). From the `idle 1s: N draw calls, T tris over R rAFs` line, draws per frame = N / min(R, 30) and triangles per frame = T / min(R, 30).

- [ ] **Step 3: Tune to the highest passing counts**

For each preset, starting from Ultra and going down:
- **Over its gate by more than 10%:** raise `detail` by 200, re-run that preset three times, and repeat. If detail reaches the next preset up's value, raise `litter` by 250 instead.
- **Under its gate:** lower `detail` by 100, re-run three times, and repeat. Stop lowering detail once the preset's `litter + detail` would no longer exceed the preset below; lower `litter` by 250 instead.
- **Never:**
  - break the ordering (each field never decreasing from Low to Ultra; `litter + detail` increasing);
  - exceed 40 draws per frame or the triangle gates (Low 90k, Medium 170k, High 240k, Ultra 350k);
  - drop below 2× Step 0's near-worm count (detail 300 on Medium and up keeps it).

After each change, update the four `toMatchObject` lines in the `matches the spec table` test to the new values and run `npx vitest run`.

- [ ] **Step 4: Record the counts and the deviations in the spec**

In `docs/superpowers/specs/2026-10-01-game-shell-and-forest-floor-v2-design.md`, section 4.1, replace:

```markdown
| Base leaf litter | 1,000 | 2,500 | 4,000 | 6,000 |
| Detail leaves around the worm | 0 | 800 | 1,500 | 2,500 |
```

with the values now in `PRESETS` (as calibrated in Step 1, unless Step 3 changed them):

```markdown
| Base leaf litter | 2,000 | 2,000 | 2,000 | 2,500 |
| Detail leaves around the worm | 0 | 800 | 1,000 | 1,500 |
```

In section 6, replace the gate table's four rows:

```markdown
| Low | ≥ 50 | ≤ 14 | ≤ 90k |
| Medium | ≥ 40 | ≤ 16 | ≤ 170k |
| High | ≥ 34 | ≤ 16 | ≤ 240k |
| Ultra | ≥ 28 | ≤ 18 | ≤ 350k |
```

with:

```markdown
| Low | ≥ 50 | ≤ 40 | ≤ 90k |
| Medium | ≥ 40 | ≤ 40 | ≤ 170k |
| High | ≥ 34 | ≤ 40 | ≤ 240k |
| Ultra | ≥ 28 | ≤ 40 | ≤ 350k |
```

and after the bullet "The leaf counts in 4.1 are tuning targets. ..." add:

```markdown
- Tuned in Step 1a (plan Tasks 20 to 23). The base litter is drawn in 6 × 6 chunks (frustum culling, near-first order, a 6-triangle leaf beyond 9 m, the reacting shader only near the worm), so the draw budget is raised to the Step 0 limit of 40 (authorized). The painted noise is sampled per vertex for leaves, and detail leaves are 0.21 to 0.62 m. With the spec's first counts the benchmark gave Low 60, Medium 42, High 19 and Ultra 12 fps. With the counts above and these optimizations it gives Low 57, Medium 50, High 32 and Ultra 28 fps (best of two runs on a loaded machine). Within 6 m of the worm there are about 5.8× as many leaves on High as in Step 0.
```

If Step 3 changed any count or produced different best-of-three fps, write your final counts and fps into the table rows and the bullet in place of these numbers.

- [ ] **Step 5: Save the close-up script**

Create `/private/tmp/claude-501/-Users-mattnupen-Desktop-Code-Projects-worm-simulator/ec744b05-5dfd-4f59-a583-c8632a1b38ce/scratchpad/closeups.mjs` (outside the repo; `node_modules` is symlinked there):

```js
// Spec 5.6 realism close-ups. Usage: node closeups.mjs <repoDir> <preset> <outDir>
// Drives the built game with the keyboard and saves four PNGs to look at.
import { chromium } from '@playwright/test';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, preset = 'high', outDir = '.'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const url = pathToFileURL(path.join(repo, 'dist/index.html')).href + `?preset=${preset}`;
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];

async function session(name, drive) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(url);
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Crawl' }).click();
  const hold = async (keys, ms) => {
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(ms);
    for (const k of keys) await page.keyboard.up(k);
  };
  const shot = async (label) => page.screenshot({ path: path.join(outDir, `${preset}-${name}-${label}.png`) });
  await drive(hold, shot, page);
  await page.close();
}

// 1. Under thin litter: a short crawl across open ground near the spawn.
await session('under', async (hold, shot, page) => {
  await hold(['ArrowUp'], 1500);
  await page.waitForTimeout(300);
  await shot('0s');
});
// 2. Climbing a pile head first: turn toward the pile at (-4, 3) and crawl onto it.
await session('pile', async (hold, shot, page) => {
  await hold(['ArrowUp', 'ArrowRight'], 560);
  await hold(['ArrowUp'], 2400);
  await page.waitForTimeout(300);
  await shot('0s');
});
// 3. A trail settling: crawl a tight circle so the trail lies ahead, then wait.
await session('trail', async (hold, shot, page) => {
  await hold(['ArrowUp', 'ArrowRight'], 4000);
  await page.waitForTimeout(200);
  await shot('0s');
  await page.waitForTimeout(8000);
  await shot('8s');
  await page.waitForTimeout(12000);
  await shot('20s');
});
// 4. Leaves draping over the body: crawl straight, then stop and look.
await session('drape', async (hold, shot, page) => {
  await hold(['ArrowUp'], 2500);
  await shot('0s');
});
console.log(`errors: ${errors.length ? errors.join(' | ') : 'none'}`);
await browser.close();
```

- [ ] **Step 6: Take and judge the close-ups (spec 5.6)**

```bash
S=/private/tmp/claude-501/-Users-mattnupen-Desktop-Code-Projects-worm-simulator/ec744b05-5dfd-4f59-a583-c8632a1b38ce/scratchpad
npm run build
node "$S/closeups.mjs" "$PWD" high "$S/closeups"
node "$S/closeups.mjs" "$PWD" ultra "$S/closeups"
```

Expected: `errors: none`, and PNGs named `<preset>-under-0s.png`, `<preset>-pile-0s.png`, `<preset>-trail-0s.png`, `-trail-8s.png`, `-trail-20s.png` and `<preset>-drape-0s.png`. Open every one with the Read tool and check:
- **under:** in open litter the worm is partly covered by leaves, and the leaves in the sight line to its head are dithered so the head stays readable;
- **pile:** the head is up on the pile (the route crawls onto the pile at (-4, 3)) while the tail is still low;
- **trail:** at 0 s a cleared, pushed-aside furrow lies along the loop; at 8 s it is fainter; at 20 s it has mostly settled;
- **drape:** leaves near the body bend over it rather than cutting through it.

If the close-ups look fake, grow the hero-leaf share within the gates (spec 5.6): raise `hero` on High/Ultra by 4 (up to 32) and `HERO_RADIUS`/`HERO_RECYCLE` in `src/surface/heroLeaves.ts` by 0.5 each, then repeat Step 3 for those presets and this step. Shape tweaks that cost nothing may also be tried, one at a time, re-shooting after each: `DRAPE_HEIGHT` (0.18 to 0.26) and `PUSH_SLIDE` (0.05 to 0.1) in `src/render/leafGlsl.ts`. Run `npx vitest run` after any change. Send the final close-ups to the controller for Matt.

- [ ] **Step 7: Full verification**

Run: `npx tsc --noEmit && npx vitest run && npm run test:e2e && node scripts/check-single-file.mjs`
Expected: no type errors; 45 files, 409 tests passed; 12 browser tests passed; "single-file build OK" with the file well under 8 MB.

- [ ] **Step 8: Commit**

```bash
git add src/render/graphics.ts tests/unit/graphics.test.ts docs/superpowers/specs/2026-10-01-game-shell-and-forest-floor-v2-design.md
git commit -m "perf(graphics): set preset leaf counts to the section 6 gates

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

If Step 6 changed `src/surface/heroLeaves.ts` or `src/render/leafGlsl.ts`, add them to this commit.

---

## Spec deviations

These change the approved spec. Task 23 wrote them into it.

| What | Spec | Built | Why |
|---|---|---|---|
| fps gates (6) | Absolute: Low ≥ 50, Medium ≥ 40, High ≥ 34, Ultra ≥ 28 | Relative to Step 0 benchmarked in the same session (old gate / 45.9): ≥ 1.09×, 0.87×, 0.74×, 0.61×; median of ≥ 4 interleaved pair ratios | Approved by the controller: the machine was loaded and drifting (Step 0 measured 33 to 42 fps), so absolute numbers were unreliable. |
| Draw calls per frame (6) | Low ≤ 14, Medium ≤ 16, High ≤ 16, Ultra ≤ 18 | ≤ 40 on every preset | Authorized by the controller so the litter can be chunked (culling, near-first order, LOD, shader only near the worm). Measured 25 to 33. |
| Base litter (4.1) | 1,000 / 2,500 / 4,000 / 6,000 | 1,500 / 1,500 / 1,500 / 1,500 | The fps gates are hard. Litter past 1,500 cost more than it showed; leaves near the worm (where the camera looks) earn more than far coverage. |
| Detail leaves (4.1) | 0 / 800 / 1,500 / 2,500 | 0 / 900 / 1,000 / 1,600 | Highest that pass reliably (High at 1,100 was borderline, 0.75 then 0.73; Ultra at 1,800 failed, 0.60). Within 6 m of the worm: 107 / 718 / 798 / 1,207 leaves (Step 0: 144). Measured pair-ratio medians: 1.60 (60 fps cap) / 1.17 / 0.80 / 0.65. |
| Detail leaf size (5.5) | "smaller" than the litter (no number) | Radius 0.11 to 0.385 m (scale 0.21 to 0.62; litter 0.6 to 1.9) | Within the spec's wording; recorded because it is what makes the near-worm density affordable (the layer is fill-bound). |
| Detail leaf placement (5.5) | Re-placed from a seed around a 1 m-snapped centre | Fixed homes in a 13 m world tile, the copy nearest the worm drawn; laid on the rendered ground (baked ground-height texture) in the loose litter above the mound (baked litter texture) | Nothing jumps while visible, and the leaves sit exactly on the surface the worm rests on. |
| Leaf shading (6) | (not specified) | Noise sampled per vertex; distant litter skips veins and sheen; each litter chunk picks one of three programs made once (reacting, plain, far) by swapping its material | Measured cost cuts that keep the near look; the occluder fade's `discard` costs early depth rejection, so only chunks that may need it get it. |
| Disturbance map (5.3) | Each cell holds a push direction (x, z), a lift and a weight; all decay with a ~6 s half-life; leaves lift into a soft drape under the body and tilt and slide beside it | Each cell holds path nearness (linear in distance, to 1.6 m), body nearness (re-stamped every step) and trail freshness (6 s half-life); G is unused. A leaf shader reads back distance and direction (5 fetches) and moves each leaf as one rigid piece: it slides off the path until its near edge clears 0.14 m (at most 0.2 m, easing back as the trail fades), and tilts up onto the body, far edge on the litter, clear of the body's top (never steeper than 45°: Task 23); each vertex's dip below the rest plane is raised when lifted. The ground darkens the bared soil along a fresh trail. | Per-vertex lift tore leaves into tents and clipped through the worm (Task 13 review). Rigid pieces need the distance to the worm, not a push. Verified: no worm vertex within 5 mm of a leaf over it in 400 placements on the real litter. |
| Hero leaves (5.4) | The head or body pushes a leaf it overlaps | Body as pushers (position, radius, strength, top, under, belly, fall): a pusher under the litter does not shove, a leaf rides over it as a tilted plate clear of its top; a pusher above a leaf presses it flat; a leaf the head turns over swings clear of the body; trunks (with root flare), rocks and the log keep leaves out | A shoved leaf cut through a worm crawling under the litter, and leaves wedged against trunks (Task 16 fixes). |
| Occluder fade (5.2) | Leaves between the camera and the head fade to 40% | A screen-space fade along the whole visible body: 60% of a clear-standing leaf's pixels dropped, 40% of one lying on the body; litter, detail, hero leaves and Ultra's near clutter fade, High's other props do not | The head alone left the body hidden; a fixed dither keeps one opaque pass. The stipple shows at device pixel ratio 1. |
| Ultra's near clutter (4.1) | "Extra near the worm" | 40 sedge tufts and mushroom clusters in a 10 m wrapped tile (one draw), fading 3.5 to 4.5 m, shrunk near the rendered spine so nothing comes within 0.2 m of it | A tuft standing on the worm's path would poke through the body; the clearance is checked against the real tube (Task 17). |
| Auto's starting preset (4.3) | Starts at the saved autoSettled (or High) | A new session starts one step above autoSettled (Low → Medium, Medium → High, High stays High, never Ultra), then steps down within seconds if still slow; re-choosing Auto mid-session starts at autoSettled itself | One slow session (battery saver, a busy machine) would otherwise pin a Chromebook at Low for good, since Auto never steps up. From code review (Task 7). |
| Use recommended setting (4.3) | Tier 0 → High, 1–2 → Medium, 3 → Low | The same, but never above the preset the test measured (High unless forced with `?preset=`) | A test forced to Low must not recommend High (Task 19 follow-up). |

## Self-review

### Spec coverage

| Spec section | Requirement | Task(s) |
|---|---|---|
| 1 | Spend spare speed on detail; a graphics setting for weak machines | 1, 8, 14, 16, 20–23 |
| 2 | Physical, automatic under/over; presets + Auto; 30 fps cap; real game entry; approach A + B | 1, 7, 11, 13, 14, 15, 16 |
| 3.1 | Start (Crawl, Graphics, Speed test) over the live forest | 3, 6, 7 |
| 3.1 | Crawl: Pause button ≥ 48 px top right, joystick, fps tag only with `?fps=1` | 3, 6, 7, 19 |
| 3.1 | Pause by Esc, P, button, hidden tab; Resume, Graphics, Back to start; simulation stops, last frame kept | 3, 6, 7, 19 |
| 3.1 | Graphics from Start and Pause, Back returns to where it came from | 3, 6, 7, 19 |
| 3.1 | Speed test unchanged inside (phases, restarts, report, no-WebGL and context-lost FAIL cards) + Use recommended setting | 5, 6, 7, 19 |
| 3.1 | Transitions diagram | 3 (every edge tested) |
| 3.1 | Accessibility: 18 px, 7:1, 4 px focus, 48 px, focus moves, aria-live, reduced motion, no flashing | 6 (CSS, focus calls), 18 (static dither), 19 (keyboard tests) |
| 3.2 | `wormsim.settings` JSON, guarded, defaults, session-only on failure | 2, 4, 19 |
| 3.3 | `src/main.ts`, `src/game/screens.ts`, `src/game/crawl.ts`, `src/ui/`, `src/render/graphics.ts`, `src/perf/`, `src/spike/` removed | 1, 3, 5, 6, 7 |
| 4.1 | Preset table and menu descriptions | 1 (table, labels), 8 (exact counts), 17 (Ultra clutter), 23 (tuned counts) |
| 4.2 | Live apply: draw ranges/`mesh.count`, visibility, `setPixelRatio`, built at Ultra size, no recompiles | 7 (`applySpec`), 8, 14, 16, 17, 21 (per-chunk draw ranges; three materials made once) |
| 4.3 | Auto: starts at autoSettled or High, QualityController timing, High→Medium→Low, never Ultra, saves autoSettled, menu turns it off/on, tier mapping | 1, 4, 7 (Auto runs in Crawl) |
| 5.1 | `litterDepth` 0.01–0.25, open ~0.02, hollows, drifts (downwind deeper), 4–6 piles, deterministic, continuous; placement uses it | 9, 10 |
| 5.2 | `wormSurface` under/over blend, y formula, Low forces under = 0, per segment, shadow and camera follow | 11 |
| 5.2 | Leaves between camera and head fade to 40%, dithered | 18 (and 21: the reacting litter material near the worm keeps it) |
| 5.3 | 64×64 over 8 m, whole-cell scroll, push/lift/weight, stamping (head hardest), ~6 s half-life, edge cleared, one upload per frame, drape/push/furrow in leaf shaders, off on Low | 12, 13 (21: only chunks near the worm sample it) |
| 5.4 | Hero leaves within 3 m, pool by preset, push (head harder), flip, friction, settle, never below, recycle > 4 m ahead deterministically, one instanced mesh, leaf material | 15, 16 |
| 5.5 | Detail layer: smaller, curled, higher-vertex, 6 m, species shapes, built once, 1 m snap, GPU placement, 5–6 m fade, reads the disturbance map | 14, 22 (size) |
| 5.6 | Realism close-ups; grow hero share if fake | 23 |
| 6 | Gates per preset with `?preset=`; leaves made cheaper, then counts set; no shadow maps, post, extra targets or MSAA; no per-frame allocation; one per-frame texture upload | 20–23 (gates, draw budget), 7/13/16/21 (preallocated paths; `uploadDisturbance` only when changed; `litter.update` allocates nothing) |
| 7 | Unit tests listed | 1, 2, 3, 9, 11, 12, 15 (plus 4, 5, 7, 8, 10, 13, 14, 16, 17, 18, 20, 21, 22) |
| 7 | Browser tests listed | 7, 19 |
| 7 | Visual close-ups | 23 |
| 8 | Done means | 19, 23 |

### Placeholder scan

I searched the plan for "TBD", "TODO", "implement later", "fill in", "similar to Task", "add error handling" and "handle edge cases" and found none. Every code step carries the complete file or exact old → new text, taken from a scratch build that implemented every task in order. At each step that build was verified with the type check, the unit-test counts and the browser tests. Task 23's spec text carries the measured numbers, with an instruction to replace them if your own runs differ. They are data, not code.

### Type and name consistency

- `PresetId`, `GraphicsChoice`, `PresetSpec` (`resolution`, `maxDpr`, `litter`, `detail`, `hero`, `reaction`, `effects`, `extraEffects`, `clutter`, `nearClutter`, `rim`) are defined in Task 1 and used unchanged by Tasks 2, 3, 4, 7, 8, 11, 16, 17 and 23.
- `QualityController(targetFps, holdMs, cooldownMs, levels)` (Task 1) is used by `AutoGraphics` (Task 1) and, with the default `levels`, by `SpeedTestRunner` (Task 5).
- `Settings`, `KeyValueStore`, `loadSettings`, `saveSettings`, `browserStore` (Task 2) are used by `GraphicsControl` (Task 4) and `main.ts` (Task 7).
- `ScreenState`, `ScreenEvent`, `initialScreens`, `transition` (Task 3) are used by `main.ts` (Task 7).
- `SpeedTestHost` and `SpeedTestRunner.start/frame/onHidden/onVisible/abort/result/quality` (Task 5) are used by `main.ts` (Task 7).
- `Shell.show/setFps`, `showStart`, `showCrawl`, `showPause`, `showLost`, `showGraphics`, `showTestIntro`, `showRunning`, `showResult` (Task 6) are used by `main.ts` (Task 7).
- `World` (`scene`, `litter`, `props`, `atmosphere`, `worm`, `apply`, `sync`) is created in Task 7.
  - It grows `detail` (14), `hero` (16) and `nearClutter` (17).
  - `buildWorld()` becomes `buildWorld(crawl)` in Task 16, which updates `main.ts` and `sceneTiers.test.ts` in the same task.
  - In Task 21 it adds `litter.group` instead of `litter.mesh` and calls `litter.update(...)` in `sync`.
- `Crawl` (`step`, `interpolate`, `focus`) from Task 7 grows `under`, `reaction`, `setReaction` (11), `disturbance`, `disturbed` (13), `hero` and `setHeroCount` (16).
- `LeafLitter` is `{ mesh, max, setCount }` from Task 8. Task 21 replaces it with `{ group, chunks, max, setCount, update }`, and every user changes in Task 21: `world.ts`, `sceneTiers.test.ts`, `litterPlacement.test.ts`.
- `FallingLeaves.setCount`, `Atmosphere.setLevel`, `MOTE_MAX` and `FALLING_MAX` (Task 8) are what `world.apply` calls.
- `litterDepth`, `underAmount`, `litterMound`, `UNDER_THIN`, `UNDER_DEEP`, `LITTER_MAX`, `PILES`, `WIND` (Task 9) and `groundHeight`, `groundNormal` (Task 10) feed:
  - `wormSurface` (11);
  - `litterTextureData` (14);
  - the litter builder (10, and its Task 21 rewrite, which keeps the same placement and pose).
- `WormSurface`, `wormSurface(x, z, reaction, out)`, `bellyHeight`, `litterTop` (Task 11) are used by `Crawl` and `world.ts`. `litterTop` is also the hero leaves' `SurfaceFn` (16).
- `DisturbanceMap`, `createDisturbance`, `recentre`, `stamp`, `decay`, `clearDisturbance`, `packDisturbance`, `DIST_N`, `DIST_SPAN`, `DIST_CELL` (Task 12) are used by `groundUniforms.ts` and `Crawl` (13).
- `groundUniforms` (`uFocus`, `uWrapCentre`, `uDisturb`, `uDistOrigin`), `setFocus`, `uploadDisturbance` (Task 13) are read by the leaf material (13, 14, 16, 18) and by the prop material's WRAP variant (17).
- `LeafVariant` grows by task:
  - `'litter' | 'falling'` in Task 13;
  - `+ 'detail'` in 14;
  - `+ 'hero'` in 16;
  - `+ 'plain' | 'far'` in 21.
  - `createLeafMaterial('falling')` replaces `createLeafMaterial(true)` in Task 13.
- `DETAIL_BOX`, `DETAIL_GLSL`, `DETAIL_FADE_IN/OUT` and `detailVertex` live in `src/render/detailGlsl.ts` (Task 14); import them from `'./detailGlsl'`, never `'./leafGlsl'`. `leafGlsl.ts` must not import or re-export them: that makes an import cycle (terrainMesh -> paintedMaterial -> leafGlsl -> groundTexture -> terrainMesh), and it never imports `detailLeaves.ts`, which imports the leaf material.
- `GROUND_GLSL`/`meshGround`, `getGroundTexture` and `bakedGroundHeight` (Task 14, `src/render/groundTexture.ts`) are the rendered ground for GPU-placed layers: the detail leaves (14) and the near clutter (17).
- `glslFloat` (`src/render/glslNumber.ts`, Task 14 follow-up) prints every GLSL constant that has a TS twin.
- `buildDetailLayer`/`DetailLayer` (Task 14 follow-up): the world's lazily built detail layer; the scene holds `detail.group`.
- `HeroLeaves`, `createHeroLeaves`, `setHeroCount`, `snapshotHeroLeaves`, `stepHeroLeaves`, `HERO_MAX` and `SurfaceFn` (Task 15) are used by `Crawl` and `HeroLeafMesh` (16).
- `wrapAround`/`WRAP_GLSL` (Task 14) are used by the detail GLSL (14) and the prop WRAP variant (17); `getLitterTexture`/`LITTER_GLSL` likewise.
- `occlusion`/`OCCLUDE_GLSL` (Task 18) are used only by the leaf material.
- `CHUNKS`, `CHUNK_SIZE`, `LOD_NEAR`, `LOD_GAP`, `ACTIVE_RANGE`, `chunkIndex`, `chunkCentreX/Z`, `chunkDistance`, `groupByChunk`, `countBelow`, `nextLod` (Task 20) and `lodShape`/`LOD_POINTS` (Task 20) are used by `leafLitterMesh.ts` and the scene tests (21).
- `LeafBuffers`, `LeafLook` and `PETIOLE_VERTS` (Task 21) are used only by `leafLitterMesh.ts`.

## Decisions this plan makes where the spec leaves room

1. **Benchmark entry:** `?speedtest=1` opens the Speed test screen directly. bench.mjs is unchanged and is called with `"?speedtest=1&preset=<p>"`. The menu path (Start → Speed test → Start speed test) also works, and the e2e tests cover both.
2. **What the speed test measures:**
   - The uncapped "full" phase renders the preset forced by `?preset=`, or High by default.
   - The auto phase keeps Step 0's four tiers, layered on that preset by `tierSpec`: lower resolution, then no rim light or atmosphere, then half the leaves.
   - Use recommended setting maps tier 0 → High, tiers 1 and 2 → Medium, tier 3 → Low.
   - The report's "Leaves" line counts the measured preset's litter plus detail leaves.
3. **Disturbance decay** (revised after Task 13):
   - The trail freshness halves every 6 s; a settled trail's cell is cleared, path nearness and all.
   - Path nearness does not decay. The leaves ease back because their slide scales with freshness.
   - The body nearness (the drape) is not decayed: it is cleared and re-stamped from the body every step, so the drape follows the body exactly and leaves nothing behind it.
4. **Piles are solid:** the ground mesh rises by `litterMound`, which is 0 under thin litter and the full depth on deep piles, exactly the height the worm rides at. Deep piles are mounds with leaves on top rather than floating leaves. The belly sits 0.01 above its surface when under the leaves and 0.035 above it when on top.
5. **Leaf density:** a spot is kept with probability 0.3 + 0.7 × depth / 0.25, so piles hold about three times the open-ground density. A steeper weighting left open ground bare.
6. **Detail layer wrap:**
   - Leaves wrap around the 1 m-snapped centre in a 13 m tile and fade by the worm's smooth position, so a leaf only jumps once it is invisible.
   - "Higher-vertex" means an inner ring on fan-shaped leaves, about 2× the triangles; oak's strip shape already has interior points.
7. **Hero leaves:** all five species share one instanced geometry, and each instance hides the other four in the vertex shader. A shove from the head faster than 0.6 m/s flips a resting leaf with a small hop.
8. **Ultra's "extra clutter near the worm":** 40 sedge tufts and mushroom clusters wrapped around the worm in a 10 m tile by a `WRAP` variant of the prop material (one draw, Ultra only).
9. **Pause:** the game clock stops (wind, dust and the worm's breath freeze), and the canvas is redrawn only when something changes: a preset switch from the pause menu, or a resize. Esc and P toggle pause; Esc also leaves the Graphics menu.
10. **Crawl focus:** a small hint card (the Step 0 free-drive card) is shown and focused while crawling, so Space and the arrows never press a button.
11. **fps tag:** shown with `?fps=1`, and also while the speed test runs, as in Step 0.
12. **Context loss outside the speed test:** a "The graphics stopped" card with a Reload button replaces the old FAIL-style card. Inside or after the test, the Step 0 behaviour is kept.
13. **Auto** runs only while crawling. Any screen change, pause or hidden tab interrupts its slow-frame streak.
14. **Step 0 extras dropped:** `?leaves=` and "Try driving the worm" are replaced by presets and Crawl.
15. **Allocation:** all new per-step and per-frame code is allocation-free. The carried-over pure helpers `stepWorm`, `followHead`, `stepFollowCam` and the keyboard-to-command mapping still return small objects each step, as in Step 0; changing them is outside this sub-project.
16. **Making leaves cheaper before setting counts** (Tasks 20–22), then counts tuned to the gates (Task 23). See "Spec deviations".
