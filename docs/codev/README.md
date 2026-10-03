# Co-developing Worm Simulator with students

Students are co-designers. Each week they learn one thing about real earthworms, play the newest
build at home with that idea in mind, and use a Google Form to vote on and suggest changes. Their
answers steer the next builds.

Why it works: students judge a design against two criteria, *true to real worms* and *fun to
play*, and back their choices with evidence. Those are the habits of the engineering design
process, and they come from the science content itself.

## The loop

```
Round N live (Mon)  ──►  play + form (Mon–Thu)  ──►  summarise + decide (Fri)  ──►  build N+1 (Fri–Sun)
        ▲                                                                                │
        └────────────────────────────────────────────────────────────────────────────────┘
```

What each round's form decides:

| Vote on Round N's form | Ships in |
|---|---|
| Design question: how should the game show this round's topic? | Round N+1 |
| Next topic: 3 vetted options | Round N+2 |
| Ideas: themes from Round N−1's write-ins | Round N+1 or N+2, depending on size |

Matt picks the topics for Rounds 1 and 2.

## What students see each round (Canvas)

1. **Slides** (Google Slides):
   1. **You said, we did:** last round's vote results and what changed because of them, plus
      any veto and its reason.
   2. **The worm topic** (2–3 slides): one big idea at a 6th-grade reading level, with a
      photo or diagram. Every image has alt text, and the sources go in a footer.
   3. **While you play, notice…:** one focus prompt tied to the topic.
   4. **What's new in this build** and how to play: controls, plus where any new setting or
      toggle lives.
   5. **Now fill out the form.**
2. **The build link:** `https://wormsimulator.com/round-N/`
3. **The Google Form.**

## The form (about 10 minutes, at most 10 questions)

Keep the same structure every week so students learn it. Make a copy of last week's form and
edit it.

| # | Question | Type | Purpose |
|---|---|---|---|
| 1 | Were you able to play Round N? | MC: Yes / It wouldn't load / I didn't have time | Catch access problems |
| 2 | About how long did you play? | MC: under 5 min / 5–15 / 15–30 / 30+ | Context for answers |
| 3 | Fact check on the topic | MC, one correct answer | Formative check for Matt |
| 4 | How well did the game show [topic]? | Linear scale 1–4 | Is the game true to worms? |
| 5 | **Design vote:** [round's question] | MC: 2–4 vetted options + Other | Main steering vote |
| 6 | Why did you choose that? | Short answer. Starter: "In the game I noticed ___, and real worms ___." | Claim, evidence, reasoning |
| 7 | **Next topic:** what should worms learn to do next? | MC: 3 vetted topics + Other | Topic steering |
| 8 | **Ideas from last week:** which should we build? | Checkboxes, pick up to 2 | Converge write-ins |
| 9 | Was anything confusing or broken? | Checkboxes for common issues + Other | Bugs and friction |
| 10 | How fun was this round? (+ optional "Your idea" box) | Linear scale 1–5, plus paragraph | Fun check, and new ideas to diverge |

Rules for options:
- **Every option must be something we will build if it wins.** No decoy options.
- Write options as what the player would *experience*, not code ("The worm gets slower and
  wrinkly as it dries out").
- When possible, put every design-vote option into the build as a setting, so students vote on
  something they actually tried.

## Consensus rules

- Combine all class periods' answers. Plurality wins.
- **Close call:** if the top two are within 10 percentage points, ship both as a toggle and hold
  a runoff on the next form.
- **Low turnout** (fewer than about a quarter of students answered): Matt decides, and the
  slides say so.
- **Write-ins:** group "Other" answers and idea-box answers into themes, then vet them:
  - Is it true of real worms, or can it be a labelled "Game choice"?
  - Does it fit the framing rule?
  - Is it buildable?
  - Is it safe for performance and accessibility?

  The top 3–4 vetted themes go on the next form. Ideas that are fun but false become a
  "myth or fact?" slide.
- **Veto:** only on non-negotiable grounds (see `CLAUDE.md`), and always explained to students.

## Friday summary (Claude's job)

1. Matt exports the Form responses as a CSV into `codev-raw/` (git-ignored).
2. Claude reads it and fills in the round doc's Results section. It includes:
   - turnout;
   - tallies and percentages for every multiple-choice question;
   - fact-check accuracy, and the most common wrong answer, which is a hint for the next
     slides;
   - write-in themes with counts;
   - bugs, grouped;
   - fun average.
3. Claude proposes Decisions using the consensus rules. Matt confirms or changes them.
4. Claude drafts the next round's doc, including the "You said, we did" slide.

Privacy: committed docs hold only counts, percentages and paraphrased themes. Never include
names, emails or identifying quotes. If the form records emails for Canvas completion credit,
that column never leaves `codev-raw/`.

## Versioned builds

Each round is a frozen copy of the single-file build at `wormsimulator.com/round-N/`, so
students can go back and compare. The root URL follows `main` and is a preview for Matt only.
All rounds share one origin and one localStorage, so save data must stay compatible both ways
(see `CLAUDE.md`).

*Status: not built yet. It is the first task of Round 1 prep. It needs:*
- *a script that snapshots `dist/index.html` into `rounds/round-N/index.html` (committed);*
- *a Render build step that copies `rounds/` into `dist/`.*

## Suggested first rounds

The Step 1b work (`docs/superpowers/specs/2026-10-03-step1b-world-scale-and-first-bite-design.md`)
splits naturally:
- **Round 1, "How big is a worm's world?"**
  - Topics: real earthworm size, and Minnesota's forests had no earthworms for about
    11,000 years.
  - Build: Step 1b Part A, the World scale modes, with free crawl.
  - Design vote: Classic, Hybrid or True scale.
- **Round 2, "First bite"** (topic picked by Matt): food preferences and moisture.
  - Build: Step 1b Part B (Level 1).
  - Its form holds the first student topic vote, which picks Round 4's topic.

## Files

- `rounds/round-NN-<slug>.md`: one doc per round, made from `round-template.md`.
- `topics.md`: the topic pool, with sources and prerequisites.
- `../../codev-raw/`: raw exports. Git-ignored and never committed.
