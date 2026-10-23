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

- **Research agent (Matt, 2026-10-11):** as soon as students choose a round's topic, Claude
  starts a separate research agent on it, before any building.
  - The agent finds facts from trusted sources: the Minnesota DNR, the University of Minnesota,
    Great Lakes Worm Watch, and peer-reviewed studies.
  - It writes each fact in plain words a 6th grader can read, with its source and link, and marks
    anything it couldn't confirm.
  - It saves the notes to `docs/codev/research/<topic>.md`.
  - The in-game intro, the form's fact question and `src/content/` use only facts from those
    notes.
  - Claude then builds the intro, and Matt approves or adjusts it before release.
- Every fact in it goes through `src/content/` with a source ID (`CLAUDE.md` non-negotiables).
  Where possible, it teaches through play rather than walls of text (P7).
- The game shows a short reminder to fill in the round's Google Form from Canvas. Links out are
  allowed (Matt, 2026-10-12), so it can link to the form too.
- Methods for the intro are being worked out in the "In-game learning intros" thread. Its first
  test topic is predators.

### Game design thinking (Matt, 2026-10-21)
Students practise one designer's habit every round: ask many small questions about one concrete
thing, decide, and say why (Liz England's "The Door Problem"). The full guide, written to reuse in
any future game, is `game-design-thinking.md`. In Worm Simulator:
- the lesson ends with a "Think like a game designer" step that asks the round's door questions
  about one feature (V4: eating), and the mission asks students to play like a designer;
- the form's design section is those door questions as multiple choice, plus "Real worm, or game
  choice? Why?" and "What would make you keep playing?" (player motivation, as what they'd do);
- each feature's spec records its door questions, the answers, the reasons, and which came from
  students.

### Rotating jobs (Matt, 2026-10-11)
Every student fills in the same form, but each round they have a **job**: a lens for looking at
their own design for the round's topic (Matt, 2026-10-12). Jobs rotate every round, so each
student tries each one. The jobs give quiet students a clear thing to say (P10), make designs
more specific (P2, P3), and spread attention across the whole game.

| Job | Lens on the design |
|---|---|
| **Scientist** | Is it true? What must the game show, and what must it not get wrong? |
| **Mechanic** | How does it play? What does the player do, and what makes it fair? |
| **Artist** | How does it look and sound? How would a player notice it? |

How it works:
- **Assignment:** Matt posts the job list in Canvas each round, rotated by a fixed order such as
  seat or roster position, so every student has each job once every three rounds. Each class
  period gets about a third of its students in each job. The list stays
  in Canvas and never goes into the repo (P14).
- **On the form:** "What was your job this round?" comes at the end of the expert section and
  branches to two questions for that job (`docs/codev/form-guide.md`). The form keeps the same
  shape every round (P12).
- **Results:** each job's answers are tallied separately, so the Friday summary reads like a
  report from each team.
- **Skipping jobs:** Matt can run a round without jobs (V3, 2026-10-12). Everyone then gets the
  same questions, one per lens (`form-guide.md`, "Rounds without jobs").
- **In the game (optional):** the in-game intro can end with "This round, look out for…" for each
  job, as text only.

### The form (from the class Canvas page)
One Google Form per version, titled "Worm Simulator VN · <Name>: Feedback". It takes about 10
minutes and works on a phone (P10, P11, P12). Its shape, rules and checklist are in
`docs/codev/form-guide.md` (Matt, 2026-10-12).

Students have just learned the round's topic, so they are the experts: the form collects their
designs (what to add, how it should work, and how they know) (P1, P2, P3). The sections are:

1. **Start:** how long did you play?
2. **You're the expert:** one check question, the design questions, then the job question, which
   branches.
3. **Your job:** two questions that look at the student's design through their job.
4. **Show us:** an optional drawing, and anything broken or confusing (for the bug list, P9).
5. **Vote** (P5): classmates' designs from last round (names removed, drawings included,
   shuffled, totals hidden), and the next topic when one is open.

From the round after a student design is built, the expert section adds "Does [the design] work
the way we designed it?" (Yes / Partly / No, and "What's different?") (P6). There are no feelings
or rating grids: no goal check and no fun rating (Matt, 2026-10-12).

Constraints shown to students (P2): one new thing per design, it has to fit one week's build, and
it has to be true of real worms or be a game choice that the game never states as fact (`CLAUDE.md` non-negotiables).

## 4. How a round runs

Each round follows the framework's cycle (section 4). Students vote on a topic, they learn it in
the game's intro, they design for it on the form, the design is built, and they critique it.

- **Topics are chosen by students' vote.**
- **V3 (Predators) is the first round run this way.**
- **Simple language:** everything students read or hear (the in-game intro, form questions,
  Canvas posts, the changelog) stays simple enough for a 6th grader. (Matt, 2026-10-11)
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
  approves them. In-game text still goes through `src/content/` with its source, or as a
  recorded game choice (never labelled on screen, Matt 2026-10-23).

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
- The game has no accounts, analytics or tracking, and its code can't send data anywhere
  (`CLAUDE.md`). Links out and embedded YouTube videos (youtube-nocookie.com) are allowed.
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

## 10. Experience goals (Matt, 2026-10-11)

These are how the game should *feel* to play, not what's in it (framework P6). They are mainly
the yardstick Matt and Claude use to judge ideas and builds, and students never need to learn
them. They stay the same from round to round unless Matt changes them on purpose (logged in the
decision log).

1. **Being a worm feels strange and real.**
2. **I can always tell where I am and what to do next.**
3. **What I learned changes how I play.**
4. **Everyone can play.**

Students don't rate the goals on the form (Matt, 2026-10-12). Matt and Claude judge each build
against them, from playtests and from the form's design and bug answers. This departs from
framework P6 on purpose (`decision-log.md`).

## 11. Living artifacts (framework section 6)

| Artifact | Where | Status |
|---|---|---|
| Strategy record | This file, section 1 | Done |
| Experience goals | This file, section 10 | Done |
| Rules of thumb (vetted claims) | `src/content/` (in-game facts with source IDs) and each version doc's fact table | Exists |
| Idea log | `docs/codev/idea-log.md` | To create, starting with V3's designs |
| Decision log | `docs/codev/decision-log.md` | Exists |
| Bug list | `docs/codev/bugs.md` | To create, from each form's "stuck" answers and playtests |
| Changelog | `CHANGELOG.md` | Exists |
| Architecture note | `CLAUDE.md` | Exists |
| Participation record | Each version doc's Results, per class period | Exists in the template |

## 12. Open decisions for Matt

None right now.
