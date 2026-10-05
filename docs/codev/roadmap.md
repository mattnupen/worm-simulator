# 8-week roadmap (V1–V8)

Written 2026-10-04. It will change as students vote and as we learn, so update it each Friday.

**Goal for the 8 weeks:** students try both of the game's big modes early. These are the 3D forest
floor (the leaf-litter worm) and the side-view digging cross-section (the soil-eating worm). The
unit ends with the big idea: *worms change the forest*.

**Who picks what**
- Matt picks the topics for V1, V2 and V3, plus the V8 finale.
- Students pick the topics for V4–V7, from the vetted pool in `topics.md`.
  - V2's form picks V4, V3's picks V5, V4's picks V6, and V5's picks V7.
- V6's and V7's forms carry design votes only, which shape the V8 finale and its polish.

| Week (suggested start) | Version | Topic (learning unit) | What's new to play | Main vote on its form |
|---|---|---|---|---|
| 1 (Oct 5) | **V1 · True Size** | How big is a worm's world? No native earthworms in Minnesota | World scale: Classic / Hybrid / True | Which World scale? |
| 2 (Oct 12) | **V2 · Underground** | Before worms: the forest floor's layers (litter, fermentation, humus) and who lives in them; worms are newcomers | Dig down from a realistic, layered forest floor into a painted 3D cutaway. Free dig: tunnels and castings, no goal yet | **Which native forest-floor life should the game add?** Shapes V3 · quick camera question · topic vote → V4 |
| 3 (Oct 19) | **V3 · First Bite** | What worms eat; breathing through moist skin | Surface Level 1: eat leaves (species differ), grow, Moisture meter, sun gap and damp spots. Moisture also works underground | A Moisture design question · topic vote → V5 |
| 4 (Oct 26) | **V4** (students' pick) | From V2's vote | | topic vote → V6 |
| 5 (Nov 2) | **V5** (students' pick) | From V3's vote | | topic vote → V7 |
| 6 (Nov 9) | **V6** (students' pick) | From V4's vote | | Finale design votes |
| 7 (Nov 16) | **V7** (students' pick) | From V5's vote | | Finale design votes |
| 8 (Nov 23) | **V8 · The Forest Changed** | Worms change the whole forest: winners and losers | Forest-change screen with the neighbour cards. How much the student's worm ate and dug (and any cocoons, if built) drives the change | Reflection form: what we built together and what to build next |

Week 8 is Thanksgiving week (Thursday Nov 26), so it is a short week. Close the form on Wednesday,
or give V8 extra days.

## Ballot pool for V4–V7

Each topic can be built in about one week, now that V2 and V3 are done. Each needs its sources
checked before it goes on a ballot.

- **The mole:** digging vibrations warn you; fleeing upward escapes. Underground.
- **The robin:** a shadow and hop vibrations warn you; hide under leaves. Surface.
- **Skin that senses light, and Worm View:** see the world as a worm senses it.
- **Follow your nose:** fungus smell trails in Worm View lead to food.
- **Growing up:** the clitellum and leaving cocoons. Clitellum and cocoons are one version here,
  to fit the 8 weeks.
- **Racing the frost:** the frost line moves down the cross-section; adults die, but cocoons
  deeper down survive. Needs "Growing up" and a source check.

## V2 decisions (Matt, 2026-10-04)
- **Entry:** the worm digs down from the 3D forest floor into the cross-section, and back up.
  The two modes are joined from the start.
- **Goal:** a free dig sandbox. No level goal yet; goals come with later versions.
- **Look:** a 3D cutaway painted to match the forest: litter on top, dark topsoil, lighter
  subsoil, roots and stones (parent spec 3.1 and 8.3).
- **V2's learning focus and main vote (2026-10-04):** the forest floor before worms, and who
  lives in it. Students dig through the layers and notice the life in them.
  - Main question: "Which native forest-floor life should we add next?"
  - The winner is built into V3, where it reacts to moisture and the worm.
  - Camera view is a quick extra question, with both views shipped as a setting.
- **Realistic leaf litter (must):** follow `research/mn-forest-floor.md` and Matt's reference
  photos.
  - **Cutaway layers:**
    - L: this fall's bright leaves, needles and twigs;
    - F: dark matted older leaves, threaded with white hyphae and fine roots;
    - H: a thin black humus band;
    - then a thin A topsoil and lighter E/B subsoil with stones and roots.
  - **Depth:** the forest floor is up to about 10 cm, about two thirds of the worm's length.
  - **On the surface:** a mixed-colour mosaic, with some leaves still green and older leaves
    bleached pale, plus twigs and sticks, conifer needles, moss carpets and mounds, moss collars
    on trunks, mossy logs and stones with puffballs and shelf fungi, ferns and seedlings.
  - **Patches differ:** a conifer patch has a needle and moss mat (mor). The worm's own tunnels
    and castings start turning the floor towards worm soil (mull).

## What this changes from the original plan
- The underground side view (the parent spec's Chapter 2, "Eat the ground") moves from after
  Chapter 1 to **V2**.
- Surface eating and Moisture (the Step 1b spec's Part B) move from V2 to **V3**.
- The V2 dig level is a first slice:
  - In it: the cross-section look, eating through soil blocks, tunnels, castings and growing.
  - Later, by vote: Moisture underground (V3), the mole, frost and the move between modes.
- The forest-change model's input becomes "how much the worm ate and dug", plus cocoons if they're
  built by then. The parent spec's model used cocoons alone. Update the parent spec when V8 is
  specced.
- V2 must work for everyone: switch access, game speed and a read-aloud goal, as on the surface.

## Each week's development (fitting a one-week cycle)
- **Fri–Sun:** spec, then plan, then build V(N+1), then review.
- **Mon:** release with `npm run release -- N`.
- Big systems are sliced so each version ships something playable and votable.
- V2 is the riskiest week, because it is a new world type. If it isn't ready, V1 stays live a
  second week, and V2's topic slides still go out.
