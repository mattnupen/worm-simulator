# Step 1, Sub-project 1: Game Shell and Forest Floor v2, Design

Date: 2026-10-01
Status: Approved in brainstorming, awaiting written-spec review
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
| Base leaf litter | 1,000 | 2,500 | 4,000 | 6,000 |
| Detail leaves around the worm | 0 | 800 | 1,500 | 2,500 |
| Hero physics leaves | 0 | 12 | 24 | 32 |
| Leaves react to the worm (drape, trail, under/over) | off: the worm rides on top | on | on | on |
| Light shafts, dust, falling leaves | off | on | on | on, with 1.5× dust and falling leaves |
| Ground clutter | 50% | 100% | 100% | 100% plus extra near the worm |
| Rim light | off | on | on | on |

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
- Auto starts at `autoSettled` if saved, otherwise High.
- It uses the existing `QualityController` timing: under 29 fps for 2 s steps down one preset, with
  a 3 s cooldown. Order: High → Medium → Low. It never steps up within a session.
- Auto never chooses Ultra.
- When it steps down, it saves the new preset as `autoSettled`.
- Picking a preset in the menu sets `graphics` to it, which turns Auto off. Picking Auto turns it
  back on and starts from `autoSettled`.
- Speed test mapping for **Use recommended setting**: the auto phase's final tier maps tier 0 →
  High, 1 → Medium, 2 → Medium, 3 → Low.

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
  transparent pass) so the worm stays readable.

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

### 5.5 Detail leaves
A second leaf layer of smaller, more curled, higher-vertex leaves covers a 6 m radius around the
worm. It reuses the Step 0 species shapes. It is built once, and its centre snaps to a 1 m grid as
the worm moves (re-placed in the shader from a seed, so the CPU does no work). It fades out from
5 to 6 m into the base litter. It also reads the disturbance map.

### 5.6 Realism check
After approach A is built, close-up screenshots are judged:
- the worm under thin litter;
- the worm climbing a pile;
- a trail settling;
- leaves draping over the body.

If the close-ups look fake, the hero-leaf share grows (larger pool, wider radius) within the
performance gates.

## 6. Performance

Gates are measured with the Step 0 headless benchmark (SwiftShader, 1366×768, uncapped "full"
phase) after forcing each preset with `?preset=`:

| Preset | Uncapped fps (gate) | Draw calls per frame | Triangles per frame |
|---|---|---|---|
| Low | ≥ 50 | ≤ 14 | ≤ 90k |
| Medium | ≥ 40 | ≤ 16 | ≤ 170k |
| High | ≥ 34 | ≤ 16 | ≤ 240k |
| Ultra | ≥ 28 | ≤ 18 | ≤ 350k |

- The fps gates are the hard requirement.
- The leaf counts in 4.1 are tuning targets. If a gate fails, counts are lowered (and this spec's
  table updated) before anything else is cut.
- No shadow maps, post-processing passes, extra render targets or MSAA (unchanged from Step 0).
- No per-frame allocation in render or step paths.
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
