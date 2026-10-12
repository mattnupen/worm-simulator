# In-game lessons: teaching each round's topic inside the game

**Status:** part of V3 · Predators (Matt, 2026-10-12), first topic "Who eats worms?" (predators).

Each round starts with a short learning step on the topic students will design for next
(framework P1, "learn first"). Until now that step was Google Slides in Canvas. Matt asked to move
it into the game: fewer clicks and less back and forth for students, and more engaging. The
Google Form stays the place to vote, opened from Canvas. The game only *reminds* students to vote;
it never links to the form. Lesson sources are links that open in a new tab, and "Tell me more"
panels can embed a YouTube video (youtube-nocookie.com), since Matt dropped the offline rule on
2026-10-12. The game's own code still sends no data (`connect-src 'none'`).

## Ways we could teach it (brainstorm)

| Method | What the student does | Strengths | Costs and risks |
|---|---|---|---|
| **A. Field-guide cards** | Reads 4–6 illustrated cards, with Next and Back | Cheapest; any topic; easy to review | Mostly reading, which is what P7 warns against |
| **B. Predict, then reveal** | Guesses first ("Which animal eats the most worms?"), then sees what scientists found | Curiosity before facts; every guess welcome; no grades | Still a card, but the guess makes students think first |
| **C. Worm's-eye moment** | Over the live forest, a cue plays (a shadow passes, the ground thumps). The student picks what the worm does, then sees what real worms do | Closest to P7: the content is something the player senses and acts on | Each topic needs its cue. Today the cue is a screen layer; a real 3D cue (a robin in the scene) is a feature build |
| **D. Sort it** | Taps each card (an animal, a leaf, a layer) into one of two groups, and each card then shows its fact | Active, quick, good for "which ones" topics | Can feel like a quiz if overused |
| **E. Guided play** | A short scripted level: "Find three damp spots" with the facts appearing as you reach them | The strongest learning-through-play | Costs most: level scripting per topic; better as the version's own feature than as the intro |
| **F. Read aloud and captions** | Any of the above, read by the device's own voice | Helps weaker readers | Only where the device has a built-in voice (most Chromebooks do) |

**Prototype:** a lesson player that mixes A, B, C and D, with F on every step. One topic is one
data file, so a new topic needs no new code. E stays for the version's main feature.

## How a lesson is built

A lesson is one file in `src/content/lessons/` (the predators one is `predators.ts`). It's a list of
steps, each one of five kinds:

| Step | What students see |
|---|---|
| `story` | One big idea in two or three short lines |
| `predict` | A question with 2–4 answers (radio buttons), then "What scientists found". With `answer`, that option is marked "Correct" after a guess |
| `sense` | A film-like moment over the forest (`shadow`, `thump` or `robin`): the card fades out, black bars close in, the cue plays with its sound, and the `scene` and cue words show as captions with Skip. Then the card comes back with the question and the reveal |
| `meet` | 2–6 animals as photo cards; "Find out" on each shows its fact (replaced `sort`, which Matt found confusing: it was a quiz where every answer was the same) |
| `mission` | Always last: "While you play, notice…" and the reminder to vote on the form in Canvas |

Any `story`, `predict` or `sense` step and any `sort` card can carry a **real photo** (`photo`), with
its name and credit under it. A `predict` shows it above the question; a `sense` shows it in the
reveal, because there the animal is the answer. Photos live in `src/content/lessons/photos/`, under
about 90 KB each, and `photos.ts` lists them. Never AI-made (Matt, 2026-10-12); in-game art, like the
robin in the scene, is fine.

Any step but the mission can have **"Tell me more"** (`more`): a bigger panel of extra sourced facts
for students who want to read on, and optionally a YouTube video. Matt dropped the offline rule
(2026-10-12), so sources are links that open in a new tab, and the video plays in the panel through
YouTube's privacy-enhanced player (youtube-nocookie.com, allowed by the CSP's `frame-src`), with an
"Open on YouTube" link for networks that block the player. `LESSON_LINKS` in `src/ui/lesson.ts`
turns both off again. Watch every video before it ships. Photos open bigger when tapped. Read aloud lights up the line and
word it is reading, and its button turns into Stop. Sound effects are made on the device (Web
Audio), never downloaded, and a "Sound on/off" button sits beside them.

Rules the build checks (`tests/unit/lessons.test.ts`):
- every claim is a `fact` line naming a source in `src/content/sources.ts`, marked `verified`;
- questions, answers and card names make no claim (a claim goes in a fact line);
- 3 to 8 steps, ending on the one mission step;
- each lesson has at least one sourced fact.

Rules a person checks:
- 6th-grade reading level, short lines, positive wording (P12). The reveal never says "wrong".
- Framing: the forest *changed*; some species win and some lose. Never "destroyed" or "dying".
- A cue never flashes (one slow shadow, or thumps under 3 a second), and its words say what happened.
- Every fact on screen shows its source underneath ("Source: Minnesota DNR").
- No lesson text appears in normal play (the learning unit lives in the lesson, `CLAUDE.md`).

The Start screen shows "Learn: <title>" as the first, main button until the device finishes the
lesson. Then Crawl comes first and the lesson stays below it to replay. Finished lessons are kept
under their own save key, `wormsim.lessons`, so older versions never see it.

## From topic to lesson: the repeatable process

1. **Matt names the topic** in the project, for example "predators".
2. **Claude researches it.** The output is `docs/codev/research/<topic>.md`, with:
   - a fact table: each fact in 6th-grade wording, its source, the link, the exact supporting
     sentence, and the date it was checked;
   - claims that couldn't be sourced, so they stay out;
   - likely student myths and their sourced corrections.
3. **Claude drafts the lesson**: the data file, with any new sources added to `sources.ts`. The
   tests must pass. The lesson has 5–7 steps:
   - a hook (`story`);
   - a guess (`predict`);
   - a worm's-eye moment (`sense`), if the topic has a sense the worm uses;
   - a `sort`, if the topic has a "which ones" idea;
   - a `story` that sets up the design question;
   - the `mission`.
4. **Matt reviews.** He gets:
   - a preview link where the lesson opens straight away (`?lesson=1`);
   - screenshots of each step;
   - the fact table.

   Matt replies with changes in plain words ("simpler wording on step 3", "drop the snake").
   Claude edits, and they repeat until Matt approves.
5. **The lesson ships with the version.** Set `CURRENT_LESSON` in `src/content/lessons/index.ts`.
   The version doc's "Topic" section lists the facts the lesson uses, so the form's check
   question matches them.


## Open questions for Matt

The prototype's choices are marked *(now)*. Answers go here once Matt decides.

1. **When the lesson shows:** the first, main button on Start until it's finished *(now)*; required
   before the first crawl; or an optional button.
2. **Length:** about 7 steps *(now)*; or shorter, 4–5 steps.
3. **Pictures:** decided (Matt, 2026-10-12): real photos and videos, never AI-made, except in-game
   art. Matt tried the first lesson and found it boring and confusing, and couldn't picture a
   woodcock. So the lesson now opens with a cinematic robin encounter and shows a real photo of
   every animal (option A on his decision card).
4. **Review format:** a preview link plus screenshots *(now)*; or also a printable lesson script.
