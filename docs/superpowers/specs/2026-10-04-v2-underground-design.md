# V2 · Underground: Design

Date: 2026-10-04
Status: Matt answered every open question on 2026-10-06 (sections 2 and 11) and approved the spec
at the start of the build session (2026-10-06), with two more answers (11.8 and 11.9). V1 is frozen at `/v1/` (released 2026-10-06).
Parent spec: `docs/superpowers/specs/2026-09-30-worm-simulator-design.md`. Relevant sections:
- 3.1, the camera and the two views;
- 3.4, Chapter 2;
- 5, science honesty;
- 7, accessibility;
- 8, technical design.

Previous round: `docs/superpowers/specs/2026-10-03-step1b-world-scale-and-first-bite-design.md`,
section 4.7 (V1 as built).
Co-development: `CLAUDE.md`, `docs/codev/README.md`, `docs/codev/roadmap.md` (V2 row and V2
decisions).
Research: `docs/codev/research/mn-forest-floor.md`. Read it before any art or layer work.
Matt's photos are in `reference images/`, which is git-ignored.

## 1. Why

Matt wants students to try the game's second big mode early: the side-view dig through a
cross-section of soil. V2 is the second weekly version. Its learning unit (slides) is **the
forest floor before worms**:
- Minnesota's hardwood forest floor has layers in every stage of decay: litter, fermentation and
  humus.
- It can be up to about 10 cm thick, roughly two thirds of the worm's length.
- Fungi, roots, mosses, small animals, salamanders and small mammals live in it.
- Earthworms are newcomers that eat it away.

Students dig down through these layers, notice what lives there, and vote on **which native
forest-floor life the game adds next (in V3)**.

The design rule, from the parent spec 3.1: going down a burrow is a smooth camera move between the
two views, not a jump into a different-looking game.

## 2. Decisions so far (Matt, 2026-10-04)

| Question | Decision |
|---|---|
| Entry | The worm **digs down from the 3D forest floor** into the cross-section, and comes back up |
| Goal | **Free dig sandbox**: no level goal yet |
| Look | A **3D cutaway painted to match the forest**, realistic Minnesota layers |
| Main vote on V2's form | **Which native forest-floor life should we add next?** (section 9) |
| Extra form question | Camera view underground: close and following, or wide (both shipped as a setting) |
| Litter realism | **Must** be realistic, following the research notes and photos |
| World size (2026-10-06) | **Real (True) size for all future work.** V1 ran well on student Chromebooks, and most handled the highest quality. **V2 removes World scale** (button, screen and setting); V1 keeps it, frozen at `/v1/` |
| Our worm (2026-10-06) | **The nightcrawler, *Lumbricus terrestris***, the classic Minnesota fishing worm: a deep burrower (anecic), reddish-brown, 8–15 cm, so our 15 cm worm is a big one (section 6) |
| Underground camera default | **Wide** |
| Layer names | **Always shown**, at the two far ends of the playable slab only, each with a small tick line at the layer boundary. Nothing in the middle (section 5.3) |
| Controls underground | **Point:** the joystick or arrows point the way the head should go |
| One Action button (2026-10-06, build session) | **Space / the touch Action button does what fits where you are:** on the surface it digs down; underground near the surface it brings you out; deeper in the soil it switches the camera between Close and Wide (sections 4 and 7) |
| Surface worm in deep litter (2026-10-06, build session) | **Buried inside the litter:** on the surface the worm travels inside the 2–5 cm leaf layer, with leaves above and below it; the leaves above fade so it stays visible (section 8.2) |
| Surface litter depth | **Deepen it** to a realistic leaf layer (section 8.2) |
| Photo IMG_2438 | **Not castings**: just soil and decomposing material. Matt thinks there are no worms where the photos were taken, so the photos show a worm-free forest floor |

## 2b. Taken from the Step 1b spec's Part B (which moved to V3)

V2 needs these first, so it builds them. Part B (V3) then reuses them:
- **Science honesty system** (Step 1b 5.6, unchanged):
  - `src/content/sources.ts`: ID, plain title, publisher, URL, date checked.
  - `src/content/text.ts`: every student-facing line, typed as `fact` (needs a source ID and
    `verified`), `gameChoice` (shown with "Game choice:") or `ui`.
  - `tsc` and a unit test fail the build on an unsourced or unverified shown fact.
  - V2's lines go through it: the dig hints, layer names, and any Game choice label such as the
    worm's size (section 11.4). Seed the sources from `docs/codev/research/mn-forest-floor.md`.
- **Large touch Action button** (Step 1b 5.1):
  - at least 64 px, bottom right, shown on touch screens;
  - it feeds the existing `Commands.action`;
  - V1 had none, and V2's "Dig down" needs it.
- **Cue style** (Step 1b 5.2): the "you can dig here" cue uses the dashed-ring style. The shape is
  the cue, not the colour, and it pulses no faster than 1 Hz. V3's food target ring will match.
- **Engineering rules** (Step 1b section 6):
  - files under about 260 lines;
  - tests first for pure modules;
  - no per-frame or per-step allocation;
  - no shader recompiles;
  - GLSL twins kept in step;
  - all checks green.

## 3. Scope tiers (one-week build)

- **Must have:**
  - World scale removed: the game is real size only (10, "World scale");
  - a deeper, realistic surface leaf layer (8.2);
  - the layered cutaway with its life details (5);
  - digging down and coming back up, with the camera transition (4);
  - free digging: tunnels, eating through soil, castings, stones and roots (6);
  - the camera setting (7);
  - the content system and the touch Action button (2b);
  - version label "V2 · Underground", changelog, version doc;
  - performance gates for the underground view.
- **Should have:** a more realistic surface forest floor (8.1):
  - twigs and sticks, conifer needles, still-green and bleached leaves;
  - moss carpets, mounds and collars;
  - mossy logs and stones with puffballs and shelf fungi;
  - a burrow opening with castings where the worm went down.
- **Could have:**
  - a conifer patch with a needle and moss mat (mor).
- Anything in Should or Could that doesn't fit the week moves to V3, and the version doc says so.

## 4. Going down and coming up

### 4.1 Digging down
- **Where:** on the 3D floor, on open ground: not on a log, rock or trunk footprint, and not on
  the play edge.
- **How:** an on-screen hint, an icon plus "Dig down", appears when the worm can dig. One press
  of Action (Space, or the touch Action button) starts digging; no holding is needed (parent
  spec 7).
  - The worm's head turns down and its front sinks into the litter over about 1 s. Then the
    camera moves.
- **The cut:** a vertical plane through the head along the worm's heading at that moment.
  - It is fixed for this visit.
  - The cross-section is a **slab** centred on the entry point: about **16 u wide** (≈ 70 cm)
    and **12 u deep** (≈ 50 cm, the depth Worm Watch gives for topsoil worms), clipped to the
    world.
- **Camera move:** over about 1.5 s it swings from behind the worm to side-on, facing the cut
  face, with smooth easing and no snap.
  - The surface forest stays visible above and behind the cut, dimmed by depth haze.
  - With reduced motion, it becomes a short cross-fade instead.

### 4.2 Coming back up
- **Action near the surface** (Matt, 2026-10-06): when the head is close to the top of the litter
  layer, the hint changes to an icon plus "Come up", and one press of Action starts the reverse
  move. Steering into the top of the litter does not pop the worm out on its own, so tunnelling
  along just under the leaves never ends the visit by accident.
- The worm comes out at that point along the cut line, facing along the cut.
- A **burrow opening** stays on the surface for the session: a dark hole with a nightcrawler
  midden around it (castings mixed with leaf bits; section 6) (Should; section 8.1).

### 4.3 State and memory
- **Underground state:** one slab at a time. Its tunnels last until the worm digs down somewhere
  else; then a fresh slab is made.
- **Session only:** nothing about tunnels is saved to storage.
- **On the surface:** surface openings from this session stay (up to about 8, the oldest
  removed).

## 5. The cutaway: layers and life (see the research notes)

### 5.1 Layers, top to bottom
Real thicknesses are at our scale: the worm is 3.5 u for 15 cm, so 1 cm ≈ 0.23 u. Every layer
boundary is irregular, from noise, never a ruler line.

| Layer | Thickness | Look | Digging |
|---|---|---|---|
| L, litter | ~2–3 cm (0.5–0.7 u) | This fall's leaves seen edge-on and at angles: red, orange, yellow, some green, older bleached tan. Twigs, needles, grass blades, air gaps between leaves | Easy and loose |
| F, fermentation | ~4–5 cm (1.0 u) | Dark brown to black matted leaf fragments, white fungal hyphae threads, fine root mats, moss creeping in at the top | Easy, damp |
| H, humus | ~1–2 cm (0.3 u) | Black, crumbly, nothing recognisable, dense fine roots | Easy |
| A, topsoil | ~3–5 cm | Dark grey-brown mineral soil, thin because there are no worms yet | Medium |
| E / B, subsoil | the rest | A lighter grey-white E band (many northern soils), then brown to rust B. Stones, big roots | Harder; stones block |

Each slab varies a little, so not every hole looks the same, within these ranges.

### 5.2 Life and detail in the cut face
None of these are creatures with behaviour in V2; that's what the vote decides.
- White **hyphae** threads in F and H.
- **Roots:**
  - fine roots, dense in F and H, which the worm passes through;
  - big roots from the nearest trunk, which block;
  - the worm passes freely through fine roots.
- **Stones** in A and B. They are solid; the worm slides along them using the same
  collide-and-slide idea as V1's props.
- Where the slab cuts through **a log or rock**:
  - its moss, lichen and fungi show in section on top;
  - it is damp and darker underneath.
- **Moss** at the surface line, with spore capsules on red stalks where the cut crosses a moss
  carpet.
- **Small static hints** of the vote options in their real places:
  - a snail shell in the litter;
  - a beetle;
  - a spider at the litter surface;
  - a puffball or mushroom where the cut meets one.

  These are for the "notice…" prompt. They are hints only, never creatures with behaviour.
- **The surface above the cut:** today's 3D floor continues behind the cut, including its leaves,
  props and trunks, so the two views read as one place.

### 5.3 Painted look
- **Same family as the forest:** warm light from the surface, soft colour bands, brush texture
  and rim light on the worm (`docs/superpowers/visual-quality-brief.md`).
- **Lighting:** it gets darker with depth. Tunnels are darker inside, with a soft edge.
- **Colour is never the only signal:** layers also differ in texture and pattern (fragments in L
  and F, crumbs in H, grain in A, B and E). This is parent spec 7, colour-blind safe.
- **Layer names (always on):** Leaf litter, Old leaves, Humus, Topsoil, Subsoil.
  - They sit at the two far ends of the playable slab only, each with a small tick line marking
    the layer boundary. Nothing goes in the middle, so the cut face stays clear.
  - Real DOM text, or text drawn crisply at 18 px or more with 7:1 contrast against a soft
    backing. The words come from `src/content/` as `ui` lines.
  - They show in both camera views whenever an end of the slab is on screen.

## 6. Digging

- **The worm in the cut:**
  - It uses the same segment body and mesh as the surface worm, kept in the cut plane.
  - Its peristalsis speeds up while it eats through soil.
- **Controls:** Move is mapped to screen directions. Joystick or arrows point the way the head
  should go, and it turns at a limited rate. Forward/turn steering stays available as a setting
  if it tests better (section 11).
- **Speed:**
  - fast through its own open tunnel;
  - slower eating into new soil;
  - slower still in harder layers (A < E/B).
  - Stones and big roots stop it, and it slides along them.
- **Tunnels:**
  - Where the head eats, it leaves an open tunnel about the body's width.
  - Tunnels last for the slab's life, and the camera and lighting show them as dark voids.
- **Castings:**
  - Every few body lengths the worm leaves a casting behind it in the tunnel: a dark granular
    blob that partly refills the tunnel.
  - When it comes up, a small pile of castings appears at the opening.
  - Minnesota DNR, *Humus Types*: in worm-invaded soil "worm castings are usually present on the
    mineral soil surface".
- **Mixing:** where the worm eats through F and H, the tunnel walls and castings are darker and
  more crumbly, a first visible hint of worm soil (mull). This is cheap if it comes from the dig
  mask (section 10).
- **No meter, no failing:** Moisture arrives in V3, so nothing drains underground in V2.
- **Our worm is a nightcrawler** (*Lumbricus terrestris*; Worm Watch, *Earthworm Ecological
  Groups*):
  - a deep burrower that makes "vertical, unbranching burrows down to 2 meters";
  - it feeds on fresh surface litter that it pulls down into its burrow;
  - it is 8–15 cm long and strongly pigmented reddish-brown, like our worm now;
  - it leaves **middens** at the burrow entrance: piles of casts mixed with leaf bits, about
    5 cm across and 1–2 cm high.
- **In game:**
  - The burrow opening on the surface gets a **midden**, castings mixed with leaf bits, instead
    of a plain ring of castings (4.2, 8.1).
  - The bottom of the slab darkens away, so the burrow can read as going deeper than the slab
    (real burrows reach about 2 m).
- **Game choice label** (in `src/content/` as `gameChoice`): "Game choice: real nightcrawlers dig
  one deep up-and-down burrow. In the game you can dig any way you like."
- **Slides:** they teach all three groups and say which one ours is (the deep burrower). Leave
  the fishing-bait connection for the slides: it's how many nightcrawlers spread (Minnesota DNR).

## 7. Camera underground (the V2 form's extra question)

- **Close (following):** frames about 4–5 worm lengths, follows the head with the existing
  smoothing, and keeps a little more room ahead than behind.
- **Wide (cross-section):**
  - frames the whole slab from the surface down to about the B layer;
  - follows gently only when the slab is wider than the view;
  - shows the layers' story at a glance.
- **Setting:**
  - **Switched with Action** (Matt, 2026-10-06): deeper in the soil (not near the surface, where
    Action means "Come up"), one press of Action switches Close and Wide. The hint shows the
    view it will switch to, as an icon plus word. It is saved only when the player picks one,
    the V1 save rule.
  - Default: **Wide** (Matt, 2026-10-06), because the lesson is the layers.
  - Switching is instant, with an eased move.
- Both views must:
  - keep the worm on screen;
  - never shake;
  - have no rotation jumps (V1 lesson: test frame-to-frame rotation and position);
  - work at 360×640 and at 1366×768.

## 8. Surface realism and connections

### 8.1 Surface forest floor (Should)
From the research notes and the photos:
- **Leaf colours:** a mix that includes some still-green leaves and older bleached-tan ones.
- **Twigs and sticks:**
  - instanced, lying in and on the litter, some crossing each other;
  - not solid; leaves drape over them.
- **Conifer needles** scattered, with a few balsam fir or spruce on the edge if the layout
  allows.
- **Moss:**
  - carpets, with spore capsules on red stalks up close;
  - mounds over old stumps and stones;
  - **moss collars** at trunk bases;
  - lichen-blotched bark.
- **Logs and stones as habitats:**
  - mossy tops, puffballs, shelf and crust fungi on sticks and logs;
  - a few seedlings in the litter.
- **Burrow openings and castings** from section 4.2.
- **Real size only:** Classic and Hybrid are gone in V2 (section 10), so there's no Classic
  layout to protect. Keep new things in their own meshes anyway, to keep shader and draw costs
  clear.

### 8.2 Deeper surface litter (Must; Matt chose it 2026-10-06)
- V1 keeps litter depth at about 1 cm real. Real fall litter (the L layer) is 2–5 cm, so V2
  deepens it.
- **Coherence rule:** the 3D ground surface is the top of the F layer, and the surface litter is
  the L layer. So the cut face's L thickness must match the surface litter's depth where the cut
  is made.
- **Deepen the surface L layer to about 2–5 cm real** (0.5–1.2 u), varying with the existing
  litter-depth field (piles and drifts deeper, hollows thinner):
  - **The worm travels buried inside the litter** (Matt, 2026-10-06): inside the leaf layer,
    with leaves above and below it, not on top of it. The leaves above it fade (V1's occlusion
    fade, extended) so the worm stays visible, and leaves never cut through its body.
  - Leaves are stacked in more layers, so the worm tunnels through the litter.
- **Coherence:** the cut face's L thickness at the entry equals the surface depth there.
- **Costs:**
  - more leaf layers mean more leaves or taller stacks: recheck leaf counts, the disturbance
    stamp (on-top offset, stamp limit) and the clearance and jitter tests;
  - the drape and lid behaviour must still keep leaves off the worm (V1 tests);
  - this is the riskiest item for performance. If a gate fails, apply V1's cut order (leaf
    counts, then clutter, then distant detail) and record the cuts.
- **Stack colours:** following the research notes, the top of the stack is this fall's bright
  leaves, and leaves lower in the stack are darker and more bleached.

## 9. V2's form vote and its link to V3

**Main question: "Which native forest-floor life should we add next?"** Every option is sourced
from Great Lakes Worm Watch (research notes).

| Option | Why (for the slide) | What V3 would build |
|---|---|---|
| Blue-spotted salamander | Breathes through moist skin, like the worm; lives in the damp forest floor; eats forest-floor insects | It appears in damp spots and hides when dry, tied to V3's Moisture |
| Fungi at work | White threads in old leaves; mushrooms and puffballs on logs and in the litter | Visible hyphae that grow, and mushrooms that come up after damp spells; fungi in Worm View later |
| Small hunters and helpers | Native land snails, spiders, beetles | A few small animals moving in the litter and on logs |
| Shrews and red-backed voles | Do best where the forest floor is thick | A shrew or vole moving through the litter (the robin and mole are separate later topics) |
| Other | | Grouped for the next form |

- The camera question goes in as a short preference question.
- The topic vote picks V4's topic (roadmap).
- **Accuracy notes for the slides:**
  - Leave out ovenbirds: they nest in spring and are gone in fall.
  - Springtails and mites need a source before they can be an option.

## 10. Technical design (requirements; the plan picks the exact approach)

- **New module `src/underground/`** (parent spec 8.2):
  - the slab model;
  - the soil grid;
  - the cut-face rendering;
  - worm movement in the plane;
  - the camera.
- **Soil grid:**
  - a 2D grid over the slab (for example 0.1 u cells, about 160 × 120);
  - each cell holds a layer, an open/dug flag, castings, stone or root, and damp;
  - kept in typed arrays and uploaded to a **data texture**, only the rows that changed;
  - pure TypeScript and unit-tested.
- **Cut-face rendering:**
  - One or two shaders on simple geometry: the front cut face and the tunnel interior. The
    layers, fragments, hyphae and grain are procedural or textured from the layer index and the
    dig mask.
  - Stones and roots as instanced meshes, and castings as instanced blobs or drawn into the
    texture.
  - Shaders compile at load: **no shader compiles on entering or leaving**, checked in e2e as in
    V1.
- **Worm:** the same body chain and mesh; the plane constraint and steering are new.
- **Transition:** a state machine (surface, digging down, underground, coming up). Gameplay only
  sees `Commands`, so every input method works.
- **Performance:**
  - at most 40 draw calls in both views, with no shadow maps, post passes or extra render
    targets;
  - while underground, the surface forest's expensive parts stop updating: the leaf disturbance
    upload and hero-leaf physics, while the forest stays drawn and dimmed;
  - no per-frame allocation.
  - `scripts/perf-gates.mjs` gains an underground run: the speed test drives a scripted dig.
  - The gates pass on the surface and underground at real size. Classic and Hybrid no longer
    exist.
- **Settings:** the underground camera choice follows the V1 save rule (stored only when
  picked). Old saves must keep loading.
- **World scale removed** (Matt, 2026-10-06):
  - Delete the Start screen's World scale button, the World scale screen, `ScalePicker`, and
    Classic and Hybrid from the scale table, with their tests (`docs/codev/README.md`: delete
    losing modes once settled). True is the only world.
  - The plan decides how far to simplify: remove the table entirely, or keep a one-entry table.
    Either way, nothing else may still branch on a mode.
  - Remove `?scale=` and the perf gates' `--scale` option, or keep them for True only.
  - `wormsim.settings` may still hold a `scale` value from V1. Ignore it, never repurpose the
    key, and keep it on save (unknown fields are kept).
  - `/v1/` keeps working, because it is a frozen file. Players on V1 still see World scale.
  - The spec record notes that Classic's Step 1a hash tests are retired with Classic.
- **Accessibility:**
  - Same commands everywhere, keyboard, touch and gamepad.
  - The "Dig down" and "Come up" hints are icon plus word.
  - Reduce-motion cross-fade.
  - No flashing.
  - Menus stay real DOM.
  - Switch access is still the later sub-project 5. V2 must not make it harder: no
    timing-critical input.

## 11. Answers (Matt, 2026-10-06)

1. **Underground camera default:** Wide.
2. **Layer names:** always shown, at the two far ends of the playable slab only, each with a small
   tick line. Nothing in the middle (5.3).
3. **Controls underground:** point the way to go.
4. **Which worm:** the classic Minnesota fishing worm, the nightcrawler *Lumbricus terrestris*
   (sections 2 and 6).
5. **Surface litter depth:** deepen it (8.2, now Must).
6. **Photo IMG_2438:** not castings. The photos come from a place Matt thinks has no worms, so
   they show a worm-free forest floor.
7. **V1:** frozen at `/v1/` on 2026-10-06.
8. **One Action button** (build session): surface → Dig down; underground near the surface →
   Come up; deeper → switch Close/Wide (sections 4 and 7).
9. **Surface worm in deep litter** (build session): buried inside the litter, with the leaves
   above it faded so it shows (section 8.2). Matt chose this knowing it is the bigger
   performance risk.

Also decided: **real (True) size for all future work, and V2 removes World scale** (section 10).

## 12. Testing

- **Unit:**
  - the soil grid: dig, hardness, stones and roots blocking, castings, mixing, row-dirty
    tracking;
  - slab creation: layer thicknesses within the ranges, deterministic per seed;
  - plane movement and collide-and-slide on stones and roots;
  - the transition state machine;
  - the dig-down allowed check (not on footprints or the edge);
  - settings save compatibility;
  - the content check: every shown line is labelled, and facts are sourced and verified.
- **Motion smoothness** (V1 lesson):
  - frame-to-frame camera rotation and position limits in both views;
  - the down/up transitions;
  - worm reversal metrics while digging.
- **E2E:**
  - keyboard-only: dig down, dig around, come up, switch camera, pause;
  - zero network requests, and the CSP holds;
  - no shader compiles on entering or leaving;
  - the touch joystick works underground;
  - reduced motion uses the cross-fade.
- **Performance gates** as in section 10.
- **Screenshots:**
  - the cut face in both views;
  - fresh vs dug and casted soil;
  - stones and roots;
  - the surface with an opening.
  - They go in `docs/codev/versions/v02-underground/` for the slides and Matt.
- **Retired with Classic:** the Classic hash tests (`propPlacement.test.ts`, `scaledProps.test.ts`).
  Replace them with True-only layout guards where they still protect something useful.

## 13. Version materials

- `src/version.ts` → V2 · Underground.
- CHANGELOG "Coming next: V2 · Underground", for students.
- `docs/codev/versions/v02-underground.md` from the template:
  - topic facts with sources from the research notes;
  - the section 9 ballot;
  - the camera question;
  - the topic vote for V4 (pool in `topics.md`);
  - slides with the screenshots;
  - the Canvas post.
- If V1's form results are in, the first slide is "You said, we did".

## 14. V2 as built (2026-10-08)

Plans: `docs/superpowers/plans/2026-10-06-v2-underground-part-a.md` (Plan A: foundations and deep
litter) and `docs/superpowers/plans/2026-10-06-v2-underground-part-b.md` (Plan B: underground).
Plan B was written against stubs of Plan A, so where they differ this record follows the code.
Commits `2f38219..36a533d` on `v2-underground`. Plan A ended at 79 unit files / 660 tests and
38 e2e passed (1 skipped); Plan B's final counts go in at the release check.

### 14.1 What was built

**Plan A (sections 2b, 8.2, 10 "World scale").**
- **Real size only.** The World scale button, screen, `?scale=`, the saved scale and forest
  switching are gone; `src/surface/realScale.ts` replaces the scale table. A V1 save's `scale` is
  kept on write and ignored. Classic's hash tests retired with Classic; real-size camera and
  layout guards replace the ones still worth having.
- **Content system.** `src/content/sources.ts` (9 sources from the research notes) and
  `src/content/text.ts` (`ui`, `fact`, `gameChoice`). The types and `lineProblems()` (unit test)
  fail the build on an unsourced or unverified fact. The burrow line is split in two: a sourced
  fact ("Real nightcrawlers dig one burrow that goes straight down, as deep as 2 meters", Worm
  Watch, *Earthworm Ecological Groups*) and a game choice ("In the game you can dig any way you
  like").
- **Action prompt and touch Action button.** One real button, bottom right, icon plus word (Dig
  down, Come up, Wide view, Close view), with a "Space" key chip on keyboard devices and the whole
  64 px+ button as the press on touch. It takes no focus and never flashes. Quick taps of Space or
  the button are latched until a game step sees them; a press with no pointer (Switch Access)
  counts; Space on a focused menu button is never also an Action press; it fits at 320 px.
- **Deep litter, worm buried in it.** The L layer is 0.45–1.2 u (2–5 cm): about 2.4 cm in the
  open, deeper in hollows, drifted against trunks and the log on the downwind side, five windblown
  piles, and banked against rocks so more than half of every rock shows (down to 0.2 u beside a
  small one). The worm travels on the F floor inside it. Over the worm the top opens in a funnel
  (V1's occlusion fade, extended) onto the F floor and a pocket of older, darker, partly bleached
  leaves. A hero leaf heaved through the top brightens to a top leaf, eased. The camera follows a
  point 0.1 u over the litter top above the head.
- **Draw budget.** All far-LOD litter is one draw; worst views dropped from 45–53 draws to 19–27.
  A headless test counts draws at the spawn, round every rock and from the corners, on every
  preset (≤ 40).

**Plan B (sections 4–7, 10 underground, 12).** All in `src/underground/` unless noted.
- **Slab.** 16 u wide (±8 u) by 12 u deep, clipped to the world, centred on the entry. The face
  draws 6 u past each end and fades over 4 u more, and draws 2.8 u below the bottom, fading to
  deep soil, so no swing or frame shows a void. The playable range stays clear of the face's ends
  so the names have room.
- **Layers.** L is the surface litter depth at each point (8.2 coherence holds); F 4–5 cm, H 1–2 cm,
  A 3–5 cm, E 2–4 cm, B the rest. Boundaries are irregular, seeded per spot. Patterns are baked
  once into painted tiles (litter fragments, matted old leaves with hyphae, H crumbs and fine roots,
  mineral grain), read 6 times per pixel.
- **Soil grid.** 160 × 136 cells of 0.1 u, reaching 1.6 u above the entry's litter top; layer,
  dug flag, castings, stone or root, damp. Uploaded to a data texture by changed rows.
- **Solids and life hints.** Stones in A and B; big roots from the nearest trunk that dive, wind,
  branch and taper, with thick ends running on into the wall; rock and log sections cut from the
  drawn meshes. A snail shell, a beetle (both block like stones), a spider at the litter surface,
  a puffball, and moss with red-stalked spore capsules at the surface line. Static only.
- **Digging.** Point steering, turning at up to 2.6 rad/s. Speeds (u/s): own tunnel 1.4, L 1.0,
  F 0.9, H 0.85, A 0.6, E 0.45, B 0.42, castings 0.9. Collide-and-slide on solids; soft stops ease
  the worm to the slab's ends, bottom and top. Steering into the top keeps the worm in the leaves.
- **Tunnels and castings.** Only the head digs fresh soil; the body follows the head's own path,
  so tunnels are worm wide (radius 0.14 u, cross-section about 0.29 u on curves too). A casting
  every 4.5 u of travel, retried over 0.8 u until it lands. Castings settle on the downhill wall
  (about 46% fill) and never seal a tunnel. Where F or H is eaten the wall gets a thin rim of H
  crumbs (the first hint of mull).
- **Backing out.** Pointed back along the body while stuck, the worm backs up tail first along its
  own tunnel and stops at the tunnel's end (a tail does not dig). It keeps backing while the stick
  stays within about 60° of straight back. A trap test finds no stuck spot (288 checks).
- **One Action button** (`modeMachine.ts`, `promptKind`): surface → Dig down (where allowed);
  underground near the top → Come up (where allowed); otherwise the view it will switch to.
  Presses during a move are dropped.
- **Where digging is allowed.** Open ground 0.5 u off every trunk, rock and log footprint (rocks:
  off their below-ground reach), 2.5 u inside the play edge, a body curled less than 170°, a cut
  long enough each side, and a clear side for the camera.
- **Moves.** Down: the head sinks for at least 1.0 s, then a 1.5 s camera swing. Up: the head rises
  (≥ 1.0 s, on the plan that turns and dips least), then the worm slides up its own tunnel and
  crawls out (≥ 1.1 s) while the camera swings back; at most 5.8 s. With reduced motion either
  way is a 0.7 s dip: dark over 0.3 s, the worm and camera cut to the end in the dark, clear over
  0.35 s.
- **Openings and middens.** Coming up leaves an opening with a midden: castings and leaf-shaped
  bits folded on the midrib, round a dark shaft. Up to 8 per session (oldest dropped; within
  1.25 u they merge); not saved. Middens hide underground and fade over the buried worm.
- **Camera views** (`cutFrame.ts`, `cutCamera.ts`). Wide: from 1.4 u above the highest litter,
  8.5 u tall (into B); at least 7 u wide on phones; capped at the 16:9 width on wider screens; on
  portrait screens the litter top sits about 19% down, clear of Pause. Close: about 1.7 worm
  lengths, whole worm in frame, head never low on screen. A switch is a 1 s eased hand-over. The
  frame depends only on the worm and the screen. Default Wide; stored only when the player
  switches (the V1 save rule; `Settings.undergroundView`).
- **Layer names** (`labelLayout.ts`, `layerLabels.ts`). Real DOM. The end nearer the head shows all
  five names with tick lines: on the real end while it is on screen, docked at the screen's edge
  (each beside its layer) when it is not. Ends swap 0.5 u past the slab's middle. Names fit the
  screen's height and slide clear of the joystick, Action button and Pause. Screen readers hear
  the near end's list ("Soil layers").
- **Hint card** (`src/ui/undergroundHint.ts`). The session's first visit only, for 12 s, starting
  once the camera reaches the cut. It sits at the top or the bottom, away from the head, and hides
  while the head would be under it. Keyboard devices get the keyboard line, touch screens a touch
  line (`undergroundHintTouch`). Then the burrow fact, then the "Game choice:" line.
- **The surface while underground.** No hole over the worm: fade off, top and floor patches and
  pocket emptied, every litter chunk plain, rim light off. Their per-frame lists, the leaf
  disturbance upload and hero-leaf physics are skipped. Everything is restored coming up. No
  shader compiles entering or leaving (e2e).
- **Speed test and gates.** `?dig=1` digs a scripted run; the report says where the game really
  is, so a run that never went down fails. The gates run surface and underground.
- **Allocation.** No per-step garbage in the dig, the dig spot or the crawl's pushers (heap growth
  per step: underground 80 B, `canDigAt` 48 B; guarded by `stepAllocation.test.ts`).

**Should items (8.1) built:** the burrow opening with a midden. The rest are deferred (14.5).

### 14.2 Decisions and deviations made while building

| Item | Spec said | As built, and why |
|---|---|---|
| Cut direction | Along the worm's heading | The cut nearest the heading that keeps 0.3 u off every trunk (no trunk section exists). 43% of digs turn: median 20°, up to 80°. The worm turns to lie along the cut while its head sinks |
| Coming up | Action near the top | Only where the whole body can then lie on the floor along the cut, clear of footprints and inside the play area (`emergeMap.ts`); elsewhere near the top Action stays the view switch. Near-top has hysteresis (in at 0.2 u, out at 0.35 u) |
| Castings | A blob that partly refills the tunnel | Settles on the downhill wall, about 46% fill, with a guaranteed open band: never seals a tunnel at any angle |
| Tunnel width | About the body's width | Was up to twice that on curves (every body point dug); now only the head digs and the body follows its trail |
| Tunnel look | Dark voids | The layer's own soil, browner, darker than the wall but never black; crisp edge, a thin pressed-wall line, castings as lit granular lumps |
| Close view | 4–5 worm lengths, more room ahead | About 1.7 worm lengths (4–5 would be as wide as Wide), and it keeps the whole worm in frame, so digging down it has about 2.2 u ahead and 3.8 u behind |
| Wide view | Surface to about B, follows gently | As spec, plus: capped at the 16:9 width on wider screens, at least 7 u wide on phones, portrait litter top 19% down (clear of Pause) |
| Layer names | At both far ends | The nearer end only, docked at the screen's edge when the end is off screen (Wide is capped at 16:9, so both ends rarely fit) |
| Hint card | Not specified | First visit only, 12 s from arrival at the cut, placed away from the head; a touch line on touch screens |
| Reduced motion | A short cross-fade | A 0.7 s dip through dark soil (a true cross-fade needs a render target) |
| Getting stuck | Not specified | Backing out tail first along the tunnel (never trapped) |
| Camera swing | Behind the worm to side-on | An orbit round the point it looks at, square to the cut over the leaves by 60% of the swing; the ground in front cut away (45–70%) by an oblique near plane along the cut (projection only: no shader, no compile), then down beside the cut |
| Forest in front of the cut | Not specified | Clipped by that oblique plane; nothing more than 0.3 u in front of the cut is drawn |
| Middens | Castings mixed with leaf bits | As spec; leaf bits are 8-point leaves folded on the midrib, round a dark shaft; middens hide underground |
| Soil grid | About 160 × 120 | 160 × 136: it reaches 1.6 u above the entry's litter top |
| E band | Grey-white E | 2–4 cm: a planning choice; the research notes give no number |
| Layer patterns | Procedural or textured | Baked once into tiles (per-pixel patterns halved the frame rate in software GL) |
| Quick taps | Plan B Task 10 `settle()` | Already done by Plan A's `endStep()` latches; not added twice |

### 14.3 Performance

Gates are relative to a Step 0 build run side by side (`node scripts/perf-gates.mjs 4`).

| Place | Preset | Gate | Plan A (893dd9f) | Final median (93debbc, 2026-10-08) | Max draws | Result |
|---|---|---|---|---|---|---|
| Surface | Low | 1.089 | 1.386 | 1.384 | 18 | Pass |
| Surface | Medium | 0.871 | 1.137 | 1.129 | 26 | Pass |
| Surface | High | 0.741 | 0.834 | 0.806 | 25 | Pass |
| Surface | Ultra | 0.610 | 0.656 | 0.614 (re-run 0.613) | 25 | Pass, thin margin |
| Underground | Low | 1.089 | n/a | 1.412 | 14 | Pass |
| Underground | Medium | 0.871 | n/a | 1.059 | 19 | Pass |
| Underground | High | 0.741 | n/a | 0.793 | 20 | Pass |
| Underground | Ultra | 0.610 | n/a | 0.671 | 20 | Pass |

- **Cuts (Plan A, `893dd9f`):** High render scale 1 → 0.9; Ultra top detail leaves 1600 → 1250.
  The pocket's count is pinned to a 1600 reference, so High and Medium keep theirs and Ultra's is
  about 0.88×. Plan B made no cuts.
- Perf work with no visual change: the terrain draws without the fade except a top patch over the
  worm; the fade searches per screen tile; the floor patch and pocket are listed on the CPU; far
  litter is one draw.
- Later visual fixes (tunnel shading `eff9ea7`, phone framing, worm-wide tunnels `65f4d89`) were
  rough-benched within noise, not re-gated.

### 14.4 Known limits
- One slab at a time: digging down elsewhere starts a fresh one; tunnels are not saved.
- Life in the cut is static hints; the vote decides what comes alive in V3.
- Pocket leaves jitter a little more than V1's bound (p99.9 bound 4 → 4.5 px, seed variance;
  pinned by a test). The pocket is sparser than the photos along the body's sides (10–20% cover);
  more costs fps on High.
- On phones Close is only about 14% closer than Wide, so the two views barely differ there.
- In about 0.5% of digs (measured at phone camera reach) neither side of the cut had a clear swing;
  measured before the swing became an orbit with the oblique clip, so recheck.
- About 1% of slabs near a trunk get 1 big root instead of 2; in about 21% the "2 roots" are one
  chain running both ways from the trunk.
- `buildEmerge` can take about 20 ms on a Chromebook as Come up is pressed (one frame).
- The camera pulls in fast past the big rock at (−9.5, −10) while turning hard (since V1).
- Midden leaf bits read well only at play distance.

### 14.5 Deferred (to V3 or Plan C)
- Spec 8.1 Should items not built: twigs and sticks; conifer needles; still-green and bleached
  leaves in the surface mix (only the pocket has older, bleached leaves); moss carpets on the
  surface; moss mounds and moss collars at trunk bases; lichen-blotched bark; mossy logs and
  stones with puffballs, shelf and crust fungi; seedlings.
- Could: the conifer patch (mor).
- The life vote's winner (V3), Moisture underground (V3), the mole, frost.

### 14.6 Open questions for Matt
1. **Close view:** about 1.7 worm lengths, with more room behind than ahead when digging down. On
   phones it is barely closer than Wide. Keep it, or make Close closer before students vote on it?
2. **Camera vote and saved picks:** Space switches the view, so most students who try both will
   have a stored pick, and a new default would not reach them. Before applying the vote, decide
   how (for example, store the default in effect with each pick and ignore picks made under an
   old default).
3. **Cut turns:** 43% of digs turn the cut (up to 80°) to avoid trunks. OK as is?
4. **Hint card:** 12 s on the session's first visit only. Long enough?
5. **E band 2–4 cm:** unsourced; it is described as "in the game" on slides. Find a source, or
   keep it as a game choice?
6. **Reduced motion:** a dip through dark soil, not a true cross-fade. OK?
7. **Surface Ultra** passes by 0.004. Accept, or trim Ultra further before release?
8. **Fungi:** done in V2 (2026-10-08). The parent spec (section 5) says any fungus shown carries
   "Look, don't eat." The `ui` line `TEXT.lookDontEat` ("Mushrooms and puffballs: look, don't
   eat.") is the last line of both hint cards: the crawl card on the surface (V1's mushrooms and
   puffballs) and the first visit's card underground (the puffball in the cut), keyboard and touch.
   Slide 4 says it too. On a 360 × 640 phone the underground card stays within about 35% of the
   screen (tighter line spacing and padding there, text still 18 px).
9. **The mole:** done (2026-10-08). Minnesota DNR, *Moles*, gives its range and diet (northern
   Minnesota's mole is the star-nosed mole), so it is the third option in V2's topic vote for V4
   (version doc).
10. **Pocket density and jitter** (14.4): tune in Plan C, or leave?
