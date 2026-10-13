# V3 · Predators

- **Live:** 2026-10-12 (Mon). **Form closes:** 2026-10-15 (Thu night).
- **Build:** https://wormsimulator.com/v3/ (built from main at e6e2d95, frozen 2026-10-12, tag `v3`)
- **Topic chosen by:** students (the first student-chosen topic). V3 is the first round run the
  Strategy A way (`IMPLEMENTATION.md`): students learn the topic in the game, then design for it
  on the form. The predator they design is built in V4.
- **Name:** "Predators" is one word, which `CLAUDE.md` allows when Matt picks it.

## Topic
Lots of animals in a Minnesota forest eat earthworms. A worm has no eyes, ears, teeth or legs, so
it has to sense danger and get away fast.

Full research with exact quotes: `docs/codev/research/predators.md` (30 facts, checked
2026-10-11). These are the facts the in-game lesson shows (`src/content/lessons/predators.ts`):

| Fact shown to students | Source | Status |
|---|---|---|
| For about 11,000 years after the glaciers melted, Minnesota's forests grew with no earthworms. | Minnesota DNR, *Invasive earthworms* | Checked 2026-10-11 |
| Robins often find worms by standing still and staring at the ground, head tipped to one side. | Cornell, All About Birds, *American Robin* | Checked 2026-10-11 |
| A woodcock pushes its long bill into the soil, and the bill can feel a worm moving underground. | Minnesota DNR, *American Woodcock* | Checked 2026-10-11 |
| A star-nosed mole's nose is a star of 22 fleshy fingers; it may have the best sense of touch of any mammal. | Animal Diversity Web, *Condylura cristata* | Checked 2026-10-11 |
| Earthworms are 50 to 90 percent of a woodcock's food. | Animal Diversity Web, *Scolopax minor* | Checked 2026-10-11 |
| When a nightcrawler is disturbed, it pulls back down into its burrow very fast. | Colorado State University, *Nightcrawlers* | Checked 2026-10-11 |
| In a Florida forest, a different worm crawls up out of the ground when a mole digs nearby. | Catania 2008, *PLoS ONE* | Checked 2026-10-11 |
| Nightcrawlers come up to feed on damp nights and rarely leave their burrow all the way. | Colorado State University, *Nightcrawlers* | Checked 2026-10-11 |
| In one study, light at night cut the number of nightcrawlers coming up by about half. | Nuutinen et al. 2014 | Checked 2026-10-11 |
| Robins depend on earthworms; where worms spread, robins could spread too. | Minnesota Breeding Bird Atlas, *American Robin* | Checked 2026-10-11 |
| Worms may help salamanders in some ways and hurt them in others. | Great Lakes Worm Watch, *Vertebrate Animals* | Checked 2026-10-11 |
| Shrews live all over Minnesota and eat insects, earthworms and even small mammals. | Minnesota DNR, *Shrews* | Checked 2026-10-11 |
| Garter snakes eat frogs, toads, salamanders, earthworms, insects and fish. | Minnesota DNR, *Common Garter Snake* | Checked 2026-10-11 |
| The American toad is Minnesota's most common toad and eats insects, worms and snails. | Minnesota DNR, *American toad* | Checked 2026-10-11 |
| Red-backed salamanders eat spiders, insects, snails, earthworms and other small animals. | MN Herpetological Society; ADW | Checked 2026-10-11 |

**Watch out (for design ideas):** the "worms flee up from a mole" study used a Florida worm, not
nightcrawlers. A student design where our nightcrawler escapes upward can only ship labelled
"Game choice". Nightcrawlers really escape by pulling back down.

**Mission while you play** (on the crawl card and the lesson's last page, Matt 2026-10-12):
"Mission: Think about which predators are hunting in this forest, and how your worm senses them
and escapes being eaten."

## What's new in this build
This matches the "Coming next" entry in `CHANGELOG.md`.
- The Start screen says **Version 3 · Predators** under the title, and **Versions** opens the list of rounds.
- **Start-screen quest list:** 1 Learn, 2 Play, 3 Vote. Each step unlocks after the one before it.
- **Predators lesson "Who eats worms?"** (8 steps, with real photos of each animal): a robin
  hunting scene, a guess about how much of a woodcock's food is worms, the ground thumping as a
  star-nosed mole digs, a sort of four more hunters (shrew, garter snake, American toad, red-backed
  salamander), when nightcrawlers come up safely, and how the forest changed. It ends with a
  reminder to fill in the form from Canvas. Each page has a Sources button that links out, and
  "Tell me more" panels can hold a YouTube video. Built in the "In-game learning intros" thread
  (PRs #4, #7 and #12).
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
Written with `docs/codev/form-guide.md` (Matt, 2026-10-12). Students just learned about predators
in the game, so they are the experts: the form collects their design for how a predator should
work in the game. V3 has no predator yet, so nothing asks students to judge one.

### Vote: what should we learn about next?
Students pick 2 of Matt's 7 topics (Matt, 2026-10-12). Picking 2 is easier than ranking 7. The
most-picked topic is the one students learn and design for on V4's form, and it gets built in V5.
The rest stay in `topics.md` for later rounds. **Matt: every option must be something we'll build
if it wins.**

| Topic (as students read it) | Rows in `topics.md` | Source status |
|---|---|---|
| Eating: what do worms eat? | First bite | sourced |
| Getting hurt: how worms survive injuries | Getting hurt (new) | needs source |
| Worm senses: how worms feel, smell and sense light | Skin that senses light; Following your nose | sourced |
| Natural dangers: rain, drying out and winter | Breathing through skin; Racing the frost; Rain (new) | needs source (parts) |
| Life cycle: cocoons and growing up | Growing up | sourced |
| Different places: worms in forests, fields and gardens | Different places (new) | needs source |
| Different kinds of worms: nightcrawlers, jumping worms and more | Three kinds of worms; Jumping worms | sourced |

A topic that still needs a source can be on the vote. Its sources are found before its round's
lesson is written.

### Where each answer goes
| Questions | Goes to |
|---|---|
| Q1 | Turnout and access in Results |
| Q2 (check) | Fact check in Results; a "myth or fact?" moment on Monday if many miss it |
| Q3–Q8, drawing | The predator design shortlist for V4's form (Q4–Q7 are counted; Q8 and the drawings add the detail) |
| Q9–Q13 (the game) | Fix and polish list in Results; slow-running answers go with the Chromebook check |
| Q14 (broken or confusing) | `docs/codev/bugs.md` |
| Q15 | The next topic |

## Paste-ready form
No jobs this round (Matt, 2026-10-12): everyone answers the same questions, and the form has no
branching. Most design questions are multiple choice with an "Other" box. The choices come from
the lesson's facts, so picking one also shows what a student learned. Q8 is the one paragraph,
for the student's own idea in their words. The drawing shows how it looks.

**Title:** Worm Simulator V3 · Predators

**Description:** You learned about animals that eat worms. Now you are the expert! Help us plan a
predator for the game. This takes about 10 minutes. Your ideas help choose what we build next.

**Settings:**
- Turn on "Collect email addresses" only if Canvas credit needs it. That column stays in
  `codev-raw/` and never goes into the repo.
- Make Q1 required, and everything else optional.
- Use sections (the "Add section" button). There is no branching.
- To grade Q2, turn the form into a quiz (Settings → "Make this a quiz") and mark the answer.

---

**Section 1: Start**

**Q1. How long did you play V3?** (Multiple choice, required)
- None
- Less than 5 minutes
- 5 to 10 minutes
- More than 10 minutes

---

**Section 2: You're the expert**
Description: Plan one predator for the game. Keep it to one new thing. It should be true about
real animals. If it isn't, we will call it a "game choice".

**Q2. A nightcrawler feels the ground shake. What does it do?** (Multiple choice, one correct)
- Goes back down its hole fast ← correct
- Crawls out of the ground
- Stays very still
- Rolls into a ball

**Q3. Which animal should hunt your worm in the game?** (Multiple choice)
- American robin
- American woodcock
- Star-nosed mole
- Northern short-tailed shrew
- Common garter snake
- American toad
- Red-backed salamander
- Other: ____

**Q4. How does it find worms?** (Checkboxes: pick all that fit)
Help text: Think back to the lesson in the game.
- It looks for them
- It listens for them
- It feels for them with its nose or body
- It shakes the ground to make worms move
- Other: ____

**Q5. How does your worm know it is coming?** (Checkboxes: pick all that fit)
- It feels the ground shake
- It feels something touch it
- It notices the light change
- Other: ____

**Q6. How does your worm get away?** (Multiple choice)
- It goes back down its hole fast
- It hides under leaves
- It stays still
- Other: ____

**Q7. What happens if the predator catches your worm?** (Multiple choice)
- Game over: start again
- The worm gets hurt but keeps going
- Other: ____

**Q8. Tell us your idea.** (Paragraph)
Help text: Try this: "The ___ finds worms by ___. My worm gets away by ___. I know because ___."

**D1. Draw your predator (optional).** (File upload: images only, 1 file, up to 10 MB)
Help text: No names or faces in your drawing. You can also give a paper drawing to your teacher.

---

**Section 3: The game**
Description: Now tell us about playing the game.

**Q9. What happened when you used the controls?** (Multiple choice)
- I went where I wanted right away
- I figured them out after a few tries
- I got stuck or went the wrong way a lot
- I didn't play

**Q10. What was hard to do?** (Checkboxes: pick all that fit)
- Moving and turning
- Digging down and coming back up
- Seeing where I was going
- Knowing what to do next
- Nothing was hard
- Other: ____

**Q11. How did the game move on your Chromebook?** (Multiple choice)
- Smooth, like a video
- Jumpy once in a while
- Jumpy most of the time, so it was hard to play
- It didn't load
- I didn't play

**Q12. What was hard to see?** (Checkboxes: pick all that fit)
- My worm
- Where I could go or dig
- The words on the screen
- Everything was too dark
- Everything was too bright
- Nothing, I could see everything
- Other: ____

**Q13. What should we fix or add first?** (Multiple choice)
- How the worm moves
- Digging
- How the camera follows the worm
- How the forest looks
- Making it less jumpy
- More things to do
- Other: ____

**Q14. Did anything break or confuse you?** (Short answer)

---

**Section 4: Vote**

**Q15. What should we learn about next? Pick 2.** (Checkboxes)
- Eating: what do worms eat?
- Getting hurt: how worms survive injuries
- Worm senses: how worms feel, smell and sense light
- Natural dangers: rain, drying out and winter
- Life cycle: cocoons and growing up
- Different places: worms in forests, fields and gardens
- Different kinds of worms: nightcrawlers, jumping worms and more
- Turn on response validation (the three-dot menu): "Select exactly" 2. Error text: "Please pick
  2."

**Confirmation message (Settings → Presentation):** Thanks, expert! Your ideas help choose what we
build next.

## Canvas announcement
> **Worm Simulator V3 · Predators is here!**
>
> You picked predators! This week you learn about animals that eat worms. Then you plan one for
> the game.
>
> 1. Play V3: https://wormsimulator.com/v3/ and start with step 1, **Learn**.
> 2. Fill out the form: [FORM LINK]
>
> **Due: Thursday, October 15, at night.** The best predator ideas could be built into V4!

---

## Results (filled in after the form closes)
- **Turnout:** n responses, about X% of students. Play time (Q1): % per answer …
- **Fact check (Q2):** X% correct. Most common wrong answer: …
- **Predator picks (Q3):** count per predator …
- **Predator designs (Q4–Q8, drawings):** count, grouped into themes, and the proposed shortlist
  for V4's form …
- **The game (Q9–Q13):** % per answer, and the top "make better first" pick …
- **Broken or confusing (Q14):** themes (count), copied to the bug list …
- **Vote (Q15):** each topic's pick count per class period, then combined with the periods
  weighted equally.
- **Participation:** responses per class period …

## Decisions
- Predator design built in V4: …
- Topic for V4's form (built in V5): …
- Matt's reasoning, especially where it isn't the top vote: …
- Ideas not built, and why: …
- **Emergency fix (2026-10-13).** Matt chose to add the lesson's "Guess first!" step (PR #25) to
  the students' V3 link mid-week, so the form can ask which guess they picked and then ask the
  same question again (research: "Pre and post topic questions" in the project's research folder).
  `/v3/` was re-cut with `npm run release -- 3 --emergency-fix`. Students who opened V3 before
  this didn't see the guess; the form's "I didn't guess, or I don't remember" answer covers them.
