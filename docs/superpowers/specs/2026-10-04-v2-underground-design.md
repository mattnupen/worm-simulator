# V2 · Underground: Design

Date: 2026-10-04
Status: Matt answered every open question on 2026-10-06 (sections 2 and 11). Ready for his final
OK at the start of the build session. V1 is frozen at `/v1/` (released 2026-10-06).
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
- **How:** an on-screen hint, an icon plus "Dig down", appears when the worm can dig. Action
  starts digging.
  - **Hold** Action, or tap it once to toggle (parent spec 7: no holding required).
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
- Steering the head up out of the top of the litter layer, into open air above the slab, starts
  the reverse move.
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
  - Lives under Graphics or Settings (decide in the plan). It is saved only when the player
    picks one, the V1 save rule.
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
  - The worm still slips under thin litter and climbs over piles (V1's under/over system).
  - Leaves are stacked in more layers, so the worm can tunnel through the litter, with leaves
    above and below it.
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
