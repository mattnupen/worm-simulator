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
  be sized to match. A real fallen log or mushroom cap is large next to an earthworm, and the
  game draws them that way (see "Real size" below).
- **The worm has no eyes.** Expression comes from body motion and the moving prostomium.
- Meaning is never carried by colour alone. Nothing flashes more than 3 times a second.
- The camera is gentle. The one exception is a short wobble when a predator lands or tugs (Matt,
  2026-10-22, V4): under 3 shakes a second, and off with reduced motion.

## Real size (V2 onward)
- V2 removed World scale (Matt, 2026-10-06): the forest is drawn at real size only, next to a
  15 cm worm. The sizes and the prop layout live in `src/surface/realScale.ts`; nothing branches
  on a mode. V1 keeps Classic, Hybrid and True, frozen at `/v1/`.
- Big leaves, 4x rocks and 9x trunks show problems a small world hides: lids, polygon edges, bark
  stretch, sinking leaves and the camera crowding a trunk. Judge every visual change at real size.
- Reference screenshots of V1's modes, and of True's big-leaf lid, are in
  `docs/codev/versions/v01-true-size/`.

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
- **The gates' software renderer (SwiftShader) runs straight-line shader code for every pixel a
  draw covers**, past ifs and early returns that no pixel takes (measured, V2 Plan A); only a loop
  stops early, once every pixel of its 2x2 group has left it. So the worm's fade (`OCCLUDE`) costs
  per pixel of every fading draw, inside its screen box or not, and a narrower hole saves almost
  nothing there. Keep fading draws small (the terrain hands only the cells over the worm to
  `topPatch.ts`), the fade's code short, and its loops bounded per pixel (`occlusionTiles.ts`).
- **Performance gates.** Run them after any change that could affect performance (about 4 min
  per cycle):
  `npm run build && node scripts/perf-gates.mjs 4`
  - The script runs the speed test in headless Chromium with software WebGL. Each preset is run
    back to back with the Step 0 page, and its median fps ratio must clear the gate: Low 1.09,
    Medium 0.87, High 0.74, Ultra 0.61 (`--list` shows the run order).
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
