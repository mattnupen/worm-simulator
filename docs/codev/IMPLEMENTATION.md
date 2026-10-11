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
- **When it starts:** V3's form is the first Strategy A form. V2's form was already written
  and goes out as it is.
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

## 3. The form

There is one Google Form per version, titled "Worm Simulator VN · <Name>: Feedback". It has the
same four sections every time, takes about 10 minutes, and works on a phone (P10, P11, P12).
Students choose how much to do: **critique only** (sections 1–3) or **critique plus design**
(sections 1–4) (P11).

1. **Learn** (P1). A link to the topic slides for the next design topic, plus 1 or 2 check
   questions. Facts come from the version doc's sourced fact table.
2. **Critique VN** (P6, P12). The same questions every time:
   - Could you play VN? (Yes / It wouldn't load / I didn't have time)
   - Did you get stuck? Where?
   - I like… / I wish…
   - Once the build includes a student design: "Does [the design] work the way we designed it?"
     (Yes / Partly / No), with a box for "What's different?"
   - A smiley-face fun rating, read as a trend across versions, never as an absolute score.
3. **React to classmates' designs** (P5). A shortlist of 3 to 4 designs from the last form.
   - Names are removed and drawings are included.
   - Google Forms' option shuffle puts the designs in a random order, and totals are never
     shown.
   - Students rank their top 2, then answer "What would you add or change?"
4. **Design for the next topic** (P2, P3). This section is optional.
   - What should we add? How should it work in the game?
   - How do you know? Where did you learn it?
   - Sentence starters come out over the rounds: full frames in V3, partial frames later, then
     none.
   - Optional drawing upload, or a paper drawing that Matt photographs.
   - A reminder: "No names or faces in your drawing" (P14).

Constraints shown to students in section 4 (P2): one new thing per design, it has to fit one week's
build, and it has to be true of real worms or labelled as a game choice (`CLAUDE.md`
non-negotiables).

## 4. The pipeline

Each form does three jobs at once (framework section 4, Layered Elaboration). It critiques the
current build, ranks the designs collected in the last form, and collects designs for the next
topic.

| Form for | Critiques | Ranks designs from | Collects designs for | Winner built into |
|---|---|---|---|---|
| V3 | V3 · First Bite | none yet | the topic students picked on V2's form | V5 |
| V4 | V4 | V3's form | next topic | V5 |
| V5 | V5 (first student-designed build) | V4's form | next topic | V6 |
| V6 | V6 | V5's form | next topic | V7 |
| V7 | V7 | V6's form | finale | V8 |

The gap from design to build is two versions: design in week N, rank in week N+1, build that
weekend. **V4 is a teacher-designed (Strategy C) build**, because no student design has been
ranked yet. `roadmap.md` needs updating to match. See "Open decisions."

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

## 10. Living artifacts (framework section 6)

| Artifact | Where | Status |
|---|---|---|
| Strategy record | This file, section 1 | Done |
| Experience goals | `docs/codev/experience-goals.md` | **To create.** Matt sets 3 or 4, written as feelings |
| Rules of thumb (vetted claims) | `src/content/` (in-game facts with source IDs) and each version doc's fact table | Exists |
| Idea log | `docs/codev/idea-log.md` | To create, starting with V3's designs |
| Decision log | `docs/codev/decision-log.md` | To create. First entries: framework adopted, Strategy A chosen (2026-10-11) |
| Bug list | `docs/codev/bugs.md` | To create, from each form's "stuck" answers and playtests |
| Changelog | `CHANGELOG.md` | Exists |
| Architecture note | `CLAUDE.md` | Exists |
| Participation record | Each version doc's Results, per class period | Exists in the template |

## 11. Open decisions for Matt

1. **Experience goals.** What 3 or 4 feelings should every build be judged against?
2. **Who picks the design topics after V3?**
   - Option A: Matt picks from `topics.md`, keeping the forms short. *(recommended)*
   - Option B: students rank topics too, in section 3.
3. **What V4 builds.** No student design has been ranked by then, so V4 is teacher-designed
   (Strategy C). It could be a core-feel round, or a small slice Matt designs. The topic students
   picked on V2's form is designed on V3's form and built in V5.
4. **Closing the gap.** Should we cut the design-to-build gap to one version by having students
   rank the shortlist in a 2-minute class vote on Monday, instead of on the next form?
