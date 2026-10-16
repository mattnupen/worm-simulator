# Opening cut scene (serves V4)

Matt asked for animated 3D cut scenes, starting with the opening (project thread "3D cut scenes",
2026-10-16). He approved the storyboard on the design canvas and said "build it".

## What it is

A 14-second scene shown from one fixed camera on the leaves, in the game's own forest. It plays
on a device's first Crawl of each version, before play starts.

| Time (s) | What happens | Caption |
|---|---|---|
| 0–2 | A school bus drives in from behind the camera's left and stops broadside | [A school bus pulls up] |
| 2–4 | The door folds open; the teacher's boots come down the step and set down a tackle box | [Brakes hiss. The door opens] |
| 4–5.4 | The bait tub rocks, falls off the box and lands on its side; the lid pops off | [Thud!] |
| 5.4–9 | The worm (the player) crawls out of the spilled soil toward a big maple leaf while the kids' feet run past | Kid: "Is that the lake?" Teacher: "Everybody grab a fishing pole!" |
| 9–12 | The teacher's hands scoop the soil back, stand the tub up and press the lid on | Teacher: "Oops! I dropped the worms. Lid on, before any of you escape!" |
| 12–14.4 | The teacher picks up the box and goes back into the bus; the camera eases into the play camera behind the worm | |

After the scene, a fact card with a source (MN DNR): Minnesota's earthworms came from Europe and
Asia, and bait spread them; leftover bait goes in the trash, not the woods. Then "Start crawling".

## Choices (Claude's defaults; Matt never picked, so these are easy to change)

- **Captions plus sound.** Every line and sound is a caption (sounds in brackets). Sound effects
  are made in the browser like the lesson's; there are no recorded voices.
- **When it plays.** First Crawl of each version on a device (`wormsim.openings`, its own save
  key). "Watch the opening" on Start replays it. Skip, Esc or Enter skips it any time.
  `?opening=1` forces it (for review), `?opening=0` turns it off (tests).
- **Fact card after.** The scene's science point, with its source.

## How it is built

- Our own small script-driven player (`src/opening/`), no outside tool: the script is plain data
  (`script.ts`), eased keyframes (`keys.ts`), and three meshes built at load on the props' shared
  material (`actors.ts`), so nothing compiles a shader mid-game.
- The worm in the scene is the real worm, driven by the real crawl, so play starts exactly where
  the scene leaves it, under the big leaf.
- Draw calls during the scene: 18–31 across presets (budget 40). The meshes are hidden outside
  the scene. The speed test never plays it.
- Accessibility: captions carry everything (sound only adds); a real Skip button with focus;
  nothing flashes; no screen shake; keyboard, mouse and touch all work.

## Framework check (FRAMEWORK.md section 5)

- **P2 (student design) and P8 (one headline change):** this is a teacher-led change, not a
  student design, and it lands in "Coming next" next to whatever students vote for V4. Matt
  decides whether it counts as V4's polish or waits for its own round.
- **P3 / science honesty:** the fact card's two lines are sourced (`mndnr-earthworms`, checked
  2026-10-16). The bus trip is a story, not a fact.
- **P7:** the scene shows how bait worms reach a forest, the real way they spread.
- **P14:** no data, no outside calls; the save only lists version numbers.
