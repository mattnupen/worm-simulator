# Running Worm Simulator's co-development

Worm Simulator's weekly schedule, what students see, version names and the changelog.

**The principles live in [`FRAMEWORK.md`](FRAMEWORK.md), and they win.** How this project applies
them (Strategy A, the form, the pipeline, roles, living artifacts) is in
[`IMPLEMENTATION.md`](IMPLEMENTATION.md). This file only holds the schedule and materials. When something here conflicts with the framework,
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

Each form critiques the current build, ranks the last form's designs, and collects designs for
the next topic. The full pipeline is in `IMPLEMENTATION.md`, section 4.

Matt picked the topics for V1, V2 and V3, and picks the V8 finale. V2's form chose the first
student topic, which students design on V3's form (`IMPLEMENTATION.md`, section 4). The current
plan is in `roadmap.md`.

## What students see each version

1. **In the game:** the round's interactive learning intro on the topic (`IMPLEMENTATION.md`,
   section 3). It ends with a text reminder to fill in the form from Canvas.
2. **In Canvas:** a short post with the build link `https://wormsimulator.com/vN/`, the Google
   Form link, and the due date.
3. **Monday in class (1 to 2 minutes):** "You said, we built." It covers what students said and
   designed, what was built, and what wasn't built and why (framework P4). It's built from this
   version's `CHANGELOG.md` entry.

## The form and the Friday summary

See `IMPLEMENTATION.md`: section 3 covers the in-game intro and the form, and section 5 the
Friday routine. Make each version's form by copying last week's form, so the sections stay the same.

Privacy: committed docs hold only counts, percentages and paraphrased themes. Never include
names, emails or identifying quotes. Raw exports stay in `codev-raw/` on Matt's computer, and
Claude only sees de-identified copies.

## Version names and the changelog

- Versions are numbered V1, V2, V3… with no minor versions. An emergency fix to a released
  version keeps its number and is noted in its changelog entry.
- **Every version has a short descriptive name:** 2 to 4 plain words a 6th grader understands,
  saying what's new or what the topic is (one word is fine when Matt picks it, as with
  "V2 · Underground"). The name is set when the version is planned, never changes after release,
  and is used everywhere: the Start-screen label, form title, Canvas post, version doc and
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

- `FRAMEWORK.md`: the co-development principles every plan is checked against. Never edited to fit this project.
- `IMPLEMENTATION.md`: how Worm Simulator applies the framework.
- `versions/vNN-<name-slug>.md`: one doc per version, made from `version-template.md`. Example:
  `v02-first-bite.md`, zero-padded so the files sort.
- `../../CHANGELOG.md`: what changed in each version, written for students.
- `../../releases/vN/index.html`: the frozen build students play at `/vN/`.
- `roadmap.md`: the 8-week plan.
- `topics.md`: the topic pool, with sources and prerequisites.
- `../../codev-raw/`: raw exports. Git-ignored and never committed.
