# Step 0: Project Scaffold and Chromebook Speed Test, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the project and build a single-file 3D speed test page. Matt opens it on a real student Chromebook to learn whether the 3D forest floor holds 30 fps.

**Architecture:** Vite + TypeScript + Three.js, bundled into one `dist/index.html` by `vite-plugin-singlefile`. A Content Security Policy blocking all network connections is injected at build time. Pure logic (game loop stepping, fps stats, auto quality, input mapping, worm body, camera math, leaf placement, speed-test phases) lives in small modules with Vitest unit tests. Those modules carry forward into the real game. The speed-test page (`src/spike/`) wires them to a Three.js scene: painted-look shader, about 2,000 instanced leaves, a segmented worm and a follow camera. It runs a scripted two-phase test and prints a PASS/FAIL report.

**Tech Stack:** Node 20+, Vite, TypeScript (strict), Three.js, vite-plugin-singlefile, Vitest, Playwright (Chromium).

**Spec:** `docs/superpowers/specs/2026-09-30-worm-simulator-design.md` (sections 8.1, 8.2, 8.3, 8.4, 10, 11 step 0)

**Pass rule (from spec):** at least 30 fps. The game caps rendering at 30 fps, so the measured average is at most about 30. **PASS = average of 28 fps or more** during the auto-quality phase. The report also states which quality tier was needed.

---

## File map

| File | Responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `vite.config.ts`, `playwright.config.ts` | Tooling. `vite.config.ts` also injects the CSP at build time only, because the dev server needs its own scripts and websocket |
| `index.html` | Vite entry page |
| `src/core/vec.ts` | `Vec3` / `Vec2` plain types, no Three.js dependency |
| `src/core/random.ts` | Seeded RNG (`mulberry32`) |
| `src/core/stepper.ts` | Pure fixed-timestep and frame-cap math |
| `src/core/loop.ts` | requestAnimationFrame loop built on `stepper` |
| `src/render/fps.ts` | `FpsMeter` (rolling) and `summarize` (average and low fps) |
| `src/render/quality.ts` | Quality tiers and auto-quality controller |
| `src/render/paintedMaterial.ts` | Painted-naturalist shader material plus shared lighting |
| `src/input/commands.ts` | The `Commands` type and pure mappers (keys → commands, drag → move, merge) |
| `src/input/keyboard.ts` | Tracks keys held down |
| `src/input/touchJoystick.ts` | On-screen joystick using pointer events (touch, trackpad and mouse) |
| `src/worm/body.ts` | Segment chain that follows the head |
| `src/worm/locomotion.ts` | Steering math: turn, move, stay in bounds |
| `src/surface/followCamera.ts` | Behind-the-worm camera target and smoothing |
| `src/surface/leafLitter.ts` | Leaf kinds, colors and seeded placement |
| `src/spike/speedTest.ts` | URL params, test phases, verdict, report text |
| `src/spike/scene.ts` | Builds the Three.js test scene |
| `src/spike/ui.ts`, `src/spike/spike.css` | Start, running and result panels, plus the fps tag |
| `src/spike/main.ts` | Wires everything together |
| `scripts/check-single-file.mjs` | Checks the build: one file, CSP present, size budget |
| `tests/unit/*.test.ts` | Vitest unit tests |
| `tests/e2e/speedTest.spec.ts` | Playwright test: runs offline, zero network requests, keyboard reachable |
| `docs/step0-chromebook-test.md` | Matt's instructions for running the test on a Chromebook |

Conventions: unit tests import from `../../src/...`. Every module uses named exports. No default exports.

---

### Task 1: Scaffold the project

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/spike/main.ts` (placeholder), `tests/unit/smoke.test.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Check Node**

Run: `node -v`
Expected: `v20.x` or higher. If it's lower, stop and ask Matt to install Node 20 or later.

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "worm-simulator",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "verify:build": "npm run build && node scripts/check-single-file.mjs",
    "test:e2e": "npm run build && playwright test"
  }
}
```

- [ ] **Step 3: Install dependencies**

Run:
```bash
npm install three
npm install -D typescript vite vite-plugin-singlefile vitest @types/three @types/node @playwright/test
npx playwright install chromium
```
Expected: installs finish with no errors. `package.json` now lists the versions.

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "node"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src", "tests", "vite.config.ts", "playwright.config.ts"]
}
```

- [ ] **Step 5: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Blocks every outside connection. Nothing the student does can leave the device.
export const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'media-src data: blob:',
  'font-src data:',
  'worker-src blob:',
  "connect-src 'none'",
].join('; ');

// Build only: the dev server needs its own client script and websocket.
function injectCsp(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}">`,
      );
    },
  };
}

export default defineConfig({
  plugins: [injectCsp(), viteSingleFile()],
  build: { target: 'es2020' },
  test: { include: ['tests/unit/**/*.test.ts'] },
});
```

- [ ] **Step 6: Create `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Worm Simulator Speed Test</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/spike/main.ts"></script>
</body>
</html>
```

- [ ] **Step 7: Create placeholder `src/spike/main.ts`** (Task 11 replaces it)

```ts
const app = document.getElementById('app');
if (app) app.textContent = 'Worm Simulator';
```

- [ ] **Step 8: Write a smoke test, `tests/unit/smoke.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { CSP } from '../../vite.config';

describe('build config', () => {
  it('blocks all network connections', () => {
    expect(CSP).toContain("connect-src 'none'");
    expect(CSP).toContain("default-src 'none'");
  });
});
```

- [ ] **Step 9: Add test output folders to `.gitignore`**

Append these lines to `.gitignore`:
```
test-results/
playwright-report/
```

- [ ] **Step 10: Run tests and build**

Run: `npm test`
Expected: 1 passed.
Run: `npm run build`
Expected: builds `dist/index.html` with no errors.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src tests .gitignore
git commit -m "chore: scaffold Vite + TypeScript + Three.js single-file project"
```

---

### Task 2: Vectors, seeded random and the fixed-step loop

**Files:**
- Create: `src/core/vec.ts`, `src/core/random.ts`, `src/core/stepper.ts`, `src/core/loop.ts`
- Test: `tests/unit/stepper.test.ts`, `tests/unit/random.test.ts`

- [ ] **Step 1: Create `src/core/vec.ts`**

```ts
export interface Vec2 { x: number; y: number }
export interface Vec3 { x: number; y: number; z: number }

export function dist3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
```

- [ ] **Step 2: Write failing tests, `tests/unit/random.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../src/core/random';

describe('mulberry32', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
  });
  it('returns values in [0, 1)', () => {
    const r = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
```

- [ ] **Step 3: Write failing tests, `tests/unit/stepper.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { createStepper, advance } from '../../src/core/stepper';

const STEP = 1000 / 60;
const CAP30 = 1000 / 30;

describe('advance', () => {
  it('runs whole fixed steps and keeps the remainder', () => {
    const s = createStepper();
    const r = advance(s, 55, STEP, 0);
    expect(r.steps).toBe(3);
    expect(s.accumulator).toBeCloseTo(55 - 3 * STEP, 6);
  });

  it('caps rendering at 30 fps on a 60 Hz display', () => {
    const s = createStepper();
    expect(advance(s, STEP, STEP, CAP30).render).toBe(false);
    expect(advance(s, STEP, STEP, CAP30).render).toBe(true);
    expect(advance(s, STEP, STEP, CAP30).render).toBe(false);
  });

  it('renders every frame when uncapped', () => {
    const s = createStepper();
    expect(advance(s, STEP, STEP, 0).render).toBe(true);
    expect(advance(s, STEP, STEP, 0).render).toBe(true);
  });

  it('does not spiral after a long pause (tab switch)', () => {
    const s = createStepper();
    const r = advance(s, 10_000, STEP, CAP30);
    expect(r.steps).toBeLessThanOrEqual(5);
    expect(s.accumulator).toBe(0);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run tests/unit/stepper.test.ts tests/unit/random.test.ts`
Expected: FAIL. The modules can't be resolved yet.

- [ ] **Step 5: Create `src/core/random.ts`**

```ts
/** Small, fast seeded RNG. Same seed gives the same sequence, so levels are repeatable. */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 6: Create `src/core/stepper.ts`**

```ts
export interface StepperState { accumulator: number; sinceRender: number }

const MAX_ELAPSED_MS = 250;
const RENDER_TOLERANCE_MS = 1;

export function createStepper(): StepperState {
  return { accumulator: 0, sinceRender: 0 };
}

/**
 * Advance game time by elapsedMs. Returns how many fixed update steps to run
 * and whether to render this frame. minFrameMs = 0 means no frame cap.
 */
export function advance(
  s: StepperState,
  elapsedMs: number,
  stepMs: number,
  minFrameMs: number,
  maxSteps = 5,
): { steps: number; render: boolean } {
  const dt = Math.min(Math.max(elapsedMs, 0), MAX_ELAPSED_MS);
  s.accumulator += dt;
  s.sinceRender += dt;
  let steps = 0;
  while (s.accumulator >= stepMs && steps < maxSteps) {
    s.accumulator -= stepMs;
    steps++;
  }
  if (steps === maxSteps) s.accumulator = 0;
  const render = s.sinceRender >= minFrameMs - RENDER_TOLERANCE_MS;
  if (render) s.sinceRender = 0;
  return { steps, render };
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/unit/stepper.test.ts tests/unit/random.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 8: Create `src/core/loop.ts`** (browser runtime. The math above is tested, and this file is checked in the e2e test.)

```ts
import { advance, createStepper } from './stepper';

export interface LoopHandle {
  stop(): void;
  /** Use Infinity for no cap. */
  setMaxFps(fps: number): void;
}

export function startLoop(
  update: (dtSec: number) => void,
  render: (nowMs: number) => void,
  opts: { stepHz?: number; maxFps?: number } = {},
): LoopHandle {
  const stepMs = 1000 / (opts.stepHz ?? 60);
  let minFrameMs = 1000 / (opts.maxFps ?? 30);
  const state = createStepper();
  let last = performance.now();
  let running = true;
  let id = 0;

  const frame = (now: number) => {
    if (!running) return;
    const r = advance(state, now - last, stepMs, minFrameMs);
    last = now;
    for (let i = 0; i < r.steps; i++) update(stepMs / 1000);
    if (r.render) render(now);
    id = requestAnimationFrame(frame);
  };
  id = requestAnimationFrame(frame);

  return {
    stop() {
      running = false;
      cancelAnimationFrame(id);
    },
    setMaxFps(fps: number) {
      minFrameMs = 1000 / fps;
    },
  };
}
```

- [ ] **Step 9: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add src/core tests/unit/stepper.test.ts tests/unit/random.test.ts
git commit -m "feat(core): seeded RNG and fixed-step loop with 30 fps cap"
```

---

### Task 3: FPS meter and run summary

**Files:**
- Create: `src/render/fps.ts`
- Test: `tests/unit/fps.test.ts`

- [ ] **Step 1: Write failing tests, `tests/unit/fps.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { FpsMeter, summarize } from '../../src/render/fps';

function frames(count: number, intervalMs: number, start = 0): number[] {
  return Array.from({ length: count }, (_, i) => start + i * intervalMs);
}

describe('FpsMeter', () => {
  it('reports about 30 fps for 33.3 ms frames', () => {
    const m = new FpsMeter(1000);
    for (const t of frames(90, 1000 / 30)) m.frame(t);
    expect(m.fps).toBeCloseTo(30, 0);
  });
  it('reports 0 with fewer than 2 frames', () => {
    const m = new FpsMeter();
    m.frame(0);
    expect(m.fps).toBe(0);
  });
});

describe('summarize', () => {
  it('steady 30 fps gives avg 30 and low 30', () => {
    const s = summarize(frames(101, 1000 / 30));
    expect(s.avgFps).toBeCloseTo(30, 1);
    expect(s.lowFps).toBeCloseTo(30, 1);
    expect(s.frames).toBe(101);
  });
  it('hitches pull the low number down', () => {
    const times = [0];
    for (let i = 1; i <= 100; i++) times.push(times[i - 1] + (i % 10 === 0 ? 100 : 1000 / 30));
    const s = summarize(times);
    expect(s.lowFps).toBeCloseTo(10, 1);
    expect(s.avgFps).toBeLessThan(30);
  });
  it('handles empty input', () => {
    expect(summarize([])).toEqual({ avgFps: 0, lowFps: 0, frames: 0 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/fps.test.ts`
Expected: FAIL. The module isn't found.

- [ ] **Step 3: Create `src/render/fps.ts`**

```ts
export interface FpsSummary { avgFps: number; lowFps: number; frames: number }

/** Rolling frames-per-second over the last windowMs. */
export class FpsMeter {
  private times: number[] = [];
  constructor(private readonly windowMs = 1000) {}

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

/** Average fps and "low" fps (the 95th-percentile slowest frame) for a run. */
export function summarize(times: number[]): FpsSummary {
  if (times.length < 2) return { avgFps: 0, lowFps: 0, frames: times.length };
  const intervals: number[] = [];
  for (let i = 1; i < times.length; i++) intervals.push(times[i] - times[i - 1]);
  intervals.sort((a, b) => a - b);
  const p95 = intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * 0.95))];
  const span = times[times.length - 1] - times[0];
  return {
    avgFps: span > 0 ? ((times.length - 1) * 1000) / span : 0,
    lowFps: p95 > 0 ? 1000 / p95 : 0,
    frames: times.length,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/fps.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/render/fps.ts tests/unit/fps.test.ts
git commit -m "feat(render): rolling fps meter and run summary"
```

---

### Task 4: Auto quality controller

Spec 8.4 sets the order: lower resolution first, then turn off rim light, then reduce leaf density.

**Files:**
- Create: `src/render/quality.ts`
- Test: `tests/unit/quality.test.ts`

- [ ] **Step 1: Write failing tests, `tests/unit/quality.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { QualityController, TIERS } from '../../src/render/quality';

describe('TIERS', () => {
  it('degrade in spec order: resolution, then rim, then leaves', () => {
    expect(TIERS[0]).toEqual({ resolutionScale: 1, rimLight: true, leafDensity: 1 });
    expect(TIERS[1].resolutionScale).toBeLessThan(1);
    expect(TIERS[1].rimLight).toBe(true);
    expect(TIERS[2].rimLight).toBe(false);
    expect(TIERS[2].leafDensity).toBe(1);
    expect(TIERS[3].leafDensity).toBeLessThan(1);
  });
});

describe('QualityController', () => {
  it('stays at tier 0 when fps holds 30', () => {
    const q = new QualityController();
    for (let t = 0; t < 10_000; t += 100) expect(q.update(t, 30)).toBe(false);
    expect(q.tier).toBe(0);
  });

  it('drops one tier after fps stays low for 2 s', () => {
    const q = new QualityController();
    q.update(0, 20);
    expect(q.update(1900, 20)).toBe(false);
    expect(q.update(2000, 20)).toBe(true);
    expect(q.tier).toBe(1);
  });

  it('waits a 3 s cooldown before dropping again', () => {
    const q = new QualityController();
    q.update(0, 20);
    q.update(2000, 20); // tier 1
    q.update(2100, 20);
    expect(q.update(4500, 20)).toBe(false);
    expect(q.tier).toBe(1);
  });

  it('a good second resets the low-fps timer', () => {
    const q = new QualityController();
    q.update(0, 20);
    q.update(1500, 30);
    q.update(1600, 20);
    expect(q.update(3000, 20)).toBe(false);
    expect(q.tier).toBe(0);
  });

  it('never goes past the last tier, and reset() returns to 0', () => {
    const q = new QualityController();
    for (let t = 0; t < 60_000; t += 100) q.update(t, 5);
    expect(q.tier).toBe(TIERS.length - 1);
    q.reset();
    expect(q.tier).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/quality.test.ts`
Expected: FAIL. The module isn't found.

- [ ] **Step 3: Create `src/render/quality.ts`**

```ts
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

  reset(): void {
    this.tier = 0;
    this.belowSince = null;
    this.lastChange = -Infinity;
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/quality.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/render/quality.ts tests/unit/quality.test.ts
git commit -m "feat(render): auto quality tiers and controller"
```

---

### Task 5: Input commands, keyboard and touch joystick

Spec 8.2: gameplay only sees `Commands`, never raw devices. Switch scanning and assisted steering come in Step 1. They will produce the same `Commands`.

**Files:**
- Create: `src/input/commands.ts`, `src/input/keyboard.ts`, `src/input/touchJoystick.ts`
- Test: `tests/unit/commands.test.ts`

- [ ] **Step 1: Write failing tests, `tests/unit/commands.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { keysToCommands, dragToMove, mergeCommands, NO_COMMANDS } from '../../src/input/commands';

describe('keysToCommands', () => {
  it('maps arrows and WASD: y = forward, x = turn right', () => {
    expect(keysToCommands(new Set(['ArrowUp'])).move).toEqual({ x: 0, y: 1 });
    expect(keysToCommands(new Set(['KeyS'])).move).toEqual({ x: 0, y: -1 });
    expect(keysToCommands(new Set(['KeyA', 'KeyW'])).move).toEqual({ x: -1, y: 1 });
    expect(keysToCommands(new Set(['ArrowRight'])).move).toEqual({ x: 1, y: 0 });
  });
  it('opposite keys cancel', () => {
    expect(keysToCommands(new Set(['ArrowLeft', 'ArrowRight'])).move).toEqual({ x: 0, y: 0 });
  });
  it('maps Space, V and Escape/P', () => {
    const c = keysToCommands(new Set(['Space', 'KeyV', 'Escape']));
    expect(c.action).toBe(true);
    expect(c.wormView).toBe(true);
    expect(c.pause).toBe(true);
    expect(keysToCommands(new Set(['KeyP'])).pause).toBe(true);
  });
  it('no keys gives no commands', () => {
    expect(keysToCommands(new Set())).toEqual(NO_COMMANDS);
  });
});

describe('dragToMove', () => {
  it('drag up is forward', () => {
    expect(dragToMove(0, -60, 60)).toEqual({ x: 0, y: 1 });
  });
  it('clamps to the unit circle', () => {
    const m = dragToMove(300, 0, 60);
    expect(m.x).toBeCloseTo(1);
    expect(m.y).toBeCloseTo(0);
  });
  it('ignores tiny drags (dead zone)', () => {
    expect(dragToMove(3, 3, 60)).toEqual({ x: 0, y: 0 });
  });
});

describe('mergeCommands', () => {
  it('adds moves (clamped) and ORs buttons', () => {
    const a = { ...NO_COMMANDS, move: { x: 1, y: 0 }, action: true };
    const b = { ...NO_COMMANDS, move: { x: 1, y: 1 }, wormView: true };
    const m = mergeCommands(a, b);
    expect(m.move).toEqual({ x: 1, y: 1 });
    expect(m.action).toBe(true);
    expect(m.wormView).toBe(true);
    expect(m.pause).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/commands.test.ts`
Expected: FAIL. The module isn't found.

- [ ] **Step 3: Create `src/input/commands.ts`**

```ts
import type { Vec2 } from '../core/vec';

/** Everything gameplay is allowed to know about input. move.y = forward, move.x = turn right. */
export interface Commands { move: Vec2; action: boolean; wormView: boolean; pause: boolean }

export const NO_COMMANDS: Commands = Object.freeze({
  move: Object.freeze({ x: 0, y: 0 }),
  action: false,
  wormView: false,
  pause: false,
}) as Commands;

const DEAD_ZONE = 0.12;

export function keysToCommands(down: ReadonlySet<string>): Commands {
  const has = (...codes: string[]) => codes.some((c) => down.has(c));
  const x = (has('ArrowRight', 'KeyD') ? 1 : 0) - (has('ArrowLeft', 'KeyA') ? 1 : 0);
  const y = (has('ArrowUp', 'KeyW') ? 1 : 0) - (has('ArrowDown', 'KeyS') ? 1 : 0);
  return {
    move: { x, y },
    action: has('Space'),
    wormView: has('KeyV'),
    pause: has('Escape', 'KeyP'),
  };
}

/** Converts a drag offset in screen pixels (y down) into a move vector (y forward). */
export function dragToMove(dx: number, dy: number, radius: number): Vec2 {
  let x = dx / radius;
  let y = -dy / radius;
  const m = Math.hypot(x, y);
  if (m < DEAD_ZONE) return { x: 0, y: 0 };
  if (m > 1) {
    x /= m;
    y /= m;
  }
  return { x: x + 0, y: y + 0 }; // + 0 turns -0 into 0
}

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

export function mergeCommands(a: Commands, b: Commands): Commands {
  return {
    move: { x: clamp1(a.move.x + b.move.x), y: clamp1(a.move.y + b.move.y) },
    action: a.action || b.action,
    wormView: a.wormView || b.wormView,
    pause: a.pause || b.pause,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/commands.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Create `src/input/keyboard.ts`**

```ts
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

/** Tracks which keys (by KeyboardEvent.code) are held down. */
export class KeyboardInput {
  readonly down = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      // Let Space/Enter still press a focused button.
      if (SCROLL_KEYS.has(e.code) && !(e.target instanceof HTMLButtonElement)) e.preventDefault();
      this.down.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());
  }
}
```

- [ ] **Step 6: Create `src/input/touchJoystick.ts`**

```ts
import type { Vec2 } from '../core/vec';
import { dragToMove } from './commands';

/** On-screen joystick. Pointer events cover touch, trackpad and mouse. */
export class TouchJoystick {
  readonly el: HTMLDivElement;
  value: Vec2 = { x: 0, y: 0 };
  private readonly knob: HTMLDivElement;
  private pointerId: number | null = null;

  constructor(parent: HTMLElement, private readonly radius = 60) {
    this.el = document.createElement('div');
    this.el.className = 'joystick';
    this.el.setAttribute('aria-hidden', 'true');
    this.knob = document.createElement('div');
    this.knob.className = 'joystick-knob';
    this.el.appendChild(this.knob);
    parent.appendChild(this.el);

    this.el.addEventListener('pointerdown', (e) => {
      this.pointerId = e.pointerId;
      this.el.setPointerCapture(e.pointerId);
      this.track(e);
    });
    this.el.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.pointerId) this.track(e);
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.value = { x: 0, y: 0 };
      this.knob.style.transform = '';
    };
    this.el.addEventListener('pointerup', release);
    this.el.addEventListener('pointercancel', release);
  }

  private track(e: PointerEvent): void {
    const r = this.el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    this.value = dragToMove(dx, dy, this.radius);
    this.knob.style.transform =
      `translate(${this.value.x * this.radius}px, ${-this.value.y * this.radius}px)`;
  }
}
```

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add src/input tests/unit/commands.test.ts
git commit -m "feat(input): unified commands, keyboard and touch joystick"
```

---

### Task 6: Worm body and locomotion

Heading convention, used everywhere: forward = `(sin h, 0, cos h)`. Turning right decreases `h`.

**Files:**
- Create: `src/worm/body.ts`, `src/worm/locomotion.ts`
- Test: `tests/unit/worm.test.ts`

- [ ] **Step 1: Write failing tests, `tests/unit/worm.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { createBody, followHead } from '../../src/worm/body';
import { stepWorm } from '../../src/worm/locomotion';
import { dist3 } from '../../src/core/vec';

const OPTS = { speed: 2, turnRate: 2, halfSize: 10 };

describe('createBody', () => {
  it('lays segments out behind the head at the given spacing', () => {
    const b = createBody(5, 0.5, { x: 0, y: 0, z: 0 }, 0);
    expect(b).toHaveLength(5);
    expect(b[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(b[1].z).toBeCloseTo(-0.5);
    expect(b[4].z).toBeCloseTo(-2);
  });
});

describe('followHead', () => {
  it('pulls segments along at exact spacing after a big move', () => {
    const b = createBody(6, 0.5, { x: 0, y: 0, z: 0 }, 0);
    followHead(b, { x: 0, y: 0, z: 3 }, 0.5);
    expect(b[0]).toEqual({ x: 0, y: 0, z: 3 });
    for (let i = 1; i < b.length; i++) expect(dist3(b[i], b[i - 1])).toBeCloseTo(0.5, 6);
  });
  it('leaves slack segments alone (no pushing)', () => {
    const b = createBody(4, 0.5, { x: 0, y: 0, z: 0 }, 0);
    const tail = { ...b[3] };
    followHead(b, { x: 0, y: 0, z: -0.2 }, 0.5);
    expect(b[3]).toEqual(tail);
  });
});

describe('stepWorm', () => {
  const start = { head: { x: 0, y: 0.1, z: 0 }, heading: 0 };
  it('moves forward along the heading', () => {
    const m = stepWorm(start, { x: 0, y: 1 }, 0.5, OPTS);
    expect(m.head.z).toBeCloseTo(1);
    expect(m.head.x).toBeCloseTo(0);
    expect(m.head.y).toBe(0.1);
  });
  it('turning right lowers the heading', () => {
    expect(stepWorm(start, { x: 1, y: 0 }, 0.5, OPTS).heading).toBeCloseTo(-1);
  });
  it('backs up at half speed', () => {
    expect(stepWorm(start, { x: 0, y: -1 }, 0.5, OPTS).head.z).toBeCloseTo(-0.5);
  });
  it('stays inside the world bounds', () => {
    const m = stepWorm({ head: { x: 0, y: 0, z: 9.9 }, heading: 0 }, { x: 0, y: 1 }, 1, OPTS);
    expect(m.head.z).toBe(10);
  });
  it('does not mutate the input', () => {
    const s = { head: { x: 0, y: 0, z: 0 }, heading: 0 };
    stepWorm(s, { x: 1, y: 1 }, 1, OPTS);
    expect(s).toEqual({ head: { x: 0, y: 0, z: 0 }, heading: 0 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/worm.test.ts`
Expected: FAIL. The modules aren't found.

- [ ] **Step 3: Create `src/worm/body.ts`**

```ts
import type { Vec3 } from '../core/vec';

export function createBody(count: number, spacing: number, head: Vec3, heading: number): Vec3[] {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  return Array.from({ length: count }, (_, i) => ({
    x: head.x - fx * spacing * i,
    y: head.y,
    z: head.z - fz * spacing * i,
  }));
}

/** Follow-the-leader: each segment is pulled toward the one ahead, never pushed. */
export function followHead(segments: Vec3[], head: Vec3, spacing: number): void {
  segments[0] = { ...head };
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1];
    const cur = segments[i];
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    const dz = cur.z - prev.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > spacing) {
      const k = spacing / d;
      segments[i] = { x: prev.x + dx * k, y: prev.y + dy * k, z: prev.z + dz * k };
    }
  }
}
```

- [ ] **Step 4: Create `src/worm/locomotion.ts`**

```ts
import type { Vec2, Vec3 } from '../core/vec';

export interface WormMotion { head: Vec3; heading: number }
export interface LocomotionOptions { speed: number; turnRate: number; halfSize: number }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** move.y = forward/back, move.x = turn right/left. Returns a new motion. */
export function stepWorm(m: WormMotion, move: Vec2, dt: number, o: LocomotionOptions): WormMotion {
  const heading = m.heading - move.x * o.turnRate * dt;
  const forward = move.y >= 0 ? move.y : move.y * 0.5;
  const dist = forward * o.speed * dt;
  return {
    heading,
    head: {
      x: clamp(m.head.x + Math.sin(heading) * dist, -o.halfSize, o.halfSize),
      y: m.head.y,
      z: clamp(m.head.z + Math.cos(heading) * dist, -o.halfSize, o.halfSize),
    },
  };
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run tests/unit/worm.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/worm tests/unit/worm.test.ts
git commit -m "feat(worm): segment body and steering locomotion"
```

---

### Task 7: Follow camera math

**Files:**
- Create: `src/surface/followCamera.ts`
- Test: `tests/unit/followCamera.test.ts`

- [ ] **Step 1: Write failing tests, `tests/unit/followCamera.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { cameraTarget, smoothToward } from '../../src/surface/followCamera';

describe('cameraTarget', () => {
  it('sits behind and above the head', () => {
    const t = cameraTarget({ x: 0, y: 0, z: 0 }, 0, 3, 1.5);
    expect(t.x).toBeCloseTo(0);
    expect(t.y).toBeCloseTo(1.5);
    expect(t.z).toBeCloseTo(-3);
  });
  it('follows the heading', () => {
    const t = cameraTarget({ x: 0, y: 0, z: 0 }, Math.PI / 2, 3, 1);
    expect(t.x).toBeCloseTo(-3);
    expect(t.z).toBeCloseTo(0);
  });
});

describe('smoothToward', () => {
  const a = { x: 0, y: 0, z: 0 };
  const b = { x: 10, y: 0, z: 0 };
  it('does not move with dt = 0', () => {
    expect(smoothToward(a, b, 4, 0)).toEqual(a);
  });
  it('moves part of the way, not past the target', () => {
    const p = smoothToward(a, b, 4, 1 / 30);
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(10);
  });
  it('is frame-rate independent', () => {
    let p30 = a;
    for (let i = 0; i < 30; i++) p30 = smoothToward(p30, b, 4, 1 / 30);
    let p60 = a;
    for (let i = 0; i < 60; i++) p60 = smoothToward(p60, b, 4, 1 / 60);
    expect(p30.x).toBeCloseTo(p60.x, 6);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/followCamera.test.ts`
Expected: FAIL. The module isn't found.

- [ ] **Step 3: Create `src/surface/followCamera.ts`**

```ts
import type { Vec3 } from '../core/vec';

/** Where the camera wants to be: behind the worm along its heading, raised by height. */
export function cameraTarget(head: Vec3, heading: number, distance: number, height: number): Vec3 {
  return {
    x: head.x - Math.sin(heading) * distance,
    y: head.y + height,
    z: head.z - Math.cos(heading) * distance,
  };
}

/** Exponential smoothing that behaves the same at any frame rate. */
export function smoothToward(current: Vec3, target: Vec3, rate: number, dtSec: number): Vec3 {
  const a = 1 - Math.exp(-rate * dtSec);
  return {
    x: current.x + (target.x - current.x) * a,
    y: current.y + (target.y - current.y) * a,
    z: current.z + (target.z - current.z) * a,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/followCamera.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/surface/followCamera.ts tests/unit/followCamera.test.ts
git commit -m "feat(surface): follow camera target and smoothing"
```

---

### Task 8: Leaf litter placement

Leaf kinds come from the spec's leaf-preference fact (ash, basswood, aspen, then maple, oak last). Colors here are art only. No meaning is carried by leaf color.

**Files:**
- Create: `src/surface/leafLitter.ts`
- Test: `tests/unit/leafLitter.test.ts`

- [ ] **Step 1: Write failing tests, `tests/unit/leafLitter.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { placeLeaves, LEAF_KINDS, LEAF_COLORS } from '../../src/surface/leafLitter';

describe('placeLeaves', () => {
  it('makes exactly count leaves inside the square', () => {
    const leaves = placeLeaves(2000, 20, 1);
    expect(leaves).toHaveLength(2000);
    for (const l of leaves) {
      expect(Math.abs(l.x)).toBeLessThanOrEqual(20);
      expect(Math.abs(l.z)).toBeLessThanOrEqual(20);
      expect(l.y).toBeGreaterThanOrEqual(0);
      expect(l.y).toBeLessThan(0.08);
      expect(LEAF_KINDS).toContain(l.kind);
    }
  });
  it('is deterministic for a seed and differs across seeds', () => {
    expect(placeLeaves(10, 5, 3)).toEqual(placeLeaves(10, 5, 3));
    expect(placeLeaves(10, 5, 3)).not.toEqual(placeLeaves(10, 5, 4));
  });
  it('has a color for every kind', () => {
    for (const k of LEAF_KINDS) expect(LEAF_COLORS[k]).toMatch(/^#[0-9a-f]{6}$/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/leafLitter.test.ts`
Expected: FAIL. The module isn't found.

- [ ] **Step 3: Create `src/surface/leafLitter.ts`**

```ts
import { mulberry32 } from '../core/random';

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
  x: number; y: number; z: number;
  rotY: number; tilt: number; scale: number;
  kind: LeafKind;
}

export function placeLeaves(count: number, halfSize: number, seed = 1): LeafPlacement[] {
  const r = mulberry32(seed);
  return Array.from({ length: count }, () => ({
    x: (r() * 2 - 1) * halfSize,
    y: r() * 0.079,
    z: (r() * 2 - 1) * halfSize,
    rotY: r() * Math.PI * 2,
    tilt: (r() - 0.5) * 0.5,
    scale: 0.6 + r() * 0.6,
    kind: LEAF_KINDS[Math.floor(r() * LEAF_KINDS.length)],
  }));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/leafLitter.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/surface/leafLitter.ts tests/unit/leafLitter.test.ts
git commit -m "feat(surface): seeded leaf litter placement"
```

---

### Task 9: Painted-naturalist material

Spec 8.3: soft color bands, brushstroke texture and warm rim light. Shared lighting uniforms mean one switch (rim on/off for quality tiers, and color-blind palettes later) updates every material.

**Files:**
- Create: `src/render/paintedMaterial.ts`
- Test: `tests/unit/paintedMaterial.test.ts`

- [ ] **Step 1: Write failing tests, `tests/unit/paintedMaterial.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createPaintedMaterial, setRimLight, sharedLighting } from '../../src/render/paintedMaterial';

describe('painted material', () => {
  it('builds a ShaderMaterial with its own color', () => {
    const m = createPaintedMaterial({ color: '#ff0000' });
    expect(m).toBeInstanceOf(THREE.ShaderMaterial);
    expect((m.uniforms.uColor.value as THREE.Color).r).toBeCloseTo(1);
  });
  it('shares lighting uniforms so one switch updates every material', () => {
    const a = createPaintedMaterial({ color: '#ffffff' });
    const b = createPaintedMaterial({ color: '#000000' });
    setRimLight(false);
    expect(a.uniforms.uRim.value).toBe(0);
    expect(b.uniforms.uRim.value).toBe(0);
    setRimLight(true);
    expect(a.uniforms.uRim).toBe(sharedLighting.uRim);
    expect(b.uniforms.uRim.value).toBe(1);
  });
  it('can be double-sided for leaves', () => {
    expect(createPaintedMaterial({ color: '#fff', doubleSide: true }).side).toBe(THREE.DoubleSide);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/paintedMaterial.test.ts`
Expected: FAIL. The module isn't found.

- [ ] **Step 3: Create `src/render/paintedMaterial.ts`**

```ts
import * as THREE from 'three';

/** Shared by reference across every painted material. */
export const sharedLighting = {
  uLightDir: { value: new THREE.Vector3(0.45, 0.8, 0.35).normalize() },
  uLightColor: { value: new THREE.Color('#ffe2b0') },
  uSkyColor: { value: new THREE.Color('#ffd9a0') },
  uGroundColor: { value: new THREE.Color('#5a3d26') },
  uRimColor: { value: new THREE.Color('#ffb347') },
  uRim: { value: 1 },
};

const vertexShader = /* glsl */ `
  uniform vec3 uColor;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vColor;
  void main() {
    mat4 m = modelMatrix;
    vec3 col = uColor;
    #ifdef USE_INSTANCING
      m = modelMatrix * instanceMatrix;
    #endif
    #ifdef USE_INSTANCING_COLOR
      col *= instanceColor;
    #endif
    vec4 wp = m * vec4(position, 1.0);
    vPosW = wp.xyz;
    vNormalW = normalize(mat3(m) * normal);
    vColor = col;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uLightDir;
  uniform vec3 uLightColor;
  uniform vec3 uSkyColor;
  uniform vec3 uGroundColor;
  uniform vec3 uRimColor;
  uniform float uRim;
  uniform float uBrush;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vColor;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
          mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
          mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }

  void main() {
    vec3 n = normalize(vNormalW);
    if (!gl_FrontFacing) n = -n;
    float ndl = dot(n, normalize(uLightDir));
    float brush = noise(vPosW * 6.0) * 0.5 + noise(vPosW * 17.0) * 0.25;
    float band = smoothstep(0.0, 0.15, ndl + (brush - 0.375) * uBrush) * 0.55
               + smoothstep(0.45, 0.6, ndl) * 0.25;
    vec3 hemi = mix(uGroundColor, uSkyColor, n.y * 0.5 + 0.5);
    vec3 lit = vColor * (hemi * 0.55 + uLightColor * band);
    vec3 v = normalize(cameraPosition - vPosW);
    float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * uRim;
    lit += uRimColor * rim * 0.6;
    lit *= 0.92 + brush * 0.16;
    gl_FragColor = vec4(lit, 1.0);
    #include <colorspace_fragment>
  }
`;

export interface PaintedOptions {
  color: THREE.ColorRepresentation;
  /** 0 = clean bands, 1 = strong brush breakup. */
  brush?: number;
  doubleSide?: boolean;
}

export function createPaintedMaterial(opts: PaintedOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...sharedLighting,
      uColor: { value: new THREE.Color(opts.color) },
      uBrush: { value: opts.brush ?? 0.6 },
    },
    vertexShader,
    fragmentShader,
    side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
}

export function setRimLight(on: boolean): void {
  sharedLighting.uRim.value = on ? 1 : 0;
}
```

Note: if the installed three.js is older than r154, the chunk is named `<encodings_fragment>` instead of `<colorspace_fragment>`. The browser console shows "Can not resolve #include" if so. `npm install three` gets a current version, so this shouldn't come up.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/paintedMaterial.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/render/paintedMaterial.ts tests/unit/paintedMaterial.test.ts
git commit -m "feat(render): painted-naturalist shader with shared lighting"
```

---

### Task 10: Speed test logic (params, phases, verdict, report)

**Files:**
- Create: `src/spike/speedTest.ts`
- Test: `tests/unit/speedTest.test.ts`

- [ ] **Step 1: Write failing tests, `tests/unit/speedTest.test.ts`**

```ts
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
});

describe('verdict', () => {
  it('passes at 28 fps or more', () => {
    expect(verdict({ avgFps: 28, lowFps: 20, frames: 300 })).toBe('PASS');
    expect(verdict({ avgFps: 27.9, lowFps: 25, frames: 300 })).toBe('FAIL');
  });
});

describe('formatResults', () => {
  it('leads with the verdict and includes tier and device', () => {
    const device: DeviceInfo = {
      gpu: 'Mali-G52', cores: 8, memoryGb: 4, screen: '1366x768', pixelRatio: 1, userAgent: 'CrOS',
    };
    const text = formatResults(
      { avgFps: 55, lowFps: 40, frames: 400 },
      { avgFps: 29.6, lowFps: 26, frames: 300 },
      1, 2000, device,
    );
    const lines = text.split('\n');
    expect(lines[0]).toBe('Result: PASS');
    expect(text).toContain('29.6 fps average');
    expect(text).toContain('Quality level used: 1 of 3');
    expect(text).toContain('Mali-G52');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/speedTest.test.ts`
Expected: FAIL. The module isn't found.

- [ ] **Step 3: Create `src/spike/speedTest.ts`**

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

const EMPTY: FpsSummary = { avgFps: 0, lowFps: 0, frames: 0 };

export class SpeedTest {
  results: Record<PhaseSpec['id'], FpsSummary> = { full: EMPTY, auto: EMPTY };
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/speedTest.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/spike/speedTest.ts tests/unit/speedTest.test.ts
git commit -m "feat(spike): speed test phases, verdict and report"
```

---

### Task 11: Scene, UI and wiring

**Files:**
- Create: `src/spike/scene.ts`, `src/spike/ui.ts`, `src/spike/spike.css`
- Replace: `src/spike/main.ts`

- [ ] **Step 1: Create `src/spike/scene.ts`**

```ts
import * as THREE from 'three';
import { createPaintedMaterial } from '../render/paintedMaterial';
import { placeLeaves, LEAF_COLORS } from '../surface/leafLitter';
import { mulberry32 } from '../core/random';

export const WORLD_HALF = 20;

export interface SpikeScene {
  scene: THREE.Scene;
  leaves: THREE.InstancedMesh;
  worm: THREE.InstancedMesh;
  totalLeaves: number;
}

export function buildScene(leafCount: number, wormSegments: number): SpikeScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f3c98b');

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2).rotateX(-Math.PI / 2),
    createPaintedMaterial({ color: '#7a4f2a', brush: 0.9 }),
  );
  scene.add(ground);

  // Paper birch (white) and sugar maple (brown) trunks with simple canopies.
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.45, 14, 8).translate(0, 7, 0);
  const canopyGeo = new THREE.IcosahedronGeometry(3.5, 1);
  const birchBark = createPaintedMaterial({ color: '#efe9dc', brush: 0.8 });
  const mapleBark = createPaintedMaterial({ color: '#5b4330', brush: 0.8 });
  const birchLeaves = createPaintedMaterial({ color: '#e8a33a' });
  const mapleLeaves = createPaintedMaterial({ color: '#d9622b' });
  const rng = mulberry32(7);
  for (let i = 0; i < 14; i++) {
    const birch = i % 2 === 0;
    let x = 0;
    let z = 0;
    do {
      x = (rng() * 2 - 1) * (WORLD_HALF - 2);
      z = (rng() * 2 - 1) * (WORLD_HALF - 2);
    } while (Math.hypot(x, z) < 4);
    const trunk = new THREE.Mesh(trunkGeo, birch ? birchBark : mapleBark);
    trunk.position.set(x, 0, z);
    const canopy = new THREE.Mesh(canopyGeo, birch ? birchLeaves : mapleLeaves);
    canopy.position.set(x, 14, z);
    scene.add(trunk, canopy);
  }

  // Leaf litter: one instanced draw call.
  const leafGeo = new THREE.CircleGeometry(0.5, 7);
  leafGeo.scale(1, 0.62, 1);
  leafGeo.rotateX(-Math.PI / 2);
  const leaves = new THREE.InstancedMesh(
    leafGeo,
    createPaintedMaterial({ color: '#ffffff', doubleSide: true, brush: 0.4 }),
    leafCount,
  );
  const tmp = new THREE.Object3D();
  const color = new THREE.Color();
  placeLeaves(leafCount, WORLD_HALF, 1).forEach((l, i) => {
    tmp.position.set(l.x, 0.02 + l.y, l.z);
    tmp.rotation.set(l.tilt, l.rotY, 0);
    tmp.scale.setScalar(l.scale);
    tmp.updateMatrix();
    leaves.setMatrixAt(i, tmp.matrix);
    leaves.setColorAt(i, color.set(LEAF_COLORS[l.kind]));
  });
  scene.add(leaves);

  // Worm: one instanced sphere per segment. No eyes (spec 8.3).
  const worm = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 10, 8),
    createPaintedMaterial({ color: '#d98c8c', brush: 0.3 }),
    wormSegments,
  );
  worm.frustumCulled = false;
  scene.add(worm);

  return { scene, leaves, worm, totalLeaves: leafCount };
}
```

- [ ] **Step 2: Create `src/spike/spike.css`**

```css
html, body { margin: 0; height: 100%; overflow: hidden; background: #f3c98b; font-family: Arial, Helvetica, sans-serif; color: #000; }
canvas { display: block; }
.panel { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); box-sizing: border-box; width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; background: #fffdf6; color: #000; border: 3px solid #000; border-radius: 16px; padding: 20px 24px; font-size: 22px; line-height: 1.35; }
.panel h1 { font-size: 32px; margin: 0 0 12px; }
.panel p { margin: 0 0 10px; }
.panel pre { white-space: pre-wrap; font-family: Arial, Helvetica, sans-serif; font-size: 18px; background: #fff; border: 2px solid #000; padding: 12px; user-select: text; }
.panel button { display: block; width: 100%; min-height: 64px; margin-top: 12px; font: bold 24px Arial, Helvetica, sans-serif; color: #000; background: #ffd34d; border: 3px solid #000; border-radius: 12px; cursor: pointer; }
.panel button:focus-visible { outline: 5px solid #000; outline-offset: 3px; }
.fps { position: fixed; top: 12px; right: 12px; background: #fffdf6; color: #000; border: 2px solid #000; border-radius: 8px; padding: 6px 10px; font-size: 18px; }
.joystick { position: fixed; left: 24px; bottom: 24px; width: 140px; height: 140px; border-radius: 50%; background: rgba(255, 253, 246, 0.6); border: 3px solid #000; touch-action: none; }
.joystick-knob { position: absolute; left: 50%; top: 50%; width: 56px; height: 56px; margin: -28px 0 0 -28px; border-radius: 50%; background: #fffdf6; border: 3px solid #000; pointer-events: none; }
```

- [ ] **Step 3: Create `src/spike/ui.ts`**

```ts
export interface SpikeUi {
  showStart(onStart: () => void): void;
  showRunning(label: string): void;
  showResult(text: string, pass: boolean): void;
  setFps(fps: number, tier: number): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.textContent = text;
  return e;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

export function createUi(root: HTMLElement): SpikeUi {
  const panel = el('div');
  panel.className = 'panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Speed test');
  panel.setAttribute('aria-live', 'polite');
  root.appendChild(panel);

  const fpsTag = el('div');
  fpsTag.className = 'fps';
  root.appendChild(fpsTag);
  let lastFpsUpdate = 0;

  return {
    showStart(onStart) {
      panel.hidden = false;
      panel.replaceChildren(
        el('h1', 'Chromebook speed test'),
        el('p', 'This checks if the 3D forest runs well on this computer.'),
        el('p', 'It takes about 30 seconds. Do not touch anything while it runs.'),
      );
      const b = button('Start speed test', onStart);
      panel.appendChild(b);
      b.focus();
    },
    showRunning(label) {
      const p = el('p', label);
      p.dataset.testid = 'running';
      panel.replaceChildren(p, el('p', 'Please wait.'));
    },
    showResult(text, pass) {
      const pre = el('pre', text);
      pre.dataset.testid = 'result';
      const copy = button('Copy results', async () => {
        try {
          await navigator.clipboard.writeText(text);
          copy.textContent = 'Copied!';
        } catch {
          const range = document.createRange();
          range.selectNodeContents(pre);
          getSelection()?.removeAllRanges();
          getSelection()?.addRange(range);
          copy.textContent = 'Text selected. Press Ctrl + C.';
        }
      });
      const drive = button('Try driving the worm', () => {
        panel.hidden = true;
      });
      panel.replaceChildren(el('h1', pass ? 'PASS' : 'FAIL'), pre, copy, drive);
      copy.focus();
    },
    setFps(fps, tier) {
      const now = performance.now();
      if (now - lastFpsUpdate < 250) return;
      lastFpsUpdate = now;
      fpsTag.textContent = `${Math.round(fps)} fps, quality ${tier}`;
    },
  };
}
```

- [ ] **Step 4: Replace `src/spike/main.ts`**

```ts
import * as THREE from 'three';
import './spike.css';
import { startLoop } from '../core/loop';
import { FpsMeter } from '../render/fps';
import { QualityController, TIERS } from '../render/quality';
import { setRimLight } from '../render/paintedMaterial';
import { buildScene, WORLD_HALF } from './scene';
import { createBody, followHead } from '../worm/body';
import { stepWorm, type WormMotion } from '../worm/locomotion';
import { cameraTarget, smoothToward } from '../surface/followCamera';
import { KeyboardInput } from '../input/keyboard';
import { TouchJoystick } from '../input/touchJoystick';
import { keysToCommands, mergeCommands, NO_COMMANDS, type Commands } from '../input/commands';
import {
  SpeedTest, PHASES, quickPhases, parseParams, formatResults, verdict,
  type DeviceInfo, type PhaseSpec,
} from './speedTest';
import { createUi } from './ui';

const WORM_SEGMENTS = 16;
const SPACING = 0.22;
const CAM_DISTANCE = 3.2;
const CAM_HEIGHT = 1.6;
const AUTO_DRIVE: Commands = { ...NO_COMMANDS, move: { x: 0.35, y: 1 } };

const params = parseParams(location.search);
const app = document.getElementById('app')!;

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
app.appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 120);
const world = buildScene(params.leaves, WORM_SEGMENTS);

const keyboard = new KeyboardInput();
const joystick = new TouchJoystick(app);
const ui = createUi(app);
const meter = new FpsMeter();
const quality = new QualityController();

let motion: WormMotion = { head: { x: 0, y: 0.14, z: 0 }, heading: 0 };
const body = createBody(WORM_SEGMENTS, SPACING, motion.head, motion.heading);
let camPos = cameraTarget(motion.head, motion.heading, CAM_DISTANCE, CAM_HEIGHT);
let mode: 'idle' | 'testing' | 'free' = 'idle';
let test: SpeedTest | null = null;
const tmp = new THREE.Object3D();

function applyTier(i: number): void {
  const t = TIERS[i];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1) * t.resolutionScale);
  setRimLight(t.rimLight);
  world.leaves.count = Math.floor(world.totalLeaves * t.leafDensity);
}

function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

function commands(): Commands {
  if (mode === 'testing') return AUTO_DRIVE;
  if (mode === 'free') {
    return mergeCommands(keysToCommands(keyboard.down), { ...NO_COMMANDS, move: joystick.value });
  }
  return NO_COMMANDS;
}

function update(dt: number): void {
  motion = stepWorm(motion, commands().move, dt, { speed: 1.6, turnRate: 2.2, halfSize: WORLD_HALF - 1 });
  followHead(body, motion.head, SPACING);
  for (let i = 0; i < body.length; i++) {
    const s = body[i];
    const r = 0.14 * (1 - i / (body.length * 1.6));
    tmp.position.set(s.x, s.y, s.z);
    tmp.scale.setScalar(r);
    tmp.updateMatrix();
    world.worm.setMatrixAt(i, tmp.matrix);
  }
  world.worm.instanceMatrix.needsUpdate = true;
  camPos = smoothToward(camPos, cameraTarget(motion.head, motion.heading, CAM_DISTANCE, CAM_HEIGHT), 4, dt);
}

function phaseLabel(p: PhaseSpec): string {
  return p.id === 'full' ? 'Test 1 of 2: full quality' : 'Test 2 of 2: auto quality';
}

function deviceInfo(): DeviceInfo {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    gpu: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown',
    cores: navigator.hardwareConcurrency ?? 'unknown',
    memoryGb: nav.deviceMemory ?? 'unknown',
    screen: `${screen.width}x${screen.height}`,
    pixelRatio: window.devicePixelRatio,
    userAgent: navigator.userAgent,
  };
}

function onPhaseChange(next: PhaseSpec | null): void {
  if (next) {
    loop.setMaxFps(next.capped ? 30 : Infinity);
    ui.showRunning(phaseLabel(next));
    return;
  }
  mode = 'free';
  loop.setMaxFps(30);
  const { full, auto } = test!.results;
  ui.showResult(
    formatResults(full, auto, quality.tier, params.leaves, deviceInfo()),
    verdict(auto) === 'PASS',
  );
}

function render(now: number): void {
  meter.frame(now);
  if (mode === 'testing' && test) {
    const phase = test.current;
    test.frame(now);
    if (phase?.autoQuality && quality.update(now, meter.fps)) applyTier(quality.tier);
    const next = test.current;
    if (next !== phase) onPhaseChange(next);
  }
  camera.position.set(camPos.x, camPos.y, camPos.z);
  camera.lookAt(motion.head.x, motion.head.y + 0.35, motion.head.z);
  renderer.render(world.scene, camera);
  ui.setFps(meter.fps, quality.tier);
}

applyTier(0);
resize();
window.addEventListener('resize', resize);
const loop = startLoop(update, render, { maxFps: 30 });

ui.showStart(() => {
  test = new SpeedTest(params.quick ? quickPhases() : PHASES);
  quality.reset();
  applyTier(0);
  mode = 'testing';
  const first = test.current!;
  loop.setMaxFps(first.capped ? 30 : Infinity);
  ui.showRunning(phaseLabel(first));
});
```

- [ ] **Step 5: Type-check and run all unit tests**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors. All unit tests pass.

- [ ] **Step 6: Manual check in the dev server**

Run: `npm run dev` and open the printed URL with `?quick=1` added.
Expected:
- A warm sky, a brown ground covered in fall-colored leaves, white and brown trunks, a pink segmented worm with no eyes, and a light panel with large black text.
- Pressing **Start speed test** shows "Test 1 of 2", then "Test 2 of 2", then a PASS or FAIL panel with the report. The fps tag updates in the top-right corner.
- **Try driving the worm** hides the panel. Arrow keys, WASD and the joystick (drag with the trackpad or a finger) steer the worm, and the camera follows smoothly.
- There are no errors in the browser console.

If the scene is black or shows shader errors, check the console. The most likely cause is the `colorspace_fragment` note in Task 9.

- [ ] **Step 7: Commit**

```bash
git add src/spike
git commit -m "feat(spike): 3D forest floor speed test page"
```

---

### Task 12: Single-file build check

**Files:**
- Create: `scripts/check-single-file.mjs`

- [ ] **Step 1: Create `scripts/check-single-file.mjs`**

```js
import { readdirSync, readFileSync, statSync } from 'node:fs';

const MAX_MB = 8;
const errors = [];

const files = readdirSync('dist');
if (files.length !== 1 || files[0] !== 'index.html') {
  errors.push(`dist/ must contain only index.html, found: ${files.join(', ')}`);
}

const html = readFileSync('dist/index.html', 'utf8');
if (/<script[^>]+\bsrc=/i.test(html)) errors.push('found an external <script src=...>');
if (/<link[^>]+rel=["']?stylesheet/i.test(html)) errors.push('found an external stylesheet <link>');
if (!html.includes('http-equiv="Content-Security-Policy"')) errors.push('missing CSP meta tag');
if (!html.includes("connect-src 'none'")) errors.push("CSP does not block connections (connect-src 'none')");
if (html.indexOf('Content-Security-Policy') > html.indexOf('<script')) {
  errors.push('CSP meta must come before the first <script>');
}

const mb = statSync('dist/index.html').size / 1024 / 1024;
console.log(`dist/index.html: ${mb.toFixed(2)} MB (budget ${MAX_MB} MB)`);
if (mb > MAX_MB) errors.push(`over the ${MAX_MB} MB budget`);

if (errors.length) {
  for (const e of errors) console.error(`FAIL: ${e}`);
  process.exit(1);
}
console.log('single-file build OK');
```

- [ ] **Step 2: Run it**

Run: `npm run verify:build`
Expected: the size prints (roughly 0.5 to 1 MB at this stage), then `single-file build OK`.

- [ ] **Step 3: Commit**

```bash
git add scripts/check-single-file.mjs
git commit -m "chore: verify single-file build, CSP and size budget"
```

---

### Task 13: Browser test (offline, no network, keyboard reachable)

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/speedTest.spec.ts`

- [ ] **Step 1: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: {
    ...devices['Desktop Chrome'],
    // Software WebGL so the test runs on machines without a GPU.
    launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] },
  },
});
```

- [ ] **Step 2: Create `tests/e2e/speedTest.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PAGE = pathToFileURL(path.resolve('dist/index.html')).href + '?quick=1';

test('runs offline from a file with zero network requests', async ({ page, context }) => {
  const outside: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!/^(file|data|blob):/.test(u)) outside.push(u);
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await context.setOffline(true);
  await page.goto(PAGE);
  await page.getByRole('button', { name: 'Start speed test' }).click();
  await expect(page.getByTestId('running')).toBeVisible();
  await expect(page.getByTestId('result')).toContainText('fps average', { timeout: 30_000 });

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

test('start button works from the keyboard alone', async ({ page }) => {
  await page.goto(PAGE);
  const start = page.getByRole('button', { name: 'Start speed test' });
  await expect(start).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('running')).toBeVisible();
});
```

- [ ] **Step 3: Run the browser tests**

Run: `npm run test:e2e`
Expected: 3 passed. The software renderer may report FAIL inside the page. That's fine, because the test only checks that a report appears.

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts tests/e2e
git commit -m "test(e2e): offline single-file run, CSP and keyboard start"
```

---

### Task 14: Chromebook instructions and push

**Files:**
- Create: `docs/step0-chromebook-test.md`

- [ ] **Step 1: Create `docs/step0-chromebook-test.md`**

```markdown
# Step 0: Chromebook speed test

This checks whether the 3D forest floor runs at 30 fps on a student Chromebook.
It takes about 30 seconds.

## Get the file onto the Chromebook

1. On the Mac, run `npm run verify:build`. This makes `dist/index.html`, one file.
2. Copy that file to the Chromebook in either of these ways:
   - **USB stick:** copy `index.html` onto it, plug it in, then open it from the Files app.
   - **Google Drive:** upload `index.html`. On the Chromebook, open the Files app, then
     Google Drive, then right-click the file and choose **Open with Chrome**.
     (Opening it on the drive.google.com website shows a preview instead of running it.)

## Run it

1. Plug the Chromebook in. Battery saver can slow it down.
2. Close other tabs.
3. Click **Start speed test** and don't touch anything for about 30 seconds.
4. Read the big **PASS** or **FAIL**.
5. Click **Copy results** and paste them into the Claude session.
6. Optional: click **Try driving the worm** and steer with the arrow keys, the trackpad
   (click and drag the circle) and touch, if the screen is a touchscreen.
   Note how steering feels.

## Extra runs (optional)

Add these to the end of the file's address in Chrome's address bar:
- `?leaves=4000`: twice the leaves, to see how much room there is
- `?leaves=1000`: half the leaves

## What happens next

- **PASS at quality 0 or 1:** build the 3D forest floor as planned.
- **PASS at quality 2 or 3:** build it in 3D, but plan for the simpler look on these Chromebooks.
- **FAIL:** the forest floor uses the side view too. The art and code carry over.
```

- [ ] **Step 2: Run everything one last time**

Run: `npm test && npm run test:e2e`
Expected: all unit tests and all 3 browser tests pass.

- [ ] **Step 3: Commit and push**

```bash
git add docs/step0-chromebook-test.md
git commit -m "docs: Step 0 Chromebook speed test instructions"
git push
```

---

## After this plan

Matt runs `docs/step0-chromebook-test.md` on a student Chromebook and pastes the results into a session. Based on the result, write the **Step 1 plan** (core loop, worm, switch scanning and assisted steering, save, Chapter 1 with placeholder art). It reuses `core/`, `input/`, `worm/`, `surface/` and `render/` from this plan, and replaces `src/spike/` with the real game entry point.
