# Step 1b: Leaf Jitter Fix, World Scale Modes, and Level 1 "First Bite", Design

Date: 2026-10-03
Status: Part 0 and Part A are built (V1 · True Size, section 4.7); Part B is next
Parent spec: `docs/superpowers/specs/2026-09-30-worm-simulator-design.md` (sections 3.2, 3.3, 3.4, 5, 6, 8.3)
Previous round: `docs/superpowers/specs/2026-10-01-game-shell-and-forest-floor-v2-design.md`

## 1. Why

Matt playtested Step 1a on student Chromebooks ("It did pretty good") and flagged two things:
leaves jitter when the worm moves under them, and props are too small next to the worm. This round
fixes both, then builds sub-project 2: eating, growing, Moisture, and a playable Level 1.

Matt chose **full true scale** for props and leaves, but wants students to help make the final
call. So scale is a **setting with three modes**, built so the final decision is a one-line default
change and the unused modes can be deleted without rework.

The round has three parts, built in this order, each with its own plan:
- **Part 0, leaf jitter:** done and committed (section 3).
- **Part A, world scale modes** (section 4).
- **Part B, core loop, Moisture and Level 1** (section 5).

## 2. Decisions made in brainstorming

| Question | Decision |
|---|---|
| Prop scale | Full true scale, offered as a setting so students can compare and vote |
| Leaf size | Full true size (in True mode) |
| Where students switch scale | A **World scale** button on the Start screen |
| Default on a fresh device | **True** |
| Modes | Three: **Classic** (today), **Hybrid**, **True** |
| Worm meets a trunk, rock or log | **Blocked, slides along it** (in every mode) |
| Eating | **Action takes a bite** (Space, or the on-screen Action button) |
| Progress toward the goal | A **small length ruler** next to the Moisture bar |
| Read-aloud | **Yes now:** the goal and the level-end text, with word-highlighted captions |
| Start screen | **Play** (Level 1) and **Free crawl** (today's roam), then World scale, Graphics, Speed test |

## 3. Part 0: leaf jitter (done)

Committed as `02b5a7a` and `92f1c61` on branch `step1b`, measured before fixing.

- **How it was measured:** the real crawl was replayed with realistic frame timing (a 60 Hz display
  with uneven frames, 60 Hz steps, the 30 fps cap). Real litter vertices and the hero leaves were
  tracked on screen at 1366 × 768. The metric is how often a point turns back between frames: the
  back-and-forth that reads as jitter, as opposed to fast but smooth lifting.
- **Causes, in order of size:**
  1. The body was stamped into the disturbance map as points 11 cm apart. As they slid past a
     leaf, its reading of the body scalloped at about 15 Hz.
  2. A hero leaf tilted away from the nearest of those points, so its tilt direction swung and
     snapped every step.
  3. 8-bit packing rounded the map in 6 mm steps.
  - Two suspects were measured and ruled out. Re-stamping the body at render time made no
    difference, and step-versus-render timing was not a cause.
- **Fix:**
  - The map stamps the segments joining the body points, so it holds the true distance to them.
  - Path and body nearness are packed in two bytes each, in one RGBA8 texture. Linear filtering
    keeps high + low / 255 exact. The trail, plus the path again in one byte for the ground,
    goes in a small RG8 texture, so each reacting leaf makes one more texture fetch.
  - Measured per channel: path and body each need about 10 bits or more, and the trail is fine at
    6 bits. Half floats were tried first, but cost 4% fps on High in the software-rendered gates.
  - A hero leaf tilts away from the nearest point on the spine itself.
- **Result:**

| | Before | After |
|---|---|---|
| Litter: frames turning back > 0.5 px | 4.2% | 0.6% |
| Litter: p99 turn-back | 1.67 px | 0.28 px |
| Hero leaves: frames turning back > 2 mm | 6.8% | 2.0% |
| Hero leaves: p99 turn-back | 28 mm | 4 mm |

- Regression tests: `tests/unit/leafJitter.test.ts`. The clearance tests stay at 0 violations, and
  all 529 unit and 22 e2e tests pass.
- **Performance:** an A/B benchmark on High, interleaved with the pre-fix build, shows no cost:
  median 32.3 fps against 32.2. The full gates were re-run on the final build (results in the
  round's report).
- **Known limit:** hero leaves resting over the body still change their tilt *amount* slightly
  between steps (about 0.5% of samples turn back by more than 5 mm). The best-tilt search steps
  between nearby solutions. Leaf sizes change in Part A, so this gets re-measured there.

## 4. Part A: World scale modes

### 4.1 The modes
Reference: the worm is 3.5 units long, standing in for a 15 cm earthworm, so **1 cm ≈ 0.23 units**.
The worm, its speed and the camera stay the same in every mode. The world stays 40 × 40 units
(about 1.7 m of real forest floor). Only the forest around the worm changes.

| Thing | Classic (today) | Hybrid | True | Real size used for True |
|---|---|---|---|---|
| Litter, detail and hero leaves | as now (0.6–1.9 u) | as now | per species, real length | aspen 5.5 cm, ash leaflet 8, sugar maple 11, basswood 12, red oak 15 cm |
| Mushrooms (honey, russula) | cap ~0.5 u | ×3 (true) | ×3 | caps 5–8 cm |
| Rocks | 0.45–1.4 u | ×4 (true) | ×4 | stones 10–40 cm |
| Ferns, sedge | ~1 u tall | ×7 (true) | ×7 | fronds 30–40 cm, sedge blades 20 cm |
| Fallen log | radius 0.32 | ×4.5 (half true) | ×9: radius ~2.9, runs off the world's edge | 25 cm across, metres long |
| Trunks (birch, maple) | radius 0.32 / 0.48 | ×4.5 (half true) | ×9 / ×11 | birch 25 cm, sugar maple 45 cm across |
| Near trunks in the world | 14 | ~5 | 2 (near the edges) | trees stand metres apart |
| Distant trees | as now | scaled to match | scaled to match | |

- Classic is exactly today's world, so the Chromebook results and Step 1a's gates still describe it.
- Litter **depth** stays as it is in every mode (about 1 cm real; real fall litter is 2–5 cm). It
  drives the under-and-over system, so changing it is a separate decision for later.

### 4.2 One scale table
- `src/surface/worldScale.ts` holds one `ScaleSpec` per mode: a multiplier for each kind of thing,
  plus that mode's prop and tree layout (counts, seeds, the log's placement).
- Every size and placement module reads from the active `ScaleSpec` instead of its own constants:
  - `propGeometry`, `groundProps` and `propPlacement`;
  - `treeSites`, `trunkGeometry`, `forestTrees` and `distantTrees`;
  - `leafLitter`, `detailLeaves` and the hero leaf spawn;
  - `heroObstacles`, `nearClutter` and `treeShadows`.
- Nothing outside this table knows which mode is on. Picking the final mode means changing
  `DEFAULT_SCALE`; deleting a mode means deleting its table entry.
- **Leaf counts scale with leaf area:** bigger leaves mean fewer of them for the same cover
  (`count ∝ 1 / size²`), so overdraw and fill rate stay about the same. The preset table in
  `graphics.ts` gives Classic counts; other modes derive theirs from them.

### 4.3 Switching modes
- **Start → World scale** opens a panel with three large choices. Each has a name and one line:
  - Classic: "The forest as it is now."
  - Hybrid: "Small things real size, big things half."
  - True: "Everything real size, next to a real worm."
  - The choice is saved on the device and the panel has a Back button. It follows the menu rules:
    real DOM, text at least 18 px, contrast at least 7:1, a 4 px focus ring, targets at least
    48 px, deliberate focus moves, an `aria-live` status.
- Changing mode **rebuilds the forest** behind the Start screen. The old geometries are disposed,
  the new ones are built from the new `ScaleSpec`, the crawl is reset to the spawn, and the status
  reads "Building the forest…" while it works.
- **No shader recompiles from switching.** Materials and programs are shared across modes. The
  disturbance map and drape numbers are sized once for the largest leaves (True):
  - the map's reach covers the biggest true leaf's radius plus the drape's foot;
  - its span grows to cover the body plus that reach on both sides.
  - Classic behaves the same with a longer reach, because the drape and slide distances are
    measured from the worm, not from the leaves.
- Settings: `wormsim.settings` gains `scale: "classic" | "hybrid" | "true"`, default `"true"`. It
  stays version 1, and a missing or unknown value reads as the default.
- The URL accepts `?scale=classic|hybrid|true` for tests and the gates. It overrides the saved
  value for that visit without changing it.
- The speed test runs in the device's current mode, and its report names the mode.

### 4.4 Solid props and the camera
- **Trunks, rocks and the log block the worm in every mode:**
  - Their footprints are circles for trunks and rocks, and a capsule for the log. They are
    generalised from `heroObstacles.ts` into `src/surface/obstacles.ts` and built from the
    `ScaleSpec`.
  - After each step, the head and then each body point are pushed out of any footprint, widened by
    the body's radius, along the footprint's normal. The worm slides along an edge instead of
    stopping dead, and the body never cuts through.
  - Hero leaves keep their own unwedging, now using the same footprints.
- **Clear paths:** in every mode, props stay clear of the speed test's auto-drive loop and
  corridor, the spawn and Level 1's zones (5.5). Tests check this for each mode. *(V1: Level 1
  does not exist yet, so its zones are checked in Part B's plan.)*
- **The camera stays out of props.** If the line from the head to the camera's target position
  crosses a footprint taller than the line there, the camera slides in toward the head to stop just
  short of it. It eases in and out with the existing smoothing: no snaps and no shake.
- Clutter (mushrooms, ferns, sedge) is not solid. The worm passes through and between it, and Ultra's
  near clutter keeps its existing keep-clear behaviour.

### 4.5 Leaves at true size
- Litter, detail and hero leaves use each species' real length in True.
- The drape, the slide and the hero-leaf clearance already work from the worm's size and each
  leaf's own radius. Part A re-runs every clearance test **in every mode**, and all must stay at 0
  violations.
- Re-measure jitter (Part 0's tests) in True, and keep its thresholds.
- Expected look: in True a single leaf can cover most of the worm. The "big leaf lifts like a lid"
  limitation from Step 1a will show more, and is recorded with screenshots for Matt and the students.

### 4.6 Performance (Part A)
- The gates must pass in **True** (the default) and in **Classic**:
  `npm run build && node scripts/perf-gates.mjs 4` runs both. The script gains a scale argument
  and runs True by default.
- Hybrid is benchmarked once on High and reported.
- If True fails a gate, the order of cuts is: leaf counts, then clutter counts, then distant-tree
  detail. Each cut is recorded in this spec.
- Draw calls stay at 40 or fewer, with no shadow maps, post passes or extra render targets.

### 4.7 As built (V1 · True Size)

Built by `docs/superpowers/plans/2026-10-03-v1-true-size.md` on branch `step1b` (`5903ca2` to
`5ad125d`). This records what differs from 4.1 to 4.6, what the reviews decided, and what was
measured.

**Classic is Step 1a.** Its layout, props, trees, distant ring, clutter and litter depth are
byte for byte Step 1a's. Hash tests (`tests/unit/propPlacement.test.ts`, `scaledProps.test.ts`)
pin every field, attribute, index and instance. A scratch comparison proved them equal to
`355e777`, the last commit before Part A. (The test comments name `7ce8936`, a later Part A
commit that draws the same Classic bytes; `355e777` is the true baseline.) There are two
deliberate exceptions:
- **Litter that sank.** 47 litter leaves that tipped into the ground at a mound's edge are re-laid
  at the terrain mesh's slope. Any vertex still under the rendered ground is draped onto it:
  about 4.7% of full-leaf vertices move, by up to 0.5. Colours, UVs and indices are unchanged.
- **Bigger hero-leaf footprints.** Hero leaves now use the drawn props' footprints (below), which
  are bigger than Step 1a's.

**Layouts** (`src/surface/worldScale.ts`):

| | Classic | Hybrid | True |
|---|---|---|---|
| Near trees | 14 (seed 7, at least 4 from the spawn) | 5 (seed 15, at least 12.5) | 2 in the corners (seed 284, at least 18) |
| Rocks | Step 1a's 7 | 5 new sites, ×4 | 5 new sites, ×4 |
| Log | (3.9, 4.7), 4.4 long | (9, 9), turned −0.6, 19.8 long | across the view at z = 15.5, 39.6 long: a wall whose ends (x ≈ ±21.4) lie past the play area |
| Clutter items | 64 | 24 | 24 |
| Distant ring | 72 trees | 24, ×4.5 | 14, ×9 |

**Props as drawn.**
- Trees scale in height, girth, lean, limbs, peeling curls (normals included), root collar and
  crown. The bark pattern grows with the trunk, so a True birch doesn't read as a picket fence.
  The bark noise uses a flat seed, so branch scars don't break into speckles.
- A grown fern has 14 broader leaflet pairs a frond instead of 8.
- A grown log's broken ends are jagged at its size (`LOG_END` per unit of growth).
- **Clutter in grown modes:** an item's *base* keeps off rocks and the log, but fronds may lean
  over them.
- **Log-side mushrooms in grown modes:** clusters wander along the log and stand off it by
  varied amounts. A cluster that would overlap an earlier one is moved or skipped, which leaves
  True 2 and Hybrid 3.

**Solid props** (`src/surface/obstacles.ts`).
- **Footprints are measured from the drawn meshes:**
  - trunk root flare: 0.52 (birch) and 1.08 (maple) per unit of trunk size, about 0.95 for a
    birch clump;
  - rocks: 1.2 × their size;
  - the log: 1.15 × its radius, plus `LOG_END` at its broken ends.

  The worm, the camera, the hero leaves and clutter placement all use them.
- **Collide and slide.** The head moves by `slideMove`. Each footprint it meets becomes an edge
  line, and the head takes the nearest move that keeps behind every edge: it slides along one
  edge and rests exactly in a notch. The play area's edges count as fixed edges, so a slide never
  carries the head out.
  - Body points use `pushOut` only, which also stays as the head's safety net.
  - The worm keeps off props by `WORM_HALF_WIDTH` (about 0.1335, the drawn body at full-speed
    swell), not the hand-set 0.13.
- **Classic's straight run.** Step 1a's maple at (1.92, 8.27) keeps its place. Its footprint
  reaches about 0.28 into the far corner of the speed test's corridor; the straight line x = 0
  keeps 0.84 clear. Hybrid and True keep clear by distance.
- **Clear paths:** the speed test's loop, its corridor and the spawn are checked in every mode.
  Level 1's zones wait for Part B.

**Camera** (`src/game/cameraClearance.ts`; 4.4 described one sight line).
- **Sight lines.** It checks a fan of 3 lines from the head (the middle one, and one 0.5 rad to
  either side) and stops 0.35 short of a prop taller than the line.
  - A side line pulls the camera in to at most 0.8 of what the middle line allows
    (`CAM_SIDE_FLOOR`), unless the camera is swinging toward it within 0.5 s. So brushing past a
    trunk barely pulls it in.
- **Easing.** The reach follows a critically damped spring: it settles in 0.25 s pulling in and
  1 s easing out.
- **No snaps.** The camera itself is pushed out of tall props, at least 0.15 away, instead of
  being clamped along its line.
- **Crane.** As it pulls in, the camera cranes up (its height grows by 25% at reach 0) and aims
  down over the body. Below reach 0.3, its "up" blends from the sky to the worm's forward, so
  forward stays at the top of the screen when it looks almost straight down.

**Disturbance map** (`src/surface/disturbance.ts`, `leafScale.ts`).
- **Size.** 96 × 96 cells over 12 m (12.5 cm cells, as before), with a reach of 3.65, sized once
  for True's biggest leaf.
- **Per-mode settings** (`disturbReach`):
  - Stamp limit: the leaves' reach plus a lookup's spread. Classic is 1.9 m; True is capped at
    3.65.
  - On-top offset: the reach minus 0.2. Classic is 1.4, as in Step 1a; True is 3.2.
  - Fade window: a `uDistFade` uniform at 85–97% of 2.5 × the reach, capped at the half span.
    Classic is 3.4–3.88 m, Step 1a's window.

  A switch changes only uniforms, so nothing recompiles.
- **Lid rule.** A leaf lifts more and more level from radius 1.3, fully by 2.0. Only True's
  leaves are that big. GPU parity covers big leaves.
- **Cost, in every mode:** decay and packing are about 2.25× (the whole 96² map), and the upload
  grows from 24.6 to 55.3 KB a frame. Classic's stamp takes 65–70 µs against 46–48.
- **Classic trails** are kept up to 6 m and faded by the shader. Turning back within about 40 s
  fades an old trail back in smoothly, which Step 1a did not do.

**Leaves at true size.**
- **Sizes.** Each species' factor (aspen 1.43 to oak 2.43) applies to litter, detail and hero
  leaves. Litter is real length on average. Detail and hero leaves keep their Classic share of
  it, so they are smaller than real (a deviation from 4.5).
- **Counts** follow 1 / silhouette area. True draws 395 litter leaves, and 8 hero leaves on
  Ultra instead of 32.
- **No big-leaf slowdown.** A slowdown for leaves over 1 m (by 1/L³, then 1/L⁴) left them
  floating for seconds, so it was removed. Jitter is measured on True's real 8 hero leaves:
  2.1–2.2% of frames turn back by more than 2 mm, with a p99 of 4.2–4.5 mm (thresholds 3% and
  6 mm). Litter passes Part 0's thresholds in True as in Classic.
- **Clearance.** Hero gap medians are at most 0.12 m in every mode (True 0.105). The clearance
  tests are at 0 violations in every mode.
- **No sinking.** In every mode, no open-ground litter vertex lies below the rendered ground:
  - A leaf that sinks more than 5 cm is re-laid at the mesh's slope, but only when that sinks it
    less. True keeps the original pose for 8 of 54 such leaves and Hybrid for 2 of 60; all 47 of
    Classic's improve.
  - The largest drape left is 0.10 (Classic, Hybrid) and 0.20 (True).
- **Not scaled:** Ultra's near clutter, whose shader is bounded by `NEAR_CLUTTER_REACH`.

**Hero leaf respawn** (`src/surface/heroSpawn.ts`, `heroPool.ts`).
- **Ahead first.** Wider tries stay within a quarter turn of the heading. The ring fallback
  searches straight ahead, then alternately left and right, all of the front half (every half
  ring) before any of the back.
- **Never stacked.** Each leaf shifts the ring spots by its own amount (inward by up to half a
  ring, and turned by up to half a spot in front or a whole spot behind). No two leaves land
  within 0.15 m.
- **Grow-in.** A new leaf grows in over 0.3 s (`HERO_GROW_IN`), eased and allocation-free, in
  every mode.

**Switching** (`src/game/world.ts`, `scalePicker.ts`).
- **One entry point.** `World.switchForest` frees the old forest (the distant ring included) and
  builds the new one from the spec. It compiles the new forest while the old one still holds its
  programs, so a switch compiles 0 shaders (the e2e test counts `compileShader`), and memory
  stays stable (it counts `deleteBuffer`). The detail layer is recreated, and the crawl's stamp
  limit is refreshed.
- **`ScalePicker`.**
  - A pick is built 400 ms after the last one. Leaving the screen builds a waiting pick at once,
    after "Building the forest…" has painted.
  - Then the status reads "The forest is ready: True."
  - A rebuild that throws shows the crash card.
  - A pick is saved only if it is a real change: it differs from the mode in effect when the
    screen opened, or a scale is already stored. So a device that never chose follows
    `DEFAULT_SCALE` (True).
- **Settings:** `scale` is added to `wormsim.settings`, which stays version 1, and every write
  keeps fields it doesn't know. `?scale=` overrides the saved scale for one visit.
- **Start:** Crawl, World scale, Graphics, Speed test (Play and Free crawl come with Part B). The
  speed test's report names the world scale.

**Performance (4.6).** `node scripts/perf-gates.mjs 4` was run on 2026-10-03 on the final code
(`f2de2c5`). Every gate passes, with no cuts.

| Preset | Gate | True median | Classic median | Draws (True / Classic) |
|---|---|---|---|---|
| Low | 1.089 | 1.508 | 1.511 | ≤ 25 / ≤ 26 |
| Medium | 0.871 | 1.442 | 1.135 | ≤ 30 / ≤ 32 |
| High | 0.741 | 0.921 | 0.742 (thin) | ≤ 31 / ≤ 31 |
| Ultra | 0.610 | 0.755 | 0.632 | ≤ 33 / ≤ 31 |

Hybrid on High: median 0.751, with at most 33 draws. Classic High clears its gate by only 0.001;
watch it.

**Known limits** (for Matt and the students; screenshots in `docs/codev/versions/v01-true-size/`):
- big leaves lift like lids over the worm, most in True (`true-lid.jpg`);
- True's near floor reads a bit sparser and flatter, because the same leaf area is spread over
  fewer, bigger leaves;
- big leaves show straight polygon edges up close;
- the distant trees are plain pale columns;
- Hybrid's log ends read as angled cuts (the 12-point jag is coarse);
- a fast camera pull-in can swing the view briefly, by 0.05–0.085 rad a step for a fraction of a
  second;
- sliding round a big trunk can briefly show the worm through the trunk's edge (at most about
  half a second).

**Deferred** (none blocks V1):
- code tidying:
  - `obstacleDepth`'s `deepestId` side channel;
  - freezing the cached layout arrays;
  - a shared `LITTER_MEAN_SCALE` for the hand-typed True leaf factors;
  - moving `LOG_END` to `trunkShape.ts`;
  - `geometryHash` using `byteOffset` / `byteLength`;
  - pointing the hash comments at `355e777`;
- the log's look:
  - more log rings when grown (True's 40-unit log has slight kinks at 4-unit segments);
  - Classic's log seam is about 7 cm, not the "hairline" its comment says;
- a `pagehide` save, so a pick made within 400 ms of closing the tab isn't lost;
- `src/game/crawl.ts` (342 lines), `obstacles.ts` (374) and `src/main.ts` (415) are over the
  ~260-line guide;
- a Step 1a build open in an old tab drops a picked scale when it saves (harmless: that device
  then follows the default);
- the "World scale" legend isn't a real heading for screen-reader heading navigation (the same as
  the Graphics screen);
- `pushOutTall` could bounce between two trunks closer than 0.3 (never seen).

## 5. Part B: Core loop, Moisture and Level 1 "First bite"

### 5.1 Screens and flow
- **Start:** Play, Free crawl, World scale, Graphics, Speed test.
- **Play → goal card:**
  - The title "Level 1: First bite" and the goal "Eat leaves. Stay in the shade.", read aloud with
    captions (5.7).
  - A **Start** button, which takes focus.
- **Level:**
  - The HUD (5.4), the Pause button, the joystick, and on touch screens a large **Action** button
    (at least 64 px, bottom right).
  - Pause works as in crawl: Esc, P, the Pause button, or the tab being hidden. The Pause menu adds
    **Restart level**.
- **Too dry:** the worm doesn't die and there's no game-over screen.
  - A short caption reads "Too dry! Back to the damp shade." and is read aloud.
  - The view fades (or cuts, with reduced motion), and the worm returns to the last checkpoint with
    full Moisture.
- **Level complete card:**
  - "You grew to full length!", then two short sourced facts (5.6) and the label "Game choice: real
    worms grow much slower than this."
  - The text is read aloud with captions.
  - Buttons: **Play again** and **Back to start**.
- **Free crawl** is today's crawl: no food, no drying, no HUD. It's for exploring and comparing
  scale modes.

All new screens are DOM, follow the Step 1a menu rules, and live in `src/ui/`. The screen machine in
`src/game/screens.ts` gains `scale`, `levelIntro`, `level` and `levelDone`. Pause records where it
came from (crawl or level).

### 5.2 Food and eating
- **Food leaves** are placed by the level: about 30, in clusters, each with a species.
  - They are hero leaves, so they share the hero physics and the one instanced hero draw: they drape
    over the worm, get pressed, get pushed and flip, already proven not to clip.
  - A food leaf is never recycled.
  - Food leaves exist on **every preset**, including Low, which has no ambient hero leaves.
- **Targeting:** the nearest uneaten food leaf within the head's reach (about 0.35 u from its tip)
  is the target. A dashed ring is drawn around it as a small additive effect, its shape the cue
  rather than its colour, pulsing at no more than 1 Hz.
- **Biting:**
  - Action (Space, or the Action button) with a target takes one bite. The head dips into the leaf
    over about 0.4 s, and Action is ignored until the bite ends.
  - Each bite removes a third of the leaf with a bite-shaped notch, drawn by the hero leaf shader
    from a per-instance "eaten" value. After 3 bites the leaf is gone.
  - No holding or mashing: one press, one bite.
  - Action with no target does nothing in Level 1. Later levels use it to hide.
- **Growth per leaf (growth points):** ash, basswood and aspen 3; maple 2; oak 1, split evenly
  across its 3 bites. This follows the parent spec's species order. The student-facing wording
  needs a source (5.6).
- Food is level state. A checkpoint restores which leaves were eaten as of that checkpoint.

### 5.3 Growth
- The worm starts Level 1 young, at **10 spine points (about 2.1 u, ≈ 9 cm)**, and grows to the
  full **16 points (3.5 u, ≈ 15 cm)**.
- Every 2 growth points add one spine point at the tail, so a full level is 12 growth points: for
  example 4 ash leaves, or 12 oak leaves.
- The tail eases out over about 1 s with a ripple down the body and a soft chime (sound cue only).
  It never jumps.
- Everything is built at 16 points once, and a shorter worm uses fewer:
  - the spine arrays the shaders read (`uSpine`, the occluder segments) pad past the tail with
    the tail point;
  - the tube mesh resamples its fixed ring count along the shorter spine;
  - pushers and the disturbance stamps cover only the live points.
  - No mesh rebuilds and no shader recompiles.
- Free crawl and the speed test always use the full 16-point worm, so their numbers don't change.

### 5.4 Moisture and the HUD
- **Moisture** runs from 0 to 100 and starts full. Its source of truth is `src/worm/moisture.ts`,
  which is pure and tested. Rates per second (tuning constants, checked by the playtest bot in 5.8):

| Where the head is | Rate |
|---|---|
| Sunny gap, on top of the litter | −4 (empty in 25 s) |
| Sunny gap, under the litter | −2 (the litter shades the worm) |
| Ordinary shade | +1 |
| Damp spot | +10 |

- **Sunny gap:** a patch of open canopy, about 6 u across.
  - It looks clearly brighter and warmer on the ground, litter and worm, with light shafts landing
    in it and dust motes.
  - It's drawn by a small uniform list of sun patches (at most 4) that every lit material reads.
    The materials compile once, and there are no new passes.
- **Damp spot:** a mossy seep about 4 u across, with darker wet soil, wet-looking leaves (the
  existing wetness shading) and small dew glints.
- Neither is colour alone: the sun patch has shafts and motes, the damp spot has moss texture and
  droplets.
- **A drying worm** (below 60%):
  - its skin loses its gloss and gains wrinkle bands, through worm material uniforms;
  - below 50% it slows linearly, down to 60% of normal speed at 0.
- **At 0:** back to the checkpoint (5.1).
- **HUD (top left, DOM):**
  - **Moisture:** a bar, a water-drop icon and the word "Moist". The drop's *shape* changes with
    the level: full, half (a flat top) and cracked (below 25%). It's a `role="meter"` with its
    value, and it announces "Drying out" once when it falls below 25%, never repeatedly.
  - **Length ruler:** a ruler icon with 6 notches that fill as the worm grows, labelled
    "Length 3 of 6" for screen readers.
  - Cocoons don't exist until sub-project 4, so the cocoon count isn't shown in Level 1.
  - Text at least 18 px and contrast at least 7:1. The HUD never covers the worm (it sits top left;
    the worm sits low in frame).

### 5.5 Level 1 layout and checkpoints
- **Level data** lives in `src/levels/level1.ts`: pure data for the spawn, food clusters, sun
  patch, damp spot, checkpoints, goal and text IDs. The same coordinates work in every scale mode,
  because the props keep clear of these zones (4.4).
- **Layout:**
  - The worm spawns in shade near the centre.
  - Oak and maple clusters lie close by in the shade: slow food that's safe.
  - The richest clusters (ash, basswood, aspen) lie in and just beyond the sunny gap: fast growth
    that costs Moisture.
  - The damp spot sits between the sunny gap and the far food, so a student learns to dash
    through the sun and recover.
- **Checkpoints:** the level start, and the moment the ruler reaches 3 of 6. A checkpoint stores
  the worm's position, heading, length, Moisture (restored full) and the eaten-leaf state.
- **Done:** the ruler reaches 6 of 6, so the worm is full length. Target play time is 3 to 5 minutes.

### 5.6 Science honesty (content)
- `src/content/sources.ts` lists the sources. Each has an ID, a plain-words title, a publisher, a
  URL and the date it was checked.
- `src/content/text.ts` holds every student-facing line. Each line is one of:
  - `fact`: needs at least one source ID and a `verified` status;
  - `gameChoice`: shown with the "Game choice:" label;
  - `ui`: goals, captions and buttons.
- **The build fails** if a shown fact has no source or is still marked `verify`. The types make
  `tsc` (part of `npm run build`) reject it, and a unit test checks every line too.
- Level 1's facts, to be checked against their sources in the plan before they're marked `verified`:
  - "Earthworms eat fallen leaves. Soft leaves like ash and basswood go first. Tough oak leaves
    last longest." Sources: Great Lakes Worm Watch, and the leaf-preference paper listed in the
    parent spec.
  - "Worms breathe through their skin. It must stay damp, so worms stay out of dry sun." Sources:
    UMN Extension, Minnesota DNR.
- If a fact can't be supported as worded, it is reworded to what the source says, or replaced.
  Any change is recorded in the plan's notes.

### 5.7 Read-aloud and captions
- `src/speech/` wraps the Web Speech API: a queue, the Chromebook's own voices, and rate 1.
- The caption box (DOM, bottom centre, at least 24 px, contrast at least 7:1) highlights each word
  as it's spoken, using boundary events. When there's no voice or no boundary events, the whole
  line shows for a reading-time estimate.
- Speech stops on Pause and on leaving the level. Mute and speed controls come in a later round
  (parent spec, section 7).

### 5.8 Testing (Part B)
- **Unit tests, pure modules first:**
  - Moisture rates and thresholds;
  - growth points and spine-point additions;
  - bite targeting, cooldown and eaten state;
  - checkpoint save and restore;
  - level data validity in every scale mode (no zone inside a footprint, food reachable);
  - the content check;
  - the new screen transitions.
- **Playtest bot:** a scripted player (steer to the nearest food, bite, go to the damp spot below
  40%) runs the level at step level with no rendering. It must finish in 2 to 5 minutes of game
  time in every scale mode, and dry out at least once if it ignores Moisture.
- **E2E (Playwright):**
  - Play → goal card → level → scripted input to completion;
  - Too dry → back at the checkpoint;
  - the World scale panel switches modes, and it persists after a reload;
  - keyboard-only menus;
  - the HUD meter's accessible values;
  - zero network requests.
- **Screenshots** of each scale mode and of the level (sun gap, damp spot, a drying worm, a bitten
  leaf), looked at and iterated until they look right.
- **Performance gates** after Part B as well (food leaves on Low, the target ring and the sun
  patches all add cost).

## 6. Engineering rules (unchanged)
- Vite + TypeScript strict + three 0.186, named exports, files under about 260 lines.
- Write tests first for pure modules.
- No per-frame or per-step allocation, no shader recompiles on preset or scale changes, and GLSL
  twins kept in step (`glslParity`).
- `npm test`, `npx tsc --noEmit`, `npm run verify:build` and `npm run test:e2e` stay green.
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## 7. Out of scope
- Climbing over rocks and logs; deeper litter.
- Robin, hiding, Worm View; clitellum, cocoons, frost.
- Gamepad, switch scanning, assisted steering, save codes.
- Mute and voice speed controls; the art pass.

## 8. Done means
- Part 0 committed and its gates checked (3).
- All three scale modes build, switch from the Start screen and persist. True is the default. Props
  are solid, the camera stays clear, and the clearance and jitter tests pass in every mode.
- Level 1 is playable start to finish on keyboard and touch, with Moisture, growth, the HUD,
  checkpoints, read-aloud and the sourced end card.
- All tests are green and the gates pass in True and Classic.
- Merged to `main` with a fast-forward, pushed, and https://wormsimulator.com serves the new build.
- A short note for Matt: how to run a class scale vote, plus the known limitations with screenshots.
