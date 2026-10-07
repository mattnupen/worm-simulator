# V2 · Underground, Part A (foundations and surface): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay V2's foundations and its new surface: the "V2 · Underground" label, World scale removed (real size only), the content system for every student-facing line, the Action prompt with a touch Action button, and a realistic 2 to 5 cm leaf layer that the worm travels buried inside, with the leaves above it fading so it stays visible.

**Architecture:** The drawn ground becomes the *top* of the loose leaves (`litterTopHeight`); the worm rests on the *floor* under them (`floorHeight`, the soil's smooth shape). Everything the camera sees from above stays opaque and cheap; round the worm a screen-space "funnel" (the V1 leaf fade, extended by height) drops the top of the litter, and through that hole the player sees the worm's pocket: the leaves round it (a second, spine-gated detail layer and the hero leaves, both on the floor, older and darker) and a small patch of the dark F floor under them. World scale is gone: `src/surface/realScale.ts` holds V1's True numbers as the only world.

**Tech Stack:** Vite 8, TypeScript 7 (strict), three 0.186 (WebGL 2), vite-plugin-singlefile, Vitest 5 (unit), Playwright (e2e, SwiftShader), Node 24 scripts.

**Spec:** `docs/superpowers/specs/2026-10-04-v2-underground-design.md` (sections 2, 2b, 8.2, 10, 11; answers 11.8 and 11.9). **Contract:** `docs/superpowers/plans/2026-10-06-v2-contract.md`, "What Plan A provides". Plan B (`2026-10-06-v2-underground-part-b.md`) runs after this plan and relies on those names.

---

## Read this first: issues for the lead

1. **Performance is the open risk (rough signal only).** Rough single benches on a busy Mac (load 8 to 50, another agent running; SwiftShader), the speed test's uncapped fps against the Task 5 build: Low about the same; High about 0.67x; Ultra 0.56x to 0.75x (median about 0.65x). V1 passed High at 0.92 (gate 0.74) and Ultra at 0.755 (gate 0.61), so **High and Ultra may fail the gates** unless the machine noise explains part of it. Task 10 runs the gates on a quiet machine and, if a preset fails, applies a measured cut ladder (spelled out there). Draw calls while crawling, counted per frame: Low 19 → 20, High 24 → 26, Ultra 25 → 27 (+1 floor patch on every preset, +1 pocket leaves where detail leaves draw). With Plan B's underground at 36 on Ultra, that is at most 38 of the 40.
2. **The version name breaks a CLAUDE.md rule.** The contract and the approved spec say `{ number: 2, name: 'Underground' }`; CLAUDE.md asks for 2 to 4 words. Task 1 relaxes `tests/unit/version.test.ts` to 1 to 4 words, with a comment. Tell Matt, or rename (for example "Down Under the Leaves") before release.
3. **Additions beyond the contract's names (none renamed or removed):**
   - `ActionPrompt.endStep()` (the lead's request): `touchHeld` reads true from any press until the next `endStep()`, which `main.ts` calls after every step, so a tap shorter than a step (or than a slow frame) is never lost. `KeyboardInput.endStep()` does the same for keys. Plan B reads `Commands.action` from `commands()` in `main.ts` (Task 5) and needs no change for this.
   - `?prompt=<kind>` (`src/game/params.ts`): a test and screenshot hook. It shows the prompt while crawling and counts Action presses on `#app` as `data-action-presses`. Nothing else calls `set()` with a kind.
   - The speed test report loses its "World scale:" line, and `scripts/perf-gates.mjs` no longer reads it. Plan B's underground run should not expect it.
   - `World` gains `pocket: DetailLayer`; `LeafLitter.update()` takes 3 arguments (no disturbed box: the top leaves never move now); `disturbedBox()` is deleted; `World.switchForest` and its parts are deleted (nothing switched but World scale).
   - The baked litter texture's G channel is now "the thinnest litter within 1.5 m" (it was the depth, which moved to R).
4. **CLAUDE.md is stale after this plan:** it names `src/surface/worldScale.ts`, `World.switchForest` and "perf gates (True and Classic)". This plan updates `docs/superpowers/visual-quality-brief.md` only; the lead should update CLAUDE.md (no agent may change it on its own).
5. **The pocket's leaves jitter a little more than V1's big litter did** (measured 1.6% of frames turning back by more than half a pixel, p99 1.03 px; V1's detail leaves round the body measured 1.3% and 0.75 px; V1 held its litter to 1.2% and 0.5 px). They are only seen through the hole, mostly behind the worm's 40 to 60% dither. Task 8's test pins today's numbers; a follow-up could steady their tilt.

## Before you start

- **Branch:** work on `v2-underground`. The untracked `.claude/` folder is not part of this work: always `git add` the exact files listed, never `git add -A`. Another agent may be reading the main worktree; do not switch branches there.
- **Commands** (from the repo root):
  - unit tests: `npx vitest run` (one file: `npx vitest run tests/unit/<name>.test.ts`; one test: add `-t "<part of its name>"`)
  - types: `npx tsc --noEmit`
  - build and single-file check: `npm run verify:build`
  - browser tests: `npm run test:e2e` (builds first; one file: `npm run build && npx playwright test tests/e2e/<name>.spec.ts`)
- **Before Task 1** `npx vitest run` reports **69 files, 772 tests passed**, and `npm run test:e2e` **34 passed, 1 skipped** (the stand-in v1 copy test skips because `releases/v1` exists). Each task states the totals it was verified with. **Compare by difference, not absolute numbers:** if fixes land between tasks, your totals shift; the change each task makes is what must match.
- **Every commit message ends with** a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (the commit commands below include it).
- **Conventions:** named exports only; unit tests import from `'../../src/...'`; no allocation in per-step or per-frame code you add (preallocated objects and typed arrays); no shader recompiles on a preset change (checked in e2e, Task 2); GLSL with a TS twin stays in step (`tests/e2e/glslParity.spec.ts`); files under about 260 lines; `src/main.ts`, `src/game/crawl.ts` and `src/surface/obstacles.ts` must not grow (they end this plan at 376, 338 and 372 lines, from 415, 342 and 374).
- **The verified code** is in the planner's scratch worktree `.cache/plan-a` (detached HEAD, one commit per task: `dc810b6` T1, `846fb35` T2, `c81434e` T3, `6521e3d` T4, `a53570f` T5, `9951869` T6, `4bf22b9` T7, `0fa1d82` T8, `738458b` T9). If a step does not apply, `git -C .cache/plan-a show <commit>:<file>` prints the file as it should be after that task. None of these commits is on any branch.
- **How edits are written.** "Replace: ... with: ..." blocks are exact: the text to replace occurs once in the file as it stands at that step, so a search-and-replace finds it. Apply them in order. A file to "Replace the whole of" is given in full. Every code block in this plan was applied in this order in a scratch worktree and checked file by file against the verified commit.
- **Tests under load.** On a busy machine the heavy unit tests (hero leaf clearance, the jitter and motion tests) can hit their 120 s timeouts, and the timing-based e2e tests (Action presses) can flake. Rerun before suspecting the code.
- **Rendering tasks** are marked **(rendering)**. Reviewers of those tasks read `docs/superpowers/visual-quality-brief.md` first and look at the screenshots the task asks for, next to Matt's photos `reference images/IMG_2407.png` (the top of the litter) and `IMG_2427.png`, `IMG_2428.png` (the dark, wet layer under it).
- **Units:** the worm is 3.5 units long and stands for a 15 cm earthworm, so 1 cm ≈ 0.23 units. The world stays 40 × 40 units.
- **Scratch screenshots.** Rendering tasks ask for screenshots with a throwaway script (not committed: `.cache/` is git-ignored). Create it once:

```bash
mkdir -p .cache/shots && cat > .cache/shot2.mjs <<'SHOT'
// node .cache/shot2.mjs <out.png> <query> [steps...]   steps: keys:ArrowUp+ArrowLeft:ms | wait:ms
// Clicks Crawl, lets the first frames compile, runs the steps, hides the hint card, screenshots.
import { chromium } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [out, query = '', ...steps] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(pathToFileURL(path.resolve('dist/index.html')).href + query);
await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'Crawl', exact: true }).click();
// Let the first crawling frames compile their shaders (seconds in software WebGL).
await page.keyboard.down('ArrowUp'); await page.waitForTimeout(300); await page.keyboard.up('ArrowUp');
await page.waitForTimeout(4000);
for (const s of steps) {
  const [k, v, ms] = s.split(':');
  if (k === 'keys') { const ks = v.split('+'); for (const x of ks) await page.keyboard.down(x); await page.waitForTimeout(Number(ms)); for (const x of ks) await page.keyboard.up(x); }
  else if (k === 'wait') await page.waitForTimeout(Number(v));
}
await page.evaluate(() => { const p = document.querySelector('.panel'); if (p) p.style.display = 'none'; });
await page.waitForTimeout(200);
await page.screenshot({ path: out });
console.log('errors:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
SHOT
```

  Software WebGL runs at a few frames a second on a busy machine, and the worm only moves on the frames it gets: hold the keys long (the commands below hold 6 to 9 s). Then open the PNG and look at it.


## Decisions made while planning (verified in a scratch build)

Every code block in this plan was built and tested in a scratch worktree in this task order; each task's commit left `npx tsc --noEmit`, `npx vitest run`, `npm run verify:build` and `npm run test:e2e` green (counts per task below). These choices fill gaps in the spec or the contract; Plan B's closing task records them in the spec's as-built section.

| Topic | Decision | Why |
|---|---|---|
| World scale table | **Deleted.** `src/surface/realScale.ts` exports `UNITS_PER_CM`, `REAL_LEAF_CM` and one constant `REAL_SCALE` (V1's True entry, same field names); every reader imports it. Functions lose their `spec` parameters; caches lose their spec keys | Nothing can branch on a mode that does not exist. The same field names keep the diff mechanical. A probe of trees, rocks, log, clutter, footprints, litter depth, the height grid and every prop, tree, litter, detail and hero geometry hashed identical before and after (Task 3) |
| `World.switchForest` | **Deleted** with `rebuildForest`, `compileForest`, `disposeForest`, `refreshLitterTexture`, `refreshGroundTexture` and `Crawl.applyScale` | Only World scale switched forests. Plan B builds its underground group once at load |
| Old saves | `Settings` loses `scale`; a stored `scale` is kept on every write and ignored on read; V2 never writes one | V1 at `/v1/` shares the key and still reads it (CLAUDE.md: never repurpose a key) |
| Retired tests | Classic hashes (`propPlacement`, `scaledProps`), the Classic and Hybrid camera presses, the World scale screen, picker and rebuild tests, Hybrid's play-edge notch. Replaced by real-size guards: the layout keeps the worm's paths clear, the spawn's run, the log meeting both play edges, a camera pull-in that starts gently past both trunks, the bark laid out at base size, the distant ring's count | They protected Classic, which no longer exists. The camera and layout behaviour they tested still has real-size tests |
| No shader compiles | An e2e test (Task 2) counts `compileShader` calls: after Ultra has shown every layer, changing presets compiles nothing | The old World scale e2e test was the only compile counter |
| Content | `src/content/sources.ts` (9 sources from the research notes, checked 2026-10-04) and `text.ts` with exactly the contract's keys and words, plus `crawlHint` (the V1 hint moved in). `lineProblems()` is the run-time guard; the `Line` type rejects an unsourced or unverified fact at compile time (`@ts-expect-error` tests) | Science honesty (CLAUDE.md) |
| Action prompt | One real `<button>` (class `btn btn-primary action-prompt`) with an icon per kind, the word as plain text in its own span, and an `aria-hidden` "Space" `<kbd>` chip. Always the big bottom-right button (64 px+; touch gets 84 px and no chip); `tabindex=-1`, so Space never "clicks" it; hidden off the crawl screen; no pulse at all. On narrow screens the word goes under the icon, clear of the joystick | Contract section 2. A mouse press works too, which costs nothing |
| Quick presses | `KeyboardInput` and the prompt both latch a press until the step after it (`endStep()`) | A tap or key press shorter than a step, or than a slow frame (several steps run together), was lost: one press of Action must always count (parent spec 7: no timing-critical input) |
| Litter depth | 0.45 to 1.2 units (2 to 5.2 cm): open ground 0.55 ± 0.05, hollows +0.18, rises −0.06, V1's drift and pile shapes deepened 2.6x; against a rock the litter is capped at max(0.45, half of 0.36 × the rock's size), so at least half of every drawn rock shows | The research notes and spec 8.2. Rocks: "litter banks against them, it does not bury them" |
| Heights | `floorHeight = terrainHeight` (smooth). The terrain mesh draws the top: its vertex heights are floor + depth; `litterTopHeight` samples that grid exactly as drawn (within 0.17 of floor + depth where a cell cuts a drift). The grid code moved to `src/surface/meshGrid.ts` so `litterDepth.ts` can export `litterTopHeight` without an import cycle | Contract section 3. Plan B's cut takes its L band as `litterTopHeight − floorHeight` |
| The worm | Rests on the floor (belly 1 cm over it) on every preset, Low included; `under` is always 1 | Spec answer 11.9. The floor is smooth, so the worm's height is smoother than V1's on the drawn grid (measured: frame-to-frame height jerk 0.003 against V1's 0.009 to 0.030) |
| Camera | Follows a point 0.1 above the top of the litter over the head (`CAM_OVER_TOP`), aims as V1 at the buried head plus 0.6; keeps 0.5 over the drawn top | It frames the pocket from about where V1 framed a worm at the top of the leaves, looking down into the hole. Measured as smooth as V1 over six seeded courses (Task 9) |
| The look | See "Design" below: an opaque top, a funnel hole, a pocket with leaves and a floor patch | Cheapest convincing option; alternatives below |
| Draw order | `src/render/drawOrder.ts`: top leaves (3) → top of the litter, the terrain (5) → the pocket: worm, hero and pocket leaves (6) → floor patch (7) | The depth test skips the pocket's pixels everywhere but the hole |

## Design: the worm buried in deep litter (spec 8.2, answer 11.9)

Real litter is 10 to 20 loose leaves deep with air between them. Drawing that literally would multiply the leaf count (and fill, the main cost) many times, and from the camera only the top layer would ever show. So the plan draws what the camera can see, in four parts:

```
 camera
    \        top leaves (this fall's: bright)          top leaves
     \   ___________________________ .  .  . ___________________________
      \ |  the top of the litter     | hole  |  (the terrain mesh,      |  <- litterTopHeight
       \|  (opaque, painted)         |funnel |   drawn after the leaves) |
         pocket leaves (older, darker)\     / pocket leaves
         hero leaves  ~~~~~~~~~~~~~~~~ (worm) ~~~~~~~~~~~~~~~~ hero leaves
        ____________ F floor patch (dark, wet, matted; fungal threads, moss) ____  <- floorHeight
```

1. **The top of the litter** is the terrain mesh, now at floor + depth, with V1's painted colours; this fall's leaves (the chunked litter and the top detail leaves) lie on it as in V1. They lie 2 cm or more over the worm, so the disturbance map no longer moves them: the litter's reacting variant and the top detail leaves lose `DISTURB` (cheaper), keeping only the fade.
2. **The hole** is V1's dithered fade (`occlusion.ts`), now also on the terrain's own material, with one change: the higher above the body's axis a pixel lies (world up, `uOccUp`), the wider its hole (`OCC_FUNNEL` 0.25 per metre, up to 1.2) and, past 0.15 to 0.3 above the axis, the more completely it drops (`OCC_DEEP_FROM`, `OCC_DEEP_TO`). The top of the litter opens wide and clean over the worm; leaves near the body keep V1's shares (40% kept for a leaf clear of it, 60% for one lying on it), so the worm still reads as in the leaves.
3. **The pocket** is what the hole shows round the worm, all on the floor and all drawn after the top, so the depth test rejects it elsewhere:
   - the **hero leaves**, unchanged V1 physics with the floor as their surface (the head shoves and flips them, they ride over the body: V1's clearance tests hold as they are), tinted older;
   - a second **detail layer** (`pocket`, `POCKET_SHARE` = half the preset's detail leaves) placed by `DETAIL_GLSL` with `POCKET` defined: on the floor, resting from 1 cm up to below the thinnest litter within 1.5 m, less its own curl (so none ever shows through the top), most of them low; only within 1.6 to 2.0 of the spine (the rest would be shaded under the top for nothing); draped and slid by the disturbance map exactly as V1's detail leaves were; darker, duller and wetter the lower they lie;
   - a **floor patch** (`floorPatch.ts`, `floorMaterial.ts`): a 7 × 7 grid under the middle of the body, laid on `terrainHeight`, painted as the F layer (near-black and dark brown matted plates with darker seams, thin pale fungal threads, sprigs of moss, a wet sheen, 60% of the light), darker along the worm's fresh trail (the disturbance map's trail, V1's `trailShade`).
4. **Props** stand on the floor as before. Their bases are now hidden by the top of the litter, which banks against rocks, trunks and the log; a rock always shows at least half its height.

**Alternatives considered:**
- *Stacking leaves through the whole depth*: many times the leaves and fill, and no view of the worm without cutting through all of them. Rejected.
- *A transparent top layer*: needs a sorted transparent pass and overdraw over the whole floor; the brief allows only small additive effects. Rejected.
- *A stencil mask from a proxy tube*: an extra draw, and a tube gives an x-ray outline, not a pocket. Rejected.
- *A "pit" in the terrain mesh under the worm, with only a small top patch carrying the fade*: would keep the terrain's early depth test outside the patch (the fade's `discard` costs it). Not needed yet; it is the last rung of Task 10's cut ladder if the gates fail.

**What reviewers must check visually (Tasks 7, 8 and 10):** the worm is always visible; the hole reads as looking down into the leaves (the pocket's leaves step down to the worm, the floor is dark and wet like IMG_2427 and IMG_2428), not as a cut-out sticker; no leaf ever shows through the top or cuts the worm; rocks show at least half; nothing flashes or shimmers (the dither is fixed in screen space).

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/version.ts`, `CHANGELOG.md` | Modify (T1, T9) | V2 · Underground; the student-facing lines |
| `src/ui/scaleMenu.ts`, `src/game/scalePicker.ts` | Delete (T2) | The World scale screen and picker |
| `src/game/screens.ts`, `src/ui/shell.ts`, `src/ui/menus.ts`, `src/ui/icons.ts`, `src/ui/parchment.css` | Modify (T2; T4, T5) | No World scale screen or button; crawl hint from `TEXT` (T4); Action icons (T5) |
| `src/main.ts` | Modify (T2, T5) | No picker or `setScale` (T2); `commands()` with the touch Action button, key and tap latches, the `?prompt=` hook (T5) |
| `src/game/params.ts` | Modify (T2, T5) | No `?scale=` (T2); `?prompt=` (T5) |
| `src/save/settingsStore.ts` | Modify (T2) | No `scale`; a stored one is kept, ignored |
| `src/game/world.ts` | Modify (T2, T6, T7, T8) | One forest, no switching (T2); the worm on the floor (T6); floor patch, fade's up vector, spine every frame (T7); the pocket layer (T8) |
| `src/game/crawl.ts`, `src/game/cameraClearance.ts` | Modify (T2, T3, T6) | No `applyScale` (T2, T3); buried worm, hero leaves on the floor, camera over the top (T6) |
| `src/perf/speedTest.ts`, `src/perf/speedTestRunner.ts`, `scripts/perf-gates.mjs` | Modify (T2) | No World scale line; the gates run every preset at real size, no `--scale` |
| `src/surface/worldScale.ts` → `src/surface/realScale.ts` | Delete / Create (T3) | `UNITS_PER_CM`, `REAL_LEAF_CM`, `REAL_SCALE` |
| `src/surface/{treeSites,propPlacement,obstacles,litterDepth,terrainMesh,leafScale,leafLitterMesh,detailLeaves,heroPool,forestTrees,distantTrees,groundProps,propGeometry,treeShadows}.ts`, `src/render/{litterTexture,groundTexture}.ts` | Modify (T3) | Read `REAL_SCALE`; no spec parameters or keys |
| `src/content/sources.ts`, `src/content/text.ts` | Create (T4) | Sources, lines, `shown()`, `lineProblems()` |
| `src/ui/actionPrompt.ts`, `src/input/actionEdge.ts`, `src/ui/hud.css`, `src/input/keyboard.ts` | Create / Modify (T5) | The Action prompt and button; the press edge; key latch |
| `src/surface/meshGrid.ts` | Create (T6) | The drawn ground's grid and its exact sampling |
| `src/surface/litterDepth.ts` | Modify (T3, T6) | V2 depths, `floorHeight`, `litterTopHeight`, `groundHeight`, the top grid |
| `src/surface/terrainMesh.ts` | Modify (T3, T6, T7) | Draws the top; `meshGroundHeight` = `litterTopHeight` (T6); the fade (T7) |
| `src/surface/leafLitter.ts`, `src/render/litterTexture.ts`, `src/worm/surfaceHeight.ts` | Modify (T6) | Top leaves in a thin top layer; R depth, G thinnest depth; the worm on the floor |
| `src/render/occlusion.ts`, `src/render/occluderSegments.ts`, `src/render/groundUniforms.ts` | Modify (T7) | The funnel, `uOccUp`, `worldUpInView` |
| `src/render/paintedMaterial.ts`, `src/render/propMaterial.ts`, `src/render/leafMaterial.ts` | Modify (T7, T8) | `occlude` replaces `trail`; `uOccUp`; top leaves fade but never move (T7); the `pocket` variant (T8) |
| `src/render/drawOrder.ts`, `src/render/floorMaterial.ts`, `src/surface/floorPatch.ts` | Create (T7) | Draw order; the F floor patch |
| `src/surface/litterChunks.ts`, `src/surface/leafLitterMesh.ts`, `src/surface/disturbance.ts` | Modify (T7) | Fade-only reacting chunks; no disturbed box |
| `src/worm/wormMesh.ts`, `src/surface/heroLeafMesh.ts` | Modify (T7) | Drawn after the top; hero leaves older |
| `src/render/detailGlsl.ts`, `src/surface/detailLeaves.ts`, `src/render/nearClutterGlsl.ts` | Modify (T8) | Pocket placement, spine gate, darker lower leaves; shared `SPINE_DISTANCE_GLSL` |
| `docs/superpowers/visual-quality-brief.md` | Modify (T3) | "Real size (V2 onward)" replaces "World scale" |
| Tests | Create / Modify / Delete | Listed per task |


### Task 1: Version bump to V2 · Underground

**Files:**
- Modify: `src/version.ts`
- Modify: `tests/unit/version.test.ts`
- Modify: `CHANGELOG.md`

The first commit of every version sets its label (CLAUDE.md). The contract fixes the name: `{ number: 2, name: 'Underground' }`. It is one word, and the existing test asks for 2 to 4, so the test now allows 1 to 4 with a comment (see "Read this first", item 2). `tests/e2e/version.spec.ts` reads `VERSION_LABEL` from the source, so it needs no change.

- [ ] **Step 1: Update the test**

In `tests/unit/version.test.ts`:


Replace:

```ts
describe('version', () => {
  it('is V1 · True Size', () => {
    expect(VERSION).toEqual({ number: 1, name: 'True Size' });
    expect(VERSION_LABEL).toBe('V1 · True Size');
  });

  it('has a whole number from 1 and a 2 to 4 word name (docs/codev/README.md)', () => {
    expect(Number.isInteger(VERSION.number) && VERSION.number >= 1).toBe(true);
    const words = VERSION.name.trim().split(/\s+/);
    expect(words.length).toBeGreaterThanOrEqual(2);
    expect(words.length).toBeLessThanOrEqual(4);
```

with:

```ts
describe('version', () => {
  it('is V2 · Underground', () => {
    expect(VERSION).toEqual({ number: 2, name: 'Underground' });
    expect(VERSION_LABEL).toBe('V2 · Underground');
  });

  it('has a whole number from 1 and a short name of at most 4 words (docs/codev/README.md)', () => {
    expect(Number.isInteger(VERSION.number) && VERSION.number >= 1).toBe(true);
    // CLAUDE.md asks for 2 to 4 words; Matt named V2 "Underground" (one word) in the approved spec.
    const words = VERSION.name.trim().split(/\s+/);
    expect(words.length).toBeGreaterThanOrEqual(1);
    expect(words.length).toBeLessThanOrEqual(4);
```


Replace:

```ts
  it('stamps the build with a meta tag the release script reads', () => {
    expect(VERSION_META).toBe('<meta name="wormsim-version" content="V1 · True Size">');
  });
```

with:

```ts
  it('stamps the build with a meta tag the release script reads', () => {
    expect(VERSION_META).toBe('<meta name="wormsim-version" content="V2 · Underground">');
  });
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/unit/version.test.ts`
Expected: FAIL: `expected { number: 1, name: 'True Size' } to deeply equal { number: 2, name: 'Underground' }`.

- [ ] **Step 3: Implement**

In `src/version.ts`:


Replace:

```ts
 */
export const VERSION = { number: 1, name: 'True Size' } as const;

/** "V1 · True Size": the Start-screen label, slides, form, Canvas post and changelog all use it. */
export const VERSION_LABEL = `V${VERSION.number} · ${VERSION.name}`;
```

with:

```ts
 */
export const VERSION = { number: 2, name: 'Underground' } as const;

/** "V2 · Underground": the Start-screen label, slides, form, Canvas post and changelog all use it. */
export const VERSION_LABEL = `V${VERSION.number} · ${VERSION.name}`;
```



In `CHANGELOG.md`:


Replace:

```markdown
### New
- (to be filled in as V2 is built)

```

with:

```markdown
### New
- The Start screen shows which version you are playing: V2 · Underground.

```

- [ ] **Step 4: Run everything**

Run: `npx tsc --noEmit && npx vitest run tests/unit/version.test.ts && npm run build && npx playwright test tests/e2e/version.spec.ts`
Expected: 4 unit tests and 2 e2e tests pass; the Start screen label is "V2 · Underground".
Whole suite: `npx vitest run` **69 files, 772 tests** (no change); `npm run test:e2e` **34 passed, 1 skipped**.

- [ ] **Step 5: Commit**

```bash
git add src/version.ts tests/unit/version.test.ts CHANGELOG.md
git commit -m "feat(v2): version label V2 · Underground, changelog opened

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---


### Task 2: Remove the World scale screen, `?scale=`, the scale setting and forest switching

**Files:**
- Delete: `src/ui/scaleMenu.ts`, `src/game/scalePicker.ts`, `tests/unit/scalePicker.test.ts`, `tests/unit/worldRebuild.test.ts`, `tests/e2e/scale.spec.ts`
- Modify: `src/main.ts`, `src/game/screens.ts`, `src/game/params.ts`, `src/game/world.ts`, `src/game/crawl.ts`, `src/save/settingsStore.ts`, `src/perf/speedTest.ts`, `src/perf/speedTestRunner.ts`, `src/render/litterTexture.ts`, `src/render/groundTexture.ts`, `src/ui/menus.ts`, `src/ui/shell.ts`, `src/ui/icons.ts`, `src/ui/parchment.css`, `scripts/perf-gates.mjs`
- Modify tests: `tests/unit/settingsStore.test.ts`, `tests/unit/params.test.ts`, `tests/unit/screens.test.ts`, `tests/unit/speedTest.test.ts`, `tests/unit/graphicsControl.test.ts`, `tests/e2e/shell.spec.ts`, `tests/e2e/speedTest.spec.ts`

Spec section 10: V2 is real size only. This task removes everything the player could use to switch: the Start button, the World scale screen and picker, `?scale=`, the saved `scale` field and the forest rebuild behind them (`World.switchForest`, `rebuildForest`, `compileForest`, `disposeForest`, `Crawl.applyScale` and the textures' `refresh` functions: only World scale ever switched forests). The table itself stays until Task 3 (its default is already True, and nothing calls `setScale` any more).

Settings follow the shared-save rule (CLAUDE.md): `Settings` has no `scale`; a stored `scale` (a V1 save) still loads, is ignored, and is kept on every write, because V1 at `/v1/` shares the key. `updateSettings` keeps its name and rule. The speed test report loses its "World scale:" line, and `scripts/perf-gates.mjs` runs every preset at real size with no `--scale` (a `--scale` flag now prints a clear error). Two e2e tests replace what `scale.spec.ts` protected: a V1 save with a scale loads and keeps it, and changing presets once each has been shown compiles no shader (the only compile counter V1 had was in `scale.spec.ts`).

- [ ] **Step 1: Update the tests**

Delete `tests/e2e/scale.spec.ts` (`git rm tests/e2e/scale.spec.ts`).

In `tests/e2e/shell.spec.ts`:


Replace:

```ts
  await expect(button(page, 'Crawl')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(button(page, 'World scale')).toBeFocused();
  await page.keyboard.press('Tab');
```

with:

```ts
  await expect(button(page, 'Crawl')).toBeFocused();
  await page.keyboard.press('Tab');
```


Replace:

```ts
  await page.goto(PAGE);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(radio(page, 'Auto')).toBeFocused();
```

with:

```ts
  await page.goto(PAGE);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(radio(page, 'Auto')).toBeFocused();
```


Replace:

```ts
  expect(saved).toMatchObject({ version: 1, graphics: 'high', autoSettled: null });
  // A fresh device never chose a world scale, so none is stored (a later default must reach it).
  expect(saved).not.toHaveProperty('scale');

  await page.reload();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
```

with:

```ts
  expect(saved).toMatchObject({ version: 1, graphics: 'high', autoSettled: null });
  // V2 never writes V1's World scale (a fresh device stays unpinned).
  expect(saved).not.toHaveProperty('scale');

  await page.reload();
  await page.keyboard.press('Tab');
```


Replace:

```ts
  await expect(radio(page, 'Auto')).toBeChecked();
  await page.reload();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
```

with:

```ts
  await expect(radio(page, 'Auto')).toBeChecked();
  await page.reload();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
```


Replace:

```ts
  await expect(button(page, 'Graphics')).toBeFocused();
});
```

with:

```ts
  await expect(button(page, 'Graphics')).toBeFocused();
});

test('no World scale in V2: the Start menu has no such button, and a V1 save with one still loads and keeps it', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(PAGE);
  await page.evaluate(() => localStorage.setItem('wormsim.settings', JSON.stringify({ version: 1, graphics: 'low', autoSettled: null, scale: 'classic' })));
  await page.goto(PAGE + '?scale=hybrid');
  await expect(button(page, 'Crawl')).toBeFocused();
  await expect(page.getByRole('button', { name: /World scale/ })).toHaveCount(0);
  await button(page, 'Graphics').click();
  await expect(radio(page, 'Low')).toBeChecked();
  await radio(page, 'Medium').check();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wormsim.settings') ?? 'null'));
  // V1, frozen at /v1/, shares this key: its scale is kept, untouched.
  expect(saved).toEqual({ version: 1, graphics: 'medium', autoSettled: null, scale: 'classic' });
  await button(page, 'Back').click();
  await startCrawling(page);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowUp');
  expect(errors).toEqual([]);
});

test('changing presets, once each has been shown, compiles no shader, offline, with no network requests', async ({ page, context }) => {
  const errors = watchErrors(page);
  const outside: string[] = [];
  page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) outside.push(r.url()); });
  await page.addInitScript(() => {
    const w = window as unknown as { __compiles: number };
    w.__compiles = 0;
    const proto = WebGL2RenderingContext.prototype;
    const compile = proto.compileShader;
    proto.compileShader = function (s) { w.__compiles++; return compile.call(this, s); };
  });
  await context.setOffline(true);
  // Ultra builds every lazily built layer (detail leaves, near clutter) at load.
  await page.goto(PAGE + '?preset=ultra');
  await startCrawling(page);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowUp');
  const compiles = () => page.evaluate(() => (window as unknown as { __compiles: number }).__compiles);
  const before = await compiles();
  expect(before).toBeGreaterThan(0);
  for (const name of ['Low', 'Medium', 'High', 'Ultra']) {
    await button(page, 'Pause').click();
    await button(page, 'Graphics').click();
    await radio(page, name).check();
    await button(page, 'Back').click();
    await button(page, 'Resume').click();
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(400);
    await page.keyboard.up('ArrowUp');
  }
  expect(await compiles()).toBe(before);
  expect(outside).toEqual([]);
  expect(errors).toEqual([]);
});
```



In `tests/e2e/speedTest.spec.ts`:


Replace:

```ts
import { pathToFileURL } from 'node:url';

```

with:

```ts
import { pathToFileURL } from 'node:url';
import { scaledLeafCount } from '../../src/surface/leafScale';
import { PRESETS } from '../../src/render/graphics';

```


Replace:

```ts
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Speed test', exact: true })).toBeFocused();
```

with:

```ts
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Speed test', exact: true })).toBeFocused();
```


Replace:

```ts
test('the report\'s Leaves line is the litter plus detail leaves actually drawn at the tested preset', async ({ page }) => {
  // Classic draws the preset table's counts (the other scales derive theirs: leafScale.ts).
  await page.goto(PAGE + '&speedtest=1&preset=medium&scale=classic');
  await page.getByRole('button', { name: 'Start speed test' }).click();
```

with:

```ts
test('the report\'s Leaves line is the litter plus detail leaves actually drawn at the tested preset', async ({ page }) => {
  // Real-size leaves: the preset table's counts scaled by leaf area (leafScale.ts).
  await page.goto(PAGE + '&speedtest=1&preset=medium');
  await page.getByRole('button', { name: 'Start speed test' }).click();
```


Replace:

```ts
  const leaves = Number(/^Leaves: (\d+)$/m.exec(report)?.[1]);
  // Medium draws 1,500 litter + 900 detail leaves; quality tier 3 halves both (rounded).
  const density = tier === 3 ? 0.5 : 1;
  expect(leaves).toBe(Math.round(1500 * density) + Math.round(900 * density));
});
```

with:

```ts
  const leaves = Number(/^Leaves: (\d+)$/m.exec(report)?.[1]);
  // Medium's litter and detail counts (quality tier 3 halves both, rounded), at real size.
  const density = tier === 3 ? 0.5 : 1;
  const litter = scaledLeafCount(Math.round(PRESETS.medium.litter * density));
  const detail = scaledLeafCount(Math.round(PRESETS.medium.detail * density));
  expect(leaves).toBe(litter + detail);
});
```



In `tests/unit/graphicsControl.test.ts`:


Replace:

```ts
import { GraphicsControl } from '../../src/game/graphicsControl';
import { SETTINGS_KEY, updateSettings, type KeyValueStore } from '../../src/save/settingsStore';
import type { GraphicsChoice } from '../../src/render/graphics';
```

with:

```ts
import { GraphicsControl } from '../../src/game/graphicsControl';
import { SETTINGS_KEY, type KeyValueStore } from '../../src/save/settingsStore';
import type { GraphicsChoice } from '../../src/render/graphics';
```


Replace:

```ts

  it('a Graphics choice on a fresh device stores no world scale', () => {
    const store = memory();
    const g = new GraphicsControl(store, null);
    g.choose('medium');
    expect(saved(store)).not.toHaveProperty('scale');
    expect(g.active).toBe('medium');
  });

  it('never overwrites a world scale picked after it loaded (choice and Auto step-down)', () => {
    const store = memory();
    const g = new GraphicsControl(store, null);
    updateSettings(store, { scale: 'true' }); // the World scale panel, later in the session
    g.choose('auto');
```

with:

```ts

  it('never overwrites a field another owner stored after it loaded (choice and Auto step-down)', () => {
    const store = memory();
    const g = new GraphicsControl(store, null);
    // Another owner (V1's World scale here; from V2, the underground camera) writes after loading.
    store.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, graphics: 'auto', autoSettled: null, scale: 'true' }));
    g.choose('auto');
```



In `tests/unit/params.test.ts`:


Replace:

```ts
describe('parseParams', () => {
  it('defaults: no forced preset or scale, no fps tag, not quick, Start screen', () => {
    expect(parseParams('')).toEqual({ preset: null, scale: null, fps: false, quick: false, speedTest: false });
  });
  it('reads ?preset=, ?scale=, ?fps=1, ?quick=1 and ?speedtest=1', () => {
    expect(parseParams('?preset=ultra&scale=hybrid&fps=1&quick=1&speedtest=1'))
      .toEqual({ preset: 'ultra', scale: 'hybrid', fps: true, quick: true, speedTest: true });
  });
```

with:

```ts
describe('parseParams', () => {
  it('defaults: no forced preset, no fps tag, not quick, Start screen', () => {
    expect(parseParams('')).toEqual({ preset: null, fps: false, quick: false, speedTest: false });
  });
  it('reads ?preset=, ?fps=1, ?quick=1 and ?speedtest=1', () => {
    expect(parseParams('?preset=ultra&fps=1&quick=1&speedtest=1'))
      .toEqual({ preset: 'ultra', fps: true, quick: true, speedTest: true });
  });
```


Replace:

```ts
  });
  it('reads each scale mode and ignores an unknown one', () => {
    expect(parseParams('?scale=classic').scale).toBe('classic');
    expect(parseParams('?scale=true').scale).toBe('true');
    expect(parseParams('?scale=huge').scale).toBeNull();
  });
```

with:

```ts
  });
  it('ignores V1\'s ?scale= (V2 is real size only)', () => {
    expect(parseParams('?scale=classic&preset=low')).toEqual({ preset: 'low', fps: false, quick: false, speedTest: false });
  });
```



Delete `tests/unit/scalePicker.test.ts` (`git rm tests/unit/scalePicker.test.ts`).

In `tests/unit/screens.test.ts`:


Replace:

```ts

  it('start -> World scale -> scale -> Back -> start', () => {
    const w = run(start, { type: 'scale' });
    expect(w.screen).toBe('scale');
    expect(run(w, { type: 'back' }).screen).toBe('start');
  });

  it('World scale opens from Start only', () => {
    for (const s of [run(start, { type: 'crawl' }), run(start, { type: 'crawl' }, { type: 'pause' }), run(start, { type: 'graphics' })]) {
      expect(transition(s, { type: 'scale' })).toBe(s);
    }
  });

  it('start -> Speed test -> speedTest -> done -> results -> Back to start -> start', () => {
```

with:

```ts

  it('start -> Speed test -> speedTest -> done -> results -> Back to start -> start', () => {
```


Replace:

```ts
      [run(start, { type: 'graphics' }), { type: 'crawl' }],
      [run(start, { type: 'scale' }), { type: 'crawl' }],
      [run(start, { type: 'scale' }), { type: 'graphics' }],
      [run(start, { type: 'scale' }), { type: 'hidden' }],
    ];
```

with:

```ts
      [run(start, { type: 'graphics' }), { type: 'crawl' }],
    ];
```



Replace the whole of `tests/unit/settingsStore.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import {
  loadSettings, saveSettings, updateSettings, DEFAULT_SETTINGS, SETTINGS_KEY, type KeyValueStore,
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

const stored = (raw: object) => memory({ [SETTINGS_KEY]: JSON.stringify(raw) });

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
    const s = { version: 1, graphics: 'ultra', autoSettled: 'medium' } as const;
    expect(saveSettings(store, s)).toBe(true);
    expect(JSON.parse(store.data[SETTINGS_KEY])).toEqual(s);
    expect(loadSettings(store)).toEqual(s);
  });

  it('reads a Step 1a save, keeping its graphics', () => {
    expect(loadSettings(stored({ version: 1, graphics: 'high', autoSettled: 'medium' })))
      .toEqual({ version: 1, graphics: 'high', autoSettled: 'medium' });
  });

  it('reads a V1 save with a World scale: the scale is ignored (V2 is real size only)', () => {
    for (const scale of ['classic', 'hybrid', 'true', 'giant', 7]) {
      expect(loadSettings(stored({ version: 1, graphics: 'low', autoSettled: 'low', scale })))
        .toEqual({ version: 1, graphics: 'low', autoSettled: 'low' });
    }
  });

  it('keeps a V1 World scale on every write, so V1 at /v1/ still finds it', () => {
    const store = stored({ version: 1, graphics: 'auto', autoSettled: null, scale: 'classic' });
    updateSettings(store, { graphics: 'low' });
    expect(JSON.parse(store.data[SETTINGS_KEY])).toEqual({ version: 1, graphics: 'low', autoSettled: null, scale: 'classic' });
    saveSettings(store, { ...loadSettings(store), autoSettled: 'medium' });
    expect(JSON.parse(store.data[SETTINGS_KEY])).toEqual({ version: 1, graphics: 'low', autoSettled: 'medium', scale: 'classic' });
  });

  it('never writes a scale itself (a fresh device stays unpinned)', () => {
    const fresh = memory();
    updateSettings(fresh, { graphics: 'low' });
    expect(JSON.parse(fresh.data[SETTINGS_KEY])).toEqual({ version: 1, graphics: 'low', autoSettled: null });
  });

  it('falls back to defaults on corrupt JSON', () => {
    expect(loadSettings(memory({ [SETTINGS_KEY]: '{not json' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memory({ [SETTINGS_KEY]: 'null' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memory({ [SETTINGS_KEY]: '[1,2]' }))).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to defaults on a wrong version', () => {
    expect(loadSettings(stored({ version: 2, graphics: 'low', autoSettled: 'low' }))).toEqual(DEFAULT_SETTINGS);
  });

  it('replaces unknown field values with their defaults', () => {
    expect(loadSettings(stored({ version: 1, graphics: 'extreme', autoSettled: 'ultra' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(stored({ version: 1, graphics: 'low', autoSettled: 42 })))
      .toEqual({ version: 1, graphics: 'low', autoSettled: null });
  });

  it('keeps fields it does not know when it saves (a later version\'s)', () => {
    const store = stored({ version: 1, graphics: 'low', autoSettled: null, moisture: { muted: true } });
    saveSettings(store, { ...loadSettings(store), graphics: 'high' });
    expect(JSON.parse(store.data[SETTINGS_KEY])).toEqual({
      version: 1, graphics: 'high', autoSettled: null, moisture: { muted: true },
    });
  });

  it('updateSettings changes only what it is given', () => {
    const store = stored({ version: 1, graphics: 'low', autoSettled: 'medium', later: 1 });
    expect(updateSettings(store, { graphics: 'ultra' })).toEqual({ version: 1, graphics: 'ultra', autoSettled: 'medium' });
    expect(updateSettings(store, { autoSettled: 'low' }).graphics).toBe('ultra');
    expect(JSON.parse(store.data[SETTINGS_KEY])).toEqual({
      version: 1, graphics: 'ultra', autoSettled: 'low', later: 1,
    });
  });

  it('survives storage that throws, on read and on write', () => {
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(throwing, { ...DEFAULT_SETTINGS, graphics: 'low' })).toBe(false);
    expect(saveSettings(null, { ...DEFAULT_SETTINGS, graphics: 'low' })).toBe(false);
    expect(updateSettings(throwing, { graphics: 'high' }).graphics).toBe('high');
    // Reads fail but writes work: no blind write that could drop a later version's fields.
    const writes: string[] = [];
    const unreadable: KeyValueStore = { getItem: () => { throw new Error('blocked'); }, setItem: (_k, v) => { writes.push(v); } };
    expect(updateSettings(unreadable, { graphics: 'low' }).graphics).toBe('low');
    expect(writes).toEqual([]);
  });
});
```

In `tests/unit/speedTest.test.ts`:


Replace:

```ts

  it('names the world scale right after the leaves, when given', () => {
    const lines = formatResults(full, auto, 1, 368, device, 0, 'True').split('\n');
    expect(lines[lines.indexOf('Leaves: 368') + 1]).toBe('World scale: True');
    expect(formatResults(full, auto, 1, 368, device)).not.toContain('World scale');
  });

  it('flags when the restart limit was reached', () => {
```

with:

```ts

  it('flags when the restart limit was reached', () => {
```



Delete `tests/unit/worldRebuild.test.ts` (`git rm tests/unit/worldRebuild.test.ts`).

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/settingsStore.test.ts tests/unit/params.test.ts`
Expected: FAIL: `DEFAULT_SETTINGS` still holds `scale: 'true'`, and `parseParams` still returns `scale`.

- [ ] **Step 3: Implement**

In `src/game/crawl.ts`:


Replace:

```ts
} from '../surface/heroLeaves';
import { sizeHeroLeaves } from '../surface/heroPool';
import { LOCOMOTION } from './drive';
import { disturbReach, type DisturbReach } from '../surface/leafScale';
import { scaleSpec } from '../surface/worldScale';
import { pushOut, slideMove } from '../surface/obstacles';
```

with:

```ts
} from '../surface/heroLeaves';
import { LOCOMOTION } from './drive';
import { disturbReach, type DisturbReach } from '../surface/leafScale';
import { pushOut, slideMove } from '../surface/obstacles';
```


Replace:

```ts
   * depend on where the worm had been. `heroes`: how many hero leaves to scatter (the same count
   * as now unless given; after a scale-mode change, the preset's count for the new mode).
   */
```

with:

```ts
   * depend on where the worm had been. `heroes`: how many hero leaves to scatter (the same count
   * as now unless given).
   */
```


Replace:

```ts
    this.setHeroCount(heroes);
  }

  /**
   * After a scale-mode change (setScale): the hero leaves take the mode's sizes and the map is
   * stamped as far as its leaves need (the renderer's fade window follows on the next upload).
   * Call reset() next, with the new mode's hero count: the worm starts again at the spawn and
   * nothing of the old mode's trail is left.
   */
  applyScale(): void {
    sizeHeroLeaves(this.hero);
    disturbReach(scaleSpec(), this.reach);
  }
```

with:

```ts
    this.setHeroCount(heroes);
  }
```



In `src/game/params.ts`:


Replace:

```ts
import { isPresetId, type PresetId } from '../render/graphics';
import { isScaleMode, type ScaleMode } from '../surface/worldScale';

```

with:

```ts
import { isPresetId, type PresetId } from '../render/graphics';

```


Replace:

```ts
  preset: PresetId | null;
  /** `?scale=classic|hybrid|true`: forces a world scale for this visit (tests, gates). Not saved. */
  scale: ScaleMode | null;
  /** `?fps=1`: show the fps tag while crawling. */
```

with:

```ts
  preset: PresetId | null;
  /** `?fps=1`: show the fps tag while crawling. */
```


Replace:

```ts
  const preset = p.get('preset');
  const scale = p.get('scale');
  return {
    preset: isPresetId(preset) ? preset : null,
    scale: isScaleMode(scale) ? scale : null,
    fps: p.get('fps') === '1',
```

with:

```ts
  const preset = p.get('preset');
  return {
    preset: isPresetId(preset) ? preset : null,
    fps: p.get('fps') === '1',
```



Delete `src/game/scalePicker.ts` (`git rm src/game/scalePicker.ts`).

In `src/game/screens.ts`:


Replace:

```ts
 *   start --Speed test--> speedTest --done--> results --Back to start--> start
 *   start --World scale--> scale --Back--> start
 */
export type Screen = 'start' | 'crawl' | 'pause' | 'graphics' | 'scale' | 'speedTest' | 'results';

```

with:

```ts
 *   start --Speed test--> speedTest --done--> results --Back to start--> start
 */
export type Screen = 'start' | 'crawl' | 'pause' | 'graphics' | 'speedTest' | 'results';

```


Replace:

```ts
  | { type: 'graphics' }
  | { type: 'scale' }
  | { type: 'back' }
```

with:

```ts
  | { type: 'graphics' }
  | { type: 'back' }
```


Replace:

```ts
        : s;
    case 'scale':
      return s.screen === 'start' ? { ...s, screen: 'scale' } : s;
    case 'back':
      if (s.screen === 'scale') return { ...s, screen: 'start' };
      return s.screen === 'graphics' ? { ...s, screen: s.graphicsFrom } : s;
```

with:

```ts
        : s;
    case 'back':
      return s.screen === 'graphics' ? { ...s, screen: s.graphicsFrom } : s;
```



Replace the whole of `src/game/world.ts` with:

```ts
import * as THREE from 'three';
import { buildSky } from '../render/sky';
import { buildAtmosphere, type Atmosphere } from '../render/atmosphere';
import { setRimLight } from '../render/paintedMaterial';
import {
  groundUniforms, setDisturbFade, setFocus, setLeafReaction, setSpine, uploadDisturbance,
} from '../render/groundUniforms';
import { occluderSegments } from '../render/occluderSegments';
import { disturbedBox } from '../surface/disturbance';
import { PRESETS, type PresetSpec } from '../render/graphics';
import { buildTerrain } from '../surface/terrainMesh';
import { buildForestTrees } from '../surface/forestTrees';
import { buildDistantTrees } from '../surface/distantTrees';
import { buildLeafLitter, type LeafLitter } from '../surface/leafLitterMesh';
import { buildDetailLayer, type DetailLayer } from '../surface/detailLeaves';
import { HeroLeafMesh } from '../surface/heroLeafMesh';
import { buildNearClutterLayer, type NearClutterLayer } from '../surface/nearClutter';
import { buildGroundProps, writeHeroLog, type GroundProps } from '../surface/groundProps';
import { HeroWorm, type WormPose } from '../worm/wormMesh';
import { wormSurface, type WormSurface } from '../worm/surfaceHeight';
import { WORM_SEGMENTS, type Crawl } from './crawl';
import { scaledLeafCount } from '../surface/leafScale';

export interface World {
  scene: THREE.Scene;
  /** The base litter in chunks (full and low-detail meshes), built with Ultra's leaf count. */
  readonly litter: LeafLitter;
  /** The close-up leaf layer around the worm (built when a preset first draws it). */
  readonly detail: DetailLayer;
  /** The loose physics leaves near the head (one instanced draw; the crawl's pool sets the count). */
  hero: HeroLeafMesh;
  /** Rocks and ground clutter. */
  readonly props: GroundProps;
  /** Ultra's extra clutter around the worm (built when Ultra is first shown). */
  nearClutter: NearClutterLayer;
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
  sync(crawl: Crawl, alpha: number, timeSec: number, camera: THREE.PerspectiveCamera): void;
}

/**
 * The forest floor, built once at Ultra size so presets only trim it. Thin composer: every
 * part is built in its own module.
 */
export function buildWorld(crawl: Crawl): World {
  const scene = new THREE.Scene();
  const forest = new THREE.Group();
  forest.name = 'forest';
  // Built at Ultra's counts for real-size leaves (bigger leaves, fewer of them: leafScale.ts).
  const litter = buildLeafLitter(scaledLeafCount(PRESETS.ultra.litter));
  const detail = buildDetailLayer(scaledLeafCount(PRESETS.ultra.detail));
  const props = buildGroundProps();
  // The ground fills most of the screen: draw it after everything that sits on it, so the
  // depth test skips ground pixels already covered by leaves, props and trunks.
  const terrain = buildTerrain();
  terrain.renderOrder = 5;
  forest.add(terrain, buildForestTrees(writeHeroLog), buildDistantTrees(), litter.group, detail.group, props.mesh);
  const hero = new HeroLeafMesh(crawl.hero);
  const nearClutter = buildNearClutterLayer();
  const atmosphere = buildAtmosphere();
  // The hero worm: no eyes (spec 8.3); it is posed from the simulated spine every frame.
  let reaction = true;
  const surf: WormSurface = { y: 0, under: 0 };
  // The contact shadow lies on the same surface the worm rests on.
  const worm = new HeroWorm(WORM_SEGMENTS, (x, z) => wormSurface(x, z, reaction, surf).y);
  const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
  const occBox = new Float32Array(5);
  // Where the uploaded map can move a leaf (disturbedBox); empty until the first upload.
  const distBox = new Float32Array([Infinity, Infinity, -Infinity, -Infinity]);

  scene.add(forest, hero.mesh, nearClutter.group, worm.group, buildSky(), atmosphere.group);
  return {
    scene, litter, detail, props, hero, nearClutter, atmosphere, worm,
    apply(spec) {
      reaction = spec.reaction;
      litter.setCount(scaledLeafCount(spec.litter));
      detail.setCount(scaledLeafCount(spec.detail));
      props.setDensity(spec.clutter);
      nearClutter.show(spec.nearClutter);
      atmosphere.setLevel(spec.effects, spec.extraEffects);
      setRimLight(spec.rim);
      setLeafReaction(spec.reaction);
    },
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
      litter.update(camera.position.x, camera.position.z, pose.spine, distBox);
    },
  };
}
```

Replace the whole of `src/main.ts` with:

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
import { keysToCommandsInto, mergeCommandsInto, type Commands } from './input/commands';
import { parseParams } from './game/params';
import { initialScreens, transition, type ScreenEvent, type ScreenState } from './game/screens';
import { GraphicsControl } from './game/graphicsControl';
import { buildWorld } from './game/world';
import { Crawl } from './game/crawl';
import { AUTO_DRIVE_MOVE } from './game/drive';
import { scaledLeafCount } from './surface/leafScale';
import { browserStore } from './save/settingsStore';
import { FPS_CAP, SpeedTestRunner } from './perf/speedTestRunner';
import { formatContextLostResults, formatNoWebGLResults } from './perf/speedTest';
import { basicDeviceInfo, deviceInfo } from './perf/device';
import { createShell } from './ui/shell';
import { showCrawl, showLost, showPause, showStart } from './ui/menus';
import { showGraphics } from './ui/graphicsMenu';
import { showResult, showRunning, showTestIntro } from './ui/speedTestUi';

const RESET_AFTER_TEST_NOTE = 'The graphics reset after the test. These results are still valid.';
const RESET_NOTE = 'The graphics reset during the test. Reload the page and try again.';
const CRASH_AFTER_TEST_NOTE = 'Something went wrong after the test. These results are still valid. '
  + 'Reload the page to keep playing.';
/** The Lost card's heading when the game threw (not a graphics reset). */
const CRASH_TITLE = 'Something went wrong';
const NO_MOVE: Vec2 = Object.freeze({ x: 0, y: 0 });
/** The game's frame cap; the speed test lifts it for its uncapped phase. */
const MAX_FPS = FPS_CAP;

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

/**
 * Building the world is the one slow, fallible step. If it throws, the Start card (already up)
 * would sit there with buttons that cannot work, so it is replaced with a Reload card.
 */
function run(renderer: THREE.WebGLRenderer): void {
  try {
    start(renderer);
  } catch (e) {
    console.error(e);
    renderer.domElement.remove();
    showLost(shell, 'The game could not start. Reload the page to try again.', CRASH_TITLE);
  }
}

function start(renderer: THREE.WebGLRenderer): void {
  app.appendChild(renderer.domElement);
  let state: ScreenState = initialScreens(params.speedTest);
  // The first card (Start, or the speed-test intro) goes up synchronously, before the slow
  // world build, so no frame is ever painted with an empty card. (The no-WebGL path shows its
  // FAIL card just as synchronously, above.) Its buttons only act once run() has finished.
  draw();
  // Near plane 0.2 (not 0.1) doubles depth precision for the thin, layered leaf litter. The
  // camera stays >= 0.5 above the litter and 2.6 behind the worm, so nothing it normally looks
  // at comes within 0.2 of the lens.
  const camera = new THREE.PerspectiveCamera(60, 1, 0.2, 120);
  const store = browserStore();
  const crawl = new Crawl();
  const world = buildWorld(crawl);
  const keyboard = new KeyboardInput();
  const joystick = new TouchJoystick(app);
  const meter = new FpsMeter();
  const graphics = new GraphicsControl(store, params.preset);
  // The speed test measures a forced ?preset= or, normally, High.
  const testBase = PRESETS[params.preset ?? 'high'];
  const drawSize = new THREE.Vector2();
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
    // Every run starts at the spawn, whatever the player did before opening the test.
    resetWorld: () => {
      crawl.reset();
      dirty = true;
    },
    setMaxFps: (fps) => loop.setMaxFps(fps),
    applyTier: (tier) => applySpec(tierSpec(testBase, TIERS[tier])),
    showPhase: (p) => showRunning(shell,
      p.id === 'full' ? 'Test 1 of 2: full quality' : 'Test 2 of 2: auto quality', p.id === 'full' ? 1 : 2, 2),
    deviceInfo: () => deviceInfo(renderer),
  }, params.quick, () => world.litter.drawn + world.detail.drawn);

  function updateResolution(): void {
    renderer.getDrawingBufferSize(drawSize);
    setResolution(drawSize.x, drawSize.y);
  }

  /**
   * Applies live: pixel ratio, draw ranges, visibility, uniforms. No rebuilds and no recompiles,
   * except the first time a preset shows a lazily built layer (the detail leaves; Ultra's near
   * clutter): that layer is built and its shader compiles once, then it is only shown and hidden.
   */
  function applySpec(s: PresetSpec): void {
    spec = s;
    renderer.setPixelRatio(pixelRatioFor(s, window.devicePixelRatio));
    world.apply(s);
    crawl.setReaction(s.reaction);
    crawl.setHeroCount(scaledLeafCount(s.hero));
    updateResolution();
    dirty = true;
    // The frames around a preset change say nothing about the new preset's speed.
    graphics.interruptAuto(performance.now());
  }

  /** The player's own preset: a forced ?preset=, a menu choice, or Auto's current pick. */
  function applyActive(): void {
    applySpec(PRESETS[graphics.active]);
  }

  /**
   * Compiles every eagerly built program once, now, while the Start card is up. On Low the
   * atmosphere (light shafts, motes, falling leaves) is hidden, so without this three would
   * compile those programs on the first switch up from Low and the game would hitch once.
   * three r186's renderer.compile prepares hidden objects too, so the hidden near litter chunks'
   * plain program is compiled here as well; showing the atmosphere for the call only keeps this
   * from depending on that. The lazily built layers (detail leaves, Ultra's near clutter) are
   * deliberately not built here: their one-time build and compile on first show is accepted (see
   * applySpec). Nor is the litter's reacting (active) program, which no chunk wears yet: it
   * compiles on the first frame a chunk reacts (a world rebuild lends it out, compileForest).
   */
  function warmShaders(): void {
    const group = world.atmosphere.group;
    const wasVisible = group.visible;
    group.visible = true;
    try {
      renderer.compile(world.scene, camera);
    } finally {
      group.visible = wasVisible;
    }
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
    // Leaving the speed-test screen while the test runs (Back to start) stops the test first:
    // otherwise its uncapped frame rate and quality tier would stay on, and its result would
    // later land on another screen. The running card offers no such button today.
    if (runner.running && next.screen !== 'speedTest') stopTest();
    // Back from Graphics: focus returns to the button that opened it.
    const back = e.type === 'back' && state.screen === 'graphics';
    state = next;
    // A slow streak from before (or a menu over the scene) must not count against Auto.
    graphics.interruptAuto(performance.now());
    draw(back);
  }

  /**
   * The game threw and the loop is stopped: say so, do not freeze silently. Nothing builds or
   * redraws a game screen after this.
   */
  function crash(): void {
    if (runner.running) runner.abort();
    const finished = state.screen === 'results' && !lost ? report : null;
    lost = true;
    if (finished) {
      // As after a context loss: the finished report matters more than the crash. Shown
      // again with a note and without the buttons that need a running game.
      report = { ...finished, summary: CRASH_AFTER_TEST_NOTE };
      showReport();
    } else {
      showLost(shell, 'The game stopped unexpectedly. Reload the page to try again.', CRASH_TITLE);
    }
  }

  /** Abandons a running speed test without a result and restores the player's own settings. */
  function stopTest(): void {
    runner.abort();
    loop.setMaxFps(MAX_FPS);
    applyActive();
  }

  function draw(fromGraphics = false): void {
    switch (state.screen) {
      case 'start':
        return showStart(shell, {
          onCrawl: () => dispatch({ type: 'crawl' }),
          onGraphics: () => dispatch({ type: 'graphics' }),
          onSpeedTest: () => dispatch({ type: 'speedTest' }),
        }, fromGraphics);
      case 'crawl':
        return showCrawl(shell);
      case 'pause':
        return showPause(shell, {
          onResume: () => dispatch({ type: 'resume' }),
          onGraphics: () => dispatch({ type: 'graphics' }),
          onStart: () => dispatch({ type: 'toStart' }),
        }, fromGraphics);
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
    dispatch({ type: 'testDone', recommended: recommendedPreset(r.tier, testBase.id) });
  }

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
    if (runner.running && runner.frame(now, meter.fps)) finishTest();
    if (still && !dirty) return;
    dirty = false;
    setTime(clock / 1000);
    world.sync(crawl, alpha, clock / 1000, camera);
    renderer.render(world.scene, camera);
    shell.setFps(meter.fps, CHOICE_LABELS[spec.id], runner.running ? runner.quality.tier : undefined);
    // Auto is fed only by frames actually drawn on the crawl screen: never menus, pauses or the
    // speed test (GraphicsControl also skips a meter window after every interruption).
    if (!runner.running && state.screen === 'crawl' && graphics.updateAuto(now, meter.fps)) applyActive();
  }

  applyActive();
  resize();
  warmShaders();
  window.addEventListener('resize', resize);
  const loop = startLoop(update, render, {
    maxFps: MAX_FPS,
    // update() or render() threw: the loop has stopped (and logged it). Say so, do not freeze silently.
    onError: crash,
  });

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
    graphics.interruptAuto(performance.now());
    if (document.hidden) {
      runner.onHidden();
      dispatch({ type: 'hidden' });
    } else {
      runner.onVisible(performance.now());
    }
  });

  // Esc or P pauses and resumes; Esc also leaves the Graphics screen.
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
}
```

In `src/perf/speedTest.ts`:


Replace:

```ts

/** `world`: the world scale the test ran in (Step 1b spec 4.3), named after the leaves. */
export function formatResults(
  full: FpsSummary, auto: FpsSummary, finalTier: number, leaves: number, d: DeviceInfo, restarts = 0,
  world?: string,
): string {
```

with:

```ts

export function formatResults(
  full: FpsSummary, auto: FpsSummary, finalTier: number, leaves: number, d: DeviceInfo, restarts = 0,
): string {
```


Replace:

```ts
    `Leaves: ${leaves}`,
    ...(world ? [`World scale: ${world}`] : []),
    `GPU: ${d.gpu}`,
```

with:

```ts
    `Leaves: ${leaves}`,
    `GPU: ${d.gpu}`,
```



In `src/perf/speedTestRunner.ts`:


Replace:

```ts
  deviceInfo(): DeviceInfo;
  /** The world scale mode's name, for the report. */
  worldScale?(): string;
}
```

with:

```ts
  deviceInfo(): DeviceInfo;
}
```


Replace:

```ts
      text: formatResults(
        full, auto, this.quality.tier, this.leaves(), this.host.deviceInfo(), test.restarts, this.host.worldScale?.(),
      ),
```

with:

```ts
      text: formatResults(
        full, auto, this.quality.tier, this.leaves(), this.host.deviceInfo(), test.restarts,
      ),
```



In `src/render/groundTexture.ts`:


Replace:

```ts

/** After a scale-mode change: the new ground's heights, in place (as refreshLitterTexture). */
export function refreshGroundTexture(): void {
  if (!texture) return;
  (texture.image.data as Float32Array).set(groundTextureData());
  texture.needsUpdate = true;
}

/** GLSL: meshGround(xz), the rendered ground height. Needs uniform uGround. */
```

with:

```ts

/** GLSL: meshGround(xz), the rendered ground height. Needs uniform uGround. */
```



In `src/render/litterTexture.ts`:


Replace:

```ts

/**
 * After a scale-mode change (the litter drifts against the new props): bakes the texture again in
 * place, so every material keeps the same texture object and nothing recompiles. Nothing to do
 * before its first use.
 */
export function refreshLitterTexture(): void {
  if (!texture) return;
  (texture.image.data as Uint8Array).set(litterTextureData());
  texture.needsUpdate = true;
}

/** GLSL: litterAt(xz) = (mound m, depth m, trunk shade). Needs uniform uLitter. */
```

with:

```ts

/** GLSL: litterAt(xz) = (mound m, depth m, trunk shade). Needs uniform uLitter. */
```



In `src/save/settingsStore.ts`:


Replace:

```ts
import { isChoice, isPresetId, AUTO_ORDER, type GraphicsChoice, type PresetId } from '../render/graphics';
import { DEFAULT_SCALE, isScaleMode, type ScaleMode } from '../surface/worldScale';

```

with:

```ts
import { isChoice, isPresetId, AUTO_ORDER, type GraphicsChoice, type PresetId } from '../render/graphics';

```


Replace:

```ts
 *
 * The world scale is stored only once the player picks one. Until then it reads as DEFAULT_SCALE,
 * so when a class vote changes DEFAULT_SCALE in a later version, every device that never chose
 * follows the new default.
 */
```

with:

```ts
 *
 * A setting with a class-vote default is stored only once the player picks it, so a later default
 * reaches every device that never chose (CLAUDE.md). V1 stored its World scale pick as `scale`;
 * V2 has no World scale (real size only), so a stored `scale` is ignored but kept on every write
 * (V1, frozen at /v1/, still reads it). Never reuse the `scale` key.
 */
```


Replace:

```ts
  autoSettled: PresetId | null;
  /** World scale (Step 1b spec 4.3). Added in V1; older saves have none and read as the default. */
  scale: ScaleMode;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  version: 1, graphics: 'auto', autoSettled: null, scale: DEFAULT_SCALE,
});
```

with:

```ts
  autoSettled: PresetId | null;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  version: 1, graphics: 'auto', autoSettled: null,
});
```


Replace:

```ts
    autoSettled: isPresetId(o.autoSettled) && AUTO_ORDER.includes(o.autoSettled) ? o.autoSettled : null,
    scale: isScaleMode(o.scale) ? o.scale : DEFAULT_SETTINGS.scale,
  };
```

with:

```ts
    autoSettled: isPresetId(o.autoSettled) && AUTO_ORDER.includes(o.autoSettled) ? o.autoSettled : null,
  };
```


Replace:

```ts
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * The world scale the player stored, or null when none is (they never picked one, or storage
 * is missing or unreadable). loadSettings fills in DEFAULT_SCALE instead.
 */
export function storedScale(store: KeyValueStore | null): ScaleMode | null {
  if (!store) return null;
  try {
    const s = storedObject(store)?.scale;
    return isScaleMode(s) ? s : null;
  } catch {
    return null;
  }
```

with:

```ts
    return { ...DEFAULT_SETTINGS };
  }
```


Replace:

```ts
/**
 * Writes every field of `s`, scale included, keeping any stored fields this build does not know.
 * False when it could not be stored. For a player's change use updateSettings, which never stores
 * a scale the player did not pick.
 */
```

with:

```ts
/**
 * Writes every field of `s`, keeping any stored fields this build does not know (V1's `scale`, a
 * later version's). False when it could not be stored. For a player's change use updateSettings.
 */
```


Replace:

```ts
    return write(store, storedObject(store) ?? {}, {
      graphics: s.graphics, autoSettled: s.autoSettled, scale: s.scale,
    });
```

with:

```ts
    return write(store, storedObject(store) ?? {}, {
      graphics: s.graphics, autoSettled: s.autoSettled,
    });
```


Replace:

```ts
/**
 * Changes some settings and keeps the rest as stored, so two owners (the Graphics menu and the
 * World scale panel) never overwrite each other's choice. Graphics and autoSettled are always
 * written (older builds read them); scale only when it is in `patch` or was already stored, so a
 * Graphics pick never pins the build's DEFAULT_SCALE. Returns the full settings as now saved,
 * default scale filled in (or as they would be, if storage failed).
 */
```

with:

```ts
/**
 * Changes some settings and keeps the rest as stored, so two owners (the Graphics menu and, from
 * V2, the underground camera) never overwrite each other's choice. Graphics and autoSettled are
 * always written (older builds read them); a field with a class-vote default is written only when
 * it is in `patch` (the player picked it). Fields this build does not know are kept. Returns the
 * full settings as now saved (or as they would be, if storage failed).
 */
```


Replace:

```ts
  if (!store) return next;
  const fields: Record<string, unknown> = { graphics: next.graphics, autoSettled: next.autoSettled };
  if (patch.scale !== undefined || isScaleMode(kept?.scale)) fields.scale = next.scale;
  write(store, kept ?? {}, fields);
  return next;
```

with:

```ts
  if (!store) return next;
  write(store, kept ?? {}, { graphics: next.graphics, autoSettled: next.autoSettled });
  return next;
```



In `src/ui/icons.ts`:


Replace:

```ts
      stroke-linejoin="round"><path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/></svg>`,
  /** A ruler: World scale. */
  ruler: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
      stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="8" width="19" height="8" rx="1.5"/>
    <path d="M6.5 8v3.5M10.5 8v2.2M14.5 8v3.5M18.5 8v2.2"/></svg>`,
  /** A tick: a saved setting. */
```

with:

```ts
      stroke-linejoin="round"><path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/></svg>`,
  /** A tick: a saved setting. */
```



In `src/ui/menus.ts`:


Replace:

```ts

export interface StartActions { onCrawl(): void; onScale(): void; onGraphics(): void; onSpeedTest(): void }

/**
 * Start: the parchment title card over the live forest. `from`: the screen we came back from, so
 * focus returns to the button that opened it (Crawl otherwise).
 */
export function showStart(shell: Shell, a: StartActions, from: 'graphics' | 'scale' | null = null): void {
  const crawl = button('Crawl', 'play', 'primary', a.onCrawl);
  const scale = button('World scale', 'ruler', 'secondary', a.onScale);
  const graphics = button('Graphics', 'sliders', 'secondary', a.onGraphics);
```

with:

```ts

export interface StartActions { onCrawl(): void; onGraphics(): void; onSpeedTest(): void }

/**
 * Start: the parchment title card over the live forest. `fromGraphics`: back from the Graphics
 * screen, so focus returns to its button (Crawl otherwise).
 */
export function showStart(shell: Shell, a: StartActions, fromGraphics = false): void {
  const crawl = button('Crawl', 'play', 'primary', a.onCrawl);
  const graphics = button('Graphics', 'sliders', 'secondary', a.onGraphics);
```


Replace:

```ts
    el('p', 'You are an earthworm under the leaves of a northern forest.', 'lead'),
    menu(crawl, scale, graphics, button('Speed test', 'gauge', 'secondary', a.onSpeedTest)),
    el('p', VERSION_LABEL, 'version'),
  ]);
  (from === 'graphics' ? graphics : from === 'scale' ? scale : crawl).el.focus();
}
```

with:

```ts
    el('p', 'You are an earthworm under the leaves of a northern forest.', 'lead'),
    menu(crawl, graphics, button('Speed test', 'gauge', 'secondary', a.onSpeedTest)),
    el('p', VERSION_LABEL, 'version'),
  ]);
  (fromGraphics ? graphics : crawl).el.focus();
}
```



In `src/ui/parchment.css`:


Replace:

```css
.panel[data-state="start"], .panel[data-state="speedTest"], .panel[data-state="pause"],
.panel[data-state="graphics"], .panel[data-state="scale"], .panel[data-state="lost"] {
  left: var(--edge); bottom: var(--edge-y); width: min(540px, calc(100vw - 32px));
  max-height: calc(100dvh - var(--edge-y) - 16px);
}
.panel[data-state="graphics"], .panel[data-state="scale"] { width: min(620px, calc(100vw - 32px)); }
/* Small top-left cards while the scene is the point. */
```

with:

```css
.panel[data-state="start"], .panel[data-state="speedTest"], .panel[data-state="pause"],
.panel[data-state="graphics"], .panel[data-state="lost"] {
  left: var(--edge); bottom: var(--edge-y); width: min(540px, calc(100vw - 32px));
  max-height: calc(100dvh - var(--edge-y) - 16px);
}
.panel[data-state="graphics"] { width: min(620px, calc(100vw - 32px)); }
/* Small top-left cards while the scene is the point. */
```


Replace:

```css
.choices .lead { margin-bottom: 4px !important; }
/* What the forest is doing after a World scale pick; reserved height, so nothing jumps. */
.scale-status { min-height: 1.4em; margin-top: 12px !important; font-weight: 700; color: var(--ink); }

```

with:

```css
.choices .lead { margin-bottom: 4px !important; }

```


Replace:

```css
  .choices legend { margin-bottom: 8px; }
  .scale-status { margin-top: 8px !important; }
  .verdict-icon { width: 52px; height: 52px; }
```

with:

```css
  .choices legend { margin-bottom: 8px; }
  .verdict-icon { width: 52px; height: 52px; }
```



Delete `src/ui/scaleMenu.ts` (`git rm src/ui/scaleMenu.ts`).

In `src/ui/shell.ts`:


Replace:

```ts
export type UiState =
  | 'start' | 'crawl' | 'pause' | 'graphics' | 'scale' | 'speedTest' | 'running' | 'results' | 'lost';

```

with:

```ts
export type UiState =
  | 'start' | 'crawl' | 'pause' | 'graphics' | 'speedTest' | 'running' | 'results' | 'lost';

```



In `scripts/perf-gates.mjs`:


Replace:

```js
// Performance gates (spec 2026-10-01 section 6; Step 1b spec 4.6): each preset's uncapped
// speed-test fps must be at least a fixed fraction of the Step 0 page's fps, measured back to back
// on the same machine so background load cancels out. Every gate holds in every world scale run.
//
// Usage: npm run build && node scripts/perf-gates.mjs [cycles=4] [--scale=true,classic] [--list] [presets...]
// It builds the Step 0 baseline once into .cache/step0 (git worktree at STEP0_REF), then runs
// S0, p1, p2, S0, p3, p4, S0 ... (each preset in each scale) and prints each one's median ratio
// against its gate. By default it runs True (the default mode) and Classic. --list prints the run
// order and exits. Takes ~4 min per cycle per scale. Close other heavy apps first; results are
// still noisy (±5%).
// A Hybrid run (--scale=hybrid) is held to the same per-preset gate (for example the High gate), so
// it can FAIL; the Step 1b spec only asks for Hybrid to be reported, so read its line as a report.
// A line also fails if the page did not report the requested world scale, or any fps or ratio is
// not a finite number, or draw calls exceed 40. Bad arguments print the usage and exit 1.
import { execFileSync } from 'node:child_process';
```

with:

```js
// Performance gates (spec 2026-10-01 section 6; V2 spec section 10): each preset's uncapped
// speed-test fps must be at least a fixed fraction of the Step 0 page's fps, measured back to back
// on the same machine so background load cancels out. V2 is real size only (no World scale).
//
// Usage: npm run build && node scripts/perf-gates.mjs [cycles=4] [--list] [presets...]
// It builds the Step 0 baseline once into .cache/step0 (git worktree at STEP0_REF), then runs
// S0, p1, p2, S0, p3, p4, S0 ... and prints each preset's median ratio against its gate. --list
// prints the run order and exits. Takes ~4 min per cycle. Close other heavy apps first; results
// are still noisy (±5%).
// A line also fails if any fps or ratio is not a finite number, or draw calls exceed 40. Bad
// arguments print the usage and exit 1.
import { execFileSync } from 'node:child_process';
```


Replace:

```js
const GATES = { low: 50 / STEP0_FPS, medium: 40 / STEP0_FPS, high: 34 / STEP0_FPS, ultra: 28 / STEP0_FPS };
const SCALES = ['classic', 'hybrid', 'true'];

```

with:

```js
const GATES = { low: 50 / STEP0_FPS, medium: 40 / STEP0_FPS, high: 34 / STEP0_FPS, ultra: 28 / STEP0_FPS };

```


Replace:

```js
const step0 = path.join(repo, '.cache/step0');
const USAGE = 'usage: node scripts/perf-gates.mjs [cycles=4] [--scale=true,classic] [--list] [low medium high ultra]';
const usageError = (msg) => { console.error(`${msg}\n${USAGE}`); process.exit(1); };
const args = process.argv.slice(2);
let scaleArg = null;
let list = false;
for (const a of args.filter((x) => x.startsWith('--'))) {
  if (a === '--list') list = true;
  else if (a.startsWith('--scale=') && a.length > '--scale='.length && scaleArg === null) scaleArg = a.slice('--scale='.length);
  else usageError(a === '--scale' || a === '--scale=' ? 'the --scale flag needs a value (--scale=true,classic)' : a.startsWith('--scale=') ? 'give --scale only once' : `unknown flag ${a}`);
}
```

with:

```js
const step0 = path.join(repo, '.cache/step0');
const USAGE = 'usage: node scripts/perf-gates.mjs [cycles=4] [--list] [low medium high ultra]';
const usageError = (msg) => { console.error(`${msg}\n${USAGE}`); process.exit(1); };
const args = process.argv.slice(2);
let list = false;
for (const a of args.filter((x) => x.startsWith('--'))) {
  if (a === '--list') list = true;
  else usageError(a.startsWith('--scale') ? 'there is no --scale in V2: the game is real size only' : `unknown flag ${a}`);
}
```


Replace:

```js
const presets = plain.length > 1 ? plain.slice(1) : ['low', 'medium', 'high', 'ultra'];
const scales = (scaleArg ?? 'true,classic').split(',');
for (const s of scales) if (!SCALES.includes(s)) usageError(`unknown scale ${s} (${SCALES.join(', ')})`);
for (const p of presets) if (!(p in GATES)) usageError(`unknown preset ${p} (${Object.keys(GATES).join(', ')})`);
/** Every measured run: a preset in a scale, labelled "scale/preset". */
const labels = scales.flatMap((s) => presets.map((p) => `${s}/${p}`));
const query = (label) => {
  const [s, p] = label.split('/');
  return `?speedtest=1&preset=${p}&scale=${s}`;
};

```

with:

```js
const presets = plain.length > 1 ? plain.slice(1) : ['low', 'medium', 'high', 'ultra'];
for (const p of presets) if (!(p in GATES)) usageError(`unknown preset ${p} (${Object.keys(GATES).join(', ')})`);
/** Every measured run: a preset, labelled by its name. */
const labels = presets;
const query = (label) => `?speedtest=1&preset=${label}`;

```


Replace:

```js
  let txt = '';
  try { txt = execFileSync('node', [bench, dir, label.replace('/', '-'), q], { encoding: 'utf8', timeout: 300_000 }); }
  catch (e) { txt = String(e.stdout ?? '') + String(e); }
```

with:

```js
  let txt = '';
  try { txt = execFileSync('node', [bench, dir, label, q], { encoding: 'utf8', timeout: 300_000 }); }
  catch (e) { txt = String(e.stdout ?? '') + String(e); }
```


Replace:

```js
  const frames = m ? Math.min(Number(m[3]), 30) : NaN; // ~30 rendered frames at the cap
  const world = (txt.match(/World scale: (\w+)/) ?? [])[1] ?? '?';
  const rec = { label, world, fps, draws: m ? Number(m[1]) / frames : NaN, tris: m ? Number(m[2]) / frames : NaN };
  runs.push(rec);
```

with:

```js
  const frames = m ? Math.min(Number(m[3]), 30) : NaN; // ~30 rendered frames at the cap
  const rec = { label, fps, draws: m ? Number(m[1]) / frames : NaN, tris: m ? Number(m[2]) / frames : NaN };
  runs.push(rec);
```


Replace:

```js
for (const label of labels) {
  const [scale, preset] = label.split('/');
  const gate = GATES[preset];
  const mine = runs.filter((r) => r.label === label);
```

with:

```js
for (const label of labels) {
  const gate = GATES[label];
  const mine = runs.filter((r) => r.label === label);
```


Replace:

```js
  });
  // The page must report the world scale this row asked for ("?" or a different mode means ?scale= was ignored).
  const worlds = [...new Set(mine.map((r) => r.world))];
  const worldOk = mine.length > 0 && mine.every((r) => r.world.toLowerCase() === scale);
  // Any missing or non-finite number fails the row; NaN never enters the median.
  const finite = mine.length > 0 && ratios.length > 0 && mine.every((r) => Number.isFinite(r.fps)) && ratios.every(Number.isFinite) && draws.every(Number.isFinite);
  const med = finite ? median(ratios) : NaN;
  // Draw calls stay within the 40-call budget (visual-quality-brief.md) in every scale.
  const drawMax = finite ? Math.max(...draws) : NaN;
  const pass = worldOk && finite && med >= gate && drawMax <= 40;
  failed ||= !pass;
  const why = [!worldOk && `WRONG WORLD (asked ${scale})`, !finite && 'NON-FINITE RESULT'].filter(Boolean).join(' ');
  console.log(`${label.padEnd(15)} world ${worlds.join('/') || '?'} median ${med.toFixed(3)} gate ${gate.toFixed(3)} ${pass ? 'PASS' : 'FAIL'}${why ? ' ' + why : ''}  ratios ${ratios.map((x) => x.toFixed(2)).join(' ')}  draws ≤ ${drawMax.toFixed(0)}  tris ≤ ${(Math.max(...tris) / 1000).toFixed(0)}k`);
}
```

with:

```js
  });
  // Any missing or non-finite number fails the row; NaN never enters the median.
  const finite = mine.length > 0 && ratios.length > 0 && mine.every((r) => Number.isFinite(r.fps)) && ratios.every(Number.isFinite) && draws.every(Number.isFinite);
  const med = finite ? median(ratios) : NaN;
  // Draw calls stay within the 40-call budget (visual-quality-brief.md).
  const drawMax = finite ? Math.max(...draws) : NaN;
  const pass = finite && med >= gate && drawMax <= 40;
  failed ||= !pass;
  console.log(`${label.padEnd(8)} median ${med.toFixed(3)} gate ${gate.toFixed(3)} ${pass ? 'PASS' : 'FAIL'}${finite ? '' : ' NON-FINITE RESULT'}  ratios ${ratios.map((x) => x.toFixed(2)).join(' ')}  draws ≤ ${drawMax.toFixed(0)}  tris ≤ ${(Math.max(...tris) / 1000).toFixed(0)}k`);
}
```

- [ ] **Step 4: Run everything**

Run: `npx tsc --noEmit && npx vitest run && npm run verify:build && npm run test:e2e`
Expected: types clean; **67 files, 752 tests** (−2 files, −20 tests: the picker and rebuild tests go); `single-file build OK`; **28 passed, 1 skipped** (−8 from `scale.spec.ts`, +2 new in `shell.spec.ts`).
Also run `node scripts/perf-gates.mjs 2 --list` (prints two cycles of `low medium high ultra`) and `node scripts/perf-gates.mjs --scale=true` (prints "there is no --scale in V2..." and exits 1). Do not run the gates themselves here.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/game/screens.ts src/game/params.ts src/game/world.ts src/game/crawl.ts \
  src/save/settingsStore.ts src/perf/speedTest.ts src/perf/speedTestRunner.ts src/render/litterTexture.ts \
  src/render/groundTexture.ts src/ui/menus.ts src/ui/shell.ts src/ui/icons.ts src/ui/parchment.css \
  scripts/perf-gates.mjs tests/unit/settingsStore.test.ts tests/unit/params.test.ts tests/unit/screens.test.ts \
  tests/unit/speedTest.test.ts tests/unit/graphicsControl.test.ts tests/e2e/shell.spec.ts tests/e2e/speedTest.spec.ts
git commit -m "feat(v2): remove World scale: no screen, no ?scale=, no saved scale, no forest switching

A V1 save's scale is kept and ignored. The perf gates run every preset at real size.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git rm` in Step 1 and Step 3 already staged the deletions.)

---


### Task 3: Real size is the only world: `realScale.ts` replaces the scale table

**Files:**
- Delete: `src/surface/worldScale.ts`, `tests/unit/worldScale.test.ts`, `tests/unit/cameraPressClassicLeft.test.ts`, `tests/unit/cameraPressClassicRight.test.ts`, `tests/unit/cameraPressHybrid.test.ts`
- Create: `src/surface/realScale.ts`, `tests/unit/realScale.test.ts`
- Modify: `src/surface/{treeSites,propPlacement,obstacles,litterDepth,terrainMesh,leafScale,leafLitterMesh,detailLeaves,heroPool,forestTrees,distantTrees,groundProps,propGeometry,treeShadows}.ts`, `src/render/litterTexture.ts`, `src/render/groundTexture.ts`, `src/game/crawl.ts`, `docs/superpowers/visual-quality-brief.md`
- Modify tests: every test that set a mode (listed in Step 1)

`realScale.ts` holds V1's True entry as one constant, `REAL_SCALE`, with the table's field names (so every reader changes `scaleSpec()` to `REAL_SCALE` and nothing else), plus `UNITS_PER_CM` (the contract's constant) and `REAL_LEAF_CM`. Functions that took a `spec` lose the parameter (`trunkRadiusOf(t)`, `heroLog()`, `logEnd()`, `clutterGrow(kind)`, `leafCountScale()`, `disturbReach(out)` and so on; the contract's names are unchanged). Caches keyed on the spec become build-once caches. `placeClutter` keeps exactly True's draws (Classic's branches go), so **True's layout is unchanged**.

Tests: Classic's hash tests and the Classic and Hybrid camera presses are retired with Classic (spec 12). Mode loops become single real-size tests. Where a Classic scenario guarded behaviour that still exists, it is replaced at real size: a camera pull-in past both real trunks starts gently and never snaps (`solidProps`), the camera's distance never flickers sliding round the maple (`cameraClearance`), the log crossing both play edges stops a slide in the notch (`playEdge`), the bark keeps its base-size layout and the trunks stand tens of units tall (`scaledProps`). Two Classic-only tests are dropped without a replacement: the V-notch between Classic's overlapping trunks (no two real-size footprints overlap) and the trunk right behind the worm (at real size the 4.7 m and 11.9 m trunks never block the camera fully: its reach bottoms out at 0.68; `cameraPressTrue` still covers pressing and turning against every prop).

- [ ] **Step 1: Record True's layout before the change**

This proves the refactor changes nothing at real size. Create `tests/unit/zzLayoutProbe.test.ts` (temporary, never committed):

```ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { treeSites } from '../../src/surface/treeSites';
import { rocks, heroLog, placeClutter } from '../../src/surface/propPlacement';
import { footprints } from '../../src/surface/obstacles';
import { litterDepth } from '../../src/surface/litterDepth';
import { heightGrid } from '../../src/surface/terrainMesh';
import { buildGroundProps } from '../../src/surface/groundProps';
import { buildForestTrees } from '../../src/surface/forestTrees';
import { buildDistantTrees } from '../../src/surface/distantTrees';
import { buildLeafLitter } from '../../src/surface/leafLitterMesh';
import { buildDetailLeaves } from '../../src/surface/detailLeaves';
import { createHeroLeaves } from '../../src/surface/heroPool';
import { disturbReach, scaledLeafCount } from '../../src/surface/leafScale';

function geo(o: THREE.Object3D): string {
  const h = createHash('sha256');
  o.traverse((m) => {
    if (!(m instanceof THREE.Mesh)) return;
    for (const [k, a] of Object.entries(m.geometry.attributes)) { h.update(k); h.update(Buffer.from((a.array as Float32Array).buffer)); }
    if (m instanceof THREE.InstancedMesh) h.update(Buffer.from(m.instanceMatrix.array.buffer));
  });
  return h.digest('hex').slice(0, 16);
}
it('probe', () => {
  const d: number[] = [];
  for (let x = -20; x <= 20; x += 0.7) for (let z = -20; z <= 20; z += 0.7) d.push(litterDepth(x, z));
  const out = {
    trees: treeSites(), rocks: rocks(), log: heroLog(), clutter: createHash('sha256').update(JSON.stringify(placeClutter())).digest('hex').slice(0, 16),
    fp: Array.from(footprints().round), depth: createHash('sha256').update(JSON.stringify(d)).digest('hex').slice(0, 16),
    grid: createHash('sha256').update(Buffer.from(heightGrid().heights.buffer)).digest('hex').slice(0, 16),
    props: geo(buildGroundProps().mesh), trees3d: geo(buildForestTrees()), distant: geo(buildDistantTrees()),
    litter: geo(buildLeafLitter(scaledLeafCount(1000)).group), detail: geo(buildDetailLeaves().mesh),
    hero: Array.from(createHeroLeaves().size).slice(0, 8), reach: disturbReach(), count: scaledLeafCount(4000),
  };
  writeFileSync(process.env.PROBE_OUT ?? '.cache/probe.json', JSON.stringify(out, null, 1));
});
```

Run: `mkdir -p .cache && PROBE_OUT=.cache/probe-before.json npx vitest run tests/unit/zzLayoutProbe.test.ts`
Expected: 1 test passes and `.cache/probe-before.json` is written.

- [ ] **Step 2: Update the tests**

In `tests/e2e/disturbParity.spec.ts`:


Replace:

```ts
import { disturbReach } from '../../src/surface/leafScale';
import { SCALE_SPECS } from '../../src/surface/worldScale';

/**
 * disturb() on a real GPU for leaves of every size up to True's (the lid rule above LID_FROM) and
 * through each mode's window (uDistFade): the shipped GLSL in Chromium through transform feedback,
 * against its TS twin (disturbVertex).
```

with:

```ts
import { disturbReach } from '../../src/surface/leafScale';

/**
 * disturb() on a real GPU for leaves of every size up to real size (the lid rule above LID_FROM)
 * and through two windows (uDistFade): the shipped GLSL in Chromium through transform feedback,
 * against its TS twin (disturbVertex).
```


Replace:

```ts
/**
 * The mode's map around a worm at (x, z), partly under the litter, with an older trail 3.3 m to
 * its side (in Classic's fading window), and leaves of every radius over both.
 */
function makeCase(mode: 'classic' | 'true', x: number, z: number, yaw: number, curve: number, seed: number): Case {
  const r = disturbReach(SCALE_SPECS[mode]);
  const m = createDisturbance();
```

with:

```ts
/**
 * The map around a worm at (x, z), partly under the litter, with an older trail 3.3 m to its side,
 * and leaves of every radius over both. `narrow`: read through a narrower window than the game's
 * (fading out from 3.4 to 3.88 m, V1's Classic window), so the trail lies in its fade; the window
 * is a uniform, so any one works.
 */
function makeCase(narrow: boolean, x: number, z: number, yaw: number, curve: number, seed: number): Case {
  const r = { ...disturbReach(), ...(narrow ? { fadeFrom: 3.4, fadeTo: 3.88 } : {}) };
  const m = createDisturbance();
```


Replace:

```ts

test('disturb runs on the GPU as its TS twin says, for leaves up to True\'s size and in each mode\'s window', async ({ page }) => {
  const cases = [
    makeCase('classic', 0.3, -0.2, 0.7, 0.5, 11), makeCase('true', -4.1, 2.6, 2.2, -0.4, 12),
    makeCase('true', 7.3, -6.4, -1.1, 0.8, 13),
  ];
```

with:

```ts

test('disturb runs on the GPU as its TS twin says, for leaves up to real size and in a narrow and the full window', async ({ page }) => {
  const cases = [
    makeCase(true, 0.3, -0.2, 0.7, 0.5, 11), makeCase(false, -4.1, 2.6, 2.2, -0.4, 12),
    makeCase(false, 7.3, -6.4, -1.1, 0.8, 13),
  ];
```



In `tests/e2e/glslParity.spec.ts`:


Replace:

```ts
import { DISTURB_GLSL, FULL_FADE, disturbVertex, packedMapSampler } from '../../src/render/leafGlsl';
import { disturbReach } from '../../src/surface/leafScale';
import { SCALE_SPECS } from '../../src/surface/worldScale';
import { litterTextureData, LITTER_TEX_N } from '../../src/render/litterTexture';
```

with:

```ts
import { DISTURB_GLSL, FULL_FADE, disturbVertex, packedMapSampler } from '../../src/render/leafGlsl';
import { litterTextureData, LITTER_TEX_N } from '../../src/render/litterTexture';
```


Replace:

```ts

/** Classic's window (uDistFade), where leaves fade out from 3.4 to 3.88 m: some detail leaves lie in it. */
const CLASSIC = disturbReach(SCALE_SPECS.classic);
const CLASSIC_FADE = [CLASSIC.fadeFrom / (DIST_SPAN / 2), CLASSIC.fadeTo / (DIST_SPAN / 2)];

```

with:

```ts

/**
 * A narrower window (uDistFade) than the game's, where leaves fade out from 3.4 to 3.88 m (V1's
 * Classic window), so some detail leaves lie in its fade. The window is a uniform: any one works.
 */
const NARROW_FADE = [3.4 / (DIST_SPAN / 2), 3.88 / (DIST_SPAN / 2)];

```


Replace:

```ts
  const cases = [
    worm(0.31, -0.17, 0.7, 0.5, CLASSIC_FADE), worm(6.4, -3.3, 2.1, -0.4), worm(-6.9, -7.2, 4.0, 0.3, CLASSIC_FADE),
    worm(18.6, 17.9, 0.9, 0.2), worm(-18.8, 4.2, 3.3, -0.5, CLASSIC_FADE),
  ];
```

with:

```ts
  const cases = [
    worm(0.31, -0.17, 0.7, 0.5, NARROW_FADE), worm(6.4, -3.3, 2.1, -0.4), worm(-6.9, -7.2, 4.0, 0.3, NARROW_FADE),
    worm(18.6, 17.9, 0.9, 0.2), worm(-18.8, 4.2, 3.3, -0.5, NARROW_FADE),
  ];
```



In `tests/unit/cameraClearance.test.ts`:


Replace:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
import { Crawl, WORM_SEGMENTS } from '../../src/game/crawl';
import { CAM_OPTS } from '../../src/game/cameraClearance';
import type { WormPose } from '../../src/worm/wormMesh';
import { footprints, insideTall, pushOutTall } from '../../src/surface/obstacles';
```

with:

```ts
import { describe, it, expect } from 'vitest';
import { Crawl } from '../../src/game/crawl';
import { footprints, insideTall, pushOutTall } from '../../src/surface/obstacles';
```


Replace:

```ts
import { treeSites, trunkFootOf } from '../../src/surface/treeSites';
import { DEFAULT_SCALE, setScale } from '../../src/surface/worldScale';
import { DT, driveTo } from './cameraPress';

afterAll(() => { setScale(DEFAULT_SCALE); });

describe('classic: sliding round trunk 4 at a slant', () => {
  beforeAll(() => { setScale('classic'); });

```

with:

```ts
import { treeSites, trunkFootOf } from '../../src/surface/treeSites';
import { DT, driveTo } from './cameraPress';

describe('sliding round a trunk at a slant', () => {

```


Replace:

```ts
    };
    driveTo(c, round[16] + 0.3, round[17] - 0.3, 700, see);
    const move = { x: 1, y: 0 };
```

with:

```ts
    };
    driveTo(c, round[4] + 0.3, round[5] - 0.3, 900, see);
    const move = { x: 1, y: 0 };
```


Replace:

```ts
describe('pushOutTall', () => {
  beforeAll(() => { setScale('classic'); });

```

with:

```ts
describe('pushOutTall', () => {

```


Replace:

```ts
});

describe('classic: a trunk right behind the worm', () => {
  beforeAll(() => { setScale('classic'); });

  it('the camera cranes up and looks down at the worm, its head and front half in frame', () => {
    // Pressed into trunk 12, then turned on the spot until the trunk is right behind the head:
    // no room behind at all (reach 0).
    const { round } = footprints();
    const c = new Crawl();
    driveTo(c, round[48], round[49], 700, () => {});
    for (let s = 0; s < 120; s++) c.step(DT, { x: 1, y: 0 });
    expect(c.cameraReach).toBeLessThan(0.01);
    const h = c.motion.head;
    expect(c.cam.pos.y - h.y).toBeGreaterThanOrEqual(CAM_OPTS.height);
    // What the player sees, on the classroom's 1366 x 768 screen.
    const camera = new THREE.PerspectiveCamera(60, 1366 / 768, 0.2, 120);
    const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
    c.interpolate(1, 0, pose, camera);
    camera.updateMatrixWorld();
    const v = new THREE.Vector3();
    for (let i = 0; i < WORM_SEGMENTS / 2; i++) {
      v.fromArray(pose.spine, i * 3).project(camera);
      expect(Math.abs(v.x)).toBeLessThan(1);
      expect(Math.abs(v.y)).toBeLessThan(1);
      expect(Math.abs(v.z)).toBeLessThan(1);
    }
  });
});
```

with:

```ts
});
```



In `tests/unit/cameraPress.ts`:


Replace:

```ts
/**
 * In the active mode: drives into every prop (straight, and off-centre by 0.3 and 0.6 either
 * way), presses into it, then holds only left or right (`turn`: 1 or -1), so the worm turns where
```

with:

```ts
/**
 * Drives into every prop (straight, and off-centre by 0.3 and 0.6 either
 * way), presses into it, then holds only left or right (`turn`: 1 or -1), so the worm turns where
```



Delete `tests/unit/cameraPressClassicLeft.test.ts` (`git rm tests/unit/cameraPressClassicLeft.test.ts`).

Delete `tests/unit/cameraPressClassicRight.test.ts` (`git rm tests/unit/cameraPressClassicRight.test.ts`).

Delete `tests/unit/cameraPressHybrid.test.ts` (`git rm tests/unit/cameraPressHybrid.test.ts`).

In `tests/unit/cameraPressTrue.test.ts`:


Replace:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DEFAULT_SCALE, setScale } from '../../src/surface/worldScale';
import { pressAndTurn } from './cameraPress';

afterAll(() => { setScale(DEFAULT_SCALE); });

describe('true: the camera never snaps or shakes against a prop', () => {
  beforeAll(() => { setScale('true'); });

  it('pressing into every prop (straight or off-centre), then turning on the spot either way', () => {
    // A hard turn alone changes the camera's step by about 0.004; easing in past a trunk, a few
    // hundredths. Snapping along its line to the head reached 0.2 in this mode.
    for (const turn of [1, -1]) {
```

with:

```ts
import { describe, it, expect } from 'vitest';
import { pressAndTurn } from './cameraPress';

describe('the camera never snaps or shakes against a prop', () => {
  it('pressing into every prop (straight or off-centre), then turning on the spot either way', () => {
    // A hard turn alone changes the camera's step by about 0.004; easing in past a trunk, a few
    // hundredths. Snapping along its line to the head reached 0.2 at real size.
    for (const turn of [1, -1]) {
```



In `tests/unit/detailLeaves.test.ts`:


Replace:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { buildDetailLeaves, buildDetailLayer } from '../../src/surface/detailLeaves';
import { DETAIL_BOX, DETAIL_FADE_OUT } from '../../src/render/detailGlsl';
import { PRESETS } from '../../src/render/graphics';
import { DEFAULT_SCALE, setScale } from '../../src/surface/worldScale';

// Classic's detail leaf sizes (the other modes scale them: tests/unit/leafGlsl.test.ts).
// (Set at load: some describe blocks build meshes as they are collected.)
setScale('classic');
afterAll(() => { setScale(DEFAULT_SCALE); });

```

with:

```ts
import { describe, it, expect } from 'vitest';
import { buildDetailLeaves, buildDetailLayer } from '../../src/surface/detailLeaves';
import { DETAIL_BOX, DETAIL_FADE_OUT } from '../../src/render/detailGlsl';
import { PRESETS } from '../../src/render/graphics';
import { scaledLeafCount } from '../../src/surface/leafScale';

```


Replace:

```ts
      // The leaf's radius (m): well under the litter's leaves (0.21 to 0.39 of a species' size,
      // against the litter's 0.6 to 1.2), as a leaf's cost is its area on screen.
      expect(a[k + 3]).toBeGreaterThan(0.1);
      expect(a[k + 3]).toBeLessThan(0.42);
    }
```

with:

```ts
      // The leaf's radius (m): well under the litter's leaves (0.21 to 0.39 of a species' size,
      // against the litter's 0.6 to 1.2), as a leaf's cost is its area on screen. At real size
      // that is 0.16 to 0.76 (base size: 0.11 to 0.385, times 1.43 to 2.43).
      expect(a[k + 3]).toBeGreaterThan(0.15);
      expect(a[k + 3]).toBeLessThan(0.94);
    }
```


Replace:

```ts

  it('covers the 6 m fade circle with its 13 m tile, and Ultra builds 2,500', () => {
    // A leaf jumps a tile only past half a box from the wrap centre, which sits up to half a metre
    // (per axis) from the head: there it must already be gone.
    expect(DETAIL_BOX / 2).toBeGreaterThanOrEqual(DETAIL_FADE_OUT + 0.5);
    expect(buildDetailLeaves().max).toBe(PRESETS.ultra.detail);
  });
```

with:

```ts

  it('covers the 6 m fade circle with its 13 m tile, and Ultra builds its real-size count', () => {
    // A leaf jumps a tile only past half a box from the wrap centre, which sits up to half a metre
    // (per axis) from the head: there it must already be gone.
    expect(DETAIL_BOX / 2).toBeGreaterThanOrEqual(DETAIL_FADE_OUT + 0.5);
    expect(buildDetailLeaves().max).toBe(scaledLeafCount(PRESETS.ultra.detail));
  });
```



Replace the whole of `tests/unit/disturbReach.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { disturbVertex, packedMapSampler, DRAPE_FOOT, type MapSampler } from '../../src/render/leafGlsl';
import {
  createDisturbance, recentre, stamp, stampBody, packDisturbance, DIST_N, DIST_CELL, DIST_REACH, DIST_SPAN,
  type DisturbanceMap,
} from '../../src/surface/disturbance';
import { disturbReach, leafReach, maxLeafRadius } from '../../src/surface/leafScale';
import type { Vec3 } from '../../src/core/vec';

/** The 12 m map is stamped only as far as the real-size leaves need (Step 1b spec 4.3). */

/** 16 body points 0.22 apart, head at (x, z), heading `yaw` (0: along +z), bending by `curve`. */
function body(x: number, z: number, yaw: number, curve = 0): Vec3[] {
  const pts: Vec3[] = [];
  let a = yaw;
  let px = x;
  let pz = z;
  for (let i = 0; i < 16; i++) {
    pts.push({ x: px, y: 0, z: pz });
    px -= Math.sin(a) * 0.22;
    pz -= Math.cos(a) * 0.22;
    a += curve * 0.22;
  }
  return pts;
}

interface Map { sample: MapSampler; ox: number; oz: number }

function packed(m: DisturbanceMap): Map {
  const near = new Uint8Array(DIST_N * DIST_N * 4);
  const trail = new Uint8Array(DIST_N * DIST_N * 2);
  packDisturbance(m, near, trail);
  return { sample: packedMapSampler(near, trail), ox: m.ci * DIST_CELL, oz: m.cj * DIST_CELL };
}

function stamped(b: Vec3[], under: ArrayLike<number>, limit = DIST_REACH, onTop?: number): DisturbanceMap {
  const m = createDisturbance();
  recentre(m, b[7].x, b[7].z);
  stampBody(m, b, under, limit, onTop);
  return m;
}

const out = [0, 0, 0];
/** How high a leaf of radius r centred at (ax, az) lifts: the highest of 48 points across it. */
function lift(map: Map, ax: number, az: number, r: number): number {
  let y = 0;
  for (let a = 0; a < 16; a++) {
    const th = (a / 16) * Math.PI * 2;
    for (const f of [0, 0.5, 1]) {
      const p = [ax + Math.cos(th) * r * f, 0, az + Math.sin(th) * r * f];
      disturbVertex(map.sample, map.ox, map.oz, true, p, [ax, az, r, 0.006], 0, out);
      y = Math.max(y, out[1]);
    }
  }
  return y;
}

describe('the reach on the disturbance map', () => {
  it('reaches past the biggest leaf plus the drape, inside the unfaded window', () => {
    const r = disturbReach();
    expect(leafReach()).toBeCloseTo(maxLeafRadius() + DRAPE_FOOT, 9);
    // Every lookup a reacting leaf takes (bilinear, at one-cell gradient taps) is stamped, or
    // lies past the map's reach, where even the full map is empty.
    expect(Math.min(DIST_REACH, leafReach() + DIST_CELL * (1 + Math.SQRT2))).toBeLessThanOrEqual(r.stamp + 1e-9);
    expect(r.stamp).toBeLessThanOrEqual(DIST_REACH);
    // The map centres 7 segments (1.54 m) behind the head: a leaf reacting to the head sits inside
    // the unfaded window, and the window inside the map.
    expect(7 * 0.22 + leafReach()).toBeLessThan(r.fadeFrom);
    expect(r.fadeFrom).toBeLessThan(r.fadeTo);
    expect(r.fadeTo).toBeCloseTo(0.97 * DIST_SPAN / 2, 9);
  });

  it('a body riding on top reaches only 0.2 m past the biggest leaf', () => {
    const r = disturbReach();
    expect(leafReach() - r.onTop).toBeCloseTo(0.2, 9);
    const m = createDisturbance();
    recentre(m, 0, 0);
    stamp(m, 0.0625, 0.0625, 0, r.stamp, r.onTop);
    for (let i = 0; i < 6; i++) {
      // Cell centres i cells from the stamp: a leaf reacts within 0.2 m and not past it.
      const k = ((DIST_N / 2) * DIST_N + DIST_N / 2 + i) * 4;
      const read = (1 - m.data[k + 2]) * DIST_REACH;
      if (i * DIST_CELL < 0.2) expect(read).toBeLessThan(leafReach());
      else expect(read).toBeGreaterThan(leafReach());
    }
  });

  it('every leaf that can react reads what the full map holds', () => {
    const r = disturbReach();
    const reach = leafReach();
    const big = maxLeafRadius();
    let checked = 0;
    for (const [bx, yaw, curve, u] of [[0, 0, 0, 1], [0.07, 0.3, 0, 1], [0.04, 2.1, 0.6, 1], [0.09, -0.8, -0.4, 0.75], [0.02, 1.1, 0.2, 0]]) {
      const under = Float32Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? u : 1));
      const b = body(bx, 0.05, yaw, curve);
      const full = packed(stamped(b, under, DIST_REACH, r.onTop));
      const part = packed(stamped(b, under, r.stamp, r.onTop));
      const s0 = [0, 0, 0, 0];
      const s1 = [0, 0, 0, 0];
      for (let x = -5; x <= 5; x += 0.037) {
        for (let z = -6; z <= 4; z += 0.041) {
          const u0 = (x - full.ox) / DIST_SPAN;
          const v0 = (z - full.oz) / DIST_SPAN;
          // Only a leaf the full map puts within the reach (path or body) can react.
          full.sample(u0, v0, s0);
          if (Math.min(1 - s0[0], 1 - s0[2]) * DIST_REACH >= reach) continue;
          for (const [du, dv] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
            full.sample(u0 + du / DIST_N, v0 + dv / DIST_N, s0);
            part.sample(u0 + du / DIST_N, v0 + dv / DIST_N, s1);
            // Path and body, as distances: within a mm.
            expect(Math.abs(s1[0] - s0[0]) * DIST_REACH).toBeLessThan(0.001);
            expect(Math.abs(s1[2] - s0[2]) * DIST_REACH).toBeLessThan(0.001);
            expect(Math.abs(s1[3] - s0[3])).toBeLessThan(0.004);
          }
          if (checked++ % 7 === 0) {
            expect(Math.abs(lift(part, x, z, big) - lift(full, x, z, big))).toBeLessThan(0.001);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(2000);
  }, 120000);
});
```

In `tests/unit/disturbance.test.ts`:


Replace:

```ts
import { DRAPE_FOOT } from '../../src/render/leafGlsl';
import { SCALE_MODES, SCALE_SPECS } from '../../src/surface/worldScale';

```

with:

```ts
import { DRAPE_FOOT } from '../../src/render/leafGlsl';

```


Replace:

```ts
    expect(DIST_REACH).toBeGreaterThan(ON_TOP_DISTANCE);
    // The map centres 7 segments (1.54 m) behind the head; a True leaf whose edge reaches the
    // drape's foot from the head must sit inside the leaf shader's widest edge fade (85% of the half span).
    expect(7 * 0.22 + maxLeafRadius(SCALE_SPECS.true) + DRAPE_FOOT).toBeLessThan(0.85 * DIST_SPAN / 2);
    for (const mode of SCALE_MODES) expect(stampLimit(SCALE_SPECS[mode])).toBeLessThanOrEqual(DIST_REACH);
    // The whole map's default: a body riding on top reaches 0.2 m (each mode's own: disturbReach.test.ts).
    expect(DIST_REACH - ON_TOP_DISTANCE).toBeCloseTo(0.2, 9);
    // Classic's leaves react exactly as far as before the map grew.
    expect(leafReach(SCALE_SPECS.classic)).toBeCloseTo(1.6, 9);
    expect(leafReach(SCALE_SPECS.classic) - maxLeafRadius(SCALE_SPECS.classic)).toBeCloseTo(DRAPE_FOOT, 9);
  });
```

with:

```ts
    expect(DIST_REACH).toBeGreaterThan(ON_TOP_DISTANCE);
    // The map centres 7 segments (1.54 m) behind the head; a leaf whose edge reaches the drape's
    // foot from the head must sit inside the leaf shader's widest edge fade (85% of the half span).
    expect(7 * 0.22 + maxLeafRadius() + DRAPE_FOOT).toBeLessThan(0.85 * DIST_SPAN / 2);
    expect(stampLimit()).toBeLessThanOrEqual(DIST_REACH);
    // The whole map's default: a body riding on top reaches 0.2 m (the real reach's own: disturbReach.test.ts).
    expect(DIST_REACH - ON_TOP_DISTANCE).toBeCloseTo(0.2, 9);
    expect(leafReach() - maxLeafRadius()).toBeCloseTo(DRAPE_FOOT, 9);
  });
```



In `tests/unit/heroLeafClearance.test.ts`:


Replace:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
```

with:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
```


Replace:

```ts
import { mulberry32 } from '../../src/core/random';
import { DEFAULT_SCALE, SCALE_MODES, setScale } from '../../src/surface/worldScale';

```

with:

```ts
import { mulberry32 } from '../../src/core/random';

```


Replace:

```ts

describe.each(SCALE_MODES)('%s: hero leaves never clip the worm', (mode) => {
  beforeAll(() => { setScale(mode); });
  afterAll(() => { setScale(DEFAULT_SCALE); });

```

with:

```ts

describe('hero leaves never clip the worm', () => {

```


Replace:

```ts
    // ...and a leaf held over the worm rests near it rather than floating high above: the bounds
    // are conservative, so the typical least gap is several cm (measured 0.10 m median in Classic
    // and Hybrid, 0.105 m in True).
    const g = stats.gaps.sort((a, b) => a - b);
```

with:

```ts
    // ...and a leaf held over the worm rests near it rather than floating high above: the bounds
    // are conservative, so the typical least gap is several cm (measured 0.105 m median at real
    // size).
    const g = stats.gaps.sort((a, b) => a - b);
```



In `tests/unit/heroLeaves.test.ts`:


Replace:

```ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import {
```

with:

```ts
import { describe, it, expect } from 'vitest';
import {
```


Replace:

```ts
import { PLAY_HALF } from '../../src/surface/terrain';
import { DEFAULT_SCALE, SCALE_MODES, setScale } from '../../src/surface/worldScale';
import { obstacleDepth, footprints } from '../../src/surface/obstacles';
```

with:

```ts
import { PLAY_HALF } from '../../src/surface/terrain';
import { obstacleDepth, footprints } from '../../src/surface/obstacles';
```


Replace:

```ts

afterAll(() => { setScale(DEFAULT_SCALE); });

```

with:

```ts


```


Replace:

```ts

describe.each(SCALE_MODES)('%s: hero leaves', (mode) => {
  beforeAll(() => { setScale(mode); });
  afterAll(() => { setScale(DEFAULT_SCALE); });

```

with:

```ts

describe('hero leaves', () => {

```


Replace:

```ts

  // A head position at least 1 m from every footprint (in Hybrid a big rock comes within 0.6 m of (-10, 0)).
  const open = mode === 'hybrid' ? { x: -6, z: 0 } : { x: -10, z: 0 };

```

with:

```ts

  // A head position at least 1 m from every footprint.
  const open = { x: -10, z: 0 };

```


Replace:

```ts

describe.each(['hybrid', 'true'] as const)('%s: hero leaves beside the big props', (mode) => {
  beforeAll(() => { setScale(mode); });
  afterAll(() => { setScale(DEFAULT_SCALE); });

```

with:

```ts

describe('hero leaves beside the big props', () => {

```



In `tests/unit/heroObstacles.test.ts`:


Replace:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WEDGE_TIME } from '../../src/surface/heroObstacles';
```

with:

```ts
import { describe, it, expect } from 'vitest';
import { WEDGE_TIME } from '../../src/surface/heroObstacles';
```


Replace:

```ts
import { heroLog, rocks } from '../../src/surface/propPlacement';
import { DEFAULT_SCALE, SCALE_MODES, setScale } from '../../src/surface/worldScale';
import { PLAY_HALF } from '../../src/surface/terrain';
```

with:

```ts
import { heroLog, rocks } from '../../src/surface/propPlacement';
import { PLAY_HALF } from '../../src/surface/terrain';
```


Replace:

```ts

afterAll(() => { setScale(DEFAULT_SCALE); });

describe.each(SCALE_MODES)('%s: hero leaves and trunks, rocks and the log', (mode) => {
  beforeAll(() => { setScale(mode); });
  const tree = () => treeSites()[0];
```

with:

```ts


describe('hero leaves and trunks, rocks and the log', () => {
  const tree = () => treeSites()[0];
```


Replace:

```ts
    }
    // Every recycled leaf at every site was checked (Classic 768, Hybrid 416, True 320).
    expect(checked).toBe(sites.length * HERO_MAX);
```

with:

```ts
    }
    // Every recycled leaf at every site was checked (320 at real size).
    expect(checked).toBe(sites.length * HERO_MAX);
```



In `tests/unit/heroShortcuts.test.ts`:


Replace:

```ts
import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { Crawl } from '../../src/game/crawl';
```

with:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { Crawl } from '../../src/game/crawl';
```


Replace:

```ts
import { mulberry32 } from '../../src/core/random';
import { DEFAULT_SCALE, SCALE_MODES, setScale } from '../../src/surface/worldScale';

```

with:

```ts
import { mulberry32 } from '../../src/core/random';

```


Replace:

```ts

describe.each(SCALE_MODES)('%s: hero leaf shortcuts (sleeping far leaves, skipped strips)', (mode) => {
  beforeAll(() => { setScale(mode); });
  afterAll(() => { setScale(DEFAULT_SCALE); });
  afterEach(() => { heroShortcuts.on = true; });
```

with:

```ts

describe('hero leaf shortcuts (sleeping far leaves, skipped strips)', () => {
  afterEach(() => { heroShortcuts.on = true; });
```



In `tests/unit/leafGlsl.test.ts`:


Replace:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
```

with:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
```


Replace:

```ts
import { PRESETS } from '../../src/render/graphics';
import { DEFAULT_SCALE, SCALE_MODES, SCALE_SPECS, setScale } from '../../src/surface/worldScale';
import { leafReach, maxLeafRadius, onTopDistance, scaledLeafCount, stampLimit } from '../../src/surface/leafScale';
```

with:

```ts
import { PRESETS } from '../../src/render/graphics';
import { REAL_SCALE } from '../../src/surface/realScale';
import { leafReach, maxLeafRadius, onTopDistance, scaledLeafCount, stampLimit } from '../../src/surface/leafScale';
```


Replace:

```ts

describe.each(SCALE_MODES)('%s: the drape on the real litter and the real worm', (mode) => {
  beforeAll(() => { setScale(mode); });
  afterAll(() => { setScale(DEFAULT_SCALE); });

```

with:

```ts

describe('the drape on the real litter and the real worm', () => {

```


Replace:

```ts
    const detail = buildDetailLeaves(count);
    // A detail leaf's radius is at most 0.385 m in Classic, times the mode's biggest leaf size.
    const reach = 0.9 + 0.39 * Math.max(...Object.values(SCALE_SPECS[mode].leaf));
    const g = detail.mesh.geometry;
```

with:

```ts
    const detail = buildDetailLeaves(count);
    // A detail leaf's radius is at most 0.385 m at base size, times the biggest real-size growth.
    const reach = 0.9 + 0.39 * Math.max(...Object.values(REAL_SCALE.leaf));
    const g = detail.mesh.geometry;
```


Replace:

```ts

describe.each(SCALE_MODES)('%s: litter leaf anchors', (mode) => {
  beforeAll(() => { setScale(mode); });
  afterAll(() => { setScale(DEFAULT_SCALE); });

```

with:

```ts

describe('litter leaf anchors', () => {

```



In `tests/unit/leafJitter.test.ts`:


Replace:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
```

with:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
```


Replace:

```ts
import { mulberry32 } from '../../src/core/random';
import { DEFAULT_SCALE, setScale, type ScaleMode } from '../../src/surface/worldScale';
import { scaledLeafCount } from '../../src/surface/leafScale';
```

with:

```ts
import { mulberry32 } from '../../src/core/random';
import { scaledLeafCount } from '../../src/surface/leafScale';
```


Replace:

```ts

// Part 0 measured Classic; Part A re-measures at True's leaf sizes against the same thresholds.
describe.each(['classic', 'true'] as ScaleMode[])('%s: leaves over the crawling worm move smoothly (measured frame to frame)', (mode) => {
  beforeAll(() => { setScale(mode); });
  afterAll(() => { setScale(DEFAULT_SCALE); });

```

with:

```ts

// Part 0 measured Step 1a's small leaves; V1 re-measured at real leaf sizes against the same thresholds.
describe('leaves over the crawling worm move smoothly (measured frame to frame)', () => {

```


Replace:

```ts
      const dip = g.getAttribute('aDip');
      // Every third vertex; True has a quarter as many (bigger) leaves, so every vertex there.
      for (let v = 0; v < pos.count; v += mode === 'classic' ? 3 : 1) {
        P.push(pos.getX(v) + ch.near.position.x, pos.getY(v) + ch.near.position.y, pos.getZ(v) + ch.near.position.z);
```

with:

```ts
      const dip = g.getAttribute('aDip');
      // Every vertex: real-size leaves are big and few.
      for (let v = 0; v < pos.count; v++) {
        P.push(pos.getX(v) + ch.near.position.x, pos.getY(v) + ch.near.position.y, pos.getZ(v) + ch.near.position.z);
```


Replace:

```ts
    const v = new THREE.Vector3();
    // The leaves the mode shows at Ultra (the most of any preset): Classic's 32; True's bigger
    // leaves are fewer (scaledLeafCount: 8), so it crawls three times as long for a like sample.
    // True measured 2.1 to 2.2% and a p99 of 4.2 to 4.5 mm over seven frame-timing seeds.
    const heroes = scaledLeafCount(PRESETS.ultra.hero);
    const seconds = mode === 'classic' ? 15 : 45;
    // Three points on each leaf (its centre and two near its tip), per frame.
```

with:

```ts
    const v = new THREE.Vector3();
    // The leaves Ultra shows (the most of any preset): real-size leaves are few (scaledLeafCount:
    // 8), so it crawls 45 s for a like sample. V1 measured 2.1 to 2.2% and a p99 of 4.2 to 4.5 mm
    // over seven frame-timing seeds.
    const heroes = scaledLeafCount(PRESETS.ultra.hero);
    const seconds = 45;
    // Three points on each leaf (its centre and two near its tip), per frame.
```



In `tests/unit/litterPlacement.test.ts`:


Replace:

```ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { placeLeaves, wetnessLayer } from '../../src/surface/leafLitter';
```

with:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { placeLeaves, wetnessLayer } from '../../src/surface/leafLitter';
```


Replace:

```ts
import { clutterGrow } from '../../src/surface/propPlacement';
import { DEFAULT_SCALE, SCALE_MODES, setScale } from '../../src/surface/worldScale';

afterAll(() => { setScale(DEFAULT_SCALE); });

```

with:

```ts
import { clutterGrow } from '../../src/surface/propPlacement';


```


Replace:

```ts

describe.each(SCALE_MODES)('%s: litter on the rendered ground', (mode) => {
  let litter: LeafLitter;
  beforeAll(() => {
    setScale(mode);
    litter = buildLeafLitter(scaledLeafCount(PRESETS.ultra.litter));
```

with:

```ts

describe('litter on the rendered ground', () => {
  let litter: LeafLitter;
  beforeAll(() => {
    litter = buildLeafLitter(scaledLeafCount(PRESETS.ultra.litter));
```


Replace:

```ts
  it('some clutter really stands where the mound is deep enough to bury it', () => {
    setScale('classic');
    const items = placeClutter(150);
```

with:

```ts
  it('some clutter really stands where the mound is deep enough to bury it', () => {
    const items = placeClutter(150);
```


Replace:

```ts

  it.each(SCALE_MODES)('%s: sets every item on the rendered ground: its base is never below the mesh surface', (mode) => {
    setScale(mode);
    for (const c of placeClutter(150)) {
```

with:

```ts

  it('sets every item on the rendered ground: its base is never below the mesh surface', () => {
    for (const c of placeClutter(150)) {
```


Replace:

```ts
        // Each mushroom stands on the ground under it; across a cluster the mound slopes a little
        // (the cluster spreads with the mode's mushroom size).
        expect(low).toBeGreaterThanOrEqual(floor - 0.06 * clutterGrow('mushrooms'));
```

with:

```ts
        // Each mushroom stands on the ground under it; across a cluster the mound slopes a little
        // (the cluster spreads with the mushroom size).
        expect(low).toBeGreaterThanOrEqual(floor - 0.06 * clutterGrow('mushrooms'));
```



In `tests/unit/nearClutter.test.ts`:


Replace:

```ts
import { HeroWorm, type WormPose } from '../../src/worm/wormMesh';
import { DEFAULT_SCALE, SCALE_MODES, setScale } from '../../src/surface/worldScale';

```

with:

```ts
import { HeroWorm, type WormPose } from '../../src/worm/wormMesh';

```


Replace:

```ts

  it.each(SCALE_MODES)('%s: keeps clear of the real worm over seeded crawls (the sedge never pokes through the body)', (mode) => {
    setScale(mode);
    inp.litter = litterTextureData();
    inp.ground = groundTextureData();
    try {
      keepsClear();
    } finally {
      setScale(DEFAULT_SCALE);
      inp.litter = litterTextureData();
      inp.ground = groundTextureData();
    }
  });

  /** Seeded crawls in the active mode: no near-clutter vertex comes within CLEAR of the spine. */
  function keepsClear(): void {
```

with:

```ts

  it('keeps clear of the real worm over seeded crawls (the sedge never pokes through the body)', () => {
    keepsClear();
  });

  /** Seeded crawls: no near-clutter vertex comes within CLEAR of the spine. */
  function keepsClear(): void {
```



Replace the whole of `tests/unit/playEdge.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { Crawl, BODY_RADIUS } from '../../src/game/crawl';
import { footprints, obstacleDepth } from '../../src/surface/obstacles';
import { PLAY_HALF } from '../../src/surface/terrain';
import { LOCOMOTION } from '../../src/game/drive';

const DT = 1 / 60;
const hit = { nx: 0, nz: 0 };
const wrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

/** Steers toward (tx, tz) for `steps` steps; `each` sees the crawl after every step. */
function driveTo(c: Crawl, tx: number, tz: number, steps: number, each: (c: Crawl) => void = () => {}): void {
  const move = { x: 0, y: 1 };
  for (let s = 0; s < steps; s++) {
    const h = c.motion.head;
    const err = wrap(Math.atan2(tx - h.x, tz - h.z) - c.motion.heading);
    move.x = Math.max(-1, Math.min(1, -err * 3));
    c.step(DT, move);
    each(c);
  }
}

/**
 * The fallen log runs across the world and out past both play edges. A slide along its side into
 * the edge must stop in the notch where the two meet: the play edges are fixed edges for the slide
 * (obstacles.ts slideMove), so the head never leaves the play area or speeds up.
 */
describe('where the fallen log crosses the play edge', () => {
  it('the log does cross both play edges (the case is real)', () => {
    const { log } = footprints();
    expect(Math.abs(log.dz)).toBeLessThan(1e-9);
    expect(log.x - log.half).toBeLessThan(-PLAY_HALF);
    expect(log.x + log.half).toBeGreaterThan(PLAY_HALF);
  });

  it('a worm crawling along the log into the edge never leaves the play area, speeds up or enters the log', () => {
    for (const side of [1, -1]) {
      const c = new Crawl();
      const { log } = footprints();
      // Up to the log's near side, then along it into the edge (and on, pressing into the corner).
      const beside = log.z - log.r - BODY_RADIUS - 0.4;
      driveTo(c, side * 12, beside, 900);
      let last = { x: c.motion.head.x, z: c.motion.head.z };
      let fastest = 0;
      driveTo(c, side * 25, log.z, 900, (cc) => {
        const h = cc.motion.head;
        expect(Math.abs(h.x)).toBeLessThanOrEqual(PLAY_HALF + 1e-9);
        expect(Math.abs(h.z)).toBeLessThanOrEqual(PLAY_HALF + 1e-9);
        expect(obstacleDepth(h.x, h.z, BODY_RADIUS, hit)).toBeLessThanOrEqual(1e-6);
        fastest = Math.max(fastest, Math.hypot(h.x - last.x, h.z - last.z));
        last = { x: h.x, z: h.z };
      });
      expect(fastest).toBeLessThanOrEqual(LOCOMOTION.speed * DT * (1 + 1e-9));
      // It ends in the notch: at the edge, against the log's side.
      const h = c.motion.head;
      expect(Math.abs(h.x)).toBeCloseTo(PLAY_HALF, 2);
      expect(log.z - h.z - log.r - BODY_RADIUS).toBeLessThan(0.01);
    }
  }, 60_000);
});
```

Replace the whole of `tests/unit/propPlacement.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import {
  placeClutter, keepsClear, heroLog, rocks, CLUTTER_KINDS, logSegmentDistance, clutterRadius, clutterBase,
  clutterBaseClear,
} from '../../src/surface/propPlacement';
import { treeSites, trunkFootOf } from '../../src/surface/treeSites';
import { obstacleDepth, footprints, LOG_FOOT, ROCK_FOOT } from '../../src/surface/obstacles';
import { CORRIDOR } from '../../src/surface/wormPaths';
import { stepWorm, type WormMotion } from '../../src/worm/locomotion';
import { PLAY_HALF, WORLD_HALF } from '../../src/surface/terrain';
import { AUTO_DRIVE_MOVE, LOCOMOTION } from '../../src/game/drive';
import { REAL_SCALE } from '../../src/surface/realScale';

/** The speed test's auto-drive: the exact move and locomotion options the game uses. */
function autoDrivePath(seconds: number): { x: number; z: number }[] {
  let m: WormMotion = { head: { x: 0, y: 0, z: 0 }, heading: 0 };
  const out = [];
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    m = stepWorm(m, AUTO_DRIVE_MOVE.move, dt, LOCOMOTION);
    out.push({ x: m.head.x, z: m.head.z });
  }
  return out;
}

const path = autoDrivePath(30);
/** Worm half-width plus slack, and the trailing camera (2.6 back, 1.1 up). */
const PATH_CLEARANCE = 1.0;
const hit = { nx: 0, nz: 0 };

function minDistToPath(x: number, z: number): number {
  return Math.min(...path.map((p) => Math.hypot(p.x - x, p.z - z)));
}

/** How many mushroom clusters grow beside the log: they are wide, so only two of four fit apart. */
const BY_LOG = 2;

describe('real-size layout', () => {

  it('keepsClear rejects the spawn point, the auto-drive loop and tree trunks', () => {
    expect(keepsClear(0, 0, 0.1)).toBe(false);
    expect(keepsClear(0, 5, 0.1)).toBe(false);
    for (const p of path.filter((_, i) => i % 30 === 0)) expect(keepsClear(p.x, p.z, 0.1)).toBe(false);
    for (const t of treeSites()) expect(keepsClear(t.x, t.z, 0.1)).toBe(false);
    expect(keepsClear(PLAY_HALF + 0.5, 0, 0.1)).toBe(false);
  });

  it('keeps every solid footprint off the speed test\'s loop, with room for the body and camera', () => {
    for (const p of path) expect(obstacleDepth(p.x, p.z, PATH_CLEARANCE, hit)).toBeLessThanOrEqual(0);
  });

  it('keeps the spawn and the camera behind it clear', () => {
    expect(obstacleDepth(0, 0, 3, hit)).toBeLessThanOrEqual(0);
    expect(obstacleDepth(0, -2.6, 1, hit)).toBeLessThanOrEqual(0);
  });

  it('keeps the fallen log clear of the worm paths and the trunks', () => {
    const log = heroLog();
    for (const p of path) expect(logSegmentDistance(p.x, p.z)).toBeGreaterThan(log.radius * LOG_FOOT + PATH_CLEARANCE + 1);
    // Straight-ahead spawn corridor (+z) stays open.
    for (let z = -2; z <= 7; z += 0.5) expect(logSegmentDistance(0, z)).toBeGreaterThan(log.radius * LOG_FOOT + 1.2);
    for (const t of treeSites()) expect(logSegmentDistance(t.x, t.z)).toBeGreaterThan(log.radius * LOG_FOOT + trunkFootOf(t));
  });

  it('places rocks clear of everything and of each other', () => {
    const log = heroLog();
    const rs = rocks();
    for (const r of rs) {
      const foot = r.size * ROCK_FOOT;
      expect(keepsClear(r.x, r.z, foot)).toBe(true);
      expect(minDistToPath(r.x, r.z)).toBeGreaterThan(foot + PATH_CLEARANCE);
      expect(logSegmentDistance(r.x, r.z)).toBeGreaterThan(foot + log.radius * LOG_FOOT);
    }
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        expect(Math.hypot(rs[i].x - rs[j].x, rs[i].z - rs[j].z)).toBeGreaterThan((rs[i].size + rs[j].size) * ROCK_FOOT);
      }
    }
  });

  it('places the clutter clear of the worm paths, trunks, the log and rocks', () => {
    const items = placeClutter();
    expect(items).toHaveLength(REAL_SCALE.clutter);
    const log = heroLog();
    for (const c of items) {
      expect(CLUTTER_KINDS).toContain(c.kind);
      expect(Number.isFinite(c.x) && Number.isFinite(c.z) && Number.isFinite(c.rot)).toBe(true);
      if (items.indexOf(c) < BY_LOG) continue; // the mushrooms by the log, checked below
      const r = clutterRadius(c.kind, c.scale);
      expect(keepsClear(c.x, c.z, r)).toBe(true);
      expect(minDistToPath(c.x, c.z)).toBeGreaterThan(PATH_CLEARANCE);
      expect(logSegmentDistance(c.x, c.z)).toBeGreaterThan(log.radius);
      for (const k of rocks()) expect(Math.hypot(c.x - k.x, c.z - k.z)).toBeGreaterThan(k.size);
    }
    // Mushrooms grow right beside the log (the whole cluster stands just off the drawn log, and
    // only as many as fit apart: the rest are skipped).
    const mushroom = REAL_SCALE.mushroom;
    expect(items.slice(0, BY_LOG).every((c) => c.kind === 'mushrooms'
      && logSegmentDistance(c.x, c.z) > log.radius
      && logSegmentDistance(c.x, c.z) < log.radius * LOG_FOOT + clutterBase(c.kind, c.scale) + 0.6 * mushroom + 1e-9)).toBe(true);
    const byLog = items.slice(0, BY_LOG);
    for (const a of byLog) {
      for (const b of byLog) {
        if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(clutterBase(a.kind, a.scale) + clutterBase(b.kind, b.scale));
      }
    }
    for (const k of CLUTTER_KINDS) expect(items.some((c) => c.kind === k)).toBe(true);
  });

  it('has as many footprints as trunks and rocks', () => {
    expect(footprints().round.length).toBe((treeSites().length + rocks().length) * 4);
  });
});

describe('clutter: fronds may lean over a prop, the base may not', () => {
  it('every clutter item\'s base stays off the drawn rocks and log, inside the world', () => {
    const items = placeClutter();
    for (const c of items) {
      expect(clutterBaseClear(c), `${c.kind} at ${c.x}, ${c.z}`).toBe(true);
      expect(Math.abs(c.x)).toBeLessThan(PLAY_HALF);
      expect(Math.abs(c.z)).toBeLessThan(PLAY_HALF);
      expect(Math.max(Math.abs(c.x), Math.abs(c.z)) + clutterBase(c.kind, c.scale)).toBeLessThan(WORLD_HALF);
      for (const k of rocks()) {
        expect(Math.hypot(c.x - k.x, c.z - k.z)).toBeGreaterThan(k.size * ROCK_FOOT + clutterBase(c.kind, c.scale));
      }
      expect(logSegmentDistance(c.x, c.z)).toBeGreaterThan(heroLog().radius * LOG_FOOT + clutterBase(c.kind, c.scale));
    }
    for (const k of CLUTTER_KINDS) expect(items.some((c) => c.kind === k)).toBe(true);
  });
});

describe('the spawn\'s straight run stays clear of trunks and other footprints', () => {
  it('the whole corridor clears every trunk', () => {
    for (const t of treeSites()) {
      const nx = Math.max(CORRIDOR.x0, Math.min(CORRIDOR.x1, t.x));
      const nz = Math.max(CORRIDOR.z0, Math.min(CORRIDOR.z1, t.z));
      expect(Math.hypot(t.x - nx, t.z - nz)).toBeGreaterThan(trunkFootOf(t) + PATH_CLEARANCE);
    }
  });

  it('no footprint reaches the straight line the worm runs', () => {
    const BODY_PAD = 0.5;
    for (let x = -0.5; x <= 0.5; x += 0.1) {
      for (let z = CORRIDOR.z0; z <= CORRIDOR.z1; z += 0.1) {
        expect(obstacleDepth(x, z, BODY_PAD, hit)).toBeLessThanOrEqual(0);
      }
    }
  });
});

describe('placeClutter', () => {
  it('is deterministic per seed', () => {
    const items = placeClutter(60, 5);
    expect(items).toHaveLength(60);
    expect(placeClutter(60, 5)).toEqual(items);
    expect(placeClutter(60, 6)).not.toEqual(items);
  });
});
```

Create `tests/unit/realScale.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { REAL_SCALE, REAL_LEAF_CM, UNITS_PER_CM } from '../../src/surface/realScale';
import { LEAF_KINDS } from '../../src/surface/leafLitter';
import { LEAF_SIZE } from '../../src/surface/leafPalette';
import { leafCountScale, scaledLeafCount } from '../../src/surface/leafScale';

describe('real size', () => {
  it('the worm is 3.5 units for 15 cm', () => {
    expect(UNITS_PER_CM * 15).toBeCloseTo(3.5, 12);
  });

  it('keeps V1\'s True numbers (Step 1b spec 4.1)', () => {
    expect(REAL_SCALE).toMatchObject({ mushroom: 3, rock: 4, fern: 7, sedge: 7, log: 9, birch: 9, maple: 11 });
    expect(REAL_SCALE.trees).toEqual({ count: 2, seed: 284, clear: 18 });
    expect(REAL_SCALE.logSite).toEqual({ x: 0, z: 15.5, yaw: 0, length: 4.4, radius: 0.32 });
    expect(REAL_SCALE.rocks).toHaveLength(5);
    expect([REAL_SCALE.clutter, REAL_SCALE.clutterSeed, REAL_SCALE.distantScale, REAL_SCALE.distantCount]).toEqual([24, 5, 9, 14]);
  });

  it('leaves are each species\' real length on average', () => {
    for (const k of LEAF_KINDS) {
      const meanLength = REAL_SCALE.leaf[k] * LEAF_SIZE[k] * 0.9;
      expect(meanLength / UNITS_PER_CM).toBeCloseTo(REAL_LEAF_CM[k], 1);
    }
  });
});

describe('leaf counts follow leaf area', () => {
  it('about a quarter as many leaves as the presets\' base-size counts, each about four times the area', () => {
    const f = leafCountScale();
    expect(f).toBeGreaterThan(0.22);
    expect(f).toBeLessThan(0.3);
    expect(scaledLeafCount(1500)).toBe(Math.round(1500 * f));
    expect(scaledLeafCount(0)).toBe(0);
    expect(scaledLeafCount(1)).toBe(1);
  });
});
```

In `tests/unit/scaledProps.test.ts`:


Replace:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { buildGroundProps, writeHeroLog } from '../../src/surface/groundProps';
```

with:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildGroundProps, writeHeroLog } from '../../src/surface/groundProps';
```


Replace:

```ts
import { terrainHeight } from '../../src/surface/terrain';
import { DEFAULT_SCALE, SCALE_MODES, SCALE_SPECS, setScale } from '../../src/surface/worldScale';

/** Every attribute of a geometry (by name: positions, normals, aBark, aProp, aCanopy...) and its index, hashed. */
function geometryHash(g: THREE.BufferGeometry): string {
  const h = createHash('sha1');
  for (const name of Object.keys(g.attributes).sort()) {
    h.update(name);
    h.update(Buffer.from((g.attributes[name].array as Float32Array).buffer));
  }
  if (g.index) h.update(Buffer.from((g.index.array as Uint32Array).buffer));
  return h.digest('hex');
}
const positions = (m: THREE.Object3D) => (m as THREE.Mesh).geometry.getAttribute('position');
```

with:

```ts
import { terrainHeight } from '../../src/surface/terrain';
import { REAL_SCALE } from '../../src/surface/realScale';

const positions = (m: THREE.Object3D) => (m as THREE.Mesh).geometry.getAttribute('position');
```


Replace:

```ts

afterAll(() => { setScale(DEFAULT_SCALE); });

describe('Classic props are exactly Step 1a\'s (hashes checked equal to commit 7ce8936\'s first)', () => {
  it('ground props, trunks and the log, crowns and the distant ring: every attribute, index and instance', () => {
    setScale('classic');
    const trees = buildForestTrees(writeHeroLog);
    const distant = buildDistantTrees();
    expect(geometryHash(buildGroundProps().mesh.geometry)).toBe('c118705c09662efacd4dbd177f237847c0430c63');
    expect(geometryHash((trees.children[0] as THREE.Mesh).geometry)).toBe('68b049ed608ec2f876c2c85074cd185b4e1fe055');
    expect(geometryHash((trees.children[1] as THREE.Mesh).geometry)).toBe('6294458d1037eb769acd258fbd6ca2c47c1b5373');
    expect(geometryHash(distant.geometry)).toBe('df8fc78a79849834517d89eb7b730ead046a3f67');
    const instances = createHash('sha1')
      .update(Buffer.from(distant.instanceMatrix.array.buffer))
      .update(Buffer.from(distant.instanceColor!.array.buffer))
      .digest('hex');
    expect(instances).toBe('57c663929eb916d248d90a31495f4e07efa2c250');
    expect(distant.count).toBe(72);
  });
});

describe('the bark pattern is laid out at Classic size in every mode', () => {
  /** The largest aBark.y (height or length along the bark, over grow) of the trunks, and of the log. */
```

with:

```ts

describe('the bark pattern is laid out at base size, so a big trunk wears the same bark, bigger', () => {
  /** The largest aBark.y (height or length along the bark, over grow) of the trunks, and of the log. */
```


Replace:

```ts

  it('the tallest trunk\'s reach is about the same in every mode, and the log\'s is its Classic length, 4.4', () => {
    setScale('classic');
    const classic = barkReach();
    for (const mode of SCALE_MODES) {
      setScale(mode);
      const r = barkReach();
      expect(r.trunk / classic.trunk, mode).toBeGreaterThan(0.85);
      expect(r.trunk / classic.trunk, mode).toBeLessThan(1.15);
      expect(r.log, mode).toBeCloseTo(4.4, 5);
    }
  });
});

describe.each(SCALE_MODES)('%s: the solid footprints hold what is drawn, up to the worm\'s height', (mode) => {
  it('trunks and the log', () => {
    setScale(mode);
    const trunks = positions(buildForestTrees().children[0]);
```

with:

```ts

  it('the log\'s reach along its bark is its base length, 4.4, and the trunks\' about a base trunk\'s height', () => {
    const r = barkReach();
    expect(r.log).toBeCloseTo(4.4, 5);
    // In base units (V1 measured Classic's tallest at 14.4, and every mode within 15% of it).
    expect(r.trunk).toBeGreaterThan(12);
    expect(r.trunk).toBeLessThan(17);
  });
});

describe('the solid footprints hold what is drawn, up to the worm\'s height', () => {
  it('trunks and the log', () => {
    const trunks = positions(buildForestTrees().children[0]);
```


Replace:

```ts
  it('the log\'s jagged ends reach out to, and not past, its footprint\'s ends', () => {
    setScale(mode);
    const w = new MeshWriter('aBark', 4);
```

with:

```ts
  it('the log\'s jagged ends reach out to, and not past, its footprint\'s ends', () => {
    const w = new MeshWriter('aBark', 4);
```


Replace:

```ts
  it('rocks', () => {
    setScale(mode);
    const g = buildGroundProps().mesh.geometry;
```

with:

```ts
  it('rocks', () => {
    const g = buildGroundProps().mesh.geometry;
```


Replace:

```ts

describe('clutter and trees grow with the table', () => {
  /** Height and width of one clutter item written with `grow`. */
```

with:

```ts

describe('clutter and trees grow to real size', () => {
  /** Height and width of one clutter item written with `grow`. */
```


Replace:

```ts

  it('a grown fern has denser leaflets (14 pairs a frond, Classic 8), so it does not read as a comb', () => {
    const verts = (grow: number) => {
```

with:

```ts

  it('a grown fern has denser leaflets (14 pairs a frond, 8 at base size), so it does not read as a comb', () => {
    const verts = (grow: number) => {
```


Replace:

```ts

  it('the distant ring has the mode\'s count, each tree its size', () => {
    for (const mode of SCALE_MODES) {
      setScale(mode);
      const ring = buildDistantTrees();
      const spec = SCALE_SPECS[mode];
      expect(ring.count).toBe(spec.distantCount);
      const m = new THREE.Matrix4();
      const s = new THREE.Vector3();
      for (let i = 0; i < ring.count; i++) {
        ring.getMatrixAt(i, m);
        s.setFromMatrixScale(m);
        expect(s.x / spec.distantScale).toBeGreaterThanOrEqual(0.75 - 1e-6);
        expect(s.x / spec.distantScale).toBeLessThanOrEqual(1.35 + 1e-6);
      }
    }
  });

  it('True trunks stand about nine (birch) and eleven (maple) times taller than Classic\'s', () => {
    const tallest = (mode: 'classic' | 'true') => {
      setScale(mode);
      const p = positions(buildForestTrees().children[0]);
      let top = 0;
      for (let v = 0; v < p.count; v++) top = Math.max(top, p.getY(v));
      return top;
    };
    const ratio = tallest('true') / tallest('classic');
    expect(ratio).toBeGreaterThan(8);
    expect(ratio).toBeLessThan(12);
  });
```

with:

```ts

  it('the distant ring has the real-size count, each tree its size', () => {
    const ring = buildDistantTrees();
    expect(ring.count).toBe(REAL_SCALE.distantCount);
    const m = new THREE.Matrix4();
    const s = new THREE.Vector3();
    for (let i = 0; i < ring.count; i++) {
      ring.getMatrixAt(i, m);
      s.setFromMatrixScale(m);
      expect(s.x / REAL_SCALE.distantScale).toBeGreaterThanOrEqual(0.75 - 1e-6);
      expect(s.x / REAL_SCALE.distantScale).toBeLessThanOrEqual(1.35 + 1e-6);
    }
  });

  it('trunks stand tens of units tall, as real birches and maples do next to a 15 cm worm', () => {
    const p = positions(buildForestTrees().children[0]);
    let top = 0;
    for (let v = 0; v < p.count; v++) top = Math.max(top, p.getY(v));
    expect(top).toBeGreaterThan(40);
  });
```



Replace the whole of `tests/unit/sceneTiers.test.ts` with:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildLeafLitter, type LeafLitter } from '../../src/surface/leafLitterMesh';
import {
  CHUNKS, CHUNK_SIZE, LOD_NEAR, LOD_GAP, ACTIVE_MARGIN, chunkIndex, chunkDistance,
} from '../../src/surface/litterChunks';
import { LOD_POINTS } from '../../src/surface/leafLod';
import { buildGroundProps } from '../../src/surface/groundProps';
import { buildFallingLeaves, FALLING_COUNT, FALLING_MAX } from '../../src/surface/fallingLeaves';
import { buildDustMotes, MOTE_COUNT, MOTE_MAX } from '../../src/render/atmosphere';
import { buildWorld } from '../../src/game/world';
import { Crawl } from '../../src/game/crawl';
import { PRESETS } from '../../src/render/graphics';
import { scaledLeafCount } from '../../src/surface/leafScale';
import { sharedLighting } from '../../src/render/paintedMaterial';


/** Index counts drawn by every chunk's full-leaf mesh, and their totals. */
const drawn = (l: LeafLitter) => l.chunks.reduce((a, c) => a + c.near.geometry.drawRange.count, 0);
const total = (l: LeafLitter) => l.chunks.reduce((a, c) => a + c.near.geometry.index!.count, 0);
const EMPTY = [Infinity, Infinity, -Infinity, -Infinity];
/** A straight worm along -z from (x, z) (head first), the camera 2.6 behind its head. */
function straightWorm(x: number, z: number): { spine: Float32Array; camX: number; camZ: number } {
  const spine = new Float32Array(16 * 3);
  for (let i = 0; i < 16; i++) {
    spine[i * 3] = x;
    spine[i * 3 + 2] = z - i * 0.22;
  }
  return { spine, camX: x, camZ: z - 2.6 };
}

/** A crawl and the world built for it, with its atmosphere's two effects. */
function makeWorld() {
  const crawl = new Crawl();
  const world = buildWorld(crawl);
  const motes = world.atmosphere.group.getObjectByName('dustMotes') as THREE.Points;
  const falling = world.atmosphere.group.getObjectByName('fallingLeaves') as THREE.Mesh;
  return { crawl, world, motes, falling };
}

describe('scene tiers', () => {


  describe('leaf litter (chunked)', () => {
    let litter: LeafLitter;
    beforeAll(() => { litter = buildLeafLitter(2000); });

    it('is cut into CHUNKS x CHUNKS chunks, each a full and a low-detail mesh', () => {
      expect(litter.chunks).toHaveLength(CHUNKS * CHUNKS);
      expect(litter.group.children).toHaveLength(2 * CHUNKS * CHUNKS);
      expect(litter.chunks.reduce((a, c) => a + c.leaves.length, 0)).toBe(2000);
      const verts = litter.chunks.reduce((a, c) => a + c.near.geometry.getAttribute('position').count, 0);
      expect(verts).toBeLessThanOrEqual(60000);
      expect(total(litter) / 3).toBeLessThanOrEqual(60000);
      for (const c of litter.chunks) {
        // Low detail: 6 triangles a leaf, no petiole.
        expect(c.far.geometry.index!.count).toBe(c.leaves.length * LOD_POINTS * 3);
        // Both carry the drape's attributes.
        for (const m of [c.near, c.far]) {
          const n = m.geometry.getAttribute('position').count;
          expect(m.geometry.getAttribute('aAnchor').count).toBe(n);
          expect(m.geometry.getAttribute('aDip').count).toBe(n);
        }
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
      for (const c of litter.chunks) {
        expect(c.near.geometry.drawRange.count % 3).toBe(0);
        expect(c.far.geometry.drawRange.count).toBe(c.count * LOD_POINTS * 3);
      }
      litter.setCount(0);
      expect(drawn(litter)).toBe(0);
      expect(litter.drawn).toBe(0);
      expect(litter.chunks.every((c) => !c.near.visible && !c.far.visible)).toBe(true);
      litter.setCount(99_999);
      expect(drawn(litter)).toBe(total(litter));
      expect(litter.drawn).toBe(2000);
      litter.setCount(1234.7);
      expect(litter.drawn).toBe(1234);
      expect(litter.chunks.reduce((a, c) => a + c.count, 0)).toBe(1234);
      litter.setCount(2000);
    });

    it('shows full leaves near the camera and low-detail ones far away', () => {
      const w = straightWorm(0, 0);
      litter.update(w.camX, w.camZ, w.spine, EMPTY);
      const here = litter.chunks[chunkIndex(0, 0)];
      const corner = litter.chunks[chunkIndex(19, 19)];
      expect(here.near.visible).toBe(true);
      expect(here.far.visible).toBe(false);
      expect(corner.near.visible).toBe(false);
      expect(corner.far.visible).toBe(true);
      for (let c = 0; c < litter.chunks.length; c++) {
        const ch = litter.chunks[c];
        if (chunkDistance(c, w.camX, w.camZ) < LOD_NEAR) expect(ch.near.visible).toBe(true);
        if (chunkDistance(c, w.camX, w.camZ) > LOD_NEAR + 2) expect(ch.far.visible).toBe(true);
      }
    });

    it('uses the reacting material only where leaves can move or fade, and the three are precompiled variants', () => {
      const { active, plain, far } = litter.materials;
      expect(active.defines).toHaveProperty('DISTURB');
      expect(active.defines).toHaveProperty('OCCLUDE');
      for (const m of [plain, far]) {
        expect(m.defines).not.toHaveProperty('DISTURB');
        expect(m.defines).not.toHaveProperty('OCCLUDE');
      }
      expect(far.defines).toHaveProperty('LOD');
      const w = straightWorm(-3, -3);
      // An empty map (Low, or a still worm before its first step): only the fade's hull reacts.
      litter.update(w.camX, w.camZ, w.spine, EMPTY);
      const here = litter.chunks[chunkIndex(-3, -3)];
      expect(here.near.material).toBe(active);
      expect(litter.chunks[chunkIndex(-15, 15)].near.material).toBe(plain);
      expect(litter.chunks[chunkIndex(15, 15)].far.material).toBe(far);
      // The disturbed part of the map reacts too, grown by the drape and the fade's reach.
      const box = litter.chunks[chunkIndex(15, -15)].box;
      const dist = [box[2] + ACTIVE_MARGIN - 0.01, -15, box[2] + 1, -14];
      litter.update(w.camX, w.camZ, w.spine, dist);
      expect(litter.chunks[chunkIndex(15, -15)].active).toBe(true);
      dist[0] = box[2] + ACTIVE_MARGIN + 0.01;
      litter.update(w.camX, w.camZ, w.spine, dist);
      expect(litter.chunks[chunkIndex(15, -15)].active).toBe(false);
      expect(litter.chunks[chunkIndex(15, -15)].near.material).toBe(plain);
      // Swapping never makes a new material.
      const used = new Set(litter.chunks.flatMap((c) => [c.near.material, c.far.material]));
      for (const m of used) expect([active, plain, far]).toContain(m);
    });

    it('a reacting chunk always shows its full leaves, even beyond LOD_NEAR', () => {
      const w = straightWorm(-15, -15);
      const c = chunkIndex(15, 15);
      const box = litter.chunks[c].box;
      litter.update(w.camX, w.camZ, w.spine, [box[0], box[1], box[0] + 0.5, box[1] + 0.5]);
      expect(chunkDistance(c, w.camX, w.camZ)).toBeGreaterThan(LOD_NEAR + 2);
      expect(litter.chunks[c].active).toBe(true);
      expect(litter.chunks[c].near.visible).toBe(true);
      expect(litter.chunks[c].far.visible).toBe(false);
      litter.update(w.camX, w.camZ, w.spine, EMPTY);
      expect(litter.chunks[c].far.visible).toBe(true);
    });

    it('keeps all positions finite, with tight bounds per chunk', () => {
      for (const c of litter.chunks) {
        for (const v of c.near.geometry.getAttribute('position').array as Float32Array) expect(Number.isFinite(v)).toBe(true);
        expect(c.near.geometry.boundingSphere!.radius).toBeLessThan(CHUNK_SIZE * 1.3);
        expect(c.far.geometry.boundingSphere!.radius).toBeLessThan(CHUNK_SIZE * 1.3);
      }
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
    let crawl: Crawl;
    let world: ReturnType<typeof buildWorld>;
    beforeAll(() => { ({ crawl, world } = makeWorld()); });

    it('draws more detail leaves at each step up from Medium (Low none)', () => {
      world.apply(PRESETS.ultra); // builds the detail layer, if no test has yet
      const counts = (['low', 'medium', 'high', 'ultra'] as const).map((id) => {
        world.apply(PRESETS[id]);
        const mesh = world.detail.built!.mesh;
        return { drawn: world.detail.drawn, indices: mesh.visible ? mesh.geometry.drawRange.count : 0 };
      });
      expect(counts[0]).toEqual({ drawn: 0, indices: 0 });
      for (let k = 1; k < counts.length; k++) {
        expect(counts[k].drawn).toBeGreaterThan(counts[k - 1].drawn);
        expect(counts[k].indices).toBeGreaterThan(counts[k - 1].indices);
      }
    });

    it('draws each preset\'s hero leaves as the instance count, live (Low none)', () => {
      const camera = new THREE.PerspectiveCamera();
      const mesh = world.hero.mesh;
      const matrices = mesh.instanceMatrix;
      for (const id of ['ultra', 'low', 'medium', 'high', 'ultra', 'low'] as const) {
        // As main.ts applies a preset: the world, then the crawl's pool; the next frame shows it.
        world.apply(PRESETS[id]);
        crawl.setHeroCount(PRESETS[id].hero);
        world.sync(crawl, 1, 0, camera);
        expect(mesh.count).toBe(PRESETS[id].hero);
        expect(mesh.visible).toBe(PRESETS[id].hero > 0);
        expect(mesh.instanceMatrix).toBe(matrices);
      }
      expect([PRESETS.low.hero, PRESETS.medium.hero, PRESETS.high.hero, PRESETS.ultra.hero]).toEqual([0, 12, 24, 32]);
    });

    it('through a long crawl, every reacting litter chunk shows full leaves and is within LOD_NEAR + LOD_GAP anyway', () => {
      world.apply(PRESETS.high);
      const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.2, 200);
      // Straight, gentle and tight turns both ways, a U-turn: the trail curls round the map.
      const course: [number, number, number][] = [[0, 1, 240], [0.4, 1, 240], [1, 1, 420], [-1, 1, 420], [1, 0.2, 120], [0, 1, 240]];
      let frames = 0;
      let reacting = 0;
      let lowDetail = 0;
      let farthest = 0;
      for (const [x, y, n] of course) {
        for (let i = 0; i < n; i++) {
          crawl.step(1 / 60, { x, y });
          world.sync(crawl, 1, frames / 60, camera);
          frames++;
          world.litter.chunks.forEach((ch, c) => {
            if (!ch.active) return;
            reacting++;
            if (!ch.near.visible || ch.far.visible || ch.near.material !== world.litter.materials.active) lowDetail++;
            farthest = Math.max(farthest, chunkDistance(c, camera.position.x, camera.position.z));
          });
        }
      }
      expect(reacting).toBeGreaterThan(frames);
      expect(lowDetail).toBe(0);
      // Not only by the update's rule: the reacting chunks lie inside the full-leaf ring and its
      // hysteresis band (a camera pulled in by a prop stands nearer the head, farther from the trail).
      expect(farthest).toBeLessThan(LOD_NEAR + LOD_GAP);
    });

    it('switching presets does not touch the geometry buffers', () => {
      const g = world.litter.chunks[0].near.geometry;
      const pos = g.getAttribute('position');
      world.apply(PRESETS.medium);
      world.apply(PRESETS.ultra);
      expect(g.getAttribute('position')).toBe(pos);
    });
  });
});

// The preset counts are at base leaf size (Step 1a); scaledLeafCount gives real size's.
describe('world.apply preset counts', () => {
  let world: ReturnType<typeof buildWorld>;
  let motes: THREE.Points;
  let falling: THREE.Mesh;
  beforeAll(() => {
    ({ world, motes, falling } = makeWorld());
  });

  it('builds the litter at Ultra size, and the detail layer only once a preset draws it', () => {
    expect(world.litter.max).toBe(scaledLeafCount(PRESETS.ultra.litter));
    expect(world.detail.max).toBe(scaledLeafCount(PRESETS.ultra.detail));
    expect(world.detail.built).toBeNull();
    world.apply(PRESETS.low);
    expect(world.detail.built).toBeNull();
  });

  it('trims counts and switches effects and rim per preset, live', () => {
    world.apply(PRESETS.ultra);
    const detail = world.detail.built!;
    expect(detail.mesh.visible).toBe(true);
    expect(detail.mesh.geometry.drawRange.count).toBe(detail.mesh.geometry.index!.count);
    const ultraLeaves = drawn(world.litter);
    expect(ultraLeaves).toBe(total(world.litter));
    expect(world.atmosphere.group.visible).toBe(true);
    expect(motes.geometry.drawRange.count).toBe(MOTE_MAX);
    const ultraFalling = falling.geometry.drawRange.count;
    expect(sharedLighting.uRim.value).toBe(1);

    world.apply(PRESETS.high);
    // Every preset draws the same litter (Task 23): they differ in their detail leaves.
    expect(world.litter.drawn).toBe(scaledLeafCount(PRESETS.high.litter));
    expect(drawn(world.litter)).toBe(ultraLeaves);
    expect(detail.mesh.geometry.drawRange.count).toBeLessThan(detail.mesh.geometry.index!.count);
    expect(motes.geometry.drawRange.count).toBe(MOTE_COUNT);
    expect(falling.geometry.drawRange.count).toBeLessThan(ultraFalling);

    world.apply(PRESETS.low);
    expect(detail.mesh.visible).toBe(false);
    expect(world.atmosphere.group.visible).toBe(false);
    expect(sharedLighting.uRim.value).toBe(0);
    expect(world.litter.drawn).toBe(scaledLeafCount(PRESETS.low.litter));
    expect(drawn(world.litter)).toBe(ultraLeaves);
  });

  it('reports the leaves it draws for each preset (Low: litter only, no detail)', () => {
    for (const id of ['low', 'medium', 'high', 'ultra', 'low'] as const) {
      world.apply(PRESETS[id]);
      expect(world.litter.drawn, `${id} litter`).toBe(scaledLeafCount(PRESETS[id].litter));
      expect(world.detail.drawn, `${id} detail`).toBe(scaledLeafCount(PRESETS[id].detail));
    }
    expect(PRESETS.low).toMatchObject({ litter: 1500, detail: 0 });
  });
});
```

Replace the whole of `tests/unit/solidProps.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { Crawl, BODY_RADIUS } from '../../src/game/crawl';
import { obstacleDepth, footprints, insideTall, sightReach, ROCK_FOOT } from '../../src/surface/obstacles';
import { treeSites, trunkFootOf } from '../../src/surface/treeSites';
import { rocks } from '../../src/surface/propPlacement';
import { terrainHeight } from '../../src/surface/terrain';
import { stepWorm, type WormMotion } from '../../src/worm/locomotion';
import { AUTO_DRIVE_MOVE, LOCOMOTION } from '../../src/game/drive';

const DT = 1 / 60;
const hit = { nx: 0, nz: 0 };
const wrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

/** Steers toward (tx, tz) for `steps` steps; `each` sees the crawl after every step. */
function driveTo(c: Crawl, tx: number, tz: number, steps: number, each: (c: Crawl) => void): void {
  const move = { x: 0, y: 1 };
  for (let s = 0; s < steps; s++) {
    const h = c.motion.head;
    const err = wrap(Math.atan2(tx - h.x, tz - h.z) - c.motion.heading);
    move.x = Math.max(-1, Math.min(1, -err * 3));
    c.step(DT, move);
    each(c);
  }
}

/** Fails if any body point lies inside a footprint grown by the body's radius. */
function outside(c: Crawl): void {
  for (const p of c.body) expect(obstacleDepth(p.x, p.z, BODY_RADIUS, hit)).toBeLessThanOrEqual(1e-9);
}

describe('trunks, rocks and the log are solid', () => {

  it('a worm driven at every one of them stops at its edge and never cuts through', () => {
    const { round, log } = footprints();
    const targets = [];
    for (let o = 0; o < round.length; o += 4) targets.push({ x: round[o], z: round[o + 1] });
    targets.push({ x: log.x, z: log.z }, { x: log.x + log.dx * log.half * 0.6, z: log.z + log.dz * log.half * 0.6 });
    for (const t of targets) {
      const c = new Crawl();
      driveTo(c, t.x, t.z, 900, outside);
    }
  }, 60_000);

  it('slides along an edge instead of stopping dead', () => {
    // Head for a point just past the log's far side, at a slant: the worm meets the log and slides
    // along it, staying on its own side.
    const { log } = footprints();
    const c = new Crawl();
    const tx = log.x - log.dz * (log.r + 3) + log.dx * 2;
    const tz = log.z + log.dx * (log.r + 3) + log.dz * 2;
    /** Where (x, z) lies along the log's axis, and across it (negative: the spawn's side). */
    const along = (x: number, z: number) => (x - log.x) * log.dx + (z - log.z) * log.dz;
    const across = (x: number, z: number) => -(x - log.x) * log.dz + (z - log.z) * log.dx;
    let side = across(c.motion.head.x, c.motion.head.z);
    expect(side).toBeLessThan(0);
    let touching = 0;
    let slid = 0;
    let lastAlong = along(c.motion.head.x, c.motion.head.z);
    driveTo(c, tx, tz, 1500, (cc) => {
      const h = cc.motion.head;
      const t = along(h.x, h.z);
      // The head only gets to the log's far side around one of its ends, never across it.
      const now = across(h.x, h.z);
      if ((now < 0) !== (side < 0)) expect(Math.abs(t)).toBeGreaterThan(log.half);
      side = now;
      const tc = Math.max(-log.half, Math.min(log.half, t));
      const gap = Math.hypot(h.x - (log.x + log.dx * tc), h.z - (log.z + log.dz * tc)) - log.r - BODY_RADIUS;
      if (gap < 0.01) {
        // Against the log: never in it, and still moving along it.
        expect(obstacleDepth(h.x, h.z, BODY_RADIUS, hit)).toBeLessThanOrEqual(1e-9);
        touching++;
        slid += t - lastAlong;
      }
      lastAlong = t;
    });
    expect(touching).toBeGreaterThan(10);
    // While against the log it still moves along it (it steers into it, so it slides slower than it crawls).
    expect(slid / (touching * DT)).toBeGreaterThan(0.15 * LOCOMOTION.speed);
  });

  it('the speed test\'s drive never touches one: the head follows the free path exactly', () => {
    const c = new Crawl();
    let m: WormMotion = { head: { x: 0, y: 0, z: 0 }, heading: 0 };
    for (let s = 0; s < 30 * 60; s++) {
      c.step(DT, AUTO_DRIVE_MOVE.move);
      m = stepWorm(m, AUTO_DRIVE_MOVE.move, DT, LOCOMOTION);
      expect(c.motion.head.x).toBeCloseTo(m.head.x, 9);
      expect(c.motion.head.z).toBeCloseTo(m.head.z, 9);
    }
  });
});
describe('sightReach', () => {

  it('is 1 for a clear line', () => {
    expect(sightReach(0, 0.05, 0, 0, 1.15, -2.6, 0.35)).toBe(1);
  });

  it('stops short of a trunk in the way, by the margin', () => {
    const t = treeSites()[0];
    const foot = trunkFootOf(t);
    // From 1 m beside the trunk, looking back through it.
    const hx = t.x + foot + 1;
    const r = sightReach(hx, 0.1, t.z, hx - 4, 1.2, t.z, 0.35);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(1);
    // The stop point is the margin short of the trunk's edge.
    expect(hx - 4 * r - (t.x + foot)).toBeCloseTo(0.35, 2);
  });

  it('passes over a rock lower than the line, not one taller', () => {
    const k = rocks()[0];
    const top = terrainHeight(k.x, k.z) + k.size * 0.6;
    const foot = k.size * ROCK_FOOT;
    const hx = k.x + foot + 0.5;
    expect(sightReach(hx, top + 0.2, k.z, hx - 2 * foot - 1, top + 0.5, k.z, 0.35)).toBe(1);
    expect(sightReach(hx, top - 0.3, k.z, hx - 2 * foot - 1, top - 0.1, k.z, 0.35)).toBeLessThan(1);
  });
});

describe('the camera stays out of props', () => {

  it('driving at and around every tall prop, the camera never enters one, and moves smoothly', () => {
    const { round, log } = footprints();
    const targets = [];
    for (let o = 0; o < round.length; o += 4) targets.push({ x: round[o], z: round[o + 1] });
    targets.push({ x: log.x + log.dx * log.half * 0.3, z: log.z + log.dz * log.half * 0.3 });
    let pulled = 0;
    let fastest = 0;
    let jerk = 0;
    for (const t of targets) {
      const c = new Crawl();
      let last = { ...c.cam.pos };
      let lastStep = { x: 0, y: 0, z: 0 };
      const check = (cc: Crawl) => {
        const p = cc.cam.pos;
        expect(insideTall(p.x, p.z, p.y)).toBe(false);
        const step = { x: p.x - last.x, y: p.y - last.y, z: p.z - last.z };
        fastest = Math.max(fastest, Math.hypot(step.x, step.y, step.z));
        jerk = Math.max(jerk, Math.hypot(step.x - lastStep.x, step.y - lastStep.y, step.z - lastStep.z));
        last = { ...p };
        lastStep = step;
        if (cc.cameraReach < 0.99) pulled++;
      };
      driveTo(c, t.x, t.z, 700, check);
      // Then turn hard on the spot against it, swinging the camera round behind.
      const move = { x: 1, y: 0.2 };
      for (let s = 0; s < 400; s++) {
        c.step(DT, move);
        check(c);
      }
    }
    // The test is real: the camera did have to pull in.
    expect(pulled).toBeGreaterThan(50);
    // It eases: at most about 10 m/s while pulling in past a trunk (its hard turns alone reach
    // about 5), and its speed changes gradually from step to step (no snap).
    expect(fastest).toBeLessThan(0.18);
    expect(jerk).toBeLessThan(0.06);
  }, 60_000);

  it('the speed test\'s drive never pulls the camera in', () => {
    const c = new Crawl();
    for (let s = 0; s < 30 * 60; s++) {
      c.step(DT, AUTO_DRIVE_MOVE.move);
      expect(c.cameraReach).toBe(1);
    }
  });
});

describe('the camera eases in gently past a trunk', () => {
  /** A slanted pass by trunk `n`: aimed 3 m past it, half its footprint to one side. */
  const pastTrunk = (n: number) => {
    const { round } = footprints();
    const [x, z, r] = [round[4 * n], round[4 * n + 1], round[4 * n + 2]];
    const a = Math.atan2(x, z);
    return { x: x + Math.sin(a) * 3 + Math.cos(a) * r * 0.5, z: z + Math.cos(a) * 3 - Math.sin(a) * r * 0.5 };
  };

  it('a pull-in starts gently, and never snaps', () => {
    // Slanted passes by both trunks (the birch and the maple).
    let onset = 0;
    let fastest = 0;
    let pulled = 0;
    for (const n of [0, 1]) {
      const t = pastTrunk(n);
      const c = new Crawl();
      let last = { ...c.cam.pos };
      let lastStep = { x: 0, y: 0, z: 0 };
      let lastReach = 1;
      let since = Infinity;
      driveTo(c, t.x, t.z, 2400, (cc) => {
        const p = cc.cam.pos;
        const step = { x: p.x - last.x, y: p.y - last.y, z: p.z - last.z };
        const jerk = Math.hypot(step.x - lastStep.x, step.y - lastStep.y, step.z - lastStep.z);
        since = lastReach >= 0.999 && cc.cameraReach < 0.999 ? 0 : since + 1;
        if (since < 10) onset = Math.max(onset, jerk);
        fastest = Math.max(fastest, jerk);
        if (cc.cameraReach < 0.99) pulled++;
        last = { ...p };
        lastStep = step;
        lastReach = cc.cameraReach;
      });
    }
    expect(pulled).toBeGreaterThan(30);
    expect(onset).toBeLessThan(0.012);
    expect(fastest).toBeLessThan(0.03);
  }, 60_000);
});
```

In `tests/unit/treeShadows.test.ts`:


Replace:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { trunkShadow, shadowCasters, type ShadowCaster } from '../../src/surface/treeShadows';
import { DEFAULT_SCALE, setScale } from '../../src/surface/worldScale';

// Classic's 14 trees (True has 2).
// (Set at load: some describe blocks build meshes as they are collected.)
setScale('classic');
afterAll(() => { setScale(DEFAULT_SCALE); });

```

with:

```ts
import { describe, it, expect } from 'vitest';
import { trunkShadow, shadowCasters, type ShadowCaster } from '../../src/surface/treeShadows';

```


Replace:

```ts
    const casters = shadowCasters();
    expect(casters.length).toBeGreaterThan(10);
    for (let x = -20; x <= 20; x += 0.7) {
```

with:

```ts
    const casters = shadowCasters();
    expect(casters.length).toBeGreaterThanOrEqual(2);
    for (let x = -20; x <= 20; x += 0.7) {
```



Delete `tests/unit/worldScale.test.ts` (`git rm tests/unit/worldScale.test.ts`).

- [ ] **Step 3: Implement**

In `src/game/crawl.ts`:


Replace:

```ts
  /**
   * The scale mode's reach on the disturbance map (leafScale.ts): how far it is stamped, how much
   * farther a body on top counts as, and the window the renderer fades it in.
   */
```

with:

```ts
  /**
   * The reach on the disturbance map (leafScale.ts): how far it is stamped, how much farther a body
   * on top counts as, and the window the renderer fades it in.
   */
```



In `src/render/groundTexture.ts`:


Replace:

```ts

/** Mesh vertex heights, row j holding grid line j along z, for the active scale mode. */
export function groundTextureData(): Float32Array {
```

with:

```ts

/** Mesh vertex heights, row j holding grid line j along z. */
export function groundTextureData(): Float32Array {
```



In `src/render/litterTexture.ts`:


Replace:

```ts
 * clutter): R = litter mound / LITTER_MAX, G = litter depth / LITTER_MAX, B = baked trunk shade
 * (light multiplier), A = 255. Row j holds z = texelCentre(j). Uploaded once per scale mode.
 */
```

with:

```ts
 * clutter): R = litter mound / LITTER_MAX, G = litter depth / LITTER_MAX, B = baked trunk shade
 * (light multiplier), A = 255. Row j holds z = texelCentre(j). Uploaded once.
 */
```


Replace:

```ts

/** The shared baked litter texture (built on first use, for the scale mode active then). */
export function getLitterTexture(): THREE.DataTexture {
```

with:

```ts

/** The shared baked litter texture (built on first use). */
export function getLitterTexture(): THREE.DataTexture {
```



In `src/surface/detailLeaves.ts`:


Replace:

```ts
import { leafTint, LEAF_SIZE, LATERAL_VEINS } from './leafPalette';
import { scaleSpec } from './worldScale';
import { scaledLeafCount } from './leafScale';
```

with:

```ts
import { leafTint, LEAF_SIZE, LATERAL_VEINS } from './leafPalette';
import { REAL_SCALE } from './realScale';
import { scaledLeafCount } from './leafScale';
```


Replace:

```ts
  const rng = mulberry32(seed);
  // The scale mode's leaf sizes (worldScale.ts): 1 in Classic. Pass the mode's count (scaledLeafCount).
  const grow = scaleSpec().leaf;
  const kinds = Array.from({ length: count }, () => LEAF_KINDS[Math.floor(rng() * LEAF_KINDS.length)]);
```

with:

```ts
  const rng = mulberry32(seed);
  // Real leaf sizes (realScale.ts). Pass the real-size count (scaledLeafCount).
  const grow = REAL_SCALE.leaf;
  const kinds = Array.from({ length: count }, () => LEAF_KINDS[Math.floor(rng() * LEAF_KINDS.length)]);
```


Replace:

```ts
    // area on screen (the layer is fill-bound). `size` is the leaf's scale, 0.21 to 0.39 of its
    // species' LEAF_SIZE, times spec.leaf (in Classic 0.21 to 0.62 m, against the litter's 0.6 to
    // 1.9); its radius (aDetail.w, size times the shape's reach) is 0.11 to 0.385 m in Classic.
    const size = LEAF_SIZE[kind] * (0.21 + rng() * 0.18) * grow[kind];
```

with:

```ts
    // area on screen (the layer is fill-bound). `size` is the leaf's scale, 0.21 to 0.39 of its
    // species' LEAF_SIZE (a third of the litter's 0.6 to 1.2), times its real-size growth.
    const size = LEAF_SIZE[kind] * (0.21 + rng() * 0.18) * grow[kind];
```



In `src/surface/distantTrees.ts`:


Replace:

```ts
import { terrainHeight, WORLD_HALF } from './terrain';
import { scaleSpec } from './worldScale';

```

with:

```ts
import { terrainHeight, WORLD_HALF } from './terrain';
import { REAL_SCALE } from './realScale';

```


Replace:

```ts
 * A ring of simple, fog-softened tree silhouettes on the berm beyond the playable area, sized
 * and spaced for the active scale mode (bigger trees, fewer of them). One instanced draw call.
 * They exist only for depth; the haze does most of the work.
 */
export function buildDistantTrees(): THREE.InstancedMesh {
  const { distantScale, distantCount } = scaleSpec();
  const count = Math.min(RING_COUNT, distantCount);
```

with:

```ts
 * A ring of simple, fog-softened tree silhouettes on the berm beyond the playable area, sized
 * and spaced for real size (big trees, few of them). One instanced draw call.
 * They exist only for depth; the haze does most of the work.
 */
export function buildDistantTrees(): THREE.InstancedMesh {
  const { distantScale, distantCount } = REAL_SCALE;
  const count = Math.min(RING_COUNT, distantCount);
```



In `src/surface/forestTrees.ts`:


Replace:

```ts
import { treeSites } from './treeSites';
import { scaleSpec } from './worldScale';
import { trunkRadius } from './trunkShape';
```

with:

```ts
import { treeSites } from './treeSites';
import { REAL_SCALE } from './realScale';
import { trunkRadius } from './trunkShape';
```


Replace:

```ts
/**
 * One stem: `scale` makes a clump's second stem smaller; `grow` is the scale mode's size for the
 * species (worldScale.ts), applied to girth, height, lean and the root collar alike.
 */
```

with:

```ts
/**
 * One stem: `scale` makes a clump's second stem smaller; `grow` is the species' real-size growth
 * (realScale.ts), applied to girth, height, lean and the root collar alike.
 */
```


Replace:

```ts
/**
 * Near forest of the active scale mode: paper birches (some in clumps) and sugar maples with
 * bark-detailed, flared, leaning trunks and limbs (one merged draw), and soft autumn crowns (one
```

with:

```ts
/**
 * The near forest at real size: paper birches (some in clumps) and sugar maples with
 * bark-detailed, flared, leaning trunks and limbs (one merged draw), and soft autumn crowns (one
```


Replace:

```ts
export function buildForestTrees(addBark?: (w: MeshWriter) => void): THREE.Group {
  const spec = scaleSpec();
  const bark = new MeshWriter('aBark', 4);
```

with:

```ts
export function buildForestTrees(addBark?: (w: MeshWriter) => void): THREE.Group {
  const bark = new MeshWriter('aBark', 4);
```


Replace:

```ts
  treeSites().forEach(({ x, z, birch, clump }) => {
    const grow = birch ? spec.birch : spec.maple;
    const stems = [trunkSpec(x, z, birch, rng, 1, grow)];
```

with:

```ts
  treeSites().forEach(({ x, z, birch, clump }) => {
    const grow = birch ? REAL_SCALE.birch : REAL_SCALE.maple;
    const stems = [trunkSpec(x, z, birch, rng, 1, grow)];
```



In `src/surface/groundProps.ts`:


Replace:

```ts
import { BARK, writeLog } from './trunkGeometry';
import { scaleSpec } from './worldScale';

/**
 * One clutter item, at the active scale mode's size. Clutter rests on the terrain mesh exactly as
 * drawn (soil plus litter mound), so the mound under deep piles never buries it; rocks and the log
```

with:

```ts
import { BARK, writeLog } from './trunkGeometry';
import { REAL_SCALE } from './realScale';

/**
 * One clutter item, at real size. Clutter rests on the terrain mesh exactly as
 * drawn (soil plus litter mound), so the mound under deep piles never buries it; rocks and the log
```


Replace:

```ts
/**
 * Rocks, mushroom clusters, sedge tufts and fern clumps merged into one mesh (one draw), for the
 * active scale mode. Rocks come first and always stay; density tiers trim the clutter after them.
 */
```

with:

```ts
/**
 * Rocks, mushroom clusters, sedge tufts and fern clumps merged into one mesh (one draw), at real
 * size. Rocks come first and always stay; density tiers trim the clutter after them.
 */
```


Replace:

```ts

/** The hero fallen birch log of the active mode, written into the shared bark mesh (no extra draw). */
export function writeHeroLog(w: MeshWriter): void {
  const log = heroLog();
  writeLog(w, log.x, log.z, log.yaw, log.length, log.radius, BARK.birch, 1.62, terrainHeight, scaleSpec().log);
}
```

with:

```ts

/** The hero fallen birch log, written into the shared bark mesh (no extra draw). */
export function writeHeroLog(w: MeshWriter): void {
  const log = heroLog();
  writeLog(w, log.x, log.z, log.yaw, log.length, log.radius, BARK.birch, 1.62, terrainHeight, REAL_SCALE.log);
}
```



In `src/surface/heroPool.ts`:


Replace:

```ts
import { LEAF_KINDS } from './leafLitter';
import { scaleSpec } from './worldScale';

```

with:

```ts
import { LEAF_KINDS } from './leafLitter';
import { REAL_SCALE } from './realScale';

```


Replace:

```ts
/**
 * Sets every slot's leaf length from its fixed base (0.55 to 1 m) times its species' size in the
 * active scale mode (worldScale.ts). createHeroLeaves calls it; call it again after a mode change.
 */
export function sizeHeroLeaves(p: HeroLeaves): void {
  const grow = scaleSpec().leaf;
  for (let i = 0; i < p.max; i++) p.size[i] = (0.55 + 0.45 * hash01(i, p.seed + 101)) * grow[LEAF_KINDS[p.kind[i]]];
```

with:

```ts
/**
 * Sets every slot's leaf length from its fixed base (0.55 to 1 m) times its species' real-size
 * growth (realScale.ts). createHeroLeaves calls it.
 */
export function sizeHeroLeaves(p: HeroLeaves): void {
  const grow = REAL_SCALE.leaf;
  for (let i = 0; i < p.max; i++) p.size[i] = (0.55 + 0.45 * hash01(i, p.seed + 101)) * grow[LEAF_KINDS[p.kind[i]]];
```



In `src/surface/leafLitterMesh.ts`:


Replace:

```ts
import { LeafBuffers, type LeafLook } from './leafWriter';
import { scaleSpec } from './worldScale';
import {
```

with:

```ts
import { LeafBuffers, type LeafLook } from './leafWriter';
import { REAL_SCALE } from './realScale';
import {
```


Replace:

```ts
  const shadeAt = makeShadeAt(sharedLighting.uLightDir.value);
  const grow = scaleSpec().leaf;
  return leaves.map((l) => {
    // The scale mode's real-size leaves (worldScale.ts): 1 in Classic.
    const size = l.scale * LEAF_SIZE[l.kind] * grow[l.kind];
```

with:

```ts
  const shadeAt = makeShadeAt(sharedLighting.uLightDir.value);
  const grow = REAL_SCALE.leaf;
  return leaves.map((l) => {
    // Real-size leaves (realScale.ts).
    const size = l.scale * LEAF_SIZE[l.kind] * grow[l.kind];
```


Replace:

```ts
 * mesh: species silhouettes with a midrib fold, cup and curl, tinted per leaf and lying on the
 * rendered ground in loose layers, at the active scale mode's leaf sizes (pass the mode's count,
 * scaledLeafCount). Presets trim every chunk with a draw range (no rebuild).
 */
```

with:

```ts
 * mesh: species silhouettes with a midrib fold, cup and curl, tinted per leaf and lying on the
 * rendered ground in loose layers, at real leaf sizes (pass the real-size count, scaledLeafCount). Presets trim every chunk with a draw range (no rebuild).
 */
```



In `src/surface/leafScale.ts`:


Replace:

```ts
import { LEAF_SIZE } from './leafPalette';
import { scaleSpec, type ScaleSpec } from './worldScale';
import { DIST_CELL, DIST_REACH, DIST_SPAN } from './disturbance';

/**
 * The farthest any Classic litter leaf reaches from its centre (the largest placement scale of the
 * biggest species, petiole included; tests/unit/leafGlsl.test.ts checks it). Detail leaves are
 * smaller, and hero leaves do not read the disturbance map.
 */
export const CLASSIC_LEAF_RADIUS = 1.26;
/** The drape's foot (leafGlsl.ts DRAPE_FOOT; tests/unit/disturbance.test.ts checks they agree). */
```

with:

```ts
import { LEAF_SIZE } from './leafPalette';
import { REAL_SCALE } from './realScale';
import { DIST_CELL, DIST_REACH, DIST_SPAN } from './disturbance';

/**
 * The farthest any base-size litter leaf reaches from its centre (the largest placement scale of
 * the biggest species, petiole included; tests/unit/leafGlsl.test.ts checks it). Detail leaves are
 * smaller, and hero leaves do not read the disturbance map.
 */
export const BASE_LEAF_RADIUS = 1.26;
/** The drape's foot (leafGlsl.ts DRAPE_FOOT; tests/unit/disturbance.test.ts checks they agree). */
```


Replace:

```ts
/**
 * Bigger leaves, fewer of them (spec 4.2): a leaf layer's count scales with 1 / leaf area, so the
 * floor stays about as covered (randomly strewn leaves cover a share that depends only on their
 * total area) and overdraw and fill rate stay about the same. Species are drawn equally often, so
 * the area is summed over them, each with its own silhouette. 1 for Classic and Hybrid.
 */
export function leafCountScale(spec: ScaleSpec = scaleSpec()): number {
  let base = 0;
```

with:

```ts
/**
 * Bigger leaves, fewer of them (Step 1b spec 4.2): a leaf layer's count scales with 1 / leaf area,
 * so the floor stays about as covered as with the presets' base-size counts (randomly strewn
 * leaves cover a share that depends only on their total area) and overdraw and fill rate stay
 * about the same. Species are drawn equally often, so the area is summed over them, each with its
 * own silhouette.
 */
export function leafCountScale(): number {
  let base = 0;
```


Replace:

```ts
    base += AREA[k] * LEAF_SIZE[k] ** 2;
    scaled += AREA[k] * (LEAF_SIZE[k] * spec.leaf[k]) ** 2;
  }
```

with:

```ts
    base += AREA[k] * LEAF_SIZE[k] ** 2;
    scaled += AREA[k] * (LEAF_SIZE[k] * REAL_SCALE.leaf[k]) ** 2;
  }
```


Replace:

```ts

/** A preset's leaf count (graphics.ts gives Classic's) for the mode: at least 1 when n > 0. */
export function scaledLeafCount(n: number, spec: ScaleSpec = scaleSpec()): number {
  return n > 0 ? Math.max(1, Math.round(n * leafCountScale(spec))) : 0;
}

/** The farthest a litter leaf of the mode reaches from its centre. */
export function maxLeafRadius(spec: ScaleSpec = scaleSpec()): number {
  return CLASSIC_LEAF_RADIUS * Math.max(...LEAF_KINDS.map((k) => spec.leaf[k]));
}

/**
 * How far from the body the mode's leaves react: the biggest leaf plus the drape's foot (Classic:
 * 1.6 m, the map's reach before Part A).
 */
export function leafReach(spec: ScaleSpec = scaleSpec()): number {
  return maxLeafRadius(spec) + DRAPE_FOOT_M;
}
```

with:

```ts

/** A preset's leaf count (graphics.ts gives it at base size) at real size: at least 1 when n > 0. */
export function scaledLeafCount(n: number): number {
  return n > 0 ? Math.max(1, Math.round(n * leafCountScale())) : 0;
}

/** The farthest a litter leaf reaches from its centre. */
export function maxLeafRadius(): number {
  return BASE_LEAF_RADIUS * Math.max(...LEAF_KINDS.map((k) => REAL_SCALE.leaf[k]));
}

/** How far from the body the leaves react: the biggest leaf plus the drape's foot. */
export function leafReach(): number {
  return maxLeafRadius() + DRAPE_FOOT_M;
}
```


Replace:

```ts
/**
 * How far from the body the mode stamps the disturbance map (stampBody's limit): the leaves' reach
 * plus a lookup's spread, so every leaf that can react reads exactly what the full map holds (an
 * empty cell reads as the map's whole reach, and bilinear filtering beside it would jump).
 * Classic: 1.9 m. Never past the map's reach.
 */
export function stampLimit(spec: ScaleSpec = scaleSpec()): number {
  return Math.min(DIST_REACH, leafReach(spec) + LOOKUP_SPREAD);
}
```

with:

```ts
/**
 * How far from the body the disturbance map is stamped (stampBody's limit): the leaves' reach plus
 * a lookup's spread, so every leaf that can react reads exactly what the full map holds (an empty
 * cell reads as the map's whole reach, and bilinear filtering beside it would jump). Never past
 * the map's reach.
 */
export function stampLimit(): number {
  return Math.min(DIST_REACH, leafReach() + LOOKUP_SPREAD);
}
```


Replace:

```ts
 * How much farther a segment riding on top of the litter counts as being (stampBody's onTop), so
 * it reaches only 0.2 m past the mode's biggest leaf: Classic 1.4, as before Part A; True 3.2.
 */
export function onTopDistance(spec: ScaleSpec = scaleSpec()): number {
  return leafReach(spec) - 0.2;
}

/**
 * The half width of the window the leaf shaders read the map in. Step 1a's 8 m map faded leaves
 * out from 85% to 97% of its 4 m half span, 2.5 times its 1.6 m reach; each mode keeps that ratio
 * (Classic exactly Step 1a's window, so trails end where they did), up to the map's own half span
 * (True).
 */
function windowHalf(spec: ScaleSpec): number {
  return Math.min(DIST_SPAN / 2, 2.5 * leafReach(spec));
}

/** Everything the crawl and the renderer need from the mode about the disturbance map. */
export interface DisturbReach {
```

with:

```ts
 * How much farther a segment riding on top of the litter counts as being (stampBody's onTop), so
 * it reaches only 0.2 m past the biggest leaf.
 */
export function onTopDistance(): number {
  return leafReach() - 0.2;
}

/**
 * The half width of the window the leaf shaders read the map in: Step 1a's 8 m map faded leaves
 * out from 85% to 97% of its 4 m half span, 2.5 times its 1.6 m reach; real size keeps that ratio,
 * up to the map's own half span.
 */
function windowHalf(): number {
  return Math.min(DIST_SPAN / 2, 2.5 * leafReach());
}

/** Everything the crawl and the renderer need about the disturbance map's reach. */
export interface DisturbReach {
```


Replace:

```ts

/** The mode's DisturbReach, written into `out` (allocates nothing when given one). */
export function disturbReach(
  spec: ScaleSpec = scaleSpec(), out: DisturbReach = { stamp: 0, onTop: 0, fadeFrom: 0, fadeTo: 0 },
): DisturbReach {
  out.stamp = stampLimit(spec);
  out.onTop = onTopDistance(spec);
  const half = windowHalf(spec);
  out.fadeFrom = 0.85 * half;
```

with:

```ts

/** The DisturbReach, written into `out` (allocates nothing when given one). */
export function disturbReach(
  out: DisturbReach = { stamp: 0, onTop: 0, fadeFrom: 0, fadeTo: 0 },
): DisturbReach {
  out.stamp = stampLimit();
  out.onTop = onTopDistance();
  const half = windowHalf();
  out.fadeFrom = 0.85 * half;
```



In `src/surface/litterDepth.ts`:


Replace:

```ts
import { heroLog, rocks } from './propPlacement';
import { scaleSpec, type LogSite, type ScaleSpec } from './worldScale';

```

with:

```ts
import { heroLog, rocks } from './propPlacement';
import type { LogSite } from './realScale';

```


Replace:

```ts
interface Drifts {
  spec: ScaleSpec;
  /** Round obstacles that leaves drift against: trunks (with their root flare) and rocks. */
```

with:

```ts
interface Drifts {
  /** Round obstacles that leaves drift against: trunks (with their root flare) and rocks. */
```


Replace:

```ts

/** What the leaves drift against in the active mode (built once per mode). */
function driftSources(): Drifts {
  const spec = scaleSpec();
  if (drifts?.spec === spec) return drifts;
  const log = heroLog(spec);
  drifts = {
    spec,
    round: [
      ...treeSites().map((t) => ({ x: t.x, z: t.z, r: trunkRadiusOf(t, spec) * 1.3, peak: TRUNK_DRIFT })),
      ...rocks().map((k) => ({ x: k.x, z: k.z, r: k.size * 1.05, peak: rockDrift(k.size) })),
```

with:

```ts

/** What the leaves drift against (built once). */
function driftSources(): Drifts {
  if (drifts) return drifts;
  const log = heroLog();
  drifts = {
    round: [
      ...treeSites().map((t) => ({ x: t.x, z: t.z, r: trunkRadiusOf(t) * 1.3, peak: TRUNK_DRIFT })),
      ...rocks().map((k) => ({ x: k.x, z: k.z, r: k.size * 1.05, peak: rockDrift(k.size) })),
```



In `src/surface/obstacles.ts`:


Replace:

```ts
import { heroLog, LOG_END, LOG_FOOT, logEnd, rocks, ROCK_FOOT } from './propPlacement';
import { scaleSpec, type ScaleSpec } from './worldScale';
import { terrainHeight } from './terrain';
```

with:

```ts
import { heroLog, LOG_END, LOG_FOOT, logEnd, rocks, ROCK_FOOT } from './propPlacement';
import { terrainHeight } from './terrain';
```


Replace:

```ts
 * The solid things on the forest floor, as footprints on the ground (pure; Step 1b spec 4.4):
 * circles for the trunks (their root flare) and rocks, a capsule for the fallen log. Built from
 * the active ScaleSpec. The worm slides along them (crawl.ts), hero leaves are pushed back out of
 * them (heroObstacles.ts), and the camera stops short of the tall ones (crawl.ts).
```

with:

```ts
 * The solid things on the forest floor, as footprints on the ground (pure; Step 1b spec 4.4):
 * circles for the trunks (their root flare) and rocks, a capsule for the fallen log, at real
 * size. The worm slides along them (crawl.ts), hero leaves are pushed back out of
 * them (heroObstacles.ts), and the camera stops short of the tall ones (crawl.ts).
```


Replace:

```ts

let cache: { spec: ScaleSpec; fp: Footprints } | null = null;

/** The active mode's footprints (built once per mode). Read-only. */
export function footprints(): Footprints {
  const spec = scaleSpec();
  if (cache?.spec === spec) return cache.fp;
  const log = heroLog(spec);
  const fp: Footprints = {
    round: Float64Array.from([
      ...treeSites().flatMap((t) => [t.x, t.z, trunkFootOf(t, spec), Infinity]),
      ...rocks().flatMap((k) => [k.x, k.z, k.size * ROCK_FOOT, k.size * ROCK_TOP]),
    ]),
    log: {
      x: log.x, z: log.z, dx: Math.cos(log.yaw), dz: Math.sin(log.yaw), half: log.length / 2 + logEnd(spec),
      r: log.radius * LOG_FOOT, top: log.radius * LOG_TOP,
    },
  };
  cache = { spec, fp };
  return fp;
```

with:

```ts

let cache: Footprints | null = null;

/** The footprints (built once). Read-only. */
export function footprints(): Footprints {
  if (cache) return cache;
  const log = heroLog();
  const fp: Footprints = {
    round: Float64Array.from([
      ...treeSites().flatMap((t) => [t.x, t.z, trunkFootOf(t), Infinity]),
      ...rocks().flatMap((k) => [k.x, k.z, k.size * ROCK_FOOT, k.size * ROCK_TOP]),
    ]),
    log: {
      x: log.x, z: log.z, dx: Math.cos(log.yaw), dz: Math.sin(log.yaw), half: log.length / 2 + logEnd(),
      r: log.radius * LOG_FOOT, top: log.radius * LOG_TOP,
    },
  };
  cache = fp;
  return fp;
```



In `src/surface/propGeometry.ts`:


Replace:

```ts
 * A cluster of 3-5 mushrooms (honey mushrooms, or a red russula pair). `grow` scales the whole
 * cluster (the world scale mode's mushroom size, worldScale.ts); it draws no random numbers.
 */
```

with:

```ts
 * A cluster of 3-5 mushrooms (honey mushrooms, or a red russula pair). `grow` scales the whole
 * cluster (the real-size mushroom growth, realScale.ts); it draws no random numbers.
 */
```



Replace the whole of `src/surface/propPlacement.ts` with:

```ts
import { mulberry32 } from '../core/random';
import { PLAY_HALF } from './terrain';
import { treeSites, trunkFootOf } from './treeSites';
import { clearOfPaths } from './wormPaths';
import { REAL_SCALE, type LogSite, type RockSite } from './realScale';

/**
 * Where the forest-floor props go, at real size (realScale.ts). Pure. Everything stays out of the worm's way: the straight run ahead of the
 * spawn and the speed test's auto-drive loop (wormPaths.ts), the trailing camera, and the trunks.
 */
const TRUNK_CLEAR = 1.0;

/** True when a prop of `radius` at (x, z) is clear of the worm paths, trunks and world edge. */
export function keepsClear(x: number, z: number, radius: number): boolean {
  if (!clearOfPaths(x, z, radius)) return false;
  if (Math.abs(x) > PLAY_HALF - radius || Math.abs(z) > PLAY_HALF - radius) return false;
  // Each trunk keeps the larger of TRUNK_CLEAR and its footprint.
  return treeSites().every((t) => Math.hypot(x - t.x, z - t.z) > Math.max(TRUNK_CLEAR, trunkFootOf(t)) + radius);
}

/** A drawn rock reaches about this much past its size at ground level (its lumpy, wide flank). */
export const ROCK_FOOT = 1.2;
/** The drawn log is this much wider than its radius (bark lumps), at the height of the worm... */
export const LOG_FOOT = 1.15;
/** ...and its jagged broken ends reach this far past its length, per unit of its grow (writeLog). */
export const LOG_END = 0.18;

/** How far the log's broken ends reach past its length (LOG_END times its grow). */
export function logEnd(): number {
  return LOG_END * REAL_SCALE.log;
}

/** The hero prop, a mossy fallen paper birch: its radius and length at real size. */
export function heroLog(): LogSite {
  const s = REAL_SCALE.logSite;
  return { x: s.x, z: s.z, yaw: s.yaw, length: s.length * REAL_SCALE.log, radius: s.radius * REAL_SCALE.log };
}

/** Distance from (x, z) to the log's centre line. */
export function logSegmentDistance(x: number, z: number): number {
  const log = heroLog();
  const dx = Math.cos(log.yaw);
  const dz = Math.sin(log.yaw);
  const t = Math.max(-log.length / 2, Math.min(log.length / 2, (x - log.x) * dx + (z - log.z) * dz));
  return Math.hypot(x - (log.x + dx * t), z - (log.z + dz * t));
}

let rockCache: readonly RockSite[] | null = null;

/** Lichen-spotted granite boulders (glacial erratics), at their drawn size. */
export function rocks(): readonly RockSite[] {
  rockCache ??= REAL_SCALE.rocks.map((r) => ({ x: r.x, z: r.z, size: r.size * REAL_SCALE.rock }));
  return rockCache;
}

export type ClutterKind = 'mushrooms' | 'sedge' | 'fern';
export const CLUTTER_KINDS: readonly ClutterKind[] = ['mushrooms', 'sedge', 'fern'];

export interface ClutterItem { x: number; z: number; rot: number; scale: number; kind: ClutterKind }

/** How much bigger than its base size a clutter kind is drawn. */
export function clutterGrow(kind: ClutterKind): number {
  return kind === 'mushrooms' ? REAL_SCALE.mushroom : kind === 'fern' ? REAL_SCALE.fern : REAL_SCALE.sedge;
}

/** How far a clutter item of `kind` and `scale` reaches from its centre, as drawn. */
export function clutterRadius(kind: ClutterKind, scale: number): number {
  return (kind === 'fern' ? 0.6 : 0.3) * scale * clutterGrow(kind);
}

/**
 * How far a grown clutter item's base reaches from its centre, per unit of scale times grow: all
 * it draws below a tenth of its height, measured from propGeometry's writers over many seeds (a
 * fern's frond roots and drooping tips 0.47, a sedge tuft's blade roots 0.05). A mushroom cluster
 * is low, so it counts whole (0.65). Fronds and blades above the base may lean over a prop.
 */
export const CLUTTER_BASE: Readonly<Record<ClutterKind, number>> = { fern: 0.5, sedge: 0.1, mushrooms: 0.7 };

/** How far a clutter item's base reaches (CLUTTER_BASE). */
export function clutterBase(kind: ClutterKind, scale: number): number {
  return CLUTTER_BASE[kind] * scale * clutterGrow(kind);
}

/** Distance from (x, z) to the log's centre line, its broken ends included (as obstacles.ts). */
function logEndsDistance(x: number, z: number): number {
  const log = heroLog();
  const dx = Math.cos(log.yaw);
  const dz = Math.sin(log.yaw);
  const half = log.length / 2 + logEnd();
  const t = Math.max(-half, Math.min(half, (x - log.x) * dx + (z - log.z) * dz));
  return Math.hypot(x - (log.x + dx * t), z - (log.z + dz * t));
}

/** True when `c`'s base, as drawn, stands off every rock and the log (their drawn footprints). */
export function clutterBaseClear(c: ClutterItem): boolean {
  const r = clutterBase(c.kind, c.scale);
  return logEndsDistance(c.x, c.z) > heroLog().radius * LOG_FOOT + r
    && rocks().every((k) => Math.hypot(c.x - k.x, c.z - k.z) > k.size * ROCK_FOOT + r);
}

/**
 * A grown mushroom cluster beside the log gets this many seeded tries (alternating sides) to fit;
 * if none fits it is skipped, and the scatter fills its place.
 */
const LOG_MUSHROOM_TRIES = 40;

/** Every kind of clutter gets at least this many items, where they fit. */
const MIN_EACH = 3;

/**
 * Ground clutter: mushroom clusters, sedge tufts and fern clumps (REAL_SCALE's count and seed by
 * default). The first four are mushrooms growing beside the log (only those that fit apart: a
 * wide cluster that cannot find a spot in LOG_MUSHROOM_TRIES is skipped, so two remain); the rest
 * are scattered in random order, so any prefix (the density tiers draw a prefix) is an even
 * thinning. Each item keeps its base off the drawn rocks and log (clutterBaseClear). A fern needs
 * so much room that random spots rarely fit one, so a kind with fewer than MIN_EACH items then
 * takes over the last items of the commonest kind.
 */
export function placeClutter(count = REAL_SCALE.clutter, seed = REAL_SCALE.clutterSeed): ClutterItem[] {
  const log = heroLog();
  const rng = mulberry32(seed);
  const out: ClutterItem[] = [];
  const dx = Math.cos(log.yaw);
  const dz = Math.sin(log.yaw);
  // Along the log's middle stretch: the long log runs off into the distance.
  const stretch = Math.min(log.length, 8);
  for (let k = 0; k < Math.min(4, count); k++) {
    for (let tries = 0; tries < LOG_MUSHROOM_TRIES; tries++) {
      // The clusters wander along the log and stand off it by varied gaps, so they do not read as
      // a staged row.
      const along = (k / 3 - 0.5) * stretch * 0.7 + (rng() - 0.5) * stretch * 0.3;
      const side = (k + tries) % 2 === 0 ? 1 : -1;
      const gap = rng() * 0.6;
      const rot = rng() * Math.PI * 2;
      const scale = 0.8 + rng() * 0.4;
      // The whole cluster stands just off the drawn log, inside the world and off the rocks.
      const off = log.radius * LOG_FOOT + clutterBase('mushrooms', scale) + gap * REAL_SCALE.mushroom;
      const c: ClutterItem = {
        x: log.x + dx * along - dz * off * side,
        z: log.z + dz * along + dx * off * side,
        rot, scale, kind: 'mushrooms',
      };
      if (!(keepsClear(c.x, c.z, clutterBase('mushrooms', scale)) && clutterBaseClear(c))) continue;
      // The clusters are wide: one that would merge into an earlier one tries another spot.
      if (out.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < clutterBase('mushrooms', o.scale) + clutterBase('mushrooms', scale))) continue;
      out.push(c);
      break;
    }
  }
  const byLog = out.length;
  // A grown item's base must also stay inside the world (WORLD_HALF). keepsClear only holds its
  // spacing radius inside PLAY_HALF, and a mushroom's base is wider than that, so the world-edge
  // limit on bases is enforced by test only (propPlacement.test.ts, "inside the world").
  let guard = 0;
  while (out.length < count && guard++ < count * 200) {
    const x = (rng() * 2 - 1) * PLAY_HALF;
    const z = (rng() * 2 - 1) * PLAY_HALF;
    const pick = rng();
    const kind: ClutterKind = pick < 0.3 ? 'mushrooms' : pick < 0.72 ? 'sedge' : 'fern';
    const rot = rng() * Math.PI * 2;
    const scale = 0.7 + rng() * 0.6;
    const r = clutterRadius(kind, scale);
    if (keepsClear(x, z, r) && clutterBaseClear({ x, z, rot, scale, kind })) out.push({ x, z, rot, scale, kind });
  }
  for (const kind of CLUTTER_KINDS) {
    for (let tries = 0; tries < 4000 && out.filter((c) => c.kind === kind).length < MIN_EACH; tries++) {
      const x = (rng() * 2 - 1) * PLAY_HALF;
      const z = (rng() * 2 - 1) * PLAY_HALF;
      const rot = rng() * Math.PI * 2;
      const scale = 0.7 + rng() * 0.6;
      const r = clutterRadius(kind, scale);
      if (!keepsClear(x, z, r) || !clutterBaseClear({ x, z, rot, scale, kind })) continue;
      if (out.some((c) => c.kind === kind && Math.hypot(c.x - x, c.z - z) < r + clutterRadius(kind, c.scale))) continue;
      const most = CLUTTER_KINDS.reduce((a, b) => (out.filter((c) => c.kind === b).length > out.filter((c) => c.kind === a).length ? b : a));
      let last = out.length - 1;
      while (last >= byLog && out[last].kind !== most) last--;
      if (last < byLog) break;
      out[last] = { x, z, rot, scale, kind };
    }
  }
  return out;
}
```

Create `src/surface/realScale.ts`:

```ts
import type { LeafKind } from './leafLitter';

/**
 * Real size (V2 spec section 10; Matt, 2026-10-06): every size multiplier and the prop and tree
 * layout of the one world, the forest at real size next to a 15 cm earthworm. These are V1's True
 * numbers; V2 removed World scale (Classic and Hybrid live on only in V1, frozen at /v1/). The
 * multipliers are relative to the base sizes the prop and leaf writers draw at 1 (Step 1a's).
 *
 * The worm is 3.5 units long and stands for a 15 cm earthworm, so 1 cm is about 0.23 units. The
 * world stays 40 x 40 units.
 */

/** World units per real centimetre: the 3.5-unit worm is a 15 cm earthworm. */
export const UNITS_PER_CM = 3.5 / 15;

/** A near tree layout: `count` trunks, seeded, at least `clear` from the spawn. */
export interface TreeLayout { count: number; seed: number; clear: number }
/** A rock at base size; it is drawn `rock` times bigger. */
export interface RockSite { x: number; z: number; size: number }
/** The fallen log at base radius and length; `log` scales both. */
export interface LogSite { x: number; z: number; yaw: number; length: number; radius: number }

export interface RealScale {
  /** Size of every leaf (litter, detail, hero) per species, times its base size (LEAF_SIZE). */
  readonly leaf: Readonly<Record<LeafKind, number>>;
  /** Clutter sizes, times base. */
  readonly mushroom: number;
  readonly fern: number;
  readonly sedge: number;
  /** Rock size (about a rock's radius; it is twice that across), times base. */
  readonly rock: number;
  /** The fallen log's radius and length, times base. */
  readonly log: number;
  /** Trunk girth and height, times base. */
  readonly birch: number;
  readonly maple: number;
  readonly trees: TreeLayout;
  readonly rocks: readonly RockSite[];
  readonly logSite: LogSite;
  /** Ground clutter items at full density, and their seed. */
  readonly clutter: number;
  readonly clutterSeed: number;
  /** The distant tree ring: size times base, and how many. */
  readonly distantScale: number;
  readonly distantCount: number;
}

/**
 * Real leaf lengths (cm): aspen 5.5, a white ash leaflet 8, sugar maple 11, basswood 12, red oak
 * 15. A leaf is drawn LEAF_SIZE[kind] times 0.6 to 1.2 long (0.9 on average) at base size, so each
 * multiplier in REAL_SCALE.leaf is the real length in units over that average
 * (tests/unit/realScale.test.ts).
 */
export const REAL_LEAF_CM: Readonly<Record<LeafKind, number>> = { aspen: 5.5, ash: 8, maple: 11, basswood: 12, oak: 15 };

export const REAL_SCALE: RealScale = {
  leaf: { aspen: 1.426, ash: 1.975, maple: 1.840, basswood: 1.944, oak: 2.431 },
  mushroom: 3, fern: 7, sedge: 7, rock: 4, log: 9, birch: 9, maple: 11,
  trees: { count: 2, seed: 284, clear: 18 },
  // Glacial erratics, 17 to 41 cm across, placed around the trees and log, well away from the
  // worm's paths (tests/unit/propPlacement.test.ts).
  rocks: [
    { x: -9.5, z: -10, size: 1.2 },
    { x: 7, z: 5.5, size: 0.8 },
    { x: -7.5, z: 7, size: 0.7 },
    { x: 0, z: -15, size: 0.6 },
    { x: 0.5, z: -7, size: 0.5 },
  ],
  // A 40-unit fallen birch across the view, running off both edges.
  logSite: { x: 0, z: 15.5, yaw: 0, length: 4.4, radius: 0.32 },
  clutter: 24, clutterSeed: 5, distantScale: 9, distantCount: 14,
};
```

In `src/surface/terrainMesh.ts`:


Replace:

```ts
import { groundHeight, groundNormal, litterDepth } from './litterDepth';
import { scaleSpec, type ScaleSpec } from './worldScale';

```

with:

```ts
import { groundHeight, groundNormal, litterDepth } from './litterDepth';

```


Replace:

```ts

let gridCache: { spec: ScaleSpec; lines: number[]; heights: Float64Array } | null = null;

/**
 * The grid lines and the height at every grid vertex (soil plus litter mound), built once per
 * scale mode (the litter drifts against the mode's props). Read-only.
 */
export function heightGrid(): { lines: number[]; heights: Float64Array } {
  const spec = scaleSpec();
  if (gridCache?.spec === spec) return gridCache;
  const lines = gridLines();
```

with:

```ts

let gridCache: { lines: number[]; heights: Float64Array } | null = null;

/** The grid lines and the height at every grid vertex (soil plus litter mound), built once. Read-only. */
export function heightGrid(): { lines: number[]; heights: Float64Array } {
  if (gridCache) return gridCache;
  const lines = gridLines();
```


Replace:

```ts
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) heights[j * n + i] = groundHeight(lines[i], lines[j]);
  gridCache = { spec, lines, heights };
  return gridCache;
```

with:

```ts
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) heights[j * n + i] = groundHeight(lines[i], lines[j]);
  gridCache = { lines, heights };
  return gridCache;
```



In `src/surface/treeShadows.ts`:


Replace:

```ts

/** The active mode's near trees as shadow casters (approximate trunk radii by species). */
export function shadowCasters(): ShadowCaster[] {
```

with:

```ts

/** The near trees as shadow casters (approximate trunk radii by species). */
export function shadowCasters(): ShadowCaster[] {
```



In `src/surface/treeSites.ts`:


Replace:

```ts
import { LOOP, LOOP_MARGIN } from './wormPaths';
import { scaleSpec, type ScaleSpec, type TreeLayout } from './worldScale';

```

with:

```ts
import { LOOP, LOOP_MARGIN } from './wormPaths';
import { REAL_SCALE, type TreeLayout } from './realScale';

```


Replace:

```ts

/** A Classic trunk's radius above its root flare: paper birch and sugar maple. */
export const TRUNK_RADIUS = { birch: 0.32, maple: 0.48 } as const;
/**
 * The widest a Classic trunk gets near the ground (its root flare and buttresses, up to the worm's
 * height), measured from the drawn trunks: what the worm and the hero leaves cannot pass through
```

with:

```ts

/** A trunk's base radius above its root flare (times REAL_SCALE's birch or maple): paper birch and sugar maple. */
export const TRUNK_RADIUS = { birch: 0.32, maple: 0.48 } as const;
/**
 * The widest a base-size trunk gets near the ground (its root flare and buttresses, up to the worm's
 * height), measured from the drawn trunks: what the worm and the hero leaves cannot pass through
```


Replace:

```ts

/** A tree's radius above its flare in `spec`'s mode (trunk shadows, litter drifts). */
export function trunkRadiusOf(t: TreeSite, spec: ScaleSpec = scaleSpec()): number {
  return t.birch ? TRUNK_RADIUS.birch * spec.birch : TRUNK_RADIUS.maple * spec.maple;
}

/** A tree's footprint at the ground in `spec`'s mode. */
export function trunkFootOf(t: TreeSite, spec: ScaleSpec = scaleSpec()): number {
  if (!t.birch) return TRUNK_FOOT.maple * spec.maple;
  return (t.clump ? TRUNK_FOOT.clump : TRUNK_FOOT.birch) * spec.birch;
}
```

with:

```ts

/** A tree's radius above its flare at real size (trunk shadows, litter drifts). */
export function trunkRadiusOf(t: TreeSite): number {
  return t.birch ? TRUNK_RADIUS.birch * REAL_SCALE.birch : TRUNK_RADIUS.maple * REAL_SCALE.maple;
}

/** A tree's footprint at the ground at real size. */
export function trunkFootOf(t: TreeSite): number {
  if (!t.birch) return TRUNK_FOOT.maple * REAL_SCALE.maple;
  return (t.clump ? TRUNK_FOOT.clump : TRUNK_FOOT.birch) * REAL_SCALE.birch;
}
```


Replace:

```ts
 * Near-tree positions (pure): `count` sites from `seed`, birch and maple in turn, at least `clear`
 * from the spawn and with their footprint (plus a body width) off the speed test's loop. Classic's
 * layout (14, seed 7, clear 4) is the Step 1a forest. The bigger modes keep the spawn's straight
 * run clear by `clear` alone (tests/unit/propPlacement.test.ts).
 */
export function placeTrees(layout: TreeLayout, spec: ScaleSpec): TreeSite[] {
  const rng = mulberry32(layout.seed);
```

with:

```ts
 * Near-tree positions (pure): `count` sites from `seed`, birch and maple in turn, at least `clear`
 * from the spawn and with their footprint (plus a body width) off the speed test's loop. The
 * spawn's straight run is kept clear by `clear` alone (tests/unit/propPlacement.test.ts).
 */
export function placeTrees(layout: TreeLayout): TreeSite[] {
  const rng = mulberry32(layout.seed);
```


Replace:

```ts
    const clump = CLUMPS.has(i);
    const foot = trunkFootOf({ x: 0, z: 0, birch, clump }, spec);
    let x = 0;
```

with:

```ts
    const clump = CLUMPS.has(i);
    const foot = trunkFootOf({ x: 0, z: 0, birch, clump });
    let x = 0;
```


Replace:

```ts

let cache: { spec: ScaleSpec; sites: readonly TreeSite[] } | null = null;

/** The active mode's near trees (built once per mode). Read-only. */
export function treeSites(): readonly TreeSite[] {
  const spec = scaleSpec();
  if (cache?.spec !== spec) cache = { spec, sites: placeTrees(spec.trees, spec) };
  return cache.sites;
}
```

with:

```ts

let cache: readonly TreeSite[] | null = null;

/** The near trees (built once). Read-only. */
export function treeSites(): readonly TreeSite[] {
  cache ??= placeTrees(REAL_SCALE.trees);
  return cache;
}
```



Delete `src/surface/worldScale.ts` (`git rm src/surface/worldScale.ts`).

In `docs/superpowers/visual-quality-brief.md`:


Replace:

```markdown
- **Scale is part of realism.** The worm is about 3.5 units long and 0.23 wide, and props must
  be sized to match. A real fallen log or mushroom cap is large next to an earthworm, and True
  mode draws them that way (see "World scale" below).
- **The worm has no eyes.** Expression comes from body motion and the moving prostomium.
```

with:

```markdown
- **Scale is part of realism.** The worm is about 3.5 units long and 0.23 wide, and props must
  be sized to match. A real fallen log or mushroom cap is large next to an earthworm, and the
  game draws them that way (see "Real size" below).
- **The worm has no eyes.** Expression comes from body motion and the moving prostomium.
```


Replace:

```markdown

## World scale (V1 onward)
- The forest is drawn in three modes (Classic, Hybrid, True) from one table,
  `src/surface/worldScale.ts`. True is the default. Only that table knows which mode is on.
- **Judge every visual change in True and Hybrid, not just Classic.** Big leaves, 4x rocks and
  9x trunks show problems that Classic hides: lids, polygon edges, bark stretch, sinking leaves
  and the camera crowding a trunk.
- Classic must stay Step 1a byte for byte: hash tests pin it (Step 1b spec 4.7).
- Reference screenshots of each mode, and of True's big-leaf lid, are in
  `docs/codev/versions/v01-true-size/` (`classic.jpg`, `hybrid.jpg`, `true.jpg`, `true-lid.jpg`).
  Use `?scale=classic|hybrid|true` to compare.

```

with:

```markdown

## Real size (V2 onward)
- V2 removed World scale (Matt, 2026-10-06): the forest is drawn at real size only, next to a
  15 cm worm. The sizes and the prop layout live in `src/surface/realScale.ts`; nothing branches
  on a mode. V1 keeps Classic, Hybrid and True, frozen at `/v1/`.
- Big leaves, 4x rocks and 9x trunks show problems a small world hides: lids, polygon edges, bark
  stretch, sinking leaves and the camera crowding a trunk. Judge every visual change at real size.
- Reference screenshots of V1's modes, and of True's big-leaf lid, are in
  `docs/codev/versions/v01-true-size/`.

```


Replace:

```markdown
    back to back with the Step 0 page, and its median fps ratio must clear the gate: Low 1.09,
    Medium 0.87, High 0.74, Ultra 0.61. It runs every preset in True and in Classic
    (`--scale=hybrid` for another mode; `--list` shows the run order).
  - For a single run, use `node scripts/bench.mjs . <label> "?speedtest=1&preset=high"`.
```

with:

```markdown
    back to back with the Step 0 page, and its median fps ratio must clear the gate: Low 1.09,
    Medium 0.87, High 0.74, Ultra 0.61 (`--list` shows the run order).
  - For a single run, use `node scripts/bench.mjs . <label> "?speedtest=1&preset=high"`.
```

- [ ] **Step 4: The layout is unchanged**

Run: `PROBE_OUT=.cache/probe-after.json npx vitest run tests/unit/zzLayoutProbe.test.ts && diff .cache/probe-before.json .cache/probe-after.json && echo IDENTICAL && rm tests/unit/zzLayoutProbe.test.ts`
Expected: `IDENTICAL`, and the probe file is deleted.

- [ ] **Step 5: Run everything**

Run: `npx tsc --noEmit && npx vitest run && npm run verify:build && npm run test:e2e`
Expected: types clean; **64 files, 598 tests** (−3 files: `worldScale`, the three Classic and Hybrid camera presses, +1 `realScale`; −154 tests, nearly all of them the same tests run once per mode); `single-file build OK`; **28 passed, 1 skipped** (no change).
Also: `grep -rn "worldScale\|scaleSpec\|setScale\|SCALE_SPECS" src tests scripts` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add src/surface/realScale.ts src/surface/treeSites.ts src/surface/propPlacement.ts src/surface/obstacles.ts \
  src/surface/litterDepth.ts src/surface/terrainMesh.ts src/surface/leafScale.ts src/surface/leafLitterMesh.ts \
  src/surface/detailLeaves.ts src/surface/heroPool.ts src/surface/forestTrees.ts src/surface/distantTrees.ts \
  src/surface/groundProps.ts src/surface/propGeometry.ts src/surface/treeShadows.ts src/render/litterTexture.ts \
  src/render/groundTexture.ts src/game/crawl.ts docs/superpowers/visual-quality-brief.md \
  tests/unit/realScale.test.ts tests/unit/propPlacement.test.ts tests/unit/scaledProps.test.ts \
  tests/unit/cameraPressTrue.test.ts tests/unit/cameraPress.ts tests/unit/cameraClearance.test.ts \
  tests/unit/playEdge.test.ts tests/unit/solidProps.test.ts tests/unit/disturbReach.test.ts \
  tests/unit/disturbance.test.ts tests/unit/heroLeafClearance.test.ts tests/unit/heroLeaves.test.ts \
  tests/unit/heroObstacles.test.ts tests/unit/heroShortcuts.test.ts tests/unit/leafGlsl.test.ts \
  tests/unit/leafJitter.test.ts tests/unit/litterPlacement.test.ts tests/unit/nearClutter.test.ts \
  tests/unit/sceneTiers.test.ts tests/unit/treeShadows.test.ts tests/unit/detailLeaves.test.ts \
  tests/e2e/glslParity.spec.ts tests/e2e/disturbParity.spec.ts
git commit -m "refactor(v2): real size is the only world (realScale.ts replaces the World scale table)

Classic's hash tests and the Classic and Hybrid camera tests retire with Classic; real-size guards replace
the ones that still protect something.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---


### Task 4: The content system (`src/content/`)

**Files:**
- Create: `src/content/sources.ts`, `src/content/text.ts`, `tests/unit/content.test.ts`
- Modify: `src/ui/menus.ts` (the crawl hint comes from `TEXT`)

Spec 2b and contract section 1. `sources.ts` seeds nine sources from `docs/codev/research/mn-forest-floor.md` (including the contract's `wormwatch-ecogroups`, `mndnr-humus` and `wormwatch-forest`), each checked 2026-10-04 (the date the research notes were written from them). `text.ts` holds every student-facing line as `ui`, `fact` (a known `SourceId` and `verified: true`, enforced by the type) or `gameChoice` (shown with "Game choice: "), with exactly the contract's keys and words, plus `crawlHint` (V1's crawl hint, moved in; the same words). `lineProblems()` is the run-time guard the build's unit test runs over `TEXT`; it also catches casts and JSON the types cannot see. There are no `fact` lines yet: V2's facts live on the slides.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/content.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SOURCES } from '../../src/content/sources';
import { TEXT, GAME_CHOICE_PREFIX, lineProblems, shown, type Line } from '../../src/content/text';

describe('content: science honesty', () => {
  it('every shown line is labelled, and every fact is sourced and verified', () => {
    expect(lineProblems(TEXT)).toEqual([]);
  });

  it('catches an unsourced or unverified fact, an empty line and a doubled prefix', () => {
    // As a later edit might slip past the types (a cast, a JSON import).
    const bad = {
      noSource: { kind: 'fact', text: 'Worms eat leaves.', source: 'my-blog', verified: true },
      unchecked: { kind: 'fact', text: 'Worms eat leaves.', source: 'wormwatch-ecogroups', verified: false },
      empty: { kind: 'ui', text: '  ' },
      twice: { kind: 'gameChoice', text: 'Game choice: worms fly.' },
      odd: { kind: 'rumour', text: 'Worms sing.' },
    } as unknown as Record<string, Line>;
    expect(lineProblems(bad)).toEqual([
      'noSource: unknown source "my-blog"',
      'unchecked: not verified',
      'empty: empty',
      'twice: has the game-choice prefix twice',
      'odd: unknown kind',
    ]);
  });

  it('the types reject a fact without a verified source', () => {
    // @ts-expect-error a fact needs a source
    const a: Line = { kind: 'fact', text: 'x', verified: true };
    // @ts-expect-error a fact must be verified: true
    const b: Line = { kind: 'fact', text: 'x', source: 'mndnr-humus', verified: false };
    // @ts-expect-error a fact's source must be a known SourceId
    const c: Line = { kind: 'fact', text: 'x', source: 'my-blog', verified: true };
    expect([a, b, c]).toHaveLength(3);
  });

  it('every source has a title, publisher, https link and a checked date', () => {
    for (const [id, s] of Object.entries(SOURCES)) {
      expect(s.title.length, id).toBeGreaterThan(0);
      expect(s.publisher.length, id).toBeGreaterThan(0);
      expect(s.url, id).toMatch(/^https:\/\/\S+$/);
      expect(s.checked, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(Object.keys(SOURCES)).toEqual(expect.arrayContaining(['wormwatch-ecogroups', 'mndnr-humus', 'wormwatch-forest']));
  });

  it('a game choice is shown labelled; other lines as written', () => {
    expect(shown(TEXT.burrowChoice)).toBe(
      'Game choice: real nightcrawlers dig one deep up-and-down burrow. In the game you can dig any way you like.',
    );
    expect(GAME_CHOICE_PREFIX).toBe('Game choice: ');
    expect(shown(TEXT.digDown)).toBe('Dig down');
  });

  it('has the words V2\'s screens use (the plans\' contract)', () => {
    const words = Object.fromEntries(Object.entries(TEXT).map(([k, l]) => [k, shown(l)]));
    expect(words).toMatchObject({
      digDown: 'Dig down',
      comeUp: 'Come up',
      viewWide: 'Wide view',
      viewClose: 'Close view',
      layerLitter: 'Leaf litter',
      layerOld: 'Old leaves',
      layerHumus: 'Humus',
      layerTopsoil: 'Topsoil',
      layerSubsoil: 'Subsoil',
      undergroundHint: 'Point the way to dig with the arrow keys, W A S D, or the joystick. Space: switch view, or come up near the top. Esc or P: pause.',
    });
    for (const k of ['digDown', 'comeUp', 'viewWide', 'viewClose', 'layerLitter', 'layerOld', 'layerHumus', 'layerTopsoil', 'layerSubsoil', 'undergroundHint'] as const) {
      expect(TEXT[k].kind).toBe('ui');
    }
    expect(TEXT.burrowChoice.kind).toBe('gameChoice');
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/unit/content.test.ts`
Expected: FAIL: `Failed to resolve import "../../src/content/sources"`.

- [ ] **Step 3: Implement**

Create `src/content/sources.ts`:

```ts
/**
 * Every source a student-facing fact may cite (science honesty, CLAUDE.md; V2 spec 2b). A fact in
 * src/content/text.ts names one of these by its id, and the build fails without it
 * (tests/unit/content.test.ts). Seeded from docs/codev/research/mn-forest-floor.md; `checked` is
 * the date someone last opened the page and read what the fact says. Re-check a source, and
 * update `checked`, before a new fact cites it.
 */
export interface Source {
  /** The page's title, as the publisher gives it. */
  readonly title: string;
  readonly publisher: string;
  readonly url: string;
  /** When it was last checked: YYYY-MM-DD. */
  readonly checked: string;
}

export type SourceId =
  | 'mndnr-humus'
  | 'mndnr-earthworms'
  | 'wormwatch-forest'
  | 'wormwatch-soil'
  | 'wormwatch-ecogroups'
  | 'wormwatch-vertebrates'
  | 'wormwatch-invertebrates'
  | 'umn-earthworm-problems'
  | 'hale-2005';

export const SOURCES: Readonly<Record<SourceId, Source>> = {
  'mndnr-humus': {
    title: 'Humus Types',
    publisher: 'Minnesota DNR, Division of Forestry',
    url: 'https://files.dnr.state.mn.us/forestry/ecssilviculture/forms_worksheet/humus-types.pdf',
    checked: '2026-10-04',
  },
  'mndnr-earthworms': {
    title: 'Earthworms',
    publisher: 'Minnesota DNR',
    url: 'https://www.dnr.state.mn.us/invasives/terrestrialanimals/earthworms/index.html',
    checked: '2026-10-04',
  },
  'wormwatch-forest': {
    title: 'About the Forest',
    publisher: 'Great Lakes Worm Watch, University of Minnesota Duluth',
    url: 'https://wormwatch.d.umn.edu/forest-ecology-and-worms/forest-ecology/about-forest',
    checked: '2026-10-04',
  },
  'wormwatch-soil': {
    title: 'Soil and Worms',
    publisher: 'Great Lakes Worm Watch, University of Minnesota Duluth',
    url: 'https://wormwatch.d.umn.edu/forest-ecology-and-worms/soil-and-forest-floor/soil-and-worms',
    checked: '2026-10-04',
  },
  'wormwatch-ecogroups': {
    title: 'Earthworm Ecological Groups',
    publisher: 'Great Lakes Worm Watch, University of Minnesota Duluth',
    url: 'https://wormwatch.d.umn.edu/worm-id/earthworm-ecological-groups',
    checked: '2026-10-04',
  },
  'wormwatch-vertebrates': {
    title: 'Vertebrate Animals',
    publisher: 'Great Lakes Worm Watch, University of Minnesota Duluth',
    url: 'https://wormwatch.d.umn.edu/forest-ecology-and-worms/animals/vertebrate-animals',
    checked: '2026-10-04',
  },
  'wormwatch-invertebrates': {
    title: 'Macroinvertebrate Animals',
    publisher: 'Great Lakes Worm Watch, University of Minnesota Duluth',
    url: 'https://wormwatch.d.umn.edu/forest-ecology-and-worms/animals/macroinvertebrate-animals',
    checked: '2026-10-04',
  },
  'umn-earthworm-problems': {
    title: 'European earthworms cause big problems in North American forests',
    publisher: 'University of Minnesota',
    url: 'https://twin-cities.umn.edu/news-events/european-earthworms-cause-big-problems-north-american-forests',
    checked: '2026-10-04',
  },
  'hale-2005': {
    title: 'Exotic European earthworm invasion dynamics in northern hardwood forests of Minnesota, USA',
    publisher: 'Hale, Frelich, Reich and Pastor, Ecological Applications (2005)',
    url: 'https://esajournals.onlinelibrary.wiley.com/doi/abs/10.1890/03-5345',
    checked: '2026-10-04',
  },
};
```

Create `src/content/text.ts`:

```ts
import { SOURCES, type SourceId } from './sources';

/**
 * Every line the game shows a student (science honesty, CLAUDE.md; V2 spec 2b). A line is one of:
 * - `ui`: a label or instruction, no claim about the world;
 * - `fact`: a claim about real worms or forests: it names its source (src/content/sources.ts)
 *   and is `verified: true` once someone has checked the source says it;
 * - `gameChoice`: something the game does that real worms do not; shown with "Game choice: ".
 * The types reject a fact without a source or with `verified` other than true, and
 * tests/unit/content.test.ts checks the same at run time (lineProblems).
 */
export type Line =
  | { readonly kind: 'ui'; readonly text: string }
  | { readonly kind: 'fact'; readonly text: string; readonly source: SourceId; readonly verified: true }
  | { readonly kind: 'gameChoice'; readonly text: string };

/** Shown before every game-choice line. */
export const GAME_CHOICE_PREFIX = 'Game choice: ';

export const TEXT = {
  crawlHint: { kind: 'ui', text: 'Crawl with the arrow keys, W A S D, or the joystick. Press Esc or P to pause.' },
  digDown: { kind: 'ui', text: 'Dig down' },
  comeUp: { kind: 'ui', text: 'Come up' },
  viewWide: { kind: 'ui', text: 'Wide view' },
  viewClose: { kind: 'ui', text: 'Close view' },
  layerLitter: { kind: 'ui', text: 'Leaf litter' },
  layerOld: { kind: 'ui', text: 'Old leaves' },
  layerHumus: { kind: 'ui', text: 'Humus' },
  layerTopsoil: { kind: 'ui', text: 'Topsoil' },
  layerSubsoil: { kind: 'ui', text: 'Subsoil' },
  undergroundHint: {
    kind: 'ui',
    text: 'Point the way to dig with the arrow keys, W A S D, or the joystick. Space: switch view, or come up near the top. Esc or P: pause.',
  },
  burrowChoice: {
    kind: 'gameChoice',
    text: 'real nightcrawlers dig one deep up-and-down burrow. In the game you can dig any way you like.',
  },
} as const satisfies Record<string, Line>;

export type TextKey = keyof typeof TEXT;

/** The string the player sees: a game-choice line is labelled "Game choice: ". */
export function shown(line: Line): string {
  return line.kind === 'gameChoice' ? GAME_CHOICE_PREFIX + line.text : line.text;
}

/**
 * Everything wrong with `lines` (empty: all fine): a fact whose source is not in SOURCES or that
 * is not verified, any empty line, and a game-choice line that already starts with the prefix.
 * The build's guard (tests/unit/content.test.ts) runs it over TEXT.
 */
export function lineProblems(lines: Readonly<Record<string, Line>>): string[] {
  const out: string[] = [];
  for (const [key, line] of Object.entries(lines)) {
    if (!line.text.trim()) out.push(`${key}: empty`);
    if (line.kind === 'fact') {
      if (!Object.prototype.hasOwnProperty.call(SOURCES, line.source)) out.push(`${key}: unknown source "${String(line.source)}"`);
      if (line.verified !== true) out.push(`${key}: not verified`);
    } else if (line.kind === 'gameChoice') {
      if (line.text.startsWith(GAME_CHOICE_PREFIX.trim())) out.push(`${key}: has the game-choice prefix twice`);
    } else if (line.kind !== 'ui') {
      out.push(`${key}: unknown kind`);
    }
  }
  return out;
}
```

In `src/ui/menus.ts`:


Replace:

```ts
import { VERSION_LABEL } from '../version';

```

with:

```ts
import { VERSION_LABEL } from '../version';
import { TEXT, shown } from '../content/text';

```


Replace:

```ts
    icon('drive', 'hint-icon'),
    el('span', 'Crawl with the arrow keys, W A S D, or the joystick. Press Esc or P to pause.'),
  );
```

with:

```ts
    icon('drive', 'hint-icon'),
    el('span', shown(TEXT.crawlHint)),
  );
```

- [ ] **Step 4: Run everything**

Run: `npx tsc --noEmit && npx vitest run && npm run verify:build && npm run test:e2e`
Expected: types clean (the three `@ts-expect-error` lines are needed: the types reject those facts); **65 files, 604 tests** (+1 file, +6); `single-file build OK`; **28 passed, 1 skipped** (the crawl hint's words are unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/content/sources.ts src/content/text.ts src/ui/menus.ts tests/unit/content.test.ts
git commit -m "feat(v2): content system: every shown line labelled, facts sourced and verified

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---


### Task 5: The Action prompt and the touch Action button

**Files:**
- Create: `src/ui/actionPrompt.ts`, `src/input/actionEdge.ts`, `tests/unit/actionEdge.test.ts`, `tests/e2e/actionPrompt.spec.ts`
- Modify: `src/ui/icons.ts` (one icon per kind), `src/ui/hud.css`, `src/input/keyboard.ts`, `src/game/params.ts`, `src/main.ts`, `tests/unit/params.test.ts`

Contract section 2, exactly: `ActionKind`, `ActionPrompt { set; touchHeld; dispose }`, `createActionPrompt(root)`, `createPressEdge()`, icons in `icons.ts`. Plus `endStep()` (the lead's request, "Read this first" item 3).

How it looks and behaves (spec 2b, parent spec 7):
- One real `<button>` in the HUD, bottom right: an icon (`aria-hidden`), the word from `TEXT` as plain text in its own span (Plan B's e2e finds it by that exact word, for example `getByRole('button', { name: 'Dig down' })`), and an `aria-hidden` "Space" key chip, with `aria-keyshortcuts="Space"`. On a touch-only screen (`hover: none` and `pointer: coarse`) the chip is hidden and the button grows to 84 px. It is at least 72 px tall everywhere (64 px is the floor), 22 to 24 px bold ink on the primary gold (9:1 at its darkest shade).
- `tabindex=-1`: it never takes keyboard focus, so Space (already Action) never also "clicks" it, and the crawl's focus stays on the card. A mouse or pen press works like a touch.
- Shown only on the crawl screen (`hud.css`), hidden by `set(null)`. No pulse, no animation of its own; the shared button press transition is turned off by the reduced-motion rule.
- `set()` returns at once when the kind is unchanged: no DOM write, no allocation. It swaps prebuilt icons by `hidden` and writes the word only on a change.
- `touchHeld` is true while the button is held and also from any press until the next `endStep()`; `main.ts` calls `endStep()` (and `KeyboardInput.endStep()`, which latches keys the same way) after every step. So one tap or key press is always one Action press, however short, even when several steps run in one slow frame. A release and a new press between two steps still merge into one (rare: a double tap faster than a frame).
- `main.ts` builds this step's `Commands` in `commands()`: the keyboard, the joystick and `touchHeld` merged, so `Commands.action` = Space or the button. Gameplay still only sees `Commands`; Plan B reads `commands().action` with its own `createPressEdge()`.
- Nothing calls `set()` with a kind except tests and the `?prompt=` hook (it shows one kind while crawling and counts presses on `#app` as `data-action-presses`, for the e2e test and screenshots).

- [ ] **Step 1: Write the failing tests**

Create `tests/e2e/actionPrompt.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PAGE = pathToFileURL(path.resolve('dist/index.html')).href;

/** WCAG relative luminance of an `rgb(r, g, b)` colour. */
function luminance(rgb: string): number {
  const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map((v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

const prompt = (page: Page) => page.locator('.action-prompt');
const presses = (page: Page) => page.locator('#app').getAttribute('data-action-presses');

async function crawl(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Crawl', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Crawling' })).toBeVisible();
  // The first crawling frames compile the litter's reacting shader (a second or more in software
  // WebGL): let them pass, so presses land in steady frames.
  await page.waitForTimeout(1500);
}

test.describe('on a touch screen', () => {
  test.use({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true });

  test('the Action button shows, big, bottom right, clear of the joystick; a tap is one Action press', async ({ page }) => {
    await page.goto(PAGE + '?prompt=digDown');
    await expect(prompt(page)).toBeHidden();
    await crawl(page);
    const btn = page.getByRole('button', { name: 'Dig down' });
    await expect(btn).toBeVisible();
    // No keyboard here: no key chip.
    await expect(page.locator('.action-key')).toBeHidden();
    const box = (await btn.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(64);
    expect(box.width).toBeGreaterThanOrEqual(64);
    expect(box.x + box.width).toBeGreaterThan(300);
    expect(box.y + box.height).toBeGreaterThan(560);
    const stick = (await page.locator('.joystick').boundingBox())!;
    expect(box.x).toBeGreaterThan(stick.x + stick.width);
    expect(await presses(page)).toBeNull();
    await btn.tap();
    await expect.poll(() => presses(page)).toBe('1');
    await btn.tap();
    await expect.poll(() => presses(page)).toBe('2');
  });

  test('every kind fits beside the joystick at 360 px', async ({ page }) => {
    for (const kind of ['digDown', 'comeUp', 'viewWide', 'viewClose']) {
      await page.goto(PAGE + `?prompt=${kind}`);
      await crawl(page);
      await expect(prompt(page)).toBeVisible();
      const box = (await prompt(page).boundingBox())!;
      const stick = (await page.locator('.joystick').boundingBox())!;
      expect(box.x, kind).toBeGreaterThan(stick.x + stick.width);
      expect(box.x + box.width, kind).toBeLessThanOrEqual(360);
    }
  });
});

test('with a keyboard: icon, word and a Space chip; Space presses Action once per press; it never takes focus', async ({ page }) => {
  await page.goto(PAGE + '?prompt=comeUp');
  await crawl(page);
  const btn = page.getByRole('button', { name: 'Come up' });
  await expect(btn).toBeVisible();
  await expect(btn).toHaveAttribute('aria-keyshortcuts', 'Space');
  await expect(page.locator('.action-key')).toBeVisible();
  await expect(page.locator('.action-key')).toHaveText('Space');
  // 18 px+ text at 7:1 or better against the button's darkest shade (#f4b244).
  const style = await btn.locator('.btn-label').evaluate((e) => {
    const s = getComputedStyle(e);
    return { size: parseFloat(s.fontSize), color: s.color };
  });
  expect(style.size).toBeGreaterThanOrEqual(18);
  expect(contrast(style.color, 'rgb(244, 178, 68)')).toBeGreaterThanOrEqual(7);
  expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(64);
  // Space is Action; holding it is one press.
  await page.keyboard.down('Space');
  await page.waitForTimeout(400);
  await page.keyboard.up('Space');
  await expect.poll(() => presses(page)).toBe('1');
  // A quick tap (down and up between two game steps) is still one press.
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await expect.poll(() => presses(page)).toBe('2');
  // A mouse press on it is an Action press too.
  await btn.click();
  await expect.poll(() => presses(page)).toBe('3');
  // It never takes keyboard focus (Space must not also "click" it).
  await expect(btn).not.toBeFocused();
  await expect(btn).toHaveAttribute('tabindex', '-1');
  // It goes with the crawl: hidden when paused.
  await page.keyboard.press('Escape');
  await expect(btn).toBeHidden();
});

test('no prompt shows while crawling unless the game sets one', async ({ page }) => {
  await page.goto(PAGE);
  await crawl(page);
  await page.waitForTimeout(300);
  await expect(prompt(page)).toBeHidden();
});
```

Create `tests/unit/actionEdge.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createPressEdge } from '../../src/input/actionEdge';

describe('createPressEdge', () => {
  it('is true only on the step the level goes down', () => {
    const e = createPressEdge();
    const seen = [false, true, true, true, false, false, true, false, true].map((l) => e.update(l));
    expect(seen).toEqual([false, true, false, false, false, false, true, false, true]);
  });

  it('a level held from the first step counts as one press', () => {
    const e = createPressEdge();
    expect(e.update(true)).toBe(true);
    expect(e.update(true)).toBe(false);
  });

  it('each edge detector keeps its own state', () => {
    const a = createPressEdge();
    const b = createPressEdge();
    expect(a.update(true)).toBe(true);
    expect(b.update(true)).toBe(true);
  });
});
```

In `tests/unit/params.test.ts`:


Replace:

```ts
  it('defaults: no forced preset, no fps tag, not quick, Start screen', () => {
    expect(parseParams('')).toEqual({ preset: null, fps: false, quick: false, speedTest: false });
  });
  it('reads ?preset=, ?fps=1, ?quick=1 and ?speedtest=1', () => {
    expect(parseParams('?preset=ultra&fps=1&quick=1&speedtest=1'))
      .toEqual({ preset: 'ultra', fps: true, quick: true, speedTest: true });
  });
```

with:

```ts
  it('defaults: no forced preset, no fps tag, not quick, Start screen', () => {
    expect(parseParams('')).toEqual({ preset: null, fps: false, quick: false, speedTest: false, prompt: null });
  });
  it('reads ?preset=, ?fps=1, ?quick=1 and ?speedtest=1', () => {
    expect(parseParams('?preset=ultra&fps=1&quick=1&speedtest=1'))
      .toEqual({ preset: 'ultra', fps: true, quick: true, speedTest: true, prompt: null });
  });
```


Replace:

```ts
  it('ignores V1\'s ?scale= (V2 is real size only)', () => {
    expect(parseParams('?scale=classic&preset=low')).toEqual({ preset: 'low', fps: false, quick: false, speedTest: false });
  });
```

with:

```ts
  it('ignores V1\'s ?scale= (V2 is real size only)', () => {
    expect(parseParams('?scale=classic&preset=low')).toEqual({ preset: 'low', fps: false, quick: false, speedTest: false, prompt: null });
  });
  it('reads ?prompt= (tests and screenshots) and ignores an unknown kind', () => {
    expect(parseParams('?prompt=digDown').prompt).toBe('digDown');
    expect(parseParams('?prompt=viewClose').prompt).toBe('viewClose');
    expect(parseParams('?prompt=fly').prompt).toBeNull();
  });
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/actionEdge.test.ts tests/unit/params.test.ts`
Expected: FAIL: `Failed to resolve import "../../src/input/actionEdge"`, and `parseParams` has no `prompt`.

- [ ] **Step 3: Implement**

Replace the whole of `src/game/params.ts` with:

```ts
import { isPresetId, type PresetId } from '../render/graphics';
import type { ActionKind } from '../ui/actionPrompt';

const ACTION_KINDS: readonly string[] = ['digDown', 'comeUp', 'viewWide', 'viewClose'] satisfies ActionKind[];

export interface GameParams {
  /** `?preset=low|medium|high|ultra`: forces a preset for this session (benchmarks). Not saved. */
  preset: PresetId | null;
  /** `?fps=1`: show the fps tag while crawling. */
  fps: boolean;
  /** `?quick=1`: a short speed test (automated tests). */
  quick: boolean;
  /** `?speedtest=1`: open straight on the speed test screen (Chromebook checks, benchmarks). */
  speedTest: boolean;
  /**
   * `?prompt=digDown|comeUp|viewWide|viewClose`: shows the Action prompt with that kind while
   * crawling, and counts Action presses on the page (data-action-presses). For tests and
   * screenshots only; the game itself sets the prompt from where the worm is.
   */
  prompt: ActionKind | null;
}

export function parseParams(search: string): GameParams {
  const p = new URLSearchParams(search);
  const preset = p.get('preset');
  const prompt = p.get('prompt');
  return {
    preset: isPresetId(preset) ? preset : null,
    fps: p.get('fps') === '1',
    quick: p.get('quick') === '1',
    speedTest: p.get('speedtest') === '1',
    prompt: prompt !== null && ACTION_KINDS.includes(prompt) ? (prompt as ActionKind) : null,
  };
}
```

Create `src/input/actionEdge.ts`:

```ts
/**
 * Commands.action is a held level (src/input/commands.ts): a consumer that acts once per press
 * keeps one of these and feeds it the level every step. update() is true only on the step the
 * level goes from up to down, so holding Space (or the touch Action button) acts once. No
 * allocation per call.
 */
export function createPressEdge(): { update(level: boolean): boolean } {
  let was = false;
  return {
    update(level: boolean): boolean {
      const pressed = level && !was;
      was = level;
      return pressed;
    },
  };
}
```

Replace the whole of `src/input/keyboard.ts` with:

```ts
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

/**
 * Tracks which keys (by KeyboardEvent.code) are held down. A key released since the last game step
 * stays in `down` until endStep(), so a press shorter than a step (or than a slow frame, when
 * several steps run together) still shows for one step: one tap of Space is always one Action
 * press, with no timing to get right.
 */
export class KeyboardInput {
  readonly down = new Set<string>();
  /** Keys let go since the last endStep(). */
  private readonly released = new Set<string>();
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
      this.released.delete(e.code);
    });
    target.addEventListener('keyup', (e) => { if (this.down.has(e.code)) this.released.add(e.code); });
    target.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clear();
    });
  }

  /** After each game step: keys let go since the last one leave `down`. Allocates nothing. */
  endStep(): void {
    if (this.released.size === 0) return;
    this.released.forEach(this.drop);
    this.released.clear();
  }

  private clear(): void {
    this.down.clear();
    this.released.clear();
  }
}
```

In `src/main.ts`:


Replace:

```ts
import { startLoop } from './core/loop';
import type { Vec2 } from './core/vec';
import { FpsMeter } from './render/fps';
```

with:

```ts
import { startLoop } from './core/loop';
import { FpsMeter } from './render/fps';
```


Replace:

```ts
import { TouchJoystick } from './input/touchJoystick';
import { keysToCommandsInto, mergeCommandsInto, type Commands } from './input/commands';
import { parseParams } from './game/params';
```

with:

```ts
import { TouchJoystick } from './input/touchJoystick';
import { keysToCommandsInto, mergeCommandsInto, NO_COMMANDS, type Commands } from './input/commands';
import { createPressEdge } from './input/actionEdge';
import { parseParams } from './game/params';
```


Replace:

```ts
import { showGraphics } from './ui/graphicsMenu';
import { showResult, showRunning, showTestIntro } from './ui/speedTestUi';
```

with:

```ts
import { showGraphics } from './ui/graphicsMenu';
import { createActionPrompt } from './ui/actionPrompt';
import { showResult, showRunning, showTestIntro } from './ui/speedTestUi';
```


Replace:

```ts
const CRASH_TITLE = 'Something went wrong';
const NO_MOVE: Vec2 = Object.freeze({ x: 0, y: 0 });
/** The game's frame cap; the speed test lifts it for its uncapped phase. */
```

with:

```ts
const CRASH_TITLE = 'Something went wrong';
/** The game's frame cap; the speed test lifts it for its uncapped phase. */
```


Replace:

```ts
  const joystick = new TouchJoystick(app);
  const meter = new FpsMeter();
```

with:

```ts
  const joystick = new TouchJoystick(app);
  // What Action does now, and the touch Action button. The game sets it from where the worm is;
  // a ?prompt= test page shows one kind and counts presses (data-action-presses).
  const actionPrompt = createActionPrompt(app);
  const pressEdge = createPressEdge();
  let presses = 0;
  const meter = new FpsMeter();
```


Replace:

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

with:

```ts

  // Preallocated: commands() runs every 60 Hz step and must not allocate.
  const keyCmds: Commands = { move: { x: 0, y: 0 }, action: false, wormView: false, pause: false };
  const touchCmds: Commands = { move: NO_COMMANDS.move, action: false, wormView: false, pause: false };
  const heldCmds: Commands = { move: { x: 0, y: 0 }, action: false, wormView: false, pause: false };

  /**
   * This step's commands: the keyboard, the joystick and the touch Action button merged (Space or
   * the button hold `action`); the speed test's drive while it runs; nothing off the crawl screen.
   */
  function commands(): Commands {
    if (runner.running) return AUTO_DRIVE_MOVE;
    if (state.screen !== 'crawl') return NO_COMMANDS;
    touchCmds.move = joystick.value; // the joystick replaces its value object; no copy needed
    touchCmds.action = actionPrompt.touchHeld;
    return mergeCommandsInto(keysToCommandsInto(keyboard.down, keyCmds), touchCmds, heldCmds);
  }
```


Replace:

```ts
  function update(dt: number): void {
    if (!frozen()) crawl.step(dt, move());
  }
```

with:

```ts
  function update(dt: number): void {
    if (!frozen()) {
      const cmds = commands();
      crawl.step(dt, cmds.move);
      if (params.prompt) {
        actionPrompt.set(state.screen === 'crawl' ? params.prompt : null);
        if (pressEdge.update(cmds.action)) app.dataset.actionPresses = String(++presses);
      }
    }
    keyboard.endStep();
    actionPrompt.endStep();
  }
```



Create `src/ui/actionPrompt.ts`:

```ts
import { el } from './dom';
import { icon, type IconName } from './icons';
import { TEXT, shown } from '../content/text';

/**
 * What one press of Action (Space, or the touch Action button) will do now (V2 spec 4 and 7):
 * dig down on the surface, come up near the top underground, or switch to the Wide or the Close
 * view deeper down.
 */
export type ActionKind = 'digDown' | 'comeUp' | 'viewWide' | 'viewClose';

export interface ActionPrompt {
  /** Shows the prompt for `kind`, or hides it (null). Call every frame: an unchanged kind does nothing. */
  set(kind: ActionKind | null): void;
  /**
   * True while the on-screen Action button is pressed (touch, pen or mouse) and the prompt shows,
   * and also from any press until the next endStep(): a tap shorter than a game step (or than a
   * slow frame) still reads as held for one step. Reading it changes nothing.
   */
  readonly touchHeld: boolean;
  /** After each game step (main.ts): a press already let go stops reading as held. Allocates nothing. */
  endStep(): void;
  dispose(): void;
}

const KINDS: readonly ActionKind[] = ['digDown', 'comeUp', 'viewWide', 'viewClose'];
const ICONS: Readonly<Record<ActionKind, IconName>> = {
  digDown: 'digDown', comeUp: 'comeUp', viewWide: 'viewWide', viewClose: 'viewClose',
};

/**
 * The Action prompt: one real button in the HUD, bottom right, with an icon and a word from
 * src/content/text.ts (icon plus word, never colour alone), shown only while crawling (hud.css).
 * On a device with a keyboard it also wears a "Space" key chip; on a touch screen the whole
 * 64 px+ button is the Action press. It takes no keyboard focus (Space already means Action, and
 * must not also "click" it), so the crawl's focus stays on the card. It never flashes or pulses.
 * set() writes the DOM only when the kind changes, and allocates nothing.
 */
export function createActionPrompt(root: HTMLElement): ActionPrompt {
  const btn = el('button', '', 'btn btn-primary action-prompt');
  btn.type = 'button';
  btn.tabIndex = -1;
  btn.hidden = true;
  btn.setAttribute('aria-keyshortcuts', 'Space');
  const icons = KINDS.map((k) => {
    const s = icon(ICONS[k], 'btn-icon action-icon');
    s.hidden = true;
    return s;
  });
  const word = el('span', '', 'btn-label');
  const key = el('kbd', 'Space', 'action-key');
  key.setAttribute('aria-hidden', 'true');
  btn.append(...icons, word, key);
  root.appendChild(btn);

  let kind: ActionKind | null = null;
  let pointer: number | null = null;
  /** Pressed since the last endStep(): a quick tap still reads as held for a step. */
  let tapped = false;

  const release = (e: PointerEvent): void => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    btn.classList.remove('held');
  };
  const down = (e: PointerEvent): void => {
    if (e.button !== 0 || pointer !== null) return;
    // No focus, no text selection, no long-press menu: it is a game button.
    e.preventDefault();
    pointer = e.pointerId;
    tapped = true;
    btn.setPointerCapture(e.pointerId);
    btn.classList.add('held');
  };
  const noMenu = (e: Event): void => e.preventDefault();
  btn.addEventListener('pointerdown', down);
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('lostpointercapture', release);
  btn.addEventListener('contextmenu', noMenu);

  return {
    set(next) {
      if (next === kind) return;
      if (kind !== null) icons[KINDS.indexOf(kind)].hidden = true;
      kind = next;
      if (next === null) {
        btn.hidden = true;
        tapped = false;
        return;
      }
      icons[KINDS.indexOf(next)].hidden = false;
      word.textContent = shown(TEXT[next]);
      btn.hidden = false;
    },
    get touchHeld() {
      return (pointer !== null || tapped) && kind !== null;
    },
    endStep() {
      tapped = false;
    },
    dispose() {
      btn.removeEventListener('pointerdown', down);
      btn.removeEventListener('pointerup', release);
      btn.removeEventListener('pointercancel', release);
      btn.removeEventListener('lostpointercapture', release);
      btn.removeEventListener('contextmenu', noMenu);
      btn.remove();
    },
  };
}
```

Replace the whole of `src/ui/hud.css` with:

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
/* Hidden unless crawling, including before the first shell.show() sets data-ui. */
:not([data-ui="crawl"]) > .pause-btn.btn { display: none; }

/* ---------- Joystick (crawl only) ---------- */
:not([data-ui="crawl"]) > .joystick { display: none; }
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

/* ---------- Action prompt (crawl only; src/ui/actionPrompt.ts) ---------- */
/* What Space or the touch Action button does now: icon plus word, bottom right, 64px+ tall, never
   flashing. A real button, so touch, pen and mouse press it; Space presses Action without it. */
:not([data-ui="crawl"]) > .action-prompt { display: none; }
.action-prompt.btn {
  position: fixed; z-index: 1; right: 24px; bottom: 24px; width: auto; min-width: 168px;
  min-height: 72px; padding: 10px 20px; font-size: 22px;
  touch-action: none; user-select: none; -webkit-user-select: none;
}
.action-prompt[hidden] { display: none; }
.action-prompt .action-icon[hidden] { display: none; }
.action-prompt.held { transform: translateY(3px); box-shadow: inset 0 2px 4px rgba(90, 50, 10, 0.3), 0 1px 0 #6b3d12; }
.action-key {
  margin-left: 4px; padding: 2px 8px; border-radius: 8px; font: 800 18px/1.2 var(--font-body);
  color: var(--ink); background: var(--parchment-hi); border: 2px solid var(--bark-dark);
  box-shadow: 0 2px 0 var(--bark-dark);
}
/* Touch only (no hover, a coarse pointer): no keyboard, so no key chip; a bigger target. */
@media (hover: none) and (pointer: coarse) {
  .action-key { display: none; }
  .action-prompt.btn { min-width: 176px; min-height: 84px; font-size: 24px; }
}
/* Narrow screens: the word under the icon, so the button stays clear of the joystick. */
@media (max-width: 560px) {
  .action-prompt.btn { right: 16px; bottom: 16px; min-width: 0; flex-direction: column; gap: 2px; padding: 8px 14px; }
}
```

In `src/ui/icons.ts`:


Replace:

```ts
      stroke-linejoin="round"><path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/></svg>`,
  /** A tick: a saved setting. */
```

with:

```ts
      stroke-linejoin="round"><path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/></svg>`,
  /** The Action prompt (src/ui/actionPrompt.ts). Dig down: an arrow going down through the ground line. */
  digDown: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
      stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 9h6M15.5 9h6"/><path d="M12 3v16M6.5 13.5L12 19l5.5-5.5"/></svg>`,
  /** Come up: an arrow rising out through the ground line. */
  comeUp: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
      stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 15h6M15.5 15h6"/><path d="M12 21V5M6.5 10.5L12 5l5.5 5.5"/></svg>`,
  /** Wide view: four corners pointing out. */
  viewWide: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
      stroke-linecap="round" stroke-linejoin="round"><path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/>
    <path d="M3 3l6 6M21 3l-6 6M3 21l6-6M21 21l-6-6"/></svg>`,
  /** Close view: a magnifying glass. */
  viewClose: `<svg ${SVG} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
      stroke-linecap="round"><circle cx="10" cy="10" r="6.5"/><path d="M15 15l6 6M7 10h6M10 7v6"/></svg>`,
  /** A tick: a saved setting. */
```

- [ ] **Step 4: Run everything**

Run: `npx tsc --noEmit && npx vitest run && npm run verify:build && npm run test:e2e`
Expected: types clean; **66 files, 608 tests** (+1 file, +4); `single-file build OK`; **32 passed, 1 skipped** (+4 in `actionPrompt.spec.ts`).

- [ ] **Step 5: Look at it (rendering)**

Build, then:
```bash
node .cache/shot2.mjs .cache/shots/prompt-desktop.png "?prompt=digDown&preset=high" wait:500
```
and for the phone, with touch, run this one-off (it uses the e2e test's settings):
```bash
cat > .cache/shot-phone.mjs <<'SHOT'
import { chromium } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true });
await page.goto(pathToFileURL(path.resolve('dist/index.html')).href + '?prompt=viewClose&preset=low');
await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'Crawl', exact: true }).click();
await page.waitForTimeout(3000);
await page.screenshot({ path: '.cache/shots/prompt-phone.png' });
await browser.close();
SHOT
node .cache/shot-phone.mjs
```
Expected: on desktop a gold "↓ Dig down [Space]" button bottom right, clear of the joystick and the Pause button; on the phone a big "Close view" button with the magnifier over the word, clear of the joystick, no key chip. Reviewers look at both.

- [ ] **Step 6: Commit**

```bash
git add src/ui/actionPrompt.ts src/input/actionEdge.ts src/ui/icons.ts src/ui/hud.css src/input/keyboard.ts \
  src/game/params.ts src/main.ts tests/unit/actionEdge.test.ts tests/unit/params.test.ts tests/e2e/actionPrompt.spec.ts
git commit -m "feat(v2): Action prompt and touch Action button; quick presses never lost

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---


### Task 6: Deep litter, and the worm buried on the floor under it

**Files:**
- Create: `src/surface/meshGrid.ts`
- Modify: `src/surface/litterDepth.ts`, `src/surface/terrainMesh.ts`, `src/surface/leafLitter.ts`, `src/render/litterTexture.ts`, `src/worm/surfaceHeight.ts`, `src/game/crawl.ts`, `src/game/cameraClearance.ts`, `src/game/world.ts`
- Modify tests: `tests/unit/litterDepth.test.ts`, `tests/unit/surfaceHeight.test.ts`, `tests/unit/crawl.test.ts`, `tests/unit/litterPlacement.test.ts`, `tests/unit/litterTexture.test.ts`, `tests/unit/leafGlsl.test.ts`

Spec 8.2 and answer 11.9; contract section 3. This task changes the heights; Tasks 7 and 8 make the worm visible again.

- **The L layer** (`litterDepth`): 0.45 to 1.2 units (2 to 5.2 cm): about 0.55 in the open (± 0.05 noise), +0.18 in hollows, −0.06 on rises, and V1's drifts and piles (shaped in V1's metres) deepened 2.6x. Against a rock the litter is capped at max(0.45, 0.5 × 0.36 × size) within 0.3 of its footprint, relaxing to no cap 1.5 away: a drawn rock stands 0.36 to 0.53 of its size, so at least half of it shows. `LITTER_OPEN`, `LITTER_MIN`, `LITTER_MAX` keep their names with V2 values; `underAmount`, `litterMound`, `UNDER_THIN` and `UNDER_DEEP` are gone (nothing rides on top any more).
- **Heights:** `floorHeight(x, z) = terrainHeight(x, z)`, smooth everywhere. `groundHeight = floorHeight + litterDepth` (the analytic top). The terrain mesh's vertex heights are `groundHeight`; `litterTopHeight` samples that grid exactly as drawn (`sampleGrid`, the mesh's own triangles). The grid's layout and sampling moved to `src/surface/meshGrid.ts`, so `litterDepth.ts` can export `litterTopHeight` (as the contract asks) without importing `terrainMesh.ts`, which imports it. `meshGroundHeight` stays as an alias, so its many readers (the top leaves, clutter) are untouched.
- **The top leaves** (`placeLeaves`) rest in a thin loose layer (`TOP_LAYER`, one leaf, as V1's open ground) on the drawn top; more of them where the litter is deeper.
- **The baked litter texture**: R is the depth; G is the thinnest depth within `THIN_REACH` (1.5) of the texel (a separable min filter, rounded down a step). Task 8's pocket leaves rest below it.
- **The worm** (`wormSurface`) rests on the floor, belly 1 cm over it, `under` always 1, on every preset. The hero leaves' surface is the floor too (they are in the worm's pocket from now on, V1's physics unchanged). `Crawl.under` is filled with 1 (the disturbance map's API keeps its `under` arguments).
- **The camera** follows a point `CAM_OVER_TOP` (0.1) above the top of the litter over the head (in `cameraClearance.ts`, with `CAM_OPTS`), so it frames the pocket from just above where V1's framed a worm at the top of the leaves. It still aims at the buried head plus 0.6 and keeps 0.5 over the drawn top (`litterTop`, now `litterTopHeight`).

- [ ] **Step 1: Write the failing tests**

In `tests/unit/crawl.test.ts`:


Replace:

```ts
import { bellyHeight, litterTop, wormSurface } from '../../src/worm/surfaceHeight';
import type { WormPose } from '../../src/worm/wormMesh';
```

with:

```ts
import { bellyHeight, litterTop, wormSurface } from '../../src/worm/surfaceHeight';
import { floorHeight, litterDepth } from '../../src/surface/litterDepth';
import type { WormPose } from '../../src/worm/wormMesh';
```


Replace:

```ts

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
```

with:

```ts

  it('rests every segment on the floor, buried in the litter (V2 spec 8.2)', () => {
    const c = new Crawl();
    for (let i = 0; i < 240; i++) c.step(DT, { x: 0.3, y: 1 });
    c.body.forEach((s, i) => {
      expect(s.y).toBeCloseTo(bellyHeight(wormSurface(s.x, s.z)), 9);
      expect(s.y).toBeCloseTo(floorHeight(s.x, s.z) + 0.01, 9);
      // At least 2 cm of leaves over the belly.
      expect(litterTop(s.x, s.z) - s.y).toBeGreaterThan(0.4);
      expect(c.under[i]).toBe(1);
    });
  });

  it('is buried on every preset: with leaf reaction off (Low) too', () => {
    const c = new Crawl();
```


Replace:

```ts
    c.body.forEach((s, i) => {
      expect(s.y).toBeCloseTo(bellyHeight(wormSurface(s.x, s.z, false)), 9);
      expect(c.under[i]).toBe(0);
    });
  });
```

with:

```ts
    c.body.forEach((s, i) => {
      expect(s.y).toBeCloseTo(floorHeight(s.x, s.z) + 0.01, 9);
      expect(c.under[i]).toBe(1);
    });
  });

  it('frames its camera over the top of the litter, not the buried worm', () => {
    const c = new Crawl();
    for (let i = 0; i < 300; i++) c.step(DT, { x: 0, y: 1 });
    const h = c.motion.head;
    // About the follow height (1.1) over the top of the litter above the head: 2 to 5 cm higher
    // than over the worm itself.
    expect(c.cam.pos.y - h.y).toBeGreaterThan(1.1 + litterDepth(h.x, h.z) - 0.2);
  });
```


Replace:

```ts
    expect(c.motion.head.z).toBe(0);
    expect(c.motion.head.y).toBeCloseTo(bellyHeight(wormSurface(0, 0, false)), 9);
    expect(c.disturbed).toBe(true);
```

with:

```ts
    expect(c.motion.head.z).toBe(0);
    expect(c.motion.head.y).toBeCloseTo(bellyHeight(wormSurface(0, 0)), 9);
    expect(c.disturbed).toBe(true);
```



In `tests/unit/leafGlsl.test.ts`:


Replace:

```ts
/**
 * Lays the real worm, `count` times, anywhere it lies under the leaves (random place, heading and
 * curve), stamps the map as the crawl does, and checks every leaf triangle `leaves` yields against
 * the worm's mesh vertices beneath it: each must clear the body by 5 mm.
 */
```

with:

```ts
/**
 * Lays the real worm, `count` times, anywhere (random place, heading and curve: it is always buried
 * in the litter, on the floor), stamps the map as the crawl does, and checks every leaf triangle
 * `leaves` yields against the worm's mesh vertices beneath it: each must clear the body by 5 mm.
 */
```


Replace:

```ts
  const rng = mulberry32(2026);
  const surf: WormSurface = { y: 0, under: 0 };
  const spine = new Float32Array(n * 3);
```

with:

```ts
  const rng = mulberry32(2026);
  const surf: WormSurface = { y: 0, under: 1 };
  const spine = new Float32Array(n * 3);
```


Replace:

```ts
    const curve = (rng() - 0.5) * 1.2;
    let under = true;
    pts.length = 0;
    for (let i = 0; i < n && under; i++) {
      const along = i * 0.22;
```

with:

```ts
    const curve = (rng() - 0.5) * 1.2;
    pts.length = 0;
    for (let i = 0; i < n; i++) {
      const along = i * 0.22;
```


Replace:

```ts
      const z = hz + Math.sin(yaw) * lx + Math.cos(yaw) * lz;
      wormSurface(x, z, true, surf);
      under = surf.under >= 0.999;
      pts.push([x, z]);
```

with:

```ts
      const z = hz + Math.sin(yaw) * lx + Math.cos(yaw) * lz;
      wormSurface(x, z, surf);
      pts.push([x, z]);
```


Replace:

```ts
    }
    if (!under) continue;
    placements++;
```

with:

```ts
    }
    placements++;
```



Replace the whole of `tests/unit/litterDepth.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import {
  litterDepth, driftDepth, pileDepth, hollowAmount, floorHeight, groundHeight, litterTopHeight,
  LITTER_MIN, LITTER_MAX, LITTER_OPEN, WIND, PILES,
} from '../../src/surface/litterDepth';
import { treeSites, trunkRadiusOf } from '../../src/surface/treeSites';
import { heroLog, rocks } from '../../src/surface/propPlacement';
import { PLAY_HALF, WORLD_HALF, terrainHeight } from '../../src/surface/terrain';
import { meshGroundHeight } from '../../src/surface/terrainMesh';
import { UNITS_PER_CM } from '../../src/surface/realScale';

const HERO_LOG = heroLog();
const ROCKS = rocks();

const grid = (half: number, step: number): [number, number][] => {
  const pts: [number, number][] = [];
  for (let x = -half; x <= half; x += step) for (let z = -half; z <= half; z += step) pts.push([x, z]);
  return pts;
};
const awayFromEverything = (x: number, z: number) => driftDepth(x, z) === 0 && pileDepth(x, z) === 0;

describe('litterDepth (the L layer, V2 spec 8.2)', () => {
  it('is deterministic', () => {
    for (const [x, z] of grid(20, 3.1)) expect(litterDepth(x, z)).toBe(litterDepth(x, z));
  });

  it('is 2 to 5 cm everywhere, including beyond the world edge', () => {
    expect(LITTER_MIN / UNITS_PER_CM).toBeGreaterThan(1.9);
    expect(LITTER_MAX / UNITS_PER_CM).toBeLessThan(5.2);
    for (const [x, z] of grid(WORLD_HALF + 6, 0.37)) {
      const d = litterDepth(x, z);
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBeGreaterThanOrEqual(LITTER_MIN);
      expect(d).toBeLessThanOrEqual(LITTER_MAX);
    }
  });

  it('is about 2.4 cm in the open (the flat spawn)', () => {
    expect(awayFromEverything(0, 0)).toBe(true);
    expect(litterDepth(0, 0)).toBeGreaterThan(LITTER_OPEN - 0.06);
    expect(litterDepth(0, 0)).toBeLessThan(LITTER_OPEN + 0.06);
  });

  it('is continuous: a 1 mm step never changes it by more than 2 mm', () => {
    for (const [x, z] of grid(PLAY_HALF, 0.29)) {
      const d = litterDepth(x, z);
      expect(Math.abs(litterDepth(x + 0.001, z) - d)).toBeLessThan(0.002);
      expect(Math.abs(litterDepth(x, z + 0.001) - d)).toBeLessThan(0.002);
    }
  });

  it('is deeper in hollows than on rises (away from drifts and piles)', () => {
    const hollow: number[] = [];
    const rise: number[] = [];
    for (const [x, z] of grid(PLAY_HALF, 0.5)) {
      if (Math.hypot(x, z) < 8 || !awayFromEverything(x, z)) continue;
      const h = hollowAmount(x, z);
      if (h > 0.9) hollow.push(litterDepth(x, z));
      else if (h === 0) rise.push(litterDepth(x, z));
    }
    expect(hollow.length).toBeGreaterThan(5);
    expect(rise.length).toBeGreaterThan(5);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(hollow) - mean(rise)).toBeGreaterThan(0.1);
  });

  it('drifts against every trunk, deeper downwind than upwind', () => {
    for (const t of treeSites()) {
      const r = trunkRadiusOf(t) * 1.3;
      const gap = r + 0.15;
      const down = litterDepth(t.x + WIND.x * gap, t.z + WIND.z * gap);
      const up = litterDepth(t.x - WIND.x * gap, t.z - WIND.z * gap);
      expect(down).toBeGreaterThan(up);
      expect(down).toBeGreaterThan(litterDepth(0, 0) + 0.25);
    }
  });

  it('banks against every rock, never burying it: at least half the drawn rock shows', () => {
    for (const k of ROCKS) {
      // A drawn rock stands at least 0.36 of its size above the soil (0.36 to 0.53 measured).
      const top = 0.36 * k.size;
      for (let a = 0; a < Math.PI * 2; a += 0.2) {
        for (const gap of [0, 0.15, 0.3]) {
          const r = k.size * 1.05 + gap;
          const d = litterDepth(k.x + Math.cos(a) * r, k.z + Math.sin(a) * r);
          expect(d).toBeLessThanOrEqual(Math.max(LITTER_MIN, 0.5 * top) + 1e-9);
        }
      }
      const gap = k.size * 1.05 + 0.15;
      expect(litterDepth(k.x + WIND.x * gap, k.z + WIND.z * gap)).toBeGreaterThanOrEqual(litterDepth(k.x - WIND.x * gap, k.z - WIND.z * gap) - 1e-9);
    }
  });

  it('drifts against the fallen log', () => {
    const nx = -Math.sin(HERO_LOG.yaw);
    const nz = Math.cos(HERO_LOG.yaw);
    const side = nx * WIND.x + nz * WIND.z > 0 ? 1 : -1;
    const gap = HERO_LOG.radius + 0.15;
    expect(litterDepth(HERO_LOG.x + nx * gap * side, HERO_LOG.z + nz * gap * side)).toBeGreaterThan(litterDepth(0, 0) + 0.3);
  });

  it('has 4 to 6 windblown piles, deep in the middle (one banks against a rock, so it stops lower)', () => {
    expect(PILES.length).toBeGreaterThanOrEqual(4);
    expect(PILES.length).toBeLessThanOrEqual(6);
    for (const p of PILES) expect(litterDepth(p.x, p.z) / UNITS_PER_CM).toBeGreaterThan(3.5);
    expect(PILES.filter((p) => litterDepth(p.x, p.z) / UNITS_PER_CM > 4.5).length).toBeGreaterThanOrEqual(3);
  });
});

describe('floorHeight and litterTopHeight (the contract with the underground cut)', () => {
  it('the floor is the soil\'s own smooth shape', () => {
    for (const [x, z] of grid(WORLD_HALF, 1.3)) expect(floorHeight(x, z)).toBe(terrainHeight(x, z));
  });

  it('the top is the ground as drawn, about the floor plus the litter, never nearer the floor than 2 cm', () => {
    let worst = 0;
    for (const [x, z] of grid(PLAY_HALF, 0.23)) {
      const top = litterTopHeight(x, z);
      expect(top).toBe(meshGroundHeight(x, z));
      worst = Math.max(worst, Math.abs(top - groundHeight(x, z)));
      expect(top - floorHeight(x, z)).toBeGreaterThan(LITTER_MIN - 0.02);
      expect(groundHeight(x, z)).toBeCloseTo(floorHeight(x, z) + litterDepth(x, z), 12);
    }
    // The drawn grid (0.5 m cells) is within 7 mm (0.17 units) of the analytic top, where it cuts a drift.
    expect(worst).toBeLessThan(0.17);
  });
});

describe('litterDepth at obstacle centres', () => {
  const round = [
    ...treeSites().map((t) => ({ x: t.x, z: t.z, r: trunkRadiusOf(t) * 1.3 })),
    ...ROCKS.map((k) => ({ x: k.x, z: k.z, r: k.size * 1.05 })),
  ];
  const STEP = 0.001;
  /** Largest depth change between neighbouring 1 mm samples along a line through (cx, cz). */
  const worstStep = (cx: number, cz: number, angle: number, half: number): number => {
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const n = Math.round(half / STEP);
    let worst = 0;
    let prev = litterDepth(cx - dx * n * STEP, cz - dz * n * STEP);
    for (let i = -n + 1; i <= n; i++) {
      const d = litterDepth(cx + dx * i * STEP, cz + dz * i * STEP);
      worst = Math.max(worst, Math.abs(d - prev));
      prev = d;
    }
    return worst;
  };

  it('is continuous across every trunk and rock, straight through the centre', () => {
    for (const o of round) {
      for (const angle of [0, Math.PI / 4, Math.atan2(WIND.z, WIND.x), Math.PI / 2 + 0.3]) {
        expect(worstStep(o.x, o.z, angle, Math.min(o.r, 0.6))).toBeLessThan(0.002);
      }
    }
  });

  it('is continuous across the log, through its axis, and round its end caps', () => {
    const ax = Math.cos(HERO_LOG.yaw);
    const az = Math.sin(HERO_LOG.yaw);
    const half = HERO_LOG.length / 2;
    // Across the log at several points along it.
    for (const t of [-half, -half + 0.01, -1.3, 0, 0.9, half - 0.01, half]) {
      const cx = HERO_LOG.x + ax * t;
      const cz = HERO_LOG.z + az * t;
      expect(worstStep(cx, cz, HERO_LOG.yaw + Math.PI / 2, 0.6)).toBeLessThan(0.002);
    }
    // Along the axis itself, and straight through an end cap.
    expect(worstStep(HERO_LOG.x, HERO_LOG.z, HERO_LOG.yaw, 1.2)).toBeLessThan(0.002);
    expect(worstStep(HERO_LOG.x + ax * half, HERO_LOG.z + az * half, HERO_LOG.yaw, 0.6)).toBeLessThan(0.002);
  });

  it('the hero log axis is within 2 mm of a point 1 mm beside it', () => {
    // The known failure: on the axis the drift direction was undefined and the depth jumped by 16 cm.
    const nx = -Math.sin(HERO_LOG.yaw);
    const nz = Math.cos(HERO_LOG.yaw);
    for (const side of [-1, 1]) {
      const here = litterDepth(HERO_LOG.x, HERO_LOG.z);
      const near = litterDepth(HERO_LOG.x + nx * side * 0.001, HERO_LOG.z + nz * side * 0.001);
      expect(Math.abs(here - near)).toBeLessThan(0.002);
    }
  });
});
```

In `tests/unit/litterPlacement.test.ts`:


Replace:

```ts
import { WORLD_HALF } from '../../src/surface/terrain';
import { PILES, litterDepth, litterMound } from '../../src/surface/litterDepth';
import { terrainHeight } from '../../src/surface/terrain';
```

with:

```ts
import { WORLD_HALF } from '../../src/surface/terrain';
import { PILES, litterDepth, TOP_LAYER } from '../../src/surface/litterDepth';
import { terrainHeight } from '../../src/surface/terrain';
```


Replace:

```ts
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
```

with:

```ts
describe('placeLeaves with a depth field', () => {
  const field = (x: number) => (x > 0 ? 1.2 : 0.45);

  it('puts more leaves where the litter is deeper', () => {
    const leaves = placeLeaves(3000, 10, 1, field);
    expect(leaves).toHaveLength(3000);
    const deep = leaves.filter((l) => l.x > 0).length;
    expect(deep).toBeGreaterThan((3000 - deep) * 1.5);
  });

  it('rests this fall\'s leaves on the top of the litter, in a thin loose layer', () => {
    for (const l of placeLeaves(500, 10, 2, field)) {
      expect(l.mound).toBe(field(l.x));
      expect(l.y).toBeGreaterThanOrEqual(0);
      expect(l.y).toBeLessThan(TOP_LAYER);
    }
```


Replace:

```ts

  it('the ground mesh rises by the mound over a pile', () => {
    const g = buildTerrainGeometry();
```

with:

```ts

  it('the ground mesh is the top of the litter over a pile', () => {
    const g = buildTerrainGeometry();
```


Replace:

```ts
    const z = pos[best + 2];
    expect(pos[best + 1]).toBeCloseTo(terrainHeight(x, z) + litterMound(litterDepth(x, z)), 5);
    expect(pos[best + 1] - terrainHeight(x, z)).toBeGreaterThan(0.15);
  });
```

with:

```ts
    const z = pos[best + 2];
    expect(pos[best + 1]).toBeCloseTo(terrainHeight(x, z) + litterDepth(x, z), 5);
    expect(pos[best + 1] - terrainHeight(x, z)).toBeGreaterThan(0.9);
  });
```


Replace:

```ts
        near++;
        expect(y - terrainHeight(x, z)).toBeGreaterThan(0.12);
      });
```

with:

```ts
        near++;
        expect(y - terrainHeight(x, z)).toBeGreaterThan(0.9);
      });
```


Replace:

```ts
      expect(meshGroundHeight(x, z)).toBeCloseTo(got!, 5);
      expect(Math.abs(meshGroundHeight(x, z) - groundHeight(x, z))).toBeLessThan(0.1);
      checked++;
```

with:

```ts
      expect(meshGroundHeight(x, z)).toBeCloseTo(got!, 5);
      expect(Math.abs(meshGroundHeight(x, z) - groundHeight(x, z))).toBeLessThan(0.17);
      checked++;
```



In `tests/unit/litterTexture.test.ts`:


Replace:

```ts
import { describe, it, expect } from 'vitest';
import { litterTextureData, texelCentre, getLitterTexture, sampleLitter, LITTER_TEX_N, LITTER_SPAN } from '../../src/render/litterTexture';
import { litterDepth, litterMound, LITTER_MAX, PILES } from '../../src/surface/litterDepth';

```

with:

```ts
import { describe, it, expect } from 'vitest';
import { litterTextureData, texelCentre, getLitterTexture, sampleLitter, LITTER_TEX_N, LITTER_SPAN, THIN_REACH } from '../../src/render/litterTexture';
import { litterDepth, LITTER_MAX, PILES } from '../../src/surface/litterDepth';

```


Replace:

```ts

  it('stores mound and depth at each texel centre (within one 8-bit step)', () => {
    const step = LITTER_MAX / 255;
```

with:

```ts

  it('stores the depth at each texel centre (within one 8-bit step)', () => {
    const step = LITTER_MAX / 255;
```


Replace:

```ts
        const d = litterDepth(x, z);
        expect(Math.abs((data[k] / 255) * LITTER_MAX - litterMound(d))).toBeLessThanOrEqual(step);
        expect(Math.abs((data[k + 1] / 255) * LITTER_MAX - d)).toBeLessThanOrEqual(step);
        expect(data[k + 2]).toBeGreaterThan(0);
```

with:

```ts
        const d = litterDepth(x, z);
        expect(Math.abs((data[k] / 255) * LITTER_MAX - d)).toBeLessThanOrEqual(step);
        // The thinnest depth round it: never deeper than the depth there.
        expect(data[k + 1]).toBeLessThan(data[k]);
        expect(data[k + 2]).toBeGreaterThan(0);
```


Replace:

```ts
    const j = Math.floor((p.z / LITTER_SPAN + 0.5) * n);
    expect(data[(j * n + i) * 4]).toBeGreaterThan(100);
  });
```

with:

```ts
    const j = Math.floor((p.z / LITTER_SPAN + 0.5) * n);
    expect(data[(j * n + i) * 4]).toBeGreaterThan(200);
  });
```


Replace:

```ts
    sampleLitter(data, (texelCentre(21, n) + texelCentre(22, n)) / 2, texelCentre(9, n), out, n);
    expect(out[1]).toBeCloseTo(((data[k + 1] + data[k + 5]) / 2 / 255) * LITTER_MAX, 9);
  });
```

with:

```ts
    sampleLitter(data, (texelCentre(21, n) + texelCentre(22, n)) / 2, texelCentre(9, n), out, n);
    expect(out[0]).toBeCloseTo(((data[k] + data[k + 4]) / 2 / 255) * LITTER_MAX, 9);
  });
```


Replace:

```ts
  });
});
```

with:

```ts
  });

  it('G is the thinnest litter within THIN_REACH: no depth sampled near a texel is thinner', () => {
    for (let j = 3; j < n; j += 11) {
      for (let i = 3; i < n; i += 13) {
        const g = (data[(j * n + i) * 4 + 1] / 255) * LITTER_MAX;
        for (let a = 0; a < 16; a++) {
          const r = THIN_REACH * (a % 2 ? 1 : 0.5);
          const x = texelCentre(i, n) + Math.cos(a) * r;
          const z = texelCentre(j, n) + Math.sin(a) * r;
          expect(litterDepth(x, z)).toBeGreaterThanOrEqual(g - LITTER_MAX / 255);
        }
      }
    }
  });
});
```



Replace the whole of `tests/unit/surfaceHeight.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { bellyHeight, litterTop, wormSurface, BELLY_UNDER } from '../../src/worm/surfaceHeight';
import { floorHeight, litterTopHeight, LITTER_MIN, PILES } from '../../src/surface/litterDepth';
import { PLAY_HALF } from '../../src/surface/terrain';
import { CAM_GROUND_MARGIN } from '../../src/game/cameraClearance';
import { wormExtent } from '../../src/worm/wormMesh';

const grid = (half: number, step: number): [number, number][] => {
  const pts: [number, number][] = [];
  for (let x = -half; x <= half; x += step) for (let z = -half; z <= half; z += step) pts.push([x, z]);
  return pts;
};

describe('wormSurface: the worm travels buried in the litter (V2 spec 8.2)', () => {
  it('rests on the floor (the F layer\'s top) everywhere, under the litter', () => {
    for (const [x, z] of grid(PLAY_HALF, 0.53)) {
      const s = wormSurface(x, z);
      expect(s.y).toBe(floorHeight(x, z));
      expect(s.under).toBe(1);
    }
  });

  it('is buried under piles too: the litter top stays 2 cm or more above the floor', () => {
    for (const p of PILES) {
      const s = wormSurface(p.x, p.z);
      expect(litterTop(p.x, p.z) - s.y).toBeGreaterThan(LITTER_MIN - 0.02);
    }
  });

  it('writes into and returns the object it is given', () => {
    const out = { y: 0, under: 0 };
    expect(wormSurface(3, 4, out)).toBe(out);
    expect(out.y).toBe(floorHeight(3, 4));
  });

  it('is smooth: 1 mm steps change the height by under 1 mm (the soil\'s gentle rolls)', () => {
    let prev = wormSurface(-6, -6).y;
    for (let t = 0.001; t < 12; t += 0.001) {
      const y = wormSurface(-6 + t, -6 + t * 0.7).y;
      expect(Math.abs(y - prev)).toBeLessThan(0.001);
      prev = y;
    }
  });
});

describe('bellyHeight and litterTop', () => {
  it('puts the belly just on the floor', () => {
    const s = wormSurface(2, 3);
    expect(bellyHeight(s)).toBeCloseTo(s.y + BELLY_UNDER, 12);
  });

  it('the whole body, at its fullest, stays under the top of the litter with room to spare', () => {
    const ext = { top: 0, half: 0, fall: 0, probe: 0 };
    let tallest = 0;
    for (let m = 0; m <= 1; m += 0.01) tallest = Math.max(tallest, wormExtent(m, 0.05, ext).top);
    for (const [x, z] of grid(PLAY_HALF, 0.47)) {
      const belly = bellyHeight(wormSurface(x, z));
      // The body's top with a full swell (and a quarter more for the probing head): still under the top.
      expect(litterTopHeight(x, z) - (belly + tallest * 1.25)).toBeGreaterThan(0.06);
    }
  });

  it('the litter top is the drawn top, and the camera floor clears it', () => {
    expect(litterTop(3, 4)).toBe(litterTopHeight(3, 4));
    expect(CAM_GROUND_MARGIN).toBeGreaterThan(0.3);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/litterDepth.test.ts tests/unit/surfaceHeight.test.ts`
Expected: FAIL: `floorHeight`, `litterTopHeight` and `TOP_LAYER` are not exported, and `litterDepth(0, 0)` is 0.02, not about 0.55.

- [ ] **Step 3: Implement**

In `src/game/cameraClearance.ts`:


Replace:

```ts
};
/** The camera aims a little ahead of the head, so the worm sits low in frame and the forest looms. */
```

with:

```ts
};
/**
 * The camera follows a point this far above the top of the litter over the head (V2: the worm is
 * buried 2 to 5 cm down), so it frames the worm's pocket from a little higher than V1's camera
 * framed a worm crawling at the top of the leaves, looking down into the hole over it.
 */
export const CAM_OVER_TOP = 0.1;
/** The camera aims a little ahead of the head, so the worm sits low in frame and the forest looms. */
```



Replace the whole of `src/game/crawl.ts` with:

```ts
import type * as THREE from 'three';
import type { Vec2, Vec3 } from '../core/vec';
import {
  createFollowCam, stepFollowCam, type FollowCamState,
} from '../surface/followCamera';
import { createBody, followHead } from '../worm/body';
import { clampToNeck, stepWorm, type WormMotion } from '../worm/locomotion';
import { advanceWave, type WaveState } from '../worm/wormShape';
import {
  WAVES, WORM_HALF_WIDTH, bodyCoordAt, peristalsisAmplitude, swellRange, wormExtent, wormLength,
  type WormExtent, type WormPose,
} from '../worm/wormMesh';
import { probeReach, type HeadProbe } from '../worm/wormShape';
import { bellyHeight, wormSurface, type WormSurface } from '../worm/surfaceHeight';
import { floorHeight, groundHeight } from '../surface/litterDepth';
import {
  createDisturbance, recentre, stampBody, decay, clearDisturbance, type DisturbanceMap,
} from '../surface/disturbance';
import {
  clearHeroLeaves, createHeroLeaves, setHeroCount, settleHeroLeaves, snapshotHeroLeaves, stepHeroLeaves,
  HERO_MAX, PUSHER_SPAN, PUSHER_STRIDE, type HeroLeaves,
} from '../surface/heroLeaves';
import { LOCOMOTION } from './drive';
import { disturbReach, type DisturbReach } from '../surface/leafScale';
import { pushOut, slideMove } from '../surface/obstacles';
import { CAM_OPTS, CAM_OVER_TOP, CameraClearance, cameraAim, type CameraAim } from './cameraClearance';

export const WORM_SEGMENTS = 16;
const SPACING = 0.22;
/** The most the body reaches to its side at its fullest swell (about 0.134): how far the spine keeps off solid props. */
export const BODY_RADIUS = WORM_HALF_WIDTH;
const MAX_NECK_BEND = 1.3;
/** Slow resting "breath" of the contraction wave, in waves per second. */
const BREATH_HZ = 0.22;
const WAVES_PER_UNIT = WAVES / wormLength(WORM_SEGMENTS, SPACING);
/**
 * The disturbance map centres on this segment (1.5 m behind the head), so the head and the tail,
 * plus the leaves they reach, all lie inside the map's unfaded middle.
 */
const MAP_CENTRE = 7;
/** Hero-leaf pushers: every segment and the midpoints between them, head first. */
const PUSHERS = 2 * WORM_SEGMENTS - 1;
/** The head pusher shoves hardest (>= 0.9 is the head to the leaf physics); the body gently. */
const HEAD_PUSH = 1;
const BODY_PUSH = 0.5;
/** A pusher stands for the rings within PUSHER_SPAN of it along the spine (in body coordinate). */
const PUSHER_REACH = PUSHER_SPAN / wormLength(WORM_SEGMENTS, SPACING);

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Scratch for interpolate: where the camera aims (cameraAim). */
const aim: CameraAim = { ahead: 0, above: 0, upX: 0, upY: 1, upZ: 0 };

/** `n` points at the origin. */
const blank = (n: number): Vec3[] => Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0 }));

function copy(dst: Vec3, src: Vec3): void {
  dst.x = src.x;
  dst.y = src.y;
  dst.z = src.z;
}

/**
 * The worm and its follow camera, stepped at the fixed simulation rate (moved from the Step 0
 * page). Every body segment rests on wormSurface: the worm travels buried in the leaf litter, on
 * the floor under it (V2 spec 8.2). Keeps the previous step so rendering can interpolate by alpha.
 */
export class Crawl {
  motion: WormMotion = { head: { x: 0, y: 0, z: 0 }, heading: 0 };
  readonly body: Vec3[] = blank(WORM_SEGMENTS);
  cam: FollowCamState = { yaw: 0, yawVel: 0, pos: { x: 0, y: 0, z: 0 } };
  readonly wave: WaveState = { phase: 0, activity: 0 };
  /** The head as last rendered (interpolated): leaf shaders and the detail layer centre on it. */
  readonly focus: Vec3 = { x: 0, y: 0, z: 0 };
  /** Per segment, head first: how far under the litter (for the leaves it disturbs). Always 1: buried. */
  readonly under = new Float32Array(WORM_SEGMENTS).fill(1);
  /** Leaves react to the worm (off on Low: it always rides on top). */
  reaction = true;
  /** The leaves the worm has disturbed: stamped every step, decaying back. */
  readonly disturbance: DisturbanceMap = createDisturbance();
  /** The disturbance map changed since the renderer last uploaded it. */
  disturbed = true;
  /**
   * The reach on the disturbance map (leafScale.ts): how far it is stamped, how much farther a body
   * on top counts as, and the window the renderer fades it in.
   */
  readonly reach: DisturbReach = disturbReach();
  /** Loose physics leaves near the head. */
  readonly hero: HeroLeaves = createHeroLeaves(HERO_MAX);
  /** PUSHER_STRIDE floats per pusher ([x, z, radius, strength, top, under, belly, fall]), for the hero leaves. */
  readonly pushers = new Float32Array(PUSHERS * PUSHER_STRIDE);
  /** Per pusher, the body it stands for at rest thickness (wormExtent): top, half-width, fall, probe share. */
  private readonly pushTop = new Float32Array(PUSHERS);
  private readonly pushHalf = new Float32Array(PUSHERS);
  private readonly pushFall = new Float32Array(PUSHERS);
  private readonly pushProbe = new Float32Array(PUSHERS);
  /** Per pusher, its rest body coordinate. */
  private readonly pushM = new Float32Array(PUSHERS);
  private readonly swell = { min: 1, max: 1 };
  private readonly probe: HeadProbe = { lift: 0, sway: 0 };
  private readonly surf: WormSurface = { y: 0, under: 1 };
  /** Where the camera follows: over the head, near the top of the litter the worm is buried in. */
  private readonly view: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly prevBody: Vec3[] = blank(WORM_SEGMENTS);
  private readonly prevCam: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly prevHead: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly prevWave: WaveState = { phase: 0, activity: 0 };
  private prevYaw = 0;
  private prevReach = 1;
  private readonly move: Vec2 = { x: 0, y: 0 };
  /** Keeps the camera out of trunks, rocks and the log (spec 4.4). */
  private readonly clearance = new CameraClearance();
  /** How much of its full distance the camera keeps (1 clear; less when a prop is in its way). */
  get cameraReach(): number {
    return this.clearance.reach;
  }

  constructor() {
    this.placeAtSpawn();
    const ext: WormExtent = { top: 0, half: 0, fall: 0, probe: 0 };
    for (let k = 0; k < PUSHERS; k++) {
      this.pushM[k] = bodyCoordAt((k * SPACING) / 2, WORM_SEGMENTS, SPACING);
      wormExtent(this.pushM[k], PUSHER_REACH, ext);
      this.pushTop[k] = ext.top;
      this.pushHalf[k] = ext.half;
      this.pushFall[k] = ext.fall;
      this.pushProbe[k] = ext.probe;
    }
  }

  /**
   * The worm at the spawn, straight and still, heading +z, with its camera settled behind it
   * and the previous step the same (nothing to interpolate).
   */
  private placeAtSpawn(): void {
    const head = { x: 0, y: 0, z: 0 };
    this.motion = { head, heading: 0 };
    head.y = this.rest(0, 0);
    const body = createBody(WORM_SEGMENTS, SPACING, head, 0);
    for (let i = 0; i < WORM_SEGMENTS; i++) {
      this.body[i] = body[i];
      copy(this.prevBody[i], body[i]);
    }
    this.clearance.reset();
    this.cam = createFollowCam(this.viewOf(head), 0, CAM_OPTS);
    copy(this.prevCam, this.cam.pos);
    copy(this.prevHead, head);
    this.prevYaw = this.cam.yaw;
    this.prevReach = 1;
    copy(this.focus, head);
    this.wave.phase = this.wave.activity = 0;
    this.prevWave.phase = this.prevWave.activity = 0;
    this.swell.min = this.swell.max = 1;
    this.probe.lift = this.probe.sway = 0;
    this.move.x = this.move.y = 0;
  }

  /**
   * Back to the start, exactly as a freshly built crawl given the same leaf reaction and hero
   * count: the worm and its camera at the spawn (see placeAtSpawn), the disturbance map empty
   * and back on the spawn, and the hero leaves scattered around the spawn again, in the same
   * deterministic order as at the start. The speed test starts here, so its numbers never
   * depend on where the worm had been. `heroes`: how many hero leaves to scatter (the same count
   * as now unless given).
   */
  reset(heroes = this.hero.count): void {
    this.placeAtSpawn();
    clearDisturbance(this.disturbance);
    recentre(this.disturbance, 0, 0);
    this.disturbed = true;
    clearHeroLeaves(this.hero);
    this.pushers.fill(0);
    this.setHeroCount(heroes);
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

  /** Stamps the body into the disturbance map: the segments joining its body points. */
  private disturbLeaves(dt: number): void {
    const m = this.disturbance;
    const b = this.body;
    decay(m, dt);
    recentre(m, b[MAP_CENTRE].x, b[MAP_CENTRE].z);
    stampBody(m, b, this.under, this.reach.stamp, this.reach.onTop);
    this.disturbed = true;
  }

  /**
   * How many hero leaves are live (the preset). New ones are scattered around the head, over or
   * under the body at once if they land on it.
   */
  setHeroCount(n: number): void {
    const h = this.motion.head;
    const from = this.hero.count;
    this.packPushers();
    setHeroCount(this.hero, n, h.x, h.z, this.motion.heading, floorHeight, this.pushers, PUSHERS);
    settleHeroLeaves(this.hero, from, this.pushers, PUSHERS, floorHeight);
  }

  /**
   * Packs the body for the hero leaves (every segment and the midpoints between them): where it
   * is, how wide, how hard it shoves (the head hardest), the height of its top, how far under
   * the litter it is, the height of its belly and how far its top falls to its side. The worm is
   * drawn between the last two steps, so its thickness (swellRange) and the head's probing
   * (probeReach) are bounded over the phase and activity of both.
   */
  private packPushers(): void {
    const b = this.body;
    const out = this.pushers;
    const last = b.length - 1;
    const a0 = this.prevWave.activity;
    const a1 = this.wave.activity;
    const amp0 = peristalsisAmplitude(a0);
    const amp1 = peristalsisAmplitude(a1);
    const swell = this.swell;
    const probe = this.probe;
    probeReach(1 - Math.min(a0, a1), probe);
    for (let k = 0; k < PUSHERS; k++) {
      const i = k >> 1;
      const j = Math.min(last, i + (k & 1));
      const o = k * PUSHER_STRIDE;
      swellRange(this.pushM[k], PUSHER_REACH, this.prevWave.phase, this.wave.phase, amp0, amp1, swell);
      const share = this.pushProbe[k];
      out[o] = (b[i].x + b[j].x) / 2;
      out[o + 1] = (b[i].z + b[j].z) / 2;
      out[o + 2] = this.pushHalf[k] * swell.max + probe.sway * share;
      out[o + 3] = k === 0 ? HEAD_PUSH : BODY_PUSH;
      // The segments rest at their belly height (bellyHeight of their surface).
      const belly = (b[i].y + b[j].y) / 2;
      out[o + 4] = belly + this.pushTop[k] * swell.max + probe.lift * share;
      out[o + 5] = (this.under[i] + this.under[j]) / 2;
      out[o + 6] = belly;
      out[o + 7] = this.pushFall[k] * swell.min;
    }
  }

  /** Steps the hero leaves against the body as it is now. */
  private pushLeaves(dt: number): void {
    this.packPushers();
    const h = this.motion.head;
    stepHeroLeaves(this.hero, dt, this.pushers, PUSHERS, h.x, h.z, this.motion.heading, floorHeight);
  }

  /** Belly height at (x, z): on the floor under the litter. */
  private rest(x: number, z: number): number {
    return bellyHeight(wormSurface(x, z, this.surf));
  }

  /** The camera's anchor for the head: right over it, CAM_OVER_TOP above the litter's top there. */
  private viewOf(head: Vec3): Vec3 {
    const v = this.view;
    v.x = head.x;
    v.z = head.z;
    v.y = groundHeight(head.x, head.z) + CAM_OVER_TOP;
    return v;
  }

  /** One fixed step. `move`: x turns right, y crawls forward (backward input is ignored). */
  step(dt: number, move: Vec2): void {
    const { body, prevBody, wave } = this;
    for (let i = 0; i < body.length; i++) copy(prevBody[i], body[i]);
    copy(this.prevCam, this.cam.pos);
    this.prevYaw = this.cam.yaw;
    this.prevReach = this.clearance.reach;
    copy(this.prevHead, this.motion.head);
    this.prevWave.phase = wave.phase;
    this.prevWave.activity = wave.activity;
    snapshotHeroLeaves(this.hero);

    this.move.x = move.x;
    this.move.y = Math.max(0, move.y);
    this.motion.heading = clampToNeck(this.motion.heading, body[0], body[1], MAX_NECK_BEND);
    this.motion = stepWorm(this.motion, this.move, dt, LOCOMOTION);
    const head = this.motion.head;
    // Trunks, rocks and the log are solid: the head slides along their edge (spec 4.4), and stops
    // in a notch where two meet, or where one crosses the play area's edge (stepWorm's clamp,
    // which a slide must not undo). pushOut is the safety net (a hair inside by rounding).
    slideMove(this.prevHead, head, BODY_RADIUS, LOCOMOTION.halfSize);
    pushOut(head, BODY_RADIUS);
    // stepWorm stays flat and pure; the litter decides the height here.
    head.y = this.rest(head.x, head.z);
    advanceWave(
      wave, Math.hypot(head.x - this.prevHead.x, head.z - this.prevHead.z), dt,
      LOCOMOTION.speed, WAVES_PER_UNIT, BREATH_HZ,
    );
    followHead(body, head, SPACING);
    // Settle each trailing segment onto its own surface, so the body climbs a pile head first.
    // On these gentle slopes (< ~20 degrees) this changes the 3D spacing by a few percent.
    for (let i = 1; i < body.length; i++) {
      const s = body[i];
      // The body never cuts through a solid prop either.
      pushOut(s, BODY_RADIUS);
      s.y = this.rest(s.x, s.z);
    }
    const view = this.viewOf(head);
    this.clearance.update(view, this.cam, dt);
    this.cam = stepFollowCam(this.cam, view, this.motion.heading, dt, this.clearance.opts);
    const c = this.cam.pos;
    // Out of trunks, rocks and the log, and off the litter.
    this.clearance.keepOut(c);
    if (this.reaction) this.disturbLeaves(dt);
    this.pushLeaves(dt);
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
    cameraAim(lerp(this.prevReach, this.clearance.reach, alpha), yaw, aim);
    camera.up.set(aim.upX, aim.upY, aim.upZ);
    camera.lookAt(f.x + Math.sin(yaw) * aim.ahead, f.y + aim.above, f.z + Math.cos(yaw) * aim.ahead);
  }
}
```

In `src/game/world.ts`:


Replace:

```ts
  // The hero worm: no eyes (spec 8.3); it is posed from the simulated spine every frame.
  let reaction = true;
  const surf: WormSurface = { y: 0, under: 0 };
  // The contact shadow lies on the same surface the worm rests on.
  const worm = new HeroWorm(WORM_SEGMENTS, (x, z) => wormSurface(x, z, reaction, surf).y);
  const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
```

with:

```ts
  // The hero worm: no eyes (spec 8.3); it is posed from the simulated spine every frame.
  const surf: WormSurface = { y: 0, under: 1 };
  // The contact shadow lies on the same surface the worm rests on.
  const worm = new HeroWorm(WORM_SEGMENTS, (x, z) => wormSurface(x, z, surf).y);
  const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
```


Replace:

```ts
    apply(spec) {
      reaction = spec.reaction;
      litter.setCount(scaledLeafCount(spec.litter));
```

with:

```ts
    apply(spec) {
      litter.setCount(scaledLeafCount(spec.litter));
```



In `src/render/litterTexture.ts`:


Replace:

```ts
import * as THREE from 'three';
import { litterDepth, litterMound, LITTER_MAX } from '../surface/litterDepth';
import { WORLD_HALF } from '../surface/terrain';
```

with:

```ts
import * as THREE from 'three';
import { litterDepth, LITTER_MAX } from '../surface/litterDepth';
import { WORLD_HALF } from '../surface/terrain';
```


Replace:

```ts
/**
 * The litter baked for shaders that place things near the worm on the GPU (detail leaves, near
 * clutter): R = litter mound / LITTER_MAX, G = litter depth / LITTER_MAX, B = baked trunk shade
 * (light multiplier), A = 255. Row j holds z = texelCentre(j). Uploaded once.
 */
```

with:

```ts
/**
 * How far round a texel the G channel looks for the thinnest litter (m): past the biggest pocket
 * leaf's radius (0.76) and a drawn ground cell's diagonal (0.71), so a leaf laid by its home's G
 * never reaches thinner litter, nor a drawn triangle cut lower by a drift's edge.
 */
export const THIN_REACH = 1.5;

/**
 * The litter baked for shaders that place things near the worm on the GPU (detail leaves, near
 * clutter): R = litter depth / LITTER_MAX (the top above the floor), G = the thinnest depth within
 * THIN_REACH (a square round the texel) / LITTER_MAX, B = baked trunk shade (light multiplier),
 * A = 255. Row j holds z = texelCentre(j). Uploaded once.
 */
```


Replace:

```ts
      const x = texelCentre(i, n);
      const d = litterDepth(x, z);
      const k = (j * n + i) * 4;
      out[k] = Math.round((litterMound(d) / LITTER_MAX) * 255);
      out[k + 1] = Math.round((d / LITTER_MAX) * 255);
      out[k + 2] = Math.round(shadeAt(x, z) * 255);
      out[k + 3] = 255;
    }
```

with:

```ts
      const x = texelCentre(i, n);
      const k = (j * n + i) * 4;
      out[k] = Math.round((litterDepth(x, z) / LITTER_MAX) * 255);
      out[k + 2] = Math.round(shadeAt(x, z) * 255);
      out[k + 3] = 255;
    }
  }
  // G: a separable min filter of R over the square, rounded down a step (never deeper than R's).
  const w = Math.ceil(THIN_REACH / (LITTER_SPAN / n)) + 1;
  const rows = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let m = 255;
      for (let d = Math.max(0, i - w); d <= Math.min(n - 1, i + w); d++) m = Math.min(m, out[(j * n + d) * 4]);
      rows[j * n + i] = m;
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let m = 255;
      for (let d = Math.max(0, j - w); d <= Math.min(n - 1, j + w); d++) m = Math.min(m, rows[d * n + i]);
      out[(j * n + i) * 4 + 1] = Math.max(0, m - 1);
    }
```


Replace:

```ts

/** GLSL: litterAt(xz) = (mound m, depth m, trunk shade). Needs uniform uLitter. */
export const LITTER_GLSL = /* glsl */ `
```

with:

```ts

/** GLSL: litterAt(xz) = (depth m, thinnest depth near it m, trunk shade). Needs uniform uLitter. */
export const LITTER_GLSL = /* glsl */ `
```


Replace:

```ts
 * TS twin of litterAt over baked bytes (`n` texels per side), filtered as the GPU does (bilinear,
 * clamped at the edges): writes (mound m, depth m, trunk shade) into `out`. For tests.
 */
```

with:

```ts
 * TS twin of litterAt over baked bytes (`n` texels per side), filtered as the GPU does (bilinear,
 * clamped at the edges): writes (depth m, thinnest depth near it m, trunk shade) into `out`. For tests.
 */
```



In `src/surface/leafLitter.ts`:


Replace:

```ts
import { mulberry32 } from '../core/random';
import { LITTER_MAX, LITTER_OPEN, litterMound } from './litterDepth';

```

with:

```ts
import { mulberry32 } from '../core/random';
import { LITTER_MAX, LITTER_OPEN, TOP_LAYER } from './litterDepth';

```


Replace:

```ts
  x: number; z: number;
  /** Height of the solid litter mound under the leaf, above the soil. */
  mound: number;
  /** The leaf's layer in the loose litter above the mound; the lowest leaves are the dampest. */
  y: number;
  /** The thickness `y` is drawn from (0 to `span`): the loose layer above the mound. */
  span: number;
```

with:

```ts
  x: number; z: number;
  /** How deep the litter under the leaf is: the drawn top above the floor (litterDepth). */
  mound: number;
  /** The leaf's layer among the loose top leaves on the drawn top; the lowest are the dampest. */
  y: number;
  /** The thickness `y` is drawn from (0 to `span`): the loose top leaves (TOP_LAYER). */
  span: number;
```


Replace:

```ts
/**
 * Seeded leaf placement over a square. Deeper litter holds more leaves (a deep pile keeps about
 * three times as many as open ground) and stacks them higher: each leaf rests on the litter mound,
 * somewhere in the loose layer above it. Placement order is random, so any prefix is an even
 * thinning (the presets draw a prefix).
 */
```

with:

```ts
/**
 * Seeded placement of the top leaves (this fall's) over a square. Deeper litter holds more of them
 * (a deep pile nearly twice as many as thin ground): each rests on the drawn top of the litter,
 * somewhere in the loose top layer (TOP_LAYER). Placement order is random, so any prefix is an
 * even thinning (the presets draw a prefix).
 */
```


Replace:

```ts
    if (r() > 0.3 + 0.7 * (depth / LITTER_MAX)) continue;
    const mound = litterMound(depth);
    const span = Math.max(LITTER_OPEN, depth - mound) * 0.8;
    out.push({
      x, z, mound, span,
      y: r() * span,
```

with:

```ts
    if (r() > 0.3 + 0.7 * (depth / LITTER_MAX)) continue;
    const span = TOP_LAYER * 0.8;
    out.push({
      x, z, mound: depth, span,
      y: r() * span,
```



Replace the whole of `src/surface/litterDepth.ts` with:

```ts
import { valueNoise2 } from '../core/noise';
import type { Vec3 } from '../core/vec';
import { terrainHeight } from './terrain';
import { treeSites, trunkRadiusOf } from './treeSites';
import { heroLog, rocks } from './propPlacement';
import type { LogSite } from './realScale';
import { gridLines, sampleGrid } from './meshGrid';

/**
 * The forest floor's loose leaves (the L layer) over the matted old leaves (the F layer), V2 spec
 * 8.2: the worm travels buried in the L layer, its belly on the F layer's top (floorHeight); the
 * drawn ground is the top of the leaves (litterTopHeight), and the top leaves lie on it.
 *
 * litterDepth is how deep the L layer is at (x, z), in world units (1 cm is 0.23 units), from
 * LITTER_MIN to LITTER_MAX (2 to 5 cm real). Pure, deterministic, bounded and continuous:
 * - about 2.4 cm in the open, a little less on rises;
 * - deeper in terrain hollows (positive curvature of terrainHeight);
 * - drifts against trunks, rocks and the fallen log, deeper on their downwind side; against a
 *   rock it banks up to about half the rock's height, never burying it;
 * - a few windblown piles.
 */
export const LITTER_MIN = 0.45;
export const LITTER_MAX = 1.2;
/** Open ground. */
export const LITTER_OPEN = 0.55;
/** The top leaves lie loose within this of the drawn top (one leaf: V1's open ground). */
export const TOP_LAYER = 0.02;
/** Drifts and piles are shaped in V1's metres (peaks 0.17 to 0.24); this deepens them for V2. */
const DEEPEN = 2.6;

/** The fall wind blows toward +x, +z (unit vector). */
export const WIND = { x: 0.8, z: 0.6 };

/** Windblown piles: centre, radius (m) and peak (V1's metres, times DEEPEN). */
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

/** The deepest drift against a trunk (V1's metres). */
const TRUNK_DRIFT = 0.17;
/** A drawn rock stands at least this share of its size above the soil (0.36 to 0.53 measured). */
const ROCK_RISE = 0.36;
/** Against a rock the litter banks up to this share of the rock's height. */
const ROCK_BANK = 0.5;

interface Drifts {
  /** Round obstacles that leaves drift against: trunks (with their root flare) and rocks. */
  round: readonly { x: number; z: number; r: number; peak: number }[];
  /** Rocks: centre, footprint radius and the deepest the litter may be against it. */
  banks: readonly { x: number; z: number; r: number; cap: number }[];
  log: LogSite;
  logDx: number;
  logDz: number;
}
let drifts: Drifts | null = null;

/** What the leaves drift against (built once). */
function driftSources(): Drifts {
  if (drifts) return drifts;
  const log = heroLog();
  drifts = {
    round: [
      ...treeSites().map((t) => ({ x: t.x, z: t.z, r: trunkRadiusOf(t) * 1.3, peak: TRUNK_DRIFT })),
      ...rocks().map((k) => ({ x: k.x, z: k.z, r: k.size * 1.05, peak: TRUNK_DRIFT })),
    ],
    banks: rocks().map((k) => ({ x: k.x, z: k.z, r: k.size * 1.05, cap: Math.max(LITTER_MIN, ROCK_BANK * ROCK_RISE * k.size) })),
    log,
    logDx: Math.cos(log.yaw),
    logDz: Math.sin(log.yaw),
  };
  return drifts;
}

/**
 * A drift against an obstacle of radius `r` whose surface is `gap` metres away, at offset
 * (dx, dz) (length d) from the obstacle's centre or axis. Outside the radius the direction is
 * the unit offset. Inside it, the direction shrinks linearly to zero at the centre (the mean of
 * the upwind and downwind sides), so the depth is continuous there.
 */
function drift(gap: number, dx: number, dz: number, d: number, r: number, peak: number): number {
  const downwind = (dx * WIND.x + dz * WIND.z) / Math.max(d, r);
  const side = 0.55 + 0.45 * downwind;
  const reach = 0.45 + 0.6 * Math.max(0, downwind);
  return peak * side * (1 - smoothstep(0, reach, gap));
}

/** The deepest drift at (x, z) from trunks, rocks and the log (V1's metres). */
export function driftDepth(x: number, z: number): number {
  const { round, log, logDx: LOG_DX, logDz: LOG_DZ } = driftSources();
  let best = 0;
  for (const o of round) {
    const dx = x - o.x;
    const dz = z - o.z;
    const d = Math.hypot(dx, dz);
    if (d > o.r + 1.2) continue;
    best = Math.max(best, drift(d - o.r, dx, dz, d, o.r, o.peak));
  }
  const t = Math.max(-log.length / 2, Math.min(log.length / 2, (x - log.x) * LOG_DX + (z - log.z) * LOG_DZ));
  const lx = x - (log.x + LOG_DX * t);
  const lz = z - (log.z + LOG_DZ * t);
  const ld = Math.hypot(lx, lz);
  if (ld < log.radius + 1.2) {
    best = Math.max(best, drift(ld - log.radius, lx, lz, ld, log.radius, 0.2));
  }
  return best;
}

/** The deepest windblown pile at (x, z): an oval dome stretched along the wind (V1's metres). */
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

/** The terrain's curvature at (x, z): positive in hollows, negative on rises. */
function curvature(x: number, z: number): number {
  const h = terrainHeight(x, z);
  const e = CURVE_STEP;
  return (terrainHeight(x + e, z) + terrainHeight(x - e, z) + terrainHeight(x, z + e)
    + terrainHeight(x, z - e) - 4 * h) / (e * e);
}

/** 0..1: how much of a hollow (x, z) sits in, from the terrain's curvature. */
export function hollowAmount(x: number, z: number): number {
  return smoothstep(0.01, 0.08, curvature(x, z));
}

/** The deepest the litter may be at (x, z): about half a rock's height against it, no limit away from rocks. */
function rockCap(x: number, z: number): number {
  let cap = LITTER_MAX;
  for (const b of driftSources().banks) {
    const gap = Math.hypot(x - b.x, z - b.z) - b.r;
    if (gap < 1.5) cap = Math.min(cap, b.cap + (LITTER_MAX - b.cap) * smoothstep(0.3, 1.5, gap));
  }
  return cap;
}

export function litterDepth(x: number, z: number): number {
  const lap = curvature(x, z);
  const open = LITTER_OPEN + 0.1 * (valueNoise2(x * 0.6, z * 0.6, 91) - 0.5);
  const shape = 0.18 * smoothstep(0.01, 0.08, lap) - 0.06 * smoothstep(0.01, 0.08, -lap);
  const d = open + shape + DEEPEN * Math.max(driftDepth(x, z), pileDepth(x, z));
  return Math.min(rockCap(x, z), LITTER_MAX, Math.max(LITTER_MIN, d));
}

/**
 * The top of the F layer at (x, z): the matted old leaves under the loose ones, where a buried
 * worm's belly rests. It is the soil's shape (terrainHeight), so it is smooth everywhere.
 */
export function floorHeight(x: number, z: number): number {
  return terrainHeight(x, z);
}

/** The top of the loose leaves, analytically: the floor plus the litter (the drawn top is litterTopHeight). */
export function groundHeight(x: number, z: number): number {
  return floorHeight(x, z) + litterDepth(x, z);
}

let topGrid: { lines: number[]; heights: Float64Array } | null = null;

/** The drawn top's height grid (meshGrid.ts): groundHeight at every vertex, built once. Read-only. */
export function litterTopGrid(): { lines: number[]; heights: Float64Array } {
  if (topGrid) return topGrid;
  const lines = gridLines();
  const n = lines.length;
  const heights = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) heights[j * n + i] = groundHeight(lines[i], lines[j]);
  topGrid = { lines, heights };
  return topGrid;
}

/**
 * The top of the loose leaves at (x, z), exactly as the ground is drawn (the terrain mesh, 0.5 m
 * cells): about floorHeight + litterDepth, within a few cm where the grid cuts a drift. The top
 * leaves lie on it and the camera keeps above it.
 */
export function litterTopHeight(x: number, z: number): number {
  const g = litterTopGrid();
  return sampleGrid(g.lines, g.heights, x, z);
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

Create `src/surface/meshGrid.ts`:

```ts
import { WORLD_HALF } from './terrain';

/**
 * The layout of the drawn ground's height grid (pure): uniform 0.5 m cells over the play area,
 * a few widening rings out to the horizon under the fog. The terrain mesh draws the litter top on
 * it (terrainMesh.ts), litterTopHeight samples it exactly as drawn (litterDepth.ts), and the baked
 * ground texture rebuilds it in shaders (groundTexture.ts).
 */
const INNER = WORLD_HALF + 2;
const OUTER = 50;
const INNER_SEGS = 88;
const OUTER_SEGS = 8;
/** The grid's layout, for shaders that rebuild the rendered ground from its vertex heights (groundTexture). */
export const MESH_GRID = { inner: INNER, outer: OUTER, innerSegs: INNER_SEGS, outerSegs: OUTER_SEGS } as const;

/** Grid line coordinates: dense and uniform over the play area, coarse beyond it. */
export function gridLines(): number[] {
  const out: number[] = [];
  for (let i = OUTER_SEGS; i > 0; i--) {
    const t = i / OUTER_SEGS;
    out.push(-(INNER + (OUTER - INNER) * t * t));
  }
  for (let i = 0; i <= INNER_SEGS; i++) out.push(-INNER + (2 * INNER * i) / INNER_SEGS);
  for (let i = 1; i <= OUTER_SEGS; i++) {
    const t = i / OUTER_SEGS;
    out.push(INNER + (OUTER - INNER) * t * t);
  }
  return out;
}

/** Index of the grid cell [lines[i], lines[i + 1]] holding v (clamped to the grid). */
function cellOf(lines: readonly number[], v: number): number {
  let lo = 0;
  let hi = lines.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lines[mid] <= v) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * The height of the grid surface at (x, z) exactly as the mesh draws it: the same grid, the same
 * diagonal split (b-d, as in the index buffer) and barycentric interpolation of the vertex
 * heights (`heights`, row j holding grid line j along z).
 */
export function sampleGrid(lines: readonly number[], heights: ArrayLike<number>, x: number, z: number): number {
  const n = lines.length;
  const i = cellOf(lines, x);
  const j = cellOf(lines, z);
  const u = Math.min(1, Math.max(0, (x - lines[i]) / (lines[i + 1] - lines[i])));
  const v = Math.min(1, Math.max(0, (z - lines[j]) / (lines[j + 1] - lines[j])));
  const a = heights[j * n + i];
  const b = heights[j * n + i + 1];
  const d = heights[(j + 1) * n + i];
  const e = heights[(j + 1) * n + i + 1];
  // Triangles (a, d, b) and (b, d, e) share the diagonal b-d, where u + v = 1.
  return u + v <= 1 ? a + u * (b - a) + v * (d - a) : e + (1 - u) * (d - e) + (1 - v) * (b - e);
}
```

In `src/surface/terrainMesh.ts`:


Replace:

```ts
import { terrainHeight, WORLD_HALF } from './terrain';
import { groundHeight, groundNormal, litterDepth } from './litterDepth';

/** Uniform grid spacing covers +-INNER; a few wide rings reach out to +-OUTER under the fog. */
const INNER = WORLD_HALF + 2;
const OUTER = 50;
const INNER_SEGS = 88;
const OUTER_SEGS = 8;
/** The grid's layout, for shaders that rebuild the rendered ground from its vertex heights (groundTexture). */
export const MESH_GRID = { inner: INNER, outer: OUTER, innerSegs: INNER_SEGS, outerSegs: OUTER_SEGS } as const;

/** Grid line coordinates: dense and uniform over the play area, coarse beyond it. */
function gridLines(): number[] {
  const out: number[] = [];
  for (let i = OUTER_SEGS; i > 0; i--) {
    const t = i / OUTER_SEGS;
    out.push(-(INNER + (OUTER - INNER) * t * t));
  }
  for (let i = 0; i <= INNER_SEGS; i++) out.push(-INNER + (2 * INNER * i) / INNER_SEGS);
  for (let i = 1; i <= OUTER_SEGS; i++) {
    const t = i / OUTER_SEGS;
    out.push(INNER + (OUTER - INNER) * t * t);
  }
  return out;
}

```

with:

```ts
import { terrainHeight, WORLD_HALF } from './terrain';
import { groundNormal, litterDepth, litterTopGrid, litterTopHeight } from './litterDepth';

export { MESH_GRID } from './meshGrid';

```


Replace:

```ts

let gridCache: { lines: number[]; heights: Float64Array } | null = null;

/** The grid lines and the height at every grid vertex (soil plus litter mound), built once. Read-only. */
export function heightGrid(): { lines: number[]; heights: Float64Array } {
  if (gridCache) return gridCache;
  const lines = gridLines();
  const n = lines.length;
  const heights = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) heights[j * n + i] = groundHeight(lines[i], lines[j]);
  gridCache = { lines, heights };
  return gridCache;
}

/** Index of the grid cell [lines[i], lines[i + 1]] holding v (clamped to the grid). */
function cellOf(lines: number[], v: number): number {
  let lo = 0;
  let hi = lines.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lines[mid] <= v) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * The height of the ground exactly as the terrain mesh draws it at (x, z): the same grid, the same
 * diagonal split (b-d, as in the index buffer) and barycentric interpolation of the vertex
 * heights. The mesh is coarse (0.5 m), so this differs from `groundHeight` by up to a few cm at
 * the edges of mounds; things that must not sink into the surface (leaves, clutter) anchor here.
 */
export function meshGroundHeight(x: number, z: number): number {
  const { lines, heights } = heightGrid();
  const n = lines.length;
  const i = cellOf(lines, x);
  const j = cellOf(lines, z);
  const u = Math.min(1, Math.max(0, (x - lines[i]) / (lines[i + 1] - lines[i])));
  const v = Math.min(1, Math.max(0, (z - lines[j]) / (lines[j + 1] - lines[j])));
  const a = heights[j * n + i];
  const b = heights[j * n + i + 1];
  const d = heights[(j + 1) * n + i];
  const e = heights[(j + 1) * n + i + 1];
  // Triangles (a, d, b) and (b, d, e) share the diagonal b-d, where u + v = 1.
  return u + v <= 1 ? a + u * (b - a) + v * (d - a) : e + (1 - u) * (d - e) + (1 - v) * (b - e);
}

```

with:

```ts

/** The drawn top's grid lines and vertex heights (litterDepth.ts litterTopGrid). Read-only. */
export function heightGrid(): { lines: number[]; heights: Float64Array } {
  return litterTopGrid();
}

/**
 * The height of the ground exactly as the terrain mesh draws it at (x, z): the top of the loose
 * leaves (litterTopHeight). Things that must not sink into the drawn surface (the top leaves,
 * clutter) anchor here.
 */
export const meshGroundHeight = litterTopHeight;

```



Replace the whole of `src/worm/surfaceHeight.ts` with:

```ts
import { floorHeight, litterTopHeight } from '../surface/litterDepth';

export interface WormSurface {
  /** Height the worm rests on (m): the top of the F layer, under all the loose leaves. */
  y: number;
  /** 1: the worm is under the litter. Always 1 in V2: it travels buried in the leaf layer. */
  under: number;
}

/**
 * The surface under the worm at (x, z) (V2 spec 8.2): the worm travels buried in the loose leaf
 * layer, its belly on the F layer's top (floorHeight), on every preset. The floor is the soil's
 * own smooth shape, so the worm never steps on the drawn grid's edges. Writes into `out`, so the
 * per-step calls allocate nothing.
 */
export function wormSurface(x: number, z: number, out: WormSurface = { y: 0, under: 1 }): WormSurface {
  out.y = floorHeight(x, z);
  out.under = 1;
  return out;
}

/** The belly line just touches the floor. */
export const BELLY_UNDER = 0.01;

/** Height of the worm's belly line (its simulated spine) over a surface. */
export function bellyHeight(s: WormSurface): number {
  return s.y + BELLY_UNDER;
}

/** Top of the leaf litter as drawn (litterTopHeight): the camera keeps its margin over this. */
export function litterTop(x: number, z: number): number {
  return litterTopHeight(x, z);
}
```

- [ ] **Step 4: Run everything**

Run: `npx tsc --noEmit && npx vitest run && npm run verify:build && npm run test:e2e`
Expected: types clean; **66 files, 606 tests** (−2 net: the under/over and speed-path tests go; floor, top, rock and camera tests come); `single-file build OK`; **32 passed, 1 skipped**.
The worm is now under an opaque top: it is not visible on screen until Task 7. Do not review the look at this step.

- [ ] **Step 5: Commit**

```bash
git add src/surface/meshGrid.ts src/surface/litterDepth.ts src/surface/terrainMesh.ts src/surface/leafLitter.ts \
  src/render/litterTexture.ts src/worm/surfaceHeight.ts src/game/crawl.ts src/game/cameraClearance.ts src/game/world.ts \
  tests/unit/litterDepth.test.ts tests/unit/surfaceHeight.test.ts tests/unit/crawl.test.ts \
  tests/unit/litterPlacement.test.ts tests/unit/litterTexture.test.ts tests/unit/leafGlsl.test.ts
git commit -m "feat(v2): 2 to 5 cm leaf litter; the worm travels buried in it, on the floor

floorHeight and litterTopHeight (contract section 3); rocks always show at least half.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---


### Task 7 (rendering): The hole over the worm, and the floor under it

**Files:**
- Create: `src/render/drawOrder.ts`, `src/render/floorMaterial.ts`, `src/surface/floorPatch.ts`, `tests/unit/floorPatch.test.ts`
- Modify: `src/render/occlusion.ts`, `src/render/occluderSegments.ts`, `src/render/groundUniforms.ts`, `src/render/paintedMaterial.ts`, `src/render/propMaterial.ts`, `src/render/leafMaterial.ts`, `src/surface/terrainMesh.ts`, `src/surface/litterChunks.ts`, `src/surface/leafLitterMesh.ts`, `src/surface/disturbance.ts`, `src/surface/heroLeafMesh.ts`, `src/worm/wormMesh.ts`, `src/game/world.ts`
- Modify tests: `tests/unit/occlusion.test.ts`, `tests/unit/litterChunks.test.ts`, `tests/unit/sceneTiers.test.ts`, `tests/unit/disturbance.test.ts`, `tests/unit/groundUniforms.test.ts`, `tests/unit/leafGlsl.test.ts`, `tests/unit/leafJitter.test.ts`, `tests/unit/detailLeaves.test.ts`, `tests/unit/nearClutter.test.ts`, `tests/e2e/glslParity.spec.ts`

See "Design" above. In code:
- **The funnel** (`occlusion.ts`): `occlusion()` and its GLSL twin take how high above the axis the pixel lies, from a new uniform `uOccUp` (the world's up in view space, `worldUpInView`, set by `world.sync`). The hole's radius grows by `OCC_FUNNEL` (0.25) per metre of height, up to `OCC_FUNNEL_HEIGHT` (1.2); from `OCC_DEEP_FROM` (0.15) to `OCC_DEEP_TO` (0.3) above the axis the drop rises to 1. `OCC_REACH` (the widest hole) sizes the screen box and the frustum clip in `occluderSegments`, and `ACTIVE_MARGIN` in `litterChunks`.
- **The top of the litter fades:** the terrain's painted material gains `occlude` (it replaces `trail`: the top of the litter shows no trail; the floor does, below). The litter's reacting variant and the top detail leaves lose `DISTURB` (they lie 2 cm or more over the worm, so the map never moved them); `disturbedBox` and the litter's disturbed-box test go, and `LeafLitter.update` takes three arguments.
- **Draw order** (`drawOrder.ts`): terrain `GROUND_ORDER` (5); the worm's body and the hero leaves `POCKET_ORDER` (6); the floor patch `FLOOR_ORDER` (7).
- **The floor patch:** 28 × 28 cells of 0.25 (7 × 7 units) under the middle of the body (`uSpine` point 7, snapped to its cells), laid on `terrainHeight` in the vertex shader, painted as the F layer (`floorMaterial.ts`). `world.sync` now hands `uSpine` over every frame (it was only for Ultra's near clutter).
- **The hero leaves** lie lowest in the pocket: tinted to 55% and warmer-dull.

- [ ] **Step 1: Write the failing tests**

In `tests/e2e/glslParity.spec.ts`:


Replace:

```ts
import * as THREE from 'three';
import { occlusion, ign, OCCLUSION_FN_GLSL, IGN_GLSL, OCC_SEGMENTS } from '../../src/render/occlusion';
import { occluderSegments } from '../../src/render/occluderSegments';
```

with:

```ts
import * as THREE from 'three';
import { occlusion, ign, worldUpInView, OCCLUSION_FN_GLSL, IGN_GLSL, OCC_SEGMENTS } from '../../src/render/occlusion';
import { occluderSegments } from '../../src/render/occluderSegments';
```


Replace:

```ts
    const count = occluderSegments(c.spine, camera.matrixWorldInverse.elements, pe[0], pe[5], seg, box);
    // Pixels within the box's reach, leaves at any depth along them: (tan x, tan y, view depth).
```

with:

```ts
    const count = occluderSegments(c.spine, camera.matrixWorldInverse.elements, pe[0], pe[5], seg, box);
    const up = new THREE.Vector3();
    worldUpInView(camera.matrixWorldInverse.elements, up);
    // Pixels within the box's reach, leaves at any depth along them: (tan x, tan y, view depth).
```


Replace:

```ts
    }
    return { seg: Array.from(seg), count, far: box[4], points };
  });
```

with:

```ts
    }
    return { seg: Array.from(seg), count, far: box[4], points, up: up.toArray() };
  });
```


Replace:

```ts
      precision highp float; precision highp int;
      uniform vec4 uOccSeg[${segs * 2}]; uniform int uOccCount; uniform float uOccDepth;
      in vec4 aPoint;
```

with:

```ts
      precision highp float; precision highp int;
      uniform vec4 uOccSeg[${segs * 2}]; uniform int uOccCount; uniform float uOccDepth; uniform vec3 uOccUp;
      in vec4 aPoint;
```


Replace:

```ts
      gl.uniform1f(U('uOccDepth'), c.far);
      const b = gl.createBuffer();
```

with:

```ts
      gl.uniform1f(U('uOccDepth'), c.far);
      gl.uniform3f(U('uOccUp'), c.up[0], c.up[1], c.up[2]);
      const b = gl.createBuffer();
```


Replace:

```ts
    for (let k = 0; k < c.points.length / 4; k++) {
      const ts = occlusion(c.points[k * 4], c.points[k * 4 + 1], c.points[k * 4 + 2], c.seg, c.count, c.far);
      const d = Math.abs(gpu.occ[ci][k] - ts);
```

with:

```ts
    for (let k = 0; k < c.points.length / 4; k++) {
      const ts = occlusion(c.points[k * 4], c.points[k * 4 + 1], c.points[k * 4 + 2], c.seg, c.count, c.far, c.up);
      const d = Math.abs(gpu.occ[ci][k] - ts);
```


Replace:

```ts
    // Float32 against float64: nearly every pixel agrees to 1e-3 of its drop share. Where two
    // segments tie for nearest, the GPU may take the other one's line for the touch: still within
    // about one step of the 8-bit dither.
    expect(off, `case ${ci}: pixels off by more than 1e-3`).toBeLessThan(c.points.length / 4 / 200);
    expect(worst, `case ${ci}: worst |GPU - TS|`).toBeLessThan(0.01);
    // The sample is real: pixels in the fade and pixels out of it.
```

with:

```ts
    // Float32 against float64: nearly every pixel agrees to 1e-3 of its drop share. Where two
    // segments tie for nearest, the GPU may take the other one's line for the touch and the
    // funnel's height above it: a few hundredths of the share, on under 0.5% of pixels.
    expect(off, `case ${ci}: pixels off by more than 1e-3`).toBeLessThan(c.points.length / 4 / 200);
    expect(worst, `case ${ci}: worst |GPU - TS|`).toBeLessThan(0.06);
    // The sample is real: pixels in the fade and pixels out of it.
```



In `tests/unit/detailLeaves.test.ts`:


Replace:

```ts
    expect(d.mesh.material).toHaveProperty('defines.DETAIL');
    expect(d.mesh.material).toHaveProperty('defines.DISTURB');
    const n = g.getAttribute('position').count;
```

with:

```ts
    expect(d.mesh.material).toHaveProperty('defines.DETAIL');
    expect(d.mesh.material).toHaveProperty('defines.OCCLUDE');
    expect(d.mesh.material).not.toHaveProperty('defines.DISTURB');
    const n = g.getAttribute('position').count;
```


Replace:

```ts
    expect(d.group.children).toHaveLength(1);
  });
});

```

with:

```ts
    expect(d.group.children).toHaveLength(1);
  });
});
```



In `tests/unit/disturbance.test.ts`:


Replace:

```ts
import {
  createDisturbance, recentre, stamp, decay, clearDisturbance, packDisturbance, cellAt, disturbedBox,
  originX, originZ, stampBody, DIST_N, DIST_SPAN, DIST_CELL, DIST_REACH, ON_TOP_DISTANCE, type DisturbanceMap,
```

with:

```ts
import {
  createDisturbance, recentre, stamp, decay, clearDisturbance, packDisturbance, cellAt,
  originX, originZ, stampBody, DIST_N, DIST_SPAN, DIST_CELL, DIST_REACH, ON_TOP_DISTANCE, type DisturbanceMap,
```


Replace:

```ts

  it('disturbedBox bounds every cell holding anything, grown by a cell; empty when clear', () => {
    const m = createDisturbance();
    const box = [0, 0, 0, 0];
    disturbedBox(m, box);
    expect(box).toEqual([Infinity, Infinity, -Infinity, -Infinity]);
    recentre(m, 1, 1);
    stamp(m, 1, 1, 1);
    disturbedBox(m, box);
    // The stamp reaches DIST_REACH from (1, 1), so its cells span about that, plus a cell each side
    // (the outermost stamped cell's centre lies within the reach; the box adds a cell).
    for (const [lo, hi] of [[box[0], box[2]], [box[1], box[3]]]) {
      expect(lo).toBeLessThanOrEqual(1 - DIST_REACH + 1e-9);
      expect(lo).toBeGreaterThan(1 - DIST_REACH - 2 * DIST_CELL - 1e-9);
      expect(hi).toBeGreaterThanOrEqual(1 + DIST_REACH - 1e-9);
      expect(hi).toBeLessThan(1 + DIST_REACH + 2 * DIST_CELL + 1e-9);
    }
    // A fading trail still counts until it is cleared.
    decay(m, 1);
    disturbedBox(m, box);
    expect(box[0]).toBeLessThan(1);
    clearDisturbance(m);
    disturbedBox(m, box);
    expect(box[0]).toBe(Infinity);
  });

  it('disturbedBox keeps to the shaders\' window around the map\'s centre; empty when nothing is in it', () => {
    const m = createDisturbance();
    const box = [0, 0, 0, 0];
    recentre(m, 0, 0);
    const cx = originX(m) + DIST_SPAN / 2;
    const cz = originZ(m) + DIST_SPAN / 2;
    stamp(m, 0, 0, 1);
    disturbedBox(m, box, 1.2);
    expect(box).toEqual([cx - 1.2, cz - 1.2, cx + 1.2, cz + 1.2]);
    // A trail only past the window: nothing a leaf reads.
    clearDisturbance(m);
    stamp(m, 5, 0, 1, 0.3);
    disturbedBox(m, box, 3.88);
    expect(box[0]).toBe(Infinity);
    disturbedBox(m, box);
    expect(box[0]).toBeGreaterThan(4.5);
    expect(box[2]).toBeLessThanOrEqual(cx + DIST_SPAN / 2);
  });

  it('reaches past the biggest leaf plus the drape, inside the map\'s unfaded middle', () => {
```

with:

```ts

  it('reaches past the biggest leaf plus the drape, inside the map\'s unfaded middle', () => {
```



Create `tests/unit/floorPatch.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildFloorPatch } from '../../src/surface/floorPatch';
import { FLOOR_CENTRE, FLOOR_SEGS, FLOOR_SIZE } from '../../src/render/floorMaterial';
import { FLOOR_ORDER, GROUND_ORDER, POCKET_ORDER } from '../../src/render/drawOrder';
import { groundUniforms } from '../../src/render/groundUniforms';
import { OCC_REACH } from '../../src/render/occlusion';
import { buildWorld } from '../../src/game/world';
import { Crawl } from '../../src/game/crawl';
import { PRESETS } from '../../src/render/graphics';

describe('the floor under the buried worm (V2 spec 8.2)', () => {
  const patch = buildFloorPatch();

  it('is one grid of FLOOR_SEGS cells a side, placed round the head by its shader', () => {
    const pos = patch.geometry.getAttribute('position');
    expect(pos.count).toBe((FLOOR_SEGS + 1) ** 2);
    expect(patch.geometry.index!.count).toBe(FLOOR_SEGS * FLOOR_SEGS * 6);
    expect(patch.frustumCulled).toBe(false);
    const xs = Array.from({ length: pos.count }, (_, v) => pos.getX(v));
    expect(Math.min(...xs)).toBe(-FLOOR_SEGS / 2);
    expect(Math.max(...xs)).toBe(FLOOR_SEGS / 2);
    const m = patch.material as THREE.ShaderMaterial;
    expect(m.uniforms.uSpine).toBe(groundUniforms.uSpine);
    expect(m.vertexShader).toContain('terrainHeight(xz)');
  });

  it('reaches past the head and the tail, and what the hole over the worm shows round them', () => {
    // Centred on the middle of the body (1.65 from either end); the hole reaches OCC_REACH from
    // its axis, and the floor seen through it at a slant up to about a metre more.
    expect(FLOOR_CENTRE).toBe(7);
    expect(FLOOR_SIZE / 2).toBeGreaterThan(1.65 + OCC_REACH + 1);
  });

  it('draws after the top of the litter, and after the worm and the leaves in its pocket', () => {
    expect(patch.renderOrder).toBe(FLOOR_ORDER);
    expect(GROUND_ORDER).toBeLessThan(POCKET_ORDER);
    expect(POCKET_ORDER).toBeLessThan(FLOOR_ORDER);
  });

  it('is in the world, with the worm and the hero leaves drawn after the top of the litter', () => {
    const crawl = new Crawl();
    const world = buildWorld(crawl);
    world.apply(PRESETS.ultra);
    const named = (name: string) => {
      let found: THREE.Object3D | undefined;
      world.scene.traverse((o) => { if (o.name === name) found = o; });
      return found!;
    };
    expect(named('terrain').renderOrder).toBe(GROUND_ORDER);
    expect(named('floorPatch').renderOrder).toBe(FLOOR_ORDER);
    expect(named('worm').renderOrder).toBe(POCKET_ORDER);
    expect(named('heroLeaves').renderOrder).toBe(POCKET_ORDER);
    // The top leaves lie on the top of the litter: drawn before it, as in V1.
    expect(world.detail.built!.mesh.renderOrder).toBeLessThan(GROUND_ORDER);
  });
});
```

In `tests/unit/groundUniforms.test.ts`:


Replace:

```ts
import { createPropMaterial } from '../../src/render/propMaterial';

```

with:

```ts
import { createPropMaterial } from '../../src/render/propMaterial';
import { createFloorMaterial } from '../../src/render/floorMaterial';

```


Replace:

```ts
describe('createLeafMaterial', () => {
  it('the floor litter reads the shared disturbance map (both textures)', () => {
    const m = createLeafMaterial();
    expect(m.defines).toHaveProperty('DISTURB');
    expect(m.uniforms.uDisturbTrail).toBe(groundUniforms.uDisturbTrail);
    expect(m.uniforms.uLightDir).toBe(sharedLighting.uLightDir);
    expect(m.vertexShader).toContain('disturb(wp.xyz, aAnchor');
  });
```

with:

```ts
describe('createLeafMaterial', () => {
  it('the top leaves (litter and detail) lie above the buried worm: they fade over it, but never move', () => {
    for (const v of ['litter', 'detail'] as const) {
      const m = createLeafMaterial(v);
      expect(m.defines).not.toHaveProperty('DISTURB');
      expect(m.defines).toHaveProperty('OCCLUDE');
    }
  });
```


Replace:

```ts
describe('leaf occluder fade', () => {
  it('is on for every leaf layer the worm moves through (and Ultra\'s near clutter), off for the falling leaves', () => {
    const faded = [...(['litter', 'detail', 'hero'] as const).map((v) => createLeafMaterial(v)), createPropMaterial(true)];
    for (const m of faded) {
      expect(m.defines).toHaveProperty('OCCLUDE');
      for (const u of ['uOccSeg', 'uOccCount', 'uOccBox', 'uOccTan', 'uOccDepth'] as const) expect(m.uniforms[u]).toBe(groundUniforms[u]);
      expect(m.uniforms.uResolution).toBe(sharedLighting.uResolution);
```

with:

```ts
describe('leaf occluder fade', () => {
  it('is on for every leaf layer over or round the worm, the ground (the top of the litter) and Ultra\'s near clutter, off for the falling leaves', () => {
    const faded = [
      ...(['litter', 'detail', 'hero'] as const).map((v) => createLeafMaterial(v)), createPropMaterial(true),
      createPaintedMaterial({ color: '#ffffff', occlude: true }),
    ];
    for (const m of faded) {
      expect(m.defines).toHaveProperty('OCCLUDE');
      for (const u of ['uOccSeg', 'uOccCount', 'uOccBox', 'uOccTan', 'uOccDepth', 'uOccUp'] as const) expect(m.uniforms[u]).toBe(groundUniforms[u]);
      expect(m.uniforms.uResolution).toBe(sharedLighting.uResolution);
```


Replace:

```ts
  it('takes every derivative before the fade\'s discard (after a discard they are undefined on some drivers)', () => {
    const faded = [...(['litter', 'detail', 'hero'] as const).map((v) => createLeafMaterial(v)), createPropMaterial(true)];
    for (const m of faded) {
```

with:

```ts
  it('takes every derivative before the fade\'s discard (after a discard they are undefined on some drivers)', () => {
    const faded = [
      ...(['litter', 'detail', 'hero'] as const).map((v) => createLeafMaterial(v)), createPropMaterial(true),
      createPaintedMaterial({ color: '#ffffff', occlude: true }),
    ];
    for (const m of faded) {
```


Replace:

```ts

describe('the ground', () => {
  it('darkens the soil along a fresh trail from the shared map', () => {
    const m = createPaintedMaterial({ color: '#ffffff', trail: true });
    expect(m.defines).toHaveProperty('TRAIL');
    expect(m.uniforms.uDisturbTrail).toBe(groundUniforms.uDisturbTrail);
    expect(m.fragmentShader).toContain('trailShade(vPosW.xz)');
    expect(createPaintedMaterial({ color: '#ffffff' }).defines).not.toHaveProperty('TRAIL');
  });
```

with:

```ts

describe('the floor under the buried worm', () => {
  it('darkens along a fresh trail from the shared map', () => {
    const m = createFloorMaterial();
    expect(m.uniforms.uDisturbTrail).toBe(groundUniforms.uDisturbTrail);
    expect(m.uniforms.uSpine).toBe(groundUniforms.uSpine);
    expect(m.fragmentShader).toContain('trailShade(vPosW.xz)');
    expect(m.vertexShader).toContain('terrainHeight(xz)');
    expect(createPaintedMaterial({ color: '#ffffff' }).defines).not.toHaveProperty('OCCLUDE');
  });
```



In `tests/unit/leafGlsl.test.ts`:


Replace:

```ts
import {
  createDisturbance, recentre, stamp, decay, packDisturbance, disturbedBox, DIST_N, DIST_CELL, DIST_REACH, DIST_SPAN,
} from '../../src/surface/disturbance';
```

with:

```ts
import {
  createDisturbance, recentre, stamp, packDisturbance, DIST_N, DIST_CELL, DIST_REACH, DIST_SPAN,
} from '../../src/surface/disturbance';
```


Replace:

```ts

  it('every leaf over the worm clears its body by 5 mm (shipped maths, 400 placements)', () => {
    // The chunked litter's full leaves (the only ones drawn with the drape), as the chunk writer
    // wrote them: positions relative to each chunk's mesh, anchors in world space.
    // The shipped litter (every preset draws the same count). About 100,000 worm vertices end
    // up under a leaf triangle, so the coverage floor below is far from vacuous.
    const litter = buildLeafLitter(scaledLeafCount(PRESETS.ultra.litter));
```

with:

```ts

  it('every top leaf over the buried worm stays clear of it unmoved: 5 mm or more (400 placements)', () => {
    // The chunked litter's full leaves, as the chunk writer wrote them: positions relative to each
    // chunk's mesh, anchors in world space. They lie on the top of the litter, 2 cm or more over
    // the floor, and the disturbance map never moves them (V2 spec 8.2). Thousands of worm
    // vertices end up under a leaf triangle, so the coverage floor below is far from vacuous.
    const litter = buildLeafLitter(scaledLeafCount(PRESETS.ultra.litter));
```


Replace:

```ts
    const tri: Tri = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const p = [0, 0, 0];
    const a4 = [0, 0, 0, 0];
    const r = clearance(400, ({ pts, sample, ox, oz }, emit) => {
      for (const ch of litter.chunks) {
```

with:

```ts
    const tri: Tri = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const r = clearance(400, ({ pts }, emit) => {
      for (const ch of litter.chunks) {
```


Replace:

```ts
        const anc = g.getAttribute('aAnchor');
        const dipA = g.getAttribute('aDip');
        const idx = g.getIndex()!;
```

with:

```ts
        const anc = g.getAttribute('aAnchor');
        const idx = g.getIndex()!;
```


Replace:

```ts
            const v = idx.getX(t + c);
            p[0] = pos.getX(v) + mx;
            p[1] = pos.getY(v) + my;
            p[2] = pos.getZ(v) + mz;
            a4[0] = anc.getX(v);
            a4[1] = anc.getY(v);
            a4[2] = anc.getZ(v);
            a4[3] = anc.getW(v);
            disturbVertex(sample, ox, oz, true, p, a4, dipA.getX(v), tri[c]);
          }
```

with:

```ts
            const v = idx.getX(t + c);
            tri[c][0] = pos.getX(v) + mx;
            tri[c][1] = pos.getY(v) + my;
            tri[c][2] = pos.getZ(v) + mz;
          }
```


Replace:

```ts
    expect({ failed: r.failed, worst: r.worst }).toEqual({ failed: 0, worst: expect.any(Number) });
  }, 120000);
```

with:

```ts
    expect({ failed: r.failed, worst: r.worst }).toEqual({ failed: 0, worst: expect.any(Number) });
    // Far clear: the top of the litter is 2 cm or more over the floor, the body under 1.2 cm tall.
    expect(r.worst).toBeLessThan(-0.15);
  }, 120000);
```


Replace:

```ts

describe('disturbedBox (where litter chunks may draw without the drape)', () => {
  it('no leaf anchored outside it moves, whatever its size, rest and dip', () => {
    // A worm crawling a curve, leaving a fading trail; the body re-stamped last, as the crawl does.
    const m = createDisturbance();
    const near = new Uint8Array(DIST_N * DIST_N * 4);
    const trail = new Uint8Array(DIST_N * DIST_N * 2);
    for (let s = 0; s < 120; s++) {
      const a = s * 0.02;
      decay(m, 1 / 30);
      const hx = Math.sin(a) * 2.2;
      const hz = 2.2 - Math.cos(a) * 2.2;
      recentre(m, hx, hz);
      for (let k = 0; k < 31; k++) {
        const b = a - k * 0.05;
        stamp(m, Math.sin(b) * 2.2, 2.2 - Math.cos(b) * 2.2, k % 3 === 0 ? 0 : 1);
      }
    }
    packDisturbance(m, near, trail);
    const box = [0, 0, 0, 0];
    disturbedBox(m, box);
    const sample = packedMapSampler(near, trail);
    const ox = m.ci * DIST_CELL;
    const oz = m.cj * DIST_CELL;
    const out = [0, 0, 0];
    let outside = 0;
    let moved = 0;
    for (let x = ox; x <= ox + DIST_SPAN; x += 0.05) {
      for (let z = oz; z <= oz + DIST_SPAN; z += 0.05) {
        const inside = x >= box[0] && x <= box[2] && z >= box[1] && z <= box[3];
        for (const r of [0.05, 0.5, 1.2]) {
          for (const rest of [0.006, 0.12]) {
            const p = [x + r * 0.7, 0.3, z - r * 0.7];
            disturbVertex(sample, ox, oz, true, p, [x, z, r, rest], 0.05, out);
            const still = out[0] === p[0] && out[1] === p[1] && out[2] === p[2];
            if (!inside) {
              outside++;
              expect(still).toBe(true);
            } else if (!still) moved++;
          }
        }
      }
    }
    expect(outside).toBeGreaterThan(10000);
    expect(moved).toBeGreaterThan(1000);
  });
});

describe('drapeProfile', () => {
```

with:

```ts

describe('drapeProfile', () => {
```



In `tests/unit/leafJitter.test.ts`:


Replace:

```ts
import type { Vec3 } from '../../src/core/vec';
import { disturbVertex, packedMapSampler } from '../../src/render/leafGlsl';
import { buildLeafLitter } from '../../src/surface/leafLitterMesh';
import { heroLeafMatrix } from '../../src/surface/heroLeafMesh';
import { HERO_MAX } from '../../src/surface/heroLeaves';
import { PRESETS } from '../../src/render/graphics';
import { Crawl, WORM_SEGMENTS } from '../../src/game/crawl';
import { advance, createStepper } from '../../src/core/stepper';
import { AUTO_DRIVE_MOVE } from '../../src/game/drive';
import type { WormPose } from '../../src/worm/wormMesh';
import { mulberry32 } from '../../src/core/random';
```

with:

```ts
import type { Vec3 } from '../../src/core/vec';
import { packedMapSampler } from '../../src/render/leafGlsl';
import { heroLeafMatrix } from '../../src/surface/heroLeafMesh';
import { HERO_MAX } from '../../src/surface/heroLeaves';
import { PRESETS } from '../../src/render/graphics';
import { Crawl } from '../../src/game/crawl';
import { advance, createStepper } from '../../src/core/stepper';
import { AUTO_DRIVE_MOVE } from '../../src/game/drive';
import { mulberry32 } from '../../src/core/random';
```


Replace:

```ts

// Part 0 measured Step 1a's small leaves; V1 re-measured at real leaf sizes against the same thresholds.
describe('leaves over the crawling worm move smoothly (measured frame to frame)', () => {

  it('litter leaves: on screen, few turn back by more than half a pixel', () => {
    // Every third vertex of the near litter: world position, anchor, dip.
    const litter = buildLeafLitter(scaledLeafCount(PRESETS.ultra.litter));
    const P: number[] = [];
    const A: number[] = [];
    const D: number[] = [];
    for (const ch of litter.chunks) {
      const g = ch.near.geometry;
      const pos = g.getAttribute('position');
      const anc = g.getAttribute('aAnchor');
      const dip = g.getAttribute('aDip');
      // Every vertex: real-size leaves are big and few.
      for (let v = 0; v < pos.count; v++) {
        P.push(pos.getX(v) + ch.near.position.x, pos.getY(v) + ch.near.position.y, pos.getZ(v) + ch.near.position.z);
        A.push(anc.getX(v), anc.getY(v), anc.getZ(v), anc.getW(v));
        D.push(dip.getX(v));
      }
    }
    const n = D.length;
    const camera = new THREE.PerspectiveCamera(60, 1366 / 768, 0.2, 120);
    const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
    const near = new Uint8Array(DIST_N * DIST_N * 4);
    const trail = new Uint8Array(DIST_N * DIST_N * 2);
    const sample = packedMapSampler(near, trail);
    // Per frame, each vertex's on-screen offset from where it rests (pixels at 1366 x 768): only
    // what the map does to it, not the camera's own motion. NaN: off screen (or out of reach).
    const frames: Float32Array[] = [];
    const p = [0, 0, 0];
    const a4 = [0, 0, 0, 0];
    const moved = [0, 0, 0];
    const v3 = new THREE.Vector3();
    crawlFrames(9, (crawl, alpha) => {
      crawl.interpolate(alpha, 0, pose, camera);
      camera.updateMatrixWorld();
      // As uploadDisturbance packs it, and as the GPU reads it back.
      const m = crawl.disturbance;
      packDisturbance(m, near, trail);
      const off = new Float32Array(n * 2).fill(NaN);
      for (let v = 0; v < n; v++) {
        if (Math.abs(A[v * 4] - crawl.focus.x) > 4 || Math.abs(A[v * 4 + 1] - crawl.focus.z) > 4) continue;
        for (let c = 0; c < 3; c++) p[c] = P[v * 3 + c];
        for (let c = 0; c < 4; c++) a4[c] = A[v * 4 + c];
        if (camera.position.distanceTo(v3.set(p[0], p[1], p[2])) < 0.6) continue;
        v3.project(camera);
        if (Math.abs(v3.x) > 1 || Math.abs(v3.y) > 1 || v3.z > 1) continue;
        disturbVertex(sample, m.ci * DIST_CELL, m.cj * DIST_CELL, true, p, a4, D[v], moved);
        if (moved[0] === p[0] && moved[1] === p[1] && moved[2] === p[2]) {
          off[v * 2] = off[v * 2 + 1] = 0;
          continue;
        }
        const rx = v3.x;
        const ry = v3.y;
        v3.set(moved[0], moved[1], moved[2]).project(camera);
        off[v * 2] = (v3.x - rx) * 683;
        off[v * 2 + 1] = (ry - v3.y) * 384;
      }
      frames.push(off);
    });
    const back: number[] = [];
    const a = [0, 0];
    const b = [0, 0];
    const c = [0, 0];
    for (let k = 1; k + 1 < frames.length; k++) {
      for (let v = 0; v < n; v++) {
        a[0] = frames[k - 1][v * 2]; a[1] = frames[k - 1][v * 2 + 1];
        b[0] = frames[k][v * 2]; b[1] = frames[k][v * 2 + 1];
        c[0] = frames[k + 1][v * 2]; c[1] = frames[k + 1][v * 2 + 1];
        // Seen in all three frames, and moved by the map in at least one.
        if (a[0] !== a[0] || b[0] !== b[0] || c[0] !== c[0]) continue;
        if (!(a[0] || a[1] || b[0] || b[1] || c[0] || c[1])) continue;
        back.push(reversal(a, b, c, 2));
      }
    }
    expect(back.length).toBeGreaterThan(5000);
    // Before the fix (points stamped 11 cm apart, packed to bytes): 4.2% and 1.67 px.
    expect(over(back, 0.5)).toBeLessThan(0.012);
    expect(quantile(back, 0.99)).toBeLessThan(0.5);
  }, 120000);

```

with:

```ts

// Part 0 measured Step 1a's small leaves; V1 re-measured at real leaf sizes against the same
// thresholds. V2's top leaves lie over the buried worm and never move; the hero leaves, in its
// pocket, still do.
describe('leaves over the crawling worm move smoothly (measured frame to frame)', () => {

```



In `tests/unit/litterChunks.test.ts`:


Replace:

```ts
  CHUNKS, CHUNK_SIZE, LOD_NEAR, LOD_GAP, chunkIndex, chunkCentreX, chunkCentreZ, chunkDistance,
  groupByChunk, countBelow, nextLod, DRAPE_MARGIN, ACTIVE_MARGIN, boxesMeet, hullBox,
} from '../../src/surface/litterChunks';
import { occlusion, OCC_OUTER, OCC_SEGMENTS } from '../../src/render/occlusion';
import { occluderSegments } from '../../src/render/occluderSegments';
import { SPINE_POINTS } from '../../src/render/groundUniforms';
import { mulberry32 } from '../../src/core/random';
import { PUSH_SLIDE, DRAPE_HEIGHT } from '../../src/render/leafGlsl';
import { WORLD_HALF } from '../../src/surface/terrain';
```

with:

```ts
  CHUNKS, CHUNK_SIZE, LOD_NEAR, LOD_GAP, chunkIndex, chunkCentreX, chunkCentreZ, chunkDistance,
  groupByChunk, countBelow, nextLod, ACTIVE_MARGIN, boxesMeet, hullBox,
} from '../../src/surface/litterChunks';
import { occlusion, worldUpInView, OCC_REACH, OCC_SEGMENTS } from '../../src/render/occlusion';
import { occluderSegments } from '../../src/render/occluderSegments';
import { SPINE_POINTS } from '../../src/render/groundUniforms';
import { mulberry32 } from '../../src/core/random';
import { WORLD_HALF } from '../../src/surface/terrain';
```


Replace:

```ts

  it('pads chunks for the drape and the fade', () => {
    // A lifted leaf rises up to ~0.5 and slides up to PUSH_SLIDE: the bounding spheres need both.
    // Extreme drape probes moved a vertex up to 0.71 from rest.
    expect(DRAPE_MARGIN).toBeGreaterThanOrEqual(0.75);
    expect(DRAPE_MARGIN).toBeGreaterThanOrEqual(Math.hypot(2 * DRAPE_HEIGHT, PUSH_SLIDE));
    expect(ACTIVE_MARGIN).toBe(DRAPE_MARGIN + OCC_OUTER);
  });
```

with:

```ts

  it('pads chunks for the fade (the top leaves never move: they lie over the buried worm)', () => {
    expect(ACTIVE_MARGIN).toBe(OCC_REACH);
  });
```


Replace:

```ts

  it('every pixel the fade drops lies within OCC_OUTER of hullBox (random cameras, spines and pixels)', () => {
    const rng = mulberry32(11);
```

with:

```ts

  it('every pixel the fade drops lies within OCC_REACH of hullBox (random cameras, spines and pixels)', () => {
    const rng = mulberry32(11);
```


Replace:

```ts
    const p = new THREE.Vector3();
    let faded = 0;
```

with:

```ts
    const p = new THREE.Vector3();
    const up = new THREE.Vector3();
    let faded = 0;
```


Replace:

```ts
      const count = occluderSegments(spine, cam.matrixWorldInverse.elements, pe[0], pe[5], seg, box);
      hullBox(cam.position.x, cam.position.z, spine, hull);
```

with:

```ts
      const count = occluderSegments(spine, cam.matrixWorldInverse.elements, pe[0], pe[5], seg, box);
      worldUpInView(cam.matrixWorldInverse.elements, up);
      hullBox(cam.position.x, cam.position.z, spine, hull);
```


Replace:

```ts
        if (dl <= 0.05) continue;
        if (occlusion(p.x / dl, p.y / dl, dl, seg, count, box[4]) <= 0) continue;
        faded++;
```

with:

```ts
        if (dl <= 0.05) continue;
        if (occlusion(p.x / dl, p.y / dl, dl, seg, count, box[4], up.toArray()) <= 0) continue;
        faded++;
```


Replace:

```ts
    expect(worst).toBeGreaterThan(0.05);
    expect(worst).toBeLessThanOrEqual(OCC_OUTER + 1e-4);
  });
```

with:

```ts
    expect(worst).toBeGreaterThan(0.05);
    expect(worst).toBeLessThanOrEqual(OCC_REACH + 1e-4);
  });
```



In `tests/unit/nearClutter.test.ts`:


Replace:

```ts

  it('the world hands the rendered spine to the shader only while it is shown', () => {
    const crawl = new Crawl();
```

with:

```ts

  it('the world hands the rendered spine to the shaders every frame (near clutter, and the pocket\'s leaves on every preset with detail)', () => {
    const crawl = new Crawl();
```


Replace:

```ts
    world.sync(crawl, 1, 0, camera);
    expect(uSpine.every((v) => v === -77)).toBe(true);
    world.apply(PRESETS.ultra);
```

with:

```ts
    world.sync(crawl, 1, 0, camera);
    expect(uSpine.some((v) => v === -77)).toBe(false);
    uSpine.fill(-77);
    world.apply(PRESETS.ultra);
```



Replace the whole of `tests/unit/occlusion.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { occluderSegments } from '../../src/render/occluderSegments';
import {
  occlusion, ign, worldUpInView, OCCLUDE_GLSL, OCCLUSION_FN_GLSL, OCC_AXIS_UP, OCC_DEEP_TO, OCC_DRAPE, OCC_DROP,
  OCC_INNER, OCC_NEAR, OCC_NEAR_FADE, OCC_REACH, OCC_SEGMENTS,
} from '../../src/render/occlusion';
import { SPINE_POINTS } from '../../src/render/groundUniforms';
import { mulberry32 } from '../../src/core/random';

/** A spine (belly line) from the head at (x, 0, z) heading +z, bending by `curve` (1/m). */
function spineFrom(x: number, z: number, curve = 0): Float32Array {
  const s = new Float32Array(SPINE_POINTS * 3);
  for (let i = 0; i < SPINE_POINTS; i++) {
    const a = i * 0.22;
    const th = curve * a;
    const lx = curve === 0 ? 0 : (1 - Math.cos(th)) / curve;
    const lz = curve === 0 ? -a : -Math.sin(th) / curve;
    s.set([x + lx, 0, z + lz], i * 3);
  }
  return s;
}

/**
 * The follow camera's view of a head at the origin heading +z, buried in open litter (V2): 2.6 m
 * behind and 1.1 m over a point 0.1 above the top of the litter (0.55 deep), aiming 1 m ahead
 * and 0.6 up.
 */
function followCamera(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(60, 1366 / 768, 0.2, 120);
  c.position.set(0, 1.75, -2.6);
  c.lookAt(0, 0.6, 1);
  c.updateMatrixWorld();
  return c;
}

/** The fade's inputs for a camera and spine, and occlusion() at a world point. */
function view(c: THREE.PerspectiveCamera, spine: Float32Array) {
  const seg = new Float32Array(OCC_SEGMENTS * 8);
  const box = new Float32Array(5);
  const pe = c.projectionMatrix.elements;
  const count = occluderSegments(spine, c.matrixWorldInverse.elements, pe[0], pe[5], seg, box);
  const up = new THREE.Vector3();
  worldUpInView(c.matrixWorldInverse.elements, up);
  const upA = up.toArray();
  const v = new THREE.Vector3();
  /** NDC x, y and view depth of a world point. */
  const project = (p: number[]): number[] => {
    v.set(p[0], p[1], p[2]).applyMatrix4(c.matrixWorldInverse);
    const d = -v.z;
    return [(v.x / d) * pe[0], (v.y / d) * pe[5], d];
  };
  const at = (p: number[]): number => {
    const [nx, ny, d] = project(p);
    return occlusion(nx / pe[0], ny / pe[5], d, seg, count, box[4], upA);
  };
  return { seg, box, count, project, at, up: upA };
}

const camera = followCamera();
const cam = camera.position.toArray();
const spine = spineFrom(0, 0);
const fv = view(camera, spine);
const axis = (i: number): number[] => [spine[i * 3], spine[i * 3 + 1] + OCC_AXIS_UP, spine[i * 3 + 2]];
/** The point `t` of the way from the camera to body point i's axis, nudged sideways by `side`. */
const along = (i: number, t: number, side = 0): number[] => {
  const a = axis(i);
  return [cam[0] + (a[0] - cam[0]) * t + side, cam[1] + (a[1] - cam[1]) * t, cam[2] + (a[2] - cam[2]) * t];
};

describe('occlusion (which leaf pixels in front of the worm fade)', () => {
  it('drops a leaf well above the body completely, anywhere in front of the visible body (the top of the litter over the buried worm)', () => {
    for (const curve of [0, 0.8, -1.4]) {
      const s = spineFrom(0, 0, curve);
      const f = view(camera, s);
      let checked = 0;
      for (let i = 0; i < SPINE_POINTS; i++) {
        const a = [s[i * 3], s[i * 3 + 1] + OCC_AXIS_UP, s[i * 3 + 2]];
        const [nx, ny, d] = f.project(a);
        if (d < OCC_NEAR + OCC_NEAR_FADE || Math.abs(nx) > 1 || Math.abs(ny) > 1) continue;
        checked++;
        for (const t of [0.3, 0.5]) {
          const p = [0, 1, 2].map((k) => cam[k] + (a[k] - cam[k]) * t);
          // At least OCC_DEEP_TO above the axis: dropped in full.
          expect(p[1] - a[1]).toBeGreaterThan(OCC_DEEP_TO);
          expect(f.at(p), `curve ${curve} point ${i} at ${t}`).toBeCloseTo(1, 6);
        }
      }
      // The head and the body down to the bottom of the frame.
      expect(checked, `curve ${curve}`).toBeGreaterThan(4);
    }
  });

  it('only partly fades a leaf lying on the body, so the worm still reads as under it', () => {
    for (const i of [1, 3, 5]) {
      const a = axis(i);
      expect(fv.at([a[0], a[1] + 0.14, a[2]]), `point ${i}`).toBeCloseTo(OCC_DRAPE, 2);
    }
  });

  it('keeps V1\'s shares for the leaves round the body in its pocket, just in front of it', () => {
    for (const i of [2, 4]) {
      // 10% of the way back toward the camera from the axis: about 0.1 above it, 0.3 from it.
      const o = fv.at(along(i, 0.9));
      expect(o, `point ${i}`).toBeGreaterThan(OCC_DRAPE - 0.01);
      expect(o, `point ${i}`).toBeLessThan(OCC_DROP + 0.01);
    }
  });

  it('leaves alone a leaf beside the body, or behind it', () => {
    expect(fv.at(along(3, 0.5, OCC_REACH * 2))).toBe(0);
    expect(fv.at([1, 0.05, -1])).toBe(0);
    expect(fv.at(along(3, 1.3))).toBe(0);
    expect(fv.at(along(0, 1.15))).toBe(0);
  });

  it('falls off smoothly sideways, the hole wider the higher above the body (the funnel)', () => {
    const edge = (t: number): number => {
      let prev = 1;
      let first0 = -1;
      for (let k = 0; k <= 400; k++) {
        const off = k * 0.002;
        const o = fv.at(along(2, t, off));
        // Next to the body the drop share rises as the leaf leaves it (OCC_DRAPE to OCC_DROP), so
        // the fade may tick up by a hair; it never jumps.
        expect(o).toBeLessThanOrEqual(prev + 0.002);
        if (k > 0) expect(Math.abs(prev - o)).toBeLessThan(0.05);
        if (o === 0 && first0 < 0) first0 = off;
        prev = o;
      }
      // At t of the way the leaf is t as far: the miss at the body is the offset / t.
      return first0 / t;
    };
    const high = edge(0.6);
    const low = edge(0.9);
    expect(low).toBeGreaterThan(OCC_INNER);
    expect(high).toBeGreaterThan(low + 0.1);
    expect(high).toBeLessThan(OCC_REACH + 0.02);
  });

  it('keeps 40% of a clear occluder, as the spec says', () => {
    expect(1 - OCC_DROP).toBeCloseTo(0.4, 12);
    expect(OCC_DRAPE).toBeLessThan(OCC_DROP);
  });
});

describe('occluderSegments (the projected body and the screen box that skips the loop elsewhere)', () => {
  const rng = mulberry32(9);
  const ndc = new THREE.Vector3();
  const dir = new THREE.Vector3();

  /** Leaves anywhere on screen at any depth: every one that fades lies inside the box. */
  function holds(s: Float32Array, c: THREE.PerspectiveCamera): number {
    const f = view(c, s);
    let hits = 0;
    for (let k = 0; k < 60000; k++) {
      ndc.set(rng() * 2 - 1, rng() * 2 - 1, 0.5).unproject(c);
      dir.copy(ndc).sub(c.position).normalize();
      const t = 0.25 + rng() * 4;
      const p = [c.position.x + dir.x * t, c.position.y + dir.y * t, c.position.z + dir.z * t];
      const o = f.at(p);
      // The depth early-out is exact: without it, the same answer.
      const [tx, ty, d] = f.project(p);
      const pe = c.projectionMatrix.elements;
      expect(occlusion(tx / pe[0], ty / pe[5], d, f.seg, f.count, Infinity, f.up)).toBe(o);
      if (o <= 0) continue;
      hits++;
      const [nx, ny] = f.project(p);
      expect(nx).toBeGreaterThanOrEqual(f.box[0]);
      expect(nx).toBeLessThanOrEqual(f.box[2]);
      expect(ny).toBeGreaterThanOrEqual(f.box[1]);
      expect(ny).toBeLessThanOrEqual(f.box[3]);
    }
    return hits;
  }

  it('the box holds every pixel the fade touches: straight, curled, the tail under the camera', () => {
    expect(holds(spineFrom(0, 0), camera)).toBeGreaterThan(300);
    expect(holds(spineFrom(0, 0, 1.2), camera)).toBeGreaterThan(300);
    expect(holds(spineFrom(0.4, -1.2, -0.9), camera)).toBeGreaterThan(300);
    // The tail runs under and behind the camera, crossing the near limit.
    expect(holds(spineFrom(0, 0.6), camera)).toBeGreaterThan(300);
    const side = followCamera();
    side.position.set(1.5, 0.9, -1.2);
    side.lookAt(-0.5, 0.2, 0.5);
    side.updateMatrixWorld();
    expect(holds(spineFrom(0, 0, 0.6), side)).toBeGreaterThan(300);
  });

  it('keeps few segments: a straight worm is one, a gently curving one a handful', () => {
    expect(fv.count).toBe(1);
    const curving = view(camera, spineFrom(0, 0, 0.5));
    expect(curving.count).toBeGreaterThan(1);
    expect(curving.count).toBeLessThan(10);
    // A tight curl keeps every segment it needs.
    expect(view(camera, spineFrom(0, 0, 1.6)).count).toBeGreaterThan(curving.count);
  });

  it('keeps only the part in view: the straight worm from the follow camera, a box round it', () => {
    const b = fv.box;
    // NDC spans 2 x 2: under 40% of the screen (V1's tighter hole, without the funnel, under a sixth).
    expect(((Math.min(b[2], 1) - Math.max(b[0], -1)) * (Math.min(b[3], 1) - Math.max(b[1], -1))) / 4).toBeLessThan(0.4);
    // Every kept end is in front, at OCC_NEAR or deeper, and box[4] is the farthest of them.
    let far = 0;
    for (let i = 0; i < fv.count * 2; i++) {
      expect(1 / fv.seg[i * 4 + 2]).toBeGreaterThanOrEqual(OCC_NEAR - 1e-6);
      far = Math.max(far, 1 / fv.seg[i * 4 + 2]);
    }
    expect(fv.box[4]).toBeCloseTo(far, 4);
  });

  it('keeps nothing when the worm is behind the camera or well off the side of the view', () => {
    for (const s of [spineFrom(0, -4), spineFrom(-12, 1)]) {
      const f = view(camera, s);
      expect(f.count).toBe(0);
      expect(Array.from(f.box)).toEqual([2, 2, -2, -2, 0]);
    }
  });
});

describe('the dither', () => {
  it('drops the asked share of pixels, from a pattern fixed in screen space', () => {
    let below = 0;
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) if (ign(x + 0.5, y + 0.5) < OCC_DROP) below++;
    expect(below / 128 / 128).toBeCloseTo(OCC_DROP, 2);
    expect(ign(10.5, 20.5)).toBe(ign(10.5, 20.5));
  });

  it('has a GLSL twin that skips pixels outside the box before the segment loop', () => {
    expect(OCCLUDE_GLSL).toContain('bool fadedOut()');
    expect(OCCLUDE_GLSL).toContain('uniform vec4 uOccBox;');
    expect(OCCLUDE_GLSL.indexOf('return false;')).toBeLessThan(OCCLUDE_GLSL.indexOf('occlusion(ndc'));
    expect(OCCLUSION_FN_GLSL).toContain(`for (int i = 0; i < ${OCC_SEGMENTS}; i++)`);
    expect(OCCLUSION_FN_GLSL).toContain('mix(0.400000000, 0.600000000');
  });
});
```

In `tests/unit/sceneTiers.test.ts`:


Replace:

```ts
import {
  CHUNKS, CHUNK_SIZE, LOD_NEAR, LOD_GAP, ACTIVE_MARGIN, chunkIndex, chunkDistance,
} from '../../src/surface/litterChunks';
```

with:

```ts
import {
  CHUNKS, CHUNK_SIZE, LOD_NEAR, LOD_GAP, chunkIndex, chunkDistance,
} from '../../src/surface/litterChunks';
```


Replace:

```ts
const total = (l: LeafLitter) => l.chunks.reduce((a, c) => a + c.near.geometry.index!.count, 0);
const EMPTY = [Infinity, Infinity, -Infinity, -Infinity];
/** A straight worm along -z from (x, z) (head first), the camera 2.6 behind its head. */
```

with:

```ts
const total = (l: LeafLitter) => l.chunks.reduce((a, c) => a + c.near.geometry.index!.count, 0);
/** A straight worm along -z from (x, z) (head first), the camera 2.6 behind its head. */
```


Replace:

```ts
      const w = straightWorm(0, 0);
      litter.update(w.camX, w.camZ, w.spine, EMPTY);
      const here = litter.chunks[chunkIndex(0, 0)];
```

with:

```ts
      const w = straightWorm(0, 0);
      litter.update(w.camX, w.camZ, w.spine);
      const here = litter.chunks[chunkIndex(0, 0)];
```


Replace:

```ts

    it('uses the reacting material only where leaves can move or fade, and the three are precompiled variants', () => {
      const { active, plain, far } = litter.materials;
      expect(active.defines).toHaveProperty('DISTURB');
      expect(active.defines).toHaveProperty('OCCLUDE');
```

with:

```ts

    it('uses the reacting material only where leaves can fade, and the three are precompiled variants', () => {
      const { active, plain, far } = litter.materials;
      // The top leaves lie over the buried worm: they fade over it, but never move (V2 spec 8.2).
      expect(active.defines).not.toHaveProperty('DISTURB');
      expect(active.defines).toHaveProperty('OCCLUDE');
```


Replace:

```ts
      // An empty map (Low, or a still worm before its first step): only the fade's hull reacts.
      litter.update(w.camX, w.camZ, w.spine, EMPTY);
      const here = litter.chunks[chunkIndex(-3, -3)];
```

with:

```ts
      // An empty map (Low, or a still worm before its first step): only the fade's hull reacts.
      litter.update(w.camX, w.camZ, w.spine);
      const here = litter.chunks[chunkIndex(-3, -3)];
```


Replace:

```ts
      expect(litter.chunks[chunkIndex(15, 15)].far.material).toBe(far);
      // The disturbed part of the map reacts too, grown by the drape and the fade's reach.
      const box = litter.chunks[chunkIndex(15, -15)].box;
      const dist = [box[2] + ACTIVE_MARGIN - 0.01, -15, box[2] + 1, -14];
      litter.update(w.camX, w.camZ, w.spine, dist);
      expect(litter.chunks[chunkIndex(15, -15)].active).toBe(true);
      dist[0] = box[2] + ACTIVE_MARGIN + 0.01;
      litter.update(w.camX, w.camZ, w.spine, dist);
      expect(litter.chunks[chunkIndex(15, -15)].active).toBe(false);
```

with:

```ts
      expect(litter.chunks[chunkIndex(15, 15)].far.material).toBe(far);
      // Only the fade's hull reacts: chunks far from the camera and the worm do not.
      expect(litter.chunks[chunkIndex(15, -15)].active).toBe(false);
```


Replace:

```ts

    it('a reacting chunk always shows its full leaves, even beyond LOD_NEAR', () => {
      const w = straightWorm(-15, -15);
      const c = chunkIndex(15, 15);
      const box = litter.chunks[c].box;
      litter.update(w.camX, w.camZ, w.spine, [box[0], box[1], box[0] + 0.5, box[1] + 0.5]);
      expect(chunkDistance(c, w.camX, w.camZ)).toBeGreaterThan(LOD_NEAR + 2);
      expect(litter.chunks[c].active).toBe(true);
      expect(litter.chunks[c].near.visible).toBe(true);
      expect(litter.chunks[c].far.visible).toBe(false);
      litter.update(w.camX, w.camZ, w.spine, EMPTY);
      expect(litter.chunks[c].far.visible).toBe(true);
    });
```

with:

```ts

    it('a reacting chunk always shows its full leaves', () => {
      const w = straightWorm(-3, -3);
      litter.update(w.camX, w.camZ, w.spine);
      for (const ch of litter.chunks) {
        if (!ch.active) continue;
        expect(ch.near.visible).toBe(true);
        expect(ch.far.visible).toBe(false);
      }
    });
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/occlusion.test.ts tests/unit/floorPatch.test.ts`
Expected: FAIL: `worldUpInView` and `OCC_REACH` are not exported; `../../src/surface/floorPatch` does not exist.

- [ ] **Step 3: Implement**

In `src/game/world.ts`:


Replace:

```ts
import { occluderSegments } from '../render/occluderSegments';
import { disturbedBox } from '../surface/disturbance';
import { PRESETS, type PresetSpec } from '../render/graphics';
```

with:

```ts
import { occluderSegments } from '../render/occluderSegments';
import { worldUpInView } from '../render/occlusion';
import { PRESETS, type PresetSpec } from '../render/graphics';
```


Replace:

```ts
import { buildGroundProps, writeHeroLog, type GroundProps } from '../surface/groundProps';
import { HeroWorm, type WormPose } from '../worm/wormMesh';
```

with:

```ts
import { buildGroundProps, writeHeroLog, type GroundProps } from '../surface/groundProps';
import { buildFloorPatch } from '../surface/floorPatch';
import { GROUND_ORDER } from '../render/drawOrder';
import { HeroWorm, type WormPose } from '../worm/wormMesh';
```


Replace:

```ts
  readonly litter: LeafLitter;
  /** The close-up leaf layer around the worm (built when a preset first draws it). */
  readonly detail: DetailLayer;
```

with:

```ts
  readonly litter: LeafLitter;
  /** The close-up leaf layer around the worm, on the top of the litter (built when a preset first draws it). */
  readonly detail: DetailLayer;
```


Replace:

```ts
  const terrain = buildTerrain();
  terrain.renderOrder = 5;
  forest.add(terrain, buildForestTrees(writeHeroLog), buildDistantTrees(), litter.group, detail.group, props.mesh);
  const hero = new HeroLeafMesh(crawl.hero);
```

with:

```ts
  const terrain = buildTerrain();
  terrain.renderOrder = GROUND_ORDER;
  forest.add(
    terrain, buildFloorPatch(), buildForestTrees(writeHeroLog), buildDistantTrees(), litter.group, detail.group,
    props.mesh,
  );
  const hero = new HeroLeafMesh(crawl.hero);
```


Replace:

```ts
  const occBox = new Float32Array(5);
  // Where the uploaded map can move a leaf (disturbedBox); empty until the first upload.
  const distBox = new Float32Array([Infinity, Infinity, -Infinity, -Infinity]);

```

with:

```ts
  const occBox = new Float32Array(5);

```


Replace:

```ts
      setFocus(crawl.focus.x, crawl.focus.y, crawl.focus.z);
      if (nearClutter.visible) setSpine(pose.spine);
      // The leaf fade (every preset): the body as this frame's camera sees it.
```

with:

```ts
      setFocus(crawl.focus.x, crawl.focus.y, crawl.focus.z);
      // The near clutter keeps clear of the spine, and the floor patch centres on it.
      setSpine(pose.spine);
      // The leaf fade (every preset): the body as this frame's camera sees it.
```


Replace:

```ts
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
      litter.update(camera.position.x, camera.position.z, pose.spine, distBox);
    },
```

with:

```ts
      g.uOccDepth.value = occBox[4];
      worldUpInView(view, g.uOccUp.value);
      g.uOccTan.value.set(1 / pe[0], 1 / pe[5]);
      if (crawl.disturbed) {
        uploadDisturbance(crawl.disturbance);
        // The window the pocket's leaves read the map in.
        setDisturbFade(crawl.reach.fadeFrom, crawl.reach.fadeTo);
        crawl.disturbed = false;
      }
      // Per litter chunk: full or low-detail leaves, and whether it may fade.
      litter.update(camera.position.x, camera.position.z, pose.spine);
    },
```



Create `src/render/drawOrder.ts`:

```ts
/**
 * Opaque draw order (three sorts by renderOrder before depth). The top of the litter is drawn after
 * everything lying on it, so the depth test skips ground pixels the leaves already cover; the worm's
 * pocket (V2 spec 8.2: the worm, the leaves round it and the floor under them, all below the top of
 * the litter) is drawn after the top, so the depth test skips all of it but what the hole shows.
 */
/** The top of the litter: the terrain mesh. */
export const GROUND_ORDER = 5;
/** In the pocket: the worm, the detail and hero leaves round it. */
export const POCKET_ORDER = 6;
/** The floor under them (largest, and behind them all). */
export const FLOOR_ORDER = 7;
```

Create `src/render/floorMaterial.ts`:

```ts
import * as THREE from 'three';
import { TERRAIN_GLSL } from '../surface/terrain';
import { sharedLighting, PAINTED_VERTEX_GLSL, PAINTED_LIGHT_GLSL, GRADE_GLSL } from './paintedMaterial';
import { groundUniforms, SPINE_POINTS } from './groundUniforms';
import { TRAIL_GROUND_GLSL } from './leafGlsl';
import { glslFloat as f } from './glslNumber';

/**
 * Side of the floor patch (m), centred on the middle of the body: half the body (1.65) plus what
 * the hole shows round it, at a slant, either way. Small, as even its rejected pixels cost.
 */
export const FLOOR_SIZE = 7;
/** Quads per side: 0.25 m cells, fine enough that the patch follows the floor within a millimetre. */
export const FLOOR_SEGS = 28;
/** The spine point the patch centres on (of SPINE_POINTS, head first): the middle of the body. */
export const FLOOR_CENTRE = 7;
const CELL = FLOOR_SIZE / FLOOR_SEGS;
/**
 * How much of the light reaches the floor under 2 to 5 cm of leaves: the pocket the worm travels
 * in reads as shaded, damp and deep.
 */
export const FLOOR_LIGHT = 0.6;

/**
 * The F layer's top round the worm (V2 spec 5.1 and 8.2; Matt's photos IMG_2427 and IMG_2428):
 * dark brown to black, wet, matted fragments of last years' leaves, white fungal threads, a sprig
 * of moss here and there, and the worm's fresh trail darker still. One square patch of FLOOR_SIZE
 * that the vertex shader keeps under the middle of the body (uSpine's FLOOR_CENTRE point, snapped
 * to its cells, so nothing swims), each vertex
 * on the floor (TERRAIN_GLSL, the twin of floorHeight). It is drawn after the litter top, so only
 * what the hole over the worm shows is shaded: everywhere else the depth test rejects it.
 * Position attribute: (x, z) in cells from the patch's centre (y unused).
 */
const vertexShader = /* glsl */ `
  uniform vec3 uSpine[${SPINE_POINTS}];
  uniform vec3 uLightDir;
  uniform vec3 uLightColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec3 vPosW;
  varying vec3 vNoise;
  varying vec4 vFog;
  ${PAINTED_VERTEX_GLSL}
  ${TERRAIN_GLSL}
  void main() {
    vec2 xz = floor(uSpine[${FLOOR_CENTRE}].xz / ${f(CELL)} + 0.5) * ${f(CELL)} + position.xz * ${f(CELL)};
    vec3 wp = vec3(xz.x, terrainHeight(xz), xz.y);
    vPosW = wp;
    vec3 toCam = cameraPosition - wp;
    float dist = length(toCam);
    vNoise = worldBrushCoord(wp, dist);
    vFog = distanceHaze(toCam, dist);
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uLightDir;
  uniform vec3 uLightColor;
  uniform vec3 uSkyColor;
  uniform vec3 uGroundColor;
  uniform vec3 uRimColor;
  uniform float uRim;
  uniform vec2 uResolution;
  uniform sampler2D uNoise;
  varying vec3 vPosW;
  varying vec3 vNoise;
  varying vec4 vFog;
  ${PAINTED_LIGHT_GLSL}
  ${GRADE_GLSL}
  ${TRAIL_GROUND_GLSL}
  void main() {
    // Two fetches of the shared noise: leaf-fragment plates (about 2 cm) and fine detail.
    vec4 big = texture2D(uNoise, vPosW.xz * 0.11);
    vec4 fine = texture2D(uNoise, vPosW.xz * 0.47 + 0.37);
    // Matted fragments: plates of near-black and dark brown with darker seams between them.
    float plate = smoothstep(0.38, 0.62, big.r + (fine.g - 0.5) * 0.35);
    vec3 col = mix(vec3(0.035, 0.022, 0.013), vec3(0.11, 0.065, 0.032), plate);
    col *= 0.7 + 0.6 * fine.b;
    float seam = 1.0 - smoothstep(0.0, 0.06, abs(big.r + (fine.g - 0.5) * 0.35 - 0.5));
    col *= 1.0 - 0.45 * seam;
    // White fungal threads: thin ridges of the stroke channel, only in some patches.
    float thread = (1.0 - smoothstep(0.0, 0.025, abs(fine.g - 0.5))) * smoothstep(0.62, 0.8, big.a);
    col = mix(col, vec3(0.62, 0.58, 0.48), thread * 0.7);
    // A sprig of moss creeping over here and there.
    float moss = smoothstep(0.74, 0.8, fine.b) * smoothstep(0.45, 0.65, big.g);
    col = mix(col, vec3(0.16, 0.24, 0.05), moss);
    // The worm's fresh trail: darker, freshly turned.
    col *= trailShade(vPosW.xz);
    vec3 n = vec3(0.0, 1.0, 0.0);
    vec3 v = normalize(cameraPosition - vPosW);
    float b = (fine.g - 0.5) * 0.3;
    vec3 lit = paintedLight(col, n, v, b, 1.0) * ${f(FLOOR_LIGHT)};
    // Wet: a soft sheen on the plates.
    vec3 h = normalize(uLightDir + v);
    float spec = pow(max(dot(normalize(n + vec3(fine.r - 0.5, 0.0, fine.a - 0.5) * 0.6), h), 0.0), 24.0);
    lit += uLightColor * spec * 0.12 * plate;
    lit = mix(lit, vFog.rgb, vFog.a);
    gl_FragColor = vec4(paintedGrade(lit), 1.0);
    #include <colorspace_fragment>
  }
`;

export function createFloorMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...sharedLighting,
      uSpine: groundUniforms.uSpine,
      uDisturbTrail: groundUniforms.uDisturbTrail,
      uDistOrigin: groundUniforms.uDistOrigin,
      uDistFade: groundUniforms.uDistFade,
      uLeafReact: groundUniforms.uLeafReact,
    },
    vertexShader,
    fragmentShader,
  });
}
```

In `src/render/groundUniforms.ts`:


Replace:

```ts
  uOccDepth: { value: 0 },
  /** 1 when leaves react to the worm; 0 (Low) skips every disturbance fetch, without a recompile. */
```

with:

```ts
  uOccDepth: { value: 0 },
  /** The world's up in view space (x, y, depth): how high above the body a pixel lies (the funnel). */
  uOccUp: { value: new THREE.Vector3(0, 1, 0) },
  /** 1 when leaves react to the worm; 0 (Low) skips every disturbance fetch, without a recompile. */
```



In `src/render/leafMaterial.ts`:


Replace:

```ts
/**
 * Which leaves: litter chunks that can react to the worm (disturbance map, occluder fade), other
 * full-leaf litter chunks ('plain', neither), distant low-detail litter ('far'), the close-up
 * detail layer (reacts), the falling leaves (animated), or the hero leaves (instanced, moved by
 * their own physics). The litter swaps between the first three per chunk, never recompiling.
 */
```

with:

```ts
/**
 * Which leaves: litter chunks near the worm ('litter': they fade over it), other full-leaf litter
 * chunks ('plain'), distant low-detail litter ('far'), the close-up top leaves ('detail': they
 * fade), the falling leaves (animated), or the hero leaves (instanced, moved by their own physics).
 * The litter swaps between the first three per chunk, never recompiling. The top leaves lie 2 to
 * 5 cm above the worm (V2 spec 8.2), so the disturbance map no longer moves them.
 */
```


Replace:

```ts
const DEFINES: Record<LeafVariant, Record<string, string>> = {
  litter: { DISTURB: '', OCCLUDE: '' },
  plain: {},
  far: { LOD: '' },
  falling: { FALLING: '' },
  detail: { DETAIL: '', DISTURB: '', OCCLUDE: '' },
  hero: { HERO: '', OCCLUDE: '' },
```

with:

```ts
const DEFINES: Record<LeafVariant, Record<string, string>> = {
  litter: { OCCLUDE: '' },
  plain: {},
  far: { LOD: '' },
  falling: { FALLING: '' },
  detail: { DETAIL: '', OCCLUDE: '' },
  hero: { HERO: '', OCCLUDE: '' },
```



In `src/render/occluderSegments.ts`:


Replace:

```ts
import { SPINE_POINTS } from './groundUniforms';
import { OCC_AXIS_UP, OCC_NEAR, OCC_OUTER, OCC_SIMPLIFY } from './occlusion';

```

with:

```ts
import { SPINE_POINTS } from './groundUniforms';
import { OCC_AXIS_UP, OCC_NEAR, OCC_REACH, OCC_SIMPLIFY } from './occlusion';

```


Replace:

```ts
  seg[o + 2] = 1 / d;
  // occlusion() is 0 past a miss of OCC_OUTER: a disk of OCC_OUTER / d in tan space.
  const r = OCC_OUTER / d;
  box[0] = Math.min(box[0], (tx - r) * p00);
```

with:

```ts
  seg[o + 2] = 1 / d;
  // occlusion() is 0 past a miss of OCC_REACH: a disk of OCC_REACH / d in tan space.
  const r = OCC_REACH / d;
  box[0] = Math.min(box[0], (tx - r) * p00);
```


Replace:

```ts
 * simplified to within OCC_SIMPLIFY. Each segment is clipped to depth OCC_NEAR or more and to the
 * frustum's sides pushed out by OCC_OUTER (an axis point beyond that is farther than OCC_OUTER
 * from every on-screen ray, so it cannot fade a pixel); what remains goes into seg (the layout
```

with:

```ts
 * simplified to within OCC_SIMPLIFY. Each segment is clipped to depth OCC_NEAR or more and to the
 * frustum's sides pushed out by OCC_REACH (an axis point beyond that is farther than OCC_REACH
 * from every on-screen ray, so it cannot fade a pixel); what remains goes into seg (the layout
```


Replace:

```ts
  plane(0, 0, 0, 1, -OCC_NEAR);
  plane(1, kx, 0, kx / p00, OCC_OUTER);
  plane(2, -kx, 0, kx / p00, OCC_OUTER);
  plane(3, 0, ky, ky / p11, OCC_OUTER);
  plane(4, 0, -ky, ky / p11, OCC_OUTER);
  keep.fill(0);
```

with:

```ts
  plane(0, 0, 0, 1, -OCC_NEAR);
  plane(1, kx, 0, kx / p00, OCC_REACH);
  plane(2, -kx, 0, kx / p00, OCC_REACH);
  plane(3, 0, ky, ky / p11, OCC_REACH);
  plane(4, 0, -ky, ky / p11, OCC_REACH);
  keep.fill(0);
```



In `src/render/occlusion.ts`:


Replace:

```ts
 * body (within OCC_TOUCH of its axis), so a worm under thin litter still reads as under it.
 */
```

with:

```ts
 * body (within OCC_TOUCH of its axis), so a worm under thin litter still reads as under it.
 *
 * The funnel (V2 spec 8.2: the worm travels buried in the litter, the leaves above it fade): the
 * higher above the body's axis a pixel lies (world up, uOccUp), the wider its hole (OCC_FUNNEL per
 * metre, up to OCC_FUNNEL_HEIGHT), and from OCC_DEEP_FROM to OCC_DEEP_TO above the axis it drops
 * completely. So the top of the litter (the drawn ground and the top leaves, 2 to 5 cm above the
 * worm) opens wide and clean over it, while the leaves round it in its pocket keep the V1 shares:
 * a look down into the litter, not an x-ray outline.
 */
```


Replace:

```ts
export const OCC_CLEAR = 0.4;
/**
```

with:

```ts
export const OCC_CLEAR = 0.4;
/** The hole widens by this (m) per metre a pixel lies above the body's axis... */
export const OCC_FUNNEL = 0.25;
/** ...up to this high (the deepest litter's top). */
export const OCC_FUNNEL_HEIGHT = 1.2;
/** The widest the hole gets (round the axis): occluderSegments' screen box covers this. */
export const OCC_REACH = OCC_OUTER + OCC_FUNNEL * OCC_FUNNEL_HEIGHT;
/** From this high above the axis (past the body's top) a pixel drops more, fully by OCC_DEEP_TO. */
export const OCC_DEEP_FROM = 0.15;
export const OCC_DEEP_TO = 0.3;
/**
```


Replace:

```ts
 * tan-space direction (tx, ty) (NDC x / p00, y / p11), for a leaf at view depth dl there. seg and
 * count are occluderSegments' output; far its farthest kept depth (box[4], uOccDepth).
 */
export function occlusion(
  tx: number, ty: number, dl: number, seg: ArrayLike<number>, count: number, far: number,
): number {
```

with:

```ts
 * tan-space direction (tx, ty) (NDC x / p00, y / p11), for a leaf at view depth dl there. seg and
 * count are occluderSegments' output; far its farthest kept depth (box[4], uOccDepth); up the
 * world's up in view space as (x, y, depth) (uOccUp, worldUpInView).
 */
export function occlusion(
  tx: number, ty: number, dl: number, seg: ArrayLike<number>, count: number, far: number, up: ArrayLike<number>,
): number {
```


Replace:

```ts
  }
  if (best >= OCC_OUTER * OCC_OUTER) return 0;
  const o = bi * 8;
  const ds = 1 / (seg[o + 2] + (seg[o + 6] - seg[o + 2]) * bu);
  // How near the leaf lies to the body: to the line of that segment (stretched to its neighbours'
```

with:

```ts
  }
  if (best >= OCC_REACH * OCC_REACH) return 0;
  const o = bi * 8;
  const ds = 1 / (seg[o + 2] + (seg[o + 6] - seg[o + 2]) * bu);
  const front = ds - dl;
  // How near the leaf lies to the body: to the line of that segment (stretched to its neighbours'
```


Replace:

```ts
  const v = Math.min(3, Math.max(-2, (lx * ex + ly * ey + lz * ed) / Math.max(ex * ex + ey * ey + ed * ed, 1e-8)));
  const touch = Math.hypot(lx - ex * v, ly - ey * v, lz - ed * v);
  return (1 - smoothstep(OCC_INNER, OCC_OUTER, Math.sqrt(best)))
    * smoothstep(OCC_FRONT, OCC_FRONT_FULL, ds - dl)
    * smoothstep(OCC_NEAR, OCC_NEAR + OCC_NEAR_FADE, ds)
    * (OCC_DRAPE + (OCC_DROP - OCC_DRAPE) * smoothstep(OCC_TOUCH, OCC_CLEAR, touch));
}
```

with:

```ts
  const v = Math.min(3, Math.max(-2, (lx * ex + ly * ey + lz * ed) / Math.max(ex * ex + ey * ey + ed * ed, 1e-8)));
  const tx3 = lx - ex * v;
  const ty3 = ly - ey * v;
  const td3 = lz - ed * v;
  const touch = Math.hypot(tx3, ty3, td3);
  // How high above the axis the leaf lies (world up): the funnel.
  const h = tx3 * up[0] + ty3 * up[1] + td3 * up[2];
  const grow = OCC_FUNNEL * Math.min(OCC_FUNNEL_HEIGHT, Math.max(0, h));
  const drop = OCC_DRAPE + (OCC_DROP - OCC_DRAPE) * smoothstep(OCC_TOUCH, OCC_CLEAR, touch);
  return (1 - smoothstep(OCC_INNER + grow, OCC_OUTER + grow, Math.sqrt(best)))
    * smoothstep(OCC_FRONT, OCC_FRONT_FULL, front)
    * smoothstep(OCC_NEAR, OCC_NEAR + OCC_NEAR_FADE, ds)
    * (drop + (1 - drop) * smoothstep(OCC_DEEP_FROM, OCC_DEEP_TO, h));
}

/**
 * The world's up (0, 1, 0) in view space as (x, y, depth), from a view matrix (three's
 * matrixWorldInverse elements, column-major): uOccUp. Writes `out`.
 */
export function worldUpInView(view: ArrayLike<number>, out: { set(x: number, y: number, z: number): unknown }): void {
  out.set(view[4], view[5], -view[6]);
}
```


Replace:

```ts

/** GLSL occlusion(t, dl), stage-agnostic: needs uOccSeg, uOccCount and uOccDepth declared. */
export const OCCLUSION_FN_GLSL = /* glsl */ `
```

with:

```ts

/** GLSL occlusion(t, dl), stage-agnostic: needs uOccSeg, uOccCount, uOccDepth and uOccUp declared. */
export const OCCLUSION_FN_GLSL = /* glsl */ `
```


Replace:

```ts
    }
    if (best >= ${f(OCC_OUTER * OCC_OUTER)}) return 0.0;
    vec4 a = uOccSeg[2 * bi];
    vec4 b = uOccSeg[2 * bi + 1];
    float ds = 1.0 / mix(a.z, b.z, bu);
    vec3 A = vec3(a.xy, 1.0) / a.z;
```

with:

```ts
    }
    if (best >= ${f(OCC_REACH * OCC_REACH)}) return 0.0;
    vec4 a = uOccSeg[2 * bi];
    vec4 b = uOccSeg[2 * bi + 1];
    float ds = 1.0 / mix(a.z, b.z, bu);
    float front = ds - dl;
    vec3 A = vec3(a.xy, 1.0) / a.z;
```


Replace:

```ts
    float v = clamp(dot(l, e) / max(dot(e, e), 1e-8), -2.0, 3.0);
    float touch = length(l - e * v);
    return (1.0 - smoothstep(${f(OCC_INNER)}, ${f(OCC_OUTER)}, sqrt(best)))
      * smoothstep(${f(OCC_FRONT)}, ${f(OCC_FRONT_FULL)}, ds - dl)
      * smoothstep(${f(OCC_NEAR)}, ${f(OCC_NEAR + OCC_NEAR_FADE)}, ds)
      * mix(${f(OCC_DRAPE)}, ${f(OCC_DROP)}, smoothstep(${f(OCC_TOUCH)}, ${f(OCC_CLEAR)}, touch));
  }
```

with:

```ts
    float v = clamp(dot(l, e) / max(dot(e, e), 1e-8), -2.0, 3.0);
    vec3 off = l - e * v;
    float touch = length(off);
    float h = dot(off, uOccUp);
    float grow = ${f(OCC_FUNNEL)} * clamp(h, 0.0, ${f(OCC_FUNNEL_HEIGHT)});
    float drop = mix(${f(OCC_DRAPE)}, ${f(OCC_DROP)}, smoothstep(${f(OCC_TOUCH)}, ${f(OCC_CLEAR)}, touch));
    return (1.0 - smoothstep(${f(OCC_INNER)} + grow, ${f(OCC_OUTER)} + grow, sqrt(best)))
      * smoothstep(${f(OCC_FRONT)}, ${f(OCC_FRONT_FULL)}, front)
      * smoothstep(${f(OCC_NEAR)}, ${f(OCC_NEAR + OCC_NEAR_FADE)}, ds)
      * mix(drop, 1.0, smoothstep(${f(OCC_DEEP_FROM)}, ${f(OCC_DEEP_TO)}, h));
  }
```


Replace:

```ts
  uniform float uOccDepth;
  ${OCCLUSION_FN_GLSL}
```

with:

```ts
  uniform float uOccDepth;
  uniform vec3 uOccUp;
  ${OCCLUSION_FN_GLSL}
```



In `src/render/paintedMaterial.ts`:


Replace:

```ts
import { groundUniforms } from './groundUniforms';
import { TRAIL_GROUND_GLSL } from './leafGlsl';

```

with:

```ts
import { groundUniforms } from './groundUniforms';
import { OCCLUDE_GLSL } from './occlusion';

```


Replace:

```ts
  ${GRADE_GLSL}
  #ifdef TRAIL
  ${TRAIL_GROUND_GLSL}
  #endif

  void main() {
    vec3 n = normalize(vNormalW);
```

with:

```ts
  ${GRADE_GLSL}
  #ifdef OCCLUDE
  ${OCCLUDE_GLSL}
  #endif

  void main() {
    #ifdef OCCLUDE
      if (fadedOut()) discard;
    #endif
    vec3 n = normalize(vNormalW);
```


Replace:

```ts
    vec3 base = vColor * mix(vec3(1.0), tint, 0.7 * uBrush) * (1.0 + b * 0.45);
    #ifdef TRAIL
      base *= trailShade(vPosW.xz);
    #endif
    vec3 v = normalize(cameraPosition - vPosW);
```

with:

```ts
    vec3 base = vColor * mix(vec3(1.0), tint, 0.7 * uBrush) * (1.0 + b * 0.45);
    vec3 v = normalize(cameraPosition - vPosW);
```


Replace:

```ts
  vertexColors?: boolean;
  /** The ground: darken the soil along the worm's fresh trail (reads the disturbance map). */
  trail?: boolean;
}
```

with:

```ts
  vertexColors?: boolean;
  /**
   * The ground (the top of the litter): its pixels in front of the buried worm drop out in the
   * leaves' screen-space dither (occlusion.ts), so the worm shows in its pocket.
   */
  occlude?: boolean;
}
```


Replace:

```ts
      uBrush: { value: opts.brush ?? 0.6 },
      ...(opts.trail ? {
        uDisturbTrail: groundUniforms.uDisturbTrail,
        uDistOrigin: groundUniforms.uDistOrigin,
        uDistFade: groundUniforms.uDistFade,
        uLeafReact: groundUniforms.uLeafReact,
      } : {}),
    },
    defines: opts.trail ? { TRAIL: '' } : {},
    vertexShader,
```

with:

```ts
      uBrush: { value: opts.brush ?? 0.6 },
      ...(opts.occlude ? {
        uOccSeg: groundUniforms.uOccSeg,
        uOccCount: groundUniforms.uOccCount,
        uOccBox: groundUniforms.uOccBox,
        uOccTan: groundUniforms.uOccTan,
        uOccDepth: groundUniforms.uOccDepth,
        uOccUp: groundUniforms.uOccUp,
      } : {}),
    },
    defines: opts.occlude ? { OCCLUDE: '' } : {},
    vertexShader,
```



In `src/render/propMaterial.ts`:


Replace:

```ts
        uOccDepth: groundUniforms.uOccDepth,
        uLitter: { value: getLitterTexture() },
```

with:

```ts
        uOccDepth: groundUniforms.uOccDepth,
        uOccUp: groundUniforms.uOccUp,
        uLitter: { value: getLitterTexture() },
```



In `src/surface/disturbance.ts`:


Replace:

```ts
}

/**
 * The world x, z box (min x, min z, max x, max z) outside which the map moves no leaf: every cell
 * holding anything, grown by one cell. A leaf moves only where the lookup at its anchor reads a
 * fresh trail (A) or the body (B), and a bilinear lookup reads only cells whose centres are within
 * a cell of it. Clipped to the shaders' window (`window`: metres from the map's centre along x and z,
 * the mode's fadeTo), outside which no leaf reads the map. Empty (Infinity, Infinity, -Infinity,
 * -Infinity) when the map is clear. Allocates nothing.
 */
export function disturbedBox(m: DisturbanceMap, out: number[] | Float32Array, window = DIST_SPAN / 2): void {
  const d = m.data;
  let i0 = DIST_N;
  let j0 = DIST_N;
  let i1 = -1;
  let j1 = -1;
  for (let j = 0; j < DIST_N; j++) {
    for (let i = 0; i < DIST_N; i++) {
      const k = (j * DIST_N + i) * K;
      if (d[k] === 0 && d[k + 2] === 0 && d[k + 3] === 0) continue;
      if (i < i0) i0 = i;
      if (i > i1) i1 = i;
      if (j < j0) j0 = j;
      if (j > j1) j1 = j;
    }
  }
  const cx = (m.ci + DIST_N / 2) * DIST_CELL;
  const cz = (m.cj + DIST_N / 2) * DIST_CELL;
  const x0 = Math.max((m.ci + i0 - 1) * DIST_CELL, cx - window);
  const z0 = Math.max((m.cj + j0 - 1) * DIST_CELL, cz - window);
  const x1 = Math.min((m.ci + i1 + 2) * DIST_CELL, cx + window);
  const z1 = Math.min((m.cj + j1 + 2) * DIST_CELL, cz + window);
  if (i1 < 0 || x0 > x1 || z0 > z1) {
    out[0] = Infinity;
    out[1] = Infinity;
    out[2] = -Infinity;
    out[3] = -Infinity;
    return;
  }
  out[0] = x0;
  out[1] = z0;
  out[2] = x1;
  out[3] = z1;
}
```

with:

```ts
}
```



Create `src/surface/floorPatch.ts`:

```ts
import * as THREE from 'three';
import { createFloorMaterial, FLOOR_SEGS } from '../render/floorMaterial';
import { FLOOR_ORDER } from '../render/drawOrder';

/**
 * The F layer under the worm (floorMaterial.ts): one static grid of FLOOR_SEGS x FLOOR_SEGS cells
 * that the vertex shader lays on the floor round the head. One draw call.
 */
export function buildFloorPatch(): THREE.Mesh {
  const n = FLOOR_SEGS + 1;
  const pos = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = (j * n + i) * 3;
      pos[k] = i - FLOOR_SEGS / 2;
      pos[k + 2] = j - FLOOR_SEGS / 2;
    }
  }
  const idx = new Uint16Array(FLOOR_SEGS * FLOOR_SEGS * 6);
  let p = 0;
  for (let j = 0; j < FLOOR_SEGS; j++) {
    for (let i = 0; i < FLOOR_SEGS; i++) {
      const a = j * n + i;
      const b = a + 1;
      const d = a + n;
      const e = d + 1;
      // Counter-clockwise seen from above (+y).
      idx[p++] = a; idx[p++] = d; idx[p++] = b;
      idx[p++] = b; idx[p++] = d; idx[p++] = e;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const mesh = new THREE.Mesh(g, createFloorMaterial());
  // Placed round the worm in the shader.
  mesh.frustumCulled = false;
  mesh.renderOrder = FLOOR_ORDER;
  mesh.name = 'floorPatch';
  return mesh;
}
```

In `src/surface/heroLeafMesh.ts`:


Replace:

```ts
import type { HeroLeaves } from './heroLeaves';

```

with:

```ts
import type { HeroLeaves } from './heroLeaves';
import { POCKET_ORDER } from '../render/drawOrder';

/** The hero leaves lie lowest in the litter: this much of their colour shows. */
const HERO_DIM = 0.55;

```


Replace:

```ts
    const tint = new THREE.Color();
    for (let i = 0; i < pool.max; i++) this.mesh.setColorAt(i, tint.setScalar(0.85 + 0.3 * rng()));
    // Placed every frame from the physics; the instance bounds are never recomputed.
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
```

with:

```ts
    const tint = new THREE.Color();
    // They lie on the floor in the worm's pocket (V2 spec 8.2): older, damper leaves, darker
    // and duller than this fall's on top.
    for (let i = 0; i < pool.max; i++) this.mesh.setColorAt(i, tint.setRGB(1, 0.9, 0.78).multiplyScalar(HERO_DIM * (0.85 + 0.3 * rng())));
    // Placed every frame from the physics; the instance bounds are never recomputed.
    this.mesh.frustumCulled = false;
    // In the worm's pocket, under the top of the litter (drawOrder.ts).
    this.mesh.renderOrder = POCKET_ORDER;
    this.mesh.count = 0;
```



In `src/surface/leafLitterMesh.ts`:


Replace:

```ts
import {
  ACTIVE_MARGIN, DRAPE_MARGIN, boxesMeet, chunkCentreX, chunkCentreZ, chunkDistance, countBelow,
  groupByChunk, hullBox, nextLod,
```

with:

```ts
import {
  ACTIVE_MARGIN, boxesMeet, chunkCentreX, chunkCentreZ, chunkDistance, countBelow,
  groupByChunk, hullBox, nextLod,
```


Replace:

```ts
  isNear: boolean;
  /** Drawn with the reacting material (disturbance map and occluder fade). */
  active: boolean;
```

with:

```ts
  isNear: boolean;
  /** Drawn with the reacting material (the occluder fade). */
  active: boolean;
```


Replace:

```ts
  /**
   * Once per rendered frame: per chunk, the reacting material where its leaves can be moved by the
   * map (`disturbed`, disturbedBox) or faded (the hull of the camera and the rendered `spine`),
   * the plain one elsewhere; full leaves near the camera (and on every reacting chunk), low-detail
   * ones far away. Swaps materials only (all compiled up front). Allocates nothing.
   */
  update(camX: number, camZ: number, spine: ArrayLike<number>, disturbed: ArrayLike<number>): void;
}
```

with:

```ts
  /**
   * Once per rendered frame: per chunk, the fading material where its leaves can fade over the
   * buried worm (the hull of the camera and the rendered `spine`), the plain one elsewhere; full
   * leaves near the camera (and on every fading chunk), low-detail ones far away. Swaps materials
   * only (all compiled up front). Allocates nothing.
   */
  update(camX: number, camZ: number, spine: ArrayLike<number>): void;
}
```


Replace:

```ts
  g.computeBoundingSphere();
  // Room for leaves the disturbance map lifts or slides (only reacting chunks move, but cheap).
  if (g.boundingSphere) g.boundingSphere.radius += DRAPE_MARGIN;
  const mesh = new THREE.Mesh(g, material);
```

with:

```ts
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, material);
```


Replace:

```ts
    },
    update(camX, camZ, spine, disturbed) {
      hullBox(camX, camZ, spine, hull);
      for (let c = 0; c < chunks.length; c++) {
        const ch = chunks[c];
        // Conservative: a chunk any of whose leaves could move or fade reacts, so nothing snaps.
        ch.active = boxesMeet(ch.box, hull, ACTIVE_MARGIN) || boxesMeet(ch.box, disturbed, ACTIVE_MARGIN);
        // Only the full-leaf program reacts, so a reacting chunk always shows full leaves.
```

with:

```ts
    },
    update(camX, camZ, spine) {
      hullBox(camX, camZ, spine, hull);
      for (let c = 0; c < chunks.length; c++) {
        const ch = chunks[c];
        // Conservative: a chunk any of whose leaves could fade reacts, so nothing snaps.
        ch.active = boxesMeet(ch.box, hull, ACTIVE_MARGIN);
        // Only the full-leaf program reacts, so a reacting chunk always shows full leaves.
```



In `src/surface/litterChunks.ts`:


Replace:

```ts
import { WORLD_HALF } from './terrain';
import { OCC_OUTER } from '../render/occlusion';

```

with:

```ts
import { WORLD_HALF } from './terrain';
import { OCC_REACH } from '../render/occlusion';

```


Replace:

```ts
/**
 * Slack (m) round a chunk's leaves for the disturbance map: a lifted leaf rises up to about 0.5
 * and slides up to PUSH_SLIDE (0.2) sideways (extreme probes moved a vertex 0.71). Pads the
 * bounding spheres and the active test.
 */
export const DRAPE_MARGIN = 0.75;
/**
 * A chunk reacts to the worm (the material with the disturbance map and the occluder fade) when
 * the x, z box of its leaves, grown by this, meets the disturbed part of the map or the fade's
 * hull (the camera and the body, see hullBox): the drape's slack plus the fade's reach round the
 * body's axis (OCC_OUTER). Elsewhere its leaves cannot move or fade, so the plain material draws
 * them identically, without the texture fetches or the discard.
 */
export const ACTIVE_MARGIN = DRAPE_MARGIN + OCC_OUTER;

```

with:

```ts
/**
 * A chunk reacts to the worm (the material with the occluder fade) when the x, z box of its
 * leaves, grown by this, meets the fade's hull (the camera and the body, see hullBox): the fade's
 * widest reach round the body's axis (OCC_REACH, the funnel's top). Elsewhere its leaves cannot
 * fade, so the plain material draws them identically, without the discard. The top leaves lie 2
 * to 5 cm above the buried worm (V2 spec 8.2), so the disturbance map never moves them.
 */
export const ACTIVE_MARGIN = OCC_REACH;

```


Replace:

```ts
 * The x, z box of the leaf fade's hull: the camera and every point of the rendered spine (x, y, z
 * per point). Every pixel the fade can drop lies within OCC_OUTER of the hull of the camera and
 * the body's axis (occlusion.ts), so within OCC_OUTER of this box seen from above. Allocates nothing.
 */
```

with:

```ts
 * The x, z box of the leaf fade's hull: the camera and every point of the rendered spine (x, y, z
 * per point). Every pixel the fade can drop lies within OCC_REACH of the hull of the camera and
 * the body's axis (occlusion.ts), so within OCC_REACH of this box seen from above. Allocates nothing.
 */
```



In `src/surface/terrainMesh.ts`:


Replace:

```ts
    buildTerrainGeometry(),
    createPaintedMaterial({ color: '#ffffff', brush: 1, vertexColors: true, trail: true }),
  );
```

with:

```ts
    buildTerrainGeometry(),
    createPaintedMaterial({ color: '#ffffff', brush: 1, vertexColors: true, occlude: true }),
  );
```



In `src/worm/wormMesh.ts`:


Replace:

```ts
import { WormShadow, type GroundFn } from './wormShadow';

```

with:

```ts
import { WormShadow, type GroundFn } from './wormShadow';
import { POCKET_ORDER } from '../render/drawOrder';

```


Replace:

```ts
    mesh.frustumCulled = false;
    mesh.name = 'worm';
```

with:

```ts
    mesh.frustumCulled = false;
    // Buried in the litter: drawn after its top, so only what the hole shows is shaded.
    mesh.renderOrder = POCKET_ORDER;
    mesh.name = 'worm';
```

- [ ] **Step 4: Run everything**

Run: `npx tsc --noEmit && npx vitest run && npm run verify:build && npm run test:e2e`
Expected: types clean; **67 files, 607 tests** (+1 file, `floorPatch`; +1 test net: the disturbed-box and litter jitter tests go, as the top leaves no longer move); `single-file build OK`; **32 passed, 1 skipped**. The occlusion parity test allows 0.06 where two segments tie (under 0.5% of pixels): the funnel's height then follows the other segment's line too.

- [ ] **Step 5: Look at it (rendering)**

```bash
npm run build
node .cache/shot2.mjs .cache/shots/t7-high.png "?preset=high" keys:ArrowUp:6000 keys:ArrowUp+ArrowLeft:3000 keys:ArrowUp:1500 wait:800
node .cache/shot2.mjs .cache/shots/t7-low.png "?preset=low" keys:ArrowUp:6000 keys:ArrowUp+ArrowLeft:3000 keys:ArrowUp:1500 wait:800
```
Expected: the worm, whole and plainly visible, in a soft-edged hole through the leaves, lying on a dark, wet-looking floor with pale threads and specks of moss; the top of the litter and its leaves around the hole unchanged from V1's look; rocks banked by litter with at least half showing; no errors. (No pocket leaves yet: Task 8.) Reviewers look at both, next to IMG_2427 and IMG_2428.

- [ ] **Step 6: Commit**

```bash
git add src/render/drawOrder.ts src/render/floorMaterial.ts src/surface/floorPatch.ts src/render/occlusion.ts \
  src/render/occluderSegments.ts src/render/groundUniforms.ts src/render/paintedMaterial.ts src/render/propMaterial.ts \
  src/render/leafMaterial.ts src/surface/terrainMesh.ts src/surface/litterChunks.ts src/surface/leafLitterMesh.ts \
  src/surface/disturbance.ts src/surface/heroLeafMesh.ts src/worm/wormMesh.ts src/game/world.ts \
  tests/unit/floorPatch.test.ts tests/unit/occlusion.test.ts tests/unit/litterChunks.test.ts tests/unit/sceneTiers.test.ts \
  tests/unit/disturbance.test.ts tests/unit/groundUniforms.test.ts tests/unit/leafGlsl.test.ts tests/unit/leafJitter.test.ts \
  tests/unit/detailLeaves.test.ts tests/unit/nearClutter.test.ts tests/e2e/glslParity.spec.ts
git commit -m "feat(v2): the top of the litter opens in a funnel over the buried worm; the F floor under it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---


### Task 8 (rendering): The leaves in the worm's pocket

**Files:**
- Modify: `src/render/detailGlsl.ts`, `src/surface/detailLeaves.ts`, `src/render/leafMaterial.ts`, `src/render/nearClutterGlsl.ts`, `src/game/world.ts`
- Modify tests: `tests/unit/detailGlsl.test.ts`, `tests/unit/detailLeaves.test.ts`, `tests/unit/leafGlsl.test.ts`, `tests/unit/leafJitter.test.ts`, `tests/unit/floorPatch.test.ts`, `tests/unit/groundUniforms.test.ts`, `tests/e2e/glslParity.spec.ts`

"Leaves above and below it" (answer 11.9): a second detail layer, `world.pocket`, built and shown with the detail layer (lazily, at `POCKET_SHARE` = half its count: `scaledLeafCount(spec.detail * POCKET_SHARE)`), seed 5, material variant `pocket` (`DETAIL`, `POCKET`, `DISTURB`, `OCCLUDE`), drawn at `POCKET_ORDER`. `DETAIL_GLSL` with `POCKET` defined lays each leaf on the floor (`terrainHeight`), resting at `REST_BASE + layer² × max(0, thinnest − POCKET_TOP_GAP − r × POCKET_CURL)`: from the worm's belly up to below the top of the thinnest litter it reaches, less its own curl, so none ever shows through the top (the test holds every vertex over 0.02 under it). It shrinks to nothing from `POCKET_NEAR` (1.6) to `POCKET_FAR` (2.0) from the spine (`spineDistance`, now shared from `nearClutterGlsl.ts` as `SPINE_DISTANCE_GLSL`): only the leaves round the body are drawn, as the rest would be shaded under the top for nothing; their nearest edge is then still 0.8 from the spine, outside what the hole shows. The disturbance map drapes and slides them exactly as it did V1's detail leaves (they rest on the floor, as V1's rested on the soil), so V1's clearance maths holds: every pocket leaf clears the body by 5 mm (Step 1). Lower leaves are older: their colours are greyed toward a dull tan, darkened up to 55% and made wet (`age = 1 − layer²`).

The TS twin `detailVertex` takes `pocket` and the spine (`DetailInputs.spine`); the GPU parity test runs both variants.

- [ ] **Step 1: Write the failing tests**

In `tests/e2e/glslParity.spec.ts`:


Replace:

```ts

interface Case { focus: [number, number]; dist: number[]; trail: number[]; origin: [number, number]; fade: number[] }

```

with:

```ts

interface Case { focus: [number, number]; dist: number[]; trail: number[]; origin: [number, number]; fade: number[]; spine: number[] }

```


Replace:

```ts
    focus: [hx + 0.13, hz - 0.27], dist: Array.from(near), trail: Array.from(trail), origin: [m.ci * DIST_CELL, m.cj * DIST_CELL],
    fade: [...fade],
  };
```

with:

```ts
    focus: [hx + 0.13, hz - 0.27], dist: Array.from(near), trail: Array.from(trail), origin: [m.ci * DIST_CELL, m.cj * DIST_CELL],
    fade: [...fade], spine: pts.flatMap(([x, z]) => [x, 0.03, z]),
  };
```


Replace:

```ts

test('detail placement, meshGround and disturb run on the GPU as their TS twins say', async ({ page }) => {
  const litter = litterTextureData();
  const ground = groundTextureData();
  const g = buildDetailLeaves(2500).mesh.geometry;
  const pos = g.getAttribute('position');
```

with:

```ts

for (const pocket of [false, true]) test(`detail placement (${pocket ? 'in the worm\'s pocket, on the floor' : 'on the top of the litter, meshGround'}) and disturb run on the GPU as their TS twins say`, async ({ page }) => {
  const litter = litterTextureData();
  const ground = groundTextureData();
  const g = buildDetailLeaves(2500, pocket ? 5 : 3, pocket).mesh.geometry;
  const pos = g.getAttribute('position');
```


Replace:

```ts
      gl.uniform2f(U('uWrapCentre'), Math.round(c.focus[0]), Math.round(c.focus[1]));
      const bufs = [0, 1, 2].map((i) => {
```

with:

```ts
      gl.uniform2f(U('uWrapCentre'), Math.round(c.focus[0]), Math.round(c.focus[1]));
      if (U('uSpine[0]')) gl.uniform3fv(U('uSpine[0]'), new Float32Array(c.spine));
      const bufs = [0, 1, 2].map((i) => {
```


Replace:

```ts
  }, {
    glsl: `${DETAIL_GLSL}\n${DISTURB_GLSL}`, litter: Array.from(litter), litterN: LITTER_TEX_N,
    ground: Array.from(ground), groundN: GROUND_TEX_N, inputs, cases, stride: STRIDE, distN: DIST_N,
```

with:

```ts
  }, {
    glsl: `${pocket ? '#define POCKET\n' : ''}${DETAIL_GLSL}\n${DISTURB_GLSL}`, litter: Array.from(litter), litterN: LITTER_TEX_N,
    ground: Array.from(ground), groundN: GROUND_TEX_N, inputs, cases, stride: STRIDE, distN: DIST_N,
```


Replace:

```ts
      focusX: c.focus[0], focusZ: c.focus[1], wrapX: Math.round(c.focus[0]), wrapZ: Math.round(c.focus[1]), litter, ground,
    };
```

with:

```ts
      focusX: c.focus[0], focusZ: c.focus[1], wrapX: Math.round(c.focus[0]), wrapZ: Math.round(c.focus[1]), litter, ground,
      spine: c.spine,
    };
```


Replace:

```ts
      const I = inputs.slice(k * STRIDE, k * STRIDE + STRIDE);
      const shade = detailVertex(inp, I.slice(0, 4), I.slice(4, 7), I[9], w, a);
      p[0] = w[0];
```

with:

```ts
      const I = inputs.slice(k * STRIDE, k * STRIDE + STRIDE);
      const shade = detailVertex(inp, I.slice(0, 4), I.slice(4, 7), I[9], w, a, pocket);
      p[0] = w[0];
```


Replace:

```ts
    expect(worst, `case ${ci}: worst |GPU - TS|`).toBeLessThan(TOLERANCE);
    // The sample is real: leaves near and far, and the drape moved some.
    expect(shown, `case ${ci}`).toBeGreaterThan(n / 2);
    expect(gone, `case ${ci}`).toBeGreaterThan(n / 10);
```

with:

```ts
    expect(worst, `case ${ci}: worst |GPU - TS|`).toBeLessThan(TOLERANCE);
    // The sample is real: leaves near and far (the pocket keeps only those round the body), and the
    // drape moved some.
    expect(shown, `case ${ci}`).toBeGreaterThan(pocket ? n / 20 : n / 2);
    expect(gone, `case ${ci}`).toBeGreaterThan(n / 10);
```



Replace the whole of `tests/unit/detailGlsl.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { detailVertex, DETAIL_BOX, DETAIL_FADE_OUT, DETAIL_GLSL, POCKET_FAR, type DetailInputs } from '../../src/render/detailGlsl';
import { spineDistance } from '../../src/render/nearClutterGlsl';
import { litterTextureData } from '../../src/render/litterTexture';
import { bakedGroundHeight, groundTextureData } from '../../src/render/groundTexture';
import { buildDetailLeaves } from '../../src/surface/detailLeaves';
import { floorHeight, litterTopHeight } from '../../src/surface/litterDepth';
import { BELLY_UNDER } from '../../src/worm/surfaceHeight';

describe('detail leaf placement (TS twin of detailPosition)', () => {
  const inp: DetailInputs = { focusX: 0, focusZ: 0, wrapX: 0, wrapZ: 0, litter: litterTextureData(), ground: groundTextureData() };
  const g = buildDetailLeaves(400).mesh.geometry;
  const pos = g.getAttribute('position');
  const det = g.getAttribute('aDetail');
  const leaf2 = g.getAttribute('aLeaf2');
  const out = [0, 0, 0];
  const anchor = [0, 0, 0, 0];
  const d4 = [0, 0, 0, 0];
  const p3 = [0, 0, 0];
  const place = (v: number) => {
    d4[0] = det.getX(v);
    d4[1] = det.getY(v);
    d4[2] = det.getZ(v);
    d4[3] = det.getW(v);
    p3[0] = pos.getX(v);
    p3[1] = pos.getY(v);
    p3[2] = pos.getZ(v);
    return detailVertex(inp, d4, p3, leaf2.getY(v), out, anchor);
  };
  const setFocus = (x: number, z: number) => {
    inp.focusX = x;
    inp.focusZ = z;
    inp.wrapX = Math.round(x);
    inp.wrapZ = Math.round(z);
  };

  it('lays every vertex on the rendered ground, at or above its leaf rest plane, within its radius', () => {
    for (const [fx, fz] of [[0.3, -0.2], [7.6, 3.1], [-12.4, 9.8], [15.2, -16.7]]) {
      setFocus(fx, fz);
      for (let v = 0; v < pos.count; v++) {
        const shade = place(v);
        expect(shade).toBeGreaterThan(0.4);
        expect(shade).toBeLessThanOrEqual(1);
        expect(Math.abs(anchor[0] - inp.wrapX)).toBeLessThanOrEqual(DETAIL_BOX / 2);
        expect(Math.abs(anchor[1] - inp.wrapZ)).toBeLessThanOrEqual(DETAIL_BOX / 2);
        // Shrunk to nothing: one point, nothing drawn (see below).
        if (anchor[2] === 0) continue;
        // So a detail leaf's dip is always 0.
        expect(out[1] - bakedGroundHeight(inp.ground, out[0], out[2]) - anchor[3]).toBeGreaterThanOrEqual(-1e-9);
        expect(anchor[3]).toBeGreaterThan(0.007);
        expect(anchor[3]).toBeLessThan(0.15);
        expect(Math.hypot(out[0] - anchor[0], out[2] - anchor[1])).toBeLessThanOrEqual(anchor[2] * (1 + 1e-6));
      }
    }
  });

  it('never pops: a leaf jumps to another tile copy only while it is shrunk to nothing', () => {
    const last = new Float64Array(pos.count * 3).fill(NaN);
    let jumps = 0;
    // The head crawls a long curve; the wrap centre snaps along behind it.
    for (let t = 0; t < 40; t += 0.02) {
      setFocus(8 * Math.sin(t * 0.21) + t * 0.3, 6 * Math.cos(t * 0.17) - t * 0.2);
      for (let v = 0; v < pos.count; v += 7) {
        place(v);
        const k = v * 3;
        if (!Number.isNaN(last[k]) && Math.hypot(anchor[0] - last[k], anchor[1] - last[k + 1]) > 1) {
          jumps++;
          // Gone at the snap itself; within one 2 cm step of it, under a millimetre across.
          expect(anchor[2]).toBeLessThan(1e-3);
          expect(last[k + 2]).toBeLessThan(1e-3);
        }
        last[k] = anchor[0];
        last[k + 1] = anchor[1];
        last[k + 2] = anchor[2];
      }
    }
    expect(jumps).toBeGreaterThan(100);
  });

  it('at the snap itself, every leaf that jumps is exactly gone on both sides', () => {
    let jumps = 0;
    const before = new Float64Array(pos.count * 3);
    for (let k = -18; k <= 18; k += 1) {
      for (const axis of [0, 1]) {
        const other = 0.37 * k - 2.1;
        const at = (eps: number, store: boolean) => {
          const s = k + 0.5 + eps;
          setFocus(axis ? other : s, axis ? s : other);
          for (let v = 0; v < pos.count; v += 3) {
            place(v);
            const i = v * 3;
            if (store) {
              before[i] = anchor[0];
              before[i + 1] = anchor[1];
              before[i + 2] = anchor[2];
            } else if (Math.hypot(anchor[0] - before[i], anchor[1] - before[i + 1]) > 1) {
              jumps++;
              expect(before[i + 2]).toBeLessThan(1e-9);
              expect(anchor[2]).toBeLessThan(1e-9);
            }
          }
        };
        at(-1e-9, true);
        at(1e-9, false);
      }
    }
    expect(jumps).toBeGreaterThan(1000);
  });

  it('a leaf shrunk to nothing returns at once: one point, no texture reads, no drape', () => {
    setFocus(0.2, 0.1);
    let gone = 0;
    for (let v = 0; v < pos.count; v++) {
      const shade = place(v);
      if (anchor[2] > 0) continue;
      gone++;
      expect(shade).toBe(1);
      expect(anchor[3]).toBe(0);
      expect(out).toEqual([anchor[0], 0, anchor[1]]);
    }
    // About a third of the tile lies outside the 6 m circle.
    expect(gone / pos.count).toBeGreaterThan(0.2);
    expect(gone / pos.count).toBeLessThan(0.5);
    expect(DETAIL_GLSL).toContain('if (r <= 0.0)');
  });

  it('shrinks leaves to nothing by 6 m from the head', () => {
    setFocus(1.2, -3.4);
    let seen = 0;
    for (let v = 0; v < pos.count; v++) {
      place(v);
      const d = Math.hypot(anchor[0] - inp.focusX, anchor[1] - inp.focusZ);
      if (d >= DETAIL_FADE_OUT) {
        seen++;
        expect(anchor[2]).toBe(0);
      } else if (d < 5) expect(anchor[2]).toBe(det.getW(v));
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('has a GLSL twin that reads the same textures and gives the same anchor', () => {
    expect(DETAIL_GLSL).toContain('wrapAround(aDetail.xy, uWrapCentre, 13.0000000)');
    expect(DETAIL_GLSL).toContain('float ground = meshGround(xz);');
    expect(DETAIL_GLSL).toContain('float ground = terrainHeight(xz);');
    expect(DETAIL_GLSL).toContain('return vec4(xz.x, ground + rest + p.y, xz.y, 1.0);');
    expect(DETAIL_GLSL).toContain('anchor = vec4(home, r, rest)');
  });
});

describe('the pocket\'s leaves (round the buried worm, V2 spec 8.2)', () => {
  const inp: DetailInputs = { focusX: 0, focusZ: 0, wrapX: 0, wrapZ: 0, litter: litterTextureData(), ground: groundTextureData() };
  const g = buildDetailLeaves(300, 5, true).mesh.geometry;
  const pos = g.getAttribute('position');
  const det = g.getAttribute('aDetail');
  const leaf2 = g.getAttribute('aLeaf2');
  const out = [0, 0, 0];
  const anchor = [0, 0, 0, 0];
  const d4 = [0, 0, 0, 0];
  const p3 = [0, 0, 0];

  /** A straight spine from the head at (x, z) heading +z. */
  const straight = (x: number, z: number) => Float32Array.from({ length: 48 }, (_, k) => (k % 3 === 0 ? x : k % 3 === 1 ? 0 : z - Math.floor(k / 3) * 0.22));

  it('are only round the body: shrunk to nothing past POCKET_FAR from the spine', () => {
    inp.focusX = 0.3; inp.focusZ = -0.2; inp.wrapX = 0; inp.wrapZ = 0;
    inp.spine = straight(0.3, -0.2);
    let kept = 0;
    for (let v = 0; v < pos.count; v++) {
      d4[0] = det.getX(v); d4[1] = det.getY(v); d4[2] = det.getZ(v); d4[3] = det.getW(v);
      p3[0] = pos.getX(v); p3[1] = pos.getY(v); p3[2] = pos.getZ(v);
      detailVertex(inp, d4, p3, leaf2.getY(v), out, anchor, true);
      const d = spineDistance(inp.spine, anchor[0], anchor[1]);
      if (d >= POCKET_FAR) expect(anchor[2]).toBe(0);
      else if (anchor[2] > 0) kept++;
    }
    expect(kept).toBeGreaterThan(20);
    expect(DETAIL_GLSL).toContain('spineDistance(home)');
  });

  it('lie in the litter over the floor, from the worm\'s belly up, and never show through its top', () => {
    let low = 0;
    let high = 0;
    for (const [fx, fz] of [[0.3, -0.2], [2.2, 6.5], [-12.4, 9.8], [15.2, -16.7]]) {
      inp.focusX = fx;
      inp.focusZ = fz;
      inp.wrapX = Math.round(fx);
      inp.wrapZ = Math.round(fz);
      inp.spine = straight(fx, fz);
      for (let v = 0; v < pos.count; v++) {
        d4[0] = det.getX(v); d4[1] = det.getY(v); d4[2] = det.getZ(v); d4[3] = det.getW(v);
        p3[0] = pos.getX(v); p3[1] = pos.getY(v); p3[2] = pos.getZ(v);
        detailVertex(inp, d4, p3, leaf2.getY(v), out, anchor, true);
        if (anchor[2] === 0) continue;
        // On the floor (where the worm's belly rests), at or above the leaf's rest plane.
        expect(out[1] - floorHeight(out[0], out[2]) - anchor[3]).toBeGreaterThanOrEqual(-1e-9);
        expect(anchor[3]).toBeGreaterThan(0.007);
        // Below the top of the litter as drawn (whose grid can sit up to 0.17 under the depth
        // the leaves read): never showing through it.
        expect(litterTopHeight(out[0], out[2]) - out[1]).toBeGreaterThan(0.02);
        if (anchor[3] < BELLY_UNDER + 0.1) low++;
        if (anchor[3] > 0.2) high++;
      }
    }
    // Most lie low, round the worm; some higher, over it.
    expect(low).toBeGreaterThan(high);
    expect(high).toBeGreaterThan(10);
  });
});
```

In `tests/unit/detailLeaves.test.ts`:


Replace:

```ts
import { scaledLeafCount } from '../../src/surface/leafScale';

```

with:

```ts
import { scaledLeafCount } from '../../src/surface/leafScale';
import { GROUND_ORDER, POCKET_ORDER } from '../../src/render/drawOrder';

```


Replace:

```ts
    expect(d.group.children).toHaveLength(1);
  });
});
```

with:

```ts
    expect(d.group.children).toHaveLength(1);
  });
});

describe('the pocket\'s leaves (round the buried worm, V2 spec 8.2)', () => {
  const p = buildDetailLeaves(200, 5, true);
  const top = buildDetailLeaves(200, 5);

  it('react to the worm and fade over it, and draw after the top of the litter', () => {
    expect(p.mesh.material).toHaveProperty('defines.POCKET');
    expect(p.mesh.material).toHaveProperty('defines.DISTURB');
    expect(p.mesh.material).toHaveProperty('defines.OCCLUDE');
    expect(p.mesh.renderOrder).toBe(POCKET_ORDER);
    expect(POCKET_ORDER).toBeGreaterThan(GROUND_ORDER);
    expect(top.mesh.renderOrder).toBeLessThan(GROUND_ORDER);
  });

  it('are older the lower they lie: darker than the same leaves on top', () => {
    const lum = (m: typeof p) => {
      const c = m.mesh.geometry.getAttribute('aColor');
      const layer = m.mesh.geometry.getAttribute('aLeaf2');
      let low = 0;
      let n = 0;
      for (let v = 0; v < c.count; v++) {
        if (layer.getY(v) > 0.3) continue;
        low += c.getX(v) + c.getY(v) + c.getZ(v);
        n++;
      }
      return low / n;
    };
    expect(lum(p)).toBeLessThan(lum(top) * 0.6);
  });
});
```



In `tests/unit/floorPatch.test.ts`:


Replace:

```ts

  it('is in the world, with the worm and the hero leaves drawn after the top of the litter', () => {
    const crawl = new Crawl();
```

with:

```ts

  it('is in the world, with the worm, the hero leaves and the pocket\'s leaves drawn after the top of the litter', () => {
    const crawl = new Crawl();
```


Replace:

```ts
    expect(named('heroLeaves').renderOrder).toBe(POCKET_ORDER);
    // The top leaves lie on the top of the litter: drawn before it, as in V1.
```

with:

```ts
    expect(named('heroLeaves').renderOrder).toBe(POCKET_ORDER);
    expect(world.pocket.built!.mesh.renderOrder).toBe(POCKET_ORDER);
    // The top leaves lie on the top of the litter: drawn before it, as in V1.
```



In `tests/unit/groundUniforms.test.ts`:


Replace:

```ts
describe('createLeafMaterial', () => {
  it('the top leaves (litter and detail) lie above the buried worm: they fade over it, but never move', () => {
```

with:

```ts
describe('createLeafMaterial', () => {
  it('the leaves in the worm\'s pocket read the shared disturbance map (both textures)', () => {
    const m = createLeafMaterial('pocket');
    expect(m.defines).toHaveProperty('DISTURB');
    expect(m.defines).toHaveProperty('POCKET');
    expect(m.uniforms.uDisturbTrail).toBe(groundUniforms.uDisturbTrail);
    expect(m.uniforms.uLightDir).toBe(sharedLighting.uLightDir);
    expect(m.vertexShader).toContain('disturb(wp.xyz, anchor');
  });
  it('the top leaves (litter and detail) lie above the buried worm: they fade over it, but never move', () => {
```


Replace:

```ts
  it('is on for every leaf layer over or round the worm, the ground (the top of the litter) and Ultra\'s near clutter, off for the falling leaves', () => {
    const faded = [
      ...(['litter', 'detail', 'hero'] as const).map((v) => createLeafMaterial(v)), createPropMaterial(true),
      createPaintedMaterial({ color: '#ffffff', occlude: true }),
    ];
```

with:

```ts
  it('is on for every leaf layer over or round the worm, the ground (the top of the litter) and Ultra\'s near clutter, off for the falling leaves', () => {
    const faded = [
      ...(['litter', 'detail', 'pocket', 'hero'] as const).map((v) => createLeafMaterial(v)), createPropMaterial(true),
      createPaintedMaterial({ color: '#ffffff', occlude: true }),
    ];
```


Replace:

```ts
  it('takes every derivative before the fade\'s discard (after a discard they are undefined on some drivers)', () => {
    const faded = [
      ...(['litter', 'detail', 'hero'] as const).map((v) => createLeafMaterial(v)), createPropMaterial(true),
      createPaintedMaterial({ color: '#ffffff', occlude: true }),
    ];
```

with:

```ts
  it('takes every derivative before the fade\'s discard (after a discard they are undefined on some drivers)', () => {
    const faded = [
      ...(['litter', 'detail', 'pocket', 'hero'] as const).map((v) => createLeafMaterial(v)), createPropMaterial(true),
      createPaintedMaterial({ color: '#ffffff', occlude: true }),
    ];
```



In `tests/unit/leafGlsl.test.ts`:


Replace:

```ts
import { mulberry32 } from '../../src/core/random';
import { buildDetailLeaves } from '../../src/surface/detailLeaves';
import { detailVertex, DETAIL_BOX, type DetailInputs } from '../../src/render/detailGlsl';
```

with:

```ts
import { mulberry32 } from '../../src/core/random';
import { buildDetailLeaves, POCKET_SHARE } from '../../src/surface/detailLeaves';
import { detailVertex, DETAIL_BOX, type DetailInputs } from '../../src/render/detailGlsl';
```


Replace:

```ts
/** One worm placement: its spine (x, z), the map as the GPU sees it, and where the map's corner is. */
interface Placement { pts: number[][]; sample: MapSampler; ox: number; oz: number }

```

with:

```ts
/** One worm placement: its spine (x, z), the map as the GPU sees it, and where the map's corner is. */
interface Placement { pts: number[][]; sample: MapSampler; ox: number; oz: number; spine: Float32Array }

```


Replace:

```ts
  const trail = new Uint8Array(DIST_N * DIST_N * 2);
  const pl: Placement = { pts, sample: packedMapSampler(near, trail), ox: 0, oz: 0 };
  const buckets = new Map<string, number[]>();
```

with:

```ts
  const trail = new Uint8Array(DIST_N * DIST_N * 2);
  const pl: Placement = { pts, sample: packedMapSampler(near, trail), ox: 0, oz: 0, spine };
  const buckets = new Map<string, number[]>();
```


Replace:

```ts

  it('so does every detail leaf, placed around the head as the GPU places it (400 placements)', () => {
    const count = scaledLeafCount(PRESETS.ultra.detail);
    const detail = buildDetailLeaves(count);
    // A detail leaf's radius is at most 0.385 m at base size, times the biggest real-size growth.
```

with:

```ts

  it('every leaf in the worm\'s pocket clears its body by 5 mm, placed round the head and draped as the GPU does (400 placements)', () => {
    const count = scaledLeafCount(PRESETS.ultra.detail * POCKET_SHARE);
    const detail = buildDetailLeaves(count, 5, true);
    // A detail leaf's radius is at most 0.385 m at base size, times the biggest real-size growth.
```


Replace:

```ts
    let near = 0;
    const r = clearance(400, ({ pts, sample, ox, oz }, emit) => {
      // The head is the focus; the layer wraps around it snapped to the 1 m grid.
      inp.focusX = pts[0][0];
```

with:

```ts
    let near = 0;
    const r = clearance(400, ({ pts, sample, ox, oz, spine }, emit) => {
      // The head is the focus; the layer wraps around it snapped to the 1 m grid.
      inp.spine = spine;
      inp.focusX = pts[0][0];
```


Replace:

```ts
          lp[2] = pos.getZ(v);
          detailVertex(inp, dv, lp, leaf2.getY(v), placed[v - v0], a4);
          // dip is 0: the curl only lifts a detail leaf off its rest plane. A leaf shrunk to
```

with:

```ts
          lp[2] = pos.getZ(v);
          detailVertex(inp, dv, lp, leaf2.getY(v), placed[v - v0], a4, true);
          // dip is 0: the curl only lifts a detail leaf off its rest plane. A leaf shrunk to
```


Replace:

```ts
    expect(r.placements).toBe(400);
    expect(near).toBeGreaterThan(400 * 12);
    expect(r.covered).toBeGreaterThan(10000);
```

with:

```ts
    expect(r.placements).toBe(400);
    expect(near).toBeGreaterThan(400 * 6);
    expect(r.covered).toBeGreaterThan(10000);
```



Replace the whole of `tests/unit/leafJitter.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createDisturbance, recentre, stampBody, packDisturbance, DIST_N, DIST_CELL, DIST_REACH, type DisturbanceMap,
} from '../../src/surface/disturbance';
import { overBody } from '../../src/surface/heroClearance';
import { PUSHER_STRIDE } from '../../src/surface/heroBody';
import type { Vec3 } from '../../src/core/vec';
import { disturbVertex, packedMapSampler } from '../../src/render/leafGlsl';
import { buildDetailLeaves, POCKET_SHARE } from '../../src/surface/detailLeaves';
import { detailVertex, type DetailInputs } from '../../src/render/detailGlsl';
import { litterTextureData } from '../../src/render/litterTexture';
import { groundTextureData } from '../../src/render/groundTexture';
import { heroLeafMatrix } from '../../src/surface/heroLeafMesh';
import { HERO_MAX } from '../../src/surface/heroLeaves';
import { PRESETS } from '../../src/render/graphics';
import { Crawl, WORM_SEGMENTS } from '../../src/game/crawl';
import { advance, createStepper } from '../../src/core/stepper';
import { AUTO_DRIVE_MOVE } from '../../src/game/drive';
import type { WormPose } from '../../src/worm/wormMesh';
import { mulberry32 } from '../../src/core/random';
import { scaledLeafCount } from '../../src/surface/leafScale';

/**
 * Leaves must move smoothly as the worm crawls under them (Matt's Step 1a playtest: "a little
 * jittery"). Measured: the body was stamped as a row of points 11 cm apart, so as they slid past
 * a leaf its reading of the body (and the hero leaves' tilt, aimed at the nearest body point)
 * scalloped at about 15 Hz; and 8-bit packing rounded the map in 6 mm steps.
 */

/** Bilinear lookup of a float map's channel at world (x, z), as the GPU filters it. */
function read(m: DisturbanceMap, data: ArrayLike<number>, x: number, z: number, ch: number): number {
  const tx = (x - m.ci * DIST_CELL) / DIST_CELL - 0.5;
  const tz = (z - m.cj * DIST_CELL) / DIST_CELL - 0.5;
  const i = Math.floor(tx);
  const j = Math.floor(tz);
  const fx = tx - i;
  const fz = tz - j;
  const at = (a: number, b: number) => data[(b * DIST_N + a) * 4 + ch];
  const top = at(i, j) * (1 - fx) + at(i + 1, j) * fx;
  const bottom = at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx;
  return top * (1 - fz) + bottom * fz;
}

/** A straight worm along +z with its head at z = s: 16 segments 0.22 apart. */
function straightBody(s: number): Vec3[] {
  return Array.from({ length: 16 }, (_, i) => ({ x: 0, y: 0, z: s - i * 0.22 }));
}

describe('the disturbance map reads the body as a smooth tube', () => {
  it('beside a straight worm gliding along its own line, body and path nearness stay level', () => {
    const under = new Float32Array(16).fill(1);
    const besides = [0.13, 0.2, 0.3, 0.45, 0.7];
    const lo = besides.map(() => [Infinity, Infinity]);
    const hi = besides.map(() => [-Infinity, -Infinity]);
    for (let s = 0; s <= 0.22; s += 0.01) {
      const m = createDisturbance();
      recentre(m, 0, -1.5);
      stampBody(m, straightBody(s), under);
      besides.forEach((x, k) => {
        // Mid-body, well away from the head and tail.
        for (const ch of [0, 2]) {
          const v = read(m, m.data, x, -1.5, ch);
          const c = ch === 0 ? 0 : 1;
          lo[k][c] = Math.min(lo[k][c], v);
          hi[k][c] = Math.max(hi[k][c], v);
        }
      });
    }
    // 0.001 / DIST_REACH of nearness is 1 mm of distance.
    besides.forEach((_, k) => {
      expect(hi[k][0] - lo[k][0]).toBeLessThan(0.001 / DIST_REACH);
      expect(hi[k][1] - lo[k][1]).toBeLessThan(0.001 / DIST_REACH);
    });
  });

  it('packs path and body in two bytes each, to within a tenth of a mm of distance; the trail in one', () => {
    const m = createDisturbance();
    for (let k = 0; k < m.data.length; k++) m.data[k] = ((k * 7919) % 10007) / 10007;
    const near = new Uint8Array(DIST_N * DIST_N * 4);
    const trail = new Uint8Array(DIST_N * DIST_N * 2);
    packDisturbance(m, near, trail);
    const sample = packedMapSampler(near, trail);
    const out = [0, 0, 0, 0];
    let worst = 0;
    let worstTrail = 0;
    for (let c = 0; c < DIST_N * DIST_N; c++) {
      // At the texel's centre the lookup reads just that texel, as the shader decodes it.
      sample(((c % DIST_N) + 0.5) / DIST_N, (Math.floor(c / DIST_N) + 0.5) / DIST_N, out);
      worst = Math.max(worst, Math.abs(out[0] - m.data[c * 4]), Math.abs(out[2] - m.data[c * 4 + 2]));
      worstTrail = Math.max(worstTrail, Math.abs(out[3] - m.data[c * 4 + 3]));
    }
    expect(worst * DIST_REACH).toBeLessThan(0.0001);
    expect(worstTrail).toBeLessThanOrEqual(0.5 / 255 + 1e-9);
  });
});

describe('a hero leaf over the body keeps its tilt steady', () => {
  it('beside a straight worm gliding along its own line, it tips the same way', () => {
    // 31 pushers (segments and midpoints, 0.11 apart), as the crawl packs them, under the litter.
    const n = 31;
    const pushers = new Float32Array(n * PUSHER_STRIDE);
    const dirs: number[] = [];
    for (let s = 0; s <= 0.11; s += 0.005) {
      for (let k = 0; k < n; k++) {
        pushers.set([0, s - k * 0.11, 0.1, k === 0 ? 1 : 0.5, 0.22, 1, 0.01, 0.05], k * PUSHER_STRIDE);
      }
      // Beside the spine, mid-body, resting above the belly: it goes over the body.
      const dir = overBody(0.12, -1.5, 0.4, 0, 0.3, 0, 0, 0.05, pushers, n, 0, true);
      expect(dir).not.toBeNaN();
      dirs.push(dir);
    }
    // Straight out from the spine (+x) every time.
    for (const d of dirs) expect(Math.abs(d - Math.PI / 2)).toBeLessThan(0.01);
  });
});

/** Share of `xs` above `t`. */
const over = (xs: number[], t: number) => xs.filter((x) => x > t).length / xs.length;
const quantile = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.floor(q * (xs.length - 1))];
/** How far a track turns back at its middle sample (0 when it keeps going): per axis, the smaller step. */
function reversal(a: ArrayLike<number>, b: ArrayLike<number>, c: ArrayLike<number>, axes: number): number {
  let o = 0;
  for (let ax = 0; ax < axes; ax++) {
    const d1 = b[ax] - a[ax];
    const d2 = c[ax] - b[ax];
    if (d1 * d2 < 0) o = Math.max(o, Math.min(Math.abs(d1), Math.abs(d2)));
  }
  return o;
}

/**
 * The crawl as the game runs it (the auto-drive's loop): a 60 Hz display with uneven frames
 * (one in seven late), 60 Hz steps and the 30 fps cap. `frame` sees every rendered frame after
 * the first 3 s, with `heroes` hero leaves shown.
 */
function crawlFrames(seconds: number, frame: (crawl: Crawl, alpha: number) => void, heroes = HERO_MAX): Crawl {
  const crawl = new Crawl();
  crawl.setHeroCount(heroes);
  const st = createStepper();
  const rng = mulberry32(7);
  let wall = 0;
  while (wall < seconds * 1000) {
    const dt = (1000 / 60) * (rng() < 0.15 ? 2 : 1) + (rng() - 0.5) * 3;
    wall += dt;
    const r = advance(st, dt, 1000 / 60, 1000 / 30);
    for (let i = 0; i < r.steps; i++) crawl.step(1 / 60, AUTO_DRIVE_MOVE.move);
    if (r.render && wall > 3000) frame(crawl, r.alpha);
  }
  return crawl;
}

// Part 0 measured Step 1a's small leaves; V1 re-measured at real leaf sizes against the same thresholds.
describe('leaves over the crawling worm move smoothly (measured frame to frame)', () => {

  it('the pocket\'s leaves (round the buried worm): on screen, few turn back by more than half a pixel', () => {
    // Every vertex of the pocket's leaves, laid round the head as the GPU lays them each frame
    // (detailVertex), then moved by the map (disturbVertex): what the map does to each, on screen.
    const g = buildDetailLeaves(scaledLeafCount(PRESETS.ultra.detail * POCKET_SHARE), 5, true).mesh.geometry;
    const pos = g.getAttribute('position');
    const det = g.getAttribute('aDetail');
    const leaf2 = g.getAttribute('aLeaf2');
    const n = pos.count;
    const inp: DetailInputs = { focusX: 0, focusZ: 0, wrapX: 0, wrapZ: 0, litter: litterTextureData(), ground: groundTextureData() };
    const camera = new THREE.PerspectiveCamera(60, 1366 / 768, 0.2, 120);
    const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
    const near = new Uint8Array(DIST_N * DIST_N * 4);
    const trail = new Uint8Array(DIST_N * DIST_N * 2);
    const sample = packedMapSampler(near, trail);
    // Per frame, each vertex's on-screen offset from where it rests (pixels at 1366 x 768): only
    // what the map does to it, not the camera's own motion. NaN: off screen (or shrunk away).
    const frames: Float32Array[] = [];
    const p = [0, 0, 0];
    const a4 = [0, 0, 0, 0];
    const d4 = [0, 0, 0, 0];
    const l3 = [0, 0, 0];
    const moved = [0, 0, 0];
    const v3 = new THREE.Vector3();
    crawlFrames(9, (crawl, alpha) => {
      crawl.interpolate(alpha, 0, pose, camera);
      camera.updateMatrixWorld();
      inp.spine = pose.spine;
      inp.focusX = crawl.focus.x;
      inp.focusZ = crawl.focus.z;
      inp.wrapX = Math.round(crawl.focus.x);
      inp.wrapZ = Math.round(crawl.focus.z);
      // As uploadDisturbance packs it, and as the GPU reads it back.
      const m = crawl.disturbance;
      packDisturbance(m, near, trail);
      const off = new Float32Array(n * 2).fill(NaN);
      for (let v = 0; v < n; v++) {
        d4[0] = det.getX(v); d4[1] = det.getY(v); d4[2] = det.getZ(v); d4[3] = det.getW(v);
        l3[0] = pos.getX(v); l3[1] = pos.getY(v); l3[2] = pos.getZ(v);
        detailVertex(inp, d4, l3, leaf2.getY(v), p, a4, true);
        // Only full-size leaves: one growing or shrinking at the edge of the pocket (POCKET_NEAR
        // to POCKET_FAR from the spine) lies under the top of the litter, where nothing shows it.
        if (a4[2] < d4[3] - 1e-9) continue;
        if (camera.position.distanceTo(v3.set(p[0], p[1], p[2])) < 0.6) continue;
        v3.project(camera);
        if (Math.abs(v3.x) > 1 || Math.abs(v3.y) > 1 || v3.z > 1) continue;
        disturbVertex(sample, m.ci * DIST_CELL, m.cj * DIST_CELL, true, p, a4, 0, moved);
        if (moved[0] === p[0] && moved[1] === p[1] && moved[2] === p[2]) {
          off[v * 2] = off[v * 2 + 1] = 0;
          continue;
        }
        const rx = v3.x;
        const ry = v3.y;
        v3.set(moved[0], moved[1], moved[2]).project(camera);
        off[v * 2] = (v3.x - rx) * 683;
        off[v * 2 + 1] = (ry - v3.y) * 384;
      }
      frames.push(off);
    });
    const back: number[] = [];
    const a = [0, 0];
    const b = [0, 0];
    const c = [0, 0];
    for (let k = 1; k + 1 < frames.length; k++) {
      for (let v = 0; v < n; v++) {
        a[0] = frames[k - 1][v * 2]; a[1] = frames[k - 1][v * 2 + 1];
        b[0] = frames[k][v * 2]; b[1] = frames[k][v * 2 + 1];
        c[0] = frames[k + 1][v * 2]; c[1] = frames[k + 1][v * 2 + 1];
        // Seen in all three frames, and moved by the map in at least one.
        if (a[0] !== a[0] || b[0] !== b[0] || c[0] !== c[0]) continue;
        if (!(a[0] || a[1] || b[0] || b[1] || c[0] || c[1])) continue;
        back.push(reversal(a, b, c, 2));
      }
    }
    expect(back.length).toBeGreaterThan(5000);
    // Only the leaves round the body, which the drape moves most (V2 measured 1.6% over half a
    // pixel, p99 1.03 px, p99.9 3.3 px; V1's detail leaves on top, the same leaves round the body,
    // 1.3%, 0.75 px and 3.3 px). V1's big litter leaves were held to 1.2% and 0.5 px.
    expect(over(back, 0.5)).toBeLessThan(0.02);
    expect(quantile(back, 0.99)).toBeLessThan(1.2);
    expect(quantile(back, 0.999)).toBeLessThan(4);
  }, 120000);

  it('hero leaves: few turn back by more than 2 mm between frames', () => {
    const m4 = new THREE.Matrix4();
    const v = new THREE.Vector3();
    // The leaves Ultra shows (the most of any preset): real-size leaves are few (scaledLeafCount:
    // 8), so it crawls 45 s for a like sample. V1 measured 2.1 to 2.2% and a p99 of 4.2 to 4.5 mm
    // over seven frame-timing seeds.
    const heroes = scaledLeafCount(PRESETS.ultra.hero);
    const seconds = 45;
    // Three points on each leaf (its centre and two near its tip), per frame.
    const tracks: number[][][] = Array.from({ length: heroes * 3 }, () => []);
    crawlFrames(seconds, (crawl, alpha) => {
      for (let i = 0; i < crawl.hero.count; i++) {
        heroLeafMatrix(crawl.hero, i, alpha, m4);
        tracks[i * 3].push(v.set(0, 0, 0).applyMatrix4(m4).toArray());
        tracks[i * 3 + 1].push(v.set(0.4, 0, -0.5).applyMatrix4(m4).toArray());
        tracks[i * 3 + 2].push(v.set(-0.4, 0, -0.5).applyMatrix4(m4).toArray());
      }
    }, heroes);
    const back: number[] = [];
    for (const tr of tracks) {
      for (let k = 1; k + 1 < tr.length; k++) {
        // A recycled leaf jumps ahead of the worm: not motion.
        if (Math.hypot(tr[k + 1][0] - tr[k][0], tr[k + 1][2] - tr[k][2]) > 0.3) continue;
        back.push(reversal(tr[k - 1], tr[k], tr[k + 1], 3));
      }
    }
    expect(back.length).toBeGreaterThan(20000);
    // Before the fix (tilted away from the nearest of points 11 cm apart): 6.8% and 28 mm.
    expect(over(back, 0.002)).toBeLessThan(0.03);
    expect(quantile(back, 0.99)).toBeLessThan(0.006);
  }, 120000);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/unit/detailGlsl.test.ts tests/unit/detailLeaves.test.ts`
Expected: FAIL: `POCKET_FAR` is not exported, and `buildDetailLeaves(200, 5, true)` builds no `POCKET` material.

- [ ] **Step 3: Implement**

In `src/game/world.ts`:


Replace:

```ts
import { buildLeafLitter, type LeafLitter } from '../surface/leafLitterMesh';
import { buildDetailLayer, type DetailLayer } from '../surface/detailLeaves';
import { HeroLeafMesh } from '../surface/heroLeafMesh';
```

with:

```ts
import { buildLeafLitter, type LeafLitter } from '../surface/leafLitterMesh';
import { buildDetailLayer, POCKET_SHARE, type DetailLayer } from '../surface/detailLeaves';
import { HeroLeafMesh } from '../surface/heroLeafMesh';
```


Replace:

```ts
  readonly detail: DetailLayer;
  /** The loose physics leaves near the head (one instanced draw; the crawl's pool sets the count). */
```

with:

```ts
  readonly detail: DetailLayer;
  /** The leaves in the litter round the buried worm, seen through the hole over it (built with the detail layer). */
  readonly pocket: DetailLayer;
  /** The loose physics leaves near the head (one instanced draw; the crawl's pool sets the count). */
```


Replace:

```ts
  const detail = buildDetailLayer(scaledLeafCount(PRESETS.ultra.detail));
  const props = buildGroundProps();
```

with:

```ts
  const detail = buildDetailLayer(scaledLeafCount(PRESETS.ultra.detail));
  const pocket = buildDetailLayer(scaledLeafCount(PRESETS.ultra.detail * POCKET_SHARE), 5, true);
  const props = buildGroundProps();
```


Replace:

```ts
    terrain, buildFloorPatch(), buildForestTrees(writeHeroLog), buildDistantTrees(), litter.group, detail.group,
    props.mesh,
  );
```

with:

```ts
    terrain, buildFloorPatch(), buildForestTrees(writeHeroLog), buildDistantTrees(), litter.group, detail.group,
    pocket.group, props.mesh,
  );
```


Replace:

```ts
  return {
    scene, litter, detail, props, hero, nearClutter, atmosphere, worm,
    apply(spec) {
      litter.setCount(scaledLeafCount(spec.litter));
      detail.setCount(scaledLeafCount(spec.detail));
      props.setDensity(spec.clutter);
```

with:

```ts
  return {
    scene, litter, detail, pocket, props, hero, nearClutter, atmosphere, worm,
    apply(spec) {
      litter.setCount(scaledLeafCount(spec.litter));
      detail.setCount(scaledLeafCount(spec.detail));
      pocket.setCount(scaledLeafCount(spec.detail * POCKET_SHARE));
      props.setDensity(spec.clutter);
```


Replace:

```ts
      setFocus(crawl.focus.x, crawl.focus.y, crawl.focus.z);
      // The near clutter keeps clear of the spine, and the floor patch centres on it.
      setSpine(pose.spine);
```

with:

```ts
      setFocus(crawl.focus.x, crawl.focus.y, crawl.focus.z);
      // The near clutter keeps clear of the spine, and the pocket's leaves keep round it.
      setSpine(pose.spine);
```



Replace the whole of `src/render/detailGlsl.ts` with:

```ts
import { wrapAround, WRAP_GLSL } from './wrap';
import { LITTER_GLSL, sampleLitter } from './litterTexture';
import { bakedGroundHeight, GROUND_GLSL } from './groundTexture';
import { glslFloat as f } from './glslNumber';
import { terrainHeight, TERRAIN_GLSL } from '../surface/terrain';
import { spineDistance, SPINE_DISTANCE_GLSL } from './nearClutterGlsl';
import { TOP_LAYER } from '../surface/litterDepth';

/** Side of the world tile the detail leaves repeat in (m); they fade out from 5 to 6 m. */
export const DETAIL_BOX = 13;
/** Detail leaves shrink to nothing between these distances from the worm's head (m). */
export const DETAIL_FADE_IN = 5;
export const DETAIL_FADE_OUT = 6;
/** A detail leaf rests this far above its surface (the drawn top, or the floor in the pocket)... */
export const REST_BASE = 0.008;
/** ...on the top, plus its place (aLeaf2.y, 0..1) in this share of the loose top leaves (TOP_LAYER)... */
const REST_SHARE = 0.6;
/**
 * ...in the pocket, plus its place squared (most lie low, round the worm) in the litter over the
 * floor, up to this far below the top of the thinnest litter it reaches (litterAt's y)...
 */
export const POCKET_TOP_GAP = 0.15;
/**
 * ...less what its curl lifts it (a detail leaf's curled edge rises up to 0.51 of its radius over
 * its rest plane), so it never shows through the top.
 */
export const POCKET_CURL = 0.55;
/**
 * A pocket leaf shrinks to nothing as its home goes from POCKET_NEAR to POCKET_FAR from the
 * spine: only the leaves round the body are drawn, so the few the hole shows cost little (the rest
 * would be shaded under the top of the litter for nothing). Its nearest edge is then still over
 * 0.8 from the spine, outside what the hole shows at the body's level.
 */
export const POCKET_NEAR = 1.6;
export const POCKET_FAR = 2.0;

/**
 * Vertex GLSL for the detail leaves. aDetail = (home x, z as 0..1 of the DETAIL_BOX tile, yaw,
 * radius m); the shape's positions are scaled so its farthest vertex is 1 out, so the leaf's
 * radius is aDetail.w. Draws the copy of the home nearest the worm (uWrapCentre, the head snapped
 * to a 1 m grid), shrunk to nothing from 5 to 6 m from the head (uFocus), turned by its yaw and
 * laid at one rest height for the whole leaf on its surface:
 * - the top leaves: on the drawn top of the litter (meshGround), in the loose top layer;
 * - with POCKET defined, the leaves in the buried worm's pocket (V2 spec 8.2), seen only through
 *   the hole over it: on the floor (terrainHeight, floorHeight's twin, where the worm rests),
 *   REST_BASE plus the layer squared times the thinnest litter it reaches less POCKET_TOP_GAP and
 *   its curl's lift (POCKET_CURL times its radius); and only round the body (POCKET_NEAR to
 *   POCKET_FAR from the spine, uSpine).
 * Every vertex follows the surface under it and lies at or above the leaf's rest plane over it
 * (the curl only lifts), so a leaf's dip is 0. Writes the baked trunk shade to `shade` and the
 * disturbance anchor (home x, z, radius, rest) to `anchor`. A leaf shrunk to nothing returns at
 * once with radius 0, all its vertices on one point: the caller skips disturb() for it. Needs
 * aLeaf2 and uniforms uFocus, uWrapCentre, uLitter and (the top leaves) uGround.
 */
export const DETAIL_GLSL = /* glsl */ `
  uniform vec3 uFocus;
  uniform vec2 uWrapCentre;
  uniform sampler2D uLitter;
  attribute vec4 aDetail;
  ${WRAP_GLSL}
  ${LITTER_GLSL}
  #ifdef POCKET
  ${TERRAIN_GLSL}
  ${SPINE_DISTANCE_GLSL}
  #else
  ${GROUND_GLSL}
  #endif
  vec4 detailPosition(inout vec3 n, out float shade, out vec4 anchor) {
    vec2 home = wrapAround(aDetail.xy, uWrapCentre, ${f(DETAIL_BOX)});
    float fade = 1.0 - smoothstep(${f(DETAIL_FADE_IN)}, ${f(DETAIL_FADE_OUT)}, distance(home, uFocus.xz));
    #ifdef POCKET
      if (fade > 0.0) fade *= 1.0 - smoothstep(${f(POCKET_NEAR)}, ${f(POCKET_FAR)}, spineDistance(home));
    #endif
    float r = aDetail.w * fade;
    if (r <= 0.0) {
      // Shrunk to nothing (about a third of the tile): every vertex of the leaf lands on one
      // point, so it draws nothing. Skip the texture reads (and, in the caller, the drape).
      shade = 1.0;
      anchor = vec4(home, 0.0, 0.0);
      return vec4(home.x, 0.0, home.y, 1.0);
    }
    float c = cos(aDetail.z);
    float s = sin(aDetail.z);
    vec3 p = position * r;
    p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
    n = vec3(c * n.x + s * n.z, n.y, -s * n.x + c * n.z);
    vec3 lit = litterAt(home);
    shade = lit.z;
    vec2 xz = home + p.xz;
    #ifdef POCKET
      float rest = ${f(REST_BASE)} + aLeaf2.y * aLeaf2.y * max(0.0, lit.y - ${f(POCKET_TOP_GAP)} - r * ${f(POCKET_CURL)});
      float ground = terrainHeight(xz);
    #else
      float rest = ${f(REST_BASE)} + aLeaf2.y * ${f(TOP_LAYER * REST_SHARE)};
      float ground = meshGround(xz);
    #endif
    anchor = vec4(home, r, rest);
    return vec4(xz.x, ground + rest + p.y, xz.y, 1.0);
  }
`;

const smooth = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lit = [0, 0, 0];

/** The shared uniforms detailPosition reads, and the baked textures' data, for detailVertex. */
export interface DetailInputs {
  /** The head as rendered (uFocus x, z) and its 1 m snap (uWrapCentre). */
  focusX: number; focusZ: number; wrapX: number; wrapZ: number;
  /** litterTextureData() and groundTextureData(). */
  litter: Uint8Array; ground: Float32Array;
  /** The pocket's leaves: uSpine, SPINE_POINTS x, y, z triples (the rendered spine). */
  spine?: ArrayLike<number>;
}

/**
 * TS twin of DETAIL_GLSL's detailPosition() (positions only), for tests: places leaf-local vertex
 * `position` of a leaf with `detail` (aDetail) and `layer` (aLeaf2.y), on the top of the litter
 * or (`pocket`) in the worm's pocket. Writes the world point into `out` and the disturbance anchor
 * into `anchor`; returns the trunk shade. When the anchor's radius is 0 the shader skips
 * disturb(), so callers replaying it must too.
 */
export function detailVertex(
  inp: DetailInputs, detail: ArrayLike<number>, position: ArrayLike<number>, layer: number,
  out: number[], anchor: number[], pocket = false,
): number {
  const hx = wrapAround(detail[0], inp.wrapX, DETAIL_BOX);
  const hz = wrapAround(detail[1], inp.wrapZ, DETAIL_BOX);
  let fade = 1 - smooth(DETAIL_FADE_IN, DETAIL_FADE_OUT, Math.hypot(hx - inp.focusX, hz - inp.focusZ));
  if (pocket && fade > 0) fade *= 1 - smooth(POCKET_NEAR, POCKET_FAR, spineDistance(inp.spine ?? [], hx, hz));
  const r = detail[3] * fade;
  if (r <= 0) {
    anchor[0] = hx;
    anchor[1] = hz;
    anchor[2] = 0;
    anchor[3] = 0;
    out[0] = hx;
    out[1] = 0;
    out[2] = hz;
    return 1;
  }
  const c = Math.cos(detail[2]);
  const s = Math.sin(detail[2]);
  const px = position[0] * r;
  const pz = position[2] * r;
  sampleLitter(inp.litter, hx, hz, lit);
  const rest = pocket
    ? REST_BASE + layer * layer * Math.max(0, lit[1] - POCKET_TOP_GAP - r * POCKET_CURL)
    : REST_BASE + layer * TOP_LAYER * REST_SHARE;
  anchor[0] = hx;
  anchor[1] = hz;
  anchor[2] = r;
  anchor[3] = rest;
  out[0] = hx + c * px + s * pz;
  out[2] = hz - s * px + c * pz;
  const ground = pocket ? terrainHeight(out[0], out[2]) : bakedGroundHeight(inp.ground, out[0], out[2]);
  out[1] = ground + rest + position[1] * r;
  return lit[2];
}
```

In `src/render/leafMaterial.ts`:


Replace:

```ts
 * With DETAIL defined, aDetail (home x, z in the wrap tile, yaw, radius) places each leaf of the
 * close-up layer around the worm in the vertex shader, which also gives its anchor (and no dip).
 * With HERO defined it is the instanced hero-leaf mesh (instanceMatrix, instanceColor tint).
```

with:

```ts
 * With DETAIL defined, aDetail (home x, z in the wrap tile, yaw, radius) places each leaf of the
 * close-up layer around the worm in the vertex shader, which also gives its anchor (and no dip):
 * on the top of the litter, or with POCKET in the litter round the buried worm (detailGlsl.ts).
 * With HERO defined it is the instanced hero-leaf mesh (instanceMatrix, instanceColor tint).
```


Replace:

```ts
 * chunks ('plain'), distant low-detail litter ('far'), the close-up top leaves ('detail': they
 * fade), the falling leaves (animated), or the hero leaves (instanced, moved by their own physics).
 * The litter swaps between the first three per chunk, never recompiling. The top leaves lie 2 to
 * 5 cm above the worm (V2 spec 8.2), so the disturbance map no longer moves them.
 */
export type LeafVariant = 'litter' | 'plain' | 'far' | 'falling' | 'detail' | 'hero';

```

with:

```ts
 * chunks ('plain'), distant low-detail litter ('far'), the close-up top leaves ('detail': they
 * fade), the leaves in the buried worm's pocket ('pocket': they drape and slide by the disturbance
 * map, and fade), the falling leaves (animated), or the hero leaves (instanced, moved by their own
 * physics). The litter swaps between the first three per chunk, never recompiling. The top leaves
 * lie 2 to 5 cm above the worm (V2 spec 8.2), so only the pocket's leaves react to it.
 */
export type LeafVariant = 'litter' | 'plain' | 'far' | 'falling' | 'detail' | 'pocket' | 'hero';

```


Replace:

```ts
  detail: { DETAIL: '', OCCLUDE: '' },
  hero: { HERO: '', OCCLUDE: '' },
```

with:

```ts
  detail: { DETAIL: '', OCCLUDE: '' },
  pocket: { DETAIL: '', POCKET: '', DISTURB: '', OCCLUDE: '' },
  hero: { HERO: '', OCCLUDE: '' },
```


Replace:

```ts
      ...groundUniforms,
      // Only the detail layer needs the baked litter and ground, so only it pays for building them.
      ...(variant === 'detail' ? { uLitter: { value: getLitterTexture() }, uGround: { value: getGroundTexture() } } : {}),
    },
```

with:

```ts
      ...groundUniforms,
      // Only the detail layers need the baked litter and ground, so only they pay for building them.
      ...(variant === 'detail' || variant === 'pocket'
        ? { uLitter: { value: getLitterTexture() }, uGround: { value: getGroundTexture() } } : {}),
    },
```



In `src/render/nearClutterGlsl.ts`:


Replace:

```ts
 */
export const NEAR_CLUTTER_GLSL = /* glsl */ `
  uniform vec3 uFocus;
  uniform vec2 uWrapCentre;
  uniform sampler2D uLitter;
  uniform vec3 uSpine[${SPINE_POINTS}];
  attribute vec2 aWrap;
  ${WRAP_GLSL}
  ${LITTER_GLSL}
  ${GROUND_GLSL}
  float spineDistance(vec2 p) {
```

with:

```ts
 */
/**
 * GLSL: spineDistance(p), the x, z distance from p to the rendered spine (uniform uSpine,
 * SPINE_POINTS points head first), and that uniform. TS twin: spineDistance below.
 */
export const SPINE_DISTANCE_GLSL = /* glsl */ `
  uniform vec3 uSpine[${SPINE_POINTS}];
  float spineDistance(vec2 p) {
```


Replace:

```ts
  }
  vec4 nearClutterPosition(vec3 position, out float shade) {
```

with:

```ts
  }
`;

export const NEAR_CLUTTER_GLSL = /* glsl */ `
  uniform vec3 uFocus;
  uniform vec2 uWrapCentre;
  uniform sampler2D uLitter;
  attribute vec2 aWrap;
  ${WRAP_GLSL}
  ${LITTER_GLSL}
  ${GROUND_GLSL}
  ${SPINE_DISTANCE_GLSL}
  vec4 nearClutterPosition(vec3 position, out float shade) {
```



In `src/surface/detailLeaves.ts`:


Replace:

```ts
import { scaledLeafCount } from './leafScale';

```

with:

```ts
import { scaledLeafCount } from './leafScale';
import { POCKET_ORDER } from '../render/drawOrder';

```


Replace:

```ts

/**
 * Smaller, more curled, higher-vertex leaves covering about 6 m around the worm (spec 5.5). One
 * static mesh in leaf-local space, built once: each leaf's home in a DETAIL_BOX world tile, its yaw
```

with:

```ts

/** The pocket's leaves, as a share of a preset's detail leaves (V2 spec 8.2). */
export const POCKET_SHARE = 0.5;

/**
 * Smaller, more curled, higher-vertex leaves about 6 m around the worm (spec 5.5): on the top of
 * the litter, or (`pocket`) in the litter round the buried worm, seen only through the hole over
 * it, older and darker the lower they lie (V2 spec 8.2). One
 * static mesh in leaf-local space, built once: each leaf's home in a DETAIL_BOX world tile, its yaw
```


Replace:

```ts
 */
export function buildDetailLeaves(count = scaledLeafCount(PRESETS.ultra.detail), seed = 3): DetailLeaves {
  const rng = mulberry32(seed);
```

with:

```ts
 */
export function buildDetailLeaves(count = scaledLeafCount(PRESETS.ultra.detail), seed = 3, pocket = false): DetailLeaves {
  const rng = mulberry32(seed);
```


Replace:

```ts
  const stem = new THREE.Color();
  const n: Vec3 = { x: 0, y: 0, z: 0 };
```

with:

```ts
  const stem = new THREE.Color();
  const dull = new THREE.Color();
  const n: Vec3 = { x: 0, y: 0, z: 0 };
```


Replace:

```ts
    form.curl = 0.2 + rng() * (kind === 'oak' ? 0.35 : 0.25);
    // The top of the litter: drier than the damp bottom layer.
    const wet = leafTint(kind, 0.03 + rng() * 0.03, rng, inner, edge, stem);
    const rs = reach(kind);
    const home = [rng(), rng(), rng() * Math.PI * 2, size * rs];
    const layer = rng();
    for (let p = 0; p < np; p++) {
```

with:

```ts
    form.curl = 0.2 + rng() * (kind === 'oak' ? 0.35 : 0.25);
    const fresh = leafTint(kind, 0.03 + rng() * 0.03, rng, inner, edge, stem);
    const rs = reach(kind);
    const home = [rng(), rng(), rng() * Math.PI * 2, size * rs];
    const layer = rng();
    // Its place in the pocket's litter (detailGlsl.ts): lower down, older, so darker, duller and
    // wetter (research notes: this fall's bright leaves on top, bleached and then dark brown below).
    const age = pocket ? 1 - layer * layer : 0;
    for (const c of [inner, edge, stem]) {
      const grey = (c.r + c.g + c.b) / 3;
      c.lerp(dull.setRGB(grey, grey * 0.88, grey * 0.7), 0.6 * age).multiplyScalar(1 - 0.55 * age);
    }
    const wet = Math.max(fresh, 0.75 * age);
    for (let p = 0; p < np; p++) {
```


Replace:

```ts
  g.setIndex(new THREE.BufferAttribute(index, 1));
  const mesh = new THREE.Mesh(g, createLeafMaterial('detail'));
  // Placed around the worm in the shader.
  mesh.frustumCulled = false;
  mesh.name = 'detailLeaves';
  let drawn = count;
```

with:

```ts
  g.setIndex(new THREE.BufferAttribute(index, 1));
  const mesh = new THREE.Mesh(g, createLeafMaterial(pocket ? 'pocket' : 'detail'));
  // Placed around the worm in the shader.
  mesh.frustumCulled = false;
  // The pocket is under the top of the litter: drawn after it (drawOrder.ts).
  if (pocket) mesh.renderOrder = POCKET_ORDER;
  mesh.name = pocket ? 'pocketLeaves' : 'detailLeaves';
  let drawn = count;
```


Replace:

```ts
 */
export function buildDetailLayer(count = scaledLeafCount(PRESETS.ultra.detail), seed = 3): DetailLayer {
  const group = new THREE.Group();
  group.name = 'detailLayer';
  let built: DetailLeaves | null = null;
```

with:

```ts
 */
export function buildDetailLayer(count = scaledLeafCount(PRESETS.ultra.detail), seed = 3, pocket = false): DetailLayer {
  const group = new THREE.Group();
  group.name = pocket ? 'pocketLayer' : 'detailLayer';
  let built: DetailLeaves | null = null;
```


Replace:

```ts
        if (n <= 0) return;
        built = buildDetailLeaves(count, seed);
        group.add(built.mesh);
```

with:

```ts
        if (n <= 0) return;
        built = buildDetailLeaves(count, seed, pocket);
        group.add(built.mesh);
```

- [ ] **Step 4: Run everything**

Run: `npx tsc --noEmit && npx vitest run && npm run verify:build && npm run test:e2e`
Expected: types clean; **67 files, 613 tests**; `single-file build OK`; **33 passed, 1 skipped** (+1: the detail parity test runs both variants).

- [ ] **Step 5: Look at it (rendering)**

```bash
npm run build
node .cache/shot2.mjs .cache/shots/t8-high.png "?preset=high" keys:ArrowUp:6000 keys:ArrowUp+ArrowLeft:3000 keys:ArrowUp:1500 wait:800
node .cache/shot2.mjs .cache/shots/t8-ultra.png "?preset=ultra" keys:ArrowUp:6000 keys:ArrowUp+ArrowRight:2500 keys:ArrowUp:1500 wait:800
```
Expected: through the hole, the worm on the dark floor with older, darker leaves round it at different heights (some partly over it, dithered 40 to 60%), stepping down from the bright top leaves at the hole's edge: a look down into the litter, not a cut-out. No leaf shows through the top of the litter anywhere. Reviewers compare with IMG_2407 (top), IMG_2427 and IMG_2428 (under), and with Task 7's shots.

- [ ] **Step 6: Commit**

```bash
git add src/render/detailGlsl.ts src/surface/detailLeaves.ts src/render/leafMaterial.ts src/render/nearClutterGlsl.ts \
  src/game/world.ts tests/unit/detailGlsl.test.ts tests/unit/detailLeaves.test.ts tests/unit/leafGlsl.test.ts \
  tests/unit/leafJitter.test.ts tests/unit/floorPatch.test.ts tests/unit/groundUniforms.test.ts tests/e2e/glslParity.spec.ts
git commit -m "feat(v2): older, darker leaves round the worm in its pocket, draped by the map

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---


### Task 9: Motion smoothness over the new bed, and the changelog

**Files:**
- Create: `tests/unit/buriedMotion.test.ts`
- Modify: `CHANGELOG.md`

Matt is very sensitive to jitter (handoff lessons): this measures every rendered frame, not end states, over six deterministic seeds. Each seed drives a different course over the windblown piles, along the log's drift and round the rocks' banks (where the top of the litter climbs and falls most), at 60 Hz steps on a display with uneven frames (one in seven late) and the 30 fps cap. Limits are V1's measures on the same courses (run against the Task 5 build) or better: camera jerk under 0.11 (V1 0.099), turn per frame under 0.12 rad (V1 0.113), turn jerk under 0.05 (V1 0.045), the camera's height turning back by over a millimetre at most 6 times a seed (V1 0 to 4, V2 0 to 5); the worm's height jerk under 0.005 a frame and 0.002 a step (V1 0.030 and 0.0099: the floor is smooth); body point coordinates turning back by over a millimetre at most 40 times a seed (V1 7 to 232, V2 5 to 26).

The changelog lines are for students (CLAUDE.md); Plan B adds its own in its closing task.

- [ ] **Step 1: Write the test**

Create `tests/unit/buriedMotion.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Crawl, WORM_SEGMENTS } from '../../src/game/crawl';
import { advance, createStepper } from '../../src/core/stepper';
import { mulberry32 } from '../../src/core/random';
import { PILES } from '../../src/surface/litterDepth';
import { rocks, heroLog } from '../../src/surface/propPlacement';
import type { WormPose } from '../../src/worm/wormMesh';

/**
 * The worm buried in deep, uneven litter (V2 spec 8.2) must move as smoothly as V1's: Matt is very
 * sensitive to jitter. Each seed drives a different course over the windblown piles, along the
 * fallen log's drift and round the rocks' banks (where the litter's top climbs and falls most),
 * on a 60 Hz display with uneven frames, and measures every rendered frame (handoff lessons).
 */
interface Track { cam: number[][]; dir: number[][]; head: number[]; steps: number[]; body: Float32Array[] }

function drive(seed: number, seconds: number): Track {
  const rng = mulberry32(seed);
  const log = heroLog();
  const spots = [
    ...PILES.map((p) => [p.x, p.z]),
    ...rocks().map((k) => [k.x + k.size * 1.4, k.z + k.size * 1.4]),
    [log.x - 6, log.z - log.radius * 1.4], [log.x + 6, log.z - log.radius * 1.4],
  ];
  const crawl = new Crawl();
  crawl.setHeroCount(8);
  const st = createStepper();
  const camera = new THREE.PerspectiveCamera(60, 1366 / 768, 0.2, 120);
  const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
  const t: Track = { cam: [], dir: [], head: [], steps: [], body: [] };
  const v = new THREE.Vector3();
  let target = spots[Math.floor(rng() * spots.length)];
  let wall = 0;
  const move = { x: 0, y: 1 };
  while (wall < seconds * 1000) {
    const dt = (1000 / 60) * (rng() < 0.15 ? 2 : 1) + (rng() - 0.5) * 3;
    wall += dt;
    const r = advance(st, dt, 1000 / 60, 1000 / 30);
    for (let i = 0; i < r.steps; i++) {
      const h = crawl.motion.head;
      if (Math.hypot(target[0] - h.x, target[1] - h.z) < 1) target = spots[Math.floor(rng() * spots.length)];
      const err = Math.atan2(target[0] - h.x, target[1] - h.z) - crawl.motion.heading;
      const e = err - 2 * Math.PI * Math.round(err / (2 * Math.PI));
      move.x = Math.max(-1, Math.min(1, -e * 2));
      crawl.step(1 / 60, move);
      t.steps.push(h.y);
    }
    if (!r.render || wall < 1500) continue;
    crawl.interpolate(r.alpha, wall / 1000, pose, camera);
    camera.updateMatrixWorld();
    t.cam.push(camera.position.toArray());
    t.dir.push(camera.getWorldDirection(v).toArray());
    t.head.push(pose.spine[1]);
    t.body.push(Float32Array.from(pose.spine));
  }
  return t;
}

const SEEDS = [1, 2, 3, 4, 5, 6];
/**
 * Body point coordinates turning back by over a millimetre between frames, per seed: V1 7 to 232
 * (its height bounced on the drawn grid), V2 5 to 26 (only in the tightest turns).
 */
const BODY_BACK_MAX = 40;
const tracks = SEEDS.map((s) => drive(s, 40));

/** Every per-frame and per-step measure, for one seed's course. */
function measure(t: Track) {
  let camJerk = 0;
  let rot = 0;
  let rotJerk = 0;
  let headJerk = 0;
  let stepJerk = 0;
  let camYBack = 0;
  let bodyBack = 0;
  for (let k = 2; k < t.cam.length; k++) {
    const [a, b, c] = [t.cam[k - 2], t.cam[k - 1], t.cam[k]];
    const s1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const s2 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
    camJerk = Math.max(camJerk, Math.hypot(s2[0] - s1[0], s2[1] - s1[1], s2[2] - s1[2]));
    // The camera bobbing: its height turning back by more than a millimetre.
    if (s1[1] * s2[1] < 0 && Math.min(Math.abs(s1[1]), Math.abs(s2[1])) > 0.001) camYBack++;
    const [da, db, dc] = [t.dir[k - 2], t.dir[k - 1], t.dir[k]];
    const r1 = Math.acos(Math.min(1, da[0] * db[0] + da[1] * db[1] + da[2] * db[2]));
    const r2 = Math.acos(Math.min(1, db[0] * dc[0] + db[1] * dc[1] + db[2] * dc[2]));
    rot = Math.max(rot, r2);
    rotJerk = Math.max(rotJerk, Math.abs(r2 - r1));
    headJerk = Math.max(headJerk, Math.abs(t.head[k] - 2 * t.head[k - 1] + t.head[k - 2]));
    // Any body point stepping back (along x, z or y) by more than a millimetre between frames.
    for (let i = 0; i < WORM_SEGMENTS * 3; i++) {
      const d1 = t.body[k - 1][i] - t.body[k - 2][i];
      const d2 = t.body[k][i] - t.body[k - 1][i];
      if (d1 * d2 < 0 && Math.min(Math.abs(d1), Math.abs(d2)) > 0.001) bodyBack++;
    }
  }
  for (let k = 2; k < t.steps.length; k++) stepJerk = Math.max(stepJerk, Math.abs(t.steps[k] - 2 * t.steps[k - 1] + t.steps[k - 2]));
  return { frames: t.cam.length, camJerk, rot, rotJerk, headJerk, stepJerk, camYBack, bodyBack };
}

const results = tracks.map(measure);

describe('the buried worm and its camera move smoothly over deep, uneven litter (frame to frame, seeds 1 to 6)', () => {
  // V1 (the worm on the soil under thin litter, riding piles), the same courses and frames:
  // camera jerk up to 0.099, turn 0.113 rad a frame, turn jerk 0.045, head height jerk 0.030
  // (0.0099 a step), camera height turning back 0 to 4 times a seed. V2 measured 0.099, 0.104,
  // 0.043, 0.0035 (0.0016), 0 to 5.
  it('the camera: no snap, no shake, no spin (as V1 or better)', () => {
    for (const [i, r] of results.entries()) {
      expect(r.frames, `seed ${SEEDS[i]}`).toBeGreaterThan(1000);
      expect(r.camJerk, `seed ${SEEDS[i]}`).toBeLessThan(0.11);
      expect(r.rot, `seed ${SEEDS[i]}`).toBeLessThan(0.12);
      expect(r.rotJerk, `seed ${SEEDS[i]}`).toBeLessThan(0.05);
      expect(r.camYBack, `seed ${SEEDS[i]}`).toBeLessThanOrEqual(6);
    }
  });

  it('the worm rides the smooth floor: its height never kinks (smoother than V1\'s worm on the drawn grid)', () => {
    for (const [i, r] of results.entries()) {
      expect(r.headJerk, `seed ${SEEDS[i]}`).toBeLessThan(0.005);
      expect(r.stepJerk, `seed ${SEEDS[i]}`).toBeLessThan(0.002);
    }
  });

  it('the body never steps back between frames', () => {
    for (const [i, r] of results.entries()) expect(r.bodyBack, `seed ${SEEDS[i]}`).toBeLessThanOrEqual(BODY_BACK_MAX);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/unit/buriedMotion.test.ts`
Expected: 3 tests pass (about a minute: six 40 s courses).

- [ ] **Step 3: The changelog**

In `CHANGELOG.md`:


Replace:

```markdown
- The Start screen shows which version you are playing: V2 · Underground.

```

with:

```markdown
- The Start screen shows which version you are playing: V2 · Underground.
- **Deeper leaves.** The fallen leaves are now 2 to 5 cm deep, as deep as a real Minnesota forest
  floor in fall: deeper in piles and against logs and trees, thinner on bumps.
- **Your worm travels inside the leaves**, not on top of them. The leaves above it fade so you can
  still see it, down in the dark, damp old leaves where it crawls.
- The whole forest is real size now, so the World scale button is gone. (V1 still has it.)

```

- [ ] **Step 4: Run everything**

Run: `npx tsc --noEmit && npx vitest run && npm run verify:build && npm run test:e2e`
Expected: **68 files, 616 tests** (+1 file, +3); `single-file build OK`; **33 passed, 1 skipped**.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/buriedMotion.test.ts CHANGELOG.md
git commit -m "test(v2): the buried worm and its camera move smoothly over deep litter; changelog lines

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---


### Task 10: Checkpoint: the surface's perf gates, screenshots and a Chromebook look (no code unless a gate fails)

**Files:** none, unless a gate fails (then the files named in the cut ladder below).

The rough signal ("Read this first", item 1) says High and Ultra may fail. Measure properly before Plan B builds on this surface. **Run on a quiet machine, with no other agent running** (about 35 minutes):

- [ ] **Step 1: Run the gates**

```bash
npm run build && node scripts/perf-gates.mjs 4 2>&1 | tee .cache/gates-v2-surface.txt
```
Expected: four lines, `low`, `medium`, `high`, `ultra`, each `PASS` with draws ≤ 40. V1 measured (True) Low 1.51, Medium 1.44, High 0.92, Ultra 0.755 against gates 1.09, 0.87, 0.74, 0.61.

- [ ] **Step 2: If a preset fails, apply the cut ladder in order, rerunning only the failing presets after each rung** (`node scripts/perf-gates.mjs 4 high ultra`), and stop at the first rung that passes. Each rung is one small edit; record what you applied in `.cache/gates-v2-surface.txt` and tell the lead (Plan B's as-built record lists it).
  1. **Fewer leaves in the pocket** (`src/surface/detailLeaves.ts`): `export const POCKET_SHARE = 0.5;` → `export const POCKET_SHARE = 0.3;`. Then `npx vitest run tests/unit/leafGlsl.test.ts tests/unit/leafJitter.test.ts` (their sample floors still hold at 0.3: `near > 400 * 6`, `back.length > 5000`; if one does not, lower that floor and say so).
  2. **Fewer top detail leaves on High and Ultra** (`src/render/graphics.ts`): `detail: 1000` → `detail: 800` (high) and `detail: 1600` → `detail: 1250` (ultra). Then `npx vitest run tests/unit/sceneTiers.test.ts tests/unit/graphics.test.ts`.
  3. **A narrower funnel** (`src/render/occlusion.ts`): `export const OCC_FUNNEL = 0.25;` → `export const OCC_FUNNEL = 0.15;` (a smaller screen box runs the fade's loop on fewer pixels). Then `npx vitest run tests/unit/occlusion.test.ts tests/unit/litterChunks.test.ts` and look at Task 8's screenshots again: the hole must still read as a pocket.
  4. **Clutter, then distant detail** (V1's order): Ultra's near clutter off (`nearClutter: true` → `false` in `PRESETS.ultra`), then the distant ring `distantCount: 14` → `10` in `src/surface/realScale.ts`.
  5. **The pit** (a design change; ask the lead first): lower the terrain mesh's vertices in a 7 × 7 square round the body to the floor (shading them as the floor, which retires `floorPatch.ts`), and draw the top of the litter there as a small separate patch that alone carries the fade's `discard`. The terrain then keeps its early depth test everywhere else. Same draw calls.

- [ ] **Step 3: Screenshots for Matt and the slides** (after the gates pass)

```bash
mkdir -p docs/codev/versions/v02-underground
for p in low medium high ultra; do node .cache/shot2.mjs .cache/shots/surface-$p.png "?preset=$p" keys:ArrowUp:7000 keys:ArrowUp+ArrowLeft:3000 keys:ArrowUp:1500 wait:800; done
```
Look at all four: the worm always visible; the pocket dark and wet; no leaf through the top; rocks half showing; no shimmer. Plan B's closing task copies the best into `docs/codev/versions/v02-underground/`.

- [ ] **Step 4: Chromebook check** (Matt, CLAUDE.md release step 5: rendering changed): the root build on a student Chromebook at High, crawl a minute over the piles and along the log. Note fps and anything that looks wrong.

---


## Self-review

**Against the contract ("What Plan A provides"):**
- §1 Content: `SourceId`, `SOURCES` (`{ title, publisher, url, checked }`, including `wormwatch-ecogroups`, `mndnr-humus`, `wormwatch-forest`), `Line`, `TEXT` (`as const satisfies Record<string, Line>`), `shown()` with "Game choice: ", every key and word Plan B uses (checked word for word in `content.test.ts`), a unit test and the types rejecting unsourced or unverified facts. Task 4.
- §2 Action prompt: `ActionKind`, `ActionPrompt { set; touchHeld; dispose }` (plus `endStep`), `createActionPrompt(root)`, `createPressEdge()` in `src/input/actionEdge.ts`, one icon per kind in `icons.ts`, real DOM, 18 px+ (22 to 24 px), 7:1+ (9:1), 64 px+ (72 to 84 px), no flashing or pulse, `set()` free when unchanged, `touchHeld` ORed into `Commands.action` in `main.ts`. Task 5.
- §3 Surface: `litterDepth` 0.45 to 1.2, deeper in piles and drifts, thinner on rises; `floorHeight` and `litterTopHeight` exported from `src/surface/litterDepth.ts`; `litterTopHeight ≈ floorHeight + litterDepth` as drawn (within 0.17). `rocks()`, `heroLog()`, `treeSites()`, `trunkRadiusOf()`, the footprint queries and `WORLD_HALF` keep their names (only optional `spec` parameters went). Tasks 3 and 6.
- §4 World scale: `worldScale.ts`, `scaleSpec()` and `setScale()` are gone; `UNITS_PER_CM = 3.5 / 15` lives in `src/surface/realScale.ts`; the screen, button, `?scale=` and `--scale` are removed; `switchForest` is removed. Tasks 2 and 3.
- §5 Settings: no `scale` in `Settings`; a stored one is kept on write and ignored (unit and e2e tests); `updateSettings` keeps its name and rule. Task 2.
- §6 Version and changelog: Task 1 (label) and Task 9 (lines).
- Shared rules: real size only; draw calls 20/26/27 while crawling (Low/High/Ultra) against 40; no shader compiles on preset changes (e2e); no new per-step or per-frame allocation (the new per-step code writes preallocated objects: `Crawl.view`, the prompt's flags, the keyboard's `drop` callback); `main.ts`, `crawl.ts`, `obstacles.ts` shrank; frame-to-frame motion tests over a seed sweep (Task 9, plus the pocket and hero leaf jitter tests).

**Against the spec:** 8.2 (deeper L layer from the existing depth field; the worm buried, leaves above fading, never cutting it: V1's clearance tests for hero leaves pass unchanged with the floor as their surface, and new ones cover the top and pocket leaves; stack colours: bright top, darker and duller below; costs rechecked: stamp limit and on-top offset unchanged and still tested, clearance and jitter tests rerun); 10 (World scale removed, nothing branches on a mode, old saves load, `/v1/` untouched, the retirement of Classic's hash tests noted for the as-built record); 2b (content system, the touch Action button); 11.8 (one context-dependent Action: the prompt shows whatever kind Plan B sets); 11.9 (buried, with the fade). Not in Plan A: everything underground, the dig-allowed check, burrow openings, the 8.1 Should items (Plans B and C).

**Placeholders:** none. Every code step is a complete file or an exact replacement, generated from the verified commits and checked by applying it back.

**Names across tasks:** `REAL_SCALE`, `floorHeight`, `litterTopHeight`, `groundHeight`, `TOP_LAYER`, `THIN_REACH`, `OCC_REACH`, `OCC_FUNNEL`, `worldUpInView`, `uOccUp`, `GROUND_ORDER`, `POCKET_ORDER`, `FLOOR_ORDER`, `POCKET_SHARE`, `POCKET_NEAR`, `POCKET_FAR`, `CAM_OVER_TOP`, `endStep()` are each defined once and used with the same spelling everywhere.

**For Plan B, files this plan changes that Plan B also edits:** `src/main.ts` (World scale code gone; `commands()` replaces `move()` and is where `Commands.action` is merged; `update()` ends with `keyboard.endStep()` and `actionPrompt.endStep()`), `src/game/world.ts` (one forest, `pocket`, `setSpine` every frame, no `switchForest`), `src/save/settingsStore.ts` (no `scale`; add `undergroundView` as the contract says), the surface materials (`paintedMaterial` has `occlude` instead of `trail`; `leafMaterial` has a `pocket` variant), `scripts/perf-gates.mjs` (presets only, no `--scale` and no "World scale:" check).
