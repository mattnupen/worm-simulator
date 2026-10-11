# Worm Simulator

A 3D game for 6th graders in northern Minnesota. Students play an invasive earthworm on a
forest floor. The game runs on low-end school Chromebooks and is live at https://wormsimulator.com.

**The game is co-developed with students, one version a week (V1, V2, V3…).** For each version,
students learn one worm topic in the game's learning intro, play that version, and answer a Google Form. Their input
steers what gets built next, and Matt decides.

**`docs/codev/FRAMEWORK.md` guides all co-development work.** Every plan, ballot, feature or
process change must trace to its principles and pass its decision tests (section 5). If a plan
conflicts with a principle, stop and raise it with Matt: either change the plan, or amend the
framework on purpose and record why in the decision log. **Never edit `FRAMEWORK.md` to fit this
project.** How Worm Simulator applies it (Strategy A, async form-led co-design) is in
`docs/codev/IMPLEMENTATION.md`, and the weekly schedule and materials are in `docs/codev/README.md`.

## Read first

| What | Where |
|---|---|
| **Co-development framework (principles and decision tests; guides all work)** | `docs/codev/FRAMEWORK.md` |
| How Worm Simulator implements it (strategy, form, pipeline, roles, living artifacts) | `docs/codev/IMPLEMENTATION.md` |
| Weekly schedule, slides, version names, changelog | `docs/codev/README.md` |
| Current and past versions | `docs/codev/versions/` |
| What changed in each version (student-friendly) | `CHANGELOG.md` |
| Topic pool students vote from | `docs/codev/topics.md` |
| The 8-week plan (V1–V8) | `docs/codev/roadmap.md` |
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
npm run build && node scripts/perf-gates.mjs 4   # perf gates (every preset, surface and underground), relative to a Step 0 build
npm run release -- <N> # freeze the build as releases/vN/index.html (after Matt approves the root build)
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

The principles are in `docs/codev/FRAMEWORK.md`, how we apply them is in
`docs/codev/IMPLEMENTATION.md`, and the weekly schedule, slides, version names and changelog are
in `docs/codev/README.md`. This section only
holds what that means for the code and the repo.

### How co-development shapes the code
- **Real size always (Matt, 2026-10-06):** every version from V2 on uses real (True) size. World
  scale was retired in V2; V1 keeps it, frozen at `/v1/`.
- **Ballot choices ship as settings behind one default.** World scale (Classic, Hybrid, True) was
  the first example: students try each option, then vote. V2's underground camera (Wide or Close,
  `undergroundView` in `src/save/settingsStore.ts`) is the current one.
  - One place holds every option, and nothing else knows which is on. (V1's table,
    `src/surface/worldScale.ts`, was deleted with World scale; V2 keeps one `REAL_SCALE`
    in `src/surface/realScale.ts`.)
  - Switching never compiles shaders: everything is built at load, and a switch changes only
    uniforms, visibility or draw ranges.
  - A setting is saved only when the player really picks it, so a device that never chose
    follows the default. Applying a vote is then a one-line default change that reaches every
    device that hasn't picked. Careful: students who try every option end up with a stored pick,
    so before applying a vote that keeps more than one mode, plan how the new default reaches
    them (e.g. store the default in effect with each pick and ignore picks made under an old
    default).
  - Delete the losing modes once a decision is settled, unless Matt decides to keep the choice.
- **Versions are small:** one headline change plus fixes (framework P8). If an idea won't fit
  one version, ship the smallest meaningful slice. Specs and plans still go in
  `docs/superpowers/` and name the version they serve.
- **Each build shows its version** as a small label on the Start screen, such as "V2 · First Bite".
- **Versioned URLs.** Each released version is a frozen single-file snapshot served at
  `/vN/`. A snapshot is never rebuilt or edited, except for an emergency fix noted in its
  version doc. The root `/` follows `main` as Matt's preview, and students only get version links.
  `npm run release -- N` freezes `releases/vN/index.html` (it refuses an existing one without
  `--emergency-fix`). Render's build runs `scripts/copy-releases.mjs` to copy `releases/` into
  the site (`render.yaml`, `docs/hosting.md`).
- **One origin, shared saves.** Every version runs on wormsimulator.com, so they share
  localStorage. A new build must read older saves without crashing, and an older build must
  ignore unknown fields. Never repurpose an existing save key.
- **Release checklist for a version:**
  1. unit tests, e2e tests and perf gates pass;
  2. the Start-screen label (`src/version.ts`) shows the new number and name;
  3. merge to `main`, push, and Matt checks the root build;
  4. once Matt approves: the "Coming next" changelog entry becomes "VN · Name (date)", then
     `npm run release -- N`, commit and push `releases/vN/index.html` with the changelog, tag the
     release (`git tag vN && git push origin vN`, framework P13), and check that
     `wormsimulator.com/vN/` serves it;
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

**Learning happens in the game (Matt, 2026-10-11).** Each round opens with an interactive
in-game learning intro on the round's topic. Claude researches the topic and drafts the intro,
and Matt approves or adjusts it. Every fact goes through `src/content/` with a source. The game
reminds students to fill in the form from Canvas, as text only and never a link. See
`docs/codev/IMPLEMENTATION.md`, section 3.

### Feedback data (framework P14)
- Raw form exports go in `codev-raw/`, which is git-ignored, and never anywhere else in the repo.
  Matt removes names, emails and other identifying columns before Claude reads an export.
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
