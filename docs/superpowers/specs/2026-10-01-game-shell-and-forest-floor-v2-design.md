# Step 1, Sub-project 1: Game Shell and Forest Floor v2, Design

Date: 2026-10-01
Status: Implemented (Step 1a), with the deviations recorded below
Parent spec: `docs/superpowers/specs/2026-09-30-worm-simulator-design.md` (sections 3.1, 7, 8)

## 1. Why

Every student Chromebook in the Step 0 speed test reported 60 fps at full quality with the 30 fps
cap off. There is headroom. Matt wants it spent on detail: many more leaves, especially up close,
and a worm that moves under and over them while crawling. Students also need a graphics setting so
weaker machines can reduce detail.

Step 1 in the parent spec is large, so it is split into sub-projects. Each gets its own spec,
plan and build:

1. **Game shell and forest floor v2 (this spec)**
2. Core loop and Moisture (eat, grow, sunny gaps, HUD; Level 1)
3. Robin and Worm View (Levels 2 and 3; hiding reuses this spec's leaf system)
4. Clitellum, cocoons and frost (Level 4)
5. Every input method and saving (gamepad, switch scanning, assisted steering, save code)

**Out of scope here:** eating, growth, Moisture, predators, Worm View, gamepad and switch input,
save codes, speech. The worm cannot collide with trees, rocks or the log yet (same as Step 0).

## 2. Decisions made in brainstorming

| Question | Decision |
|---|---|
| What is "under and over"? | Physical and automatic. No button. The worm slips under thin litter and climbs over deep piles on its own. |
| Graphics setting | Presets plus Auto: Auto, Low, Medium, High, Ultra. |
| Frame rate | Always capped at 30 fps (parent spec 8.1). Spare speed is spent on detail. |
| Where it lives | The real game entry (Step 1), replacing the `src/spike/` page. |
| Leaf technique | A: shader-driven litter with a disturbance map, plus B: a small pool of physics "hero" leaves up close. |

## 3. Game shell

### 3.1 Screens
A small, pure state machine in `src/game/screens.ts` drives the screens. The DOM for each screen
lives in `src/ui/`.

- **Start:** the existing parchment title card style. Buttons: **Crawl**, **Graphics**, **Speed test**.
  The live forest renders behind it.
- **Crawl:** free roam on the forest floor. An on-screen **Pause** button (top right, at least 48 px)
  and the joystick are shown. The fps tag shows only when the URL has `?fps=1`.
- **Pause:** opened by Esc, P, or the Pause button, and automatically when the tab is hidden
  (parent spec section 7). Buttons: **Resume**, **Graphics**, **Back to start**. The simulation
  stops while paused; the scene keeps its last frame.
- **Graphics:** reachable from Start and Pause. See section 4.
- **Speed test:** the Step 0 test, unchanged inside (two phases, restarts, report, no-WebGL and
  context-lost FAIL cards). Its result card adds **Use recommended setting**, which saves the
  preset the auto phase settled on (mapped as in 4.3) and turns Auto off.

Transitions:

```
start ──Crawl──▶ crawl ──Esc/P/Pause/tab hidden──▶ pause ──Resume──▶ crawl
start ──Graphics──▶ graphics ──Back──▶ (screen it came from)
pause ──Graphics──▶ graphics
pause ──Back to start──▶ start
start ──Speed test──▶ speedTest ──done──▶ results ──Back to start──▶ start
```

All menus are real DOM with the Step 0 accessibility rules: text at least 18 px, contrast at least
7:1, a visible 4 px focus ring, targets at least 48 px, focus moved deliberately on every screen
change, an `aria-live="polite"` panel, reduced motion respected, nothing flashing.

### 3.2 Settings storage
`src/save/settingsStore.ts` reads and writes one key, `wormsim.settings`, as JSON
`{ "version": 1, "graphics": "auto" | "low" | "medium" | "high" | "ultra", "autoSettled": <preset or null> }`.

- Every read and write is wrapped in try/catch. Missing, corrupt, wrong-version or unreadable data
  falls back to defaults (`graphics: "auto"`, `autoSettled: null`) with no error shown.
- Private mode, blocked storage or a full quota mean settings last only for the session.
- The full save system (sub-project 5) will absorb this key later.

### 3.3 Code layout
- `src/main.ts`: the entry. `index.html` points here. It creates the renderer (keeping the Step 0
  WebGL 2 FAIL card), the forest-floor scene, the loop, and the screen state machine.
- `src/game/screens.ts`: pure state machine (tested).
- `src/game/crawl.ts`: per-step worm, camera and leaf-interaction update (moved from the spike).
- `src/ui/`: start, pause, graphics and HUD DOM, plus the shared parchment CSS.
- `src/render/graphics.ts`: the preset table and Auto logic (pure, tested).
- `src/perf/`: the speed test (`speedTest.ts` and its runner), moved from `src/spike/`.
- `src/spike/` is removed once everything has moved. Existing modules in `core/`, `input/`,
  `worm/`, `surface/` and `render/` carry over.

## 4. Graphics presets

### 4.1 Presets
All presets are capped at 30 fps.

| | Low | Medium | High | Ultra |
|---|---|---|---|---|
| Render resolution | 60% | 75% | 100% | 100% × device pixel ratio, max 1.5 |
| Base leaf litter | 1,500 | 1,500 | 1,500 | 1,500 |
| Detail leaves around the worm | 0 | 900 | 1,000 | 1,600 |
| Hero physics leaves | 0 | 12 | 24 | 32 |
| Leaves react to the worm (drape, trail, under/over) | off: the worm rides on top | on | on | on |
| Light shafts, dust, falling leaves | off | on | on | on, with 1.5× dust and falling leaves |
| Ground clutter | 50% | 100% | 100% | 100% plus extra near the worm |
| Rim light | off | on | on | on |

The leaf counts were tuned to the section 6 gates in Step 1a (first targets: litter 1,000 /
2,500 / 4,000 / 6,000, detail 0 / 800 / 1,500 / 2,500). Base litter past 1,500 cost more than it
showed, so the presets share it and differ in the detail leaves near the worm, where the camera
looks. Within 6 m of the worm there are about 107 / 718 / 798 / 1,207 leaves (Step 0: 144).

Ultra's extra clutter is 40 sedge tufts and mushroom clusters wrapped round the worm in a 10 m
tile (one draw), fading out from 3.5 to 4.5 m. Each item shrinks near the rendered spine so no
part of it comes within 0.2 m of it.

Menu descriptions, one line each:
- Low: "Fewest leaves, simple light. For slow computers."
- Medium: "More leaves and soft light effects."
- High: "Lots of leaves and full effects. Best for most school Chromebooks."
- Ultra: "The most leaves and the sharpest picture. For fast computers."
- Auto: "Starts on High and lowers detail if the game slows down."

### 4.2 Applying a preset
Changing a preset applies live, with no reload and no shader recompiles during play. Counts use
draw ranges or `mesh.count`. Effects use visibility. Resolution uses `setPixelRatio`. All meshes
are built at Ultra size once, at startup, so switching up never allocates during play.

### 4.3 Auto
- Auto starts at `autoSettled` if saved, otherwise High. Built: a new session starts one step
  above `autoSettled` (Low → Medium, Medium → High, High stays High, never Ultra) and steps down
  within seconds if it is still slow, so one slow session (battery saver, a busy machine) cannot
  pin a Chromebook at Low for good. Re-choosing Auto in the menu starts at `autoSettled` itself.
- It uses the existing `QualityController` timing: under 29 fps for 2 s steps down one preset, with
  a 3 s cooldown. Order: High → Medium → Low. It never steps up within a session.
- Auto never chooses Ultra.
- When it steps down, it saves the new preset as `autoSettled`.
- Picking a preset in the menu sets `graphics` to it, which turns Auto off. Picking Auto turns it
  back on and starts from `autoSettled`.
- Speed test mapping for **Use recommended setting**: the auto phase's final tier maps tier 0 →
  High, 1 → Medium, 2 → Medium, 3 → Low. Built: never above the preset the test measured (High,
  unless forced with `?preset=`), so a test forced to Low never recommends High. A test of Ultra
  keeps the tier mapping, since Auto never picks Ultra either.

## 5. Leaves and the worm under and over

### 5.1 Litter depth
`src/surface/litterDepth.ts` exports a pure `litterDepth(x, z): number` in metres, from 0.01 to 0.25.
- About 0.02 (one leaf) in the open and on rises.
- Deeper in terrain hollows (from `terrainHeight` curvature).
- Drifts against trunks, rocks and the fallen log (downwind side deeper), and 4 to 6 windblown piles.
- Deterministic, bounded, continuous. Leaf placement uses it: deeper places get more leaves,
  stacked higher.

### 5.2 Worm surface height
`src/worm/surfaceHeight.ts` exports a pure `wormSurface(x, z): { y: number; under: number }`.
- `under` is 1 when `litterDepth < 0.06` (the worm crawls on the soil beneath the leaves) and 0
  when `litterDepth > 0.12` (it rides on top). It blends smoothly between those depths.
- `y` = `terrainHeight` + `litterDepth × (1 − under)`.
- On Low (leaf reaction off), `under` is forced to 0, so the worm always rides on top.
- Each body segment uses it, so the worm visibly climbs onto a pile head first.
- The contact shadow follows the same surface. The camera stays above the litter top plus its
  existing margin.
- Leaves between the camera and the worm's head fade to 40% opacity (a dithered fade, so no extra
  transparent pass) so the worm stays readable. Built as a screen-space fade along the whole
  visible body, not just the head: each frame the body's axis is projected once, and a leaf pixel
  near it on screen and in front of it is dropped by a fixed dither (60% of its pixels where the
  leaf stands clear of the body, 40% where it lies on it, so a worm under thin litter still reads
  as under). The litter, detail and hero leaves and Ultra's near clutter fade; High's other
  props (mushrooms, plants, rocks) do not. Known limitation: at device pixel ratio 1 the dither
  shows as a stipple.

### 5.3 Disturbance map (approach A)
`src/surface/disturbance.ts`: a 64×64 grid covering 8×8 m, centred on the worm and scrolled in
whole cells as it moves. Each cell holds a push direction (x, z), a lift amount and a weight.
- Each simulation step stamps along the body: cells under the body get lift (higher when `under`
  is high) and a push away from the spine. The head stamps hardest.
- Each step every cell decays toward zero with a half-life of about 6 s, so a trail settles back
  in about 20 s.
- Scrolling moves the data with the grid and clears the newly exposed edge; nothing doubles.
- It is uploaded once per rendered frame as a small `DataTexture`. Leaf vertex shaders sample it
  near the worm: under the body, leaves lift into a soft drape about one body-width high; beside
  it, they tilt and slide outward; behind it, they show the settling furrow.
- When the preset turns leaf reaction off (Low), stamping stops and the texture is cleared.

Built differently (per-vertex lift tore leaves into tents and clipped through the worm):
- Each cell holds path nearness (1 on the path, falling linearly to 0 at 1.6 m, kept until the
  trail there settles), body nearness (cleared and re-stamped from the body every step, so the
  drape follows the body exactly) and trail freshness (halving every 6 s; the cell is cleared
  once it drops below 0.01). A segment riding on top of the litter stamps as if 1.4 m farther
  away, so the leaves under it stay put.
- Leaf shaders read back distance and direction (5 fetches) and move each leaf as one rigid
  piece. Along a fresh trail a leaf slides out until its near edge is 0.14 m from the path (at
  most 0.2 m), easing back as the trail fades. A leaf reaching over the body tilts up onto it,
  far edge on the litter and its plane clear of the body's top (0.265 m above the ground near the
  spine, easing to nothing 0.34 m out); one centred on the body rests level on top. No leaf leans
  steeper than 45°: a small leaf close beside the body leans on it, far edge raised, instead of
  standing upright.
- Each vertex carries its dip below the leaf's rest plane (tilt, curl, uneven ground). A lifted
  leaf raises those parts to the plane, so no part of it cuts into the body. Checked on the real
  litter: no worm vertex within 5 mm of a leaf over it in 400 placements.
- The ground darkens the bared soil along a fresh trail (35% darker), fading with the trail.

### 5.4 Hero leaves (approach B, up close)
`src/surface/heroLeaves.ts`: a pool of physics leaves lying loose on top of the litter within 3 m
of the worm's head. The pool size comes from the preset.
- Each leaf has a position, yaw, flip angle, and linear and angular velocity. Simple damped
  physics, run every step:
  - the head or body pushes a leaf it overlaps, harder at the head;
  - a strong push lifts one edge, so the leaf flips over;
  - the leaf slides with friction and settles on `terrainHeight + litterDepth`;
  - it never goes below that surface.
- A leaf more than 4 m from the head is recycled to a free spot ahead of the worm, chosen
  deterministically.
- All hero leaves are drawn as one instanced mesh with the same leaf material (species shapes,
  veins).

Built: the body is a row of pushers, each with a position, radius, strength (the head hardest),
top height, `under` amount, belly height and `fall` (how far the top drops to its side).
- A pusher crawling under the litter does not shove. A leaf that reaches it rides over it as a
  rigid plate, tilted down away from the body (at most 35°) with its far edge on the litter and
  clear of the body's top by 1 cm, and settles back once the worm has passed.
- A pusher whose belly is above a leaf passes over it and presses it flat; it springs back after.
- A leaf the head turns over swings up clear of the body.
- Leaves are kept out of the trunks (with their root flare), rocks and the log, and are recycled
  if wedged there or pinned against the body in a tight coil for too long.

### 5.5 Detail leaves
A second leaf layer of smaller, more curled, higher-vertex leaves covers a 6 m radius around the
worm. It reuses the Step 0 species shapes. It is built once, and its centre snaps to a 1 m grid as
the worm moves (re-placed in the shader from a seed, so the CPU does no work). It fades out from
5 to 6 m into the base litter. It also reads the disturbance map.

Built: each leaf has a fixed home in a repeating 13 m world tile, and the shader draws the copy
nearest the worm's 1 m-snapped position, so a leaf only jumps once it has faded out. Leaves lie on
the rendered ground (a baked ground-height texture, the surface the worm rests on), in the loose
litter above the mound (a baked litter texture), and move as rigid pieces like the litter. They
are small: radius 0.11 to 0.385 m (scale 0.21 to 0.62, against the litter's 0.6 to 1.9), because
the layer's cost is its area on screen.

### 5.6 Realism check
After approach A is built, close-up screenshots are judged:
- the worm under thin litter;
- the worm climbing a pile;
- a trail settling;
- leaves draping over the body.

If the close-ups look fake, the hero-leaf share grows (larger pool, wider radius) within the
performance gates.

Checked in Step 1a on High and Ultra (close-ups of each case above, plus a hero leaf flipped by the
head and a tight turn). The worm reads as under thin litter, climbs piles head first, and hero
leaves flip at the head and ride over the body (their clearance is unit-tested). The hero pool
was not grown: the gates have little room, and the weak spots below are not about hero leaves.
Known limitations:
- Big litter leaves lifted over the body are rigid, so they hover over it like lids (up to 0.265 m
  up) instead of bending. A real fix is a soft drape that bends a leaf over the body without
  tearing it (rejected per vertex in Task 13); not attempted here.
- In a tight turn, leaves inside the curve lift on both sides of the body and form a ring. The 45°
  cap keeps small leaves from standing upright, but the ring stays.
- The trail is subtle from the follow camera: the worm lies on most of its fresh path and the rest
  is behind the camera; the slide (at most 0.2 m) and the darker soil are hard to see under the
  detail leaves. A stronger darkening (0.6) was tried and did not read better.
- The occluder fade's dither shows as a fine stipple at device pixel ratio 1.

## 6. Performance

Gates are measured with the Step 0 headless benchmark (SwiftShader, 1366×768, uncapped "full"
phase) after forcing each preset with `?preset=`:

| Preset | Uncapped fps (gate) | Relative gate (× Step 0) | Draw calls per frame | Triangles per frame |
|---|---|---|---|---|
| Low | ≥ 50 | ≥ 1.09 | ≤ 40 | ≤ 90k |
| Medium | ≥ 40 | ≥ 0.87 | ≤ 40 | ≤ 170k |
| High | ≥ 34 | ≥ 0.74 | ≤ 40 | ≤ 240k |
| Ultra | ≥ 28 | ≥ 0.61 | ≤ 40 | ≤ 350k |

- **Relative gates (approved in Step 1a).** The absolute gates were set against Step 0's 45.9 fps
  on a quiet machine. On a loaded machine absolute numbers drift, so each preset is compared with
  Step 0 built from `main` and benchmarked in the same session: runs are interleaved (Step 0,
  preset, preset, Step 0, ...), each preset run is divided by the Step 0 run next to it, and the
  median of at least 4 such pair ratios must reach the old gate divided by 45.9.
- **Draw calls ≤ 40 on every preset (authorized in Step 1a).** The base litter is drawn in 6 × 6
  chunks, so the old 14 to 18 budget no longer fits; 40 is Step 0's limit.
- Measured with the final counts (4 pairs each, Step 0 at 33 to 40 fps on a loaded machine):

| Preset | Pair-ratio median | Draw calls | Triangles |
|---|---|---|---|
| Low | 1.60 (Low hits the 60 fps display cap) | 25 | 66k |
| Medium | 1.17 | 31 | 109k |
| High | 0.80 | 33 | 113k |
| Ultra | 0.65 (at device pixel ratio 1) | 32 | 140k |

- How the litter got cheap enough: 6 × 6 chunks with frustum culling and near-first order, a
  6-triangle leaf for chunks more than 9 m from the camera (11 m to switch back), the painted noise
  sampled per vertex, and smaller detail leaves. Each chunk picks one of three programs made once
  at startup, by swapping its material (never a recompile): chunks whose bounds may meet the
  occluder fade's hull or the disturbed part of the map use the reacting program (disturbance map
  and fade); other near chunks use a plain one; distant chunks use the 6-triangle leaf with no
  veins or sheen.
- The fps gates are the hard requirement.
- The leaf counts in 4.1 are tuning targets. If a gate fails, counts are lowered (and this spec's
  table updated) before anything else is cut.
- No shadow maps, post-processing passes, extra render targets or MSAA (unchanged from Step 0).
- No allocation in new per-frame/per-step code; the Step 0 helpers stepWorm/stepFollowCam still
  return small objects per step.
- The disturbance map upload is the only per-frame texture upload.

## 7. Testing

**Unit (Vitest), written first:**
- Presets: every field present; cost increases from Low to Ultra; Auto order and the speed-test
  tier mapping.
- Settings store: round trip; corrupt JSON, wrong version and throwing storage all fall back to
  defaults.
- `litterDepth`: deterministic, within [0.01, 0.25], deeper in hollows and beside trunks and the
  log than in the open, continuous.
- `wormSurface`: under on thin litter, on top of deep piles, smooth blend, always finite.
- Disturbance map: stamping, decay timing, scrolling with no loss or doubling, clearing.
- Hero leaves: always finite, come to rest, flip under a strong push, never sink below the
  surface, recycle when far.
- Screens: every transition in 3.1, including tab-hidden → pause and Use recommended setting.

**Browser (Playwright):**
- Carried over: offline with zero network requests, CSP present, the no-WebGL FAIL card.
- Keyboard only: from Start reach Crawl, Graphics and Speed test; change the preset; pause with
  Esc and resume.
- A chosen preset is still selected after reload.
- Switching presets during Crawl causes no page errors.

**Visual:** the close-ups in 5.6, checked by the implementer, the reviewer and Matt.

## 8. Done means

- All unit and browser tests pass, and every gate in section 6 holds.
- The speed test still works from the menu, and Use recommended setting applies a preset.
- On wormsimulator.com, a student can crawl, pause, switch presets, and watch the worm slip under
  thin litter, climb over piles, push hero leaves over and leave a trail that settles.
