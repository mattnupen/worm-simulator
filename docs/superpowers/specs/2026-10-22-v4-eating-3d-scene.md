# How a worm eats, in 3D (serves V4)

Matt asked for a 3D version of the eating lesson's "Follow the leaf" step (2026-10-22): "we see the
worm moving as an animation and zooms in and cross section lets us see the process", with the
eating shown "zoomed in for detail". It replaces the flat diagram (`src/ui/lessonBody.ts`).

## Matt's picks (2026-10-22)

| Question | Pick |
|---|---|
| Where | **Replace** the flat diagram |
| Pace | **A movie with Pause** (not tap per part) |
| Inside view | **Cut in half**, like a real dissection |
| The leaf | **Pulled into the burrow**, after a double check (below) |
| Detail | **Eating zoomed in for detail** |
| Labels | **No "Game choice" label anywhere in the game** (2026-10-23) |

## Where nightcrawlers really eat (the double check)

Matt's guess: they eat leaves toward the bottom of the leaf litter, not out in the open and not
dragged underground. What the sources say about nightcrawlers (*Lumbricus terrestris*):

- They come out at night to eat fallen leaves (NatureSpot; Colorado State: "on humid nights").
- They keep the tail in the burrow, widened to grip its walls (NatureSpot).
- They "feed on fresh surface litter which it pulls down into its burrow". Leaf stems and bits of
  leaf pile up at the burrow entrance, and they leave casts around it: a midden, about 5 cm across
  (Great Lakes Worm Watch, `wormwatch-ecogroups`).

So Matt is half right. The worm stays mostly hidden: the burrow opens under the leaves, and only
the front end reaches out. But it does pull leaves into the top of its burrow. Living in and eating
inside the leaf layer is what a different group does, the leaf-litter worms (Great Lakes Worm
Watch). The scene shows the nightcrawler way.

## The scene (about 50 s, Pause and Replay)

| Time (s) | Shot | What you see | Caption (sourced fact) |
|---|---|---|---|
| 0–10 | **Burrow at night**, side cut through the soil (the game's own cut view) | A vertical burrow under the leaves. The tail grips the walls; the front end reaches up out of the opening, feels around, grabs the edge of a fallen leaf and pulls it into the burrow mouth. Leaf stems already stick out of a small pile around the opening | Nightcrawlers come out on damp nights. The tail stays in the burrow. They pull leaves into the top of the burrow. |
| 10–15 | **Zoom in** | The camera pushes in to the head; the near half of the body fades away, and the worm is cut open lengthwise | (none) |
| 15–20 | **Mouth, close up** | The lobe over the mouth lifts. The pharynx pushes out of the mouth, grips a soft bit of leaf, and pulls it in | No teeth! It pushes its pharynx out to grab food. |
| 20–24 | **Pharynx** | Shiny spit wets the leaf bit | It wets the food with spit. |
| 24–28 | **Crop** | The bit slides down a thin tube into a soft bag that swells | The crop stores food. |
| 28–35 | **Gizzard, close up** | Sand grains and the leaf bit tumble inside a thick muscly ring that squeezes, again and again; the leaf breaks into crumbs | The gizzard's muscles grind food with sand. |
| 35–42 | **Intestine** | Crumbs move along a long tube; tiny food dots pass through its wall into the red blood vessel beside it | Food soaks into the blood. |
| 42–50 | **Back outside** | The camera pulls back out to the burrow opening, where casts pile up with the leaf stems (how the worm turns to leave them is not shown) | Casts come out the back end. Leaf stems and casts make a pile: a midden. |

Every caption is a fact line with a source, as now (`sourceName` under it). Names already sourced
for the diagram (`sciencelearn-earthworm`, `hst-dissection`, `carolina-dissection`, `esb-biology`)
carry over; NatureSpot is added as a new source.

### Simplified (not labelled in the game, recorded here and in `docs/codev/research/eating.md`)

- Real food takes hours to pass through; the scene takes about 30 s.
- Inside, everything is drawn bigger than life so it can be seen; the body plan follows the
  dissection guides.
- No measured mouth size was found, so the scene never states one.

## Controls and access

- Plays when the step opens. **Pause / Play** and **Replay** buttons; Next wakes up after it has
  played through once (Claude's default, same as the diagram).
- The card becomes a caption bar at the bottom; each part's name also shows as a big label on
  screen. "Read the whole trip" lists every caption as text at any time (screen readers, re-reading).
- Space pauses, Enter or the buttons work, touch works. Nothing flashes; the gizzard squeeze is
  slower than 3 times a second. With reduced motion, the camera cuts instead of gliding.
- Preview links: `?lesson=eating` (the lesson), `?eatingAt=31` freezes a frame (like
  `?openingAt=`).

## How it is built

As built (2026-10-23), in `src/eatingFilm/`:
- A small script-driven player like the opening's: `script.ts` is plain data (beats, eased
  keyframes), `outside.ts` and `inside.ts` build the two places, `film.ts` runs the clock and the
  camera. The lesson UI is `src/ui/lessonFilm.ts`.
- Its own small scene, drawn by the game's renderer **instead of** the forest while the step shows
  (one scene render per frame, as always). Built once at load, only when the lesson has a `body`
  step, and compiled with the game's shaders, so nothing compiles mid-lesson. Plain lit materials
  with its own two lights; switching places changes only light colours and visibility.
- Outside: the soil cut through the burrow, leaves, the midden's stems and casts, and the worm as
  beads (game size). Inside: one cutaway nightcrawler, 150 segments, much bigger than life.
- Budget: about 22 draw calls at most (one place shows at a time), well under 40. It never draws
  during play, so the perf gates (which measure play) are unchanged.
- The flat diagram (`src/ui/lessonBody.ts`) and its CSS are gone; the lesson data's 6 stops are the
  film's captions, plus a new `outside` and `midden` caption.

## Framework check

- **P7 (learning in the mechanics) and science honesty:** every caption is a sourced fact;
  simplifications are listed above and in the research doc.
- **P8:** this is the lesson for V4, not V4's headline build; it reaches students only when V4 ships.
- **P14:** nothing is saved or sent.

## Labels

No "Game choice" labels anywhere in the game (Matt, 2026-10-23, the whole game): the scene's
simplifications above are recorded here and in the research doc, never shown on screen.
