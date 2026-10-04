# V1 · True Size

- **Live:** YYYY-MM-DD (Mon), set on release day. **Form closes:** YYYY-MM-DD (Thu night).
- **Build:** https://wormsimulator.com/v1/ (commit `<sha>`, set on release)
- **Topic chosen by:** Matt (Matt picks V1's and V2's topics)

## Topic
A real earthworm is about as long as a pencil, so to a worm the forest floor is huge. Minnesota's
forests grew for about 11,000 years with no earthworms, so every earthworm here is an invader.

| Fact shown to students | Source | Status |
|---|---|---|
| A big earthworm, like a nightcrawler, is about 5 to 8 inches (13 to 20 cm) long. | UMN Extension: Earthworms | Re-check before class |
| Minnesota has no native earthworms. | Minnesota DNR: Earthworms; UMN Extension: Earthworms | Re-check before class |
| For about 11,000 years after the glaciers melted, Minnesota's forests grew with no earthworms. | Minnesota DNR: Earthworms | Re-check before class |
| So every earthworm in Minnesota is an invader. | Minnesota DNR: Earthworms (follows from "no native earthworms") | Re-check before class |
| The first earthworms probably came with soil and plants brought from Europe. | Minnesota DNR: Earthworms | Re-check before class |
| Today, people spread them, for example with fishing bait. | Minnesota DNR: Earthworms | Re-check before class |
| On their own, earthworms spread less than half a mile in 100 years. | Minnesota DNR: Earthworms | Re-check before class |
| About 15 kinds of invasive earthworms live in Minnesota. | USFWS: Minnesota's Can of (Invasive) Worms | Re-check before class |

**Game sizes (describe the game, not facts).** The worm in the game stands for a 15 cm earthworm.
In True, the game uses typical real sizes: a red oak leaf 15 cm long, a sugar maple leaf 11 cm,
an aspen leaf 5.5 cm, mushroom caps 5 to 8 cm, rocks 10 to 40 cm, a fallen birch log 25 cm across,
birch trunks 25 cm and sugar maple trunks 45 cm across. None of the listed sources gives these
numbers, so slides say "in the game" and never present them as facts. **Needs source** if Matt
wants any of them stated as a real-world fact.

**While you play, notice…** Try all three World scales. Put your worm next to a leaf, a rock and
the fallen log. Which scale makes you feel as small as a real worm? Which one is the most fun?

## What's new in this build
This matches the "V1 · True Size" entry in `CHANGELOG.md`.
- The Start screen shows the version: **V1 · True Size**.
- New **World scale** button on the Start screen, with three choices:
  - **Classic:** "The forest as it is now."
  - **Hybrid:** "Small things real size, big things half."
  - **True:** "Everything real size, next to a real worm."
- **True is the default.** Your choice is saved on this computer.
- In True, leaves are real size. One big leaf can cover most of your worm.
- Trees, rocks and the fallen log are solid. Your worm slides along them instead of going through.
- When a tree or rock gets between you and the camera, the camera eases in closer to your worm.
- Fixed: leaves shake much less when your worm crawls under them.
- How to switch: Start screen → **World scale** → pick one → **Back** → **Crawl**.

## Ballot
### Design vote (Q5): Which World scale should the game use?
All three are already in the build as a setting, so students vote on something they tried.

| Option (as students read it) | What we'd build | In the build as a toggle? |
|---|---|---|
| Classic: The forest as it is now. | Classic becomes the default for everyone. Hybrid and True may be removed, unless students vote to keep the choice. | Yes |
| Hybrid: Small things real size, big things half. | Hybrid becomes the default for everyone. Classic and True may be removed, unless students vote to keep the choice. | Yes |
| True: Everything real size, next to a real worm. | True stays the default. Classic and Hybrid may be removed, unless students vote to keep the choice. | Yes |

Applying the vote is a one-line change (`DEFAULT_SCALE` in `src/surface/worldScale.ts`). Close
call (top two within 10 points): both stay as a toggle, and a runoff goes on V2's form.

### Next topic (Q7)
Not on V1's form. Matt picks V1's and V2's topics. The first student topic vote starts on V2's
form.

### Ideas from last version (Q8)
Not on V1's form. There was no earlier form, so there are no write-ins to vote on yet.

## Paste-ready form
**Title:** Worm Simulator V1 · True Size: Feedback

**Description:** Thanks for helping design Worm Simulator! This takes about 10 minutes. Your
answers decide what we build next.

Settings: make Q1 required and the rest optional, so a student who couldn't play can still
submit. Don't collect emails unless Canvas credit needs them (that column stays in `codev-raw/`).
Q7 and Q8 are left out this week, so the form has 8 questions. Keep the Q numbers below in the
Results so the weeks line up.

**Q1. Were you able to play V1?** (Multiple choice, required)
- Yes
- It wouldn't load
- I didn't have time

**Q2. About how long did you play?** (Multiple choice)
- Under 5 minutes
- 5 to 15 minutes
- 15 to 30 minutes
- More than 30 minutes

**Q3. How long did Minnesota's forests grow with no earthworms?** (Multiple choice, one correct)
- About 110 years
- About 1,100 years
- About 11,000 years ← correct
- They always had earthworms

**Q4. How well did the game show how big a worm's world is?** (Linear scale 1 to 4)
- 1 = Not well at all
- 4 = Really well

**Q5. Which World scale should the game use?** (Multiple choice)
- Classic: The forest as it is now.
- Hybrid: Small things real size, big things half.
- True: Everything real size, next to a real worm.
- Other: ____

**Q6. Why did you choose that?** (Short answer)
Help text: Try this starter: "In the game I noticed ___, and real worms ___."

**Q9. Was anything confusing or broken?** (Checkboxes, pick all that fit)
- The forest took a long time to load after I changed World scale
- Leaves or the camera jumped around
- It was slow or choppy
- I couldn't find World scale
- My worm got stuck
- Nothing was confusing or broken
- Other: ____

**Q10a. How fun was this version?** (Linear scale 1 to 5)
- 1 = Not fun
- 5 = Super fun

**Q10b. Your idea (optional):** What should we add or change in the game? (Paragraph)

## Slides draft
Deck title: **Worm Simulator V1 · True Size**

1. **Welcome, co-designers!**
   - Text: "You are now game designers. Each week works like this: **Learn** one thing about real
     worms. **Play** the new version at home. **Vote** on the form. **We build it** into the next
     version. Your votes this week change V2."
   - Image idea: four boxes in a circle with arrows: Learn → Play → Vote → We build it. Each box
     has a word and a small icon (book, game controller, check mark, hammer), not colour alone.
   - Alt text: "A circle of four steps: learn, play, vote, we build it. Then it starts again."

2. **How big is a worm?**
   - Text: "A big earthworm, like a nightcrawler, is about 5 to 8 inches long. That's about as
     long as a pencil. The worm in our game is 15 cm long, the size of a big earthworm."
   - Image idea: a photo of an earthworm on a ruler (a photo Matt takes, or one he has the rights
     to use).
   - Alt text: "An earthworm stretched along a ruler. It is about 15 centimetres long."
   - Source footer: "Source: UMN Extension, Earthworms."

3. **A worm's-eye forest**
   - Text: "In the game's True scale, everything is real size. A red oak leaf is as long as your
     worm. The fallen log is taller than your worm is long. To a worm, a leaf is a blanket and a
     log is a wall."
   - Image idea: `v01-true-size/true.jpg` (the True view from Task 17).
   - Alt text: "The game in True scale. A small worm under big fall leaves, with a fallen log like
     a wall ahead."
   - Footer: "Game sizes: typical sizes the game uses."

4. **A forest without worms**
   - Text: "When the glaciers melted, Minnesota's forests grew back with no earthworms. They grew
     that way for about 11,000 years. The first earthworms probably came with soil and plants
     from Europe. On their own, worms spread less than half a mile in 100 years. People spread them
     faster, for example with fishing bait. Now about 15 kinds live here. Every one is an invader."
   - Image idea: a long timeline bar from "Glaciers melt" to "Today". Almost all of it is labelled
     "No earthworms". Only a thin slice at the end is labelled "Earthworms arrive". Use words on
     the bar, not colour alone.
   - Alt text: "A timeline 11,000 years long. The words 'no earthworms' cover almost all of it.
     Earthworms appear only in a thin slice at the end."
   - Source footer: "Sources: Minnesota DNR, Earthworms; USFWS, Minnesota's Can of (Invasive)
     Worms."

5. **While you play, notice…**
   - Text: "Try all three World scales. Put your worm next to a leaf, a rock and the fallen log.
     Which scale makes you feel as small as a real worm? Which one is the most fun?"
   - Image idea: none, or a magnifying glass icon.

6. **What's new and how to play**
   - Text: "New: the **World scale** button on the Start screen. Pick Classic, Hybrid or True,
     then press Back and Crawl. True is already on. Crawl with the arrow keys, W A S D, or the
     joystick. Press Esc or P to pause. Trees, rocks and the log are solid: slide along them."
   - Image idea: the three Task 17 screenshots side by side, `classic.jpg`, `hybrid.jpg`,
     `true.jpg`, each with its name written under it.
   - Alt text, one per image: "The same spot in Classic scale." / "The same spot in Hybrid
     scale." / "The same spot in True scale."

7. **Now fill out the form**
   - Text: "The form is in Canvas. It takes about 10 minutes. Your vote on World scale decides
     how big the forest is in V2."

## Canvas announcement
> **Worm Simulator V1 · True Size is ready!**
>
> This week you are game designers. Learn how big a worm's world is, and why Minnesota's forests
> had no earthworms for about 11,000 years.
>
> 1. Look through the slides: [SLIDES LINK]
> 2. Play V1: https://wormsimulator.com/v1/ (try all three World scales on the Start screen)
> 3. Fill out the form: [FORM LINK]
>
> **Due: [DUE DATE], Thursday night.** Your vote decides how big the forest is in V2.

---

## Results (filled in after the form closes)
- **Turnout:**
- **Fact check:**
- **How well the game showed the topic:**
- **Design vote:**
- **Next topic:** not on V1's form.
- **Ideas from last version:** not on V1's form.
- **Write-in themes (new):**
- **Bugs and confusion:**
- **Fun:**

## Decisions
- Ships in V2:
- Topic for V3:
- Runoffs, vetoes and reasons:

---

## Note for Matt (not for students)
- **Known limits students may notice:**
  - Big leaves lift like lids over the worm, most in True (`v01-true-size/true-lid.jpg`).
  - True's forest floor reads a bit sparser, because bigger leaves mean fewer of them.
  - Distant trees are plain columns.
  - In Hybrid, the ends of the fallen log look cut off.
  - Q9's first three checkboxes are there to catch these and the rebuild wait.
- **Release:** cut the frozen build at `/v1/` with `npm run release -- 1` only after you approve
  it. Then fill in the Live, Form closes and commit lines above.
- **Before class:** re-check every fact row against its source page (parent spec section 5).
