# Game design thinking: ask questions, then decide, and know why

How we help students (and ourselves) think like game designers. It is written to work for any
co-developed game, not only Worm Simulator. It adds to `FRAMEWORK.md` and never replaces it: it is
one way to apply P2 (students design), P3 (designs come with evidence) and P7 (build learning into
the mechanics).

**Where it comes from (Matt, 2026-10-21):** Liz England, ["The Door Problem" of Game
Design](https://www.gamedeveloper.com/design/-quot-the-door-problem-quot-of-game-design) (Game
Developer, 2014), and Matt's notes on it: *game design is all about asking questions and then making
decisions. For every decision, dig into the "why". Those questions should lead up to goals: who
is the game for, and what motivates its players?*

## 1. The big idea

England explains game design with a door. Is there a door in your game? Can the player open it?
Every door, or are some just for show? How does the player tell the difference? How do they open
it? Can it lock? What happens with two players, or with an enemy too big to fit? Someone has to
answer all of that, and that someone is the designer.

Three lessons for a classroom:

1. **Design is mostly ordinary questions about one concrete thing.** Not a big idea, but many
   small answers. A student who answers ten questions about one thing has designed more than a
   student with ten big ideas.
2. **Every answer is a decision with a reason.** "Because it's what real worms do", "because it's
   fairer", "because players will notice it": the reason is what makes it design, and what lets us
   judge the build later (P3, P6).
3. **Many jobs touch one feature.** In England's list, more than 30 roles each see the same door
   differently: the artist draws it, the sound designer makes it creak, the tester runs into it, and
   the player may not even notice it. Students' rotating jobs (Scientist, Mechanic, Artist) are
   small versions of this.

## 2. Start from goals

Before the small questions, the big ones. Write the answers down once per game, and revisit them
on purpose.

- **Who is the game for?** Age, where they play, on what device, how long, alone or together.
- **What motivates them?** Common player motivations:
  - **mastery:** getting better at something hard;
  - **challenge:** beating a goal, a score or a clock;
  - **exploration:** finding things and places;
  - **expression:** making choices that show who you are;
  - **collaboration:** working with others;
  - **competition:** doing better than others;
  - **story:** finding out what happens.
- **What should it feel like?** The experience goals (framework P6).

For Worm Simulator, the answers are in `CLAUDE.md` (6th graders in northern Minnesota, school
Chromebooks) and `IMPLEMENTATION.md`, section 10 (experience goals). Players' motivations are asked
on the form (section 5 below), as what they would do, not as a rating.

## 3. The door questions, for any feature

Pick one concrete thing from the round's topic (for V4, eating). Ask:

| Question | Example (eating) |
|---|---|
| **Is it there?** What exactly is it? | What can the worm eat? Which leaves? |
| **Can the player use it?** All of them, or some just for show? | Can every leaf be eaten, or only some? |
| **How does the player know?** (Never by colour alone.) | How do you tell food from a leaf you can't eat? |
| **How do they use it?** Touch, press, hold, a mini-game? | Is eating automatic, a button, a hold, or dragging a leaf into the burrow? |
| **What happens after?** | Does the worm grow, get energy, move faster? Does the forest change? |
| **What if they don't, or it fails?** | What happens if the worm doesn't eat? |
| **Who or what else is involved?** | Robins hunt where the food is. Other worms eat the same leaves. |
| **What size, where, when?** | Real size? Only at night, only when damp? |
| **What can go wrong?** (The tester's question.) | Getting stuck on a leaf, eating while a robin attacks. |
| **Real, or a game choice? Why?** | Real worms have no energy bar. If we add one, it is a labelled game choice, and we say why. |

## 4. The "why" test for every decision

For each answer, ask *why*, then check it against the goals:

- **More real, or less real? Why?** Real is the default here (science honesty). Less real is fine
  when it serves a goal (fair, clear, fun, accessible), and it is then labelled "Game choice".
- **Who does it help?** Which players, which motivation?
- **How will we know it worked?** What should students notice or do differently? (P5's "testable
  bet".)

Record the decision and its reason where the project records decisions (for Worm Simulator: the
version doc's Decisions and `decision-log.md`).

## 5. Using it each round

- **In the lesson:** after the topic is taught, one short step, "Think like a game designer", asks
  the round's door questions about one concrete feature (no new facts on it). The mission line
  then asks students to play like a designer.
- **On the form:** the design section *is* the door questions, as multiple choice built from the
  lesson's facts, each with "Other". Add:
  - one "Real worm, or game choice?" question with a reason chosen from a list (it's what real
    worms do / it's fairer / it's easier to understand / it's more fun / Other), so every student
    gives a "why" without a paragraph;
  - one motivation question ("What would make you keep playing?"), with choices that describe
    what the player would do (get better at it, explore, beat a challenge, make my own choices,
    work with friends). It asks what players do, not how they feel, so it fits the form rules
    (`form-guide.md`).
  - The one paragraph question stays: "Tell us your idea", with a starter that asks for the why.
- **In the spec:** each built feature's spec lists its door questions with the answer and the
  reason, and marks which answers came from students (P2).
- **Jobs:** a job is one of the roles that look at the same feature. Scientist: is it true?
  Mechanic: how does it play, and what can go wrong? Artist: how does the player notice it?

## 6. Starting a new game

1. Answer section 2 (who it's for, motivations, experience goals) with the teacher.
2. List the game's first concrete things (the doors). For each, run section 3 before building.
3. Use section 5 every round, so students practise the same habit each week.
