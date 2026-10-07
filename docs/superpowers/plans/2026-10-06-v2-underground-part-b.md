# V2 · Underground, Part B (underground): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The worm digs down from the 3D forest floor into a painted cutaway of a worm-free Minnesota forest floor (litter, old leaves, humus, topsoil, subsoil), digs free tunnels with castings past stones and roots, switches between a Wide and a Close camera, and comes back up through a burrow opening with a nightcrawler midden, all on one context-sensitive Action button.

**Architecture:** Everything new lives in `src/underground/`. Pure parts (tested first): the slab model (`slab.ts`, `layers.ts`), the 0.1 u soil grid (`soilGrid.ts`), blockers (`solids.ts`), where digging is allowed and which side the camera looks from (`digSpot.ts`), the worm digging in the plane (`burrowMotion.ts`), the mode machine (`modeMachine.ts`), the worm's own moves in and out (`bodyPath.ts`), the camera's frame (`cutCamera.ts`), openings (`openings.ts`) and the game that ties them to the crawl (`burrowGame.ts`). Rendering: one strip mesh and one shader for the cut face reading a 160 × 120 data texture of the grid (`cutFace.ts`, `cutFaceGlsl.ts`); one merged mesh on the forest's existing prop material for stones, roots, life hints, moss and the cut log (`slabProps.ts`, `cutShapes.ts`); one for the middens (`middens.ts`); DOM layer names (`layerLabels.ts`); and the bridge that poses the worm and moves the camera (`cutScene.ts`). **The forest in front of the cut is removed by the camera's near plane**, set just in front of the cut while the camera faces it square: no shader changes, no recompiles. Everything is built at load, so `warmShaders` compiles it with the rest; entering and leaving only show, hide and set uniforms (zero shader compiles, checked in e2e).

**Tech Stack:** Vite 8, TypeScript 7 (strict), three 0.186 (WebGL 2), vite-plugin-singlefile, Vitest 5 (unit), Playwright (e2e, SwiftShader), Node 24 scripts (`.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-04-v2-underground-design.md`, sections 4–7, 10 (the underground parts), 12 and 13, with Matt's answers 11.8 (one Action button) and 11.9 (worm buried in the litter, built by Plan A).
**Contract:** `docs/superpowers/plans/2026-10-06-v2-contract.md`. This plan uses Plan A **only** through the contract's names: `TEXT`, `shown` (`src/content/text.ts`); `ActionKind`, `ActionPrompt`, `createActionPrompt` (`src/ui/actionPrompt.ts`); `createPressEdge` (`src/input/actionEdge.ts`); `floorHeight`, `litterTopHeight` (`src/surface/litterDepth.ts`); `UNITS_PER_CM` (`src/surface/realScale.ts`); `footprints()`, `obstacleDepth()`, `LOG_FOOT` (`src/surface/obstacles.ts`); `WORLD_HALF`, `PLAY_HALF`; `updateSettings`.
**Co-development:** `CLAUDE.md` and `docs/codev/README.md`. The version is "V2 · Underground" (Plan A sets the label).

---

## Before you start

- **Plan A must be finished first.** This plan runs on branch `v2-underground` after Plan A's last task. Check that the contract's names exist before Task 1; every line should print a match:

  ```bash
  grep -n "export const TEXT\|export function shown" src/content/text.ts
  grep -n "export type ActionKind\|export function createActionPrompt\|touchHeld" src/ui/actionPrompt.ts
  grep -n "export function createPressEdge" src/input/actionEdge.ts
  grep -n "export function floorHeight\|export function litterTopHeight" src/surface/litterDepth.ts
  grep -n "export const UNITS_PER_CM" src/surface/realScale.ts
  grep -n "export function footprints\|export function obstacleDepth\|LOG_FOOT" src/surface/obstacles.ts
  grep -n "digDown\|comeUp\|viewWide\|viewClose\|layerLitter\|layerOld\|layerHumus\|layerTopsoil\|layerSubsoil\|undergroundHint\|burrowChoice" src/content/text.ts | wc -l
  ```

  The last line should print at least 11. If a name differs, stop and ask the lead: the contract is the agreement between the plans.
- **Files Plan A has changed.** Several tasks edit files that Plan A edited first (`src/main.ts`, `src/game/world.ts`, `src/game/crawl.ts`, `src/save/settingsStore.ts` and its test, `src/perf/speedTest.ts`, `src/perf/speedTestRunner.ts`, `scripts/perf-gates.mjs`). **Re-read each one before editing it.** Those steps say what the edit does as well as showing the code, which was verified against the pre-Plan-A file in a scratch build: apply the intent to the file as Plan A left it. The full list is at the end of this section.
- **Branch:** work on `v2-underground`. The untracked `.claude/` folder is not part of this work: always `git add` the exact files listed, never `git add -A`.
- **Commands** (from the repo root):
  - unit tests: `npx vitest run` (one file: `npx vitest run tests/unit/<name>.test.ts`; one test: add `-t "<part of its name>"`)
  - types: `npx tsc --noEmit`
  - build and single-file check: `npm run verify:build`
  - browser tests: `npm run test:e2e` (builds first; one file: `npm run build && npx playwright test tests/e2e/<name>.spec.ts`)
- **Test counts: compare by difference.** The plan was verified on the branch before Plan A (69 files, 772 tests, 8 e2e files). Write down `npx vitest run`'s totals and `npm run test:e2e`'s count after Plan A's last task; each task below says how many test files and tests it adds. By the end of Task 19 this plan adds **16 unit test files with 74 tests**, **1 test** in `tests/unit/params.test.ts` (75 in all), and **1 e2e file with 6 tests**; it changes expectations in Plan A's `tests/unit/settingsStore.test.ts` and `tests/unit/params.test.ts` without removing any test.
- **Every task leaves green:** `npx tsc --noEmit`, `npx vitest run`, `npm run verify:build`, and (from Task 17 on) `npm run test:e2e`.
- **Every commit message ends with** a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (the commit commands below include it).
- **Conventions:** named exports only; unit tests import from `'../../src/...'`; no allocation in per-step or per-frame code (preallocated objects and typed arrays; the slab's meshes are rebuilt once per dig, which may allocate); no shader recompiles (no `material.side`, `defines` or `vertexColors` changes at run time); files under about 260 lines; `main.ts`, `crawl.ts` and `obstacles.ts` must not grow (this plan extracts code to keep them level).
- **GLSL reserved words.** WebGL 2 shaders are GLSL ES 3.00: `cast`, `out`, `patch`, `sample`, `input`, `output`, `filter`, `active` and others are reserved and fail to compile. The verified shader avoids them; keep it that way if you touch it.
- **Rendering tasks** are marked **(rendering)**. Reviewers of those tasks read `docs/superpowers/visual-quality-brief.md` first and look at the screenshots the task names.
- **Units:** the worm is 3.5 units long and stands for a 15 cm nightcrawler, so 1 cm ≈ 0.23 u (`UNITS_PER_CM`). The world is 40 × 40 u.
- **Quick taps.** The game steps run inside rendered frames, so a key or touch press shorter than a frame could be missed. Task 10 makes the keyboard keep a tapped key down until a step has seen it. In tests, always hold Space for 150 ms or more (`hold:Space:150`), never `keyboard.press('Space')`.
- **Scratch screenshots.** Rendering tasks ask for screenshots with a throwaway script. Create it once (it is not committed: `.cache/` is git-ignored). It is V1's script plus three actions: `until:<place>` waits for the game's place (`#app[data-place=…]`, set in Task 17), `down:`/`up:` hold and release a key, and `size:WxH` sets the viewport:

```bash
mkdir -p .cache/shots && cat > .cache/shot.mjs <<'SHOT'
// node .cache/shot.mjs <out.png> [query] [actions...]
// actions: click:Name | radio:Name | key:Code | wait:ms | hold:Code:ms | down:Code | up:Code | until:place | size:WxH
import { chromium } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [out, query = '', ...actions] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const sizeArg = actions.find((a) => a.startsWith('size:'));
const [w, h] = sizeArg ? sizeArg.slice(5).split('x').map(Number) : [1366, 768];
const page = await browser.newPage({ viewport: { width: w, height: h } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(pathToFileURL(path.resolve('dist/index.html')).href + query);
await page.waitForTimeout(1500);
for (const a of actions) {
  const [k, v, ms] = a.split(':');
  if (k === 'click') await page.getByRole('button', { name: v, exact: true }).click();
  else if (k === 'radio') await page.getByRole('radio', { name: new RegExp('^' + v) }).check();
  else if (k === 'key') await page.keyboard.press(v);
  else if (k === 'wait') await page.waitForTimeout(Number(v));
  else if (k === 'hold') { await page.keyboard.down(v); await page.waitForTimeout(Number(ms)); await page.keyboard.up(v); }
  else if (k === 'until') await page.waitForSelector(`#app[data-place="${v}"]`, { timeout: 60000 });
  else if (k === 'down') await page.keyboard.down(v);
  else if (k === 'up') await page.keyboard.up(v);
}
await page.screenshot({ path: out });
console.log('errors:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
SHOT
```

  Run it after `npm run build`. SwiftShader is slow underground at 1366 × 768, and the game clock slows with it, so wait on `until:` rather than on fixed times when you can. Then open the PNG and look at it.

### Where this plan touches files Plan A changes

| File | Task | What this plan does there |
|---|---|---|
| `src/save/settingsStore.ts` | 9 | Adds `undergroundView` with the stored-only-when-picked rule (contract §5) |
| `tests/unit/settingsStore.test.ts` | 9 | Adds `undergroundView: 'wide'` to the expectations that compare whole settings objects |
| `src/game/crawl.ts` | 5, 13 | Exports `SPACING`; `reset()` can start the worm at given points; two small helpers move to `src/core/vec.ts` so the file does not grow |
| `src/game/world.ts` | 17 | Splits the worm-posing half of `sync()` into `syncWorm()` |
| `src/main.ts` | 10, 17, 19 | `keyboard.settle()` after each step; the game steps through `BurrowGame`; the cut scene draws; the prompt is fed; the crawl card switches; `warmShaders` moves out; the speed test's dig run |
| `src/perf/speedTest.ts`, `src/perf/speedTestRunner.ts` | 19 | A "Where: Surface/Underground" report line |
| `scripts/perf-gates.mjs` | 19 | Every preset also runs underground (`&dig=1`) |
| `src/surface/litterDepth.ts` | (read only) | `floorHeight`, `litterTopHeight` |
| `src/ui/actionPrompt.ts`, `src/content/text.ts`, `src/input/actionEdge.ts` | (read only) | Through the contract's names |
| `tests/unit/params.test.ts` | 19 | `dig: false` in the two whole-result expectations, and one new test |
| `CHANGELOG.md` | 22 | Plan B's student lines under Plan A's "Coming next: V2 · Underground" |

### Verification stubs (NOT part of this plan)

The planner verified every task in a scratch worktree of the branch **before** Plan A, with minimal stubs of the contract's modules (`src/content/text.ts`, `src/content/sources.ts`, `src/ui/actionPrompt.ts`, `src/input/actionEdge.ts`, `src/surface/realScale.ts`, and `floorHeight`/`litterTopHeight` appended to `src/surface/litterDepth.ts`, where the stub's litter top was the V1 ground plus 0.5–1.2 u), and two stub lines in `main.ts` creating the prompt and OR-ing `touchHeld` into the touch commands. **Do not create these:** Plan A provides the real modules and the real `main.ts` lines. Where a step below shows `prompt` in `main.ts`, it means Plan A's `ActionPrompt` instance (use Plan A's variable name).

## Decisions made while planning (verified in a scratch build)

Every code block in this plan was built and tested in the scratch worktree in this task order. These choices fill gaps in the spec or deviate from it; Task 22 records them in the spec's as-built section.

| Topic | Decision | Why |
|---|---|---|
| The forest in front of the cut | **The camera's near plane is set just in front of the cut** (0.45 u before its highest point, `cutCamera.ts` `cutPose`) while the camera faces the cut square. Leaves, trunks, rocks and the log between the camera and the cut are simply not drawn | No shader change, no material variant, no recompile; works for every material at once. Clip planes would add a discard to every surface shader (early-z loss, the brief's fill-rate rule) and change program keys |
| What shows above the cut | The camera is pitched down a little (Wide 0.2 rad, Close 0.12 rad), so the 3D forest floor, trunks and sky continue above and behind the cut. The haze starts just behind the cut (`uFogNear` = camera distance + 1.5, `uFogFar` + 26) | Spec 4.1 and 5.2: the two views read as one place, the forest dimmed by depth haze. Fog is a shared uniform: no recompile |
| Wide framing | 8.5 u tall from 1.4 u above the highest litter, so it shows the surface down into B; at least 7 u wide on phones (up to 13 u tall). It follows the head gently (critically damped, 0.9 s, dead zone half the frame) only when the slab and its name room are wider than the screen | Spec 7. A frame tall enough to show the whole 16 u slab on 16:9 would show all 12 u of depth and a tiny worm |
| Close framing | The screen's shorter side spans 6 u (about 1.7 worm lengths), 18% of the frame kept ahead of the head (the facing eased over 0.8 s), 0.4 s smoothing | Spec 7 says "about 4–5 worm lengths", which is as wide as Wide (16 u): Close would not be closer. **Tell Matt** |
| Camera smoothing | `springTo`: the critically damped spring of `smoothDampInto` without its clamp at the target | That clamp zeroes the speed the instant a moving target is reached: a measured jolt (jerk 0.006 u/frame²) when the frame caught up with the worm; without it 0.0019 |
| Going down | Action → the head turns down and sinks for 1.0 s along an arc (the body slides into the plane meanwhile); then the camera swings for 1.5 s (position eased, lifted by up to 1.2 u mid-swing so it passes over the leaves; rotation slerped); the near plane closes in at the very end (`e⁶`) | Spec 4.1. The lift keeps the swing out of the leaves near the worm |
| Coming up | Action near the top → the head curves up to the floor 0.45 u along, then the worm crawls 3.8 u out along the cut (its whole body out) in 2.1 s; the camera swings back during the last 1.5 s. The crawl is moved to the end pose when Action is pressed, so the swing ends exactly on its settled follow camera | Spec 4.2: out at that point along the cut, facing along the cut. The worm faces the way its head pointed along the cut, or the slab's middle if the run would leave the slab |
| Reduced motion | A 0.7 s dip through dark soil (a DOM overlay's opacity) with the camera cut at its darkest, instead of the swing | A true cross-fade needs a second render target (the brief forbids). The dip is one fade, never flashing |
| "Near the top" | The head within 0.2 u (~1 cm) of the F top, or above it in the litter; it stops counting below 0.35 u (hysteresis). The head never comes within 0.12 u of the litter's top | Spec 4.2, 11.8: Action means "Come up" there; steering into the top never pops the worm out |
| Layer thicknesses | F 4–5 cm, H 1–2 cm, A 3–5 cm, **E 2–4 cm (a planning choice: the research notes give no number)**, B the rest to 12 u below the litter top; L is the surface litter's depth (Plan A). Each boundary varies along the cut within its range: a slab-wide bias, slow swells and a little wobble; seeded per spot | Spec 5.1, 8.2 (L and the F top match the surface at the entry exactly) |
| The face | One strip mesh, 2 vertices per 0.125 u column across the playable slab plus 6 u each side (so no view shows its end), carrying the column's boundaries as attributes; one `ShaderMaterial`, `DoubleSide` (the camera's side varies; switching `side` would recompile) | Spec 10: one or two shaders on simple geometry |
| Layer patterns | **Baked once at load into four small tiling textures with mipmaps** (`soilTiles.ts`, 128 texels per unit, about 100 ms on this Mac): L, rows of leaf blades edge-on (red, orange, yellow, green, bleached tan) with some leaves cut at an angle, grass and needles, dark air gaps; F, dark matted fragments, white hyphae, pale fine roots and a moss mask; H, black crumbs, fine roots; grain (sand, mottles, pebbles) that A, E and B colour and scale differently. The face reads one tile texel a pixel, bent a little by the broad noise so repeats never line up | Spec 5.3: pattern, not only colour. Measured (rough, High, 1366 × 768, software GL): computing the patterns per pixel ran underground at 43% of the surface's fps; a flat-colour face 80%; the baked tiles 98%. Minifying the shared 128 px noise texture (no mips) sparkled like TV static |
| Soil grid | 160 × 120 cells of 0.1 u; bytes: layer, open, castings (shade), mixed, blocker, damp. Packed to an RGBA8 data texture (open, castings, mixed, damp), uploaded one changed row per update range | Spec 10. three r186 uploads each update range as a single row, so a range must not span rows |
| Digging | Tunnel radius 0.14; every body point keeps an open tunnel; speeds: own tunnel 1.4, castings 0.9, L 1.0, F 0.9, H 0.85, A 0.6, E 0.45, B 0.42 u/s; turning 2.6 rad/s toward the way pointed, slower in sharp turns, never more than 1.3 rad off the neck; peristalsis 1.9 times as many waves per unit while eating fresh soil | Spec 6 |
| Castings and mixing | A casting every 4.5 u moved (about 1.3 body lengths) at the tail, radius 0.15, filling 70% of the tunnel cells it covers, darker the more leaves the worm ate lately; eating F or H darkens the walls in a 0.12 u ring | Spec 6 |
| Blockers | 6–10 stones (radius 0.12–0.55) in A, E and B; 2–3 big roots (radius 0.12–0.3, tapering) from the nearest trunk through H, A and E, or 1 from a slab end when no trunk is near; surface rocks and the log the cut passes through become section stones and a log section (rings, bark, moss). Collide-and-slide on circles and capsules | Spec 5.2 |
| Stones, roots, life, moss | One merged mesh on the forest's existing prop material (`createPropMaterial()`: the same program as the ground props, so no new shader), rewritten into preallocated buffers once per dig. Normals of half-sunk shapes lean toward the camera so the warm rim light does not ring them in the dark soil | One draw. The prop material has no instancing |
| Life hints | Per slab: a snail shell in L, a beetle low in L, a wolf spider on the litter's top, a puffball at the surface line, 2–3 moss carpets with red-stalked capsules along the top | Spec 5.2 (static hints for the vote) |
| Openings | Up to 8 per session (oldest replaced), never saved: a dark hole with a midden of 16 casting lumps and 9 leaf bits about 1.2 u across, sitting 0.2 u into the top of the leaves (so it shows on Plan A's deep litter). One merged mesh, prop material | Spec 4.2, 4.3, 6 |
| The worm in the cut | The same tube and body chain; its axis lies in the cut plane; the tube's back turns from the sky toward the camera as it sinks (`HeroWorm.up`); its contact shadow is hidden underground | Spec 6. A world-up frame flips when the body points straight down |
| Camera side | Scored from the footprints in front of each side of the cut (trunks count 4 times), plus a camera outside the world; on a tie, the sun's side | The swing must not pass through a trunk |
| Dig allowed | Not within 0.5 u of a trunk, rock or log footprint, nor within 2.5 u of the play edge | Spec 4.1 |
| Hint card | The session's first visit shows `TEXT.undergroundHint` and `shown(TEXT.burrowChoice)` for 12 s underground; then, and on later visits, the panel is hidden so the cut stays clear (the Action prompt still says what Space does) | The two-paragraph card covered most of a 360 × 640 screen |
| Layer names | Real DOM, 18 px bold ink on parchment (well over 7:1), outside each end of the playable slab with a tick at each layer's top; pushed apart to 30 px where layers are thin; a style is written only when a label's whole-pixel position changes | Spec 5.3, 11.2 |
| Keyboard taps | `KeyboardInput.settle()` after each step: a key let go before any step saw it stays down until then | A quick Space tap on a slow frame was missed. **Plan A's touch button needs the same** (see the report) |
| Tests' handle on the game | `#app[data-place]` is `surface`, `diggingDown`, `underground` or `comingUp` | e2e and screenshots wait on it, not on time |
| Speed test underground | `?dig=1`: the speed test starts underground at the spawn (Wide) and points the worm along a slow figure (cos 0.37 t, sin 0.61 t − 0.15) so it keeps eating fresh soil; the report says "Where: Underground" | Spec 10: the gates' underground run |
| Measured (rough) | Back-to-back bench pairs on a busy Mac (not the gates), 1366 × 768. High: surface 24.6 fps with about 26 draws a frame, underground 24.0 fps with about 35 draws. Ultra (machine too loaded for fps): about 32 draws on the surface, **about 36 underground**, so only 4 to spare. Run the real gates in Task 20 | The lead allowed one rough bench; the gates need a quiet machine |

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/underground/layers.ts` | Create (T1) | Layer ids, thickness ranges, digging speeds, which layers are organic, the label keys |
| `src/underground/slab.ts` | Create (T1) | The cut: entry, direction, camera side, playable and drawn u ranges, per-column layer boundaries; `boundaryAt`, `layerAt`, plane/world mapping |
| `src/underground/soilGrid.ts` | Create (T2) | The 160 × 120 grid: fill, dig, castings, mixing, blockers, damp, dirty rows, packing |
| `src/underground/solids.ts` | Create (T3) | Stones, big roots, section rocks and log; collide-and-slide; marking them in the grid |
| `src/underground/digSpot.ts` | Create (T4) | `canDigAt`, `chooseSide` |
| `src/underground/burrowMotion.ts` | Create (T5) | The worm digging in the plane: point steering, speed by soil, tunnels, castings, near-the-top |
| `src/underground/modeMachine.ts` | Create (T6) | surface → diggingDown → underground → comingUp; progress; the prompt's kind; `UndergroundView` |
| `src/underground/bodyPath.ts` | Create (T7) | The sink and emerge paths the body slides along |
| `src/underground/cutCamera.ts` | Create (T8) | Wide and Close frames, smoothing, the camera pose and its near plane |
| `src/save/settingsStore.ts` | Modify (T9) | `undergroundView`, stored only when switched |
| `src/input/keyboard.ts` | Modify (T10) | Quick taps last until a step has seen them (`settle()`) |
| `src/underground/soilTiles.ts`, `src/underground/cutFaceGlsl.ts`, `src/underground/cutFace.ts` | Create (T11) | The layers' baked pattern tiles; the face's shaders; its strip mesh and soil data texture |
| `src/underground/cutShapes.ts`, `src/underground/slabProps.ts` | Create (T12) | Shape writers; the stones, roots, life and moss mesh |
| `src/core/vec.ts`, `src/game/crawl.ts` | Modify (T5, T13) | `SPACING` exported; `reset()` at given points; vector helpers moved out |
| `src/underground/openings.ts`, `src/underground/middens.ts` | Create (T14) | Burrow openings (session ring of 8); their midden mesh |
| `src/underground/burrowGame.ts` | Create (T15) | The game: crawl on the surface, dig, the moves, the view, openings, the prompt |
| `src/underground/layerLabels.ts`, `src/ui/underground.css`, `src/ui/undergroundHint.ts` | Create (T16) | The layer names; the underground styles; the hint card |
| `src/worm/wormMesh.ts`, `src/game/world.ts` | Modify (T17) | The tube's `up`, its shadow toggle; `syncWorm` |
| `src/underground/cutScene.ts`, `src/underground/burrowing.ts`, `src/render/warmShaders.ts` | Create (T17) | Drawing and the camera's moves; wiring for main; the shader warm-up moved out of main |
| `src/main.ts` | Modify (T10, T17, T19) | Steps and draws through the underground |
| `src/game/params.ts`, `src/perf/speedTest.ts`, `src/perf/speedTestRunner.ts`, `scripts/perf-gates.mjs` | Modify (T19) | `?dig=1`; "Where:"; the gates' underground run |
| `tests/unit/*.test.ts` (16 new; `params.test.ts` changed), `tests/e2e/underground.spec.ts` | Create | Listed per task |
| `docs/codev/versions/v02-underground/*.jpg`, `CHANGELOG.md`, the V2 spec, `docs/codev/versions/v02-underground.md` | Create/Modify (T20–T23) | Screenshots, changelog lines, as-built record, version doc |

---

### Task 1: Layers and the slab

**Files:**
- Create: `src/underground/layers.ts`
- Create: `src/underground/slab.ts`
- Test: `tests/unit/slab.test.ts`

The cut is a vertical plane through the dig point along the heading (spec 4.1). A point in it is (u, v): u along the cut from the entry, v the world height. The playable slab is 16 u wide and 12 u deep, clipped to the play area; the drawn face runs 6 u further each way, clipped to the world, so no camera view shows its end. Per column (every 0.125 u) the slab stores six heights: the litter top (`litterTopHeight`), then the tops of F (`floorHeight`), H, A, E and B. Each thickness stays inside its spec range everywhere (`THICKNESS_U`), mixing a slab-wide bias with slow swells and a small wobble, all from the slab's seed. `slabSeed(x, z)` makes the same spot always give the same slab.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/slab.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createSlab, boundaryAt, layerAt, slabSeed, slabU, slabX, slabZ,
  B_TOP, B_F, B_H, B_A, B_E, B_B, SLAB_HALF, SLAB_DEPTH, COLUMN_STEP,
} from '../../src/underground/slab';
import { LAYER, THICKNESS_CM } from '../../src/underground/layers';
import { UNITS_PER_CM } from '../../src/surface/realScale';
import { floorHeight, litterTopHeight } from '../../src/surface/litterDepth';
import { PLAY_HALF, WORLD_HALF } from '../../src/surface/terrain';

const SEEDS = [1, 7, 42, 99, 1234, 98765];
const cm = (u: number) => u / UNITS_PER_CM;

describe('the slab (spec 4.1, 5.1)', () => {
  it('every layer stays within its spec thickness everywhere along the cut, for many seeds', () => {
    for (const seed of SEEDS) {
      const s = createSlab(1.5, -2, 0.7, 1, seed);
      for (let u = s.faceLo; u <= s.faceHi; u += 0.05) {
        const pairs: [number, number, readonly [number, number]][] = [
          [B_F, B_H, THICKNESS_CM.F], [B_H, B_A, THICKNESS_CM.H], [B_A, B_E, THICKNESS_CM.A], [B_E, B_B, THICKNESS_CM.E],
        ];
        for (const [a, b, [lo, hi]] of pairs) {
          const t = cm(boundaryAt(s, a, u) - boundaryAt(s, b, u));
          expect(t).toBeGreaterThanOrEqual(lo - 1e-3);
          expect(t).toBeLessThanOrEqual(hi + 1e-3);
        }
      }
    }
  });

  it('the boundaries are irregular, not ruler lines, and each slab differs', () => {
    const a = createSlab(0, 0, 0, 1, 11);
    const b = createSlab(0, 0, 0, 1, 12);
    let spread = 0;
    let differs = 0;
    for (let u = -8; u <= 8; u += 0.25) {
      const ta = boundaryAt(a, B_H, u) - boundaryAt(a, B_A, u);
      const tb = boundaryAt(b, B_H, u) - boundaryAt(b, B_A, u);
      spread = Math.max(spread, Math.abs(ta - (boundaryAt(a, B_H, 0) - boundaryAt(a, B_A, 0))));
      differs = Math.max(differs, Math.abs(ta - tb));
    }
    expect(spread).toBeGreaterThan(0.02);
    expect(differs).toBeGreaterThan(0.02);
  });

  it('is deterministic per seed', () => {
    const a = createSlab(3, 4, 1.1, -1, 555);
    const b = createSlab(3, 4, 1.1, -1, 555);
    expect(Array.from(a.bounds)).toEqual(Array.from(b.bounds));
    expect(slabSeed(3.1, 4.2)).toBe(slabSeed(3.1, 4.2));
    expect(slabSeed(3.1, 4.2)).not.toBe(slabSeed(6, 4.2));
  });

  it('the L band at the entry is exactly the surface litter, its F top the floor (spec 8.2)', () => {
    for (const [x, z, h] of [[0, 0, 0], [5.3, -7.1, 2.2], [-11, 9, -1]]) {
      const s = createSlab(x, z, h, 1, 3);
      expect(boundaryAt(s, B_F, 0)).toBeCloseTo(floorHeight(x, z), 5);
      expect(boundaryAt(s, B_TOP, 0) - boundaryAt(s, B_F, 0)).toBeCloseTo(litterTopHeight(x, z) - floorHeight(x, z), 5);
      expect(s.bottom).toBeCloseTo(litterTopHeight(x, z) - SLAB_DEPTH, 5);
    }
  });

  it('is 16 wide and clipped to the world: the playable part to the play area, the face to the world edge', () => {
    const mid = createSlab(0, 0, 0.3, 1, 1);
    expect(mid.playLo).toBe(-SLAB_HALF);
    expect(mid.playHi).toBe(SLAB_HALF);
    const edge = createSlab(PLAY_HALF - 4, 0, Math.PI / 2, 1, 1);
    expect(edge.playHi).toBeLessThan(4);
    expect(slabX(edge, edge.playHi)).toBeLessThanOrEqual(PLAY_HALF);
    expect(slabX(edge, edge.faceHi)).toBeLessThanOrEqual(WORLD_HALF);
    expect(edge.playLo).toBe(-SLAB_HALF);
    expect(edge.faceLo).toBeLessThan(edge.playLo);
    expect(edge.cols).toBe(Math.floor((edge.faceHi - edge.faceLo) / COLUMN_STEP) + 1);
  });

  it('maps between the world and the cut', () => {
    const s = createSlab(2, 3, 0.9, -1, 8);
    expect(slabU(s, slabX(s, 2.5), slabZ(s, 2.5))).toBeCloseTo(2.5, 9);
    // The camera's side normal is horizontal and square to the cut.
    expect(s.nx * s.tx + s.nz * s.tz).toBeCloseTo(0, 9);
    expect(Math.hypot(s.nx, s.nz)).toBeCloseTo(1, 9);
  });

  it('layerAt reads the layers top to bottom', () => {
    const s = createSlab(0, 0, 0, 1, 5);
    const at = (k: number, d: number) => boundaryAt(s, k, 1) - d;
    expect(layerAt(s, 1, boundaryAt(s, B_TOP, 1) + 0.01)).toBe(-1);
    expect(layerAt(s, 1, at(B_TOP, 0.01))).toBe(LAYER.L);
    expect(layerAt(s, 1, at(B_F, 0.01))).toBe(LAYER.F);
    expect(layerAt(s, 1, at(B_H, 0.01))).toBe(LAYER.H);
    expect(layerAt(s, 1, at(B_A, 0.01))).toBe(LAYER.A);
    expect(layerAt(s, 1, at(B_E, 0.01))).toBe(LAYER.E);
    expect(layerAt(s, 1, at(B_B, 0.01))).toBe(LAYER.B);
    expect(layerAt(s, 1, s.bottom)).toBe(LAYER.B);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/unit/slab.test.ts`
Expected: FAIL, "Failed to resolve import ../../src/underground/slab".

- [ ] **Step 3: Implement**

Create `src/underground/layers.ts`:

```ts
import { UNITS_PER_CM } from '../surface/realScale';

/**
 * The soil layers of a worm-free Minnesota hardwood forest floor (moder humus), top to bottom
 * (V2 spec 5.1; docs/codev/research/mn-forest-floor.md). The index is the soil grid's layer byte.
 */
export const LAYER = { L: 0, F: 1, H: 2, A: 3, E: 4, B: 5 } as const;
export type LayerId = (typeof LAYER)[keyof typeof LAYER];
export const LAYER_COUNT = 6;

/**
 * Thickness ranges (cm, real) of the layers under the litter. L is not here: its thickness is the
 * surface litter's depth at each point (litterTopHeight - floorHeight, spec 8.2). B is the rest,
 * down to the slab's bottom. E (the pale band of many northern soils) has no number in the
 * research notes: 2-4 cm is a planning choice, recorded in the as-built record.
 */
export const THICKNESS_CM = {
  F: [4, 5],
  H: [1, 2],
  A: [3, 5],
  E: [2, 4],
} as const satisfies Record<string, readonly [number, number]>;

/** The same ranges in world units (min, max), in boundary order F, H, A, E. */
export const THICKNESS_U: readonly (readonly [number, number])[] = [
  THICKNESS_CM.F, THICKNESS_CM.H, THICKNESS_CM.A, THICKNESS_CM.E,
].map(([lo, hi]) => [lo * UNITS_PER_CM, hi * UNITS_PER_CM] as const);

/** Speed (units per second) eating into fresh soil of each layer (spec 6): easy L, F, H; A slower; E and B slowest. */
export const EAT_SPEED: Readonly<Record<LayerId, number>> = { 0: 1.0, 1: 0.9, 2: 0.85, 3: 0.6, 4: 0.45, 5: 0.42 };
/** Speed through the worm's own open tunnel: the fastest way to move. */
export const TUNNEL_SPEED = 1.4;
/** Speed eating back through castings (loose, soft). */
export const CAST_SPEED = 0.9;

/** Litter, fermentation and humus are leaves at different stages: eating them fills the gut with organic matter. */
export function isOrganic(layer: LayerId): boolean {
  return layer <= LAYER.H;
}

/** The TEXT key that names each layer on the slab's end labels (E and B share "Subsoil"). */
export const LAYER_LABEL_KEYS = ['layerLitter', 'layerOld', 'layerHumus', 'layerTopsoil', 'layerSubsoil'] as const;
export type LayerLabelKey = (typeof LAYER_LABEL_KEYS)[number];
```

Create `src/underground/slab.ts`:

```ts
import { fbm2, valueNoise2 } from '../core/noise';
import { mulberry32 } from '../core/random';
import { floorHeight, litterTopHeight } from '../surface/litterDepth';
import { PLAY_HALF, WORLD_HALF } from '../surface/terrain';
import { THICKNESS_U, LAYER, type LayerId } from './layers';

/**
 * The cutaway (V2 spec 4.1, 5.1): a vertical plane through the dig-down point along the worm's
 * heading, fixed for the visit. Points in it are (u, v): u along the cut from the entry, v the
 * world height. Pure and deterministic per seed.
 */

/** The playable slab: 16 u wide (about 70 cm), centred on the entry... */
export const SLAB_HALF = 8;
/** ...and 12 u deep (about 50 cm) below the litter top at the entry. */
export const SLAB_DEPTH = 12;
/** The drawn face runs this much farther along the cut than the playable slab, so no view shows its end. */
export const FACE_EXTRA = 6;
/** Spacing (u) of the face's columns: boundary depths are sampled here and drawn linearly between. */
export const COLUMN_STEP = 0.125;
/** The playable slab stays this far inside the worm's play area. */
const PLAY_MARGIN = 0.5;
/** Boundaries stored per column: litter top, then the tops of F, H, A, E and B. */
export const BOUNDS = 6;
export const B_TOP = 0;
export const B_F = 1;
export const B_H = 2;
export const B_A = 3;
export const B_E = 4;
export const B_B = 5;

export interface Slab {
  readonly seed: number;
  /** The entry point on the ground (world x, z). */
  readonly ox: number;
  readonly oz: number;
  /** Unit vector along the cut (the heading at the dig), and the unit normal toward the camera's side. */
  readonly tx: number;
  readonly tz: number;
  readonly nx: number;
  readonly nz: number;
  /** u range the worm may dig in, and the drawn face's u range (both clipped to the world). */
  readonly playLo: number;
  readonly playHi: number;
  readonly faceLo: number;
  readonly faceHi: number;
  /** World height of the slab's bottom. */
  readonly bottom: number;
  /** Highest litter top along the drawn face. */
  readonly topMax: number;
  /** Columns from faceLo every COLUMN_STEP; BOUNDS heights each (world y). */
  readonly cols: number;
  readonly bounds: Float32Array;
}

/** A seed for the slab dug at (x, z): the same spot always gives the same slab. */
export function slabSeed(x: number, z: number): number {
  return (Math.imul(Math.round(x * 2), 73856093) ^ Math.imul(Math.round(z * 2), 19349663)) >>> 0;
}

/** The u interval where the line ox + tx u, oz + tz u stays within |x|, |z| <= half. */
function clipLine(ox: number, oz: number, tx: number, tz: number, half: number, out: [number, number]): void {
  let lo = -Infinity;
  let hi = Infinity;
  for (const [o, t] of [[ox, tx], [oz, tz]] as const) {
    if (Math.abs(t) < 1e-9) continue;
    const a = (-half - o) / t;
    const b = (half - o) / t;
    lo = Math.max(lo, Math.min(a, b));
    hi = Math.min(hi, Math.max(a, b));
  }
  out[0] = lo;
  out[1] = hi;
}

/**
 * The slab for a dig at (x, z) with the worm heading `heading` (0 = +z), the camera on the side
 * `side` (+1: the normal (tz, -tx), -1: the other). Layer thicknesses vary along the cut within the
 * spec 5.1 ranges (THICKNESS_U), smoothly and irregularly, and differ from slab to slab. At u = 0
 * the F top is floorHeight and the L band is exactly litterTopHeight - floorHeight (spec 8.2).
 */
export function createSlab(x: number, z: number, heading: number, side: 1 | -1, seed: number): Slab {
  const tx = Math.sin(heading);
  const tz = Math.cos(heading);
  const nx = side * tz;
  const nz = side * -tx;
  const span: [number, number] = [0, 0];
  clipLine(x, z, tx, tz, PLAY_HALF - PLAY_MARGIN, span);
  const playLo = Math.max(-SLAB_HALF, span[0]);
  const playHi = Math.min(SLAB_HALF, span[1]);
  clipLine(x, z, tx, tz, WORLD_HALF - 0.05, span);
  const faceLo = Math.max(-SLAB_HALF - FACE_EXTRA, span[0]);
  const faceHi = Math.min(SLAB_HALF + FACE_EXTRA, span[1]);
  const cols = Math.floor((faceHi - faceLo) / COLUMN_STEP) + 1;
  const bounds = new Float32Array(cols * BOUNDS);
  const rand = mulberry32(seed);
  // Each boundary keeps a slab-wide bias (this hole is a bit thicker or thinner overall)...
  const bias = THICKNESS_U.map(() => rand());
  const offs = THICKNESS_U.map(() => rand() * 100);
  let topMax = -Infinity;
  for (let c = 0; c < cols; c++) {
    const u = faceLo + c * COLUMN_STEP;
    const wx = x + tx * u;
    const wz = z + tz * u;
    const o = c * BOUNDS;
    const top = litterTopHeight(wx, wz);
    bounds[o + B_TOP] = top;
    let y = floorHeight(wx, wz);
    bounds[o + B_F] = y;
    for (let k = 0; k < THICKNESS_U.length; k++) {
      // ...plus slow swells and a little wobble along the cut, never outside the layer's range.
      const n = 0.45 * bias[k] + 0.4 * fbm2(u * 0.45 + offs[k], k * 7.3, 3, seed + k) + 0.15 * valueNoise2(u * 2.5, offs[k], seed + 31 * k);
      const [lo, hi] = THICKNESS_U[k];
      y -= lo + (hi - lo) * Math.min(1, Math.max(0, n));
      bounds[o + B_F + 1 + k] = y;
    }
    if (top > topMax) topMax = top;
  }
  const bottom = litterTopHeight(x, z) - SLAB_DEPTH;
  return { seed, ox: x, oz: z, tx, tz, nx, nz, playLo, playHi, faceLo, faceHi, bottom, topMax, cols, bounds };
}

/** Boundary `k` (B_TOP .. B_B) at u, linear between columns (as the face draws it). */
export function boundaryAt(s: Slab, k: number, u: number): number {
  const f = Math.min(s.cols - 1, Math.max(0, (u - s.faceLo) / COLUMN_STEP));
  const c = Math.min(s.cols - 2, Math.floor(f));
  const t = f - c;
  const a = s.bounds[c * BOUNDS + k];
  const b = s.bounds[(c + 1) * BOUNDS + k];
  return a + (b - a) * t;
}

/** The layer at (u, v), or -1 above the litter top. */
export function layerAt(s: Slab, u: number, v: number): LayerId | -1 {
  if (v > boundaryAt(s, B_TOP, u)) return -1;
  // The boundary indices B_F .. B_B are the layer ids F .. B (the top of each layer).
  for (let k = B_B; k >= B_F; k--) {
    if (v <= boundaryAt(s, k, u)) return k as LayerId;
  }
  return LAYER.L;
}

/** World x, z of the slab point at u (y is v itself). */
export function slabX(s: Slab, u: number): number {
  return s.ox + s.tx * u;
}
export function slabZ(s: Slab, u: number): number {
  return s.oz + s.tz * u;
}

/** u of the world point (x, z) projected onto the cut. */
export function slabU(s: Slab, x: number, z: number): number {
  return (x - s.ox) * s.tx + (z - s.oz) * s.tz;
}
```

- [ ] **Step 4: Run the checks**

```bash
npx tsc --noEmit
npx vitest run tests/unit/slab.test.ts
npx vitest run
```

Expected: `tsc` clean; `slab.test.ts` 7 passed; the whole suite **+1 file, +7 tests** against your Plan A baseline, all passed.

- [ ] **Step 5: Commit**

```bash
git add src/underground/layers.ts src/underground/slab.ts tests/unit/slab.test.ts
git commit -m "feat(underground): the slab model with Minnesota moder layers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The soil grid

**Files:**
- Create: `src/underground/soilGrid.ts`
- Test: `tests/unit/soilGrid.test.ts`

A 160 × 120 grid of 0.1 u cells over the playable slab (spec 10), in typed arrays allocated once. Each cell holds its layer (`AIR` above the litter), whether it is open (dug), its castings (0, or how dark), whether its wall was mixed, a blocker byte and its moisture. `digDisc` opens a disc (never air or blockers), counts what it ate (and how much was leaves), and mixes a ring of wall around eaten F or H (spec 6). `castBlob` refills 70% of the open cells it covers. Every write records the rows it changed (`dirtyLo`..`dirtyHi`), so the renderer uploads only those (`takeDirty`, `packRows`). Nothing here allocates per call.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/soilGrid.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSoilGrid, fillSoilGrid, digDisc, castBlob, markSolid, packRows, takeDirty, cellAt, cellU, cellV,
  AIR, GRID_W, GRID_H, CELL, MIX_RING, SOLID_STONE, type Eaten, type SoilGrid,
} from '../../src/underground/soilGrid';
import { createSlab, boundaryAt, layerAt, B_TOP, B_F, B_H, B_A, type Slab } from '../../src/underground/slab';
import { LAYER } from '../../src/underground/layers';

const eaten: Eaten = { cells: 0, organic: 0 };
const dirty = { lo: 0, hi: 0 };
let slab: Slab;
let g: SoilGrid;

beforeEach(() => {
  slab = createSlab(0, 0, 0, 1, 77);
  g = createSoilGrid();
  fillSoilGrid(g, slab);
});

/** Depth (v) halfway down layer boundary k's layer at u. */
const mid = (k: number, u: number) => (boundaryAt(slab, k, u) + boundaryAt(slab, k + 1, u)) / 2;

describe('the soil grid (spec 10)', () => {
  it('is 160 x 120 cells of 0.1 u, filled with the slab\'s layers and air above the litter', () => {
    expect([GRID_W, GRID_H, CELL]).toEqual([160, 120, 0.1]);
    for (let r = 0; r < GRID_H; r += 7) {
      for (let c = 0; c < GRID_W; c += 9) {
        const l = layerAt(slab, cellU(c), cellV(g, r));
        expect(g.layer[r * GRID_W + c]).toBe(l < 0 ? AIR : l);
      }
    }
    expect(g.open.every((x) => x === 0)).toBe(true);
  });

  it('digDisc opens the soil within the radius only, and counts what it ate once', () => {
    const v = mid(B_A, 0);
    takeDirty(g, dirty);
    digDisc(g, 0, v, 0.15, eaten);
    expect(eaten.cells).toBeGreaterThan(5);
    expect(eaten.organic).toBe(0);
    for (let r = 0; r < GRID_H; r++) {
      for (let c = 0; c < GRID_W; c++) {
        const d = Math.hypot(cellU(c), cellV(g, r) - v);
        expect(g.open[r * GRID_W + c]).toBe(d <= 0.15 ? 1 : 0);
      }
    }
    digDisc(g, 0, v, 0.15, eaten);
    expect(eaten.cells).toBe(0);
  });

  it('tracks exactly the rows that changed', () => {
    takeDirty(g, dirty);
    expect([dirty.lo, dirty.hi]).toEqual([0, GRID_H - 1]);
    takeDirty(g, dirty);
    expect(dirty.lo).toBeGreaterThan(dirty.hi);
    const v = mid(B_A, 2);
    digDisc(g, 2, v, 0.14, eaten);
    takeDirty(g, dirty);
    const rows = new Set<number>();
    for (let i = 0; i < g.open.length; i++) if (g.open[i]) rows.add(Math.floor(i / GRID_W));
    expect(dirty.lo).toBe(Math.min(...rows));
    expect(dirty.hi).toBe(Math.max(...rows));
  });

  it('never digs air or blockers', () => {
    const top = boundaryAt(slab, B_TOP, -3);
    digDisc(g, -3, top + 0.05, 0.14, eaten);
    for (let i = 0; i < g.open.length; i++) if (g.layer[i] === AIR) expect(g.open[i]).toBe(0);
    const v = mid(B_A, 4);
    markSolid(g, 4, v, 0.3, SOLID_STONE);
    digDisc(g, 4, v, 0.2, eaten);
    expect(eaten.cells).toBe(0);
  });

  it('mixes the walls where it eats F or H, not in mineral soil (spec 6)', () => {
    const vf = mid(B_F, -5);
    digDisc(g, -5, vf, 0.14, eaten);
    expect(eaten.organic).toBe(eaten.cells);
    let ring = 0;
    for (let i = 0; i < g.mixed.length; i++) {
      if (!g.mixed[i]) continue;
      ring++;
      const d = Math.hypot(cellU(i % GRID_W) + 5, cellV(g, Math.floor(i / GRID_W)) - vf);
      expect(d).toBeGreaterThan(0.14 - 1e-9);
      expect(d).toBeLessThanOrEqual(0.14 + MIX_RING + 1e-9);
      expect(g.open[i]).toBe(0);
    }
    expect(ring).toBeGreaterThan(8);
    const before = g.mixed.reduce((a, b) => a + b, 0);
    digDisc(g, 5, mid(B_A, 5), 0.14, eaten);
    expect(g.mixed.reduce((a, b) => a + b, 0)).toBe(before);
    expect(g.layer[cellAt(g, -5, mid(B_H, -5))]).toBe(LAYER.H);
  });

  it('a casting partly refills the tunnel, and eating it opens it again', () => {
    const v = mid(B_A, 1);
    for (let u = 0; u <= 2; u += 0.05) digDisc(g, u, v, 0.14, eaten);
    const open = () => g.open.reduce((a, b, i) => a + (b && !g.cast[i] ? 1 : 0), 0);
    const before = open();
    castBlob(g, 1, v, 0.14, 200);
    const filled = before - open();
    let covered = 0;
    for (let i = 0; i < g.open.length; i++) {
      if (Math.hypot(cellU(i % GRID_W) - 1, cellV(g, Math.floor(i / GRID_W)) - v) <= 0.14 && g.open[i]) covered++;
    }
    expect(filled).toBeGreaterThan(0.5 * covered);
    expect(filled).toBeLessThan(covered);
    digDisc(g, 1, v, 0.14, eaten);
    expect(open()).toBe(before);
  });

  it('packs rows as RGBA: open, castings, mixed, damp', () => {
    const bytes = new Uint8Array(GRID_W * GRID_H * 4);
    const v = mid(B_H, 0);
    digDisc(g, 0, v, 0.14, eaten);
    packRows(g, bytes, 0, GRID_H - 1);
    const i = cellAt(g, 0, v);
    expect(bytes[i * 4]).toBe(255);
    expect(bytes[i * 4 + 3]).toBe(g.damp[i]);
    const wall = g.mixed.findIndex((x) => x === 1);
    expect(bytes[wall * 4 + 2]).toBe(255);
    // Damper in F than in the mineral soil below.
    expect(g.damp[cellAt(g, 3, mid(B_F, 3))]).toBeGreaterThan(g.damp[cellAt(g, 3, mid(B_A, 3))]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/unit/soilGrid.test.ts`
Expected: FAIL, "Failed to resolve import ../../src/underground/soilGrid".

- [ ] **Step 3: Implement**

Create `src/underground/soilGrid.ts`:

```ts
import { LAYER, isOrganic, type LayerId } from './layers';
import { layerAt, SLAB_HALF, SLAB_DEPTH, type Slab } from './slab';

/**
 * The soil of one slab as a grid of 0.1 u cells (V2 spec 10): 160 across the playable 16 u and
 * 120 down its 12 u. Typed arrays only: built once, refilled for each new slab, never resized.
 * Rows that change are tracked so the renderer uploads only those (cutFace.ts).
 */
export const CELL = 0.1;
export const GRID_W = Math.round((2 * SLAB_HALF) / CELL);
export const GRID_H = Math.round(SLAB_DEPTH / CELL);
/** Layer byte of a cell above the litter top: nothing to dig. */
export const AIR = 255;
/** solid byte: a stone, a big root (both block the worm). */
export const SOLID_STONE = 1;
export const SOLID_ROOT = 2;
/** Moisture (0..255) by layer at the start (spec 5.1: F damp; drier mineral soil below). */
const DAMP: Readonly<Record<LayerId, number>> = { 0: 90, 1: 210, 2: 180, 3: 130, 4: 100, 5: 90 };
/** Walls this far beyond an eaten F or H cell turn darker and crumbly (spec 6, mixing). */
export const MIX_RING = 0.12;
/** A casting refills this share of the tunnel cells it covers (spec 6: "partly refills"). */
const CAST_FILL = 0.7;

export interface SoilGrid {
  /** Layer per cell (LAYER ids), AIR above the litter. */
  readonly layer: Uint8Array;
  /** 1 where the worm has eaten an open tunnel. */
  readonly open: Uint8Array;
  /** Castings: 0 none, else how dark (more organic food, darker). */
  readonly cast: Uint8Array;
  /** 1 where tunnel walls were mixed (eaten through F or H): darker, crumbly. */
  readonly mixed: Uint8Array;
  /** SOLID_STONE or SOLID_ROOT where a blocker lies, else 0. */
  readonly solid: Uint8Array;
  /** Moisture 0..255. */
  readonly damp: Uint8Array;
  /** World height of the bottom row's lower edge (the slab's bottom). */
  v0: number;
  /** Rows changed since takeDirty (dirtyLo > dirtyHi: none). */
  dirtyLo: number;
  dirtyHi: number;
}

/** What digDisc ate. */
export interface Eaten {
  /** Cells newly opened. */
  cells: number;
  /** Of those, cells of litter, F or H (leaves at some stage). */
  organic: number;
}

export function createSoilGrid(): SoilGrid {
  const n = GRID_W * GRID_H;
  return {
    layer: new Uint8Array(n), open: new Uint8Array(n), cast: new Uint8Array(n),
    mixed: new Uint8Array(n), solid: new Uint8Array(n), damp: new Uint8Array(n),
    v0: 0, dirtyLo: 0, dirtyHi: GRID_H - 1,
  };
}

/** Column and row of (u, v), unclamped. */
export const colOf = (u: number): number => Math.floor((u + SLAB_HALF) / CELL);
export const rowOf = (g: SoilGrid, v: number): number => Math.floor((v - g.v0) / CELL);
/** Centre of a cell. */
export const cellU = (c: number): number => -SLAB_HALF + (c + 0.5) * CELL;
export const cellV = (g: SoilGrid, r: number): number => g.v0 + (r + 0.5) * CELL;

/** A fresh slab: layers from the slab, nothing dug, no castings or blockers, every row dirty. */
export function fillSoilGrid(g: SoilGrid, s: Slab): void {
  g.v0 = s.bottom;
  g.open.fill(0);
  g.cast.fill(0);
  g.mixed.fill(0);
  g.solid.fill(0);
  for (let r = 0; r < GRID_H; r++) {
    const v = cellV(g, r);
    for (let c = 0; c < GRID_W; c++) {
      const i = r * GRID_W + c;
      const l = layerAt(s, cellU(c), v);
      if (l === -1) {
        g.layer[i] = AIR;
        g.damp[i] = 0;
      } else {
        g.layer[i] = l;
        g.damp[i] = DAMP[l];
      }
    }
  }
  g.dirtyLo = 0;
  g.dirtyHi = GRID_H - 1;
}

function touch(g: SoilGrid, r: number): void {
  if (r < g.dirtyLo) g.dirtyLo = r;
  if (r > g.dirtyHi) g.dirtyHi = r;
}

/** The dirty row range [lo, hi] into out (lo > hi when none), then clears it. */
export function takeDirty(g: SoilGrid, out: { lo: number; hi: number }): { lo: number; hi: number } {
  out.lo = g.dirtyLo;
  out.hi = g.dirtyHi;
  g.dirtyLo = GRID_H;
  g.dirtyHi = -1;
  return out;
}

/** The cell index at (u, v), or -1 outside the grid. */
export function cellAt(g: SoilGrid, u: number, v: number): number {
  const c = colOf(u);
  const r = rowOf(g, v);
  return c < 0 || c >= GRID_W || r < 0 || r >= GRID_H ? -1 : r * GRID_W + c;
}

/** A fixed 0..1 value per cell (for granular fills); deterministic. */
function cellHash(i: number): number {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Eats a disc of radius r at (u, v): every soil cell inside (not air, not a blocker) opens, and
 * castings there are eaten too. Where it eats F or H the walls around (out to MIX_RING) are
 * mixed. Writes what it ate into `out`. Allocates nothing.
 */
export function digDisc(g: SoilGrid, u: number, v: number, r: number, out: Eaten): Eaten {
  out.cells = 0;
  out.organic = 0;
  let mixing = false;
  const c0 = Math.max(0, colOf(u - r));
  const c1 = Math.min(GRID_W - 1, colOf(u + r));
  const r0 = Math.max(0, rowOf(g, v - r));
  const r1 = Math.min(GRID_H - 1, rowOf(g, v + r));
  for (let row = r0; row <= r1; row++) {
    const dv = cellV(g, row) - v;
    let changed = false;
    for (let c = c0; c <= c1; c++) {
      const du = cellU(c) - u;
      if (du * du + dv * dv > r * r) continue;
      const i = row * GRID_W + c;
      const l = g.layer[i];
      if (l === AIR || g.solid[i] !== 0 || (g.open[i] && !g.cast[i])) continue;
      if (!g.open[i]) {
        out.cells++;
        if (isOrganic(l as LayerId)) out.organic++;
        if (l === LAYER.F || l === LAYER.H) mixing = true;
      }
      g.open[i] = 1;
      g.cast[i] = 0;
      changed = true;
    }
    if (changed) touch(g, row);
  }
  if (mixing) mixRing(g, u, v, r);
  return out;
}

/** Marks the not-yet-open soil around a disc as mixed (darker, crumbly walls). */
function mixRing(g: SoilGrid, u: number, v: number, r: number): void {
  const R = r + MIX_RING;
  const c0 = Math.max(0, colOf(u - R));
  const c1 = Math.min(GRID_W - 1, colOf(u + R));
  const r0 = Math.max(0, rowOf(g, v - R));
  const r1 = Math.min(GRID_H - 1, rowOf(g, v + R));
  for (let row = r0; row <= r1; row++) {
    const dv = cellV(g, row) - v;
    let changed = false;
    for (let c = c0; c <= c1; c++) {
      const du = cellU(c) - u;
      const d2 = du * du + dv * dv;
      if (d2 > R * R) continue;
      const i = row * GRID_W + c;
      if (g.open[i] || g.mixed[i] || g.layer[i] === AIR || g.solid[i]) continue;
      g.mixed[i] = 1;
      changed = true;
    }
    if (changed) touch(g, row);
  }
}

/**
 * Leaves a casting of radius r at (u, v) (spec 6): a granular blob that partly refills the
 * tunnel. `shade` 1..255: how dark (organic food makes darker casts). Allocates nothing.
 */
export function castBlob(g: SoilGrid, u: number, v: number, r: number, shade: number): void {
  const c0 = Math.max(0, colOf(u - r));
  const c1 = Math.min(GRID_W - 1, colOf(u + r));
  const r0 = Math.max(0, rowOf(g, v - r));
  const r1 = Math.min(GRID_H - 1, rowOf(g, v + r));
  const s = Math.max(1, Math.min(255, Math.round(shade)));
  for (let row = r0; row <= r1; row++) {
    const dv = cellV(g, row) - v;
    let changed = false;
    for (let c = c0; c <= c1; c++) {
      const du = cellU(c) - u;
      if (du * du + dv * dv > r * r) continue;
      const i = row * GRID_W + c;
      if (!g.open[i] || g.cast[i] || cellHash(i) >= CAST_FILL) continue;
      g.cast[i] = s;
      changed = true;
    }
    if (changed) touch(g, row);
  }
}

/** Marks a blocker's cells (a disc) so they are never dug. */
export function markSolid(g: SoilGrid, u: number, v: number, r: number, kind: number): void {
  const c0 = Math.max(0, colOf(u - r));
  const c1 = Math.min(GRID_W - 1, colOf(u + r));
  const r0 = Math.max(0, rowOf(g, v - r));
  const r1 = Math.min(GRID_H - 1, rowOf(g, v + r));
  for (let row = r0; row <= r1; row++) {
    const dv = cellV(g, row) - v;
    for (let c = c0; c <= c1; c++) {
      const du = cellU(c) - u;
      if (du * du + dv * dv <= r * r) g.solid[row * GRID_W + c] = kind;
    }
  }
}

/** Raises the moisture of soil within r of (u, v) by `add` (damp under stones and logs). */
export function dampen(g: SoilGrid, u: number, v: number, r: number, add: number): void {
  const c0 = Math.max(0, colOf(u - r));
  const c1 = Math.min(GRID_W - 1, colOf(u + r));
  const r0 = Math.max(0, rowOf(g, v - r));
  const r1 = Math.min(GRID_H - 1, rowOf(g, v + r));
  for (let row = r0; row <= r1; row++) {
    const dv = cellV(g, row) - v;
    for (let c = c0; c <= c1; c++) {
      const du = cellU(c) - u;
      const d2 = du * du + dv * dv;
      if (d2 > r * r) continue;
      const i = row * GRID_W + c;
      if (g.layer[i] !== AIR) g.damp[i] = Math.min(255, g.damp[i] + Math.round(add * (1 - Math.sqrt(d2) / r)));
    }
  }
}

/**
 * Packs rows lo..hi into RGBA bytes for the face's data texture: R open, G castings, B mixed,
 * A moisture. Allocates nothing.
 */
export function packRows(g: SoilGrid, bytes: Uint8Array, lo: number, hi: number): void {
  for (let r = Math.max(0, lo); r <= Math.min(GRID_H - 1, hi); r++) {
    for (let c = 0; c < GRID_W; c++) {
      const i = r * GRID_W + c;
      const o = i * 4;
      bytes[o] = g.open[i] && !g.cast[i] ? 255 : 0;
      bytes[o + 1] = g.cast[i];
      bytes[o + 2] = g.mixed[i] ? 255 : 0;
      bytes[o + 3] = g.damp[i];
    }
  }
}
```

- [ ] **Step 4: Run the checks**

```bash
npx tsc --noEmit
npx vitest run tests/unit/soilGrid.test.ts
npx vitest run
```

Expected: 7 passed; the suite **+2 files, +14 tests** against the baseline.

- [ ] **Step 5: Commit**

```bash
git add src/underground/soilGrid.ts tests/unit/soilGrid.test.ts
git commit -m "feat(underground): the soil grid with tunnels, castings, mixing and dirty rows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Stones, big roots and what the cut passes through

**Files:**
- Create: `src/underground/solids.ts`
- Test: `tests/unit/solids.test.ts`

Blockers in the slab (spec 5.2), placed from the slab's seed into preallocated arrays: 6–10 stones in A, E and B, never touching each other or a root; 2–3 big roots from the nearest trunk (from `footprints()`: a round footprint with an infinite top is a trunk), running through H, A and E, or one from a slab end when no trunk is within 14 u; and where the cut passes through a surface rock or the log (the footprints again), a section stone or a log section. `solidDepth`/`pushOutSolids` are collide-and-slide on circles and tapering capsules, as V1's `obstacleDepth`/`pushOut`. `markSolids` writes them into the grid (never dug) and dampens the soil under stones and the log.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/solids.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createSolids, placeSolids, pushOutSolids, solidDepth, markSolids, STONE_STRIDE, ROOT_STRIDE, type Solids,
} from '../../src/underground/solids';
import { createSlab, boundaryAt, B_A, B_F } from '../../src/underground/slab';
import { createSoilGrid, fillSoilGrid, digDisc, SOLID_STONE } from '../../src/underground/soilGrid';
import { footprints } from '../../src/surface/obstacles';

const SPOTS: [number, number, number][] = [[0, 0, 0], [4, -6, 1.2], [-9, 3, 2.6], [12, 11, -0.8], [-3, 14, 0.2], [6, 15.5, 0]];
const hit = { nu: 0, nv: 0 };

function solidsAt(x: number, z: number, h: number, seed = 9): { o: Solids; s: ReturnType<typeof createSlab> } {
  const s = createSlab(x, z, h, 1, seed);
  return { o: placeSolids(s, createSolids()), s };
}

describe('stones and roots in the slab (spec 5.2)', () => {
  it('stones lie in the mineral soil (A, E, B), apart from each other, and the same every time', () => {
    for (const [x, z, h] of SPOTS) {
      const { o, s } = solidsAt(x, z, h);
      const again = placeSolids(s, createSolids());
      expect(Array.from(again.stones)).toEqual(Array.from(o.stones));
      let buried = 0;
      for (let i = 0; i < o.stoneCount; i++) {
        const k = i * STONE_STRIDE;
        if (o.stones[k + 7] === 1) continue; // a cut surface rock
        buried++;
        const [u, v, r] = [o.stones[k], o.stones[k + 1], o.stones[k + 2]];
        expect(v + r).toBeLessThan(boundaryAt(s, B_A, u));
        expect(v - r).toBeGreaterThan(s.bottom);
        expect(u).toBeGreaterThan(s.playLo);
        expect(u).toBeLessThan(s.playHi);
        for (let j = 0; j < i; j++) {
          const q = j * STONE_STRIDE;
          if (o.stones[q + 7] === 1) continue;
          expect(Math.hypot(u - o.stones[q], v - o.stones[q + 1])).toBeGreaterThan(r + o.stones[q + 2]);
        }
      }
      expect(buried).toBeGreaterThanOrEqual(4);
    }
  });

  it('big roots run below the fine-root mat of F and toward the nearest trunk', () => {
    for (const [x, z, h] of SPOTS) {
      const { o, s } = solidsAt(x, z, h);
      expect(o.rootCount).toBeGreaterThan(3);
      for (let i = 0; i < o.rootCount; i++) {
        const k = i * ROOT_STRIDE;
        expect(o.roots[k + 4]).toBeLessThan(boundaryAt(s, B_F, o.roots[k + 3]));
        expect(o.roots[k + 5]).toBeGreaterThanOrEqual(0.05);
      }
      // The first root starts at, or enters from the side of, the nearest trunk.
      const { round } = footprints();
      let best = Infinity;
      let side = 0;
      for (let k = 0; k < round.length; k += 4) {
        if (round[k + 3] !== Infinity) continue;
        const d = Math.abs((round[k] - s.ox) * s.nx + (round[k + 1] - s.oz) * s.nz);
        if (d < best) { best = d; side = (round[k] - s.ox) * s.tx + (round[k + 1] - s.oz) * s.tz; }
      }
      if (best < 14 && (side < s.playLo || side > s.playHi)) expect(Math.sign(o.roots[0])).toBe(Math.sign(side));
    }
  });

  it('the worm is pushed straight out of a stone and slides along it', () => {
    const { o } = solidsAt(0, 0, 0);
    // A buried stone (not a cut surface rock).
    let i = 0;
    while (o.stones[i * STONE_STRIDE + 7] === 1) i++;
    const [u, v, r] = o.stones.subarray(i * STONE_STRIDE, i * STONE_STRIDE + 3);
    const p = { u: u + 0.05, v: v + 0.02 };
    pushOutSolids(o, p, 0.13);
    expect(solidDepth(o, p.u, p.v, 0.13, hit)).toBeLessThanOrEqual(1e-9);
    // Walking straight at it at a slant: it never goes in, and it keeps moving along the edge.
    const q = { u: u - r - 1, v: v + 0.3 };
    let moved = 0;
    for (let s = 0; s < 120; s++) {
      const bu = q.u;
      const bv = q.v;
      q.u += 0.02;
      q.v -= 0.004;
      pushOutSolids(o, q, 0.13);
      expect(solidDepth(o, q.u, q.v, 0.13, hit)).toBeLessThanOrEqual(1e-6);
      moved += Math.hypot(q.u - bu, q.v - bv);
    }
    expect(moved).toBeGreaterThan(1);
  });

  it('blockers are marked in the grid and never dug', () => {
    const { o, s } = solidsAt(4, -6, 1.2);
    const g = createSoilGrid();
    fillSoilGrid(g, s);
    markSolids(g, o);
    const eaten = { cells: 0, organic: 0 };
    digDisc(g, o.stones[0], o.stones[1], 0.1, eaten);
    expect(eaten.cells).toBe(0);
    expect(g.solid.some((x) => x === SOLID_STONE)).toBe(true);
  });

  it('the cut through the log shows as a section where the slab crosses it', () => {
    const { log } = footprints();
    // Dig beside the log, heading straight across it.
    const x = log.x + log.dx * 2 - log.dz * (log.r + 3);
    const z = log.z + log.dz * 2 + log.dx * (log.r + 3);
    const heading = Math.atan2(log.dz, -log.dx) + Math.PI;
    const s = createSlab(x, z, heading, 1, 1);
    const o = placeSolids(s, createSolids());
    const across = Math.abs(log.dx * s.tz - log.dz * s.tx) > 0.25;
    expect(across).toBe(true);
    expect(o.log.rx).toBeGreaterThan(0);
    expect(Math.abs(o.log.u)).toBeLessThan(log.r + 4);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/unit/solids.test.ts`
Expected: FAIL, "Failed to resolve import ../../src/underground/solids".

- [ ] **Step 3: Implement**

Create `src/underground/solids.ts`:

```ts
import { mulberry32 } from '../core/random';
import { valueNoise2 } from '../core/noise';
import { footprints, LOG_FOOT } from '../surface/obstacles';
import { boundaryAt, slabU, B_F, B_H, B_A, B_E, type Slab } from './slab';
import { dampen, markSolid, SOLID_ROOT, SOLID_STONE, type SoilGrid } from './soilGrid';

/**
 * What blocks the worm in a slab (V2 spec 5.2): stones in the mineral soil, big roots from the
 * nearest trunk, and the cut-through parts of surface rocks and the log. Fine roots are only drawn
 * (the worm passes through them). The worm slides along blockers: collide-and-slide, as V1's props.
 * Pure, deterministic per slab seed; fills preallocated arrays.
 */
export const MAX_STONES = 16;
/** Floats per stone: u, v, radius (collision), x scale, y scale, rotation, shade 0..1, section (1: a cut surface rock). */
export const STONE_STRIDE = 8;
export const MAX_ROOT_SEGS = 40;
/** Floats per root segment: u0, v0, r0, u1, v1, r1. */
export const ROOT_STRIDE = 6;

export interface Solids {
  readonly stones: Float32Array;
  stoneCount: number;
  readonly roots: Float32Array;
  rootCount: number;
  /** The cut through the log, if the slab crosses it: centre (u, v), radii (x along the cut, y). rx 0: none. */
  readonly log: { u: number; v: number; rx: number; ry: number };
}

export function createSolids(): Solids {
  return {
    stones: new Float32Array(MAX_STONES * STONE_STRIDE), stoneCount: 0,
    roots: new Float32Array(MAX_ROOT_SEGS * ROOT_STRIDE), rootCount: 0,
    log: { u: 0, v: 0, rx: 0, ry: 0 },
  };
}

function addStone(o: Solids, u: number, v: number, r: number, sx: number, sy: number, rot: number, shade: number, section: number): void {
  if (o.stoneCount >= MAX_STONES) return;
  const s = o.stones;
  const k = o.stoneCount++ * STONE_STRIDE;
  s[k] = u; s[k + 1] = v; s[k + 2] = r; s[k + 3] = sx; s[k + 4] = sy; s[k + 5] = rot; s[k + 6] = shade; s[k + 7] = section;
}

/** Distance from (u, v) to the nearest blocker's surface (negative inside). */
function clearance(o: Solids, u: number, v: number): number {
  let best = Infinity;
  for (let i = 0; i < o.stoneCount; i++) {
    const k = i * STONE_STRIDE;
    best = Math.min(best, Math.hypot(u - o.stones[k], v - o.stones[k + 1]) - o.stones[k + 2]);
  }
  for (let i = 0; i < o.rootCount; i++) {
    best = Math.min(best, segDist(o.roots, i * ROOT_STRIDE, u, v, null));
  }
  return best;
}

/** Signed distance from (u, v) to root segment at k (its radius tapering along it); `n` gets the way out. */
function segDist(r: Float32Array, k: number, u: number, v: number, n: { nu: number; nv: number } | null): number {
  const au = r[k];
  const av = r[k + 1];
  const eu = r[k + 3] - au;
  const ev = r[k + 4] - av;
  const t = Math.max(0, Math.min(1, ((u - au) * eu + (v - av) * ev) / Math.max(1e-9, eu * eu + ev * ev)));
  const du = u - (au + eu * t);
  const dv = v - (av + ev * t);
  const d = Math.hypot(du, dv);
  if (n) {
    if (d > 1e-9) { n.nu = du / d; n.nv = dv / d; } else { n.nu = -ev; n.nv = eu; }
  }
  return d - (r[k + 2] + (r[k + 5] - r[k + 2]) * t);
}

/** Places the slab's blockers (deterministic per slab seed). */
export function placeSolids(s: Slab, o: Solids): Solids {
  o.stoneCount = 0;
  o.rootCount = 0;
  o.log.rx = 0;
  const rand = mulberry32(s.seed ^ 0x5f3759df);
  placeRoots(s, o, rand);
  sectionProps(s, o);
  // Stones in the mineral soil (A, E, B): more small than big, never touching each other or a root.
  const want = 6 + Math.floor(rand() * 5);
  for (let tries = 0, placed = 0; placed < want && tries < 300; tries++) {
    const r = 0.12 + 0.43 * rand() * rand();
    const u = s.playLo + 0.6 + rand() * (s.playHi - s.playLo - 1.2);
    const top = boundaryAt(s, B_A, u) - 0.15 - r;
    const lo = s.bottom + 0.6 + r;
    if (top <= lo) continue;
    const v = lo + rand() * (top - lo);
    if (clearance(o, u, v) < r + 0.3) continue;
    const squash = 0.8 + 0.2 * rand();
    addStone(o, u, v, r, rand() < 0.5 ? 1 : squash, rand() < 0.5 ? squash : 1, rand() * Math.PI, rand(), 0);
    placed++;
  }
  return o;
}

/** Big roots from the nearest trunk (spec 5.2): 2-3 when it stands near the slab, else one thinner root. */
function placeRoots(s: Slab, o: Solids, rand: () => number): void {
  const { round } = footprints();
  let best = Infinity;
  let ut = 0;
  for (let k = 0; k < round.length; k += 4) {
    if (round[k + 3] !== Infinity) continue; // rocks have a finite top; trunks do not
    const d = Math.abs((round[k] - s.ox) * s.nx + (round[k + 1] - s.oz) * s.nz);
    if (d < best) {
      best = d;
      ut = slabU(s, round[k], round[k + 1]);
    }
  }
  const near = Math.max(0, 1 - best / 14);
  const count = near > 0 ? 2 + Math.floor(rand() * 2) : 1;
  const from = near > 0 ? ut : rand() < 0.5 ? s.playLo - 1 : s.playHi + 1;
  for (let n = 0; n < count && o.rootCount < MAX_ROOT_SEGS - 10; n++) {
    // Start at the trunk if it stands over the slab, else where the root enters the slab's end.
    const inside = from > s.playLo && from < s.playHi;
    let u = inside ? from : from < 0 ? s.playLo - 0.4 : s.playHi + 0.4;
    const dir = inside ? (rand() < 0.5 ? -1 : 1) : from < 0 ? 1 : -1;
    // Big roots run through H, A and E (below the dense fine roots of F).
    let v = boundaryAt(s, B_H, u) - 0.15 - rand() * (boundaryAt(s, B_H, u) - boundaryAt(s, B_E, u)) * (inside ? 0.3 : 0.8);
    let r = 0.12 + 0.14 * near + 0.05 * rand();
    let slope = -0.15 - 0.35 * rand();
    const segs = 7 + Math.floor(rand() * 4);
    for (let i = 0; i < segs && o.rootCount < MAX_ROOT_SEGS; i++) {
      const len = 0.7 + 0.3 * rand();
      const wob = (valueNoise2(i * 0.7, n * 3.1, s.seed + 17) - 0.5) * 0.9;
      const nu = u + dir * len;
      const floor = boundaryAt(s, B_F, nu) - 0.35;
      let nv = v + (slope + wob) * len;
      nv = Math.min(floor, Math.max(s.bottom + 1, nv));
      const nr = Math.max(0.06, r * 0.9);
      const k = o.rootCount++ * ROOT_STRIDE;
      o.roots[k] = u; o.roots[k + 1] = v; o.roots[k + 2] = r;
      o.roots[k + 3] = nu; o.roots[k + 4] = nv; o.roots[k + 5] = nr;
      u = nu; v = nv; r = nr;
      slope *= 0.8;
      if (u < s.playLo - 1 || u > s.playHi + 1) break;
    }
  }
}

/** Surface rocks and the log that the cut passes through show in section (spec 5.2). */
function sectionProps(s: Slab, o: Solids): void {
  const { round, log } = footprints();
  for (let k = 0; k < round.length; k += 4) {
    if (round[k + 3] === Infinity) continue;
    const d = Math.abs((round[k] - s.ox) * s.nx + (round[k + 1] - s.oz) * s.nz);
    const R = round[k + 2];
    if (d >= R * 0.9) continue;
    const u = slabU(s, round[k], round[k + 1]);
    if (u < s.faceLo || u > s.faceHi) continue;
    const rx = 0.85 * Math.sqrt(R * R - d * d);
    addStone(o, u, boundaryAt(s, B_F, u) - 0.15 * rx, rx, 1, 0.75, 0, 0.5, 1);
  }
  // The log: where the cut line crosses its axis, if not nearly parallel to it.
  const sin = log.dx * s.tz - log.dz * s.tx;
  if (Math.abs(sin) < 0.25) return;
  // Solve o + t u = log + a w for u (cut) and a (along the log).
  const px = log.x - s.ox;
  const pz = log.z - s.oz;
  const u = (px * log.dz - pz * log.dx) / -sin;
  const a = (px * s.tz - pz * s.tx) / -sin;
  const radius = log.r / LOG_FOOT;
  if (Math.abs(a) > log.half || u < s.faceLo || u > s.faceHi) return;
  o.log.u = u;
  o.log.rx = Math.min(3 * radius, radius / Math.abs(sin));
  o.log.ry = radius;
  o.log.v = boundaryAt(s, B_F, u) + 0.7 * radius;
}

/** Scratch for pushOutSolids. */
const hit = { nu: 0, nv: 0 };
const segHit = { nu: 0, nv: 0 };

/**
 * How far (u, v) lies inside the deepest blocker grown by `pad` (0 or less: clear), with the way
 * straight out in `out`. The log's section counts as a disc of its smaller radius. Allocates nothing.
 */
export function solidDepth(o: Solids, u: number, v: number, pad: number, out: { nu: number; nv: number }): number {
  let best = -Infinity;
  for (let i = 0; i < o.stoneCount; i++) {
    const k = i * STONE_STRIDE;
    const du = u - o.stones[k];
    const dv = v - o.stones[k + 1];
    const d = Math.hypot(du, dv);
    const into = o.stones[k + 2] + pad - d;
    if (into > best) {
      best = into;
      if (d > 1e-9) { out.nu = du / d; out.nv = dv / d; } else { out.nu = 0; out.nv = 1; }
    }
  }
  for (let i = 0; i < o.rootCount; i++) {
    const into = pad - segDist(o.roots, i * ROOT_STRIDE, u, v, segHit);
    if (into > best) {
      best = into;
      out.nu = segHit.nu;
      out.nv = segHit.nv;
    }
  }
  if (o.log.rx > 0) {
    const du = u - o.log.u;
    const dv = v - o.log.v;
    const d = Math.hypot(du, dv);
    const into = Math.min(o.log.rx, o.log.ry) + pad - d;
    if (into > best) {
      best = into;
      if (d > 1e-9) { out.nu = du / d; out.nv = dv / d; } else { out.nu = 0; out.nv = -1; }
    }
  }
  return best;
}

/**
 * Moves (u, v) straight out of any blocker grown by `radius`, deepest first, a few times for
 * blockers that touch: a head pushed into a stone slides along it. Returns the distance moved.
 */
export function pushOutSolids(o: Solids, p: { u: number; v: number }, radius: number): number {
  let moved = 0;
  for (let k = 0; k < 4; k++) {
    const into = solidDepth(o, p.u, p.v, radius, hit);
    if (!(into > 0)) break;
    p.u += hit.nu * into;
    p.v += hit.nv * into;
    moved += into;
  }
  return moved;
}

/** Writes the blockers into the grid (never dug) and dampens the soil under stones and the log. */
export function markSolids(g: SoilGrid, o: Solids): void {
  for (let i = 0; i < o.stoneCount; i++) {
    const k = i * STONE_STRIDE;
    const u = o.stones[k];
    const v = o.stones[k + 1];
    const r = o.stones[k + 2];
    markSolid(g, u, v, r, SOLID_STONE);
    dampen(g, u, v - r * 0.6, r + 0.35, 70);
  }
  for (let i = 0; i < o.rootCount; i++) {
    const k = i * ROOT_STRIDE;
    for (let t = 0; t <= 1; t += 0.1) {
      const r = o.roots[k + 2] + (o.roots[k + 5] - o.roots[k + 2]) * t;
      markSolid(g, o.roots[k] + (o.roots[k + 3] - o.roots[k]) * t, o.roots[k + 1] + (o.roots[k + 4] - o.roots[k + 1]) * t, r, SOLID_ROOT);
    }
  }
  if (o.log.rx > 0) dampen(g, o.log.u, o.log.v - o.log.ry, o.log.rx + 0.5, 90);
}
```

- [ ] **Step 4: Run the checks**

```bash
npx tsc --noEmit
npx vitest run tests/unit/solids.test.ts
npx vitest run
```

Expected: 5 passed; the suite **+3 files, +19 tests**.

- [ ] **Step 5: Commit**

```bash
git add src/underground/solids.ts tests/unit/solids.test.ts
git commit -m "feat(underground): stones, big roots, and rocks and the log in section" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Where the worm may dig, and which side the camera looks from

**Files:**
- Create: `src/underground/digSpot.ts`
- Test: `tests/unit/digSpot.test.ts`

`canDigAt(x, z)`: open ground only, not within 0.5 u of a trunk, rock or log footprint (`obstacleDepth`), and not within 2.5 u of the play edge (spec 4.1). `chooseSide(x, z, heading)`: the cut has two sides; the camera stands on the one whose view of the cut is clearest of footprints (trunks count 4 times) and keeps it inside the world; on a tie, the sun's side. The choice depends only on the world side, not on which way along the cut the worm faces.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/digSpot.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { canDigAt, chooseSide, DIG_EDGE } from '../../src/underground/digSpot';
import { footprints } from '../../src/surface/obstacles';
import { PLAY_HALF } from '../../src/surface/terrain';

describe('where the worm may dig down (spec 4.1)', () => {
  it('on open ground, such as the spawn', () => {
    expect(canDigAt(0, 0)).toBe(true);
    expect(canDigAt(0, 3)).toBe(true);
  });

  it('never on a trunk, rock or log footprint, or just beside one', () => {
    const { round, log } = footprints();
    for (let k = 0; k < round.length; k += 4) {
      expect(canDigAt(round[k], round[k + 1])).toBe(false);
      expect(canDigAt(round[k] + round[k + 2] + 0.3, round[k + 1])).toBe(false);
    }
    for (const a of [-0.9, -0.3, 0, 0.4]) {
      const x = log.x + log.dx * log.half * a;
      const z = log.z + log.dz * log.half * a;
      if (Math.abs(x) < PLAY_HALF - DIG_EDGE && Math.abs(z) < PLAY_HALF - DIG_EDGE) expect(canDigAt(x, z)).toBe(false);
    }
  });

  it('not at the play edge', () => {
    expect(canDigAt(PLAY_HALF - 1, 0)).toBe(false);
    expect(canDigAt(0, -(PLAY_HALF - 0.5))).toBe(false);
  });
});

describe('the camera side', () => {
  it('looks from the side with no trunk in the way', () => {
    const { round } = footprints();
    let tested = 0;
    for (let k = 0; k < round.length; k += 4) {
      if (round[k + 3] !== Infinity) continue;
      // Dig 4 units beside a trunk, heading so the trunk is on the +1 side's front.
      const r = round[k + 2];
      for (const heading of [0, Math.PI / 2, 2]) {
        const tx = Math.sin(heading);
        const tz = Math.cos(heading);
        const x = round[k] - tz * (r + 3);
        const z = round[k + 1] + tx * (r + 3);
        if (!canDigAt(x, z)) continue;
        expect(chooseSide(x, z, heading)).toBe(-1);
        tested++;
      }
    }
    expect(tested).toBeGreaterThan(0);
  });

  it('picks the same world side whichever way along the cut the worm faces', () => {
    for (const [x, z, h] of [[0, 0, 0], [5, -4, 1], [-8, 6, 2.5]]) {
      const a = chooseSide(x, z, h);
      expect(chooseSide(x, z, h + Math.PI)).toBe(-a);
    }
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/unit/digSpot.test.ts`
Expected: FAIL, "Failed to resolve import ../../src/underground/digSpot".

- [ ] **Step 3: Implement**

Create `src/underground/digSpot.ts`:

```ts
import { footprints, obstacleDepth, type ObstacleHit } from '../surface/obstacles';
import { PLAY_HALF, WORLD_HALF } from '../surface/terrain';

/**
 * Where the worm may dig down, and which side of the cut the camera looks from (V2 spec 4.1).
 * Pure; allocates nothing per call.
 */

/** The dig point keeps this far off every trunk, rock and log footprint (more than a body width)... */
export const DIG_PAD = 0.5;
/** ...and this far inside the worm's play area: not at the play edge. */
export const DIG_EDGE = 2.5;
/** The region in front of the cut that a camera side should find clear: u span, and depth range. */
const FRONT_HALF = 12;
const FRONT_NEAR = 0.3;
const FRONT_FAR = 11;

const hit: ObstacleHit = { nx: 0, nz: 0 };

/** True where the worm may dig down: open ground, not on a footprint, not at the play edge. */
export function canDigAt(x: number, z: number): boolean {
  if (Math.abs(x) > PLAY_HALF - DIG_EDGE || Math.abs(z) > PLAY_HALF - DIG_EDGE) return false;
  return !(obstacleDepth(x, z, DIG_PAD, hit) > 0);
}

/** How much of footprint (u, s, r) lies in the region in front of the cut on the s > 0 side (0: none). */
function inFront(u: number, s: number, r: number): number {
  const du = Math.max(0, Math.abs(u) - FRONT_HALF);
  const ds = s < FRONT_NEAR ? FRONT_NEAR - s : s > FRONT_FAR ? s - FRONT_FAR : 0;
  const d = Math.hypot(du, ds);
  return d < r ? (r - d) * r : 0;
}

/**
 * The camera's side for a cut through (x, z) along `heading`: +1 looks from the normal (tz, -tx),
 * -1 from the other. Picks the side whose view of the cut is clearest of trunks, rocks and the log,
 * and stays inside the world. On a tie the camera stands on the sun's side (the light comes from
 * about (0.5, 0.7) in x, z: paintedMaterial's uLightDir), so the face is lit from behind it.
 */
export function chooseSide(x: number, z: number, heading: number): 1 | -1 {
  const tx = Math.sin(heading);
  const tz = Math.cos(heading);
  let score = 0; // > 0 favours -1
  const { round, log } = footprints();
  for (let k = 0; k < round.length; k += 4) {
    const px = round[k] - x;
    const pz = round[k + 1] - z;
    const u = px * tx + pz * tz;
    const s = px * tz - pz * tx;
    const w = round[k + 3] === Infinity ? 4 : 1; // trunks block the view most
    score += w * (inFront(u, s, round[k + 2]) - inFront(u, -s, round[k + 2]));
  }
  for (let a = -log.half; a <= log.half; a += 0.5) {
    const px = log.x + log.dx * a - x;
    const pz = log.z + log.dz * a - z;
    const u = px * tx + pz * tz;
    const s = px * tz - pz * tx;
    score += 0.5 * (inFront(u, s, log.r) - inFront(u, -s, log.r));
  }
  // A camera standing outside the world looks through the berm and the distant trees.
  const cx = x + tz * 9;
  const cz = z - tx * 9;
  const out = (px: number, pz: number) => Math.max(0, Math.abs(px) - WORLD_HALF) + Math.max(0, Math.abs(pz) - WORLD_HALF);
  score += out(cx, cz) - out(x - tz * 9, z + tx * 9);
  if (Math.abs(score) > 1e-9) return score > 0 ? -1 : 1;
  return tz * 0.5 - tx * 0.7 >= 0 ? 1 : -1;
}
```

- [ ] **Step 4: Run the checks**

```bash
npx tsc --noEmit
npx vitest run tests/unit/digSpot.test.ts
npx vitest run
```

Expected: 5 passed; the suite **+4 files, +24 tests**. (If Plan A moved or resized a trunk so that the "no trunk in the way" test finds no spot to test, `tested` stays 0 and it fails: pick headings that work for Plan A's layout rather than weakening the check.)

- [ ] **Step 5: Commit**

```bash
git add src/underground/digSpot.ts tests/unit/digSpot.test.ts
git commit -m "feat(underground): where digging down is allowed, and the camera's side" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The worm digging in the plane

**Files:**
- Modify: `src/game/crawl.ts` (export `SPACING`) **(Plan A changed this file: re-read it first)**
- Create: `src/underground/burrowMotion.ts`
- Test: `tests/unit/burrowMotion.test.ts`

The same 16-point body as on the surface, in the plane (spec 6). Pointing: the way pointed (already mapped to the plane by the caller) turns the head at up to 2.6 rad/s, slower in sharp turns, and never more than 1.3 rad off the neck. The soil just ahead sets the speed: the worm's own tunnel is fastest, castings next, then L, F, H, A, E, B. The head stays inside the playable slab and 0.12 u under the litter's top, and slides out of blockers. Every body point keeps an open tunnel (the body cuts corners); a casting is left at the tail every 4.5 u; peristalsis runs 1.9 times faster per unit while eating fresh soil. `nearTop` (with hysteresis) decides whether Action means "Come up". Nothing allocates per step.

- [ ] **Step 1: Export the body spacing from the crawl**

In `src/game/crawl.ts`, replace:

```ts
const SPACING = 0.22;
```

with:

```ts
export const SPACING = 0.22;
```

(The underground body uses the crawl's own spacing, so the worm keeps its length going down and coming up.)

- [ ] **Step 2: Write the failing test**

Create `tests/unit/burrowMotion.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createBurrower, placeBurrower, stepBurrower, DIG_TURN, TOP_KEEP, CAST_EVERY, TUNNEL_R, type Burrower,
} from '../../src/underground/burrowMotion';
import { createSlab, boundaryAt, B_TOP, B_F, B_H, B_A, B_E, type Slab } from '../../src/underground/slab';
import { createSoilGrid, fillSoilGrid, digDisc, type SoilGrid } from '../../src/underground/soilGrid';
import { createSolids, placeSolids, markSolids, solidDepth, STONE_STRIDE, type Solids } from '../../src/underground/solids';
import { BODY_RADIUS, SPACING } from '../../src/game/crawl';
import { mulberry32 } from '../../src/core/random';

const DT = 1 / 60;
const N = 16;
const hit = { nu: 0, nv: 0 };

interface World { s: Slab; g: SoilGrid; o: Solids; b: Burrower }

/** A slab with no blockers (unless `solids`), the worm lying straight with its head at (u, v) facing +u. */
function setup(u: number, v: (s: Slab) => number, solids = false, seed = 3): World {
  const s = createSlab(0, 0, 0, 1, seed);
  const g = createSoilGrid();
  fillSoilGrid(g, s);
  const o = createSolids();
  if (solids) { placeSolids(s, o); markSolids(g, o); }
  const b = createBurrower();
  const vv = v(s);
  const us = Array.from({ length: N }, (_, i) => u - SPACING * i);
  placeBurrower(b, us, us.map(() => vv), 0, { phase: 0, activity: 0 });
  return { s, g, o, b };
}

const run = (w: World, du: number, dv: number, steps: number, each?: () => void) => {
  for (let k = 0; k < steps; k++) { stepBurrower(w.b, w.s, w.g, w.o, du, dv, DT); each?.(); }
};
/** Digs a straight open tunnel along the worm's depth from u0 to u1. */
function tunnel(w: World, u0: number, u1: number): void {
  const ate = { cells: 0, organic: 0 };
  for (let u = u0; u <= u1; u += 0.05) digDisc(w.g, u, w.b.v[0], TUNNEL_R, ate);
}
const midOf = (k: number) => (s: Slab) => (boundaryAt(s, k, 0) + boundaryAt(s, k + 1, 0)) / 2;

/** Mean speed over the last second of a 2 s straight run through one layer. */
function speedIn(k: number): number {
  const w = setup(-4, midOf(k));
  run(w, 1, 0, 60);
  const from = w.b.u[0];
  run(w, 1, 0, 60);
  return w.b.u[0] - from;
}

describe('digging in the plane (spec 6)', () => {
  it('is fast in its own tunnel, slower in new soil, slower still in A, then E and B', () => {
    const f = speedIn(B_F);
    const h = speedIn(B_H);
    const a = speedIn(B_A);
    const e = speedIn(B_E);
    expect(a).toBeLessThan(Math.min(f, h) * 0.8);
    expect(e).toBeLessThan(a * 0.85);
    // Along an open tunnel: faster than any fresh soil.
    const w = setup(-4, midOf(B_F));
    tunnel(w, -7, 4);
    run(w, 1, 0, 60);
    const from = w.b.u[0];
    run(w, 1, 0, 60);
    expect(w.b.u[0] - from).toBeGreaterThan(f * 1.3);
  });

  it('turns toward the way pointed at a limited rate', () => {
    const w = setup(0, midOf(B_A));
    let last = w.b.dir;
    run(w, 0, -1, 120, () => {
      expect(Math.abs(w.b.dir - last)).toBeLessThanOrEqual(DIG_TURN * DT + 1e-9);
      last = w.b.dir;
    });
    expect(Math.cos(w.b.dir + Math.PI / 2)).toBeGreaterThan(0.99);
  });

  it('steering into the top keeps it under the leaves: it never pops out, and Come up shows there', () => {
    const w = setup(0, midOf(B_F));
    run(w, 0.3, 1, 360, () => {
      expect(w.b.v[0]).toBeLessThanOrEqual(boundaryAt(w.s, B_TOP, w.b.u[0]) - TOP_KEEP + 1e-9);
    });
    expect(w.b.nearTop).toBe(true);
    run(w, 0, -1, 120);
    expect(w.b.nearTop).toBe(false);
    expect(w.b.v[0]).toBeLessThan(boundaryAt(w.s, B_F, w.b.u[0]) - 0.35);
  });

  it('stones and big roots stop it, and it slides along them', () => {
    const w = setup(0, midOf(B_A), true);
    const { o } = w;
    let tested = 0;
    for (let i = 0; i < o.stoneCount; i++) {
      const k = i * STONE_STRIDE;
      if (o.stones[k + 7] === 1 || o.stones[k + 2] < 0.2) continue;
      const g = createSoilGrid();
      fillSoilGrid(g, w.s);
      markSolids(g, o);
      const b = createBurrower();
      const v = o.stones[k + 1] + 0.1;
      const u0 = o.stones[k] - o.stones[k + 2] - 1;
      const us = Array.from({ length: N }, (_, j) => u0 - SPACING * j);
      placeBurrower(b, us, us.map(() => v), 0, { phase: 0, activity: 0 });
      let slid = 0;
      for (let st = 0; st < 600; st++) {
        const bu = b.u[0];
        const bv = b.v[0];
        stepBurrower(b, w.s, g, o, 1, -0.05, DT);
        expect(solidDepth(o, b.u[0], b.v[0], BODY_RADIUS, hit)).toBeLessThanOrEqual(1e-6);
        if (Math.abs(b.u[0] - o.stones[k]) < o.stones[k + 2]) slid += Math.hypot(b.u[0] - bu, b.v[0] - bv);
      }
      expect(slid).toBeGreaterThan(0.1);
      tested++;
    }
    expect(tested).toBeGreaterThan(0);
  });

  it('leaves an open tunnel and a casting every few body lengths', () => {
    const w = setup(-7, midOf(B_A));
    run(w, 1, 0, 60 * 14);
    expect(w.b.u[0]).toBeGreaterThan(-7 + CAST_EVERY * 1.5);
    let casts = 0;
    for (let i = 0; i < w.g.cast.length; i++) if (w.g.cast[i]) casts++;
    expect(casts).toBeGreaterThan(3);
    // Mineral food makes paler castings than leaves would.
    expect(Math.max(...w.g.cast)).toBeLessThan(200);
    let open = 0;
    for (let i = 0; i < w.g.open.length; i++) if (w.g.open[i] && !w.g.cast[i]) open++;
    expect(open * 0.01).toBeGreaterThan((w.b.u[0] + 7) * 2 * TUNNEL_R * 0.7);
  });

  it('peristalsis runs faster per unit moved while eating (spec 6)', () => {
    const rate = (dug: boolean) => {
      const w = setup(-4, midOf(B_F));
      if (dug) tunnel(w, -7, 4);
      run(w, 1, 0, 60);
      const p0 = w.b.wave.phase;
      const u0 = w.b.u[0];
      run(w, 1, 0, 60);
      expect(w.b.eating).toBe(!dug);
      return (w.b.wave.phase - p0) / (w.b.u[0] - u0);
    };
    expect(rate(false)).toBeGreaterThan(rate(true) * 1.4);
  });

  it('moves smoothly over a seed sweep: no jumps, no reversals, bounded turning', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const rand = mulberry32(seed);
      const w = setup(rand() * 4 - 2, midOf(B_H), true, seed);
      let du = 0;
      let dv = -1;
      let pu = 0;
      let pv = 0;
      let lastDir = w.b.dir;
      let reversals = 0;
      for (let k = 0; k < 60 * 20; k++) {
        if (k % 30 === 0) { const a = rand() * Math.PI * 2; du = Math.cos(a); dv = Math.sin(a); }
        const bu = w.b.u[0];
        const bv = w.b.v[0];
        stepBurrower(w.b, w.s, w.g, w.o, du, dv, DT);
        const su = w.b.u[0] - bu;
        const sv = w.b.v[0] - bv;
        const step = Math.hypot(su, sv);
        expect(step).toBeLessThanOrEqual(1.4 * DT + 0.02);
        expect(Math.abs(w.b.dir - lastDir)).toBeLessThanOrEqual(DIG_TURN * DT + 0.08);
        lastDir = w.b.dir;
        if (step > 1e-4 && Math.hypot(pu, pv) > 1e-4 && su * pu + sv * pv < 0) reversals++;
        pu = su; pv = sv;
        for (let i = 1; i < N; i++) {
          expect(Math.hypot(w.b.u[i] - w.b.prevU[i], w.b.v[i] - w.b.prevV[i])).toBeLessThanOrEqual(1.4 * DT + 0.02);
        }
      }
      expect(reversals).toBeLessThanOrEqual(3);
    }
  });
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `npx vitest run tests/unit/burrowMotion.test.ts`
Expected: FAIL, "Failed to resolve import ../../src/underground/burrowMotion".

- [ ] **Step 4: Implement**

Create `src/underground/burrowMotion.ts`:

```ts
import { advanceWave, type WaveState } from '../worm/wormShape';
import { WAVES, wormLength } from '../worm/wormMesh';
import { WORM_SEGMENTS, SPACING, BODY_RADIUS } from '../game/crawl';
import { boundaryAt, B_F, B_TOP, type Slab } from './slab';
import { cellAt, digDisc, castBlob, AIR, type Eaten, type SoilGrid } from './soilGrid';
import { pushOutSolids, type Solids } from './solids';
import { CAST_SPEED, EAT_SPEED, TUNNEL_SPEED, type LayerId } from './layers';

/**
 * The worm digging in the cut's plane (V2 spec 6): the same 16-point body as on the surface,
 * steered by pointing (the stick or arrows give the way the head should go, on screen), turning at
 * a limited rate. Fast in its own tunnel, slower eating new soil, slower still in A, E and B;
 * stones and big roots stop it and it slides along them. It leaves an open tunnel and, every few
 * body lengths, a casting. Pure; allocates nothing per step.
 */
/** Open tunnel radius: about the body's half-width. */
export const TUNNEL_R = 0.14;
/** Most the head turns per second toward the way pointed. */
export const DIG_TURN = 2.6;
/** The head never comes nearer than this to the litter's top: steering up never pops it out (spec 4.2). */
export const TOP_KEEP = 0.12;
/** The head is "near the top" (Action = Come up) within this of the F top... */
export const NEAR_TOP_IN = 0.2;
/** ...and stops being near it below this (hysteresis: the prompt does not flicker at the line). */
export const NEAR_TOP_OUT = 0.35;
/** A casting every this far (about 1.3 body lengths). */
export const CAST_EVERY = 4.5;
const CAST_R = 0.15;
const MAX_NECK_BEND = 1.3;
/** Peristalsis runs this much faster per unit moved while eating (spec 6). */
const EAT_WAVES = 1.9;
const BREATH_HZ = 0.22;
const WAVES_PER_UNIT = WAVES / wormLength(WORM_SEGMENTS, SPACING);
/** Stick input below this is no input. */
const DEAD = 0.15;

export interface Burrower {
  /** Body points head first: u along the cut, v world height. */
  readonly u: Float64Array;
  readonly v: Float64Array;
  readonly prevU: Float64Array;
  readonly prevV: Float64Array;
  /** The way the head faces, as an angle in the plane (0 = +u, pi / 2 = up). Unwrapped. */
  dir: number;
  prevDir: number;
  /** Current speed (eased toward the soil's speed). */
  speed: number;
  readonly wave: WaveState;
  readonly prevWave: WaveState;
  /** It is eating its way into fresh soil (not moving along an open tunnel). */
  eating: boolean;
  /** Distance moved since the last casting. */
  sinceCast: number;
  /** How much of what it ate lately was leaves (0..1): darker castings. */
  gut: number;
  /** The head is near the litter (Action = Come up). */
  nearTop: boolean;
}

export function createBurrower(): Burrower {
  const n = WORM_SEGMENTS;
  return {
    u: new Float64Array(n), v: new Float64Array(n), prevU: new Float64Array(n), prevV: new Float64Array(n),
    dir: -Math.PI / 2, prevDir: -Math.PI / 2, speed: 0,
    wave: { phase: 0, activity: 0 }, prevWave: { phase: 0, activity: 0 },
    eating: false, sinceCast: 0, gut: 0.5, nearTop: false,
  };
}

/** Puts the body at the given points (head first), facing `dir`, still, with nothing to interpolate. */
export function placeBurrower(b: Burrower, us: ArrayLike<number>, vs: ArrayLike<number>, dir: number, wave: WaveState): void {
  for (let i = 0; i < b.u.length; i++) {
    b.u[i] = b.prevU[i] = us[i];
    b.v[i] = b.prevV[i] = vs[i];
  }
  b.dir = b.prevDir = dir;
  b.speed = 0;
  b.wave.phase = b.prevWave.phase = wave.phase;
  b.wave.activity = b.prevWave.activity = wave.activity;
  b.eating = false;
  b.sinceCast = 0;
  b.nearTop = false;
}

const wrap = (a: number): number => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
const head = { u: 0, v: 0 };
const ate: Eaten = { cells: 0, organic: 0 };

/** Set by soilSpeed: the soil just ahead is fresh (not an open tunnel). */
let fresh = false;

/** The speed the soil just ahead of the head allows. */
function soilSpeed(g: SoilGrid, u: number, v: number, dir: number): number {
  const i = cellAt(g, u + Math.cos(dir) * 0.18, v + Math.sin(dir) * 0.18);
  fresh = false;
  if (i < 0) return 0;
  if (g.open[i]) return g.cast[i] ? CAST_SPEED : TUNNEL_SPEED;
  const l = g.layer[i];
  if (l === AIR) return TUNNEL_SPEED * 0.5;
  fresh = true;
  return EAT_SPEED[l as LayerId];
}

/**
 * One fixed step. (du, dv): the way pointed, in the plane (u right along the cut, v up), each
 * -1..1; the caller maps screen directions to these. No input: the worm stops and breathes.
 */
export function stepBurrower(b: Burrower, s: Slab, g: SoilGrid, o: Solids, du: number, dv: number, dt: number): void {
  const n = b.u.length;
  b.prevU.set(b.u);
  b.prevV.set(b.v);
  b.prevDir = b.dir;
  b.prevWave.phase = b.wave.phase;
  b.prevWave.activity = b.wave.activity;
  const mag = Math.min(1, Math.hypot(du, dv));
  let target = 0;
  fresh = false;
  if (mag > DEAD) {
    const err = wrap(Math.atan2(dv, du) - b.dir);
    b.dir += Math.max(-DIG_TURN * dt, Math.min(DIG_TURN * dt, err));
    // Slower in a sharp turn, never coiling back into the neck.
    target = soilSpeed(g, b.u[0], b.v[0], b.dir) * mag * Math.max(0.35, 0.5 + 0.5 * Math.cos(err));
  }
  const neck = Math.atan2(b.v[0] - b.v[1], b.u[0] - b.u[1]);
  const bend = wrap(b.dir - neck);
  if (Math.abs(bend) > MAX_NECK_BEND) b.dir -= bend - Math.sign(bend) * MAX_NECK_BEND;
  b.speed += (target - b.speed) * (1 - Math.exp(-8 * dt));
  head.u = b.u[0] + Math.cos(b.dir) * b.speed * dt;
  head.v = b.v[0] + Math.sin(b.dir) * b.speed * dt;
  // Inside the slab, under the leaves' top, out of stones and roots.
  head.u = Math.max(s.playLo + 0.2, Math.min(s.playHi - 0.2, head.u));
  head.v = Math.max(s.bottom + 0.3, Math.min(boundaryAt(s, B_TOP, head.u) - TOP_KEEP, head.v));
  pushOutSolids(o, head, BODY_RADIUS);
  head.v = Math.min(boundaryAt(s, B_TOP, head.u) - TOP_KEEP, head.v);
  const moved = Math.hypot(head.u - b.u[0], head.v - b.v[0]);
  b.u[0] = head.u;
  b.v[0] = head.v;
  digDisc(g, head.u, head.v, TUNNEL_R, ate);
  b.eating = fresh;
  if (ate.cells > 0) b.gut += (ate.organic / ate.cells - b.gut) * 0.15;
  // Follow the leader, then keep every body point in an open tunnel (the body cuts corners).
  for (let i = 1; i < n; i++) {
    const eu = b.u[i] - b.u[i - 1];
    const ev = b.v[i] - b.v[i - 1];
    const d = Math.hypot(eu, ev);
    if (d > SPACING) {
      b.u[i] = b.u[i - 1] + (eu * SPACING) / d;
      b.v[i] = b.v[i - 1] + (ev * SPACING) / d;
    }
    digDisc(g, b.u[i], b.v[i], TUNNEL_R * 0.85, ate);
  }
  b.sinceCast += moved;
  if (b.sinceCast >= CAST_EVERY) {
    b.sinceCast = 0;
    const tu = b.u[n - 1] - b.u[n - 2];
    const tv = b.v[n - 1] - b.v[n - 2];
    const tl = Math.hypot(tu, tv) || 1;
    castBlob(g, b.u[n - 1] + (tu / tl) * 0.1, b.v[n - 1] + (tv / tl) * 0.1, CAST_R, 90 + 160 * b.gut);
  }
  const full = Math.max(0.3, target);
  advanceWave(b.wave, moved * (b.eating ? EAT_WAVES : 1), dt, full, WAVES_PER_UNIT, BREATH_HZ);
  const floor = boundaryAt(s, B_F, head.u);
  b.nearTop = head.v >= floor - (b.nearTop ? NEAR_TOP_OUT : NEAR_TOP_IN);
}
```

- [ ] **Step 5: Run the checks**

```bash
npx tsc --noEmit
npx vitest run tests/unit/burrowMotion.test.ts
npx vitest run
```

Expected: 7 passed (the smoothness sweep runs 12 seeds of 20 s: allow a few seconds); the suite **+5 files, +31 tests**.

- [ ] **Step 6: Commit**

```bash
git add src/game/crawl.ts src/underground/burrowMotion.ts tests/unit/burrowMotion.test.ts
git commit -m "feat(underground): the worm digs in the plane, steered by pointing" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The surface and underground mode machine

**Files:**
- Create: `src/underground/modeMachine.ts`
- Test: `tests/unit/modeMachine.test.ts`

A small pure state machine (spec 4, 10, 11.8): `surface → diggingDown → underground → comingUp → surface`. One Action press digs down where allowed; underground it comes up near the top, or else switches the view. Presses during a move are ignored. It times the moves (sink 1.0 s then camera 1.5 s, or a 0.7 s fade with reduced motion; rise 1.0 s then crawl out 1.1 s while the camera swings back) and gives their linear progress, and says what the prompt should show (`ActionKind` from Plan A). It also defines `UndergroundView` and `DEFAULT_UNDERGROUND_VIEW = 'wide'` (contract §5).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/modeMachine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createModeState, stepMode, moveDuration, bodyProgress, cameraProgress, promptKind,
  SINK_S, SWING_S, FADE_S, RISE_S, OUT_S, type ModeState,
} from '../../src/underground/modeMachine';

const DT = 1 / 60;
const steps = (s: ModeState, n: number, canDig = true, nearTop = false) => {
  const events: string[] = [];
  for (let k = 0; k < n; k++) {
    const e = stepMode(s, false, canDig, nearTop, false, DT);
    if (e !== 'none') events.push(e);
  }
  return events;
};

describe('the surface / underground state machine (spec 4, 10)', () => {
  it('digs down on one Action press where allowed, and nowhere else', () => {
    const s = createModeState();
    expect(stepMode(s, true, false, false, false, DT)).toBe('none');
    expect(s.mode).toBe('surface');
    expect(stepMode(s, false, true, false, false, DT)).toBe('none');
    expect(stepMode(s, true, true, false, false, DT)).toBe('startDig');
    expect(s.mode).toBe('diggingDown');
  });

  it('sinks for about 1 s, swings the camera for about 1.5 s, then is underground', () => {
    const s = createModeState();
    stepMode(s, true, true, false, false, DT);
    expect(moveDuration(s)).toBeCloseTo(SINK_S + SWING_S, 9);
    const n = Math.ceil((SINK_S + SWING_S) / DT);
    let lastCam = 0;
    let lastBody = 0;
    for (let k = 0; k < n - 2; k++) {
      expect(stepMode(s, true, true, true, false, DT)).toBe('none'); // presses are ignored mid-move
      expect(cameraProgress(s)).toBeGreaterThanOrEqual(lastCam);
      expect(bodyProgress(s)).toBeGreaterThanOrEqual(lastBody);
      if (s.t < SINK_S) expect(cameraProgress(s)).toBe(0);
      lastCam = cameraProgress(s);
      lastBody = bodyProgress(s);
    }
    expect(steps(s, 4)).toEqual(['arrive']);
    expect(s.mode).toBe('underground');
    expect(cameraProgress(s)).toBe(1);
  });

  it('underground: Action near the top comes up, deeper it switches the view', () => {
    const s: ModeState = { mode: 'underground', t: 0, reduced: false };
    expect(stepMode(s, true, false, false, false, DT)).toBe('switchView');
    expect(s.mode).toBe('underground');
    expect(stepMode(s, false, false, true, false, DT)).toBe('none');
    expect(s.mode).toBe('underground');
    expect(stepMode(s, true, false, true, false, DT)).toBe('startUp');
    expect(moveDuration(s)).toBeCloseTo(RISE_S + Math.max(OUT_S, SWING_S), 9);
    expect(cameraProgress(s)).toBe(1);
    const events = steps(s, Math.ceil(moveDuration(s) / DT) + 2);
    expect(events).toEqual(['emerge']);
    expect(s.mode).toBe('surface');
    expect(cameraProgress(s)).toBe(0);
  });

  it('reduced motion uses the short cross-fade for the camera', () => {
    const s = createModeState();
    stepMode(s, true, true, false, true, DT);
    expect(s.reduced).toBe(true);
    expect(moveDuration(s)).toBeCloseTo(SINK_S + FADE_S, 9);
  });

  it('the prompt shows what Action will do now', () => {
    const s = createModeState();
    expect(promptKind(s, true, false, 'wide')).toBe('digDown');
    expect(promptKind(s, false, false, 'wide')).toBeNull();
    s.mode = 'diggingDown';
    expect(promptKind(s, true, true, 'wide')).toBeNull();
    s.mode = 'underground';
    expect(promptKind(s, false, true, 'wide')).toBe('comeUp');
    expect(promptKind(s, false, false, 'wide')).toBe('viewClose');
    expect(promptKind(s, false, false, 'close')).toBe('viewWide');
    s.mode = 'comingUp';
    expect(promptKind(s, false, true, 'close')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/unit/modeMachine.test.ts`
Expected: FAIL, "Failed to resolve import ../../src/underground/modeMachine".

- [ ] **Step 3: Implement**

Create `src/underground/modeMachine.ts`:

```ts
import type { ActionKind } from '../ui/actionPrompt';

/**
 * Surface or underground, and the moves between (V2 spec 4, 10): a small pure state machine.
 * One Action press does what fits (spec 11.8): on the surface where allowed it digs down;
 * underground near the top it comes up; deeper it switches the camera view.
 *
 *   surface --Action, canDig--> diggingDown --(sink, then camera)--> underground
 *   underground --Action, nearTop--> comingUp --(rise, then camera)--> surface
 *   underground --Action, deeper--> underground (view switched)
 */
export type Mode = 'surface' | 'diggingDown' | 'underground' | 'comingUp';
export type UndergroundView = 'wide' | 'close';
export const DEFAULT_UNDERGROUND_VIEW: UndergroundView = 'wide';

/** Digging down: the head turns down and the front sinks for this long... */
export const SINK_S = 1.0;
/** ...then the camera swings to side-on for this long (spec 4.1). */
export const SWING_S = 1.5;
/** With reduced motion the swing is a short cross-fade instead. */
export const FADE_S = 0.7;
/** Coming up: the head rises through the cut, then the worm crawls out while the camera swings back. */
export const RISE_S = 1.0;
export const OUT_S = 1.1;

export interface ModeState {
  mode: Mode;
  /** Seconds into the current mode. */
  t: number;
  /** The move in progress uses the cross-fade (prefers-reduced-motion, read when it starts). */
  reduced: boolean;
}

export type ModeEvent = 'none' | 'startDig' | 'arrive' | 'startUp' | 'emerge' | 'switchView';

export function createModeState(): ModeState {
  return { mode: 'surface', t: 0, reduced: false };
}

const camTime = (s: ModeState): number => (s.reduced ? FADE_S : SWING_S);

/** How long the current move lasts (0 on the surface and underground). */
export function moveDuration(s: ModeState): number {
  if (s.mode === 'diggingDown') return SINK_S + camTime(s);
  if (s.mode === 'comingUp') return RISE_S + Math.max(OUT_S, camTime(s));
  return 0;
}

/**
 * One step. `pressed`: Action went down this step. `canDig`: the surface spot allows digging.
 * `nearTop`: the head is near the top of the litter. `reduced`: prefers-reduced-motion now.
 * Presses during a move are ignored. Returns what happened.
 */
export function stepMode(
  s: ModeState, pressed: boolean, canDig: boolean, nearTop: boolean, reduced: boolean, dt: number,
): ModeEvent {
  switch (s.mode) {
    case 'surface':
      if (!pressed || !canDig) return 'none';
      s.mode = 'diggingDown';
      s.t = 0;
      s.reduced = reduced;
      return 'startDig';
    case 'underground':
      if (!pressed) return 'none';
      if (!nearTop) return 'switchView';
      s.mode = 'comingUp';
      s.t = 0;
      s.reduced = reduced;
      return 'startUp';
    case 'diggingDown':
    case 'comingUp': {
      s.t += dt;
      if (s.t < moveDuration(s)) return 'none';
      const down = s.mode === 'diggingDown';
      s.mode = down ? 'underground' : 'surface';
      s.t = 0;
      return down ? 'arrive' : 'emerge';
    }
  }
}

/** Linear 0..1 progress of the worm's own move (sink, or rise then crawl out). */
export function bodyProgress(s: ModeState): number {
  if (s.mode === 'diggingDown') return Math.min(1, s.t / SINK_S);
  if (s.mode === 'comingUp') return Math.min(1, s.t / (RISE_S + OUT_S));
  return s.mode === 'underground' ? 1 : 0;
}

/** Linear 0..1 progress of the camera's move from the surface view (0) to the cut (1). */
export function cameraProgress(s: ModeState): number {
  if (s.mode === 'diggingDown') return Math.max(0, Math.min(1, (s.t - SINK_S) / camTime(s)));
  if (s.mode === 'comingUp') return 1 - Math.max(0, Math.min(1, (s.t - RISE_S) / camTime(s)));
  return s.mode === 'underground' ? 1 : 0;
}

/** What Action would do now, for the prompt (null: nothing). */
export function promptKind(s: ModeState, canDig: boolean, nearTop: boolean, view: UndergroundView): ActionKind | null {
  if (s.mode === 'surface') return canDig ? 'digDown' : null;
  if (s.mode !== 'underground') return null;
  if (nearTop) return 'comeUp';
  return view === 'wide' ? 'viewClose' : 'viewWide';
}
```

- [ ] **Step 4: Run the checks**

```bash
npx tsc --noEmit
npx vitest run tests/unit/modeMachine.test.ts
npx vitest run
```

Expected: 5 passed; the suite **+6 files, +36 tests**.

- [ ] **Step 5: Commit**

```bash
git add src/underground/modeMachine.ts tests/unit/modeMachine.test.ts
git commit -m "feat(underground): the surface/underground mode machine and the Action prompt's kind" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Going down and coming up: the body's path

**Files:**
- Create: `src/underground/bodyPath.ts`
- Test: `tests/unit/bodyPath.test.ts`

The worm's own moves (spec 4.1, 4.2) as a path its body slides along: a polyline from the tail through the head to where the head will go; every body point stays `SPACING` behind the head along it, so the body follows exactly. Sinking: a short arc turning the head down, then down to 0.85 u below the F top. Coming up: a smooth curve from the head to the F top 0.45 u along, arriving level, then 3.8 u along the surface (the whole body comes out), toward the slab's middle if the run would leave the slab. The head moves along with smootherstep easing; a body bunched up in a turn starts exactly where it lay and eases onto the path over the first 40% of the move.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/bodyPath.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createBodyPath, buildSink, buildEmerge, poseAt, smootherstep, SINK_DEPTH,
} from '../../src/underground/bodyPath';
import { createSlab, boundaryAt, B_F } from '../../src/underground/slab';
import { SPACING } from '../../src/game/crawl';
import { SINK_S, RISE_S, OUT_S } from '../../src/underground/modeMachine';

const N = 16;
const AXIS = 0.1;
const DT = 1 / 60;

function lyingAt(s: ReturnType<typeof createSlab>, u0: number): { us: Float64Array; vs: Float64Array } {
  const us = new Float64Array(N);
  const vs = new Float64Array(N);
  for (let i = 0; i < N; i++) { us[i] = u0 - SPACING * i; vs[i] = boundaryAt(s, B_F, us[i]) + AXIS; }
  return { us, vs };
}

/** Steps the move at 60 Hz and checks every body point moves smoothly; returns the last body. */
function play(p: ReturnType<typeof createBodyPath>, seconds: number, maxStep: number) {
  const u = new Float64Array(N);
  const v = new Float64Array(N);
  const pu = new Float64Array(N);
  const pv = new Float64Array(N);
  poseAt(p, 0, pu, pv);
  const n = Math.ceil(seconds / DT);
  let lastStep = 0;
  for (let k = 1; k <= n; k++) {
    poseAt(p, k / n, u, v);
    for (let i = 0; i < N; i++) {
      const d = Math.hypot(u[i] - pu[i], v[i] - pv[i]);
      expect(d).toBeLessThanOrEqual(maxStep);
      if (i === 0) {
        // No jerk: the head's speed changes gently from step to step.
        expect(Math.abs(d - lastStep)).toBeLessThan(0.01);
        lastStep = d;
      }
      if (i > 0) expect(Math.hypot(u[i] - u[i - 1], v[i] - v[i - 1])).toBeLessThanOrEqual(SPACING + 1e-3);
    }
    pu.set(u);
    pv.set(v);
  }
  return { u, v };
}

describe('digging down and coming up: the worm\'s own move (spec 4.1, 4.2)', () => {
  it('sinks: starts exactly where it lay, ends head down below the F top, smoothly', () => {
    for (const seed of [1, 2, 3, 4]) {
      const s = createSlab(seed * 1.3, -seed, seed, 1, seed);
      const { us, vs } = lyingAt(s, 0);
      const p = createBodyPath();
      buildSink(p, s, us, vs);
      const u = new Float64Array(N);
      const v = new Float64Array(N);
      poseAt(p, 0, u, v);
      for (let i = 0; i < N; i++) { expect(u[i]).toBeCloseTo(us[i], 9); expect(v[i]).toBeCloseTo(vs[i], 9); }
      const end = play(p, SINK_S, 0.06);
      expect(end.v[0]).toBeLessThanOrEqual(boundaryAt(s, B_F, end.u[0]) - SINK_DEPTH + 1e-9);
      // Facing straight down at the end.
      expect(end.v[0] - end.v[1]).toBeLessThan(-0.9 * SPACING);
    }
  });

  it('comes up: rises to the surface and crawls all the way out, lying along the cut', () => {
    const s = createSlab(0, 0, 0, 1, 5);
    const us = new Float64Array(N);
    const vs = new Float64Array(N);
    // Head 1.5 below the F top, the body trailing down a vertical burrow, facing up.
    for (let i = 0; i < N; i++) { us[i] = 1; vs[i] = boundaryAt(s, B_F, 1) - 1.5 - SPACING * i; }
    const p = createBodyPath();
    buildEmerge(p, s, us, vs, Math.PI / 2, AXIS);
    const end = play(p, RISE_S + OUT_S, 0.12);
    for (let i = 0; i < N; i++) {
      expect(end.v[i]).toBeCloseTo(boundaryAt(s, B_F, end.u[i]) + AXIS, 3);
    }
    // Along the cut, head first in the exit direction.
    expect(Math.sign(end.u[0] - end.u[N - 1])).toBe(p.exitSign);
  });

  it('comes out toward the slab\'s middle when the surface run would leave it', () => {
    const s = createSlab(0, 0, 0, 1, 5);
    const us = new Float64Array(N).fill(7);
    const vs = new Float64Array(N);
    for (let i = 0; i < N; i++) vs[i] = boundaryAt(s, B_F, 7) - 1 - SPACING * i;
    const p = createBodyPath();
    buildEmerge(p, s, us, vs, 0.1, AXIS); // facing +u, but the slab ends at 8
    expect(p.exitSign).toBe(-1);
  });

  it('a body bunched up in a turn starts exactly where it lay, then eases onto the path', () => {
    const s = createSlab(0, 0, 0, 1, 5);
    const us = new Float64Array(N);
    const vs = new Float64Array(N);
    // A tight curl in the plane: points only 0.15 apart.
    for (let i = 0; i < N; i++) { us[i] = -0.15 * i; vs[i] = boundaryAt(s, B_F, us[i]) + AXIS + 0.02 * Math.sin(i); }
    const p = createBodyPath();
    buildSink(p, s, us, vs);
    const u = new Float64Array(N);
    const v = new Float64Array(N);
    poseAt(p, 0, u, v);
    for (let i = 0; i < N; i++) { expect(u[i]).toBeCloseTo(us[i], 9); expect(v[i]).toBeCloseTo(vs[i], 9); }
    play(p, SINK_S, 0.08);
  });

  it('smootherstep eases in and out', () => {
    expect(smootherstep(0)).toBe(0);
    expect(smootherstep(1)).toBe(1);
    expect(smootherstep(0.5)).toBeCloseTo(0.5, 9);
    expect(smootherstep(0.01)).toBeLessThan(0.0001);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/unit/bodyPath.test.ts`
Expected: FAIL, "Failed to resolve import ../../src/underground/bodyPath".

- [ ] **Step 3: Implement**

Create `src/underground/bodyPath.ts`:

```ts
import { SPACING, WORM_SEGMENTS } from '../game/crawl';
import { boundaryAt, B_F, type Slab } from './slab';

/**
 * The worm's own moves in and out of the cut (V2 spec 4.1, 4.2), as a path the body slides along:
 * a polyline in the plane (u, v = the body's axis height) that starts at the tail and runs through
 * the head to where the head will go. The head's place along it moves from start to end; every
 * body point sits SPACING further back, so the body follows the head exactly. Pure, preallocated.
 */
const MAX_POINTS = 96;
/** The head's arc as it turns down into the soil, and how far below the F top it ends. */
const SINK_RADIUS = 0.45;
export const SINK_DEPTH = 0.85;
/** The body's length, plus a little: the worm crawls this far out along the surface. */
const OUT_LENGTH = 3.8;

export interface BodyPath {
  readonly u: Float64Array;
  readonly v: Float64Array;
  /** Arc length at each point. */
  readonly s: Float64Array;
  count: number;
  /** Where the head starts and ends along the path. */
  headFrom: number;
  headTo: number;
  /** Coming up: the head's way along the cut at the end (+1 along u, -1 against)... */
  exitSign: number;
  /** ...and where it comes out of the ground (u): the burrow opening. */
  exitU: number;
  /**
   * The body as it really lay at the start, less where the path puts it (a body bunched up in a
   * turn is shorter than SPACING per point): eased out early in the move, so nothing jumps.
   */
  readonly offU: Float64Array;
  readonly offV: Float64Array;
}

export function createBodyPath(): BodyPath {
  return {
    u: new Float64Array(MAX_POINTS), v: new Float64Array(MAX_POINTS), s: new Float64Array(MAX_POINTS),
    count: 0, headFrom: 0, headTo: 0, exitSign: 1, exitU: 0,
    offU: new Float64Array(WORM_SEGMENTS), offV: new Float64Array(WORM_SEGMENTS),
  };
}

function push(p: BodyPath, u: number, v: number): void {
  if (p.count >= MAX_POINTS) return;
  const i = p.count++;
  p.u[i] = u;
  p.v[i] = v;
  p.s[i] = i === 0 ? 0 : p.s[i - 1] + Math.hypot(u - p.u[i - 1], v - p.v[i - 1]);
}

/** The share of a move over which the body eases from where it lay onto the path. */
const SETTLE = 0.4;

/** Starts the path with the body (head first in `us`, `vs`), tail first along the path. */
function startWithBody(p: BodyPath, us: ArrayLike<number>, vs: ArrayLike<number>): void {
  p.count = 0;
  for (let i = us.length - 1; i >= 0; i--) push(p, us[i], vs[i]);
  p.headFrom = p.s[p.count - 1];
  bodyAlong(p, p.headFrom, p.offU, p.offV);
  for (let i = 0; i < p.offU.length; i++) {
    p.offU[i] = us[i] - p.offU[i];
    p.offV[i] = vs[i] - p.offV[i];
  }
}

/**
 * Digging down: the head, lying along the cut facing +u, turns down in a short arc and sinks to
 * SINK_DEPTH below the F top (the head ends facing straight down).
 */
export function buildSink(p: BodyPath, s: Slab, us: ArrayLike<number>, vs: ArrayLike<number>): void {
  startWithBody(p, us, vs);
  const u0 = us[0];
  const v0 = vs[0];
  for (let k = 1; k <= 8; k++) {
    const a = (k / 8) * (Math.PI / 2);
    push(p, u0 + SINK_RADIUS * Math.sin(a), v0 - SINK_RADIUS + SINK_RADIUS * Math.cos(a));
  }
  const ue = u0 + SINK_RADIUS;
  const end = Math.min(v0 - SINK_RADIUS - 0.05, boundaryAt(s, B_F, ue) - SINK_DEPTH);
  push(p, ue, end);
  p.headTo = p.s[p.count - 1];
  p.exitSign = 1;
}

/**
 * Coming up: from the head (facing `dir` in the plane) a smooth curve up to the F top just ahead,
 * turning to lie along the cut, then OUT_LENGTH along the surface so the whole body comes out.
 * The worm comes out facing along the cut (spec 4.2): the way its head points along u, or toward
 * the slab's middle if the surface run would leave the playable slab. `axisUp`: the axis's height
 * above the F top when lying on the surface (the belly rests on the floor).
 */
export function buildEmerge(
  p: BodyPath, s: Slab, us: ArrayLike<number>, vs: ArrayLike<number>, dir: number, axisUp: number,
): void {
  startWithBody(p, us, vs);
  const hu = us[0];
  const hv = vs[0];
  const cu = Math.cos(dir);
  let sign = Math.abs(cu) > 0.2 ? Math.sign(cu) : hu > 0 ? -1 : 1;
  if (hu + sign * (OUT_LENGTH + 0.6) > s.playHi || hu + sign * (OUT_LENGTH + 0.6) < s.playLo) sign = -sign;
  const eu = hu + sign * 0.45;
  const ev = boundaryAt(s, B_F, eu) + axisUp;
  // A cubic from the head along its facing to the exit point, arriving level.
  const k = 0.45 * Math.hypot(eu - hu, ev - hv) + 0.1;
  const c1u = hu + Math.cos(dir) * k;
  const c1v = hv + Math.sin(dir) * k;
  const c2u = eu - sign * k;
  const c2v = ev;
  for (let i = 1; i <= 12; i++) {
    const t = i / 12;
    const a = (1 - t) ** 3;
    const b = 3 * (1 - t) ** 2 * t;
    const c = 3 * (1 - t) * t * t;
    const d = t ** 3;
    push(p, a * hu + b * c1u + c * c2u + d * eu, a * hv + b * c1v + c * c2v + d * ev);
  }
  for (let x = 0.25; x <= OUT_LENGTH + 1e-9; x += 0.25) {
    const u = eu + sign * x;
    push(p, u, boundaryAt(s, B_F, u) + axisUp);
  }
  p.headTo = p.s[p.count - 1];
  p.exitSign = sign;
  p.exitU = eu;
}

/** The point at arc length `at` along the path into (out[k], out[k + 1]); before the start, straight on back. */
function sampleAt(p: BodyPath, at: number, outU: Float64Array, outV: Float64Array, i: number): void {
  if (at <= 0) {
    const l = Math.max(1e-9, p.s[1]);
    outU[i] = p.u[0] + ((p.u[0] - p.u[1]) / l) * -at;
    outV[i] = p.v[0] + ((p.v[0] - p.v[1]) / l) * -at;
    return;
  }
  let lo = 0;
  let hi = p.count - 1;
  if (at >= p.s[hi]) {
    outU[i] = p.u[hi];
    outV[i] = p.v[hi];
    return;
  }
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (p.s[mid] <= at) lo = mid;
    else hi = mid;
  }
  const f = (at - p.s[lo]) / Math.max(1e-9, p.s[hi] - p.s[lo]);
  outU[i] = p.u[lo] + (p.u[hi] - p.u[lo]) * f;
  outV[i] = p.v[lo] + (p.v[hi] - p.v[lo]) * f;
}

/** Writes the body (head first) with the head at `headAt` along the path. Allocates nothing. */
export function bodyAlong(p: BodyPath, headAt: number, outU: Float64Array, outV: Float64Array): void {
  for (let i = 0; i < outU.length; i++) sampleAt(p, headAt - i * SPACING, outU, outV, i);
}

/** Smooth 0..1 easing with zero speed and acceleration at both ends. */
export function smootherstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** The head's place along the path at linear progress `t` (eased). */
export function headAt(p: BodyPath, t: number): number {
  return p.headFrom + (p.headTo - p.headFrom) * smootherstep(t);
}

/** The body (head first) at linear progress `t` of the move: exactly as it lay at 0. Allocates nothing. */
export function poseAt(p: BodyPath, t: number, outU: Float64Array, outV: Float64Array): void {
  bodyAlong(p, headAt(p, t), outU, outV);
  const w = 1 - smootherstep(t / SETTLE);
  for (let i = 0; i < outU.length; i++) {
    outU[i] += p.offU[i] * w;
    outV[i] += p.offV[i] * w;
  }
}
```

- [ ] **Step 4: Run the checks**

```bash
npx tsc --noEmit
npx vitest run tests/unit/bodyPath.test.ts
npx vitest run
```

Expected: 5 passed; the suite **+7 files, +41 tests**.

- [ ] **Step 5: Commit**

```bash
git add src/underground/bodyPath.ts tests/unit/bodyPath.test.ts
git commit -m "feat(underground): the body's path down into the cut and back out" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The camera facing the cut

**Files:**
- Create: `src/underground/cutCamera.ts`
- Test: `tests/unit/cutCamera.test.ts`

The camera stands square to the cut on the slab's camera side, pitched down a little, and frames a rectangle of the plane (spec 7). Wide: 8.5 u tall from 1.4 u above the highest litter (surface down into B), at least 7 u wide on a phone; it holds still while the head is in the middle half and follows gently toward an end. Close: the screen's shorter side is 6 u, with 18% of the frame kept ahead of the head (the facing eased over 0.8 s). Switching eases the zoom (0.6 s). All smoothing is `springTo` (critically damped, no clamp at the target). `cutPose` turns a frame into a camera position, look point and **near plane**: 0.45 u in front of the cut's highest point, so everything between the camera and the cut is not drawn. The tests run the real burrower over seed sweeps at 1366 × 768 and 360 × 640 and check, frame to frame: the head on screen, the near plane never cutting it, step, jerk and back-and-forth.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/cutCamera.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createCutCam, frameTarget, snapCutCam, stepCutCam, stepCutFacing, cutPose, LABEL_ROOM, FOV_DEG,
  type CutFrame, type CutPose,
} from '../../src/underground/cutCamera';
import { createSlab, boundaryAt, slabX, slabZ, B_F, B_H, type Slab } from '../../src/underground/slab';
import { createSoilGrid, fillSoilGrid } from '../../src/underground/soilGrid';
import { createSolids, placeSolids, markSolids } from '../../src/underground/solids';
import { createBurrower, placeBurrower, stepBurrower } from '../../src/underground/burrowMotion';
import { SPACING } from '../../src/game/crawl';
import { mulberry32 } from '../../src/core/random';
import type { UndergroundView } from '../../src/underground/modeMachine';

const DT = 1 / 60;
const TAN = Math.tan((FOV_DEG * Math.PI) / 360);
const SCREENS = [[1366, 768], [360, 640]] as const;
const frame: CutFrame = { cu: 0, cv: 0, h: 0, pitch: 0 };
const pose: CutPose = { px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0, near: 0 };

/** The point (x, y, z) in the camera's view: NDC x, y and depth. */
function project(p: CutPose, aspect: number, x: number, y: number, z: number): { nx: number; ny: number; d: number } {
  let fx = p.lx - p.px; let fy = p.ly - p.py; let fz = p.lz - p.pz;
  const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
  // right = f x up(0,1,0); up' = right x f
  let rx = -fz; let rz = fx; const rl = Math.hypot(rx, rz); rx /= rl; rz /= rl;
  const ux = -rz * fy; const uy = rz * fx - rx * fz; const uz = rx * fy;
  const dx = x - p.px; const dy = y - p.py; const dz = z - p.pz;
  const d = dx * fx + dy * fy + dz * fz;
  return { nx: (dx * rx + dz * rz) / (d * TAN * aspect), ny: (dx * ux + dy * uy + dz * uz) / (d * TAN), d };
}

function world(s: Slab, u: number, v: number): [number, number, number] {
  return [slabX(s, u), v, slabZ(s, u)];
}

type Each = (p: CutPose, prev: CutPose, s: Slab, hu: number, hv: number) => void;

/** Runs the real burrower for 25 s, pointing at random (or `steer`), the camera following; checks each frame. */
function sweep(view: UndergroundView, w: number, hgt: number, seed: number, each: Each, steer?: (k: number) => [number, number]) {
  const rand = mulberry32(seed);
  const s = createSlab(rand() * 10 - 5, rand() * 10 - 5, rand() * 6, rand() < 0.5 ? 1 : -1, seed);
  const g = createSoilGrid();
  fillSoilGrid(g, s);
  const o = placeSolids(s, createSolids());
  markSolids(g, o);
  const b = createBurrower();
  const us = Array.from({ length: 16 }, () => 0);
  const vs = us.map((_, i) => boundaryAt(s, B_F, 0) - 0.8 + i * SPACING);
  placeBurrower(b, us, vs, -Math.PI / 2, { phase: 0, activity: 0 });
  const cam = createCutCam();
  const aspect = w / hgt;
  snapCutCam(cam, frameTarget(view, s, b.u[0], b.v[0], 0, -1, aspect, 0, 0, frame), b.dir);
  const prev: CutPose = { ...pose };
  cutPose(s, cam.cu.value, cam.cv.value, cam.h.value, cam.pitch.value, prev);
  let du = 0; let dv = -1;
  for (let k = 0; k < 60 * 25; k++) {
    if (steer) [du, dv] = steer(k);
    else if (k % 40 === 0) { const a = rand() * Math.PI * 2; du = Math.cos(a); dv = Math.sin(a); }
    stepBurrower(b, s, g, o, du, dv, DT);
    stepCutFacing(cam, b.dir, DT);
    frameTarget(view, s, b.u[0], b.v[0], cam.au.value, cam.av.value, aspect, cam.cu.value, cam.cv.value, frame);
    stepCutCam(cam, frame, view, DT);
    cutPose(s, cam.cu.value, cam.cv.value, cam.h.value, cam.pitch.value, pose);
    each(pose, prev, s, b.u[0], b.v[0]);
    Object.assign(prev, pose);
  }
}

describe('the camera facing the cut (spec 7)', () => {
  it('Wide frames from just above the surface down into B; on a wide screen, the whole slab and its names', () => {
    const s = createSlab(0, 0, 0.4, 1, 2);
    const a = 1366 / 768;
    frameTarget('wide', s, 0, -2, 1, 0, a, 0, 0, frame);
    cutPose(s, frame.cu, frame.cv, frame.h, frame.pitch, pose);
    expect(project(pose, a, ...world(s, 0, s.topMax + 0.3)).ny).toBeLessThan(1);
    expect(project(pose, a, ...world(s, 0, boundaryAt(s, B_H, 0) - 1.5)).ny).toBeGreaterThan(-1);
    const wide = 1600 / 500;
    frameTarget('wide', s, 0, -2, 1, 0, wide, 0, 0, frame);
    cutPose(s, frame.cu, frame.cv, frame.h, frame.pitch, pose);
    for (const u of [s.playLo - LABEL_ROOM + 0.1, s.playHi + LABEL_ROOM - 0.1]) {
      expect(Math.abs(project(pose, wide, ...world(s, u, s.topMax)).nx)).toBeLessThanOrEqual(1);
    }
  });

  it('Wide holds still while the worm digs near the middle, and follows it toward an end', () => {
    let moved = 0;
    // Down and round in the middle of the screen: still.
    sweep('wide', 1366, 768, 4, (p, q) => { moved += Math.abs(p.px - q.px) + Math.abs(p.pz - q.pz); }, (k) => (k < 200 ? [0, -1] : [Math.cos(k / 40), Math.sin(k / 40)]));
    expect(moved).toBeLessThan(0.5);
    moved = 0;
    // Down, then across the slab: the phone's narrower view follows.
    sweep('wide', 360, 640, 4, (p, q) => { moved += Math.abs(p.px - q.px) + Math.abs(p.pz - q.pz); }, (k) => (k < 60 ? [0, -1] : [1, 0]));
    expect(moved).toBeGreaterThan(2);
  });

  for (const view of ['wide', 'close'] as const) {
    for (const [w, h] of SCREENS) {
      it(`${view} at ${w}x${h}: the worm stays on screen, the near plane never cuts it, no shake (seed sweep)`, () => {
        const worst = { step: 0, jerk: 0, flips: 0 };
        for (let seed = 1; seed <= 8; seed++) {
          let lastV = 0;
          let flips = 0;
          let lastSign = 0;
          sweep(view, w, h, seed, (p, q, s, hu, hv) => {
            const head = project(p, w / h, ...world(s, hu, hv));
            expect(Math.abs(head.nx)).toBeLessThan(0.95);
            expect(Math.abs(head.ny)).toBeLessThan(0.95);
            expect(head.d - 0.2).toBeGreaterThan(p.near);
            const step = Math.hypot(p.px - q.px, p.py - q.py, p.pz - q.pz);
            expect(step).toBeLessThan(0.08);
            // Smooth: the camera's speed changes only a little from frame to frame.
            expect(Math.abs(step - lastV)).toBeLessThan(0.003);
            worst.jerk = Math.max(worst.jerk, Math.abs(step - lastV));
            worst.step = Math.max(worst.step, step);
            lastV = step;
            // No back-and-forth: the sideways motion seldom reverses.
            const sx = Math.sign(Math.round((p.px - q.px) * 1e5));
            if (sx !== 0 && lastSign !== 0 && sx !== lastSign) flips++;
            if (sx !== 0) lastSign = sx;
          });
          expect(flips).toBeLessThan(30);
          worst.flips = Math.max(worst.flips, flips);
        }
        console.log(`${view} ${w}x${h}: worst step ${worst.step.toFixed(4)}, jerk ${worst.jerk.toFixed(4)}, flips ${worst.flips}`);
      });
    }
  }

  it('switching view eases the zoom with no overshoot', () => {
    const s = createSlab(0, 0, 0, 1, 2);
    const cam = createCutCam();
    snapCutCam(cam, frameTarget('wide', s, 0, -2, 1, 0, 1366 / 768, 0, 0, frame), 0);
    const from = cam.h.value;
    frameTarget('close', s, 0, -2, 1, 0, 1366 / 768, 0, 0, frame);
    let last = from;
    let lastStep = 0;
    for (let k = 0; k < 180; k++) {
      stepCutCam(cam, frame, 'close', DT);
      expect(cam.h.value).toBeLessThanOrEqual(last + 1e-9);
      expect(cam.h.value).toBeGreaterThanOrEqual(frame.h - 1e-9);
      expect(Math.abs((last - cam.h.value) - lastStep)).toBeLessThan(0.02);
      lastStep = last - cam.h.value;
      last = cam.h.value;
    }
    expect(cam.h.value).toBeCloseTo(frame.h, 1);
  });

  it('the near plane stands just in front of the cut: the forest in front is cut away, the cut is not', () => {
    const s = createSlab(0, 0, 0, 1, 2);
    for (const view of ['wide', 'close'] as const) {
      frameTarget(view, s, 0, -2, 0, -1, 1.5, 0, 0, frame);
      cutPose(s, frame.cu, frame.cv, frame.h, frame.pitch, pose);
      // The cut's top just in front of the plane is beyond the near plane...
      const top = project(pose, 1.5, s.ox + s.nx * 0.2, s.topMax, s.oz + s.nz * 0.2);
      expect(top.d).toBeGreaterThan(pose.near);
      // ...while anything a body length in front of the cut is nearer than it (not drawn).
      for (const y of [s.topMax, s.topMax + 1, s.topMax + 4]) {
        const front = project(pose, 1.5, s.ox + s.nx * 1.5, y, s.oz + s.nz * 1.5);
        expect(front.d).toBeLessThan(pose.near);
      }
    }
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/unit/cutCamera.test.ts`
Expected: FAIL, "Failed to resolve import ../../src/underground/cutCamera".

- [ ] **Step 3: Implement**

Create `src/underground/cutCamera.ts`:

```ts
import type { Spring } from '../surface/followCamera';
import type { Slab } from './slab';
import type { UndergroundView } from './modeMachine';

/**
 * The camera facing the cut (V2 spec 7). It stands square to the cut on the slab's camera side,
 * pitched a little down, and frames a rectangle of the plane: Wide shows the whole slab from just
 * above the surface down to about the B layer, following gently only when the slab is wider than
 * the screen; Close frames a few worm lengths around the head, with more room ahead. Its near
 * plane sits just in front of the cut, so the forest between the camera and the cut is never
 * drawn (no shader changes; the projection does it). Pure; allocates nothing per step.
 */
/** The vertical field of view (main.ts's camera). */
export const FOV_DEG = 60;
const TAN_HALF = Math.tan((FOV_DEG * Math.PI) / 360);
/** Room beside each end of the playable slab for the layer names. */
export const LABEL_ROOM = 1.8;
/** Wide: from this far above the highest litter down to about the B layer (this tall)... */
const WIDE_ABOVE = 1.4;
const WIDE_H = 8.5;
/** ...but on a narrow (phone) screen at least this wide, up to this tall. */
const WIDE_MIN_W = 7;
const WIDE_MAX_H = 13;
/** Looking down, the cut's top is nearer than the frame's centre and shows less width: frame a bit more. */
const PITCH_ROOM = 1.15;
/** Close: the screen's shorter side spans this (about 1.7 worm lengths). */
const CLOSE_SPAN = 6;
/** Close keeps this share of the frame ahead of the head. */
const CLOSE_AHEAD = 0.18;
/** The head stays this share of the frame inside its edges. */
const KEEP_IN = 0.2;
/** Pitched down a little, so the surface reads above and behind the cut. */
const PITCH = { wide: 0.2, close: 0.12 } as const;
/** Seconds for the frame to settle: Wide follows gently, Close more closely, and switching eases. */
const SMOOTH = { wide: 0.9, close: 0.4 } as const;
const ZOOM_SMOOTH = 0.6;
const AHEAD_SMOOTH = 0.8;
/** The near plane stays this far in front of the cut's top (the worm stands out of it by 0.13). */
export const CUT_MARGIN = 0.45;

export interface CutCam {
  /** The frame's centre on the plane (u along the cut, v height) and its height there. */
  readonly cu: Spring;
  readonly cv: Spring;
  readonly h: Spring;
  readonly pitch: Spring;
  /** Which way the head faces, eased (Close keeps room ahead; a turn swings the room over slowly). */
  readonly au: Spring;
  readonly av: Spring;
}

export interface CutFrame { cu: number; cv: number; h: number; pitch: number }

export interface CutPose {
  /** Camera position and the point it looks at (world), and its near plane. */
  px: number; py: number; pz: number;
  lx: number; ly: number; lz: number;
  near: number;
}

export function createCutCam(): CutCam {
  const spring = (value: number): Spring => ({ value, velocity: 0 });
  return { cu: spring(0), cv: spring(0), h: spring(10), pitch: spring(0.2), au: spring(0), av: spring(-1) };
}

/** Keeps x so that `head` lies within [x - half + keep, x + half - keep]. */
function keepHead(x: number, head: number, half: number, keep: number): number {
  return Math.min(head + half - keep, Math.max(head - half + keep, x));
}

/**
 * Where `view` wants the frame for the head at (hu, hv) facing (au, av) (eased: CutCam's), on a
 * screen of `aspect` (width / height). `now` is the frame's current centre (Wide holds still
 * while the head is well inside it).
 */
export function frameTarget(
  view: UndergroundView, s: Slab, hu: number, hv: number, au: number, av: number, aspect: number,
  nowU: number, nowV: number, out: CutFrame,
): CutFrame {
  const lo = s.playLo - LABEL_ROOM;
  const hi = s.playHi + LABEL_ROOM;
  let h: number;
  let cu: number;
  let cv: number;
  if (view === 'wide') {
    h = Math.min(WIDE_MAX_H, Math.max(WIDE_H, WIDE_MIN_W / aspect));
    const top = s.topMax + WIDE_ABOVE;
    cu = (lo + hi) / 2;
    cv = top - h / 2;
    const w = (h * aspect) / PITCH_ROOM;
    if (w < hi - lo) cu = Math.min(hi - w / 2, Math.max(lo + w / 2, keepHead(nowU, hu, w / 2, w * 0.25)));
    // Deeper than the frame reaches: it follows the head down, gently.
    cv = Math.min(cv, keepHead(nowV, hv, h / 2, h * KEEP_IN));
  } else {
    h = aspect >= 1 ? CLOSE_SPAN : CLOSE_SPAN / aspect;
    const w = h * aspect;
    cu = hu + au * w * CLOSE_AHEAD;
    cv = hv + av * h * CLOSE_AHEAD;
    cu = Math.min(s.faceHi - w / 2, Math.max(s.faceLo + w / 2, cu));
    cv = Math.min(s.topMax + 2 - h / 2, cv);
  }
  // Never below the slab's bottom.
  cv = Math.max(s.bottom + h / 2, cv);
  out.cu = cu;
  out.cv = cv;
  out.h = h;
  out.pitch = PITCH[view];
  return out;
}

/** Puts the frame at `f`, facing `dir`, at once (arriving, or a reset). */
export function snapCutCam(c: CutCam, f: CutFrame, dir: number): void {
  c.au.value = Math.cos(dir); c.au.velocity = 0;
  c.av.value = Math.sin(dir); c.av.velocity = 0;
  c.cu.value = f.cu; c.cu.velocity = 0;
  c.cv.value = f.cv; c.cv.velocity = 0;
  c.h.value = f.h; c.h.velocity = 0;
  c.pitch.value = f.pitch; c.pitch.velocity = 0;
}

/**
 * A critically damped spring toward `target` (the same integration as followCamera's
 * smoothDampInto, without its clamp at the target: that clamp zeroes the speed the moment a moving
 * target is reached, a visible jolt when the frame catches up with the worm). Allocates nothing.
 */
export function springTo(s: Spring, target: number, smoothTime: number, dt: number): void {
  if (!(dt > 0)) return;
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = s.value - target;
  const temp = (s.velocity + omega * change) * dt;
  s.velocity = (s.velocity - omega * temp) * decay;
  s.value = target + (change + temp) * decay;
}

/** Eases the facing toward the head's `dir` (call before frameTarget). */
export function stepCutFacing(c: CutCam, dir: number, dt: number): void {
  springTo(c.au, Math.cos(dir), AHEAD_SMOOTH, dt);
  springTo(c.av, Math.sin(dir), AHEAD_SMOOTH, dt);
}

/** Eases the frame toward `f` (critically damped: no overshoot, no shake). */
export function stepCutCam(c: CutCam, f: CutFrame, view: UndergroundView, dt: number): void {
  springTo(c.cu, f.cu, SMOOTH[view], dt);
  springTo(c.cv, f.cv, SMOOTH[view], dt);
  springTo(c.h, f.h, ZOOM_SMOOTH, dt);
  springTo(c.pitch, f.pitch, ZOOM_SMOOTH, dt);
}

/**
 * The camera for a frame centred at (cu, cv), `h` tall at the cut, pitched down by `pitch`:
 * square to the cut on its camera side, looking at the frame's centre. The near plane is just in
 * front of the highest point of the cut that can show (spec: the forest in front of the cut is
 * not drawn).
 */
export function cutPose(s: Slab, cu: number, cv: number, h: number, pitch: number, out: CutPose): CutPose {
  const d = h / (2 * TAN_HALF);
  const lx = s.ox + s.tx * cu;
  const lz = s.oz + s.tz * cu;
  const back = d * Math.cos(pitch);
  out.lx = lx;
  out.ly = cv;
  out.lz = lz;
  out.px = lx + s.nx * back;
  out.py = cv + d * Math.sin(pitch);
  out.pz = lz + s.nz * back;
  // View depth of a point of the cut at height y: back cos(pitch) + (py - y) sin(pitch).
  const top = s.topMax + 0.1;
  out.near = Math.max(0.2, back * Math.cos(pitch) + (out.py - top) * Math.sin(pitch) - CUT_MARGIN);
  return out;
}
```

- [ ] **Step 4: Run the checks**

```bash
npx tsc --noEmit
npx vitest run tests/unit/cutCamera.test.ts
npx vitest run
```

Expected: 8 passed; the suite **+8 files, +49 tests**. Measured in the scratch build (worst over 8 seeds × 25 s): Wide 1366 × 768 does not move while the worm digs near the middle; Wide 360 × 640 step ≤ 0.015 u, jerk ≤ 0.0002; Close step ≤ 0.053 u, jerk ≤ 0.0019 (limit 0.003), sideways reversals ≤ 19 per 25 s (limit 30).

- [ ] **Step 5: Commit**

```bash
git add src/underground/cutCamera.ts tests/unit/cutCamera.test.ts
git commit -m "feat(underground): Wide and Close cut cameras, eased, with the near plane at the cut" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The underground view setting

**Files:**
- Modify: `src/save/settingsStore.ts` **(Plan A changed this file: it removed `scale`. Re-read it first)**
- Modify: `tests/unit/settingsStore.test.ts` **(Plan A rewrote it: re-read it first)**
- Test: `tests/unit/undergroundSetting.test.ts`

Contract §5: `undergroundView: 'wide' | 'close'`, stored only when the player switches; until then it reads as `DEFAULT_UNDERGROUND_VIEW` (`'wide'`), so a later class vote can change the default for every device that never switched. Older saves (V1's, with a `scale`; Step 1a's, without) keep loading, and a write keeps fields this build does not know.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/undergroundSetting.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  loadSettings, updateSettings, SETTINGS_KEY, type KeyValueStore,
} from '../../src/save/settingsStore';
import { DEFAULT_UNDERGROUND_VIEW } from '../../src/underground/modeMachine';

function memoryStore(initial?: unknown): KeyValueStore & { raw(): Record<string, unknown> | null } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(SETTINGS_KEY, JSON.stringify(initial));
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
    raw: () => (data.has(SETTINGS_KEY) ? JSON.parse(data.get(SETTINGS_KEY)!) : null),
  };
}

describe('the underground camera setting (spec 7)', () => {
  it('reads as Wide when never chosen, including from V1 and Step 1a saves', () => {
    expect(DEFAULT_UNDERGROUND_VIEW).toBe('wide');
    expect(loadSettings(memoryStore()).undergroundView).toBe('wide');
    expect(loadSettings(memoryStore({ version: 1, graphics: 'low', autoSettled: null, scale: 'hybrid' })).undergroundView).toBe('wide');
    expect(loadSettings(memoryStore({ version: 1, graphics: 'low', autoSettled: null, undergroundView: 'sideways' })).undergroundView).toBe('wide');
  });

  it('is stored only once the player switches it: a Graphics pick never pins the default', () => {
    const store = memoryStore({ version: 1, graphics: 'auto', autoSettled: null });
    updateSettings(store, { graphics: 'high' });
    expect(store.raw()).not.toHaveProperty('undergroundView');
    updateSettings(store, { undergroundView: 'close' });
    expect(store.raw()?.undergroundView).toBe('close');
    expect(loadSettings(store).undergroundView).toBe('close');
    // Kept by later writes of other settings.
    updateSettings(store, { graphics: 'low' });
    expect(store.raw()?.undergroundView).toBe('close');
  });

  it('keeps fields this build does not know, and a V1 world scale', () => {
    const store = memoryStore({ version: 1, graphics: 'auto', autoSettled: null, scale: 'classic', later: 7 });
    updateSettings(store, { undergroundView: 'wide' });
    expect(store.raw()).toMatchObject({ later: 7, scale: 'classic', undergroundView: 'wide' });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/unit/undergroundSetting.test.ts`
Expected: FAIL: `undergroundView` is `undefined` (and `tsc` reports `undergroundView` is not in `Settings`).

- [ ] **Step 3: Implement**

The intent, in four edits to `src/save/settingsStore.ts` as Plan A left it: a new `undergroundView` field in `Settings` and `DEFAULT_SETTINGS`; `resolve()` reads it (invalid or missing → the default); `saveSettings` writes it with the other fields; `updateSettings` writes it only when it is in the patch or was already stored (exactly the rule Plan A kept for its fields). The code below is the verified edit against the V1 file; where Plan A's lines differ (it removed `scale`), keep Plan A's and add only the `undergroundView` parts.

Add the import beside the others at the top:

```ts
import { DEFAULT_UNDERGROUND_VIEW, type UndergroundView } from '../underground/modeMachine';
```

In `interface Settings`, after its last field, add the field, and after the interface add the guard:

```ts
  /** The underground camera (V2 spec 7). Added in V2; stored only once the player switches it. */
  undergroundView: UndergroundView;
}

export function isUndergroundView(v: unknown): v is UndergroundView {
  return v === 'wide' || v === 'close';
}
```

In `DEFAULT_SETTINGS`, add `undergroundView: DEFAULT_UNDERGROUND_VIEW` (V1's line becomes):

```ts
  version: 1, graphics: 'auto', autoSettled: null, scale: DEFAULT_SCALE, undergroundView: DEFAULT_UNDERGROUND_VIEW,
```

In `resolve()`, after the last field it reads, add:

```ts
    undergroundView: isUndergroundView(o.undergroundView) ? o.undergroundView : DEFAULT_SETTINGS.undergroundView,
```

In `saveSettings`, add `undergroundView: s.undergroundView` to the written fields (V1's line becomes):

```ts
      graphics: s.graphics, autoSettled: s.autoSettled, scale: s.scale, undergroundView: s.undergroundView,
```

In `updateSettings`, just before `write(store, kept ?? {}, fields);`, add:

```ts
  // Likewise the underground view: stored only once the player switches it (spec 7, the V1 rule).
  if (patch.undergroundView !== undefined || isUndergroundView(kept?.undergroundView)) fields.undergroundView = next.undergroundView;
```

In `tests/unit/settingsStore.test.ts` (Plan A's version), every expectation that compares a **whole settings object returned by `loadSettings`, `updateSettings` or `DEFAULT_SETTINGS`**, or the JSON written by **`saveSettings`**, gains `undergroundView: 'wide'` (or the value the test saved). Expectations on the JSON written by `updateSettings` do **not** change: the view is not stored unless switched. In V1's file these were six lines, for example:

```ts
    expect(DEFAULT_SETTINGS).toEqual({ version: 1, graphics: 'auto', autoSettled: null, scale: DEFAULT_SCALE, undergroundView: 'wide' });
```

```ts
    const s = { version: 1, graphics: 'ultra', autoSettled: 'medium', scale: 'hybrid', undergroundView: 'close' } as const;
```

```ts
      version: 1, graphics: 'high', autoSettled: null, scale: 'true', undergroundView: 'wide', moisture: { muted: true },
```

- [ ] **Step 4: Run the checks**

```bash
npx tsc --noEmit
npx vitest run tests/unit/undergroundSetting.test.ts tests/unit/settingsStore.test.ts
npx vitest run
```

Expected: both files pass; the suite **+9 files, +52 tests** (the settings file keeps its count).

- [ ] **Step 5: Commit**

```bash
git add src/save/settingsStore.ts tests/unit/settingsStore.test.ts tests/unit/undergroundSetting.test.ts
git commit -m "feat(save): the underground view, stored only when the player switches it" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: A quick key tap is never missed

**Files:**
- Modify: `src/input/keyboard.ts`
- Modify: `src/main.ts` **(Plan A changed this file: re-read it first)**
- Test: `tests/unit/keyboardTap.test.ts`

The game's fixed steps run inside rendered frames. On a slow frame (a Chromebook at 15 fps, or SwiftShader in tests) a Space tap can begin and end between two frames, and no step ever sees it: "Dig down" does nothing. `KeyboardInput` now keeps a key that was let go before any step saw it in `down` until `settle()`, which `main.ts` calls after each step has read the commands. A held key is let go at once, as before. Nothing allocates.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/keyboardTap.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';

class FakeTarget {
  private readonly handlers = new Map<string, ((e: unknown) => void)[]>();
  addEventListener(type: string, fn: (e: unknown) => void): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
  }
  fire(type: string, code = ''): void {
    for (const fn of this.handlers.get(type) ?? []) fn({ code, target: null, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {} });
  }
}

let KeyboardInput: typeof import('../../src/input/keyboard').KeyboardInput;
beforeAll(async () => {
  // KeyboardInput uses the DOM's document and element classes; node has none.
  const g = globalThis as unknown as Record<string, unknown>;
  g.document ??= { addEventListener() {}, hidden: false };
  g.Element ??= class {};
  g.HTMLButtonElement ??= class {};
  ({ KeyboardInput } = await import('../../src/input/keyboard'));
});

describe('a quick key tap is seen by the next game step (V2: Space on a slow frame)', () => {
  it('a key let go before any step stays down until settle()', () => {
    const t = new FakeTarget();
    const k = new KeyboardInput(t as unknown as Window);
    t.fire('keydown', 'Space');
    t.fire('keyup', 'Space');
    expect(k.down.has('Space')).toBe(true);
    k.settle();
    expect(k.down.has('Space')).toBe(false);
  });

  it('a held key is let go at once on keyup after a step has seen it', () => {
    const t = new FakeTarget();
    const k = new KeyboardInput(t as unknown as Window);
    t.fire('keydown', 'ArrowUp');
    k.settle();
    expect(k.down.has('ArrowUp')).toBe(true);
    t.fire('keyup', 'ArrowUp');
    expect(k.down.has('ArrowUp')).toBe(false);
  });

  it('losing focus lets go of everything', () => {
    const t = new FakeTarget();
    const k = new KeyboardInput(t as unknown as Window);
    t.fire('keydown', 'Space');
    t.fire('keyup', 'Space');
    t.fire('blur');
    expect(k.down.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/unit/keyboardTap.test.ts`
Expected: FAIL: `expected false to be true` (the tapped Space is already gone), and `k.settle is not a function`.

- [ ] **Step 3: Implement**

Replace `src/input/keyboard.ts` with:

```ts
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

/**
 * Tracks which keys (by KeyboardEvent.code) are held down. A key let go before any game step has
 * seen it stays down until the next settle() (V2): a quick tap of Space still digs down on a slow
 * frame, where the steps run only once the frame comes.
 */
export class KeyboardInput {
  readonly down = new Set<string>();
  /** Pressed since the last settle(). */
  private readonly fresh = new Set<string>();
  /** Let go before a step saw them: dropped at the next settle(). */
  private readonly late = new Set<string>();
  private readonly drop = (code: string): void => { this.down.delete(code); };

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      // Ignore browser shortcuts (Ctrl/Cmd/Alt combinations).
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Ignore keys in editable controls (except buttons).
      if (e.target instanceof Element && e.target.closest('input,select,textarea,[contenteditable]')) return;
      // Let Space/Enter still press a focused button.
      if (SCROLL_KEYS.has(e.code) && !(e.target instanceof HTMLButtonElement)) e.preventDefault();
      this.down.add(e.code);
      this.fresh.add(e.code);
      this.late.delete(e.code);
    });
    target.addEventListener('keyup', (e) => {
      if (this.fresh.has(e.code)) this.late.add(e.code);
      else this.down.delete(e.code);
    });
    target.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clear();
    });
  }

  /** Call after each game step has read `down`: quick taps it has now seen are let go. Allocates nothing. */
  settle(): void {
    this.fresh.clear();
    this.late.forEach(this.drop);
    this.late.clear();
  }

  private clear(): void {
    this.down.clear();
    this.fresh.clear();
    this.late.clear();
  }
}
```

In `src/main.ts`, call `keyboard.settle()` once per step, right after the step has read the commands. In V1's file that is `update()`; replace:

```ts
  function update(dt: number): void {
    if (!frozen()) crawl.step(dt, move());
  }
```

with:

```ts
  function update(dt: number): void {
    if (frozen()) return;
    crawl.step(dt, move());
    keyboard.settle();
  }
```

(If Plan A's `update()` reads `Commands.action` or calls other consumers, put `keyboard.settle()` after all of them, still inside the not-frozen branch. Task 17 rewrites this function.)

- [ ] **Step 4: Run the checks**

```bash
npx tsc --noEmit
npx vitest run tests/unit/keyboardTap.test.ts
npx vitest run
npm run build && npx playwright test tests/e2e/shell.spec.ts
```

Expected: 3 passed; the suite **+10 files, +55 tests**; the shell e2e tests pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/input/keyboard.ts src/main.ts tests/unit/keyboardTap.test.ts
git commit -m "fix(input): a key tapped between two frames is still seen by the next step" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: The cut face (rendering)

**Files:**
- Create: `src/underground/soilTiles.ts`
- Create: `src/underground/cutFaceGlsl.ts`
- Create: `src/underground/cutFace.ts`
- Test: `tests/unit/soilTiles.test.ts`
- Test: `tests/unit/cutFace.test.ts`

The face is one strip mesh in the cut's plane, built once at its largest size (225 columns) and rewritten in place for each slab, and one `ShaderMaterial` (spec 5, 10). Each vertex carries its plane point and its column's six boundary heights, so the layers are drawn exactly where the soil grid has them; between columns the GPU interpolates. The layers' patterns (spec 5.3: pattern, not only colour) are **painted once at load** into four small tiling textures with mipmaps (`soilTiles.ts`): computing them per pixel halved the frame rate in software GL (measured), while one texel read a pixel costs about what the surface's leaves cost. The fragment shader reads the layer's tile (bent a little by the broad noise texture, so repeats never line up), darkens the older litter, adds moss at F's top, colours A, E and B from the shared grain tile, reads the grid's data texture for tunnels (a half-pipe in shadow, its lower wall lit), castings, mixed walls and damp, darkens with depth, lets the bottom fade to black (burrows go deeper), dims beyond the playable ends, and ends with the forest's painted grade. No discard, no extra pass, `DoubleSide` (switching side would recompile). The soil texture (160 × 120 RGBA8) uploads in full after a new slab, then one update range per changed row. This task can only be unit-tested; Task 17 puts it on screen.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/soilTiles.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TEXELS, LITTER_TILE_U, SOIL_TILE_U } from '../../src/underground/soilTiles';

const out = [0, 0, 0, 0];
const at = (fn: (x: number, y: number, o: number[]) => void, x: number, y: number) => { fn(x, y, out); return [...out]; };

describe('the layers\' baked pattern tiles (spec 5.3)', () => {
  it('repeat seamlessly: a pattern matches itself one tile over, across and up', () => {
    const tiles: [keyof typeof TEXELS, number, number][] = [
      ['litter', LITTER_TILE_U[0], LITTER_TILE_U[1]], ['oldLeaves', SOIL_TILE_U, SOIL_TILE_U],
      ['humus', SOIL_TILE_U, SOIL_TILE_U], ['grain', SOIL_TILE_U, SOIL_TILE_U],
    ];
    for (const [name, w, h] of tiles) {
      for (const [x, y] of [[0.013, 0.31], [0.77, 1.21], [1.5, 0.05]]) {
        const a = at(TEXELS[name], x, y);
        const b = at(TEXELS[name], x + w, y);
        const c = at(TEXELS[name], x, y + h);
        for (let k = 0; k < 4; k++) {
          expect(b[k]).toBeCloseTo(a[k], 5);
          expect(c[k]).toBeCloseTo(a[k], 5);
        }
      }
    }
  });

  it('differ by pattern, not only colour: litter is bright and varied, humus dark, grain grainy', () => {
    let bright = 0;
    let humusMax = 0;
    let grainMin = 1;
    let grainMax = 0;
    for (let i = 0; i < 400; i++) {
      const x = (i * 0.137) % 4;
      const y = (i * 0.071) % 2;
      const l = at(TEXELS.litter, x, y);
      if (l[0] > 0.5) bright++;
      humusMax = Math.max(humusMax, at(TEXELS.humus, x % 2, y)[0]);
      const g = at(TEXELS.grain, x % 2, y)[0];
      grainMin = Math.min(grainMin, g);
      grainMax = Math.max(grainMax, g);
    }
    expect(bright).toBeGreaterThan(60);
    expect(humusMax).toBeLessThan(0.6);
    expect(grainMax - grainMin).toBeGreaterThan(0.3);
  });
});
```

Create `tests/unit/cutFace.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type * as THREE from 'three';
import { createCutFace } from '../../src/underground/cutFace';
import { createSlab } from '../../src/underground/slab';
import { createSoilGrid, fillSoilGrid, digDisc, GRID_W } from '../../src/underground/soilGrid';

describe('the cut face\'s soil texture (spec 10: only changed rows are uploaded)', () => {
  it('uploads in full after a new slab, then only the rows that changed, one range per row', () => {
    const face = createCutFace();
    const s = createSlab(0, 0, 0, 1, 4);
    const g = createSoilGrid();
    fillSoilGrid(g, s);
    face.setSlab(s, g);
    const tex = (face.mesh.material as THREE.ShaderMaterial).uniforms.uSoil.value as THREE.DataTexture;
    const v0 = tex.version;
    face.upload(g);
    expect(tex.version).toBe(v0 + 1);
    expect(tex.updateRanges.length).toBe(0); // the whole texture
    face.upload(g);
    expect(tex.version).toBe(v0 + 1); // nothing changed: nothing uploaded
    digDisc(g, 1, -3, 0.14, { cells: 0, organic: 0 });
    face.upload(g);
    expect(tex.version).toBe(v0 + 2);
    expect(tex.updateRanges.length).toBeGreaterThan(1);
    for (const r of tex.updateRanges) {
      expect(r.count).toBe(GRID_W * 4);
      expect(r.start % (GRID_W * 4)).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/soilTiles.test.ts tests/unit/cutFace.test.ts`
Expected: FAIL, "Failed to resolve import ../../src/underground/soilTiles" and "…/cutFace".

- [ ] **Step 3: Implement**

Create `src/underground/soilTiles.ts`:

```ts
import * as THREE from 'three';
import { valueNoise2 } from '../core/noise';

/**
 * The layers' patterns (V2 spec 5.3: pattern, not only colour), painted once at load into small
 * tiling textures with mipmaps, so the cut face reads one texel per pixel instead of computing
 * noise (measured: the computed patterns halved the frame rate in software GL). 128 texels per
 * unit; each tile repeats seamlessly (every pattern below is periodic over its tile).
 *  - litter (4 u x 2 u): leaves edge-on in rows, a few cut at an angle, grass blades and needles,
 *    dark air gaps (rgb; the face darkens the older, lower leaves itself).
 *  - old leaves, F (2 u x 2 u): dark matted fragments, white hyphae, pale fine roots (rgb), and a
 *    moss mask (a) the face uses at F's top.
 *  - humus, H (2 u x 2 u): black crumbs, fine roots, a few hyphae (rgb).
 *  - grain (2 u x 2 u): sand grain (r), mottles (g), pebbles (b): the face colours A, E and B.
 */
export const TEXELS_PER_U = 128;
export const LITTER_TILE_U = [4, 2] as const;
export const SOIL_TILE_U = 2;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** A fixed 0..1 value per integer pair. */
function hash(a: number, b: number, seed: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Value noise over a tile of (w, h) units at `f` cells per unit (w f and h f must be whole). */
const vn = (x: number, y: number, f: number, w: number, h: number, seed: number): number =>
  valueNoise2(x * f, y * f, seed, Math.round(w * f), Math.round(h * f));
/** Coverage of |d| < half, softened over `soft`. */
const band = (d: number, half: number, soft: number): number => 1 - smooth(half - soft, half + soft, Math.abs(d));

const LEAF_RGB = [[0.66, 0.16, 0.06], [0.83, 0.38, 0.08], [0.86, 0.62, 0.16], [0.4, 0.5, 0.15], [0.76, 0.66, 0.47], [0.5, 0.3, 0.15]];
const LEAF_AT = [0.24, 0.42, 0.58, 0.66, 0.86, 1.01];
function leafRgb(pick: number, out: number[]): void {
  const k = LEAF_AT.findIndex((t) => pick < t);
  const c = LEAF_RGB[k < 0 ? 5 : k];
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
}

/**
 * Blades of leaf seen edge-on in rows `rows` per tile height, each row cut into `n` blades per tile
 * width (n from the row: periodic), slanted and curled. Writes the blade's picks into `pick` and
 * returns its coverage (0..1); `edge` gets its lit upper edge.
 */
function blades(x: number, y: number, w: number, h: number, rows: number, nLo: number, nHi: number, fill: number, seed: number, pick: number[]): number {
  const rowH = h / rows;
  const r = (y + (vn(x, 0, 1, w, 1, seed) - 0.5) * rowH * 2.5) / rowH;
  const k = Math.floor(r);
  const kk = ((k % rows) + rows) % rows;
  const n = nLo + Math.floor(hash(kk, 3, seed) * (nHi - nLo + 1));
  const sx = (x / w) * n + hash(kk, 7, seed) * n;
  const j = Math.floor(sx);
  const jj = ((j % n) + n) % n;
  const h1 = hash(kk, jj, seed + 1);
  const h2 = hash(jj, kk, seed + 2);
  const t = sx - j;
  const yy = r - k - 0.5 - (h2 - 0.5) * 1.5 * (t - 0.5) - 0.5 * (Math.sin(t * Math.PI) - 0.6) * (h1 - 0.5);
  const thick = 0.1 + 0.25 * h2 * h2;
  const soft = 0.6 / (TEXELS_PER_U * rowH);
  let cover = band(yy, thick, soft) * (h1 > 1 - fill ? 1 : 0);
  cover *= smooth(0, 0.12, t) * (1 - smooth(0.88, 1, t));
  pick[0] = h1;
  pick[1] = h2;
  pick[2] = band(yy + thick * 0.7, 0.15 * thick, soft);
  return cover;
}

const pa = [0, 0, 0];
const pb = [0, 0, 0];
const rgb = [0, 0, 0];

function litterTexel(x: number, y: number, out: number[]): void {
  const [w, h] = LITTER_TILE_U;
  const a = blades(x, y, w, h, 20, 3, 9, 0.75, 11, pa);
  const b = blades(x + 0.37, y + 0.05, w, h, 16, 2, 6, 0.6, 29, pb);
  let r = 0.12, g = 0.075, bl = 0.045;
  for (const [cover, pick] of [[b, pb], [a, pa]] as const) {
    if (cover <= 0) continue;
    leafRgb((pick[0] * 7.31) % 1, rgb);
    // Some blades are grass and needles: thin, straight, pale.
    if (pick[1] > 0.9) { rgb[0] = 0.62; rgb[1] = 0.52; rgb[2] = 0.3; }
    const v = 0.85 + 0.25 * vn(x, y, 9, w, h, 41) + pick[2] * 0.12;
    r += (rgb[0] * v - r) * cover; g += (rgb[1] * v - g) * cover; bl += (rgb[2] * v - bl) * cover;
  }
  // Now and then a leaf cut at an angle shows its face: a curved oval with a midrib.
  const cx = Math.floor(x / 0.5);
  const cy = Math.floor(y / 0.25);
  const hc = hash(((cx % 8) + 8) % 8, ((cy % 8) + 8) % 8, 53);
  if (hc > 0.72) {
    const ox = (cx + 0.5 + (hash(cx & 7, cy & 7, 5) - 0.5) * 0.4) * 0.5;
    const oy = (cy + 0.5 + (hash(cx & 7, cy & 7, 9) - 0.5) * 0.4) * 0.25;
    const ang = (hash(cx & 7, cy & 7, 2) - 0.5) * 0.9;
    let qx = x - ox;
    let qy = y - oy;
    [qx, qy] = [qx * Math.cos(ang) + qy * Math.sin(ang), -qx * Math.sin(ang) + qy * Math.cos(ang)];
    qy += qx * qx * (hash(cx & 7, cy & 7, 7) - 0.5) * 2;
    const e = Math.hypot(qx / 0.22, qy / 0.075);
    const cover = 1 - smooth(0.92, 1.05, e);
    if (cover > 0) {
      leafRgb((hc * 3.7) % 1, rgb);
      const v = (0.95 + 0.2 * vn(x, y, 20, w, h, 43)) * (1 - 0.35 * band(qy, 0.006, 0.006));
      r += (rgb[0] * v - r) * cover; g += (rgb[1] * v - g) * cover; bl += (rgb[2] * v - bl) * cover;
    }
  }
  out[0] = r; out[1] = g; out[2] = bl; out[3] = 1;
}

/** A thin thread where periodic noise crosses 0.5. */
const thread = (n: number, half: number): number => band(n - 0.5, half, half * 0.8);

function oldLeavesTexel(x: number, y: number, out: number[]): void {
  const s = SOIL_TILE_U;
  const cover = blades(x, y, s, s, 50, 6, 14, 0.85, 61, pa);
  let r = 0.06, g = 0.04, b = 0.024;
  const v = 0.8 + 0.3 * vn(x, y, 22, s, s, 63);
  const fr = 0.17 + 0.1 * pa[0], fg = 0.1 + 0.07 * pa[0], fb = 0.05 + 0.03 * pa[0];
  r += (fr * v - r) * cover * 0.8; g += (fg * v - g) * cover * 0.8; b += (fb * v - b) * cover * 0.8;
  const glint = pa[2] * cover * 0.04;
  r += glint; g += glint; b += glint;
  // White mycelium in soft patches, long fine hyphae wandering sideways, pale roots up and down.
  const patchy = smooth(0.62, 0.8, vn(x, y, 2, s, s, 65)) * 0.18 * thread(vn(x, y * 2, 15, s, s * 2, 66), 0.12);
  const hy = Math.max(thread(vn(x, y * 4, 1.5, s, s * 4, 67), 0.006), thread(vn(x * 3, y, 2, s * 3, s, 68), 0.005))
    * smooth(0.5, 0.7, vn(x, y, 1, s, s, 69));
  const root = thread(vn(x * 5, y, 1, s * 5, s, 70), 0.012) * smooth(0.5, 0.7, vn(x, y, 1, s, s, 71));
  r += (0.62 - r) * patchy; g += (0.6 - g) * patchy; b += (0.55 - b) * patchy;
  r += (0.45 - r) * root * 0.75; g += (0.32 - g) * root * 0.75; b += (0.19 - b) * root * 0.75;
  r += (0.88 - r) * hy * 0.6; g += (0.87 - g) * hy * 0.6; b += (0.8 - b) * hy * 0.6;
  out[0] = r; out[1] = g; out[2] = b;
  out[3] = smooth(0.35, 0.65, vn(x, y * 3, 3, s, s * 3, 72));
}

function humusTexel(x: number, y: number, out: number[]): void {
  const s = SOIL_TILE_U;
  const n = vn(x, y, 18, s, s, 81);
  const crumb = smooth(0.55, 0.7, n);
  let r = 0.035 + 0.095 * crumb, g = 0.024 + 0.066 * crumb, b = 0.018 + 0.042 * crumb;
  const edge = band(n - 0.7, 0.04, 0.02) * 0.05;
  r += edge; g += edge * 0.7; b += edge * 0.4;
  const root = thread(vn(x * 4, y, 1.5, s * 4, s, 82), 0.016) * smooth(0.4, 0.6, vn(x, y, 1.5, s, s, 83));
  const hy = thread(vn(x, y * 2, 3.5, s, s * 2, 84), 0.012) * smooth(0.55, 0.7, vn(x, y, 2, s, s, 85));
  r += (0.32 - r) * root * 0.8; g += (0.22 - g) * root * 0.8; b += (0.14 - b) * root * 0.8;
  r += (0.85 - r) * hy * 0.6; g += (0.83 - g) * hy * 0.6; b += (0.76 - b) * hy * 0.6;
  out[0] = r; out[1] = g; out[2] = b; out[3] = 1;
}

function grainTexel(x: number, y: number, out: number[]): void {
  const s = SOIL_TILE_U;
  out[0] = 0.55 * vn(x, y, 26, s, s, 91) + 0.45 * vn(x, y, 61, s, s, 92);
  out[1] = 0.65 * vn(x, y * 2, 1, s, s * 2, 93) + 0.35 * vn(x, y, 3, s, s, 94);
  out[2] = smooth(0.86, 0.9, vn(x, y, 9, s, s, 95));
  out[3] = 1;
}

function bake(wu: number, hu: number, texel: (x: number, y: number, out: number[]) => void, samples: number): THREE.DataTexture {
  const w = wu * TEXELS_PER_U;
  const h = hu * TEXELS_PER_U;
  const data = new Uint8Array(w * h * 4);
  const c = [0, 0, 0, 0];
  const acc = [0, 0, 0, 0];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      acc[0] = acc[1] = acc[2] = acc[3] = 0;
      for (let s = 0; s < samples * samples; s++) {
        const dx = ((s % samples) + 0.5) / samples;
        const dy = (Math.floor(s / samples) + 0.5) / samples;
        texel((i + dx) / TEXELS_PER_U, (j + dy) / TEXELS_PER_U, c);
        for (let k = 0; k < 4; k++) acc[k] += c[k];
      }
      const o = (j * w + i) * 4;
      for (let k = 0; k < 4; k++) data[o + k] = Math.round(clamp01(acc[k] / (samples * samples)) * 255);
    }
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  // Mipmaps: the far face is minified without sparkling. Nearest mip (no blend between levels) is
  // the cheaper filter in software GL.
  t.minFilter = THREE.LinearMipmapNearestFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

export interface SoilTiles {
  readonly litter: THREE.DataTexture;
  readonly oldLeaves: THREE.DataTexture;
  readonly humus: THREE.DataTexture;
  readonly grain: THREE.DataTexture;
}

/** Paints the four tiles (once, at load: a few hundred milliseconds on a Chromebook). */
export function createSoilTiles(): SoilTiles {
  return {
    litter: bake(LITTER_TILE_U[0], LITTER_TILE_U[1], litterTexel, 1),
    oldLeaves: bake(SOIL_TILE_U, SOIL_TILE_U, oldLeavesTexel, 1),
    humus: bake(SOIL_TILE_U, SOIL_TILE_U, humusTexel, 1),
    grain: bake(SOIL_TILE_U, SOIL_TILE_U, grainTexel, 1),
  };
}

/** Exported for tests: one texel of each pattern (x, y in units within the tile). */
export const TEXELS = { litter: litterTexel, oldLeaves: oldLeavesTexel, humus: humusTexel, grain: grainTexel };
```

Create `src/underground/cutFaceGlsl.ts`:

```ts
import { GRADE_GLSL } from '../render/paintedMaterial';
import { glslFloat as f } from '../render/glslNumber';
import { LITTER_TILE_U, SOIL_TILE_U } from './soilTiles';

/**
 * The cut face's shaders (V2 spec 5): one draw over a strip in the cut's plane. Each vertex
 * carries its plane point (u, v) and its column's layer boundaries (litter top, then the tops of
 * F, H, A, E and B), so the boundaries are drawn exactly where the soil grid has them. Each layer
 * reads its own baked pattern tile (soilTiles.ts: pattern, not only colour, spec 5.3); A, E and
 * B share the grain tile in their own colours and scales. The soil grid's data texture adds the
 * tunnels, castings, mixed walls and damp. Darker with depth; the bottom darkens away. Three
 * texture reads a pixel (more only inside tunnels); no discard, no extra pass.
 */
export const CUT_VERTEX = /* glsl */ `
  attribute vec2 aPlane;
  attribute vec4 aBoundsA;
  attribute vec2 aBoundsB;
  varying vec2 vPlane;
  varying vec4 vBoundsA;
  varying vec2 vBoundsB;
  void main() {
    vPlane = aPlane;
    vBoundsA = aBoundsA;
    vBoundsB = aBoundsB;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;

export const CUT_FRAGMENT = /* glsl */ `
  uniform sampler2D uNoise;
  uniform sampler2D uSoil;
  uniform sampler2D uLitter;
  uniform sampler2D uOldLeaves;
  uniform sampler2D uHumus;
  uniform sampler2D uGrain;
  uniform vec4 uGrid;
  uniform vec2 uPlay;
  uniform float uBottom;
  uniform vec3 uLightColor;
  uniform vec2 uResolution;
  varying vec2 vPlane;
  varying vec4 vBoundsA;
  varying vec2 vBoundsB;
  ${GRADE_GLSL}

  // Mineral soil from the grain tile: sand grain (r), mottles (g), pebbles (b).
  vec3 mineral(vec2 q, vec3 base, vec3 mottle, float mot) {
    vec4 g = texture2D(uGrain, q);
    vec3 c = base * (0.82 + 0.36 * g.r);
    c = mix(c, mottle, smoothstep(0.55, 0.72, g.g) * mot);
    return mix(c, base * 1.5 + 0.05, g.b * 0.7);
  }

  void main() {
    vec2 p = vPlane;
    float top = vBoundsA.x;
    // One broad noise read: the boundaries wander a little (no ruler lines) and the paint varies.
    vec4 br = texture2D(uNoise, p * 0.23);
    float y = p.y + (br.b - 0.5) * 0.16 + (br.g - 0.5) * 0.05;
    // The same read bends the tiles a little, so their repeats never line up.
    vec2 q = p + (br.ra - 0.5) * vec2(0.45, 0.12);
    vec3 col;
    if (y > vBoundsA.y) {
      col = texture2D(uLitter, q / vec2(${f(LITTER_TILE_U[0])}, ${f(LITTER_TILE_U[1])})).rgb;
      // Lower leaves are older: duller and darker.
      float older = clamp((top - y) / max(0.01, top - vBoundsA.y), 0.0, 1.0);
      col = mix(col, col * vec3(0.55, 0.5, 0.48) + vec3(0.08, 0.05, 0.03), older * 0.6);
    } else if (y > vBoundsA.z) {
      vec4 t = texture2D(uOldLeaves, q / ${f(SOIL_TILE_U)});
      col = t.rgb;
      // Moss creeping in at F's top.
      col = mix(col, vec3(0.24, 0.36, 0.08), smoothstep(0.16, 0.02, vBoundsA.y - p.y) * t.a * 0.85);
    } else if (y > vBoundsA.w) {
      col = texture2D(uHumus, q / ${f(SOIL_TILE_U)}).rgb;
    } else if (y > vBoundsB.x) {
      col = mineral(q / ${f(SOIL_TILE_U)}, vec3(0.2, 0.155, 0.12), vec3(0.12, 0.09, 0.07), 0.6);
    } else if (y > vBoundsB.y) {
      col = mineral(q / ${f(SOIL_TILE_U * 1.25)} + 0.37, vec3(0.6, 0.57, 0.5), vec3(0.72, 0.69, 0.6), 0.5);
    } else {
      col = mineral(q / ${f(SOIL_TILE_U * 0.8)} + 0.71, vec3(0.44, 0.26, 0.13), vec3(0.62, 0.34, 0.12), 0.75);
    }

    // The soil grid: tunnels, castings, mixed walls, damp.
    vec2 g = (p - uGrid.xy) * uGrid.zw;
    float inside = step(0.0, g.x) * step(g.x, 1.0) * step(0.0, g.y) * step(g.y, 1.0);
    vec4 s = texture2D(uSoil, g) * inside;
    col *= 1.0 - 0.22 * s.a;
    if (s.b > 0.01) {
      // Mixed walls: darker and crumbly (the humus tile's crumbs).
      vec3 crumbs = texture2D(uHumus, p / ${f(SOIL_TILE_U)} + 0.5).rgb;
      col = mix(col, vec3(0.03, 0.02, 0.015) + crumbs * 0.9, smoothstep(0.3, 0.7, s.b) * 0.8);
    }
    if (s.g > 0.01) {
      // Castings: dark granules, darker for a gut full of leaves.
      float grain = texture2D(uGrain, p / ${f(SOIL_TILE_U)} + 0.2).r;
      vec3 castCol = mix(vec3(0.22, 0.15, 0.1), vec3(0.06, 0.042, 0.03), clamp(s.g * 1.4 - 0.2, 0.0, 1.0));
      col = mix(col, castCol * (0.5 + grain), smoothstep(0.15, 0.35, s.g));
    }
    if (s.r > 0.01) {
      // The tunnel, cut in half: its back wall in shadow, darkest at the sides where the wall
      // turns away, its lower wall catching a little light. Four taps round the pixel smooth the
      // grid's 1 mm cells into a round bore.
      vec2 dx = vec2(0.06 * uGrid.z, 0.0);
      vec2 dy = vec2(0.0, 0.06 * uGrid.w);
      float up = texture2D(uSoil, g + dy).r;
      float dn = texture2D(uSoil, g - dy).r;
      float o = (s.r * 2.0 + up + dn + texture2D(uSoil, g + dx).r + texture2D(uSoil, g - dx).r) / 6.0;
      float open = smoothstep(0.3, 0.7, o) * inside;
      float centre = smoothstep(0.55, 1.0, o);
      vec3 hollow = col * (0.16 + 0.3 * centre) + vec3(0.05, 0.032, 0.02) * smoothstep(0.1, 0.9, up - dn);
      col = mix(col, hollow, open);
    }

    // Warm light from the surface fades with depth; the bottom darkens away (burrows go deeper).
    float below = top - p.y;
    col *= mix(1.0, 0.45, smoothstep(0.0, 6.0, below));
    col += col * uLightColor * 0.3 * smoothstep(1.2, 0.0, below);
    col = mix(col, vec3(0.012, 0.008, 0.005), smoothstep(uBottom + 2.5, uBottom, p.y));
    // Beyond the playable slab the soil dims a little.
    float beyond = max(uPlay.x - p.x, p.x - uPlay.y);
    col *= mix(1.0, 0.55, smoothstep(0.0, 2.0, beyond));
    // Painted variation: broad value patches and a warm/cool drift.
    col *= 0.9 + 0.2 * br.r;
    col *= mix(vec3(1.05, 0.99, 0.9), vec3(0.93, 0.98, 1.04), br.a);
    gl_FragColor = vec4(paintedGrade(pow(col, vec3(2.2))), 1.0);
    #include <colorspace_fragment>
  }
`;
```

Create `src/underground/cutFace.ts`:

```ts
import * as THREE from 'three';
import { sharedLighting } from '../render/paintedMaterial';
import {
  BOUNDS, COLUMN_STEP, FACE_EXTRA, SLAB_HALF, SLAB_DEPTH, B_TOP, B_F, B_H, B_A, B_E, B_B, slabX, slabZ, type Slab,
} from './slab';
import { GRID_W, GRID_H, packRows, takeDirty, type SoilGrid } from './soilGrid';
import { CUT_FRAGMENT, CUT_VERTEX } from './cutFaceGlsl';
import { createSoilTiles } from './soilTiles';

/** Most columns any slab's face has (the full drawn width). */
const MAX_COLS = Math.ceil((2 * (SLAB_HALF + FACE_EXTRA)) / COLUMN_STEP) + 2;
/** The face reaches this far below the slab's bottom (no gap where the bottom darkens away). */
const BELOW = 0.5;

export interface CutFace {
  readonly mesh: THREE.Mesh;
  /** Lays the face along a new slab (positions and boundaries rewritten in place). */
  setSlab(s: Slab, g: SoilGrid): void;
  /** Uploads the grid rows that changed since the last call (all of them after setSlab). */
  upload(g: SoilGrid): void;
}

/**
 * The cut face (V2 spec 5, 10): one strip mesh and one shader, built once at load at its biggest
 * and reused for every slab, with the layers' pattern tiles painted once (soilTiles.ts); the soil
 * grid is a 160 x 120 data texture of which only changed rows are uploaded.
 */
export function createCutFace(): CutFace {
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(MAX_COLS * 2 * 3), 3);
  const plane = new THREE.BufferAttribute(new Float32Array(MAX_COLS * 2 * 2), 2);
  const ba = new THREE.BufferAttribute(new Float32Array(MAX_COLS * 2 * 4), 4);
  const bb = new THREE.BufferAttribute(new Float32Array(MAX_COLS * 2 * 2), 2);
  const index = new Uint16Array((MAX_COLS - 1) * 6);
  for (let c = 0; c < MAX_COLS - 1; c++) {
    // Vertex 2c is the column's top, 2c + 1 its bottom.
    const a = 2 * c;
    index.set([a, a + 1, a + 2, a + 2, a + 1, a + 3], c * 6);
  }
  geo.setAttribute('position', pos);
  geo.setAttribute('aPlane', plane);
  geo.setAttribute('aBoundsA', ba);
  geo.setAttribute('aBoundsB', bb);
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.boundingSphere = new THREE.Sphere();

  const bytes = new Uint8Array(GRID_W * GRID_H * 4);
  const soil = new THREE.DataTexture(bytes, GRID_W, GRID_H, THREE.RGBAFormat, THREE.UnsignedByteType);
  soil.magFilter = THREE.LinearFilter;
  soil.minFilter = THREE.LinearFilter;
  soil.generateMipmaps = false;
  soil.colorSpace = THREE.NoColorSpace;
  soil.needsUpdate = true;
  // One fixed update range per row, so marking rows dirty allocates nothing (three merges none
  // across rows: each range is a single row, as WebGLTextures' partial upload requires).
  const rows = Array.from({ length: GRID_H }, (_, r) => ({ start: r * GRID_W * 4, count: GRID_W * 4 }));
  const dirty = { lo: 0, hi: -1 };

  const tiles = createSoilTiles();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uNoise: sharedLighting.uNoise,
      uLitter: { value: tiles.litter },
      uOldLeaves: { value: tiles.oldLeaves },
      uHumus: { value: tiles.humus },
      uGrain: { value: tiles.grain },
      uLightColor: sharedLighting.uLightColor,
      uResolution: sharedLighting.uResolution,
      uSoil: { value: soil },
      uGrid: { value: new THREE.Vector4(-SLAB_HALF, 0, 1 / (2 * SLAB_HALF), 1 / SLAB_DEPTH) },
      uPlay: { value: new THREE.Vector2(-SLAB_HALF, SLAB_HALF) },
      uBottom: { value: 0 },
    },
    vertexShader: CUT_VERTEX,
    fragmentShader: CUT_FRAGMENT,
    // The camera may be on either side of the cut: both faces draw (a side switch would recompile).
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'cutFace';
  let full = true;

  return {
    mesh,
    setSlab(s, g) {
      const p = pos.array as Float32Array;
      const q = plane.array as Float32Array;
      const A = ba.array as Float32Array;
      const B = bb.array as Float32Array;
      const bottom = s.bottom - BELOW;
      for (let c = 0; c < s.cols; c++) {
        const u = s.faceLo + c * COLUMN_STEP;
        const x = slabX(s, u);
        const z = slabZ(s, u);
        const o = c * BOUNDS;
        const top = s.bounds[o + B_TOP];
        for (let k = 0; k < 2; k++) {
          const v = 2 * c + k;
          const y = k === 0 ? top : bottom;
          p[v * 3] = x; p[v * 3 + 1] = y; p[v * 3 + 2] = z;
          q[v * 2] = u; q[v * 2 + 1] = y;
          A[v * 4] = top; A[v * 4 + 1] = s.bounds[o + B_F]; A[v * 4 + 2] = s.bounds[o + B_H]; A[v * 4 + 3] = s.bounds[o + B_A];
          B[v * 2] = s.bounds[o + B_E]; B[v * 2 + 1] = s.bounds[o + B_B];
        }
      }
      for (const a of [pos, plane, ba, bb]) a.needsUpdate = true;
      geo.setDrawRange(0, (s.cols - 1) * 6);
      const mid = (s.faceLo + s.faceHi) / 2;
      geo.boundingSphere!.center.set(slabX(s, mid), (s.topMax + bottom) / 2, slabZ(s, mid));
      geo.boundingSphere!.radius = Math.hypot((s.faceHi - s.faceLo) / 2, (s.topMax - bottom) / 2);
      const m = material.uniforms;
      (m.uGrid.value as THREE.Vector4).set(-SLAB_HALF, g.v0, 1 / (2 * SLAB_HALF), 1 / SLAB_DEPTH);
      (m.uPlay.value as THREE.Vector2).set(s.playLo, s.playHi);
      m.uBottom.value = s.bottom;
      full = true;
    },
    upload(g) {
      takeDirty(g, dirty);
      if (dirty.lo > dirty.hi) return;
      packRows(g, bytes, dirty.lo, dirty.hi);
      if (!full) for (let r = dirty.lo; r <= dirty.hi; r++) soil.updateRanges.push(rows[r]);
      full = false;
      soil.needsUpdate = true;
    },
  };
}
```

- [ ] **Step 4: Run the checks**

```bash
npx tsc --noEmit
npx vitest run tests/unit/soilTiles.test.ts tests/unit/cutFace.test.ts
npx vitest run
```

Expected: 3 passed; the suite **+12 files, +58 tests**. (The shader compiles for the first time in Task 17; this source, free of GLSL reserved words, compiled cleanly in the scratch build.)

- [ ] **Step 5: Commit**

```bash
git add src/underground/soilTiles.ts src/underground/cutFaceGlsl.ts src/underground/cutFace.ts tests/unit/soilTiles.test.ts tests/unit/cutFace.test.ts
git commit -m "feat(underground): the cut face, painted layer by layer from baked tiles and the soil grid" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Stones, roots, life hints and moss in the cut (rendering)

**Files:**
- Create: `src/underground/cutShapes.ts`
- Create: `src/underground/slabProps.ts`
- Test: `tests/unit/slabProps.test.ts`

Everything solid or alive in the cut, in one merged mesh on the forest's own prop material (`createPropMaterial()`, the program the ground props already compile: no new shader). `cutShapes.ts` writes lumpy blobs and tubes placed by plane point and depth toward the camera, plus the snail shell, ground beetle, wolf spider, puffball, moss with red-stalked capsules, and the log's section (spec 5.2). Half-sunk shapes lean their normals toward the camera so the forest's warm rim light does not ring them in the dark soil; colours darken with depth as the face does. `slabProps.ts` builds the whole set through a `MeshWriter` once per dig and copies it into preallocated buffers. The test checks a sweep of slabs, including one through a rock and one through the log, fits the buffers.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/slabProps.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { writeSlabProps, MAX_VERTS, MAX_INDEX } from '../../src/underground/slabProps';
import { createSlab } from '../../src/underground/slab';
import { createSolids, placeSolids } from '../../src/underground/solids';
import { footprints } from '../../src/surface/obstacles';
import { mulberry32 } from '../../src/core/random';

describe('the slab\'s stones, roots and life fit their one mesh', () => {
  it('for a sweep of slabs, including ones through a rock and through the log', () => {
    const rand = mulberry32(5);
    const spots: [number, number, number][] = [];
    for (let i = 0; i < 30; i++) spots.push([rand() * 30 - 15, rand() * 30 - 15, rand() * 6.3]);
    const { log, round } = footprints();
    spots.push([log.x - log.dz * (log.r + 2), log.z + log.dx * (log.r + 2), Math.atan2(log.dz, -log.dx)]);
    spots.push([round[round.length - 4] + 3, round[round.length - 3], -Math.PI / 2]);
    let most = 0;
    for (const [x, z, h] of spots) {
      const s = createSlab(x, z, h, 1, Math.floor(rand() * 1e6));
      const o = placeSolids(s, createSolids());
      const w = writeSlabProps(s, o);
      expect(w.vertexCount).toBeLessThan(MAX_VERTS);
      expect(w.idx.length).toBeLessThan(MAX_INDEX);
      most = Math.max(most, w.vertexCount);
    }
    expect(most).toBeGreaterThan(1000);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/unit/slabProps.test.ts`
Expected: FAIL, "Failed to resolve import ../../src/underground/slabProps".

- [ ] **Step 3: Implement**

Create `src/underground/cutShapes.ts`:

```ts
import * as THREE from 'three';
import { icosphere, type MeshWriter } from '../surface/meshWriter';
import { PROP } from '../surface/propGeometry';
import type { Slab } from './slab';

/**
 * Small shapes for the cut (V2 spec 5.2), written into a MeshWriter for the prop material
 * ('aProp': linear rgb, then kind + parameter). Everything is placed by its plane point (u, v)
 * and how far it stands out toward the camera (d, along the slab's normal). Build-time only
 * (once per dig): these allocate.
 */
const TAU = Math.PI * 2;
const col = new THREE.Color();

/** World position of plane point (u, v) standing d toward the camera. */
function at(s: Slab, u: number, v: number, d: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(s.ox + s.tx * u + s.nx * d, v, s.oz + s.tz * u + s.nz * d);
}

const tmp = new THREE.Vector3();

/** How the face darkens with depth below the litter top (cutFaceGlsl's rule), for baked colours. */
export function depthShade(below: number): number {
  const t = Math.min(1, Math.max(0, below / 6));
  return 1 - 0.58 * t * t * (3 - 2 * t);
}

/**
 * A lumpy ellipsoid: radii ru along the cut, rv up, rd toward the camera, turned `rot` in the
 * plane, its centre `d` toward the camera. `shade` multiplies the colour (depth).
 */
export function writeBlob(
  w: MeshWriter, s: Slab, u: number, v: number, d: number, ru: number, rv: number, rd: number, rot: number,
  hex: string, kind: number, seed: number, shade = 1, topHex?: string, faceCamera = 0,
): void {
  const { pos, index } = icosphere();
  const first = w.vertexCount;
  const firstIdx = w.idx.length;
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  for (let i = 0; i < pos.length; i += 3) {
    const lump = 1 + 0.12 * Math.sin(2.7 * pos[i] + 1.9 * pos[i + 2] + seed * 17) * Math.cos(2.3 * pos[i + 1] + seed * 5);
    const a = pos[i] * ru * lump;
    const b = pos[i + 1] * rv * lump;
    col.set(topHex && pos[i + 1] > 0.35 ? topHex : hex).multiplyScalar(shade);
    at(s, u + a * c - b * sn, v + a * sn + b * c, d + pos[i + 2] * rd * lump, tmp);
    w.vertex(tmp.x, tmp.y, tmp.z, 0, 1, 0, [col.r, col.g, col.b, kind]);
  }
  for (let i = 0; i < index.length; i += 3) w.tri(first + index[i], first + index[i + 1], first + index[i + 2]);
  w.smoothNormals(first, firstIdx);
  // Half sunk in the soil, a blob shows only its front: lean its normals toward the camera so the
  // forest's warm rim light does not ring it in the dark soil.
  if (faceCamera > 0) {
    for (let v = first * 3; v < w.nor.length; v += 3) {
      const x = w.nor[v] + s.nx * faceCamera;
      const y = w.nor[v + 1];
      const z = w.nor[v + 2] + s.nz * faceCamera;
      const l = Math.hypot(x, y, z) || 1;
      w.nor[v] = x / l; w.nor[v + 1] = y / l; w.nor[v + 2] = z / l;
    }
  }
}

/**
 * A tube through plane points (u[i], v[i]) at depth d, radius r[i], `sides` around: roots,
 * stalks, legs, the snail's whorl. Colour per point from `hex` (or `hexes[i]`), times `shade`.
 */
export function writeTube(
  w: MeshWriter, s: Slab, u: readonly number[], v: readonly number[], d: number, r: readonly number[],
  hex: string, kind: number, sides = 6, shade = 1, hexes?: readonly string[], faceCamera = 0,
): void {
  const first = w.vertexCount;
  const n = u.length;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    let tu = u[b] - u[a];
    let tv = v[b] - v[a];
    const tl = Math.hypot(tu, tv) || 1;
    tu /= tl;
    tv /= tl;
    col.set(hexes ? hexes[i] : hex).multiplyScalar(shade);
    for (let k = 0; k <= sides; k++) {
      const ang = (k / sides) * TAU;
      // Around the tube: in-plane side (-tv, tu) and toward the camera.
      const side = Math.cos(ang) * r[i];
      const out = Math.sin(ang) * r[i];
      at(s, u[i] - tv * side, v[i] + tu * side, d + out, tmp);
      // Normals round the tube, leaned toward the camera by faceCamera (see writeBlob).
      const nx = s.nx * (Math.sin(ang) + faceCamera) + s.tx * -tv * Math.cos(ang);
      const nz = s.nz * (Math.sin(ang) + faceCamera) + s.tz * -tv * Math.cos(ang);
      w.vertex(tmp.x, tmp.y, tmp.z, nx, tu * Math.cos(ang), nz, [col.r, col.g, col.b, kind + Math.min(0.99, i / (n - 1))]);
    }
  }
  w.grid(first, n, sides + 1, true);
}

/** A land snail's shell: a tightening spiral whorl, tan with brown bands. */
export function writeSnail(w: MeshWriter, s: Slab, u: number, v: number, size: number, shade: number): void {
  const us: number[] = [];
  const vs: number[] = [];
  const rs: number[] = [];
  const hs: string[] = [];
  for (let i = 0; i <= 22; i++) {
    const t = i / 22;
    const a = t * TAU * 2.2;
    const rad = size * (1 - t * 0.85);
    us.push(u + Math.cos(a) * rad * 0.9);
    vs.push(v + Math.sin(a) * rad * 0.75);
    rs.push(size * 0.55 * (1 - t * 0.8));
    hs.push(i % 4 < 2 ? '#a77a45' : '#6b4424');
  }
  writeTube(w, s, us, vs, 0.02, rs, '#a77a45', PROP.plain, 7, shade, hs);
}

/** A ground beetle: glossy dark oval body, a small head, six legs. */
export function writeBeetle(w: MeshWriter, s: Slab, u: number, v: number, size: number, dir: number, shade: number): void {
  const fu = Math.cos(dir);
  const fv = Math.sin(dir);
  writeBlob(w, s, u, v, 0.02, size, size * 0.55, size * 0.5, dir, '#1d1712', PROP.plain, 3, shade);
  writeBlob(w, s, u + fu * size * 1.1, v + fv * size * 1.1, 0.02, size * 0.35, size * 0.3, size * 0.3, dir, '#15100c', PROP.plain, 5, shade);
  for (let k = -1; k <= 1; k++) {
    for (const side of [-1, 1]) {
      const bu = u + fu * k * size * 0.5;
      const bv = v + fv * k * size * 0.5;
      writeTube(w, s, [bu, bu - fv * side * size * 0.8 + fu * k * size * 0.3], [bv, bv + fu * side * size * 0.8 + fv * k * size * 0.3], 0.02 + side * 0.03, [size * 0.07, size * 0.05], '#2a2018', PROP.plain, 4, shade);
    }
  }
}

/** A wolf spider resting on the litter: two body parts and eight bent legs. */
export function writeSpider(w: MeshWriter, s: Slab, u: number, v: number, size: number, shade: number): void {
  writeBlob(w, s, u - size * 0.5, v + size * 0.45, 0.03, size * 0.65, size * 0.45, size * 0.45, 0, '#4a3828', PROP.plain, 7, shade);
  writeBlob(w, s, u + size * 0.35, v + size * 0.4, 0.03, size * 0.4, size * 0.32, size * 0.32, 0, '#3a2c20', PROP.plain, 9, shade);
  for (let k = 0; k < 4; k++) {
    for (const side of [-1, 1]) {
      const bu = u + size * (0.15 + 0.12 * k);
      const reach = side * size * (1.2 + 0.2 * k);
      writeTube(w, s, [bu, bu + reach * 0.5, bu + reach], [v + size * 0.4, v + size * 0.85, v], 0.03 + (k - 1.5) * 0.03, [size * 0.06, size * 0.05, size * 0.03], '#5a4430', PROP.plain, 4, shade);
    }
  }
}

/** A puffball: a pale round ball with a darker crown and a pore. */
export function writePuffball(w: MeshWriter, s: Slab, u: number, v: number, size: number): void {
  writeBlob(w, s, u, v + size * 0.85, 0.05, size, size * 0.85, Math.min(size, 0.35), 0, '#d9cfb8', PROP.plain, 11, 1, '#b8a888');
}

/** Moss stems and a few red-stalked spore capsules along the cut's top (spec 5.2), from u0 to u1. */
export function writeMoss(w: MeshWriter, s: Slab, u0: number, u1: number, topAt: (u: number) => number, rand: () => number): void {
  for (let u = u0; u < u1; u += 0.07 + rand() * 0.06) {
    const v = topAt(u) - 0.05;
    const h = 0.12 + rand() * 0.18;
    const lean = (rand() - 0.5) * 0.6;
    writeTube(w, s, [u, u + lean * h * 0.5, u + lean * h], [v, v + h * 0.6, v + h], (rand() - 0.5) * 0.3, [0.03, 0.025, 0.008], rand() < 0.5 ? '#5f8a24' : '#7aa22e', PROP.plant, 3);
    if (rand() < 0.12) {
      const sh = 0.35 + rand() * 0.25;
      const su = u + (rand() - 0.5) * 0.15;
      writeTube(w, s, [su, su + 0.03, su + 0.06], [v, v + sh * 0.5, v + sh], 0.05, [0.012, 0.01, 0.008], '#9c2a1a', PROP.plant, 3);
      writeBlob(w, s, su + 0.08, v + sh + 0.03, 0.05, 0.055, 0.025, 0.025, 0.6, '#6a4220', PROP.plain, 13);
    }
  }
}

/** The log cut through: wood in rings inside a bark rim, moss on top. */
export function writeLogSection(w: MeshWriter, s: Slab, u: number, v: number, ru: number, rv: number): void {
  const first = w.vertexCount;
  const rings = 7;
  const seg = 18;
  at(s, u, v, 0.06, tmp);
  w.vertex(tmp.x, tmp.y, tmp.z, s.nx, 0, s.nz, [0.55, 0.42, 0.26, PROP.plain]);
  for (let r = 1; r <= rings; r++) {
    const f = r / rings;
    col.set(r === rings ? '#3b2a1c' : r % 2 ? '#a9875a' : '#93714a');
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * TAU;
      at(s, u + Math.cos(a) * ru * f, v + Math.sin(a) * rv * f, 0.06, tmp);
      w.vertex(tmp.x, tmp.y, tmp.z, s.nx, 0, s.nz, [col.r, col.g, col.b, PROP.plain]);
    }
  }
  for (let k = 0; k < seg; k++) w.triFacing(first, first + 1 + k, first + 1 + ((k + 1) % seg), s.nx, 0, s.nz);
  for (let r = 1; r < rings; r++) {
    for (let k = 0; k < seg; k++) {
      const a = first + 1 + (r - 1) * seg + k;
      const b = first + 1 + (r - 1) * seg + ((k + 1) % seg);
      w.triFacing(a, a + seg, b, s.nx, 0, s.nz);
      w.triFacing(b, a + seg, b + seg, s.nx, 0, s.nz);
    }
  }
}
```

Create `src/underground/slabProps.ts`:

```ts
import * as THREE from 'three';
import { mulberry32 } from '../core/random';
import { MeshWriter } from '../surface/meshWriter';
import { PROP } from '../surface/propGeometry';
import { createPropMaterial } from '../render/propMaterial';
import { boundaryAt, B_TOP, B_F, type Slab } from './slab';
import { STONE_STRIDE, ROOT_STRIDE, type Solids } from './solids';
import {
  depthShade, writeBeetle, writeBlob, writeLogSection, writeMoss, writePuffball, writeSnail, writeSpider, writeTube,
} from './cutShapes';

/** Room for the biggest slab's stones, roots, hints and moss (tests/unit/slabProps.test.ts checks a sweep fits). */
export const MAX_VERTS = 16000;
export const MAX_INDEX = 48000;
const STONE_HEX = ['#a8a092', '#b3a697', '#968f84', '#bcae9a'];

export interface SlabProps {
  readonly mesh: THREE.Mesh;
  /** Rewrites the mesh for a new slab (once per dig: builds through a MeshWriter, then copies in place). */
  setSlab(s: Slab, o: Solids): void;
}

/**
 * Everything solid or alive in the cut, in one draw on the forest's prop material (so no new
 * shader): stones, big roots, the log's section, moss with red-stalked capsules at the surface
 * line, and the static hints of V2's vote (spec 5.2): a snail shell in the litter, a beetle, a
 * spider on the litter's top and a puffball at the surface line. Colours are darkened with depth
 * as the face is.
 */
export function createSlabProps(): SlabProps {
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(MAX_VERTS * 3), 3);
  const nor = new THREE.BufferAttribute(new Float32Array(MAX_VERTS * 3), 3);
  const prop = new THREE.BufferAttribute(new Float32Array(MAX_VERTS * 4), 4);
  const index = new THREE.BufferAttribute(new Uint16Array(MAX_INDEX), 1);
  geo.setAttribute('position', pos);
  geo.setAttribute('normal', nor);
  geo.setAttribute('aProp', prop);
  geo.setIndex(index);
  geo.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(geo, createPropMaterial());
  mesh.name = 'slabProps';

  return {
    mesh,
    setSlab(s, o) {
      const w = writeSlabProps(s, o);
      const nv = Math.min(MAX_VERTS, w.vertexCount);
      (pos.array as Float32Array).set(w.pos.slice(0, nv * 3));
      (nor.array as Float32Array).set(w.nor.slice(0, nv * 3));
      (prop.array as Float32Array).set(w.extra.slice(0, nv * 4));
      let ni = 0;
      const idx = index.array as Uint16Array;
      // Whole triangles only, and only those whose vertices fit.
      for (let t = 0; t + 2 < w.idx.length && ni + 3 <= MAX_INDEX; t += 3) {
        if (w.idx[t] >= nv || w.idx[t + 1] >= nv || w.idx[t + 2] >= nv) continue;
        idx[ni++] = w.idx[t]; idx[ni++] = w.idx[t + 1]; idx[ni++] = w.idx[t + 2];
      }
      for (const a of [pos, nor, prop, index]) a.needsUpdate = true;
      geo.setDrawRange(0, ni);
      geo.computeBoundingSphere();
    },
  };
}

const shadeAt = (s: Slab, u: number, v: number) => depthShade(boundaryAt(s, B_TOP, u) - v);

/** Everything the slab shows, written into a fresh MeshWriter (once per dig). */
export function writeSlabProps(s: Slab, o: Solids): MeshWriter {
  const w = new MeshWriter('aProp', 4);
  writeSolids(w, s, o);
  writeLife(w, s);
  return w;
}

function writeSolids(w: MeshWriter, s: Slab, o: Solids): void {
  for (let i = 0; i < o.stoneCount; i++) {
    const k = i * STONE_STRIDE;
    const [u, v, r, sx, sy, rot, shade, section] = o.stones.subarray(k, k + STONE_STRIDE);
    const rd = Math.min(0.8 * r, 0.5);
    if (section) writeBlob(w, s, u, v, -0.3 * rd, r, r * sy, rd, 0, '#8f877b', PROP.stone, i);
    else writeBlob(w, s, u, v, -0.3 * rd, r * sx, r * sy, rd, rot, STONE_HEX[Math.floor(shade * 4) % 4], PROP.plain, i, 0.4 + 0.6 * shadeAt(s, u, v), undefined, 1.5);
  }
  // Big roots: a tapering tube through each chain of segments.
  let us: number[] = [];
  let vs: number[] = [];
  let rs: number[] = [];
  const flush = () => {
    if (us.length > 1) writeTube(w, s, us, vs, 0, rs, '#6e4a2c', PROP.plain, 7, 0.5 + 0.5 * shadeAt(s, us[0], vs[0]), undefined, 1.2);
    us = []; vs = []; rs = [];
  };
  for (let i = 0; i < o.rootCount; i++) {
    const k = i * ROOT_STRIDE;
    const joined = us.length > 0 && Math.hypot(o.roots[k] - us[us.length - 1], o.roots[k + 1] - vs[vs.length - 1]) < 1e-6;
    if (!joined) {
      flush();
      us.push(o.roots[k]); vs.push(o.roots[k + 1]); rs.push(o.roots[k + 2]);
    }
    us.push(o.roots[k + 3]); vs.push(o.roots[k + 4]); rs.push(o.roots[k + 5]);
  }
  flush();
  if (o.log.rx > 0) writeLogSection(w, s, o.log.u, o.log.v, o.log.rx, o.log.ry);
}

/** The static life hints and the moss, placed per slab (deterministic). */
function writeLife(w: MeshWriter, s: Slab): void {
  const rand = mulberry32(s.seed ^ 0x2545f491);
  const span = s.playHi - s.playLo;
  const pick = () => s.playLo + 0.8 + rand() * (span - 1.6);
  const top = (u: number) => boundaryAt(s, B_TOP, u);
  const floor = (u: number) => boundaryAt(s, B_F, u);
  // A snail shell in the litter, a beetle low in the litter or in F, a spider on the litter's top.
  let u = pick();
  writeSnail(w, s, u, floor(u) + 0.45 * (top(u) - floor(u)), 0.13, 1);
  u = pick();
  writeBeetle(w, s, u, floor(u) + 0.05, 0.12, rand() * Math.PI, 0.9);
  u = pick();
  writeSpider(w, s, u, top(u) - 0.02, 0.1, 1);
  // A puffball where the cut meets one, at the surface line.
  u = pick();
  writePuffball(w, s, u, top(u) - 0.1, 0.22);
  // Moss carpets: two or three stretches along the top edge.
  const carpets = 2 + Math.floor(rand() * 2);
  for (let c = 0; c < carpets; c++) {
    const a = pick();
    writeMoss(w, s, a, Math.min(s.playHi, a + 1 + rand() * 1.5), top, rand);
  }
}
```

- [ ] **Step 4: Run the checks**

```bash
npx tsc --noEmit
npx vitest run tests/unit/slabProps.test.ts
npx vitest run
```

Expected: 1 passed; the suite **+13 files, +59 tests**.

- [ ] **Step 5: Commit**

```bash
git add src/underground/cutShapes.ts src/underground/slabProps.ts tests/unit/slabProps.test.ts
git commit -m "feat(underground): stones, roots, a snail, beetle, spider, puffball and moss in the cut" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: The crawl can start anywhere

**Files:**
- Modify: `src/core/vec.ts`
- Modify: `src/game/crawl.ts` **(Plan A changed this file: re-read it first)**
- Test: `tests/unit/crawlRelocate.test.ts`

When the worm comes up (Task 15), the surface crawl must take over exactly where the worm lies on the surface, facing along the cut, its follow camera settled behind it. `reset()` gains two optional arguments: body points (head first) and a heading. With them, the same fresh start as at the spawn happens there (camera settled, leaf map cleared and centred on the body, hero leaves scattered round the head); without them it is byte-for-byte the old spawn reset (tested). To keep `crawl.ts` from growing (handoff rule), its two small vector helpers move to `src/core/vec.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/crawlRelocate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Crawl, SPACING } from '../../src/game/crawl';
import { cameraTarget } from '../../src/surface/followCamera';
import { CAM_OPTS } from '../../src/game/cameraClearance';
import type { Vec3 } from '../../src/core/vec';

describe('the crawl can start anywhere (the worm coming up out of the cut)', () => {
  it('reset(count, points, heading) puts the body there, its camera settled behind it', () => {
    const c = new Crawl();
    const heading = 1.1;
    const pts: Vec3[] = Array.from({ length: 16 }, (_, i) => ({ x: 3 - Math.sin(heading) * SPACING * i, y: 9, z: 4 - Math.cos(heading) * SPACING * i }));
    c.reset(c.hero.count, pts, heading);
    for (let i = 0; i < 16; i++) {
      expect(c.body[i].x).toBeCloseTo(pts[i].x, 9);
      expect(c.body[i].z).toBeCloseTo(pts[i].z, 9);
      // Heights come from the surface, not the points given.
      expect(c.body[i].y).toBeLessThan(2);
    }
    expect(c.motion.heading).toBe(heading);
    const t = cameraTarget(c.motion.head, heading, CAM_OPTS.distance, CAM_OPTS.height);
    expect(c.cam.pos.x).toBeCloseTo(t.x, 9);
    expect(c.cam.pos.z).toBeCloseTo(t.z, 9);
    // It crawls on from there smoothly.
    const h = { ...c.motion.head };
    c.step(1 / 60, { x: 0, y: 1 });
    expect(Math.hypot(c.motion.head.x - h.x, c.motion.head.z - h.z)).toBeLessThan(0.05);
  });

  it('reset() with no points is still the spawn, exactly as a fresh crawl', () => {
    const fresh = new Crawl();
    const c = new Crawl();
    c.step(1 / 60, { x: 0.3, y: 1 });
    c.reset();
    expect(JSON.stringify(c.body)).toBe(JSON.stringify(fresh.body));
    expect(c.cam).toEqual(fresh.cam);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/unit/crawlRelocate.test.ts`
Expected: FAIL: the body is still at the spawn (`expected 0 to be close to 3`), and `tsc` reports `reset` takes at most 1 argument.

- [ ] **Step 3: Implement**

Append to `src/core/vec.ts`:

```ts

/** `n` points at the origin. */
export function vec3s(n: number): Vec3[] {
  return Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0 }));
}

/** Copies src into dst. */
export function copy3(dst: Vec3, src: Vec3): void {
  dst.x = src.x;
  dst.y = src.y;
  dst.z = src.z;
}
```

In `src/game/crawl.ts` (intent: the helpers move out; `placeAtSpawn()` becomes `place(at, heading)`, which takes the head and body from `at` when given, with heights from the surface; `reset()` passes its new arguments through and centres the leaf map on the given body). Replace the import:

```ts
import type { Vec2, Vec3 } from '../core/vec';
```

with:

```ts
import { copy3 as copy, vec3s as blank, type Vec2, type Vec3 } from '../core/vec';
```

Delete the two helpers:

```ts
/** `n` points at the origin. */
const blank = (n: number): Vec3[] => Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0 }));

function copy(dst: Vec3, src: Vec3): void {
  dst.x = src.x;
  dst.y = src.y;
  dst.z = src.z;
}

```

In the constructor replace `this.placeAtSpawn();` with `this.place(null, 0);`.

Replace the head of `placeAtSpawn`:

```ts
  /**
   * The worm at the spawn, straight and still, heading +z, with its camera settled behind it
   * and the previous step the same (nothing to interpolate). Rests on the surface for the
   * current leaf reaction.
   */
  private placeAtSpawn(): void {
    this.under.fill(0);
    const head = { x: 0, y: 0, z: 0 };
    this.motion = { head, heading: 0 };
    head.y = this.rest(0, 0, 0);
    const body = createBody(WORM_SEGMENTS, SPACING, head, 0);
    for (let i = 0; i < WORM_SEGMENTS; i++) {
      this.body[i] = body[i];
      copy(this.prevBody[i], body[i]);
    }
    this.clearance.reset();
    this.cam = createFollowCam(head, 0, CAM_OPTS);
```

with:

```ts
  /**
   * The worm at `at` (head first; heights from the surface here), or straight at the spawn heading
   * +z, still, facing `heading`, with its camera settled behind it and the previous step the same
   * (nothing to interpolate). Rests on the surface for the current leaf reaction.
   */
  private place(at: readonly Vec3[] | null, heading: number): void {
    this.under.fill(0);
    const head = { x: at ? at[0].x : 0, y: 0, z: at ? at[0].z : 0 };
    this.motion = { head, heading };
    head.y = this.rest(0, head.x, head.z);
    const body = at ?? createBody(WORM_SEGMENTS, SPACING, head, 0);
    for (let i = 0; i < WORM_SEGMENTS; i++) {
      this.body[i] = { x: body[i].x, y: at ? this.rest(i, body[i].x, body[i].z) : head.y, z: body[i].z };
      copy(this.prevBody[i], this.body[i]);
    }
    this.clearance.reset();
    this.cam = createFollowCam(head, heading, CAM_OPTS);
```

(the rest of the method is unchanged). Replace `reset`'s comment and first lines:

```ts
  /**
   * Back to the start, exactly as a freshly built crawl given the same leaf reaction and hero
   * count: the worm and its camera at the spawn (see placeAtSpawn), the disturbance map empty
   * and back on the spawn, and the hero leaves scattered around the spawn again, in the same
   * deterministic order as at the start. The speed test starts here, so its numbers never
   * depend on where the worm had been. `heroes`: how many hero leaves to scatter (the same count
   * as now unless given; after a scale-mode change, the preset's count for the new mode).
   */
  reset(heroes = this.hero.count): void {
    this.placeAtSpawn();
    clearDisturbance(this.disturbance);
    recentre(this.disturbance, 0, 0);
```

with:

```ts
  /**
   * Back to the start, exactly as a freshly built crawl given the same leaf reaction and hero
   * count: the worm and its camera at the spawn (see place), the disturbance map empty and back
   * on the spawn, and the hero leaves scattered around the spawn again, in the same deterministic
   * order as at the start. The speed test starts here, so its numbers never depend on where the
   * worm had been. `heroes`: how many hero leaves to scatter (the same count as now unless given).
   * With `at` (head first) the same fresh start happens there, facing `heading`: the worm coming
   * up out of the cut.
   */
  reset(heroes = this.hero.count, at: readonly Vec3[] | null = null, heading = 0): void {
    this.place(at, heading);
    clearDisturbance(this.disturbance);
    recentre(this.disturbance, at ? at[MAP_CENTRE].x : 0, at ? at[MAP_CENTRE].z : 0);
```

(Plan A removed World scale, so its `reset` comment may no longer mention scale modes: keep Plan A's wording and add the last sentence. Check `wc -l src/game/crawl.ts` is no larger than before this task.)

- [ ] **Step 4: Run the checks**

```bash
npx tsc --noEmit
npx vitest run tests/unit/crawlRelocate.test.ts tests/unit/crawl.test.ts tests/unit/solidProps.test.ts
npx vitest run
```

Expected: all pass; the suite **+14 files, +61 tests**.

- [ ] **Step 5: Commit**

```bash
git add src/core/vec.ts src/game/crawl.ts tests/unit/crawlRelocate.test.ts
git commit -m "feat(crawl): reset can start the worm at given points, facing a given way" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Burrow openings and middens (rendering)

**Files:**
- Create: `src/underground/openings.ts`
- Create: `src/underground/middens.ts`
- Test: `tests/unit/openings.test.ts`

Where the worm comes up it leaves a burrow opening (spec 4.2, 4.3, 6): a dark hole with a nightcrawler midden, 16 lumps of dark castings heaped round it and 9 leaf bits (a few pulled down into the hole, standing up out of it), about 1.2 u (5 cm) across and up to about 0.45 u (2 cm) high. Up to 8 per session, the oldest replaced, never saved. Each sits 0.2 u into the top of the leaves, so it shows on Plan A's deep litter. One merged mesh on the prop material, rewritten only when an opening is added.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/openings.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createOpenings, addOpening, clearOpenings, MAX_OPENINGS, MIDDEN_SINK } from '../../src/underground/openings';
import { createBodyPath, buildEmerge } from '../../src/underground/bodyPath';
import { createSlab, boundaryAt, slabX, slabZ, B_F, B_TOP } from '../../src/underground/slab';
import { SPACING } from '../../src/game/crawl';

describe('burrow openings on the surface (spec 4.2, 4.3)', () => {
  it('records where the worm came out, sitting just into the top of the leaves', () => {
    const s = createSlab(2, -3, 0.8, 1, 6);
    const p = createBodyPath();
    const us = Array.from({ length: 16 }, () => 1);
    const vs = us.map((_, i) => boundaryAt(s, B_F, 1) - 1.2 - SPACING * i);
    buildEmerge(p, s, us, vs, Math.PI / 2, 0.1);
    const o = createOpenings();
    addOpening(o, p, s);
    expect(o.count).toBe(1);
    expect(o.data[0]).toBeCloseTo(slabX(s, p.exitU), 6);
    expect(o.data[2]).toBeCloseTo(slabZ(s, p.exitU), 6);
    expect(o.data[1]).toBeCloseTo(boundaryAt(s, B_TOP, p.exitU) - MIDDEN_SINK, 6);
  });

  it('keeps the newest 8, replacing the oldest; nothing about them is stored', () => {
    const s = createSlab(0, 0, 0, 1, 1);
    const p = createBodyPath();
    const o = createOpenings();
    for (let n = 0; n < MAX_OPENINGS + 3; n++) {
      p.exitU = n - 5;
      addOpening(o, p, s);
    }
    expect(o.count).toBe(MAX_OPENINGS);
    // The 3 oldest (exitU -5, -4, -3) were replaced by the newest. (This cut runs along z.)
    const zs = Array.from({ length: MAX_OPENINGS }, (_, i) => o.data[i * 4 + 2]);
    expect(zs).toContain(Math.fround(slabZ(s, MAX_OPENINGS + 2 - 5)));
    expect(zs).not.toContain(Math.fround(slabZ(s, -5)));
    clearOpenings(o);
    expect(o.count).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/unit/openings.test.ts`
Expected: FAIL, "Failed to resolve import ../../src/underground/openings".

- [ ] **Step 3: Implement**

Create `src/underground/openings.ts`:

```ts
import { boundaryAt, slabX, slabZ, B_TOP, type Slab } from './slab';
import type { BodyPath } from './bodyPath';

/**
 * Burrow openings left on the surface this session (V2 spec 4.2, 4.3): up to MAX_OPENINGS, the
 * oldest replaced first. Session only: never saved.
 */
export const MAX_OPENINGS = 8;
/** A midden sits this far down into the top of the leaves (on the 3D litter, so it shows). */
export const MIDDEN_SINK = 0.2;

export interface Openings {
  /** x, y (where the midden sits: just into the top of the leaves, so it shows), z and a turn per opening. */
  readonly data: Float32Array;
  count: number;
  /** Next slot to write (the oldest once full). */
  next: number;
  /** Bumped on every change (the renderer re-uploads). */
  version: number;
}

export function createOpenings(): Openings {
  return { data: new Float32Array(MAX_OPENINGS * 4), count: 0, next: 0, version: 0 };
}

/** Records the opening where the worm just came out (the path's exit point). */
export function addOpening(o: Openings, p: BodyPath, s: Slab): void {
  const k = o.next * 4;
  o.data[k] = slabX(s, p.exitU);
  o.data[k + 1] = boundaryAt(s, B_TOP, p.exitU) - MIDDEN_SINK;
  o.data[k + 2] = slabZ(s, p.exitU);
  o.data[k + 3] = (s.seed % 628) / 100;
  o.next = (o.next + 1) % MAX_OPENINGS;
  o.count = Math.min(MAX_OPENINGS, o.count + 1);
  o.version++;
}

/** Forgets every opening (a fresh session state, e.g. the speed test's reset). */
export function clearOpenings(o: Openings): void {
  o.count = 0;
  o.next = 0;
  o.version++;
}
```

Create `src/underground/middens.ts`:

```ts
import * as THREE from 'three';
import { mulberry32 } from '../core/random';
import { MeshWriter, icosphere } from '../surface/meshWriter';
import { PROP } from '../surface/propGeometry';
import { createPropMaterial } from '../render/propMaterial';
import { MAX_OPENINGS, type Openings } from './openings';

/**
 * Burrow openings on the surface (V2 spec 4.2, 6): a dark hole with a nightcrawler midden round it,
 * castings mixed with leaf bits, about 5 cm across (1.2 u) and 1-2 cm high (0.25-0.45 u). One draw
 * on the prop material for all of them; rewritten only when an opening is added.
 */
/** Vertices and indices one midden needs (17 lumps of 42 vertices and 80 triangles, 9 leaf bits). */
const PER_VERTS = 800;
const PER_INDEX = 4400;
const MAX_VERTS = PER_VERTS * MAX_OPENINGS;
const LEAF_HEX = ['#b8401f', '#d9772a', '#c9a23a', '#9a7a4a', '#6f5a3a'];
const col = new THREE.Color();

export interface Middens {
  readonly mesh: THREE.Mesh;
  /** Rewrites the mesh if the openings changed. */
  update(o: Openings): void;
}

function writeMidden(w: MeshWriter, x: number, y: number, z: number, turn: number, seed: number): void {
  const rand = mulberry32(seed);
  const { pos, index } = icosphere();
  // The hole: a dark, shallow bowl.
  let first = w.vertexCount;
  let firstIdx = w.idx.length;
  for (let i = 0; i < pos.length; i += 3) {
    w.vertex(x + pos[i] * 0.17, y + 0.04 + Math.min(0, pos[i + 1]) * 0.02 + Math.max(0, pos[i + 1]) * 0.005, z + pos[i + 2] * 0.17, 0, 1, 0, [0.02, 0.014, 0.01, PROP.plain]);
  }
  for (let i = 0; i < index.length; i += 3) w.tri(first + index[i], first + index[i + 1], first + index[i + 2]);
  // Castings: lumpy dark crumbs heaped in a ring round the hole.
  for (let k = 0; k < 16; k++) {
    const a = turn + (k / 16) * Math.PI * 2 + rand() * 0.3;
    const r = 0.22 + rand() * 0.3;
    const s = 0.07 + rand() * 0.07;
    const h = (0.42 - r * 0.45) * (0.7 + rand() * 0.5);
    const cx = x + Math.cos(a) * r;
    const cz = z + Math.sin(a) * r;
    col.set(rand() < 0.5 ? '#2a1d14' : '#3a2a1d');
    first = w.vertexCount;
    firstIdx = w.idx.length;
    for (let i = 0; i < pos.length; i += 3) {
      const lump = 1 + 0.2 * Math.sin(5 * pos[i] + 3 * pos[i + 2] + k);
      w.vertex(cx + pos[i] * s * lump, y + h * 0.5 + pos[i + 1] * (h * 0.5 + s * 0.3) * lump, cz + pos[i + 2] * s * lump, 0, 1, 0, [col.r, col.g, col.b, PROP.plain]);
    }
    for (let i = 0; i < index.length; i += 3) w.tri(first + index[i], first + index[i + 1], first + index[i + 2]);
    w.smoothNormals(first, firstIdx);
  }
  // Leaf bits pulled in: small fragments lying in the heap and stalks standing out of the hole.
  for (let k = 0; k < 9; k++) {
    const a = rand() * Math.PI * 2;
    const r = k < 3 ? 0.05 : 0.15 + rand() * 0.35;
    const cx = x + Math.cos(a) * r;
    const cz = z + Math.sin(a) * r;
    const len = 0.12 + rand() * 0.16;
    const up = k < 3 ? 0.25 + rand() * 0.15 : 0.04 + rand() * 0.06;
    const yaw = rand() * Math.PI * 2;
    col.set(LEAF_HEX[Math.floor(rand() * LEAF_HEX.length)]);
    const dx = Math.cos(yaw) * len;
    const dz = Math.sin(yaw) * len;
    const sx = -Math.sin(yaw) * len * 0.45;
    const sz = Math.cos(yaw) * len * 0.45;
    const by = y + 0.12 + rand() * 0.15;
    const v0 = w.vertex(cx - dx, by, cz - dz, 0, 1, 0, [col.r, col.g, col.b, PROP.plant + 0.2]);
    const v1 = w.vertex(cx + sx, by + up * 0.5, cz + sz, 0, 1, 0, [col.r, col.g, col.b, PROP.plant + 0.5]);
    const v2 = w.vertex(cx + dx, by + up, cz + dz, 0, 1, 0, [col.r, col.g, col.b, PROP.plant + 0.9]);
    const v3 = w.vertex(cx - sx, by + up * 0.5, cz - sz, 0, 1, 0, [col.r, col.g, col.b, PROP.plant + 0.5]);
    w.quad(v0, v1, v2, v3);
  }
}

export function createMiddens(): Middens {
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(MAX_VERTS * 3), 3);
  const nor = new THREE.BufferAttribute(new Float32Array(MAX_VERTS * 3), 3);
  const prop = new THREE.BufferAttribute(new Float32Array(MAX_VERTS * 4), 4);
  const index = new THREE.BufferAttribute(new Uint16Array(PER_INDEX * MAX_OPENINGS), 1);
  geo.setAttribute('position', pos);
  geo.setAttribute('normal', nor);
  geo.setAttribute('aProp', prop);
  geo.setIndex(index);
  geo.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(geo, createPropMaterial());
  mesh.name = 'middens';
  // Stays drawn while digging (the forest above shows it) but holds no triangles until the first.
  let version = -1;
  return {
    mesh,
    update(o) {
      if (o.version === version) return;
      version = o.version;
      const w = new MeshWriter('aProp', 4);
      for (let i = 0; i < o.count; i++) {
        const k = i * 4;
        writeMidden(w, o.data[k], o.data[k + 1], o.data[k + 2], o.data[k + 3], 1 + i * 7919 + Math.round(o.data[k] * 13));
      }
      const nv = Math.min(MAX_VERTS, w.vertexCount);
      (pos.array as Float32Array).set(w.pos.slice(0, nv * 3));
      (nor.array as Float32Array).set(w.nor.slice(0, nv * 3));
      (prop.array as Float32Array).set(w.extra.slice(0, nv * 4));
      (index.array as Uint16Array).set(w.idx.slice(0, index.count));
      for (const a of [pos, nor, prop, index]) a.needsUpdate = true;
      geo.setDrawRange(0, Math.min(index.count, w.idx.length));
      geo.computeBoundingSphere();
      mesh.visible = o.count > 0;
    },
  };
}
```

- [ ] **Step 4: Run the checks**

```bash
npx tsc --noEmit
npx vitest run tests/unit/openings.test.ts
npx vitest run
```

Expected: 2 passed; the suite **+15 files, +63 tests**.

- [ ] **Step 5: Commit**

```bash
git add src/underground/openings.ts src/underground/middens.ts tests/unit/openings.test.ts
git commit -m "feat(underground): burrow openings with nightcrawler middens, 8 per session" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: The surface-and-underground game

**Files:**
- Create: `src/underground/burrowGame.ts`
- Test: `tests/unit/burrowGame.test.ts`

`BurrowGame` ties the pure parts to the crawl (spec 4, 6, 7). On the surface it steps the crawl as before and offers "Dig down" where `canDigAt` allows. One press (edge from Plan A's `createPressEdge`) makes a new slab through the head along its heading (camera side from `chooseSide`, seed from the spot), fills the grid and blockers, and starts the sink; the crawl stands still from then on (no hero-leaf physics, no leaf-map stamping). Underground the stick or arrows point the way on screen (`rightSign` maps screen right to ±u for the camera's side); Action switches the view (and saves it through the host) or, near the top, comes up: the crawl is reset at the worm's final surface pose at once (so the camera swing ends on its settled follow camera), and the opening is recorded when the move ends. A new slab is made only when the worm digs down again. `hintShowing` drives the first visit's hint card (12 s). `enterNow()` is the speed test's straight-underground start. The tests drive the real crawl and check the whole flow.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/burrowGame.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BurrowGame, HINT_S } from '../../src/underground/burrowGame';
import { Crawl } from '../../src/game/crawl';
import { boundaryAt, slabU, B_F, B_TOP } from '../../src/underground/slab';
import { cameraTarget } from '../../src/surface/followCamera';
import { CAM_OPTS } from '../../src/game/cameraClearance';
import { MAX_OPENINGS } from '../../src/underground/openings';
import { TOP_KEEP } from '../../src/underground/burrowMotion';
import type { UndergroundView } from '../../src/underground/modeMachine';

const DT = 1 / 60;
const STILL = { x: 0, y: 0 };
const UP = { x: 0, y: 1 };
const DOWN = { x: 0, y: -1 };

function makeGame(reduced = false) {
  const saved: UndergroundView[] = [];
  const crawl = new Crawl();
  const game = new BurrowGame(crawl, { reducedMotion: () => reduced, saveView: (v) => saved.push(v) }, 'wide');
  return { crawl, game, saved };
}

/** Steps with Action held for 0.15 s (a real press), then released. */
function press(game: BurrowGame, move = STILL): void {
  for (let k = 0; k < 9; k++) game.step(DT, move, true);
  game.step(DT, move, false);
}

function run(game: BurrowGame, seconds: number, move = STILL): void {
  for (let k = 0; k < Math.round(seconds / DT); k++) game.step(DT, move, false);
}

function digDown(game: BurrowGame): void {
  press(game);
  run(game, 3);
  expect(game.mode.mode).toBe('underground');
}

describe('the surface and underground game (spec 4, 6, 7)', () => {
  it('crawls on the surface and offers Dig down where allowed', () => {
    const { crawl, game } = makeGame();
    run(game, 0.5, UP);
    expect(crawl.motion.head.z).toBeGreaterThan(0.5);
    expect(game.prompt).toBe('digDown');
    expect(game.mode.mode).toBe('surface');
  });

  it('one press digs down: a new slab through the head along the heading, then underground in about 2.5 s', () => {
    const { crawl, game } = makeGame();
    run(game, 0.5, UP);
    const h = { ...crawl.motion.head };
    press(game);
    expect(game.mode.mode).toBe('diggingDown');
    expect(game.slabVersion).toBe(1);
    const s = game.slab!;
    expect(s.ox).toBeCloseTo(h.x, 2);
    expect(s.oz).toBeCloseTo(h.z, 2);
    expect(game.prompt).toBeNull();
    run(game, 2.4);
    expect(game.mode.mode).toBe('underground');
    // The head went down into the soil.
    expect(game.worm.v[0]).toBeLessThan(boundaryAt(s, B_F, game.worm.u[0]) - 0.3);
    expect(game.prompt).toBe('viewClose');
  });

  it('the surface stands still underground: the crawl is not stepped', () => {
    const { crawl, game } = makeGame();
    digDown(game);
    const before = JSON.stringify(crawl.body);
    run(game, 1, DOWN);
    expect(JSON.stringify(crawl.body)).toBe(before);
  });

  it('pointing moves the worm in the cut; screen right is along the cut as the camera sees it', () => {
    const { game } = makeGame();
    digDown(game);
    const u0 = game.worm.u[0];
    run(game, 2, { x: 1, y: 0 });
    expect(Math.sign(game.worm.u[0] - u0)).toBe(game.rightSign);
  });

  it('Action deeper down switches the view and saves it; near the top it says Come up', () => {
    const { game, saved } = makeGame();
    digDown(game);
    press(game);
    expect(game.view).toBe('close');
    expect(saved).toEqual(['close']);
    expect(game.prompt).toBe('viewWide');
    press(game);
    expect(game.view).toBe('wide');
    expect(saved).toEqual(['close', 'wide']);
    // Steer up into the litter: it never leaves on its own.
    run(game, 4, UP);
    expect(game.mode.mode).toBe('underground');
    expect(game.worm.v[0]).toBeLessThanOrEqual(boundaryAt(game.slab!, B_TOP, game.worm.u[0]) - TOP_KEEP + 1e-9);
    expect(game.prompt).toBe('comeUp');
  });

  it('comes up on one press near the top: out along the cut, the camera settled behind, an opening left', () => {
    const { crawl, game } = makeGame();
    digDown(game);
    run(game, 1.5, { x: 1, y: 0 });
    run(game, 4, UP);
    press(game);
    expect(game.mode.mode).toBe('comingUp');
    // The crawl already waits where the worm will lie, its camera settled behind it.
    const s = game.slab!;
    const head = crawl.motion.head;
    expect(Math.abs((head.x - s.ox) * s.nx + (head.z - s.oz) * s.nz)).toBeLessThan(1e-6);
    const t = cameraTarget(head, crawl.motion.heading, CAM_OPTS.distance, CAM_OPTS.height);
    expect(crawl.cam.pos.x).toBeCloseTo(t.x, 6);
    expect(crawl.cam.pos.z).toBeCloseTo(t.z, 6);
    // Facing along the cut.
    expect(Math.abs(Math.sin(crawl.motion.heading) * s.tx + Math.cos(crawl.motion.heading) * s.tz)).toBeCloseTo(1, 6);
    run(game, 3);
    expect(game.mode.mode).toBe('surface');
    expect(game.openings.count).toBe(1);
    // The worm's body ends exactly where the crawl took over: no jump on the first surface step.
    for (let i = 0; i < 16; i++) {
      expect(slabU(s, crawl.body[i].x, crawl.body[i].z)).toBeCloseTo(game.worm.u[i], 2);
    }
    const before = { ...crawl.motion.head };
    run(game, DT, UP);
    expect(Math.hypot(crawl.motion.head.x - before.x, crawl.motion.head.z - before.z)).toBeLessThan(0.05);
  });

  it('keeps one slab per visit; digging down somewhere else makes a fresh one', () => {
    const { game } = makeGame();
    digDown(game);
    run(game, 1.5, { x: 1, y: 0 });
    run(game, 4, UP);
    press(game);
    run(game, 3);
    expect(game.slabVersion).toBe(1);
    run(game, 1, UP);
    digDown(game);
    expect(game.slabVersion).toBe(2);
    // Fresh: nothing dug but the new entry.
    let open = 0;
    for (let i = 0; i < game.grid.open.length; i++) open += game.grid.open[i];
    expect(open).toBeLessThan(400);
  });

  it('keeps at most 8 openings, the oldest replaced', () => {
    const { crawl, game } = makeGame();
    for (let n = 0; n < MAX_OPENINGS + 2; n++) {
      digDown(game);
      run(game, 4, UP);
      press(game);
      run(game, 3);
      // Back to the spawn (the openings stay: they are the session's).
      crawl.reset();
    }
    expect(game.openings.count).toBe(MAX_OPENINGS);
    expect(game.openings.version).toBe(MAX_OPENINGS + 2);
  });

  it('the first visit shows the hint card for a while, later visits none', () => {
    const { game } = makeGame();
    expect(game.hintShowing).toBe(false);
    digDown(game);
    expect(game.hintShowing).toBe(true);
    run(game, HINT_S);
    expect(game.hintShowing).toBe(false);
  });

  it('reduced motion: the move uses the cross-fade (shorter)', () => {
    const { game } = makeGame(true);
    press(game);
    run(game, 1.8);
    expect(game.mode.mode).toBe('underground');
  });

  it('enterNow puts the speed test straight underground, in Wide', () => {
    const { game } = makeGame();
    game.enterNow();
    expect(game.mode.mode).toBe('underground');
    expect(game.view).toBe('wide');
    const u = game.worm.u[0];
    const v = game.worm.v[0];
    for (let k = 0; k < 60 * 5; k++) game.step(DT, STILL, false, true);
    expect(Math.hypot(game.worm.u[0] - u, game.worm.v[0] - v)).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/unit/burrowGame.test.ts`
Expected: FAIL, "Failed to resolve import ../../src/underground/burrowGame".

- [ ] **Step 3: Implement**

Create `src/underground/burrowGame.ts`:

```ts
import type { Vec2, Vec3 } from '../core/vec';
import { vec3s } from '../core/vec';
import type { Crawl } from '../game/crawl';
import { OCC_AXIS_UP } from '../render/occlusion';
import type { ActionKind } from '../ui/actionPrompt';
import { createPressEdge } from '../input/actionEdge';
import { createSlab, slabSeed, slabU, slabX, slabZ, type Slab } from './slab';
import { createSoilGrid, fillSoilGrid, digDisc, type Eaten } from './soilGrid';
import { createSolids, placeSolids, markSolids } from './solids';
import { canDigAt, chooseSide } from './digSpot';
import { createBurrower, placeBurrower, stepBurrower, TUNNEL_R } from './burrowMotion';
import { createBodyPath, buildSink, buildEmerge, bodyAlong, poseAt, smootherstep } from './bodyPath';
import {
  createModeState, stepMode, bodyProgress, promptKind, type UndergroundView,
} from './modeMachine';
import { createCutCam, frameTarget, snapCutCam, stepCutCam, stepCutFacing, type CutFrame } from './cutCamera';
import { createOpenings, addOpening } from './openings';

/** What the game asks of the page. */
export interface BurrowHost {
  /** prefers-reduced-motion, read as each move starts. */
  reducedMotion(): boolean;
  /** The player switched the underground view: store it (the V1 save rule). */
  saveView(v: UndergroundView): void;
}

/** The body's axis rides this far above the belly line the surface worm rests on (wormMesh). */
const AXIS_UP = OCC_AXIS_UP;
/** The first visit's hint card shows for this long underground (then the cut is left clear). */
export const HINT_S = 12;
const ate: Eaten = { cells: 0, organic: 0 };

/**
 * The surface-and-underground game (V2 spec 4, 6, 7): the mode machine, the slab and its soil,
 * the worm in the plane, its moves in and out, the cut camera's frame, and the burrow openings
 * left on the surface. On the surface it steps the crawl as before. Pure (no three.js); the
 * renderer reads it (undergroundView.ts). Allocates nothing per step, except once per dig and
 * once per coming up.
 */
export class BurrowGame {
  readonly mode = createModeState();
  view: UndergroundView;
  slab: Slab | null = null;
  /** Bumped whenever a new slab is made (the renderer rebuilds the face and props): also the visits this session. */
  slabVersion = 0;
  readonly grid = createSoilGrid();
  readonly solids = createSolids();
  readonly worm = createBurrower();
  /** How far each body point stands off the cut (it slides into the plane as it sinks), now and last step. */
  readonly lateral = new Float64Array(16);
  latNow = 0;
  latPrev = 0;
  readonly cam = createCutCam();
  /** The cut camera's frame at the last step (the renderer interpolates from it to `cam`). */
  readonly camPrev: CutFrame = { cu: 0, cv: 0, h: 10, pitch: 0.2 };
  readonly frame: CutFrame = { cu: 0, cv: 0, h: 10, pitch: 0.2 };
  readonly openings = createOpenings();
  /** What Action would do now (the prompt). */
  prompt: ActionKind | null = null;
  /** Width / height of the screen (set on resize): the cut camera frames for it. */
  aspect = 16 / 9;
  /** Seconds spent underground on the session's first visit (the hint card's clock). */
  private firstVisitT = 0;
  /** The game's own clock while the speed test digs (its scripted pointing). */
  private autoT = 0;
  private placed = false;
  private readonly path = createBodyPath();
  private readonly edge = createPressEdge();
  private readonly endBody: Vec3[] = vec3s(16);
  private readonly us = new Float64Array(16);
  private readonly vs = new Float64Array(16);

  constructor(private readonly crawl: Crawl, private readonly host: BurrowHost, view: UndergroundView) {
    this.view = view;
  }

  /** The hint card shows: the session's first visit, for its first HINT_S seconds (spec 6). */
  get hintShowing(): boolean {
    return this.slabVersion === 1 && this.firstVisitT < HINT_S && this.mode.mode !== 'surface';
  }

  /** On screen, which way along the cut is "right": +1 when +u, -1 when -u. */
  get rightSign(): number {
    const s = this.slab;
    return s ? Math.sign(s.nz * s.tx - s.nx * s.tz) || 1 : 1;
  }

  /** One fixed step. `move` and `action` are the gameplay commands; `auto` drives a scripted dig (speed test). */
  step(dt: number, move: Vec2, action: boolean, auto = false): void {
    const pressed = this.edge.update(action);
    const m = this.mode;
    const reduced = this.host.reducedMotion();
    if (m.mode === 'surface') {
      this.crawl.step(dt, move);
      const h = this.crawl.motion.head;
      const can = canDigAt(h.x, h.z);
      if (stepMode(m, pressed, can, false, reduced, dt) === 'startDig') this.startDig();
      this.prompt = promptKind(m, can, false, this.view);
      return;
    }
    if (this.slabVersion === 1) this.firstVisitT += dt;
    if (m.mode === 'underground') {
      let du = move.x * this.rightSign;
      let dv = move.y;
      if (auto) {
        this.autoT += dt;
        du = Math.cos(0.37 * this.autoT + 0.5);
        dv = Math.sin(0.61 * this.autoT) - 0.15;
      }
      stepBurrower(this.worm, this.slab!, this.grid, this.solids, du, dv, dt);
      const ev = stepMode(m, pressed, false, this.worm.nearTop, reduced, dt);
      if (ev === 'switchView') {
        this.view = this.view === 'wide' ? 'close' : 'wide';
        this.host.saveView(this.view);
      } else if (ev === 'startUp') this.startEmerge();
    } else {
      this.stepMove(dt, reduced);
    }
    this.frameCut(dt);
    this.prompt = promptKind(m, false, this.worm.nearTop, this.view);
  }

  /** Digging down or coming up: the worm follows its path; the mode machine times the camera. */
  private stepMove(dt: number, reduced: boolean): void {
    const m = this.mode;
    const w = this.worm;
    w.prevU.set(w.u);
    w.prevV.set(w.v);
    w.prevWave.phase = w.wave.phase;
    this.latPrev = this.latNow;
    const ev = stepMode(this.mode, false, false, false, reduced, dt);
    if (ev === 'emerge') {
      addOpening(this.openings, this.path, this.slab!);
      return;
    }
    const p = bodyProgress(m);
    if (m.mode === 'diggingDown' && this.placed) {
      // Sunk: it breathes while the camera swings round.
      stepBurrower(w, this.slab!, this.grid, this.solids, 0, 0, dt);
      return;
    }
    poseAt(this.path, p, w.u, w.v);
    w.wave.phase += dt * 0.6;
    if (m.mode === 'diggingDown') {
      this.latNow = 1 - smootherstep(p);
      if (p >= 1) {
        placeBurrower(w, w.u, w.v, -Math.PI / 2, w.wave);
        this.placed = true;
      }
    }
    for (let i = 0; i < 4; i++) digDisc(this.grid, w.u[i], w.v[i], TUNNEL_R, ate);
  }

  /** The cut camera's frame for the current view, eased. */
  private frameCut(dt: number): void {
    const w = this.worm;
    const c = this.cam;
    const p = this.camPrev;
    p.cu = c.cu.value; p.cv = c.cv.value; p.h = c.h.value; p.pitch = c.pitch.value;
    stepCutFacing(this.cam, w.dir, dt);
    frameTarget(this.view, this.slab!, w.u[0], w.v[0], this.cam.au.value, this.cam.av.value, this.aspect,
      this.cam.cu.value, this.cam.cv.value, this.frame);
    if (this.mode.mode === 'underground') stepCutCam(this.cam, this.frame, this.view, dt);
    else snapCutCam(this.cam, this.frame, w.dir);
    if (dt === 0) { p.cu = c.cu.value; p.cv = c.cv.value; p.h = c.h.value; p.pitch = c.pitch.value; }
  }

  /** A new slab where the worm is, and the sink path from its body (spec 4.1, 4.3). */
  private startDig(): void {
    const c = this.crawl;
    const h = c.motion.head;
    const heading = c.motion.heading;
    const s = createSlab(h.x, h.z, heading, chooseSide(h.x, h.z, heading), slabSeed(h.x, h.z));
    this.slab = s;
    this.slabVersion++;
    fillSoilGrid(this.grid, s);
    placeSolids(s, this.solids);
    markSolids(this.grid, this.solids);
    for (let i = 0; i < 16; i++) {
      const p = c.body[i];
      this.us[i] = slabU(s, p.x, p.z);
      this.vs[i] = p.y + AXIS_UP;
      this.lateral[i] = (p.x - s.ox) * s.nx + (p.z - s.oz) * s.nz;
    }
    buildSink(this.path, s, this.us, this.vs);
    const w = this.worm;
    placeBurrower(w, this.us, this.vs, 0, c.wave);
    this.latNow = this.latPrev = 1;
    this.placed = false;
    this.frameCut(0);
  }

  /** The path up and out, and the crawl waiting where the worm will lie on the surface (spec 4.2). */
  private startEmerge(): void {
    const s = this.slab!;
    const w = this.worm;
    buildEmerge(this.path, s, w.u, w.v, w.dir, AXIS_UP);
    this.latNow = this.latPrev = 0;
    bodyAlong(this.path, this.path.headTo, this.us, this.vs);
    for (let i = 0; i < 16; i++) {
      const p = this.endBody[i];
      p.x = slabX(s, this.us[i]);
      p.y = this.vs[i] - AXIS_UP;
      p.z = slabZ(s, this.us[i]);
    }
    const sign = this.path.exitSign;
    this.crawl.reset(this.crawl.hero.count, this.endBody, Math.atan2(sign * s.tx, sign * s.tz));
  }

  /** Underground at once, where the worm is, in the current view: the speed test's dig run. */
  enterNow(): void {
    this.reset();
    this.autoT = 0;
    this.startDig();
    // The sink and the (cross-faded) camera move, run through at once.
    this.mode.mode = 'diggingDown';
    this.mode.t = 0;
    this.mode.reduced = true;
    for (let k = 0; k < 600 && !this.under(); k++) this.stepMove(1 / 60, true);
    this.frameCut(0);
    snapCutCam(this.cam, this.frame, this.worm.dir);
  }

  /** In the cut, the moves done. */
  under(): boolean {
    return this.mode.mode === 'underground';
  }

  /** Back on the surface (the crawl's own reset is the caller's). */
  reset(): void {
    this.mode.mode = 'surface';
    this.mode.t = 0;
    this.prompt = null;
  }
}
```

- [ ] **Step 4: Run the checks**

```bash
npx tsc --noEmit
npx vitest run tests/unit/burrowGame.test.ts
npx vitest run
```

Expected: 11 passed; the suite **+16 files, +74 tests**. If "one press digs down" fails because Plan A's spawn is not diggable (a footprint or the play edge too near), crawl a little first in that test, as the first test does.

- [ ] **Step 5: Commit**

```bash
git add src/underground/burrowGame.ts tests/unit/burrowGame.test.ts
git commit -m "feat(underground): the game: dig down, dig, switch view, come up" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Layer names, the hint card and the underground styles

**Files:**
- Create: `src/underground/layerLabels.ts`
- Create: `src/ui/underground.css`
- Create: `src/ui/undergroundHint.ts`

The layer names (spec 5.3, 11.2): Leaf litter, Old leaves, Humus, Topsoil, Subsoil (from `TEXT`), always shown at the two far ends of the playable slab only, each with a tick line at its layer's top, as real DOM text (18 px bold ink on parchment, well over 7:1). Each end's names hang outward from the slab; where layers are thin they are pushed apart to 30 px; a set hides when its end is off screen. A style is written only when a label's whole-pixel position changes, so a still camera writes nothing. The hint card (spec 6): on the session's first visit, `TEXT.undergroundHint` and `shown(TEXT.burrowChoice)`; otherwise the panel is hidden underground. The CSS also holds the reduced-motion fade. These are checked on screen in Tasks 17 and 18.

- [ ] **Step 1: Implement**

Create `src/underground/layerLabels.ts`:

```ts
import * as THREE from 'three';
import { TEXT } from '../content/text';
import { boundaryAt, slabX, slabZ, B_TOP, B_F, B_H, B_A, B_E, type Slab } from './slab';
import { LAYER_LABEL_KEYS } from './layers';

/**
 * The layer names (V2 spec 5.3): Leaf litter, Old leaves, Humus, Topsoil, Subsoil, always shown
 * at the two far ends of the playable slab only, each with a small tick line at its layer's top.
 * Real DOM text (18 px, ink on parchment, 7:1), placed over the canvas each frame. A style is
 * written only when a label's whole-pixel position changes, so a still camera writes nothing.
 */
const COUNT = LAYER_LABEL_KEYS.length;
/** Labels keep at least this many pixels apart (thin layers would otherwise overlap). */
const GAP = 30;
/** Gap between the slab's end and its labels, and the labels' box width (underground.css), in pixels. */
const SIDE = 12;
const BOX_W = 170;
const v3 = new THREE.Vector3();

interface End {
  readonly box: HTMLDivElement;
  readonly labels: HTMLSpanElement[];
  readonly ticks: HTMLSpanElement[];
  /** Last written pixel positions (label y, tick y, end x); NaN: not yet written. */
  readonly ly: Float64Array;
  readonly ty: Float64Array;
  x: number;
  shown: boolean;
}

export interface LayerLabels {
  /** Places the labels for this frame's camera, or hides them (`show` false). Allocates nothing on a still frame. */
  update(camera: THREE.Camera, s: Slab | null, show: boolean, width: number, height: number): void;
}

function makeEnd(root: HTMLElement): End {
  const box = document.createElement('div');
  box.className = 'cut-labels';
  box.setAttribute('aria-hidden', 'true');
  box.hidden = true;
  const labels: HTMLSpanElement[] = [];
  const ticks: HTMLSpanElement[] = [];
  for (const key of LAYER_LABEL_KEYS) {
    const l = document.createElement('span');
    l.className = 'cut-label';
    l.textContent = TEXT[key].text;
    const t = document.createElement('span');
    t.className = 'cut-tick';
    box.append(t, l);
    labels.push(l);
    ticks.push(t);
  }
  root.appendChild(box);
  return { box, labels, ticks, ly: new Float64Array(COUNT).fill(NaN), ty: new Float64Array(COUNT).fill(NaN), x: NaN, shown: false };
}

/** Screen y (pixels) of plane point (u, v); NaN behind the camera. Writes the screen x into v3.x. */
function screen(camera: THREE.Camera, s: Slab, u: number, v: number, width: number, height: number): number {
  v3.set(slabX(s, u), v, slabZ(s, u)).project(camera);
  if (v3.z > 1) return NaN;
  v3.x = (v3.x * 0.5 + 0.5) * width;
  return (-v3.y * 0.5 + 0.5) * height;
}

const tops = new Float64Array(COUNT + 1);
const ys = new Float64Array(COUNT);
const tickYs = new Float64Array(COUNT);

function place(e: End, camera: THREE.Camera, s: Slab, u: number, right: boolean, show: boolean, width: number, height: number): void {
  // Each layer's top, and the subsoil's: E's top; the subsoil label sits a little below it.
  tops[0] = boundaryAt(s, B_TOP, u);
  tops[1] = boundaryAt(s, B_F, u);
  tops[2] = boundaryAt(s, B_H, u);
  tops[3] = boundaryAt(s, B_A, u);
  tops[4] = boundaryAt(s, B_E, u);
  tops[5] = tops[4] - 1.2;
  let ok = show;
  let x = 0;
  for (let k = 0; k < COUNT && ok; k++) {
    tickYs[k] = screen(camera, s, u, tops[k], width, height);
    x = v3.x;
    ys[k] = screen(camera, s, u, (tops[k] + tops[k + 1]) / 2, width, height);
    ok = Number.isFinite(ys[k]) && x > -40 && x < width + 40;
  }
  if (ok !== e.shown) {
    e.box.hidden = !ok;
    e.shown = ok;
  }
  if (ok && e.box.dataset.side !== (right ? 'right' : 'left')) e.box.dataset.side = right ? 'right' : 'left';
  if (!ok) return;
  // Thin layers: push labels apart top to bottom.
  for (let k = 1; k < COUNT; k++) if (ys[k] < ys[k - 1] + GAP) ys[k] = ys[k - 1] + GAP;
  const rx = Math.round(x);
  if (rx !== e.x) {
    e.x = rx;
    // The left end's labels hang to the left of the slab, the right end's to the right.
    e.box.style.transform = `translateX(${right ? rx + SIDE : rx - SIDE - BOX_W}px)`;
  }
  for (let k = 0; k < COUNT; k++) {
    const ly = Math.round(ys[k]);
    if (ly !== e.ly[k]) {
      e.ly[k] = ly;
      e.labels[k].style.transform = `translateY(${ly}px) translateY(-50%)`;
    }
    const ty = Math.round(tickYs[k]);
    if (ty !== e.ty[k]) {
      e.ty[k] = ty;
      e.ticks[k].style.transform = `translateY(${ty}px)`;
    }
  }
}

export function createLayerLabels(root: HTMLElement): LayerLabels {
  const lo = makeEnd(root);
  const hi = makeEnd(root);
  return {
    update(camera, s, show, width, height) {
      if (!s || !show) {
        if (lo.shown) { lo.box.hidden = true; lo.shown = false; }
        if (hi.shown) { hi.box.hidden = true; hi.shown = false; }
        return;
      }
      // Whichever end is on the screen's right gets its names on its right.
      screen(camera, s, s.playHi, s.topMax, width, height);
      const xHi = v3.x;
      screen(camera, s, s.playLo, s.topMax, width, height);
      const hiRight = xHi > v3.x;
      place(lo, camera, s, s.playLo, !hiRight, show, width, height);
      place(hi, camera, s, s.playHi, hiRight, show, width, height);
    },
  };
}
```

Create `src/ui/underground.css`:

```css
/* Underground (V2): the layer names at the slab's ends, and the reduced-motion fade. Same rules as
   the HUD: 18px+ text, ink on parchment (well over 7:1), nothing that flashes. */

.cut-labels {
  position: fixed; z-index: 1; left: 0; top: 0; width: 170px; height: 0; pointer-events: none;
}
.cut-labels[hidden], :not([data-ui="crawl"]) > .cut-labels { display: none; }
.cut-label {
  position: absolute; top: 0; white-space: nowrap; font-size: 18px; font-weight: 700; line-height: 24px;
  color: var(--ink); background: var(--parchment-hi); padding: 1px 8px;
  border: 2px solid var(--bark); border-radius: 10px 13px 10px 13px / 13px 10px 13px 10px;
  box-shadow: 0 2px 6px rgba(30, 14, 2, 0.35);
}
.cut-labels[data-side="left"] .cut-label { right: 0; }
.cut-labels[data-side="right"] .cut-label { left: 0; }
/* The tick: a short ink line at the layer's top, reaching from the label side to the slab's end. */
.cut-tick {
  position: absolute; top: -1.5px; width: 20px; height: 3px; background: var(--ink);
  box-shadow: 0 0 0 1.5px var(--parchment-hi);
}
.cut-labels[data-side="left"] .cut-tick { right: -12px; }
.cut-labels[data-side="right"] .cut-tick { left: -12px; }

/* Reduced motion: going down or up dips through dark soil instead of swinging the camera. */
.cut-fade {
  position: fixed; inset: 0; z-index: 0; pointer-events: none; background: #1a120b; opacity: 0;
}
.cut-fade[hidden] { display: none; }

/* The Game choice line under the underground hint. */
.hint-note { margin-top: 10px; font-size: 18px; font-style: italic; color: var(--ink-soft); }
```

Create `src/ui/undergroundHint.ts`:

```ts
import { el } from './dom';
import { icon } from './icons';
import type { Shell } from './shell';
import { TEXT, shown } from '../content/text';

/**
 * Underground. On the first visit of the session (`card`), a hint card in place of the crawl
 * card: the controls, then the Game choice label for digging any way (spec 6, science honesty).
 * Later visits keep the cut clear: no card (the Action prompt still says what Space does).
 * Focus rests on the panel, as while crawling, so Space and the arrows press no button.
 */
export function showUnderground(shell: Shell, card: boolean): void {
  const hint = el('p', '', 'hint');
  hint.append(icon('drive', 'hint-icon'), el('span', shown(TEXT.undergroundHint)));
  shell.show('crawl', 'Underground', card ? [hint, el('p', shown(TEXT.burrowChoice), 'hint-note')] : []);
  shell.panel.focus({ preventScroll: true });
  shell.panel.hidden = !card;
}
```

- [ ] **Step 2: Run the checks**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: `tsc` clean; the suite unchanged (**+16 files, +74 tests**). The CSS is imported by Task 17's `cutScene.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/underground/layerLabels.ts src/ui/underground.css src/ui/undergroundHint.ts
git commit -m "feat(underground): layer names at the slab's ends, and the first visit's hint card" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Underground on screen: the worm in the cut, the camera's moves, the wiring (rendering)

**Files:**
- Modify: `src/worm/wormMesh.ts`
- Modify: `src/game/world.ts` **(Plan A changed this file: re-read it first)**
- Create: `src/render/warmShaders.ts`
- Create: `src/underground/cutScene.ts`
- Create: `src/underground/burrowing.ts`
- Modify: `src/main.ts` **(Plan A changed this file: re-read it first)**

This puts it all on screen. `HeroWorm` gets an `up` (the tube's back faces it: world up on the surface, the camera in the cut, blended as it sinks, so the frames never flip when the body points straight down) and `showShadow()`. `World.sync` is split: `syncWorm(pose, focus, camera)` poses the worm and what reads it (the leaf fade, the near clutter, the litter chunks) from a pose the caller made; `sync` keeps the crawl's part (its pose, hero leaves, leaf-map upload). `cutScene.ts` draws each frame: on the surface exactly as before (`world.sync`); otherwise it rebuilds the face and props when the slab changes, uploads changed soil rows, eases the camera from the (still) surface follow camera to the cut camera (lifted mid-swing, slerped, the near plane closing in at the end; or the dark dip with reduced motion), hazes the forest behind the cut, poses the worm in the plane, and places the layer names. It also sets `#app[data-place]` for tests. `burrowing.ts` builds the game and scene for `main.ts` (the view from the save, saved again only on a switch; reduced motion read as each move starts). The underground meshes join the scene before `warmShaders`, which moves to its own module (so `main.ts` does not grow) and compiles them with everything else.

`main.ts`, in intent: the step goes through `game.step(dt, move, action)` (the game steps the crawl on the surface); the frame draws through `cut.sync(...)`; Plan A's `ActionPrompt` is fed `game.prompt` each frame on the crawl screen (null elsewhere and during the speed test); the crawl screen's card is the surface card, the first visit's hint, or none, and is redrawn when that changes; `game.aspect` follows resizes; the speed test's reset also resets the game.

- [ ] **Step 1: The worm's frame and shadow**

In `src/worm/wormMesh.ts`, after the field `private readonly shadow: WormShadow;` add:

```ts
  /** The tube's back (dorsal side) faces this way: world up on the surface, the camera in the cut. */
  readonly up = { x: 0, y: 1, z: 0 };
```

Before `update(pose: WormPose): void {` add:

```ts
  /** The contact shadow lies on the forest floor: hidden in the cut. */
  showShadow(on: boolean): void {
    this.shadow.mesh.visible = on;
  }

```

and in `update`, replace:

```ts
    transportFrames(c, RINGS, T, N, B);
```

with:

```ts
    transportFrames(c, RINGS, T, N, B, this.up.x, this.up.y, this.up.z);
```

- [ ] **Step 2: Split World.sync**

In `src/game/world.ts` add `import type { Vec3 } from '../core/vec';` beside the other imports. In `interface World`, after `sync(...)`'s declaration add:

```ts
  /**
   * The part of sync that poses the worm and what reads it (the leaf fade, the near clutter, the
   * litter chunks), from a pose the caller made: the underground uses it while the surface (the
   * crawl, its hero leaves and its leaf map) stands still (V2 spec 10). The camera is the caller's.
   */
  syncWorm(pose: WormPose, focus: Vec3, camera: THREE.PerspectiveCamera): void;
```

Replace the body of `sync` (V1's version shown; keep any lines Plan A added, in the half they belong to):

```ts
    sync(crawl, alpha, timeSec, camera) {
      crawl.interpolate(alpha, timeSec, pose, camera);
      worm.update(pose);
      hero.update(crawl.hero, alpha);
      setFocus(crawl.focus.x, crawl.focus.y, crawl.focus.z);
      if (nearClutter.visible) setSpine(pose.spine);
      // The leaf fade (every preset): the body as this frame's camera sees it.
      camera.updateMatrixWorld();
      const pe = camera.projectionMatrix.elements;
      const g = groundUniforms;
      const view = camera.matrixWorldInverse.elements;
      g.uOccCount.value = occluderSegments(pose.spine, view, pe[0], pe[5], g.uOccSeg.value, occBox);
      g.uOccBox.value.fromArray(occBox);
      g.uOccDepth.value = occBox[4];
      g.uOccTan.value.set(1 / pe[0], 1 / pe[5]);
      if (crawl.disturbed) {
        uploadDisturbance(crawl.disturbance);
        // The mode's window: leaves past it never read the map, so chunks there need not react.
        setDisturbFade(crawl.reach.fadeFrom, crawl.reach.fadeTo);
        disturbedBox(crawl.disturbance, distBox, crawl.reach.fadeTo);
        crawl.disturbed = false;
      }
      // Per litter chunk: full or low-detail leaves, and whether it may react (as uploaded now).
      forest.litter.update(camera.position.x, camera.position.z, pose.spine, distBox);
    },
```

with:

```ts
    sync(crawl, alpha, timeSec, camera) {
      crawl.interpolate(alpha, timeSec, pose, camera);
      hero.update(crawl.hero, alpha);
      if (crawl.disturbed) {
        uploadDisturbance(crawl.disturbance);
        // The mode's window: leaves past it never read the map, so chunks there need not react.
        setDisturbFade(crawl.reach.fadeFrom, crawl.reach.fadeTo);
        disturbedBox(crawl.disturbance, distBox, crawl.reach.fadeTo);
        crawl.disturbed = false;
      }
      world.syncWorm(pose, crawl.focus, camera);
    },
    syncWorm(p, focus, camera) {
      worm.update(p);
      setFocus(focus.x, focus.y, focus.z);
      if (nearClutter.visible) setSpine(p.spine);
      // The leaf fade (every preset): the body as this frame's camera sees it.
      camera.updateMatrixWorld();
      const pe = camera.projectionMatrix.elements;
      const g = groundUniforms;
      const view = camera.matrixWorldInverse.elements;
      g.uOccCount.value = occluderSegments(p.spine, view, pe[0], pe[5], g.uOccSeg.value, occBox);
      g.uOccBox.value.fromArray(occBox);
      g.uOccDepth.value = occBox[4];
      g.uOccTan.value.set(1 / pe[0], 1 / pe[5]);
      // Per litter chunk: full or low-detail leaves, and whether it may react (as uploaded now).
      forest.litter.update(camera.position.x, camera.position.z, p.spine, distBox);
    },
```

(Uploading the leaf map before posing the worm, instead of after, changes nothing drawn: both happen before the frame renders.)

- [ ] **Step 3: Move the shader warm-up out of main**

Create `src/render/warmShaders.ts`:

```ts
import type * as THREE from 'three';
import type { World } from '../game/world';

/**
 * Compiles every eagerly built program once, now, while the Start card is up (moved from
 * main.ts). On Low the atmosphere (light shafts, motes, falling leaves) is hidden, so without this
 * three would compile those programs on the first switch up from Low and the game would hitch once.
 * three r186's renderer.compile prepares hidden objects too, so the hidden near litter chunks'
 * plain program and the hidden underground (the cut face, its props, the burrow openings: V2) are
 * compiled here as well; showing the atmosphere for the call only keeps this from depending on
 * that. The lazily built layers (detail leaves, Ultra's near clutter) are deliberately not built
 * here: their one-time build and compile on first show is accepted (main.ts applySpec). Nor is
 * the litter's reacting (active) program, which no chunk wears yet: it compiles on the first frame
 * a chunk reacts (a world rebuild lends it out, compileForest).
 */
export function warmShaders(renderer: Pick<THREE.WebGLRenderer, 'compile'>, world: World, camera: THREE.Camera): void {
  const group = world.atmosphere.group;
  const wasVisible = group.visible;
  group.visible = true;
  try {
    renderer.compile(world.scene, camera);
  } finally {
    group.visible = wasVisible;
  }
}
```

In `src/main.ts` delete the whole `function warmShaders(): void { ... }` with its comment, and replace the call `warmShaders();` with `warmShaders(renderer, world, camera);` (import `warmShaders` from `'./render/warmShaders'`).

- [ ] **Step 4: The cut scene and its wiring**

Create `src/underground/cutScene.ts`:

```ts
import * as THREE from 'three';
import '../ui/underground.css';
import { sharedLighting } from '../render/paintedMaterial';
import type { World } from '../game/world';
import type { Crawl } from '../game/crawl';
import type { WormPose } from '../worm/wormMesh';
import { WORM_SEGMENTS } from '../game/crawl';
import { OCC_AXIS_UP } from '../render/occlusion';
import type { BurrowGame } from './burrowGame';
import { createCutFace } from './cutFace';
import { createSlabProps } from './slabProps';
import { createMiddens } from './middens';
import { createLayerLabels } from './layerLabels';
import { cutPose, type CutPose } from './cutCamera';
import { cameraProgress, bodyProgress, RISE_S, OUT_S } from './modeMachine';
import { smootherstep } from './bodyPath';
import { slabX, slabZ } from './slab';

export interface CutScene {
  readonly group: THREE.Group;
  /** Poses and draws state for this frame: the surface as before, or the cut and the moves between. */
  sync(alpha: number, timeSec: number, camera: THREE.PerspectiveCamera, width: number, height: number): void;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** The forest beyond the cut fades into haze from just behind it (spec 4.1: "dimmed by depth haze"). */
const HAZE_FROM = 1.5;
const HAZE_SPAN = 26;
/** The camera's swing rises this much at its middle, up over the leaves rather than through them. */
const SWING_ARC = 1.2;

/**
 * Draws the underground (V2 spec 4, 5, 7): the cut face, its stones, roots and life, the burrow
 * openings on the surface, the layer names, and the camera's moves. Built once at load (its
 * shaders compile with everything else); entering and leaving only show, hide and set uniforms.
 * While the worm is underground the surface stands still: its leaf map is not uploaded and its
 * hero leaves are not stepped (the crawl is not stepped at all); the forest stays drawn, hazed.
 */
export function createCutScene(game: BurrowGame, world: World, crawl: Crawl, root: HTMLElement): CutScene {
  const face = createCutFace();
  const props = createSlabProps();
  const middens = createMiddens();
  const labels = createLayerLabels(root);
  const group = new THREE.Group();
  group.name = 'underground';
  group.add(face.mesh, props.mesh);
  group.visible = false;
  world.scene.add(group, middens.mesh);
  const fade = document.createElement('div');
  fade.className = 'cut-fade';
  fade.hidden = true;
  root.appendChild(fade);

  const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
  const focus = { x: 0, y: 0, z: 0 };
  const surfCam = new THREE.PerspectiveCamera();
  const cutCam = new THREE.PerspectiveCamera();
  const scratch: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
  const cp: CutPose = { px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0, near: 0.2 };
  const baseFog = { near: sharedLighting.uFogNear.value, far: sharedLighting.uFogFar.value };
  let baseNear = -1;
  let under = false;
  let slabVersion = -1;
  let fadeShown = 0;
  /** The mode on the page (data-place on the app root): for tests, and for nothing else. */
  let place = '';

  function setFade(o: number): void {
    const q = Math.round(o * 50) / 50;
    if (q === fadeShown) return;
    fadeShown = q;
    fade.hidden = q === 0;
    fade.style.opacity = String(q);
  }

  function setNear(camera: THREE.PerspectiveCamera, near: number): void {
    if (camera.near === near) return;
    camera.near = near;
    camera.updateProjectionMatrix();
  }

  /** Back on the surface: everything as V1 drew it. */
  function leave(camera: THREE.PerspectiveCamera): void {
    under = false;
    group.visible = false;
    world.worm.showShadow(true);
    world.worm.up.x = 0; world.worm.up.y = 1; world.worm.up.z = 0;
    sharedLighting.uFogNear.value = baseFog.near;
    sharedLighting.uFogFar.value = baseFog.far;
    setNear(camera, baseNear);
    setFade(0);
  }

  return {
    group,
    sync(alpha, timeSec, camera, width, height) {
      if (baseNear < 0) baseNear = camera.near;
      const m = game.mode;
      if (m.mode !== place) {
        place = m.mode;
        root.dataset.place = place;
      }
      middens.update(game.openings);
      const s = game.slab;
      if (m.mode === 'surface' || !s) {
        if (under) leave(camera);
        world.sync(crawl, alpha, timeSec, camera);
        labels.update(camera, null, false, width, height);
        return;
      }
      if (!under) {
        under = true;
        world.worm.showShadow(false);
      }
      if (slabVersion !== game.slabVersion) {
        slabVersion = game.slabVersion;
        face.setSlab(s, game.grid);
        props.setSlab(s, game.solids);
      }
      face.upload(game.grid);

      // The camera: from the (still) surface follow camera to the cut camera, eased; or a dip through
      // dark soil with reduced motion. The near plane closes in on the cut only at the very end.
      crawl.interpolate(1, timeSec, scratch, surfCam);
      const c = game.cam;
      const q = game.camPrev;
      cutPose(s, lerp(q.cu, c.cu.value, alpha), lerp(q.cv, c.cv.value, alpha), lerp(q.h, c.h.value, alpha), lerp(q.pitch, c.pitch.value, alpha), cp);
      cutCam.position.set(cp.px, cp.py, cp.pz);
      cutCam.up.set(0, 1, 0);
      cutCam.lookAt(cp.lx, cp.ly, cp.lz);
      const p = cameraProgress(m);
      let e: number;
      if (m.reduced) {
        e = p < 0.5 ? 0 : 1;
        setFade(1 - Math.abs(2 * p - 1));
      } else {
        e = smootherstep(p);
        setFade(0);
      }
      camera.position.lerpVectors(surfCam.position, cutCam.position, e);
      camera.position.y += SWING_ARC * Math.sin(Math.PI * e);
      // Shown once the camera starts to move (the worm sinks seen from behind, as on the surface).
      group.visible = p > 0;
      camera.quaternion.slerpQuaternions(surfCam.quaternion, cutCam.quaternion, e);
      setNear(camera, lerp(baseNear, cp.near, e ** 6));
      const d = Math.hypot(cp.px - cp.lx, cp.py - cp.ly, cp.pz - cp.lz);
      sharedLighting.uFogNear.value = lerp(baseFog.near, d + HAZE_FROM, e);
      sharedLighting.uFogFar.value = lerp(baseFog.far, d + HAZE_FROM + HAZE_SPAN, e);

      // The worm: its body in the plane (sliding in from beside it while it sinks), its back
      // turning from the sky to the camera as it goes down, and back again as it crawls out.
      const w = game.worm;
      const lat = lerp(game.latPrev, game.latNow, alpha);
      const sp = pose.spine;
      for (let i = 0; i < WORM_SEGMENTS; i++) {
        const u = lerp(w.prevU[i], w.u[i], alpha);
        const off = game.lateral[i] * lat;
        sp[i * 3] = slabX(s, u) + s.nx * off;
        sp[i * 3 + 1] = lerp(w.prevV[i], w.v[i], alpha) - OCC_AXIS_UP;
        sp[i * 3 + 2] = slabZ(s, u) + s.nz * off;
      }
      pose.phase = lerp(w.prevWave.phase, w.wave.phase, alpha);
      pose.activity = lerp(w.prevWave.activity, w.wave.activity, alpha);
      pose.timeSec = timeSec;
      const b = m.mode === 'diggingDown' ? smootherstep(bodyProgress(m))
        : m.mode === 'comingUp' ? 1 - smootherstep((m.t - RISE_S) / OUT_S) : 1;
      const up = world.worm.up;
      const ul = Math.hypot(s.nx * b, 1 - b, s.nz * b) || 1;
      up.x = (s.nx * b) / ul; up.y = (1 - b) / ul; up.z = (s.nz * b) / ul;
      focus.x = sp[0]; focus.y = sp[1]; focus.z = sp[2];
      world.syncWorm(pose, focus, camera);
      labels.update(camera, s, m.mode === 'underground' && e > 0.98, width, height);
    },
  };
}
```

Create `src/underground/burrowing.ts`:

```ts
import type { Crawl } from '../game/crawl';
import type { World } from '../game/world';
import { loadSettings, updateSettings, type KeyValueStore } from '../save/settingsStore';
import { BurrowGame } from './burrowGame';
import { createCutScene, type CutScene } from './cutScene';

/**
 * The underground, ready for main.ts: the game (with the player's saved view, saved again only
 * when they switch it, and prefers-reduced-motion read as each move starts) and its renderer,
 * whose meshes join the world's scene now, so warmShaders compiles them with everything else.
 */
export function createBurrowing(
  crawl: Crawl, world: World, root: HTMLElement, store: KeyValueStore | null,
): { game: BurrowGame; cut: CutScene } {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const game = new BurrowGame(crawl, {
    reducedMotion: () => reduceMotion.matches,
    saveView: (v) => { updateSettings(store, { undergroundView: v }); },
  }, loadSettings(store).undergroundView);
  return { game, cut: createCutScene(game, world, crawl, root) };
}
```

- [ ] **Step 5: Wire main.ts**

Imports: add

```ts
import { createBurrowing } from './underground/burrowing';
import { showUnderground } from './ui/undergroundHint';
```

and use `NO_COMMANDS` from `./input/commands` (`import { NO_COMMANDS, keysToCommandsInto, mergeCommandsInto, type Commands } from './input/commands';`). If nothing else uses them afterwards, delete `import type { Vec2 } from './core/vec';` and `const NO_MOVE: Vec2 = Object.freeze({ x: 0, y: 0 });`.

Right after `const world = buildWorld(crawl);` (and after Plan A's `ActionPrompt` is created, if Plan A creates it there) add:

```ts
  // Surface or underground (V2): the game steps the crawl on the surface and digs below it.
  const { game, cut } = createBurrowing(crawl, world, app, store);
  /** The crawl screen's card: 0 the surface one, 1 the first underground visit's hint, 2 none (underground). */
  let shownCard = 0;
  const cardNow = (): number => (game.mode.mode === 'surface' ? 0 : game.hintShowing ? 1 : 2);
```

In the speed-test runner's `resetWorld`, after `crawl.reset();` add `game.reset();`.

In `resize()`, after `camera.updateProjectionMatrix();` add `game.aspect = camera.aspect;`.

In `draw()`, replace:

```ts
      case 'crawl':
        return showCrawl(shell);
```

with:

```ts
      case 'crawl':
        shownCard = cardNow();
        return shownCard === 0 ? showCrawl(shell) : showUnderground(shell, shownCard === 1);
```

Replace the per-step input function (V1's `move()`; Plan A has already OR-ed its touch button's `touchHeld` into the touch commands' `action`; keep that line exactly as Plan A wrote it):

```ts
  // Preallocated: move() runs every 60 Hz step and must not allocate.
  const keyCmds: Commands = { move: { x: 0, y: 0 }, action: false, wormView: false, pause: false };
  const touchCmds: Commands = { move: NO_MOVE, action: false, wormView: false, pause: false };
  const heldCmds: Commands = { move: { x: 0, y: 0 }, action: false, wormView: false, pause: false };

  function move(): Vec2 {
    if (runner.running) return AUTO_DRIVE_MOVE.move;
    if (state.screen !== 'crawl') return NO_MOVE;
    touchCmds.move = joystick.value; // the joystick replaces its value object; no copy needed
    return mergeCommandsInto(keysToCommandsInto(keyboard.down, keyCmds), touchCmds, heldCmds).move;
  }
```

with a function returning the whole commands (move and action):

```ts
  // Preallocated: commands() runs every 60 Hz step and must not allocate.
  const keyCmds: Commands = { move: { x: 0, y: 0 }, action: false, wormView: false, pause: false };
  const touchCmds: Commands = { move: NO_COMMANDS.move, action: false, wormView: false, pause: false };
  const heldCmds: Commands = { move: { x: 0, y: 0 }, action: false, wormView: false, pause: false };

  /** This step's commands: the speed test's drive, or the keyboard merged with the touch controls. */
  function commands(): Commands {
    if (runner.running) return AUTO_DRIVE_MOVE;
    if (state.screen !== 'crawl') return NO_COMMANDS;
    touchCmds.move = joystick.value; // the joystick replaces its value object; no copy needed
    touchCmds.action = prompt.touchHeld; // Plan A's line (its ActionPrompt), as Plan A wrote it
    return mergeCommandsInto(keysToCommandsInto(keyboard.down, keyCmds), touchCmds, heldCmds);
  }
```

Replace `update()` (Task 10's version):

```ts
  function update(dt: number): void {
    if (frozen()) return;
    crawl.step(dt, move());
    keyboard.settle();
  }
```

with:

```ts
  function update(dt: number): void {
    if (frozen()) return;
    const c = commands();
    keyboard.settle();
    game.step(dt, c.move, c.action);
  }
```

In `render()`, replace:

```ts
    world.sync(crawl, alpha, clock / 1000, camera);
    renderer.render(world.scene, camera);
```

with:

```ts
    cut.sync(alpha, clock / 1000, camera, window.innerWidth, window.innerHeight);
    renderer.render(world.scene, camera);
    prompt.set(state.screen === 'crawl' && !runner.running ? game.prompt : null);
    // Gone down, come up, or the first visit's hint has had its time: the crawl screen's card changes.
    if (state.screen === 'crawl' && shownCard !== cardNow()) draw();
```

If Plan A already calls `prompt.set(...)` somewhere (for example `set(null)` on menus), remove its call so this line is the only one. `prompt` is Plan A's `ActionPrompt` instance.

Check `main.ts` did not grow: `git diff --stat src/main.ts` should show no more insertions than deletions for this task (the warm-up moved out).

- [ ] **Step 6: Run the checks**

```bash
npx tsc --noEmit
npx vitest run
npm run verify:build
npm run test:e2e
```

Expected: unit suite unchanged from Task 15 (**+16 files, +74 tests**); `single-file build OK`; every existing e2e test passes (the crawl, pause, Graphics, speed test and zero-compile tests run through the new step and draw paths).

- [ ] **Step 7: Look at it (rendering)**

```bash
npm run build
node .cache/shot.mjs .cache/shots/t17-wide.png "?preset=high" click:Crawl hold:Space:150 until:underground wait:800
node .cache/shot.mjs .cache/shots/t17-close.png "?preset=high" click:Crawl hold:Space:150 until:underground wait:300 hold:ArrowDown:1500 hold:Space:150 wait:1500 hold:ArrowRight:2500 wait:800
node .cache/shot.mjs .cache/shots/t17-swing.png "?preset=high" click:Crawl hold:Space:150 until:diggingDown wait:1600
node .cache/shot.mjs .cache/shots/t17-phone.png "?preset=high" size:360x640 click:Crawl hold:Space:150 until:underground wait:800
node .cache/shot.mjs .cache/shots/t17-up.png "?preset=high" click:Crawl hold:Space:150 until:underground hold:ArrowRight:2500 down:ArrowUp until:underground wait:3000 up:ArrowUp hold:Space:150 until:surface wait:800 hold:ArrowLeft:2500 wait:500
```

Each must print `errors: none`. Look at every image against the visual brief and the reference photos (`reference images/` IMG_2427, IMG_2428, IMG_2438: dark matted old leaves with white threads and fine roots under bright litter):
- **Wide** (`t17-wide`): the litter band bright and jumbled (red, orange, yellow, some green, pale tan; dark gaps), F dark brown-black with fine white hyphae and pale roots and a green moss edge at its top, a thin black H, grey-brown A with grit, a pale grey E, rust-brown B with mottles and pebbles; the boundaries irregular; darker with depth, the bottom fading to black. Above the cut: the 3D forest floor's edge, trunks and sky, hazed; nothing standing between the camera and the cut. The worm in the cut, its back to the camera, in a dark half-tunnel. No light ring round stones or roots.
- **Close** (`t17-close`): the worm big, more room ahead of the head than behind; the tunnel it dug a dark rounded hollow; a casting or the mixed dark walls where it ate through F and H; the names at a slab end (if it reached one) with ticks at the boundaries.
- **Swing** (`t17-swing`): mid-swing the camera is above the leaves, the cut appearing; no sparkling streaky band where the face is seen at a slant (if there is one, a tile is being minified without mipmaps: check `soilTiles.ts`'s `generateMipmaps` and `minFilter`).
- **Phone** (`t17-phone`): the first visit's card over the top; the cut readable below it. After 12 s underground the card goes.
- **Up** (`t17-up`): back on the surface facing along the cut; turning left shows the midden by the opening on the leaves.

With Plan A's deeper litter the litter band's top meets the 3D leaves at the lip. If any of these looks wrong, fix it in the task that owns it and re-run that task's tests. In the scratch build (V1 litter plus the stub's 0.5–1.2 u litter top) the litter band stood above V1's thin leaves; with Plan A's leaves it should not.

- [ ] **Step 8: Commit**

```bash
git add src/worm/wormMesh.ts src/game/world.ts src/render/warmShaders.ts src/underground/cutScene.ts src/underground/burrowing.ts src/main.ts
git commit -m "feat(underground): dig down into the cut and come back up, on screen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Underground in the browser: keyboard, touch, reduced motion, no compiles, no network

**Files:**
- Create: `tests/e2e/underground.spec.ts`

Spec 12's browser checks. Keyboard only: dig down, dig around, switch the camera (saved only then), pause and resume, come up. Going down and up (with a view switch) compiles no shader, offline, with zero requests, and the CSP still blocks connections. Touch (a phone-sized touch context, Chrome's touch events through CDP): the touch Action button digs down, switches the view and comes up; the joystick steers up into the litter. Reduced motion: the dip shows instead of the swing. The layer names show at both ends, 18 px or more, on a screen wide enough to show the whole slab. (The `?dig=1` speed-test check is added in Task 19.) The tests wait on `#app[data-place]` and on the prompt's word, never on fixed times, and hold keys and touches for 150 ms or more.

The touch test finds Plan A's touch Action button by its word (`Dig down`, `Close view`, `Come up`). If Plan A's button shows only an icon on touch screens, give it an accessible name from `TEXT` and find it by role instead (`page.getByRole('button', { name: 'Dig down' })`).

- [ ] **Step 1: Write the tests**

Create `tests/e2e/underground.spec.ts` with the content below **minus its last test** ("the speed test digs underground with ?dig=1 and says so"), which Task 19 adds:

```ts
import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PAGE = pathToFileURL(path.resolve('dist/index.html')).href;

/** Page errors and console errors. SwiftShader's "GPU stall due to ReadPixels" is a harmless driver note. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('GPU stall')) errors.push(m.text());
  });
  return errors;
}

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
/** The Action prompt (an icon and a word: Plan A's ActionPrompt), found by its word. */
const prompt = (page: Page, word: string) => page.getByText(word, { exact: true });
const place = (page: Page, p: string) => expect(page.locator(`#app[data-place="${p}"]`)).toHaveCount(1, { timeout: 30_000 });
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('wormsim.settings') ?? 'null'));

/** A real key press: held for 150 ms, so the 60 Hz game steps see it. */
async function hold(page: Page, key: string, ms = 150): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

/** Counts shader compiles from the start of the page. */
async function countCompiles(page: Page): Promise<() => Promise<number>> {
  await page.addInitScript(() => {
    const w = window as unknown as { __compiles: number };
    w.__compiles = 0;
    const proto = WebGL2RenderingContext.prototype;
    const compile = proto.compileShader;
    proto.compileShader = function (s) { w.__compiles++; return compile.call(this, s); };
  });
  return () => page.evaluate(() => (window as unknown as { __compiles: number }).__compiles);
}

test('keyboard only: dig down, dig around, switch the camera, pause, come up', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(PAGE);
  await expect(button(page, 'Crawl')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Crawling' })).toBeVisible();
  await expect(prompt(page, 'Dig down')).toBeVisible();
  await hold(page, 'Space');
  await place(page, 'underground');
  // The first visit's hint, with its Game choice label (spec 6).
  await expect(page.getByText(/^Game choice: real nightcrawlers/)).toBeVisible();
  await expect(prompt(page, 'Close view')).toBeVisible();
  // Dig around.
  await hold(page, 'ArrowDown', 1200);
  await hold(page, 'ArrowRight', 1200);
  // Switch the camera: saved only now (the V1 rule), and the prompt offers the other view.
  expect((await saved(page))?.undergroundView).toBeUndefined();
  await hold(page, 'Space');
  await expect(prompt(page, 'Wide view')).toBeVisible();
  expect((await saved(page)).undergroundView).toBe('close');
  // Pause and resume underground.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Paused' })).toBeVisible();
  await page.keyboard.press('Escape');
  await place(page, 'underground');
  // Up into the litter, then Action comes up.
  await page.keyboard.down('ArrowUp');
  await expect(prompt(page, 'Come up')).toBeVisible({ timeout: 30_000 });
  await page.keyboard.up('ArrowUp');
  await place(page, 'underground');
  await hold(page, 'Space');
  await place(page, 'surface');
  await expect(page.getByRole('region', { name: 'Crawling' })).toBeVisible();
  await expect(prompt(page, 'Dig down')).toBeVisible({ timeout: 10_000 });
  expect(errors).toEqual([]);
});

test('going down and coming up compiles no shader, offline, with zero network requests', async ({ page, context }) => {
  const errors = watchErrors(page);
  const compiles = await countCompiles(page);
  const outside: string[] = [];
  page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) outside.push(r.url()); });
  await context.setOffline(true);
  await page.goto(PAGE);
  await button(page, 'Crawl').click();
  // Let the first frames compile everything (the litter's reacting program on its first frame).
  await hold(page, 'ArrowUp', 800);
  await page.waitForTimeout(1500);
  const before = await compiles();
  expect(before).toBeGreaterThan(0);
  await hold(page, 'Space');
  await place(page, 'underground');
  await hold(page, 'ArrowDown', 800);
  await hold(page, 'Space'); // Close view
  await expect(prompt(page, 'Wide view')).toBeVisible();
  await page.keyboard.down('ArrowUp');
  await expect(prompt(page, 'Come up')).toBeVisible({ timeout: 30_000 });
  await page.keyboard.up('ArrowUp');
  await hold(page, 'Space');
  await place(page, 'surface');
  await page.waitForTimeout(800);
  expect(await compiles()).toBe(before);
  // The CSP still blocks every connection.
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("connect-src 'none'");
  expect(outside).toEqual([]);
  expect(errors).toEqual([]);
});

test('touch: the Action button digs down, switches the view and comes up; the joystick steers underground', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 360, height: 640 } });
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto(PAGE);
  await button(page, 'Crawl').click();
  const cdp = await context.newCDPSession(page);
  /**
   * A touch held for `ms` on `box`: at its centre, or (dragged) from its lower part to (dx, dy)
   * from its centre. The first visit's hint card can reach down over the stick's top on a phone.
   */
  const touch = async (box: { x: number; y: number; width: number; height: number }, ms: number, dx = 0, dy = 0) => {
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const drag = dx !== 0 || dy !== 0;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: drag ? y + box.height * 0.35 : y }] });
    if (drag) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx, y: y + dy }] });
    await page.waitForTimeout(ms);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const action = async (word: string) => touch((await prompt(page, word).boundingBox())!, 200);
  await expect(prompt(page, 'Dig down')).toBeVisible();
  await action('Dig down');
  await place(page, 'underground');
  await action('Close view');
  await expect(prompt(page, 'Wide view')).toBeVisible();
  // The joystick points the way: up into the litter, where Action comes up.
  const stick = (await page.locator('.joystick').boundingBox())!;
  await touch(stick, 3500, 0, -40);
  await expect(prompt(page, 'Come up')).toBeVisible();
  await action('Come up');
  await place(page, 'surface');
  expect(errors).toEqual([]);
  await context.close();
});

test('reduced motion: going down dips through a fade instead of swinging the camera', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  await button(page, 'Crawl').click();
  await hold(page, 'Space');
  await expect(page.locator('.cut-fade:not([hidden])')).toHaveCount(1, { timeout: 10_000 });
  await place(page, 'underground');
  await expect(page.locator('.cut-fade')).toBeHidden({ timeout: 5_000 });
});

test('the layer names show at both ends of the slab, as real text', async ({ browser }) => {
  // A screen wide enough for Wide to show the whole slab, both ends at once.
  const page = await browser.newPage({ viewport: { width: 1600, height: 500 } });
  await page.goto(PAGE);
  await button(page, 'Crawl').click();
  await hold(page, 'Space');
  await place(page, 'underground');
  await expect(page.locator('.cut-labels:not([hidden])')).toHaveCount(2, { timeout: 10_000 });
  for (const name of ['Leaf litter', 'Old leaves', 'Humus', 'Topsoil', 'Subsoil']) {
    await expect(page.locator('.cut-labels:not([hidden]) .cut-label', { hasText: name })).toHaveCount(2);
  }
  const size = await page.locator('.cut-label').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(size).toBeGreaterThanOrEqual(18);
  await page.close();
});

test('the speed test digs underground with ?dig=1 and says so', async ({ page }) => {
  await page.goto(PAGE + '?quick=1&speedtest=1&dig=1');
  await button(page, 'Start speed test').click();
  await expect(page.getByTestId('result')).toContainText('Where: Underground', { timeout: 60_000 });
});
```

- [ ] **Step 2: Run them**

```bash
npm run build && npx playwright test tests/e2e/underground.spec.ts
```

Expected: **5 passed** (about 2–4 minutes under SwiftShader). They exercise code already built: if one fails, it is a real bug in Tasks 11–17 (or a Plan A name mismatch in the prompt). Fix it there.

- [ ] **Step 3: The whole suite**

```bash
npm run test:e2e
```

Expected: everything passes; e2e **+1 file, +5 tests** against your Plan A baseline.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/underground.spec.ts
git commit -m "test(underground): keyboard, touch, reduced motion, zero compiles and zero network underground" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: The speed test digs, and the perf gates run underground

**Files:**
- Modify: `src/game/params.ts`
- Modify: `tests/unit/params.test.ts` **(Plan A may have changed it: re-read it first)**
- Modify: `src/perf/speedTest.ts`, `src/perf/speedTestRunner.ts` **(Plan A may have changed them: re-read them first)**
- Modify: `src/main.ts` **(re-read it first)**
- Modify: `scripts/perf-gates.mjs` **(Plan A changed it to True only: re-read it first)**
- Modify: `tests/e2e/underground.spec.ts` (its last test)

Spec 10: the gates run underground too. `?dig=1` makes the speed test start straight underground at the spawn (Wide) and point the worm along a slow figure so it keeps eating fresh soil (dirty rows uploaded every frame: the real cost). The report gains "Where: Surface" or "Where: Underground", which the gates check. `scripts/perf-gates.mjs` runs every preset in both places (`--place=surface,under`, both by default), held to the same per-preset gates and the 40-draw budget. The speed test's reset also clears the session's openings (the numbers must not depend on where the player had dug).

- [ ] **Step 1: Write the failing tests**

In `tests/unit/params.test.ts`, add `dig: false` to the two expectations that compare the whole `parseParams` result (V1's lines shown):

```ts
    expect(parseParams('')).toEqual({ preset: null, scale: null, fps: false, quick: false, speedTest: false, dig: false });
```

```ts
      .toEqual({ preset: 'ultra', scale: 'hybrid', fps: true, quick: true, speedTest: true, dig: false });
```

and add this test inside the `describe`:

```ts
  it('reads ?dig=1: the speed test digs underground (V2 perf gates)', () => {
    expect(parseParams('?speedtest=1&dig=1').dig).toBe(true);
    expect(parseParams('?dig=yes').dig).toBe(false);
  });
```

Append to `tests/e2e/underground.spec.ts` the last test shown in Task 18:

```ts
test('the speed test digs underground with ?dig=1 and says so', async ({ page }) => {
  await page.goto(PAGE + '?quick=1&speedtest=1&dig=1');
  await button(page, 'Start speed test').click();
  await expect(page.getByTestId('result')).toContainText('Where: Underground', { timeout: 60_000 });
});
```

Run: `npx vitest run tests/unit/params.test.ts`
Expected: FAIL (no `dig` field).

- [ ] **Step 2: Implement**

`src/game/params.ts`: in `interface GameParams` add

```ts
  /** `?dig=1`: the speed test digs underground instead of crawling (V2 perf gates). */
  dig: boolean;
```

and in `parseParams`'s returned object add `dig: p.get('dig') === '1',`.

`src/perf/speedTestRunner.ts`: in `interface SpeedTestHost` add

```ts
  /** Where the test ran: "Surface" or "Underground" (V2), for the report. */
  where?(): string;
```

and pass `this.host.where?.()` as a new last argument of the `formatResults(...)` call.

`src/perf/speedTest.ts`: give `formatResults` a new last optional parameter `where?: string` (document it: "on the surface or underground (V2; the perf gates check it)") and add, right after the `Leaves:` line (and Plan A's world line, if it kept one):

```ts
    ...(where ? [`Where: ${where}`] : []),
```

`src/main.ts`: import `clearOpenings` from `'./underground/openings'`. In the runner's `resetWorld`, after `game.reset();` add:

```ts
      clearOpenings(game.openings);
      // ?dig=1: the test digs underground instead (scripts/perf-gates.mjs's underground run).
      if (params.dig) game.enterNow();
```

In the runner's host object add `where: () => (params.dig ? 'Underground' : 'Surface'),`. In `update()` replace `game.step(dt, c.move, c.action);` with:

```ts
    game.step(dt, c.move, c.action, runner.running && params.dig);
```

Replace `scripts/perf-gates.mjs` with the version below. It is V1's script with the world-scale dimension replaced by places (Plan A made the script True-only): `--place=surface,under` instead of `--scale=`, the query adds `&dig=1` underground, and a line fails with `WRONG PLACE` if the report's `Where:` does not match. If Plan A kept anything else in the script (a different baseline or report check), keep it.

```js
// Performance gates (spec 2026-10-01 section 6; Step 1b spec 4.6; V2 spec 10): each preset's
// uncapped speed-test fps must be at least a fixed fraction of the Step 0 page's fps, measured back
// to back on the same machine so background load cancels out. Every gate holds on the surface and
// underground (the speed test digs a scripted tunnel with ?dig=1).
//
// Usage: npm run build && node scripts/perf-gates.mjs [cycles=4] [--place=surface,under] [--list] [presets...]
// It builds the Step 0 baseline once into .cache/step0 (git worktree at STEP0_REF), then runs
// S0, p1, p2, S0, p3, p4, S0 ... (each preset in each place) and prints each one's median ratio
// against its gate. By default it runs the surface and underground. --list prints the run order
// and exits. Takes ~4 min per cycle per place. Close other heavy apps first; results are still
// noisy (±5%).
// A line also fails if the page did not report the place it was asked for ("Where: ..."), or any
// fps or ratio is not a finite number, or draw calls exceed 40. Bad arguments print the usage and
// exit 1.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const STEP0_REF = '966b874'; // the final Step 0 page on main, the baseline Step 1a's gates were measured against
// The original absolute gates (50/40/34/28 fps) were set against the Step 0 prototype's 45.9 fps on a
// quiet machine; the final Step 0 page runs within ~5% of that, so the ratios carry over.
const STEP0_FPS = 45.9;
const GATES = { low: 50 / STEP0_FPS, medium: 40 / STEP0_FPS, high: 34 / STEP0_FPS, ultra: 28 / STEP0_FPS };
/** Where each run plays, the query that puts it there, and what its report must say. */
const PLACES = { surface: { query: '', where: 'Surface' }, under: { query: '&dig=1', where: 'Underground' } };

const repo = process.cwd();
const bench = path.join(repo, 'scripts/bench.mjs');
const step0 = path.join(repo, '.cache/step0');
const USAGE = 'usage: node scripts/perf-gates.mjs [cycles=4] [--place=surface,under] [--list] [low medium high ultra]';
const usageError = (msg) => { console.error(`${msg}\n${USAGE}`); process.exit(1); };
const args = process.argv.slice(2);
let placeArg = null;
let list = false;
for (const a of args.filter((x) => x.startsWith('--'))) {
  if (a === '--list') list = true;
  else if (a.startsWith('--place=') && a.length > '--place='.length && placeArg === null) placeArg = a.slice('--place='.length);
  else usageError(a === '--place' || a === '--place=' ? 'the --place flag needs a value (--place=surface,under)' : a.startsWith('--place=') ? 'give --place only once' : `unknown flag ${a}`);
}
const plain = args.filter((a) => !a.startsWith('--'));
if (plain[0] !== undefined && !/^[1-9]\d*$/.test(plain[0])) usageError(`cycles must be a positive integer, got "${plain[0]}"`);
const cycles = Number(plain[0] ?? 4);
const presets = plain.length > 1 ? plain.slice(1) : ['low', 'medium', 'high', 'ultra'];
const places = (placeArg ?? 'surface,under').split(',');
for (const p of places) if (!(p in PLACES)) usageError(`unknown place ${p} (${Object.keys(PLACES).join(', ')})`);
for (const p of presets) if (!(p in GATES)) usageError(`unknown preset ${p} (${Object.keys(GATES).join(', ')})`);
/** Every measured run: a preset in a place, labelled "place/preset". */
const labels = places.flatMap((pl) => presets.map((p) => `${pl}/${p}`));
const query = (label) => {
  const [pl, p] = label.split('/');
  return `?speedtest=1&preset=${p}${PLACES[pl].query}`;
};

if (list) {
  for (let c = 0; c < cycles; c++) {
    const order = labels.map((_, i) => labels[(i + c) % labels.length]);
    console.log(`cycle ${c + 1}: ${order.map((l) => `${l} ${query(l)}`).join(' | ')}`);
  }
  process.exit(0);
}

if (!existsSync(path.join(step0, 'dist/index.html'))) {
  if (!existsSync(step0)) execFileSync('git', ['worktree', 'add', '--detach', step0, STEP0_REF], { stdio: 'inherit' });
  execFileSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: step0, stdio: 'inherit' });
  execFileSync('npm', ['run', 'build'], { cwd: step0, stdio: 'inherit' });
}

const runs = [];
function run(dir, label, q) {
  let txt = '';
  try { txt = execFileSync('node', [bench, dir, label.replace('/', '-'), q], { encoding: 'utf8', timeout: 300_000 }); }
  catch (e) { txt = String(e.stdout ?? '') + String(e); }
  const fps = Number((txt.match(/Full quality, no cap: ([\d.]+)/) ?? [])[1]);
  const m = txt.match(/idle 1s: (\d+) draw calls, (\d+) tris over (\d+) rAFs/);
  const frames = m ? Math.min(Number(m[3]), 30) : NaN; // ~30 rendered frames at the cap
  const where = (txt.match(/Where: (\w+)/) ?? [])[1] ?? '?';
  const rec = { label, where, fps, draws: m ? Number(m[1]) / frames : NaN, tris: m ? Number(m[2]) / frames : NaN };
  runs.push(rec);
  console.log(JSON.stringify(rec));
}

run(step0, 's0', '');
for (let c = 0; c < cycles; c++) {
  const order = labels.map((_, i) => labels[(i + c) % labels.length]);
  for (let i = 0; i < order.length; i += 2) {
    run(repo, order[i], query(order[i]));
    if (order[i + 1]) run(repo, order[i + 1], query(order[i + 1]));
    run(step0, 's0', '');
  }
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
let failed = false;
console.log(`\nStep 0 fps this session: ${runs.filter((r) => r.label === 's0').map((r) => r.fps).join(', ')}`);
for (const label of labels) {
  const [place, preset] = label.split('/');
  const gate = GATES[preset];
  const mine = runs.filter((r) => r.label === label);
  const ratios = [], draws = [], tris = [];
  runs.forEach((r, i) => {
    if (r.label !== label) return;
    const s0 = runs[i - 1]?.label === 's0' ? runs[i - 1] : runs[i + 1]?.label === 's0' ? runs[i + 1] : null;
    if (s0) { ratios.push(r.fps / s0.fps); draws.push(r.draws); tris.push(r.tris); }
  });
  // The page must report the place this row asked for ("?" or another place means ?dig= was ignored).
  const wheres = [...new Set(mine.map((r) => r.where))];
  const placeOk = mine.length > 0 && mine.every((r) => r.where === PLACES[place].where);
  // Any missing or non-finite number fails the row; NaN never enters the median.
  const finite = mine.length > 0 && ratios.length > 0 && mine.every((r) => Number.isFinite(r.fps)) && ratios.every(Number.isFinite) && draws.every(Number.isFinite);
  const med = finite ? median(ratios) : NaN;
  // Draw calls stay within the 40-call budget (visual-quality-brief.md) in every place.
  const drawMax = finite ? Math.max(...draws) : NaN;
  const pass = placeOk && finite && med >= gate && drawMax <= 40;
  failed ||= !pass;
  const why = [!placeOk && `WRONG PLACE (asked ${place})`, !finite && 'NON-FINITE RESULT'].filter(Boolean).join(' ');
  console.log(`${label.padEnd(15)} where ${wheres.join('/') || '?'} median ${med.toFixed(3)} gate ${gate.toFixed(3)} ${pass ? 'PASS' : 'FAIL'}${why ? ' ' + why : ''}  ratios ${ratios.map((x) => x.toFixed(2)).join(' ')}  draws ≤ ${drawMax.toFixed(0)}  tris ≤ ${(Math.max(...tris) / 1000).toFixed(0)}k`);
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 3: Run the checks**

```bash
npx tsc --noEmit
npx vitest run
node scripts/perf-gates.mjs 1 --list
node scripts/perf-gates.mjs 1 --place=cave; echo "exit $?"
npm run build && npx playwright test tests/e2e/underground.spec.ts -g "dig=1"
npm run test:e2e
```

Expected: the suite **+16 files, +75 tests** (the params file gains one); `--list` prints `surface/low … surface/ultra under/low … under/ultra` with `&dig=1` on the `under/` lines; `--place=cave` prints the usage and `exit 1`; the dig e2e passes; e2e **+1 file, +6 tests** against your baseline.

- [ ] **Step 4: One rough benchmark (not the gates)**

Only if nothing heavy is running (`uptime`'s first load figure under about 4). This is a single, rough comparison to catch a disaster early; the real gates are Task 20:

```bash
node scripts/bench.mjs . surface-high "?speedtest=1&preset=high" | grep -E "no cap|Where|idle"
node scripts/bench.mjs . under-high "?speedtest=1&preset=high&dig=1" | grep -E "no cap|Where|idle"
```

Write down both "Full quality, no cap" fps and the draw calls per frame (idle draws ÷ rAFs, at most 30 rAFs). Underground should draw no more than 40 calls; its fps should be in the same range as the surface's. The planner's rough numbers (busy machine) are in the report's "Measured" note in Task 22.

- [ ] **Step 5: Commit**

```bash
git add src/game/params.ts tests/unit/params.test.ts src/perf/speedTest.ts src/perf/speedTestRunner.ts src/main.ts scripts/perf-gates.mjs tests/e2e/underground.spec.ts
git commit -m "perf(underground): the speed test digs with ?dig=1; the gates run underground too" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: Run the performance gates (no code unless a gate fails)

**Files:**
- Modify only if a gate fails: `src/underground/cutScene.ts`, `src/underground/soilTiles.ts`, `src/underground/cutFaceGlsl.ts` (the cuts below)

Spec 10: every preset passes its gate on the surface and underground, with at most 40 draw calls, no shadow maps, post passes or extra render targets. The surface run also re-checks Plan A's deeper litter with the underground in the scene.

- [ ] **Step 1: Run the gates with nothing else running**

Close other heavy apps and make sure no other agent is running (CLAUDE.md: benchmark with only one agent; this Mac is often busy; check `uptime`). About 4 minutes per cycle per place, so about 35 minutes:

```bash
npm run build && node scripts/perf-gates.mjs 4 2>&1 | tee .cache/gates-v2.txt
```

Expected: the last eight lines read `surface/low` … `surface/ultra`, `under/low` … `under/ultra`, each `PASS` (median ratio at or above its gate: Low 1.089, Medium 0.871, High 0.741, Ultra 0.610), `where Surface` or `where Underground` as asked, and `draws ≤` 40 or fewer. In the planner's rough pair (High, busy machine) the underground ran at 98% of the surface's fps with about 35 draws.

- [ ] **Step 2: Only if an `under/` line fails (fps or draws over 40): cut, in this order, re-running just the failing presets after each cut**

The planner measured about 36 draws underground on Ultra before Plan A's additions, so a draw-count failure is the likeliest one; cut 1 removes about 4 to 6 draws.

Re-run with `node scripts/perf-gates.mjs 4 --place=under <preset>`. Record every cut and its numbers for Task 22.

1. **Hide the surface's close-up layers while underground** (they sit at the dig point or in front of the cut, where the near plane removes them anyway). In `src/underground/cutScene.ts`, where the scene first goes under (`if (!under) { under = true; world.worm.showShadow(false); }`), also hide `world.detail.group`, `world.hero.mesh`, `world.nearClutter.group` and `world.atmosphere.group` (store each one's `visible` first), and restore those values in `leave()`. Visibility only: nothing recompiles (`warmShaders` compiled them).
2. **Cheaper tiles on the far face:** in `src/underground/soilTiles.ts`, `t.minFilter = THREE.LinearMipmapNearestFilter` is already the cheap mip filter; change `magFilter` of `grain` to `THREE.NearestFilter` only if the screenshots still look right (it shows grain as hard texels up close).
3. **Fewer tunnel taps:** in `src/underground/cutFaceGlsl.ts`, drop the two sideways taps (`g + dx`, `g - dx`) from the tunnel's six-tap average (`o = (s.r * 2.0 + up + dn) / 4.0`).

If a `surface/` line fails, compare with Plan A's last gate run first (`node scripts/perf-gates.mjs 4 --place=surface <preset>`): this plan adds only the hidden underground meshes and a `canDigAt` check per step to the surface, so a surface failure is most likely Plan A's litter, and Plan A's cut order (leaf counts, then clutter, then distant detail) applies.

- [ ] **Step 3: Commit any cut**

Skip this step when every gate passed. Otherwise run the checks and commit each cut with its own message:

```bash
npx tsc --noEmit && npx vitest run && npm run verify:build && npm run test:e2e
git add src/underground/cutScene.ts
git commit -m "perf(underground): hide the surface's close-up layers while underground" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
# or: git add src/underground/soilTiles.ts      -> "perf(underground): nearest magnification for the grain tile"
# or: git add src/underground/cutFaceGlsl.ts    -> "perf(underground): fewer texture taps round tunnels"
```

---

### Task 21: Screenshots for Matt and the slides (rendering)

**Files:**
- Create: `docs/codev/versions/v02-underground/wide.jpg`, `close.jpg`, `tunnels.jpg`, `stones-roots.jpg`, `opening.jpg`, `phone.jpg`

Spec 12: the cut face in both views, fresh vs dug and casted soil, stones and roots, the surface with an opening. They go into V2's slides (Task 23) and to Matt.

- [ ] **Step 1: Take them**

```bash
npm run build
mkdir -p docs/codev/versions/v02-underground
D=docs/codev/versions/v02-underground
node .cache/shot.mjs $D/wide.jpg "?preset=high" click:Crawl hold:Space:150 until:underground wait:13000
node .cache/shot.mjs $D/close.jpg "?preset=high" click:Crawl hold:Space:150 until:underground wait:13000 hold:ArrowDown:1200 hold:Space:150 wait:1500
node .cache/shot.mjs $D/tunnels.jpg "?preset=high" click:Crawl hold:Space:150 until:underground wait:13000 hold:Space:150 hold:ArrowDown:1500 hold:ArrowRight:4000 hold:ArrowUp:1500 hold:ArrowLeft:3000 hold:ArrowDown:2500 wait:800
node .cache/shot.mjs $D/stones-roots.jpg "?preset=high" click:Crawl hold:Space:150 until:underground wait:13000 hold:ArrowDown:5000 wait:800
node .cache/shot.mjs $D/opening.jpg "?preset=high" click:Crawl hold:Space:150 until:underground wait:13000 hold:ArrowRight:2000 down:ArrowUp wait:3500 up:ArrowUp hold:Space:150 until:surface wait:600 hold:ArrowLeft:3000 wait:600
node .cache/shot.mjs $D/phone.jpg "?preset=high" size:360x640 click:Crawl hold:Space:150 until:underground wait:13000
ls -la $D
```

(The 13 s waits let the first visit's hint card go, so the cut is clear.) Each must print `errors: none` and be well under 400 kB.

- [ ] **Step 2: Look at them against the visual brief and the photos**

Open all six. Check: the painted-naturalist look holds underground (warm light from the surface, soft colour bands, brush-like variation, no harsh aliasing or sparkle); the five layers read at a glance by **pattern** as well as colour (grey out the image in your head: the litter's blades, F's threads, H's crumbs and the mineral grain still differ); the boundaries are irregular; the forest continues above and behind the cut and nothing stands in front of it; the worm reads clearly in its tunnel; tunnels look like dark rounded hollows; castings read as dark granular blobs and mixed walls as darker crumbly rims (in `tunnels.jpg`); stones and big roots sit in the soil without glowing edges; the names and ticks are crisp at the slab's ends; the opening's midden reads as a heap of dark crumbs with leaf bits on the leaves (in `opening.jpg`). If something looks wrong, fix it in the task that owns it and re-run that task's tests.

- [ ] **Step 3: Commit**

```bash
git add docs/codev/versions/v02-underground/wide.jpg docs/codev/versions/v02-underground/close.jpg docs/codev/versions/v02-underground/tunnels.jpg docs/codev/versions/v02-underground/stones-roots.jpg docs/codev/versions/v02-underground/opening.jpg docs/codev/versions/v02-underground/phone.jpg
git commit -m "docs(v2): screenshots of the cutaway, tunnels, stones and roots, and a burrow opening" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 22: Changelog lines and the spec's as-built record

**Files:**
- Modify: `CHANGELOG.md` **(Plan A opened "Coming next: V2 · Underground" and added its lines: re-read it first)**
- Modify: `docs/superpowers/specs/2026-10-04-v2-underground-design.md`

- [ ] **Step 1: Changelog (student voice)**

Under "## Coming next: V2 · Underground", in its "### New" list, after Plan A's lines, add:

```markdown
- **Dig down!** Press Space (or the Action button) on open ground and your worm dives into the
  soil. The camera swings round so you see a slice of the forest floor from the side.
- **The layers of the forest floor:** this fall's bright leaves on top, then dark old leaves with
  white fungus threads, black crumbly humus, topsoil, and pale and rusty subsoil underneath.
  Their names are at both ends of the slice.
- **Dig anywhere.** Point the way with the arrow keys, W A S D or the joystick. Your own tunnel is
  fast; new soil is slower; topsoil and subsoil are slowest. Stones and big roots block you.
- Your worm leaves **castings** (worm poop) in its tunnel, and the walls go dark where it eats
  through old leaves.
- Look for a **snail shell, a beetle, a spider, a puffball and moss** in the slice.
- **Two views underground:** Wide shows the whole forest floor; Close follows your worm. Press
  Space to switch (we'll ask which you like).
- **Come back up:** near the top of the leaves, press Space. You leave a burrow opening with a
  little pile of castings and leaf bits, like a real nightcrawler.
- If your computer is set to reduce motion, going down and up fades instead of swinging.
```

and add a "### Fixed" list if Plan A has none (else add to it):

```markdown
- A very quick tap of Space no longer gets missed on a slow computer.
```

- [ ] **Step 2: The spec's as-built record**

Append to `docs/superpowers/specs/2026-10-04-v2-underground-design.md` a new section, filled in from this plan's decisions table and Task 20's output (the table's numbers are the gate run's medians and draws; write the real ones):

```markdown
## 14. Underground as built (Plan B, 2026-10-xx)

Plan: `docs/superpowers/plans/2026-10-06-v2-underground-part-b.md`. All unit, e2e and
`verify:build` checks pass.

**What was built.** Spec sections 4–7, 10 (underground), 12 and 13, in `src/underground/`:
- the slab (16 × 12 u, clipped to the world; the face drawn 6 u beyond each end), its layers
  (L from the surface litter; F 4–5 cm, H 1–2 cm, A 3–5 cm, E 2–4 cm, B the rest; irregular,
  seeded per spot), the 0.1 u soil grid, stones, big roots and cut-through rocks and log;
- digging by pointing (turn 2.6 rad/s), speeds by soil, tunnels, castings every 4.5 u, mixing
  around eaten F and H, collide-and-slide on stones and roots;
- the mode machine and one Action button: Dig down / Come up / Close view / Wide view;
- the moves: sink 1.0 s then a 1.5 s camera swing (or a 0.7 s dip with reduced motion); rise and
  crawl out 2.1 s with the swing back; burrow openings with middens, 8 per session;
- the camera: Wide (8.5 u tall, surface into B, follows gently) and Close (6 u shorter side,
  room ahead), eased, frame-to-frame tested; the near plane just in front of the cut;
- the cut face (one strip mesh, one shader, baked pattern tiles, a 160 × 120 soil texture
  uploaded by changed rows), stones, roots, life hints and moss (one mesh on the prop material),
  DOM layer names with ticks;
- the speed test's dig run (`?dig=1`, "Where: Underground") and the gates' underground run.

**Decisions made while building** (the plan's table has the reasons):
- The forest in front of the cut is removed by the camera's near plane, not by shader clipping.
- Close frames about 1.7 worm lengths, not 4–5 (that would be as wide as Wide).
- Reduced motion dips through dark soil (a true cross-fade needs a render target).
- The layer patterns are baked once into tiles: computing them per pixel halved the frame rate
  in software GL.
- E's thickness (2–4 cm) is a planning choice: the research notes give no number.
- The hint card shows for the first 12 s of the session's first visit only.
- A quick key tap lasts until a step sees it (`KeyboardInput.settle()`).

**Performance** (`node scripts/perf-gates.mjs 4`, date and commit):

| Preset | Gate | Surface median | Underground median | Draws (surface / underground) |
|---|---|---|---|---|
| Low | 1.089 | | | |
| Medium | 0.871 | | | |
| High | 0.741 | | | |
| Ultra | 0.610 | | | |

Cuts made: none (or list them from Task 20).

**Known limits** (for Matt and the students; screenshots in `docs/codev/versions/v02-underground/`):
- The slab is one fixed slice; digging down elsewhere starts a fresh one (tunnels are not saved).
- Life in the cut is static hints only (the vote decides what comes alive in V3).
- Steering into the top keeps the worm inside the leaves; Space comes up.

**Deferred:** the Should items (spec 8.1) go to Plan C; touch Action presses should latch like
keys (see Plan A's `ActionPrompt`).
```

Replace `2026-10-xx` with the day it is written, fill the table from `.cache/gates-v2.txt`, and fix the "Cuts made" line.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md docs/superpowers/specs/2026-10-04-v2-underground-design.md
git commit -m "docs(v2): changelog lines and the underground's as-built record" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 23: Draft V2's version doc

**Files:**
- Create: `docs/codev/versions/v02-underground.md`

Spec 13 and CLAUDE.md "Each version's materials": topic facts with sources (from `docs/codev/research/mn-forest-floor.md`), the "notice…" prompt, what's new, the section 9 ballot, the camera question, the V4 topic vote (from `docs/codev/topics.md`, checked so every option is something we will build), the paste-ready form, slides with the Task 21 screenshots, and the Canvas post. Privacy: no names, no school name, no student quotes. Science honesty: every fact has a source and is marked "Re-check before class"; game exaggerations are labelled game choices; the forest "changes", it is never "destroyed".

- [ ] **Step 1: Write it**

Create `docs/codev/versions/v02-underground.md`:

```markdown
# V2 · Underground

- **Live:** 2026-10-12 (Mon), the day Matt posts it in Canvas. **Form closes:** 2026-10-15 (Thu night).
- **Build:** https://wormsimulator.com/v2/ (release commit: fill in at release)
- **Topic chosen by:** Matt (Matt picks V1's, V2's and V3's topics)

## Topic
Before earthworms came, Minnesota's hardwood forests had a thick, spongy forest floor in layers,
from this fall's leaves down to black humus, full of fungi, roots and small animals. Earthworms
are newcomers that eat it away.

| Fact shown to students | Source | Status |
|---|---|---|
| A forest floor with no worms has layers in every stage of rotting: fresh leaves, old broken leaves, and black humus. | Minnesota DNR, *Humus Types* | Re-check before class |
| The old-leaf layer is full of fungus threads (mycelia) and mats of fine roots. | Minnesota DNR, *Humus Types* | Re-check before class |
| In rich maple and basswood forests the forest floor can be up to 10 cm (4 to 5 inches) thick. | Great Lakes Worm Watch, *About the Forest* | Re-check before class |
| It builds up because fungi and bacteria break leaves down more slowly than new leaves fall. | Great Lakes Worm Watch, *About the Forest* | Re-check before class |
| It works like a mulch: it holds moisture for the forest. | Great Lakes Worm Watch, *About the Forest* | Re-check before class |
| Very few tree roots go below the forest floor. | Great Lakes Worm Watch, *About the Forest* | Re-check before class |
| Where earthworms move in, the forest floor can disappear, and worm castings show up on the soil. | Minnesota DNR, *Humus Types*; Hale et al. 2005 | Re-check before class |
| Our worm is a nightcrawler: a deep burrower that digs straight up-and-down burrows as deep as 2 meters. | Great Lakes Worm Watch, *Earthworm Ecological Groups* | Re-check before class |
| Nightcrawlers pull fresh leaves down into their burrows and leave piles of castings and leaf bits (middens) at the opening. | Great Lakes Worm Watch, *Earthworm Ecological Groups* | Re-check before class |
| Blue-spotted salamanders breathe through moist skin and eat forest-floor insects. | Great Lakes Worm Watch, *Vertebrate Animals* | Re-check before class |
| Shrews and red-backed voles do best where the forest floor is thick. | Great Lakes Worm Watch, *Vertebrate Animals* | Re-check before class |
| Native snails, spiders and beetles can decline a lot after worms invade. | Great Lakes Worm Watch, *Macroinvertebrate Animals* | Re-check before class |

**Game choices (describe the game, not facts).** In the game the worm can dig any way it likes;
real nightcrawlers dig one deep up-and-down burrow (the game says so in its hint card, as a
"Game choice"). The slice is about 70 cm wide and 50 cm deep. The pale grey band under the topsoil
(2 to 4 cm in the game) is typical of many northern soils but has no number in our sources.
The snail, beetle, spider and puffball in the slice are hints for the vote, not animals that move.

**While you play, notice…** Dig down and look at the slice from the side. How many different
layers can you find? What lives in each one? Which layer was easiest to dig through?

## What's new in this build
This matches the "V2 · Underground" entry in `CHANGELOG.md`.
- You said, we did: from V1's answers (fill in from V1's Results when they are in).
- The game is real size only. World scale is gone (V1 keeps it at `/v1/`).
- The forest floor's leaf layer is deeper; your worm crawls inside it.
- **Dig down:** press Space or the Action button on open ground. The camera swings to the side
  and you see a slice of the forest floor: Leaf litter, Old leaves, Humus, Topsoil, Subsoil.
- Dig anywhere by pointing the way. Your own tunnel is fast; topsoil and subsoil are slow; stones
  and big roots block you. Your worm leaves castings in its tunnel.
- **Come up:** near the top of the leaves, press Space. A burrow opening with a little midden
  stays on the forest floor.
- **Wide and Close views underground:** press Space to switch. Wide is the default.
- How to try it: Start → **Crawl** → find open ground → **Space** (or the Action button).

## Ballot
### Design vote (Q5): Which native forest-floor life should we add next?
| Option (as students read it) | What we'd build (V3) | In the build as a toggle? |
|---|---|---|
| Blue-spotted salamander | A salamander that comes out in damp spots and hides when it's dry, tied to V3's Moisture | No (a hint in the slice only) |
| Fungi at work | White fungus threads that grow, and mushrooms and puffballs that come up after damp spells | No (hyphae and a puffball show now) |
| Small hunters and helpers (snails, spiders, beetles) | A few small animals moving in the litter and on logs | No (static hints in the slice) |
| Shrews and red-backed voles | A shrew or vole moving through the litter | No |
| Other (write in) | Grouped into themes for V3's form | |

Every option is sourced (Great Lakes Worm Watch, *Vertebrate Animals* and *Macroinvertebrate
Animals*; Minnesota DNR, *Humus Types*). Leave out ovenbirds (they nest in spring, not fall).
Springtails and mites need a source before they can be an option.

### Camera question (Q5c)
"Underground, which view did you like better?" Wide (see the whole slice) / Close (follow your
worm) / I liked both. Both ship; a clear winner becomes the default in V3 (the setting is saved
only when a player switches, so the new default reaches everyone who never switched).

### Next topic (Q7, picks V4)
From `docs/codev/topics.md` and the roadmap's V4–V7 pool, checked against "every option is
something we will build":
| Option (as students read it) | Game part | Prerequisites | Sources | Ready? |
|---|---|---|---|---|
| Skin that senses light | Light in a new Worm View; the worm avoids the sun | Breathing through skin (V3) | Hess | Yes |
| Growing up: the clitellum and cocoons | The clitellum appears at full size; leave cocoons with Action | First bite (V3) | UMN Extension | Yes |
| The mole | A mole's digging warns you underground; flee upward | Underground (V2) | ScienceDaily (worm grunting); **mole diet and range in Minnesota needs a source** | Only once Matt finds that source; otherwise use a two-option vote |

### Ideas from last version (Q8)
V1's form had the first idea box. When V1's Results are in, group its write-ins into themes and
list the top 3 or 4 vetted themes here as Q8's options. If they are not in by Friday, leave Q8
out of V2's form (as V1 did).

## Paste-ready form
**Title:** Worm Simulator V2 · Underground: Feedback

**Description:** Thanks for helping design Worm Simulator! This takes about 10 minutes. Your
answers decide what we build next.

Settings: make Q1 required and the rest optional, so a student who couldn't play can still
submit. Don't collect emails unless Canvas credit needs them (that column stays in `codev-raw/`).

**Q1. Were you able to play V2?** (Multiple choice, required)
- Yes
- It wouldn't load
- I didn't have time

**Q2. About how long did you play?** (Multiple choice)
- Under 5 minutes
- 5 to 15 minutes
- 15 to 30 minutes
- More than 30 minutes

**Q3. Why is the forest floor thick in a forest with no earthworms?** (Multiple choice, one correct)
- Trees drop extra leaves when there are no worms
- Leaves rot more slowly than new leaves fall ← correct
- Wind blows leaves in from other forests
- Snow presses the leaves down

**Q4. How well did the game show the layers of the forest floor?** (Linear scale 1 to 4)
- 1 = Not well at all
- 4 = Really well

**Q5. Which native forest-floor life should we add next?** (Multiple choice)
- Blue-spotted salamander
- Fungi at work (fungus threads, mushrooms, puffballs)
- Small hunters and helpers (snails, spiders, beetles)
- Shrews and red-backed voles
- Other: ____

**Q5c. Underground, which view did you like better?** (Multiple choice)
- Wide (see the whole slice)
- Close (follow my worm)
- I liked both

**Q6. Why did you choose your answer to Q5?** (Short answer)
Help text: Try this starter: "In the slice I noticed ___, and in a real forest ___."

**Q7. Which topic should Worm Simulator teach in V4?** (Multiple choice; use the options from
"Next topic" above that are ready)
- Skin that senses light
- Growing up: the clitellum and cocoons
- The mole (only if its source is found)

**Q8. Which idea from last week should we build?** (Multiple choice; only if V1's themes are in)

**Q9. Was anything confusing or broken?** (Checkboxes, pick all that fit)
- I couldn't find where to dig down
- I couldn't come back up
- The camera was hard to follow
- It was slow or choppy
- My worm got stuck
- Nothing was confusing or broken
- Other: ____

**Q10a. How fun was this version?** (Linear scale 1 to 5)
- 1 = Not fun
- 5 = Super fun

**Q10b. Your idea (optional):** What should we add or change in the game? (Paragraph)

## Slides draft
Deck title: **Worm Simulator V2 · Underground**

1. **You said, we did**
   - Text: built from V1's Results and the "V2 · Underground" changelog entry (real size for
     everyone; World scale is gone; the leaves are deeper).
   - Image idea: `v01-true-size/true.jpg` beside `v02-underground/opening.jpg`.
   - Alt text: "Last week's forest floor beside this week's, with a burrow opening on the leaves."

2. **A forest floor before worms**
   - Text: "For thousands of years Minnesota's forests had no earthworms. Leaves piled up faster
     than they rotted, so the forest floor grew thick and spongy, up to 10 cm deep. It works like
     a mulch and holds moisture for the forest."
   - Image idea: `v02-underground/wide.jpg`.
   - Alt text: "A side view of the forest floor in the game: bright leaves on top, dark layers
     below, pale and rusty soil at the bottom, and a worm in a tunnel."
   - Source footer: "Sources: Great Lakes Worm Watch, About the Forest; Minnesota DNR, Humus Types."

3. **The layers**
   - Text: "Leaf litter: this fall's leaves. Old leaves: last years' leaves, dark and broken, full
     of white fungus threads and fine roots. Humus: black and crumbly. Topsoil, then subsoil,
     with stones and big roots."
   - Image idea: `v02-underground/close.jpg` with the game's layer names visible.
   - Alt text: "A close view of the layers, each labelled at the edge: Leaf litter, Old leaves,
     Humus, Topsoil, Subsoil. Each layer has its own pattern."
   - Source footer: "Source: Minnesota DNR, Humus Types."

4. **Who lives there?**
   - Text: "Fungi, roots, mosses, snails, spiders, beetles, salamanders, shrews and voles all use
     the thick forest floor. When worms move in, many of them have a harder time."
   - Image idea: `v02-underground/stones-roots.jpg` (roots, stones, and the snail, beetle,
     spider and puffball hints).
   - Alt text: "The game's slice with a big root, stones, a snail shell, a beetle, a spider and a
     puffball."
   - Source footer: "Sources: Great Lakes Worm Watch, Vertebrate Animals and Macroinvertebrate
     Animals."

5. **Our worm: the nightcrawler**
   - Text: "Our worm is a nightcrawler, the classic fishing worm. It digs one deep up-and-down
     burrow, as deep as 2 meters, and pulls leaves down into it. At the top it leaves a little
     pile of castings and leaf bits. Game choice: in the game you can dig any way you like."
   - Image idea: `v02-underground/tunnels.jpg`.
   - Alt text: "A worm's tunnel in the game, with dark castings left behind in it."
   - Source footer: "Source: Great Lakes Worm Watch, Earthworm Ecological Groups."

6. **While you play, notice…**
   - Text: "Dig down and look at the slice from the side. How many layers can you find? What
     lives in each one? Which layer was easiest to dig through?"

7. **How to play V2**
   - Text: "Crawl to open ground. Press Space (or the Action button) to dig down. Point the way
     with the arrow keys, W A S D or the joystick. Space switches Wide and Close. Near the top,
     Space brings you back up."
   - Image idea: `v02-underground/phone.jpg`.
   - Alt text: "The game on a phone-sized screen, showing the slice and the Action button."

8. **Fill out the form**
   - Text: "Vote for the forest-floor life we add next, and for V4's topic. About 10 minutes."

## Canvas announcement
**Worm Simulator V2 · Underground is here!** This week we learn about the forest floor before
worms: its layers and who lives in them. Look through the slides first, then play V2 at home:
https://wormsimulator.com/v2/ . Dig down into the forest floor, explore the layers, and come back
up. Then fill out the form (about 10 minutes) by Thursday night: your votes decide which
forest-floor life we add next, and what V4 teaches. (Slides and form links are in this module.)

---

## Results (filled in after the form closes)
- **Turnout:**
- **Fact check (Q3):**
- **How well the game showed the topic (Q4):**
- **Design vote (Q5):**
- **Camera (Q5c):**
- **Next topic (Q7):**
- **Ideas from last version (Q8):**
- **Write-in themes (new):**
- **Bugs and confusion (Q9):**
- **Fun (Q10a):**

## Decisions
- Ships in V3:
- Topic for V4:
- Runoffs, vetoes and reasons:
```

Two lines depend on things this plan cannot know: "You said, we did" (from V1's Results, if Matt has tallied them) and Q8 (V1's write-in themes). Fill them from V1's Results if they are in; otherwise leave the wording above, which tells Matt what to do.

- [ ] **Step 2: Check it**

```bash
grep -n -i "destroy\|dying" docs/codev/versions/v02-underground.md; echo "framing check exit $? (1 = none found)"
grep -c "Re-check before class" docs/codev/versions/v02-underground.md
```

Expected: no "destroy"/"dying" (exit 1); 12 facts marked "Re-check before class". Read it once as a 6th grader would: short sentences, plain words.

- [ ] **Step 3: Commit**

```bash
git add docs/codev/versions/v02-underground.md
git commit -m "docs(v2): draft V2 · Underground's version doc: facts, ballot, form, slides, Canvas post" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review (against the spec and the contract)

**Spec coverage.**
- 4.1 Digging down: allowed only on open ground off footprints and the play edge (T4); one press, no holding (T6, T15); head turns down and the front sinks about 1 s (T7); the cut along the heading, fixed for the visit, 16 × 12 u clipped to the world (T1); the camera swings about 1.5 s with easing, no snap (T8, T17); the forest above and behind, hazed (T17); reduced motion fades (T6, T17, e2e T18).
- 4.2 Coming up: "Come up" near the top only, steering into the top never pops out (T5, T15); out at that point along the cut, facing along it (T7, T15); a burrow opening with a midden that stays for the session (T14, T15).
- 4.3 One slab at a time, fresh only on a new dig, nothing saved, up to 8 openings (T15, T14).
- 5.1 Layers and ranges, irregular boundaries, per-slab variation (T1); 5.2 hyphae, fine roots (drawn), big roots and stones (block, slide), rocks and log in section with moss and damp below, moss with red-stalked capsules, snail, beetle, spider, puffball hints (T3, T11, T12); 5.3 darker with depth, darker tunnels, pattern not only colour, layer names at the two ends with ticks, DOM, 18 px, from `TEXT` (T11, T16).
- 6 Same body in the plane, faster peristalsis while eating, pointing with a limited turn, speeds by soil, tunnels, castings, mixing, no meter, nightcrawler midden, the bottom darkens away, the Game choice label (T5, T11, T14, T16).
- 7 Wide default (contract §5) and Close, switched by Action, eased, saved only when switched; both keep the worm on screen, never shake, tested frame to frame at 360 × 640 and 1366 × 768 over a seed sweep (T8, T9, T15).
- 10 `src/underground/`, the typed-array grid with dirty-row uploads, one shader on simple geometry, one mesh for stones/roots/hints, compiled at load with zero compiles on enter and leave (e2e), the state machine, Commands only, ≤ 40 draws, no extra passes or targets, the surface's expensive updates stopped while underground, no per-frame allocation, the gates' underground run (T2, T11, T12, T15, T17, T18, T19, T20).
- 12 Every listed unit, motion and e2e test (T1–T19); screenshots (T21). The content check is Plan A's.
- 13 CHANGELOG lines, the version doc (T22, T23). The version label is Plan A's.
- **Not in this plan:** spec 8.1 (Should) and the surface litter (8.2) are Plan A's and Plan C's.

**Contract.** Plan A is used only through `TEXT`/`shown`, `ActionKind`/`ActionPrompt`/`createActionPrompt`'s instance (`set`, `touchHeld`), `createPressEdge`, `floorHeight`/`litterTopHeight`, `UNITS_PER_CM`, `footprints`/`obstacleDepth`/`LOG_FOOT`, `WORLD_HALF`/`PLAY_HALF` and `updateSettings`. Nothing imports `worldScale.ts`, `scaleSpec()` or `setScale()` (the verified code imported none of them in `src/underground/`). `undergroundView` follows contract §5. `ActionPrompt.set()` is called once per frame (T17); Plan A's set is a no-op when the kind is unchanged.

**Placeholder scan.** Every code step shows the full code (inserted from the verified files). Data-dependent fills are the gate numbers (T22, from T20's output), the release commit and V1's Results (T23); each says where the value comes from.

**Type consistency.** `UndergroundView` and `DEFAULT_UNDERGROUND_VIEW` live in `modeMachine.ts` and are used by `settingsStore.ts`, `cutCamera.ts`, `burrowGame.ts` and `burrowing.ts`. `Slab` boundaries are `B_TOP … B_B` everywhere; the grid's `SOLID_*` and `AIR` are used by `solids.ts` and `burrowMotion.ts`; `CutFrame`/`CutPose` match between `cutCamera.ts`, `burrowGame.ts` and `cutScene.ts`; `World.syncWorm(pose, focus, camera)` matches its one caller.

**Files Plan A changes that this plan touches:** `src/save/settingsStore.ts` and its test (T9), `src/game/crawl.ts` (T5, T13), `src/game/world.ts` (T17), `src/main.ts` (T10, T17, T19), `src/perf/speedTest.ts`, `src/perf/speedTestRunner.ts`, `tests/unit/params.test.ts`, `scripts/perf-gates.mjs` (T19), `CHANGELOG.md` (T22). Each step says what it does by intent and warns to re-read the file first.
