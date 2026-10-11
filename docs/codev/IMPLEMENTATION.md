# How Worm Simulator implements the co-development framework

The framework (`FRAMEWORK.md`) holds the principles, and it is never edited to fit this project. This
file records how Worm Simulator applies it: the strategy we chose, what the form looks like, who
does what, and where each living artifact lives. When this file and the framework disagree, the
framework wins. Change this file, or amend the framework on purpose and log it in the decision
log.

Timing, topic order and dates live in `README.md` (the weekly schedule) and `roadmap.md`.

## 1. Strategy record

- **Strategy A: Async form-led co-design** (framework section 3). Chosen by Matt on 2026-10-11.
- **Why:** there's almost no class time, about 90 students in several class periods, and
  participation is optional homework.
- **What came before:** V1 and V2 ran closer to Strategy C. Matt designed the features, and
  students played, reported and voted. That fits the framework's "C for the first rounds" mix,
  which settles the core feel (crawling, digging, the camera) first.
- **When it starts:** with V3. V2's form was already written and goes out as it is.
- **Fallback:** when a big decision needs every voice, add a short in-class vote to the async
  form ("A plus a short in-class vote", framework section 3). Record each switch in the decision log.

## 2. Roles

- **Students:** designers and critics on topics they've learned, and informants and testers on
  everything else (P1, P2).
- **Matt:** editor, product owner and decider. Matt sets constraints, checks accuracy against
  sources, merges similar designs, sizes them to one build, and announces each decision with
  his reasons (P2, P5).
- **Claude:** builder. Claude drafts the form, tallies de-identified responses, proposes a
  shortlist, and builds the chosen design as faithfully as the constraints allow. Claude flags
  any place where the build has to differ from the student design, and never quietly redesigns
  it (P2).

## 3. Learning in the game, voting on the form

### In-game learning intro (P1, P7)
Each round opens with an **interactive learning intro inside the game**, not a separate slide
deck. It teaches the background students need for that round's decisions. This means fewer clicks,
and no switching back and forth between tabs. (Matt, 2026-10-11)

- **How it's made:** Matt gives Claude the next round's topic. Claude researches it with sources,
  builds the intro, and Matt approves or adjusts it before release.
- Every fact in it goes through `src/content/` with a source ID (`CLAUDE.md` non-negotiables).
  Where possible, it teaches through play rather than walls of text (P7).
- The game shows a short reminder to fill in the round's Google Form. The reminder is text only,
  never a link, because the game stays offline.
- Methods for the intro are being worked out in the "In-game learning intros" thread. Its first
  test topic is predators.

### Rotating jobs (Matt, 2026-10-11; draft)
Every student fills in the same form, but each round they have a **job**: a part of the game to
watch closely while they play. Jobs rotate every round, so each student tries each one. The jobs
give quiet students a clear thing to report (P10), make the critique more specific (P6), and
spread attention across the whole game. Each job ties to an experience goal (section 10).

| Job | What to watch | Experience goal it checks |
|---|---|---|
| **Scientist** | Does the game match what we learned? Is anything untrue or missing? | What I learned changes how I play. |
| **Mechanic** | Do the controls and actions work? Does the new design work the way we designed it? Where did you get stuck or lost? What broke? Could you play on your device? | I can always tell where I am and what to do next. Everyone can play. |
| **Artist** | How does it look and feel? Does it look like a real forest floor? Can you see everything clearly? Does moving feel like being a worm? | Being a worm feels strange and real. |

How it works:
- **Assignment:** Matt posts the job list in Canvas each round, rotated by a fixed order such as
  seat or roster position, so every student has each job once every three rounds. Each class
  period gets about a third of its students in each job. The list stays
  in Canvas and never goes into the repo (P14).
- **On the form:** the first question is "My job this round." The form then branches to 1 or 2
  questions for that job, and every student also answers the shared critique questions. The form
  keeps the same shape every round (P12).
- **Results:** each job's answers are tallied separately, so the Friday summary reads like a
  report from each team.
- **In the game (optional):** the in-game intro can end with "This round, look out for…" for each
  job, as text only.

### The form (from the class Canvas page)
One Google Form per version, titled "Worm Simulator VN · <Name>: Feedback". It keeps the same
sections every time, takes about 10 minutes, and works on a phone (P10, P11, P12). Students
choose how much to do: **critique only** (sections 1–2) or **critique plus design** (sections 1–3)
(P11).

1. **Critique VN** (P6, P12). The same questions every time, after "My job this round" and that
   job's questions:
   - Could you play VN? (Yes / It wouldn't load / I didn't have time)
   - Did you get stuck? Where?
   - I like… / I wish…
   - Once the build includes a student design: "Does [the design] work the way we designed it?"
     (Yes / Partly / No), with a box for "What's different?"
   - A smiley-face fun rating, read as a trend across versions, never as an absolute score.
2. **Vote** (P5). Students rank the round's options: a shortlist of classmates' designs (names
   removed, drawings included, shuffled), and the next topic when one is open. Totals are hidden.
   The section ends with "What would you add or change?"
3. **Design for the round's topic** (P2, P3). This section is optional, and it builds on what the
   in-game intro taught.
   - What should we add? How should it work in the game?
   - How do you know? Where did you learn it?
   - Sentence starters come out over the rounds.
   - Optional drawing upload, or a paper drawing that Matt photographs.
   - A reminder: "No names or faces in your drawing" (P14).

Constraints shown to students in section 3 (P2): one new thing per design, it has to fit one week's
build, and it has to be true of real worms or labelled as a game choice (`CLAUDE.md`
non-negotiables).

## 4. How a round runs

Each round follows the framework's cycle (section 4). Students vote on a topic, they learn it in
the game's intro, they design for it on the form, the design is built, and they critique it.

- **Topics are chosen by students' vote.** Predators is the current pick (2026-10-11).
- **V4 works like V3:** it's built around a new topic students voted on.
- The order of topics and the dates are in `roadmap.md`. The roadmap needs updating to match.

## 5. Friday routine

1. Matt exports the responses into `codev-raw/` (git-ignored) and removes names, emails and
   anything else identifying. Upload filenames contain student names, so Matt renames or strips
   them before Claude sees the drawings (P14).
2. Claude tallies the de-identified data into the version doc's Results, with participation per
   class period (P11).
3. **Ranking:** Claude totals the ranks per class period, then weights each period equally (P5,
   P10). Claude proposes a decision, and Matt decides and writes down why, especially when it
   isn't the top choice. The decision goes in the decision log.
4. **New designs:** Claude groups similar designs, checks each against the sources and the
   decision tests, sizes it to one build, and proposes a 3 to 4 design shortlist for the next form.
   Matt edits and approves it. Every design gets a line in the idea log (shortlisted, merged,
   built or parked), with a reason (P4).
5. Claude builds the decided design (one headline change plus bug fixes, P8, P9) and drafts the
   next version doc, slides, form and Canvas post.

## 6. Closing the loop (P4)

- **Monday in class (1 to 2 minutes):** Matt shows the "You said, we built" slide: what students
  designed, what was built, and what wasn't built and why.
- **`CHANGELOG.md`:** "Because you voted" becomes "You designed": credit by class period, never by
  name.
- **In the game:** a short credit such as "Designed by Period 3" next to a student-designed
  feature. Student drawings can be used in the build when they have no names or faces and Matt
  approves them. In-game text still goes through `src/content/` with its source or "Game choice"
  label.

## 7. Equity (P10)

Strategy A over-represents motivated students and students with internet at home. To offset this:
- weight class periods equally in every ranking;
- accept paper drawings, photographed in;
- keep the form phone-friendly;
- Matt personally invites quiet students and students who aren't taking part;
- watch participation per period each week (P11, P15), and switch to an in-class vote for big
  decisions when a period's turnout is low.

## 8. Privacy (P14)

- Students fill in forms with their school Google accounts. Drawing uploads need sign-in anyway.
- Claude only ever sees de-identified data. Raw exports stay in `codev-raw/` on Matt's computer.
- The game stays offline, with no accounts, analytics or tracking (`CLAUDE.md`).
- **Matt to confirm:** district sign-off and the note to families. Delete the form responses
  after the finale.

## 9. Guardrails for AI-built code (P13)

| Framework asks for | Worm Simulator has |
|---|---|
| Architecture note | `CLAUDE.md` and `docs/superpowers/visual-quality-brief.md` |
| One change per session | One headline change per version, specs and plans per version (`CLAUDE.md`) |
| Tag per release | **New:** `git tag vN` at each release (added to the release checklist) |
| Smoke test on the weakest device | e2e tests, perf gates, and a student Chromebook check |
| Instant rollback | Students only get `/vN/` links, so re-post the last version's link, or ship an emergency fix |
| Released version always playable | Frozen `/vN/` snapshots, which are never rebuilt |

## 10. Experience goals (draft, for Matt to confirm)

These are how the game should *feel* to play, not what's in it (framework P6). Every build is
checked against them, and they stay the same from round to round unless Matt changes them on
purpose (logged in the decision log).

1. **Being a worm feels strange and real.**
2. **I can always tell where I am and what to do next.**
3. **What I learned changes how I play.**
4. **Everyone can play.**

## 11. Living artifacts (framework section 6)

| Artifact | Where | Status |
|---|---|---|
| Strategy record | This file, section 1 | Done |
| Experience goals | This file, section 10 | **Draft.** Matt to confirm |
| Rules of thumb (vetted claims) | `src/content/` (in-game facts with source IDs) and each version doc's fact table | Exists |
| Idea log | `docs/codev/idea-log.md` | To create, starting with V3's designs |
| Decision log | `docs/codev/decision-log.md` | To create. First entries: framework adopted, Strategy A chosen (2026-10-11) |
| Bug list | `docs/codev/bugs.md` | To create, from each form's "stuck" answers and playtests |
| Changelog | `CHANGELOG.md` | Exists |
| Architecture note | `CLAUDE.md` | Exists |
| Participation record | Each version doc's Results, per class period | Exists in the template |

## 12. Open decisions for Matt

1. **Confirm the experience goals** (section 10), or change any of them.
2. **Confirm the jobs** (section 3): Scientist, Mechanic and Artist, and how to rotate them.
