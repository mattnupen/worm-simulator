# Running Worm Simulator's co-development

How Worm Simulator puts the co-development framework into practice: the weekly schedule, what
students see, the form, and the Friday summary.

**The principles live in [`FRAMEWORK.md`](FRAMEWORK.md), and they win.** This file only holds the
Worm Simulator specifics (order, timing, tools). When something here conflicts with the framework,
the framework wins: fix this file, or amend the framework on purpose and record why in the
decision log.

Each week there's a new version of the game (V1, V2, V3…), each with a short descriptive name such
as "V2 · Underground". Students learn one thing about real earthworms, play that version, and
answer a Google Form.

## The loop

```
VN live (Mon)  ──►  play + form (Mon–Thu)  ──►  summarise + decide (Fri)  ──►  build VN+1 (Fri–Sun)
        ▲                                                                                │
        └────────────────────────────────────────────────────────────────────────────────┘
```

What each version's form feeds into (Matt decides; framework P4):

| Input on VN's form | Decided Friday, built in |
|---|---|
| Design question: how should the game show this version's topic? | VN+1 |
| Next topic: 3 vetted options | VN+2 |
| Ideas: themes from VN−1's write-ins | VN+1 or VN+2, depending on size |

Matt picks the topics for V1, V2 and V3 (V1's form has no topic vote, and V2's topic vote picks V4), plus the V8 finale. The current plan is in `roadmap.md`.

## What students see each version (Canvas)

1. **Slides** (Google Slides), titled "Worm Simulator VN · <Name>":
   1. **You said, we did:** built from this version's `CHANGELOG.md` entry. It shows what
      students said, what was built, and what wasn't built and why (framework P2).
   2. **The worm topic** (2–3 slides): one big idea at a 6th-grade reading level, with a
      photo or diagram. Every image has alt text, and the sources go in a footer.
   3. **While you play, notice…:** one focus prompt tied to the topic.
   4. **What's new in this build** and how to play: controls, plus where any new setting or
      toggle lives.
   5. **Now fill out the form.**
2. **The build link:** `https://wormsimulator.com/vN/`
3. **The Google Form.**

## The form (about 10 minutes, at most 10 questions)

Title it "Worm Simulator VN · <Name>: Feedback". Keep the same structure every week so students
learn it. Make a copy of last week's form and edit it.

| # | Question | Type | Purpose |
|---|---|---|---|
| 1 | Were you able to play VN? | MC: Yes / It wouldn't load / I didn't have time | Catch access problems |
| 2 | About how long did you play? | MC: under 5 min / 5–15 / 15–30 / 30+ | Context for answers |
| 3 | Fact check on the topic | MC, one correct answer | Formative check for Matt |
| 4 | How well did the game show [topic]? | Linear scale 1–4 | Is the game true to worms? |
| 5 | **Design vote:** [version's question] | MC: 2–4 vetted options + Other | Main steering vote |
| 6 | Why did you choose that? | Short answer. Starter: "In the game I noticed ___, and real worms ___." | Claim, evidence, reasoning |
| 7 | **Next topic:** what should worms learn to do next? | MC: 3 vetted topics + Other | Topic steering |
| 8 | **Ideas from last week:** which should we build? | Checkboxes, pick up to 2 | Converge write-ins |
| 9 | Was anything confusing or broken? | Checkboxes for common issues + Other | Bugs and friction |
| 10 | How fun was this version? (+ optional "Your idea" box) | Linear scale 1–5, plus paragraph | Fun check, and new ideas to diverge |

Writing options (framework P3 and P4):
- Only offer options we're ready to build. Each one is a testable bet: "If we do X, we expect Y
  to change."
- Write options as what the player would *experience*, not code ("The worm gets slower and
  wrinkly as it dries out").
- When possible, put every design-vote option into the build as a setting, so students vote on
  something they actually tried.
- Write-ins and "Other" answers are grouped into themes and checked against the framework's
  decision tests (section 4) and the non-negotiables in `CLAUDE.md` before any of them reaches a
  form. Ideas that are fun but false become a "myth or fact?" slide.

## Friday summary (Claude's job)

1. Matt exports the Form responses as a CSV into `codev-raw/` (git-ignored) and removes names,
   emails and any other identifying columns first. Claude only works from de-identified data
   (framework P14).
2. Claude reads it and fills in the version doc's Results section. It includes:
   - turnout;
   - tallies and percentages for every multiple-choice question;
   - fact-check accuracy, and the most common wrong answer, which is a hint for the next
     slides;
   - write-in themes with counts;
   - bugs, grouped;
   - fun, as percentages per answer, read as a trend across versions (framework P12);
   - participation per class period (framework P11).
3. Claude proposes options and a recommendation, run through the framework's decision tests.
   Matt decides and writes down why, especially when it isn't the top vote (framework P4).
4. Claude adds the decided changes under "Coming next" in `CHANGELOG.md` as they're built, and
   drafts the next version's doc, including its name and the "You said, we did" slide.

Privacy: committed docs hold only counts, percentages and paraphrased themes. Never include
names, emails or identifying quotes. If the form records emails for Canvas completion credit,
that column is removed before Claude sees the file, and the raw export never leaves Matt's
computer.

## Version names and the changelog

- Versions are numbered V1, V2, V3… with no minor versions. An emergency fix to a released
  version keeps its number and is noted in its changelog entry.
- **Every version has a short descriptive name:** 2 to 4 plain words a 6th grader understands,
  saying what's new or what the topic is (one word is fine when Matt picks it, as with
  "V2 · Underground"). The name is set when the version is planned, never changes after release,
  and is used everywhere: the Start-screen label, slides, form title, Canvas post, version doc and
  changelog. URLs use the number only (`/v2/`), so they're easy to type.
- **`CHANGELOG.md`** has one entry per version, newest first, written for students:
  - **New:** what you can try;
  - **Because you voted:** each change, with the vote result, crediting class periods and never
    names;
  - **Fixed:** bugs.

  Add lines under "Coming next" as work lands. When the version is released, the heading
  becomes its number, name and date. The "You said, we did" slide is built from this entry.

### Frozen builds

Each version is a frozen copy of the single-file build at `wormsimulator.com/vN/`, so
students can go back and compare. The root URL follows `main` and is a preview for Matt only.
All versions share one origin and one localStorage, so save data must stay compatible both ways
(see `CLAUDE.md`).

Built in V1 prep. `npm run release -- N` checks the build is labelled VN, then copies
`dist/index.html` to `releases/vN/index.html`, which you commit. It refuses to overwrite a
released version unless you pass `--emergency-fix`. Render's build runs
`scripts/copy-releases.mjs`, which copies `releases/` into the site (`docs/hosting.md`).

## The current plan

See `roadmap.md` for the 8-week plan (V1–V8). In short:
- V1 · True Size (World scale vote);
- V2 · Underground (the first side-view dig level);
- V3 · First Bite (surface eating and Moisture);
- V4–V7 chosen by students;
- V8 · The Forest Changed (the finale).

## Files

- `FRAMEWORK.md`: the co-development principles every plan is checked against.
- `versions/vNN-<name-slug>.md`: one doc per version, made from `version-template.md`. Example:
  `v02-first-bite.md`, zero-padded so the files sort.
- `../../CHANGELOG.md`: what changed in each version, written for students.
- `../../releases/vN/index.html`: the frozen build students play at `/vN/`.
- `roadmap.md`: the 8-week plan.
- `topics.md`: the topic pool, with sources and prerequisites.
- `../../codev-raw/`: raw exports. Git-ignored and never committed.
