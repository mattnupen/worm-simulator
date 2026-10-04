# Visual quality and performance brief (read before any visual or rendering work)

## The bar
Matt (6th-grade outdoor-ed teacher) wants the game to **feel on par with a AAA game while
holding 30 fps on low-end school Chromebooks** (Intel UHD 600 / Mali-G52 class iGPU, 4 GB RAM,
1366x768). Every student Chromebook tested so far ran Step 1a well, so the budget below is
real.

## Art direction (parent spec, section 8.3)
- "Painted naturalist": the World of Warcraft painted feel. Rich warm light, soft colour
  bands, subtle brush texture, warm rim light. Shapes are simplified, not exaggerated.
- Northern Minnesota hardwood forest floor in fall. Paper birch and sugar maple; leaf litter
  of ash, basswood, aspen, maple and oak. Accurate enough to recognise on a field walk.
- **Scale is part of realism.** The worm is about 3.5 units long and 0.23 wide, and props must
  be sized to match. A real fallen log or mushroom cap is large next to an earthworm, and True
  mode draws them that way (see "World scale" below).
- **The worm has no eyes.** Expression comes from body motion and the moving prostomium.
- Meaning is never carried by colour alone. Nothing flashes more than 3 times a second.
- The camera is gentle, with no screen shake.

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

## Performance budget (verify; don't guess)
- One scene render per frame. No shadow maps, no post-processing passes, no extra render
  targets, no MSAA. Everything is opaque, plus a few small additive effects.
- Up to **40 draw calls** per frame on every preset. Instance or merge everything that repeats.
- **No per-frame or per-step allocation** in new code.
- **No shader recompiles on preset changes.** Build at Ultra size once, then switch presets
  through draw ranges, instance counts, visibility and material swaps. Lazily built layers
  (detail leaves, Ultra near clutter) compile once, the first time they are shown.
- **Fill rate is the main cost.** Leaves close to the camera dominate. Measured levers so far:
  smaller detail leaves, per-vertex noise, chunk culling with distance detail, and leaving
  `discard` out of chunks that cannot occlude the worm.
- **Performance gates.** Run them after any change that could affect performance (about 4 min
  per cycle):
  `npm run build && node scripts/perf-gates.mjs 4`
  - The script runs the speed test in headless Chromium with software WebGL. Each preset is run
    back to back with the Step 0 page, and its median fps ratio must clear the gate: Low 1.09,
    Medium 0.87, High 0.74, Ultra 0.61. It runs every preset in True and in Classic
    (`--scale=hybrid` for another mode; `--list` shows the run order).
  - For a single run, use `node scripts/bench.mjs . <label> "?speedtest=1&preset=high"`.
- **Twins.** GLSL with a TypeScript twin must stay in step with it.
  `tests/e2e/glslParity.spec.ts` runs the real shaders through transform feedback. Print shared
  constants with `glslFloat`.

## Engineering rules
- Vite + TypeScript strict (TS 7) + three 0.186. Named exports only. Vitest for unit tests and
  Playwright for e2e tests. Write tests first for pure modules.
- Keep files focused, under about 260 lines.
- Don't break any of these:
  - `npm test`, `npx tsc --noEmit`, `npm run verify:build` and `npm run test:e2e`;
  - the speed-test flow;
  - the accessibility rules: real DOM, text at least 18 px, contrast at least 7:1, a 4 px
    focus ring, targets at least 48 px, deliberate focus moves, and reduced motion respected.
- **Visual changes:** take Playwright screenshots and look at them. Iterate until it actually
  looks great.
- **Commits:** end every message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  Pushing `main` deploys to wormsimulator.com through Render.
