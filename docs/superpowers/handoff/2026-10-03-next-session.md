# Handoff: start of the next development round (written 2026-10-03)

## Where things stand
- `main` = Step 1a, merged and live at https://wormsimulator.com (Render deploys `main` on push).
  It includes:
  - the game shell (Start, Crawl, Pause, Graphics, Speed test);
  - graphics presets (Auto, Low, Medium, High, Ultra), saved on the device;
  - dense, interactive leaf litter: the worm slips under thin litter and climbs over piles,
    leaves drape over it and leave a trail, hero leaves get flipped by the head, and leaves
    between the camera and the worm thin out in a dot pattern so the worm stays visible.
- Documents:
  - Spec: `docs/superpowers/specs/2026-10-01-game-shell-and-forest-floor-v2-design.md`. It
    records every deviation and the known limitations in 5.6.
  - Plan: `docs/superpowers/plans/2026-10-01-step1a-game-shell-and-forest-floor-v2.md`.
  - Parent design: `docs/superpowers/specs/2026-09-30-worm-simulator-design.md`.
  - Visual and performance rules: `docs/superpowers/visual-quality-brief.md`. **Read it
    before any rendering work.**
- Checks: 524 unit tests and 22 e2e tests, all green. Performance gates:
  `npm run build && node scripts/perf-gates.mjs 4`.

## Matt's playtest notes after Step 1a (do these first)
Matt ran it on student Chromebooks: "It did pretty good." He had two notes.

### 1. Leaves are a little jittery when you move under them
This is not diagnosed yet. Reproduce and measure before fixing: in a debug build, record
frame-to-frame motion of leaves over the worm. Likely causes, roughly in order:
1. **8-bit disturbance map.** `src/surface/disturbance.ts` packs path and body nearness into
   RGBA8, so each value moves in 1/255 steps (path nearness is about 6 mm per step over 1.6 m).
   The rigid-leaf tilt in `src/render/leafGlsl.ts` (`disturb()`) comes from a 5-tap
   central-difference gradient of that field, so quantisation becomes tilt jitter.
   - Candidate fix: an RGBA16F texture (it filters linearly in WebGL2 core), or pack each value
     into 2 bytes.
   - Keep the TS twin `disturbVertex` and `tests/e2e/glslParity.spec.ts` in step.
2. **Step vs render mismatch.** The map is stamped on 60 Hz simulation steps
   (`src/game/crawl.ts`) and uploaded once per rendered frame, while the worm is drawn
   interpolated by `alpha`. So leaves react in 60 Hz quanta and can lag or lead the drawn body
   by up to one step. Consider stamping body nearness from the interpolated spine at render
   time; the path/trail channel can stay on steps.
3. **Bilinear sampling of a stamped distance field** isn't a true distance, so values at a
   fixed anchor change piecewise as the worm moves. The body channel also wobbles with
   peristalsis and head probing.
4. **Hero leaves:** check how `pitch`/`ppitch`/`pitchDir` are interpolated
   (`src/surface/heroLeafMesh.ts`).

The fix must keep the clearance tests at 0 violations (`tests/unit/leafGlsl.test.ts`,
`tests/unit/heroLeafClearance.test.ts`) and pass the performance gates.

### 2. Props are too small next to the worm
The hero log, mushrooms, rocks and probably trunks are undersized against the worm (3.5 units
long, 0.23 wide). For reference:
- a real earthworm is about 10–20 cm long;
- a fallen log is 20–40 cm in diameter;
- a russula cap is 5–10 cm across;
- a maple leaf is 10–15 cm.

At true scale the log would be a wall several worm-lengths tall, and trunks would be huge. So
this is a **design choice (scale factor per prop type) to agree with Matt in brainstorming**,
not just a number change. It touches all of these:
- `src/surface/propGeometry.ts`, `groundProps.ts`, `propPlacement.ts` (including the speed
  test's locked auto-drive corridor, `src/game/drive.ts`);
- `treeSites.ts`, `trunkGeometry.ts`;
- `litterDepth.ts` drift radii, and `heroObstacles.ts`;
- near clutter (`src/surface/nearClutter.ts`, keep-clear constants);
- performance, since bigger props cover more pixels.

Leaves may also be small at true scale, but Matt didn't flag them; ask before changing them.

## Next sub-project: 2, core loop + Moisture (parent spec 3.2, 3.3, 3.4 Level 1)
Step 1 sub-projects:
1. Shell and forest floor: **done**.
2. **Core loop + Moisture.**
3. Robin + Worm View. Hiding under leaves reuses the litter system.
4. Clitellum, cocoons, frost.
5. All input methods + saving.

Sub-project 2 scope, to confirm in brainstorming:
- Eat leaves. Species differ: ash, basswood and aspen grow you fastest, maple next, oak
  slowest.
- The worm grows longer, using the existing segment chain in `src/worm/body.ts` and
  `wormMesh.ts`.
- Moisture is the only meter: a bar, a water-drop icon, the word "Moist" and a shape change,
  never colour alone. A sunny gap drains it; damp shade refills it.
- A drying worm looks dull and wrinkled and moves slower.
- The HUD shows only the Moisture bar and the cocoon count.
- Level 1 "First bite" is a playable 3–5 minute level, opened with a one-sentence goal.
- No game-over screen; restart from a checkpoint.
- Science honesty (parent spec 5): any student-facing fact needs a source ID in
  `src/content/`, and the build fails if a fact is unsourced.
- The fal.ai art budget ($5 hard cap, logged in `art/spend-log.md`) is available, but the art
  pass is planned for later.

## How to work (what worked well)
- Process: superpowers brainstorming → written spec, which Matt approves → writing-plans →
  subagent-driven development.
- Each task gets a fresh implementer, then a two-stage review (does it match the spec, then
  code quality). Implementers copy verified code from the plan.
- **Plan writing:** have the planning agent build every task in a scratch copy, so the code in
  the plan is verified.
- **Matt's preferences:** quick multiple-choice design questions, then "proceed autonomously
  until done". He says `continue` to resume.
- **Benchmarks:** this Mac is often loaded (Spotlight). Benchmark only with one agent running,
  and use `scripts/perf-gates.mjs`, which compares against Step 0 side by side, not absolute
  fps.
- **Finishing a round:** merge to `main` with fast-forward, run tests, push (this deploys),
  then check that https://wormsimulator.com serves the new build.
