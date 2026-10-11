# V3 · Predators

- **Live:** 2026-10-12 (Mon). **Form closes:** 2026-10-15 (Thu night).
- **Build:** https://wormsimulator.com/v3/ (commit: fill in at release)
- **Topic chosen by:** students (the first student-chosen topic). V3 is the first round run the
  Strategy A way (`IMPLEMENTATION.md`): students learn the topic in the game, then design for it
  on the form. The predator they design is built in V4.
- **Name:** "Predators" is one word, which `CLAUDE.md` allows when Matt picks it.

## Topic
Lots of animals in a Minnesota forest eat earthworms. A worm has no eyes, ears, teeth or legs, so
it has to sense danger and get away fast.

<!-- FACTS: filled in from the predator research (In-game learning intros thread). -->

## What's new in this build
This matches the "Coming next" entry in `CHANGELOG.md`.
- The Start screen says **V3 · Predators**.
- **Predators lesson:** the game opens with a short, playable lesson about the animals that eat
  worms (built in the "In-game learning intros" thread). It ends with a reminder to fill in the
  form in Canvas. The reminder is text only; the game has no links.
- No predator hunts the worm yet. Students design how one should work on this form, and the
  winning design is built into V4.
- Everything from V2 is still there: dig down, the soil layers, tunnels, castings, Wide and Close
  views, and Come up.

## You said, we built (Monday, 1 to 2 minutes)
- "You picked **predators** as the next topic, so V3 teaches it, and this week you design how a
  predator should work in the game."
- Fill in from V2's Results when they're in (the forest-floor life vote and the camera vote), and
  say what wasn't built yet and why. Nothing from V2's votes is in V3: V3 was a short build.

## The form
The form follows `IMPLEMENTATION.md`, section 3: the job question, 1 or 2 questions for that job,
the shared questions, the vote, the optional design section, and the 4-statement goal check.
There is no student design in this build yet, so "Does it work the way we designed it?" starts in
V4's form.

### Vote: what should we learn about next?
Students rank three topics. The winner is the topic students learn and design for on V4's form,
and it gets built in V5. **Matt: check each option before the form goes out. Every option must be
something we'll build if it wins.**

| Topic (as students read it) | What it would add | Needs first | Sources (`topics.md`) |
|---|---|---|---|
| Growing up: the band on an adult worm, and cocoons | The band (clitellum) shows when your worm is full grown, and you leave cocoons | Eating and growing (in the dig) | UMN Extension |
| Skin that senses light: worms have no eyes, but their skin can feel light | A "worm view", and your worm hides from bright sun | Nothing new | Hess (parent spec 5) |
| Breathing through wet skin: what happens when a worm dries out | A moisture meter, sunny gaps and damp spots | Nothing new | UMN Extension (skin-breathing line still needs a source) |

### Design for predators (optional section)
Constraints shown to students: one new thing, small enough to build in one week, true of real
worms or called a "game choice".

## Paste-ready form
**Title:** Worm Simulator V3 · Predators: Feedback

**Description:** Thanks for helping build Worm Simulator! This takes about 10 minutes. Parts 1 and
2 are for everyone. Part 3 is extra: design a predator for the game if you want to. Your answers
decide what we build next.

**Settings:**
- Turn on "Collect email addresses" only if Canvas credit needs it. That column stays in
  `codev-raw/` and never goes into the repo.
- Make Q1 and Q2 required, and everything else optional.
- Use sections (the "Add section" button) so each job only sees its own questions. "Go to section
  based on answer" is in the three-dot menu of Q2 and of the "design?" question.

---

**Section 1: Start**

**Q1. Were you able to play V3?** (Multiple choice, required)
- Yes
- It wouldn't load
- I didn't have time

**Q2. What was your job this round?** (Multiple choice, required)
Help text: Your job is posted in Canvas.
- Scientist → go to Section 2
- Mechanic → go to Section 3
- Artist → go to Section 4

---

**Section 2: Scientist** (then go to Section 5)
Description: Scientists check if the game matches what we learned.

**S1. Did the game match what you learned about predators and worms?** (Multiple choice)
- Yes
- Kind of
- No

**S2. What was wrong or missing?** (Paragraph)
Help text: Try this: "The game shows ___, but real worms ___."

---

**Section 3: Mechanic** (then go to Section 5)
Description: Mechanics check if the controls and buttons work.

**M1. What did you play on?** (Multiple choice)
- School Chromebook
- Phone or tablet
- Other computer

**M2. What broke, or where did you get stuck or lost?** (Paragraph)
Help text: Tell us what you were doing when it happened.

---

**Section 4: Artist** (then go to Section 5)
Description: Artists check how the game looks and feels.

**A1. Did the forest floor look real?** (Multiple choice)
- Yes
- Kind of
- No

**A2. What looked great? What was hard to see?** (Paragraph)

---

**Section 5: Everyone (Part 1)**

**Q3. Did you get stuck anywhere? Where?** (Short answer)

**Q4. I like…** (Short answer)

**Q5. I wish…** (Short answer)

**Q6. FACT CHECK** (Multiple choice, one correct) — fill in from the lesson's facts.

**Q7. How fun was V3?** (Linear scale 1 to 5)
- 1 = 😞 Not fun
- 5 = 😄 Super fun

---

**Section 6: Vote (Part 2)**

**Q8. What should we learn about next? Rank them.** (Multiple choice grid)
Help text: Pick 1 for your favorite. Use each number once.
- Rows:
  - Growing up: the band on an adult worm, and cocoons
  - Skin that senses light: worms have no eyes, but their skin can feel light
  - Breathing through wet skin: what happens when a worm dries out
- Columns: 1st, 2nd, 3rd
- Turn on "Limit to one response per column".

**Q9. What would you add or change in the game?** (Paragraph)

**Q10. Do you want to design a predator for the game?** (Multiple choice)
- Yes, take me to Part 3 → go to Section 7
- No, I'm done → go to Section 8

---

**Section 7: Design a predator (Part 3, extra)**
Description: Your design could be built into V4! Rules: one new thing. Small enough to build in
one week. True of real worms and predators, or call it a "game choice".

**D1. Which predator should hunt your worm?** — fill in from the lesson's predators.

**D2. How should it work in the game?** (Paragraph)
Help text: Try this: "The ___ would ___. My worm could stay safe by ___."

**D3. How do you know? Where did you learn it?** (Paragraph)
Help text: Try this: "In the game I learned ___." or "I saw ___."

**D4. Add a drawing (optional).** (File upload: images only, 1 file, up to 10 MB)
Help text: No names or faces in your drawing, please. You can also hand a paper drawing to your
teacher.

---

**Section 8: Last part (everyone)**

**Q11. How did V3 feel?** (Multiple choice grid)
- Rows:
  - Being a worm felt strange and real.
  - I could tell where I was and what to do next.
  - What I learned changed how I played.
  - I could play without problems on my device.
- Columns: Yes, Kind of, No
- Turn on "Require a response in each row" only if you want everyone to answer all four.

**Confirmation message (Settings → Presentation):** Thanks! Your answers help decide what we
build next.

## Canvas announcement
> **Worm Simulator V3 · Predators is here!**
>
> You picked predators! This week you learn about the animals that eat worms, then design one
> for the game.
>
> 1. Play V3: https://wormsimulator.com/v3/ (the lesson is at the start)
> 2. Check your job for this round: [JOB LIST]
> 3. Fill out the form: [FORM LINK]
>
> **Due: Thursday, October 15, at night.** The best predator designs could be built into V4!

---

## Results (filled in after the form closes)
- **Turnout:** n responses, about X% of students. Access problems (Q1): …
- **Fact check (Q6):** X% correct. Most common wrong answer: …
- **Vote (Q8):** each topic's rank score per class period, then combined with the periods
  weighted equally.
- **Predator designs (Section 7):** count, grouped into themes, and the proposed shortlist for
  V4's form …
- **Stuck points, likes and wishes (Q3–Q5):** themes (count) …
- **Ideas (Q9):** themes (count) …
- **Fun (Q7):** % per answer …
- **Goal check (Q11):** Yes / Kind of / No % for each statement. This is the first one, so it
  sets the starting line.
- **By job:** Scientist (S1, S2), Mechanic (M1, M2) and Artist (A1, A2) findings …
- **Participation:** responses per class period …

## Decisions
- Predator design built in V4: …
- Topic for V4's form (built in V5): …
- Matt's reasoning, especially where it isn't the top vote: …
- Ideas not built, and why: …
