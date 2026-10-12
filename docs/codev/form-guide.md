# Writing a round's Google Form

How to write each version's form. The form's job (Matt, 2026-10-12): **students have just
learned the round's topic in the game, so they are the experts. The form collects their expertise
as designs: what should be added to the game, and how it should work.** Every question serves that,
or it goes.

This applies `FRAMEWORK.md` P1 (learn first), P2 (students design), P3 (designs come with
evidence), P4 (only ask what we'll act on), P11 and P12 (short, stable, kid-friendly forms). How the
form fits a round is in `IMPLEMENTATION.md`, section 3.

## The shape (same every round)

About 10 minutes, and it works on a phone. Only the play-time and job questions are required.

| # | Section | Who | What it asks |
|---|---|---|---|
| 1 | **Start** | Everyone | How long did you play? |
| 2 | **You're the expert** | Everyone | One check question on the topic, then the design: *what* to add, *how it should work*, *how the worm senses it or acts on it*, and *how do you know*. Last, "What was your job this round?", which branches. |
| 3 | **Your job** | Branches by job | Two questions that look at the student's own design through their job (below). |
| 4 | **Show us** | Everyone | Optional drawing. One line for anything broken or confusing (it feeds the bug list, never the vote). |
| 5 | **Vote** | Everyone | Rank the options: classmates' designs from last round (from V4 on), and the next topic when one is open. |

From the round after a student design is built, section 2 also asks **"Does [the design] work the
way we designed it?"** (Yes / Partly / No, and "What's different?"). That is how students judge a
build against their design (P6).

### Play time and job (word for word every round)
- **How long did you play VN?** None / Less than 5 minutes / 5 to 10 minutes / More than 10
  minutes
- **What was your job this round?** Scientist / Mechanic / Artist (your job is posted in Canvas).
  It goes last in section 2: Google Forms only branches on a question in the same section.

### Jobs look at the design, not just the build
Each job is a lens on the student's own idea:

| Job | Lens | Example questions |
|---|---|---|
| **Scientist** | Is it true? | What is one true thing about it that the game must show? What should we be careful not to get wrong? |
| **Mechanic** | How does it play? | What does the player do when it happens? What makes it fair, so you can win or lose? |
| **Artist** | How does it look and sound? | What should it look and sound like? How would a player notice it? |

## Rules for every question

- **Ask about what students learned, not what isn't built.** Never ask students to judge a
  feature that isn't in the game yet. (V3's first draft asked if the game "matched what you learned
  about predators" when there were no predators.)
- **Only ask what we'll use.** Each question names where its answers go: the design shortlist, the
  bug list, the next topic, or the version doc's Results. Cut anything that goes nowhere.
- **No feelings or rating grids** (Matt, 2026-10-12): no "How did VN feel?", no experience-goal
  grid, no fun rating. Matt and Claude judge builds against the experience goals themselves
  (`IMPLEMENTATION.md`, section 10).
- **Simple words** a 6th grader reads easily. One idea per question. Positive wording.
- **Multiple-choice answers cover every case** with no gaps or overlaps (5 to 10, then more than
  10, never a missing "less than 5").
- **Every design question asks for evidence** (P3): a "How do you know?" line, or a sentence
  starter such as "The worm would ___ because ___." Starters come out over the rounds.
- **The check question uses only facts** from `docs/codev/research/<topic>.md`, and its answer is
  in the in-game lesson.
- **Name the constraints** at the top of section 2: one new thing, small enough to build in one
  week, true of real worms or called a "game choice".
- **Privacy:** "No names or faces in your drawing." Paper drawings are fine (Matt photographs
  them). Collect emails only if Canvas credit needs it (P14).
- **Vote options must be things we'd build if they win.** Matt checks each one first.

## Before it goes out (checklist)

- [ ] Every question answers "where does this go?"
- [ ] No question assumes something the game doesn't have yet.
- [ ] The play-time and job questions are word for word, and required. Everything else is optional.
- [ ] Sections branch by job (the job question's three-dot menu: "Go to section based on answer").
- [ ] The check question is marked as a quiz answer (Settings: "Make this a quiz").
- [ ] Matt has checked the vote options.
- [ ] A student could finish it in about 10 minutes on a phone.
- [ ] The paste-ready form is in the version doc, and a copy is in the project files.
