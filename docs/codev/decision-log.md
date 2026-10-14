# Decision log

Deliberate choices about how Worm Simulator applies `FRAMEWORK.md`, newest first. Each entry says
what was decided, who decided, and why (framework P15). Product decisions from each round's vote
live in that version's doc.

## 2026-10-14: Burrow Board stores student ideas (Matt)
- **Decided:** Burrow Board (`burrow-board/`) is a separate app, linked from the game, where
  students post ideas and drawings and build on each other's. It stores them on the project's own
  Render service at wormsimulator.com/burrow/ until Round 8 ends, and then everything is deleted.
  Students sign in with logins the teacher makes (a username like `bluehawk32` and a password,
  handed out from a CSV). There are no Google accounts, real names or emails. The teacher may set a
  nickname per login. New cards show right away, the teacher can hide any card, and every period
  starts together.
- **Why:** the Google Form collects ideas one student at a time, so students can't see or build
  on each other's thinking (build brief, `codev/burrow-board-next.md` in the project files).
- **Framework:** this is a deliberate exception to P14 ("collect input through school accounts";
  the decision test "Does it add data collection…? If so, stop."). Matt approved it on
  2026-10-14. It keeps the rest of P14:
  - only a username, a period, an optional nickname, cards, notes, drawings and timestamps are
    stored;
  - there are no analytics, trackers or IP addresses;
  - students are told to keep names and faces out of drawings;
  - Claude gets only the board export, which uses usernames and periods;
  - everything is deleted at project end.

  Matt still gets district sign-off and tells families before students use it. The game itself
  still collects nothing.

## 2026-10-12: V3 runs without jobs (Matt)
- **Decided:** students weren't given jobs for V3. Everyone answers the same form, with one
  question from each job's lens and no branching. Jobs stay in `IMPLEMENTATION.md` for later
  rounds, and Matt decides each round whether to use them.
- **Why:** Matt didn't divide students into roles this week.

## 2026-10-12: The form collects designs, not ratings (Matt)
- **Decided:** each round's form treats students as experts on the topic they just learned. It
  asks what to add, how it should work, and how they know. It no longer asks students to rate the
  experience goals or how fun the build was, and the jobs became lenses on the student's own
  design. The rules are in `form-guide.md`.
- **Why:** Matt: "the purpose of this form is for students to provide their new expertise on the
  topic for this round to say what and how things should be added into the game." Questions about
  feelings, and about features not built yet, didn't serve that.
- **Framework:** this departs from P6's "students compare the build to the experience goals".
  P6 stays partly met: once a student design ships, the form asks "Does it work the way we
  designed it?". Matt and Claude judge builds against the experience goals themselves.

## 2026-10-11: Strategy A chosen (Matt)
Async form-led co-design (`FRAMEWORK.md`, section 3), adapted in `IMPLEMENTATION.md`: learning
happens in the game, and the form is filled in from Canvas.

## 2026-10-11: Framework adopted (Matt)
`FRAMEWORK.md` (v2) guides all co-development work. It is never edited to fit this project.
How this project applies it is in `IMPLEMENTATION.md`.
