# Worm Simulator

A 3D game for 6th graders in northern Minnesota. Students play an invasive earthworm on a
forest floor. The game runs on low-end school Chromebooks and is live at https://wormsimulator.com.

**The game is co-developed with students, one version a week (V1, V2, V3…).** For each version,
students learn one worm topic from slides, play that version at home, and answer a Google Form. Their votes and
ideas steer what gets built next. Every piece of work must fit this loop (see "Co-development"
below). The full playbook is `docs/codev/README.md`.

## Read first

| What | Where |
|---|---|
| Co-development playbook (versions, forms, votes, privacy) | `docs/codev/README.md` |
| Current and past versions | `docs/codev/versions/` |
| What changed in each version (student-friendly) | `CHANGELOG.md` |
| Topic pool students vote from | `docs/codev/topics.md` |
| Parent game design (vision, science, accessibility) | `docs/superpowers/specs/2026-09-30-worm-simulator-design.md` |
| Latest handoff | newest file in `docs/superpowers/handoff/` |
| Visual and performance rules (**read before any rendering work**) | `docs/superpowers/visual-quality-brief.md` |
| Hosting | `docs/hosting.md`, `render.yaml` |

## Commands

```bash
npm run dev            # Vite dev server
npm test               # Vitest unit tests
npm run test:e2e       # build + Playwright
npm run verify:build   # build + single-file check
npm run build && node scripts/perf-gates.mjs 4   # performance gates, relative to a Step 0 build
```

Benchmark with only one agent running. This Mac is often busy, so perf gates compare against a
Step 0 build side by side rather than absolute fps.

## Non-negotiables (students can't vote these away)

- **Science honesty.** Every student-facing fact, in the game or on slides, has a source. In-game
  text lives in `src/content/` with a source ID, and the build fails without one. Game
  exaggerations are labelled "Game choice". A student idea that isn't true of real worms can
  only ship as a labelled game choice, or become a "myth or fact?" teaching moment on the next
  slides.
- **Framing.** The forest is never "destroyed" or "dying". It *changed*: some species win and
  some lose.
- **Accessibility.** This covers parent spec section 7. Meaning is never carried by colour
  alone, menus are real web elements, nothing flashes more than 3 times per second, and every
  input method works.
- **Chromebook performance.** Every graphics preset passes the perf gates. Real 30 fps on student
  Chromebooks.
- **No network at runtime.** The CSP blocks every outside connection. The game never links to
  the form or collects data. Canvas holds all links.
- **Student privacy.** See "Feedback data" below. Keep the school's name out of all docs.

## Co-development

### The weekly cycle
1. **Live (Mon):** Matt posts in Canvas the slides, the build link
   `wormsimulator.com/vN/` and the Google Form.
2. **Play and respond (Mon–Thu):** students play at home and fill in the form (about 10 minutes).
3. **Close and summarise (Fri):** Matt exports the responses. Claude tallies them into the version
   doc's Results section and proposes decisions using the consensus rules. Matt confirms.
4. **Build (Fri–Sun):** build VN+1, then prep its slides, form and Canvas text.

### Version numbers, names and the changelog
- Versions are numbered V1, V2, V3… with no minor versions. An emergency fix to a released
  version keeps its number and is noted in its changelog entry.
- **Every version has a short descriptive name:**
  - 2 to 4 plain words a 6th grader understands, saying what's new or what the topic is
    (for example "V2 · First Bite");
  - set when the version is planned, and never changed after release;
  - used everywhere: the Start-screen label, slides, form title, Canvas post, version doc and
    changelog.
- **`CHANGELOG.md`** has one entry per version, newest first, written for students:
  - **New:** what you can try;
  - **Because you voted:** each change, with the vote result, crediting class periods and never
    names;
  - **Fixed:** bugs.

  Add lines under "Coming next" as work lands. When the version is released, the heading
  becomes its number, name and date. The "You said, we did" slide is built from this entry.

### Who steers what
- **Students vote on:**
  - *how* things work: the design question for each version;
  - *which topic* comes next: 3 options from `docs/codev/topics.md`, each vetted so it's
    sourced, its prerequisites are built, and it's buildable in about a week;
  - which themes from last version's write-in ideas get built.
- **Matt sets** the non-negotiables above and vets every option before it reaches a ballot.
  **Every option on a form must be something we will build if it wins.**
- **Timing lag:**
  - a "how" vote from VN ships in VN+1;
  - a topic vote from VN ships in VN+2, which gives a full week to build it;
  - Matt picks the topics for V1 and V2.

### Consensus rules
- All class periods' answers are combined. Plurality wins.
- **Close call:** if the top two are within 10 percentage points, ship both as a toggle and
  hold a runoff on the next form.
- **Diverge, then converge.** "Other" write-ins and idea-box answers are grouped into themes.
  The top 3 to 4 vetted themes become options on the next form.
- **Matt's veto** applies only on non-negotiable grounds, and the reason is explained to students
  on the next version's first slide.
- **Close the loop.** Every version's first slide is "You said, we did": the vote results and what
  changed because of them.

### How co-development shapes the code
- **Ballot choices ship as settings behind one default.** World scale (Classic, Hybrid, True) is
  the pattern: students try each option, then vote. Applying a vote is a one-line default
  change. Delete the losing modes once a decision is settled, unless students voted to keep the
  choice.
- **Versions are small.** Size each version's new work to about one week. Split big features
  across versions so every version has something new to try and something to vote on. Specs and
  plans still go in `docs/superpowers/` and name the version they serve.
- **Each build shows its version** as a small label on the Start screen, such as "V2 · First Bite".
- **Versioned URLs.** Each released version is a frozen single-file snapshot served at
  `/vN/`. A snapshot is never rebuilt or edited, except for an emergency fix noted in its
  version doc. The root `/` follows `main` as Matt's preview, and students only get version links.
  *Not built yet: setting this up is the first task of V1 prep.*
- **One origin, shared saves.** Every version runs on wormsimulator.com, so they share
  localStorage. A new build must read older saves without crashing, and an older build must
  ignore unknown fields. Never repurpose an existing save key.
- **Release checklist for a version:**
  1. unit tests, e2e tests and perf gates pass;
  2. the Start-screen label shows the new number and name;
  3. the "Coming next" changelog entry becomes the version's entry;
  4. the snapshot is saved to `releases/vN/index.html` and served at `/vN/`;
  5. a student Chromebook check is done if rendering changed.

### Each version's materials (Claude drafts, Matt publishes)
Create `docs/codev/versions/vNN-<name-slug>.md` (for example `v02-first-bite.md`, zero-padded so
the files sort) from `docs/codev/version-template.md`. It holds:
- the topic, with sourced facts;
- the "while you play, notice…" prompt;
- what's new in the build;
- the ballot options, and what each one would build;
- paste-ready Google Form questions;
- the slide text;
- the Canvas announcement.

After the form closes, it also holds the results and the decisions.

The learning unit is **slides only**, so the game carries no lesson text beyond its normal
goals and labels. When Matt asks, Claude can build the slides as Google Slides; load the
google-workspace skill first.

### Feedback data
- Raw form exports go in `codev-raw/`, which is git-ignored, and never anywhere else in the repo.
- Committed docs hold only counts, percentages and paraphrased themes. Never include names,
  emails, class rosters, or quotes that could identify a student. Short anonymous quotes are fine.
- Credit student ideas by class period ("Ideas from Period 3"), never by name.

## How Matt likes to work
- Before work starts, ask quick multiple-choice design questions, batched. Then he approves the
  spec and says to proceed autonomously.
- Process: superpowers brainstorming → spec → writing-plans → subagent-driven development, with
  spec and code-quality reviews.
- Finishing development work: fast-forward merge to `main`, run the tests, push (Render
  deploys), check that wormsimulator.com serves the new build, then cut the version snapshot.
- fal.ai art: there's a hard $5 cap, and every request is logged in `art/spend-log.md`.
