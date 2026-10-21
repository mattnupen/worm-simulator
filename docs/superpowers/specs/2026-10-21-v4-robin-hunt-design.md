# V4 · The robin hunt: design spec

**Version:** V4. **Drafted:** 2026-10-21 from Matt's answers to the five plan questions
(thread "Build predators from student feedback"). **Plan and student evidence:** the V4 predator
plan in the project's shared folder (`v4/v4-predator-plan.md`); response numbers below (#N) are
rows of the V3 form export, as in that plan. **Builds on:** the robin model and `?robin=1` preview
(PR #37, `src/predators/`).

**Matt's answers (2026-10-21):**
1. The predator is the **robin**.
2. If caught, the worm **gets shorter and keeps going**, and starts again at its burrow when it's
   too short. **But there is a random chance the robin gets the whole worm:** it pulls the worm
   out, and a skippable animated scene shows the robin flying up to its nest and feeding the worm
   to its babies. Then you start again in the earth.
3. Escape by **digging down in time, or a grip mini-game**: hold Space to hold on and keep pulling
   into the ground, like reeling in a fish in a fishing game.
4. **Yes to both fixes:** tunnels stay, and the game shows where you can dig.
5. V4's lesson is **eating and getting energy** (worm anatomy, how and what worms eat), not
   natural dangers. It's researched in a separate thread. This spec covers only the game code.

## 1. What a round with the robin looks like

1. The worm crawls on the surface. After a while there (about 20 to 40 seconds, random), a robin
   comes.
2. **Warnings, all four at once** (no colour-only meaning, nothing flashes):
   - a sound: wingbeats and the robin's call (synthesized, like the lesson's robin cue);
   - a shadow sweeps over the worm;
   - the leaves around the worm shiver for a moment (see 6.1: the world moves, not the camera);
   - a "Robin!" label with a bird icon in the top right, read out by screen readers.
3. The robin lands about a metre away, then comes closer the real way: a short run, a stop, a
   stare with its head tipped (Cornell, research fact 6). Each stare is a few seconds: time to act.
4. **Escape A, dig down:** start digging down before it strikes and you're safe. The robin pecks
   the empty spot, looks round and flies off. To make this fair, the game now shows where you can
   dig (section 4).
5. **If it strikes first, it grabs the worm and the grip mini-game starts** (section 2).
6. After the robin leaves, the timer starts again, so robins keep coming while you stay up top.
   Underground is safe from the robin (it can't dig: #15). The worm's need to come up for food
   is V4's lesson topic, which makes this the trade-off students play.

## 2. The grip mini-game (Escape B)

Like reeling in a fish: pull when it's calm, ease off when it fights.

- The robin holds the worm's front end and tugs in hard pulls you can see coming (it leans back
  for a moment first; the model's tug pose).
- **Hold Space** (or hold the on-screen button with touch, or a mouse click on it) to grip with
  your bristles and pull back into the ground. Let go to rest.
- **A "Pull" bar** runs from "Burrow" (bottom) to "Robin" (top), with a worm marker. Holding moves
  the marker down; each robin tug moves it up.
- **A "Stretch" meter:** holding *during* a tug stretches the worm. If Stretch fills, the worm
  breaks (real: Journey North, "the worm can break as the robin tugs", tell-me-more fact B2).
  So the skill is the fishing one: pull between tugs, ease off as a tug lands.
- **Win:** the marker reaches "Burrow". The worm zips down into the ground, full length.
- **Lose:** the marker reaches "Robin" (pulled out), or Stretch fills (the worm breaks).
- About **6 to 10 seconds** for a typical win. All numbers live in one tuning table so they can
  change after Matt plays it.
- **Words and icons, not colour:** both bars have text labels and the marker has a shape; Stretch
  shows "Careful!" with an icon when it's nearly full.
- First grab of a play: a short hint, "Hold Space to pull back in. Let go when the robin tugs."

Student link: #14 ("click space before the predator gets to its nest"), the 14 who chose "grip
the soil with its bristles" (#1, 2, 3, 5, 7, 9, 12, 16, 20, 22, 25, 29, 31, 36), and #20 ("it
should get caught but there's a way to get down"). The grip itself is real (research fact 8). The
timing game is a **Game choice**: real worms don't time their pulls.

## 3. What happens when the robin wins

| Outcome | When | What you see |
|---|---|---|
| **The worm breaks: shorter** | Most catches (3 in 4) | The robin flies off with the tail end. The front end drops back down its burrow, shorter, and keeps going underground. |
| **The robin gets the whole worm** | 1 catch in 4, at random | It pulls the whole worm out and flies to its nest (section 5). Then you start again in the earth, full length. |
| **Too short** | A third break | Start again underground at your burrow, full length. |

- **Lengths:** full, then about 80%, then about 60%. A third break means starting again. A new
  life is always full length. Nothing is saved after the page closes.
- **Science:** the front end of a broken worm can live and may regrow its tail; the tail end
  dies (Earthworm Society of Britain, research fact 29). In-game text says this through
  `src/content/` with its source. Regrowing takes weeks, so the worm stays short for the play.
- **Game choices (labelled):** the 1 in 4 chance, and starting again with a new full-length worm.
- Student link: hurt-but-keeps-going (#6, 7, 12, 13, 18, 19, 21, 25, 31) and back-to-base (#3, 5,
  16, 26). Matt chose the whole-worm chance; 7 students asked for a caught scene (#2, 14, 28, 29,
  30, 32, 33).

## 4. The two fixes

### 4.1 Tunnels stay
- **Cause (found in the code):** every dig-down builds a new cut through the worm's head and wipes
  the soil grid (`startDig` → `createSlab` → `fillSoilGrid`, `src/underground/burrowMoves.ts`). So
  old tunnels vanish, even when you go back down your own hole. Students reported it: #3 ("make it
  so you keep your den"), #6, #10.
- **Fix:** each opening (up to the existing 8) keeps its cut and a copy of its dug soil. Digging
  down at or next to an old opening reuses that cut and puts the old tunnels back. Digging
  somewhere new starts a new tunnel. Kept for the play only (not saved after the page closes).
- "Your burrow" (where you start again) is the opening you last went down.

### 4.2 Show where you can dig
- Today the only sign is the Action button appearing (`canDigAt`, `src/underground/digSpot.ts`).
  12 students said it was hard to see where they could go or dig.
- **Fix:** a few nearby spots where digging works get a ground marker: a small mound of loose soil
  with a down-arrow icon above it, drawn at real size. Shape and icon carry the meaning, not
  colour. Your old openings already show their castings (middens) and get the same arrow.
- The game checks a few candidate spots per frame round the worm (the dig test is costly), and
  shows at most 3 markers.
- The Action button still appears when the head is on a good spot.

## 5. The nest scene

- **About 10 seconds:** the robin rises from the forest floor with the worm in its bill, flies up
  to its nest in a sugar maple, and three nestlings stretch up with wide-open yellow mouths. The
  robin leans in to feed one, and the screen fades to dark. No gore, nothing shown being
  swallowed, and the forest isn't "destroyed".
- **One fact card at the end:** "Robins feed earthworms to their babies." (source: Cornell Lab,
  checked during the build). Also "**Game choice:** real robins raise babies in spring and summer,
  not in fall."
- **Skip:** Esc, Enter or a tap, like the opening.
- **Preview:** `?nest=1` puts a "Watch the nest scene" button under the title on the Start
  screen, like the opening's preview button (Matt wants this for every cut scene).
- **Built in code, like the robin:** a woven cup nest and fluffy nestlings, on the props material.
  It has its own small player in `src/predators/`; the opening's files (`src/opening/`, another
  thread's) aren't changed. Then you start again underground.

## 6. Rules this has to keep

### 6.1 No screen shake
The visual brief says "the camera is gentle, with no screen shake", so the "shaking" warning is
the leaves and litter near the worm twitching, through the existing disturbance map. The camera
stays still. With reduced motion, the shiver is off; the sound, shadow and label still warn.

### 6.2 The camera
When the robin is close, its head is above the worm's view, so the follow camera tilts up gently
to keep the robin in view, and eases back after.

### 6.3 Accessibility
- Every input works: Space, touch hold on the on-screen button, and mouse.
- Meaning is never colour alone, and nothing flashes.
- The label and the bars are real DOM elements with text, at least 18 px.
- Reduced motion: no shiver, and the nest scene cuts between shots instead of flying.

### 6.4 Performance
- The robin is one draw call (already built); the nest and nestlings are one more, drawn only
  during the scene; the dig markers are one instanced draw.
- Nothing allocates per frame, and nothing compiles a new shader: every mesh uses the props
  material.
- Perf gates pass on every preset.

### 6.5 Science
- Every fact goes through `src/content/` with a source.
- The game choices above are labelled.
- The robin's run-stop-stare, the tug and the grip are all from the V3 research.

### 6.6 Saves
- No new saved data except "has seen the first robin hint" (a new key; old keys untouched).
- Older builds ignore it.

## 7. Framework decision tests (FRAMEWORK.md section 5)

| Test | Result |
|---|---|
| Learn first | V3's lesson taught robin hunting, the grip and the escape; students designed after it. |
| Student design | The predator, warnings, escapes and outcomes come from student answers (plan table). |
| Evidence | Each fact has a source, and every game choice is labelled. |
| Loop | V4's slides and changelog say which student ideas shipped and which didn't. |
| Decision quality | Matt decided from counts. The export has no class period column, so votes can't be weighted by period (noted in the plan). |
| Critique | The V4 form asks what happened in the hunt (descriptive "what happened" questions). |
| Integration | Hunting, the escape and the break are real behaviour you play. |
| Size | One headline change: the robin hunt. The mini-game and the nest scene are its parts, and the two fixes are bug fixes (P9). Everything is behind one switch, so it can be rolled back. |
| Equity | Mole and woodcock fans (17) are still waiting; the plan lists them for a later round. |
| Load | The student task is unchanged: learn, play, form. |
| Privacy | Nothing new is collected, and nothing connects anywhere. |

## 8. Build order (each step tested, then reviewed)

1. Tunnels stay (4.1).
2. Variable worm length (the 16 segments stay, and the gap between them shrinks). Today the
   length is fixed in many places, so this is the riskiest step.
3. Dig markers (4.2).
4. The hunt: timer, warnings, approach, strike, the dig-down escape, and the camera tilt.
5. The grip mini-game and its HUD.
6. Outcomes: the break, starting again at the burrow, and the whole-worm roll.
7. The nest scene and `?nest=1`.
8. V4 version doc, the changelog's "Coming next", V3's results (counts and themes only), the
   Start screen's version and Rounds.
9. Unit tests, e2e tests and perf gates. Merge to `main` for Matt to try at the root.

The release to `/v4/` waits for Matt's approval. The lesson and form come from the eating thread.
