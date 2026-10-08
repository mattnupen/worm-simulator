# V2 · Underground

- **Planned live:** 2026-10-12 (Mon), the day Matt posts it in Canvas. **Form closes:** 2026-10-15
  (Thu night).
- **Build:** https://wormsimulator.com/v2/ (release commit: fill in at release)
- **Topic chosen by:** Matt (Matt picks V1's, V2's and V3's topics)

## Topic
Before earthworms came, Minnesota's hardwood forests had a thick, spongy forest floor in layers,
from this fall's leaves down to black humus, full of fungi, roots and small animals. Earthworms
are newcomers that eat it, and the forest floor changes where they arrive.

| Fact shown to students | Source | Status |
|---|---|---|
| A forest floor with no earthworms has layers in every stage of rotting: this fall's leaves, older broken leaves, and black humus. | Minnesota DNR, *Humus Types* | Re-check before class |
| The old-leaf layer is full of fungus threads and mats of fine roots. | Minnesota DNR, *Humus Types* | Re-check before class |
| In rich sugar maple and basswood forests, the forest floor can be up to 10 cm (4 or 5 inches) thick. | Great Lakes Worm Watch, *About the Forest* | Re-check before class |
| With no earthworms, leaves rot more slowly than new leaves fall, so the forest floor builds up. | Great Lakes Worm Watch, *About the Forest* | Re-check before class |
| It works like a mulch for the forest and holds moisture. | Great Lakes Worm Watch, *About the Forest* | Re-check before class |
| Where earthworms move in, the forest floor can shrink to a thin layer of last fall's leaves over thick, dark topsoil, often with worm castings on top. | Minnesota DNR, *Humus Types* | Re-check before class |
| At the edge of a worm invasion, scientists measured a forest floor up to 10 cm thick that fell to zero within 75 m. | Hale, Frelich, Reich and Pastor 2005 | Re-check before class |
| Earthworms come in three groups: worms that live in the leaf litter, worms that live in and eat the topsoil, and deep burrowers. | Great Lakes Worm Watch, *Earthworm Ecological Groups* | Re-check before class |
| Our worm is a nightcrawler, a deep burrower. Real nightcrawlers dig one burrow that goes straight down, as deep as 2 meters. (The game's hint card says this too.) | Great Lakes Worm Watch, *Earthworm Ecological Groups* | Re-check before class |
| Nightcrawlers pull fresh leaves down into their burrows, and leave piles of castings and leaf bits (middens) at the opening. | Great Lakes Worm Watch, *Earthworm Ecological Groups* | Re-check before class |
| People spread nightcrawlers, for example with fishing bait. | Minnesota DNR, *Earthworms* | Re-check before class |
| Blue-spotted salamanders breathe through moist skin and eat forest-floor insects. | Great Lakes Worm Watch, *Vertebrate Animals* | Re-check before class |
| Shrews and red-backed voles do best where the forest floor is thick. | Great Lakes Worm Watch, *Vertebrate Animals* | Re-check before class |
| Native land snails, spiders and beetles live in the forest floor. Their numbers can drop a lot after earthworms move in. | Great Lakes Worm Watch, *Macroinvertebrate Animals* | Re-check before class |
| Fungi partner with tree roots, and earthworms disrupt those partnerships. | University of Minnesota, *European earthworms cause big problems in North American forests* | Re-check before class |
| Mushrooms and puffballs grow in the leaf litter and on mossy logs. | Matt's own photos (northern Minnesota, fall); **needs a published source** if stated as a general fact | Needs source |

Source links are in `docs/codev/research/mn-forest-floor.md` and `src/content/sources.ts`.

**Game choices (describe the game, not facts).**
- In the game you can dig any way you like. Real nightcrawlers dig one deep up-and-down burrow. The
  game's hint card shows this as "Game choice: In the game you can dig any way you like."
- The slice is about 70 cm wide and 50 cm deep. Real nightcrawler burrows go much deeper, so the
  bottom of the slice fades to dark.
- The pale grey band under the topsoil is 2 to 4 cm thick in the game. Our sources give no number,
  so slides say "in the game".
- The snail shell, beetle, spider and puffball are hints for the vote. They don't move, and the
  snail and beetle block your worm like stones.
- Your worm leaves its midden the moment it comes up.

**While you play, notice…** Dig down and look at the slice from the side. How many layers can you
find? What lives in each one? Which layer was easiest to dig through, and which was hardest?

## What's new in this build
This matches the "V2 · Underground" entry in `CHANGELOG.md`.
- **You said, we did:** V1's form results are still being counted (fill in from V1's Results).
  Already done: the game stays at real size for everyone (Matt's choice after testing on student
  Chromebooks), so World scale is gone. V1 keeps it at `/v1/`.
- The leaf layer on the forest floor is deeper (2 to 5 cm), and your worm crawls inside it. The
  leaves over it fade so you can see it.
- **The Action button**, bottom right: a picture and a word saying what Space will do. Tap it on a
  touch screen.
- **Dig down:** on open ground the button says Dig down. Press Space. The camera swings to the side
  and you see a slice of the forest floor: Leaf litter, Old leaves, Humus, Topsoil, Subsoil. The
  names are at the end of the slice nearest your worm.
- **Point to dig** with the arrow keys, W A S D or the joystick. Your own tunnel is fastest; new
  soil is slower; the deep layers are slowest. Stones and big roots block you.
- Your worm leaves **castings** in its tunnel.
- Look for a **snail shell, a beetle, a spider, a puffball and moss** in the slice.
- **Wide and Close views:** press Space to switch. Wide is the default. The game remembers your
  pick.
- **Come up:** near the top of the leaves, where there's room to crawl out, the button says Come
  up. You leave a burrow opening with a midden.
- **Stuck?** Point back along your worm's body to back up through your tunnel.
- The first time you go underground, a card shows the controls and a nightcrawler fact.
- Reduce motion turns the camera swing into a quick fade.
- How to try it: Start → **Crawl** → find open ground (away from rocks, logs and trees) → **Space**
  or the Action button.

## Ballot
### Design vote (Q5): Which native forest-floor life should we add next?
Every option is native, lives in Minnesota's forest floor, and has a source. The winner is built
into V3, where it reacts to moisture and to your worm.

| Option (as students read it) | Source | What we'd build in V3 | In the build now? |
|---|---|---|---|
| Blue-spotted salamander | Worm Watch, *Vertebrate Animals* | A salamander that comes out in damp spots and hides when it's dry, tied to V3's Moisture | No |
| Fungi at work (fungus threads, mushrooms, puffballs) | Minnesota DNR, *Humus Types*; UMN | White fungus threads that grow, and mushrooms and puffballs that come up after damp spells. Any fungus shown says "Look, don't eat." | As still hints: white threads in the old leaves, a puffball |
| Small hunters and helpers (snails, spiders, beetles) | Worm Watch, *Macroinvertebrate Animals* | A few small animals moving in the litter and on logs | As still hints: a snail shell, a beetle, a spider |
| Shrews and red-backed voles | Worm Watch, *Vertebrate Animals* | A shrew or vole moving through the litter | No |
| Other (write in) | | Grouped into themes for V3's form | |

Left out on purpose: ovenbirds (they nest in spring and are gone by fall), and springtails and
mites (no source yet). The robin and the mole are separate topics.

### Camera question (Q5b)
"Underground, which view did you like better?" Wide / Close / I liked both the same.
- Both views ship. A clear winner becomes the default in V3. A close call (top two within 10
  points) keeps both as a setting, as now, with a runoff on V3's form.
- **Before applying it:** Space switches the view and the game saves the pick, so most students
  who tried both have a saved pick, and a new default won't reach them. Plan how it will (CLAUDE.md,
  "Ballot choices ship as settings").
- On a phone, Close is only a little closer than Wide, so phone players may not see much
  difference.

### Next topic (Q7, picks V4)
Checked against `topics.md` and the roadmap: prerequisites built or being built by V4, sources
listed, and the game part buildable in about a week. Both ready options go on the form.

| Option (as students read it) | Game part | Needs first | Sources | Ready? |
|---|---|---|---|---|
| Skin that senses light: worms have no eyes, but their skin can sense light | Light in a new Worm View; your worm avoids bright sun | Breathing through skin (being built in V3) | Hess, *Photoreceptors in Lumbricus terrestris* (parent spec 5) | Yes |
| Growing up: the band on an adult worm, and cocoons | The band (clitellum) appears when your worm is full grown; leave cocoons with Action | First bite (being built in V3) | UMN Extension, *Earthworms* (parent spec 5) | Yes |

**Not on this ballot:**
- **The mole:** its Minnesota diet and range have no source yet (parent spec 5; not in the
  research notes). If Matt finds one before the form goes out, add it as a third option ("A mole
  hunts underground. Its digging warns your worm, and you flee up"), and add the source to
  `topics.md`.
- **The robin:** same problem (diet and range in Minnesota).
- **Following your nose:** needs Worm View from "Skin that senses light" first.
- **Racing the frost:** needs "Growing up" and a source.

So Q7 has two options plus Other, not the usual three.

### Ideas from last version (Q8)
V1's form had the first idea box. When V1's Results are in, group its write-ins into themes, vet
them (`README.md`, "Consensus rules") and list the top 3 or 4 here as Q8's options. If they are not
in before the form goes out, leave Q8 out, as V1 did.

## Paste-ready form
**Title:** Worm Simulator V2 · Underground: Feedback

**Description:** Thanks for helping design Worm Simulator! This takes about 10 minutes. Your
answers decide what we build next.

Settings: make Q1 required and the rest optional, so a student who couldn't play can still submit.
Don't collect emails unless Canvas credit needs them (that column stays in `codev-raw/`). With Q8
left out, the form has 10 questions (Q5b added); keep these Q numbers in the Results.

**Q1. Were you able to play V2?** (Multiple choice, required)
- Yes
- It wouldn't load
- I didn't have time

**Q2. About how long did you play?** (Multiple choice)
- Under 5 minutes
- 5 to 15 minutes
- 15 to 30 minutes
- More than 30 minutes

**Q3. Why is the forest floor thick in a forest with no earthworms?** (Multiple choice, one
correct)
- Trees drop extra leaves when there are no worms
- Leaves rot more slowly than new leaves fall ← correct
- Wind blows in leaves from other forests
- Snow presses the leaves down

**Q4. How well did the game show the layers of the forest floor?** (Linear scale 1 to 4)
- 1 = Not well at all
- 4 = Really well

**Q5. Which native forest-floor life should we add next?** (Multiple choice)
- Blue-spotted salamander
- Fungi at work (fungus threads, mushrooms, puffballs)
- Small hunters and helpers (snails, spiders, beetles)
- Shrews and red-backed voles
- Other: ____

**Q5b. Underground, which view did you like better?** (Multiple choice)
- Wide (see the whole slice)
- Close (follow my worm)
- I liked both the same

**Q6. Why did you choose your answer to Q5?** (Short answer)
Help text: Try this starter: "In the slice I noticed ___, and in a real forest ___."

**Q7. What should worms learn to do in V4?** (Multiple choice)
- Skin that senses light: worms have no eyes, but their skin can sense light
- Growing up: the band on an adult worm, and cocoons
- Other: ____

**Q8. Which ideas from last week should we build?** (Checkboxes, pick up to 2; only if V1's
themes are in)

**Q9. Was anything confusing or broken?** (Checkboxes, pick all that fit)
- I couldn't find a place to dig down
- I couldn't come back up
- The camera was hard to follow
- I couldn't read the layer names
- It was slow or choppy
- My worm got stuck
- Nothing was confusing or broken
- Other: ____

**Q10a. How fun was this version?** (Linear scale 1 to 5)
- 1 = Not fun
- 5 = Super fun

**Q10b. Your idea (optional):** What should we add or change in the game? (Paragraph)

## Slides draft
Deck title: **Worm Simulator V2 · Underground**

Screenshots are in `docs/codev/versions/v02-underground/`.

1. **You said, we did**
   - Text: "V1's results are still being counted. We'll share them next week." (Replace with V1's
     Results when they're in: turnout, the World scale answers, and what changed.) "Already done:
     the game stays at real size for everyone, because real worms live in a real-size world and
     it ran well on your Chromebooks. The leaves are deeper now, and your worm crawls inside them."
   - Image idea: `v01-true-size/true.jpg` beside `v02-underground/surface.jpg`.
   - Alt text: "Last week's forest floor beside this week's. This week the worm is down inside
     deeper leaves."

2. **A forest floor before worms**
   - Text: "For thousands of years, Minnesota's forests had no earthworms. Leaves rotted more
     slowly than new ones fell, so the forest floor piled up. In rich maple and basswood forests it
     can be up to 10 cm thick. It works like a mulch and holds moisture for the forest."
   - Image idea: `v02-underground/wide.jpg`.
   - Alt text: "The game's side view of the forest floor. Bright leaves and moss on top, a thick
     dark layer of old leaves with white threads, a black humus band, grey topsoil, then a pale
     band and rusty subsoil with stones. A worm digs in the old leaves. The layer names are at the
     right."
   - Source footer: "Sources: Great Lakes Worm Watch, About the Forest; Minnesota DNR, Humus Types;
     Minnesota DNR, Earthworms."

3. **The layers**
   - Text: "**Leaf litter:** this fall's leaves. **Old leaves:** leaves from years before, dark and
     broken, full of white fungus threads and tiny roots. **Humus:** black and crumbly. Nothing
     looks like a leaf any more. **Topsoil**, then **subsoil**, with stones and big roots. In the
     game, each layer has its own pattern as well as its own colour."
   - Image idea: `v02-underground/close.jpg`, and `v02-underground/stones-roots.jpg` for the deep
     layers.
   - Alt text: "Close view: the worm digging down through the dark old-leaf layer, with the names
     Leaf litter, Old leaves, Humus, Topsoil and Subsoil along the right edge." / "Deep in the
     soil: the worm in the rusty subsoil, big tree roots crossing above it, and stones."
   - Source footer: "Source: Minnesota DNR, Humus Types. The pale band's thickness is a game
     choice."

4. **Who lives there?**
   - Text: "Fungi, roots, mosses, snails, spiders, beetles, salamanders, shrews and voles all use
     the thick forest floor. Fungi even partner with tree roots. Find the snail shell, beetle,
     spider, puffball and moss in the game. Fungi: look, don't eat!"
   - Image idea: `v02-underground/life.jpg`.
   - Alt text: "The top of the slice up close: a puffball and moss with red stalks, a spider on the
     leaves, and a beetle and a snail shell in the leaf litter. The worm is in the old leaves
     below."
   - Source footer: "Sources: Great Lakes Worm Watch, Vertebrate Animals and Macroinvertebrate
     Animals; University of Minnesota."

5. **When worms arrive, the forest floor changes**
   - Text: "Earthworms eat the forest floor. Where they move in, it can shrink to a thin layer of
     last fall's leaves over thick, dark topsoil, with worm castings on top. At the edge of one
     worm invasion, scientists found a 10 cm forest floor dropping to zero in 75 meters. The
     forest changes: some living things do well, and some have a harder time."
   - Image idea: two simple side-view drawings labelled "No worms" (L, F, H layers over thin
     topsoil) and "With worms" (thin leaves over thick dark topsoil). Labels in words, not colour
     alone.
   - Alt text: "Two soil drawings. 'No worms': three thick leaf layers over thin topsoil. 'With
     worms': a thin layer of leaves over thick dark topsoil."
   - Source footer: "Sources: Minnesota DNR, Humus Types; Hale et al. 2005."

6. **Our worm: the nightcrawler**
   - Text: "Earthworms come in three groups: litter worms, topsoil worms and deep burrowers. Our
     worm is a nightcrawler, a deep burrower and the classic fishing worm. It digs one burrow
     straight down, as deep as 2 meters, and pulls leaves down into it. At the top it leaves a
     pile of castings and leaf bits called a midden. People spread nightcrawlers, for example with
     fishing bait. Game choice: in the game you can dig any way you like."
   - Image idea: `v02-underground/tunnels.jpg`.
   - Alt text: "The worm's tunnels drawn as dark brown paths looping down through the layers. The
     worm is in the topsoil."
   - Source footer: "Sources: Great Lakes Worm Watch, Earthworm Ecological Groups; Minnesota DNR,
     Earthworms."

7. **While you play, notice…**
   - Text: "Dig down and look at the slice from the side. How many layers can you find? What lives
     in each one? Which layer was easiest to dig through, and which was hardest?"
   - Image idea: none, or a magnifying glass icon.

8. **What's new and how to play**
   - Text: "Crawl to open ground, away from rocks, logs and trees. When the button says **Dig
     down**, press Space or tap it. Point the way to dig with the arrow keys, W A S D or the
     joystick. Space switches **Wide** and **Close**. Near the top of the leaves the button says
     **Come up**. Stuck? Point back along your worm to back up. Esc or P pauses."
   - Image idea: `v02-underground/surface.jpg`, `v02-underground/opening.jpg`,
     `v02-underground/phone.jpg`, each with a caption.
   - Alt text, one per image: "The worm in the leaves, with the Dig down button in the corner." /
     "Back on the forest floor: a burrow opening ringed by a dark pile of castings and leaf bits."
     / "The game on a phone in Wide view, with the layer names, the joystick and the Close view
     button."

9. **Your vote: what forest-floor life comes next?**
   - Text: "Blue-spotted salamander. Fungi at work. Small hunters and helpers (snails, spiders,
     beetles). Shrews and red-backed voles. The winner comes alive in V3. And pick what worms
     learn in V4: skin that senses light, or growing up."
   - Image idea: none, or `life.jpg` again.

10. **Now fill out the form**
    - Text: "The form is in Canvas. It takes about 10 minutes. Tell us what you noticed. Your
      votes decide what we build next."

## Canvas announcement
> **Worm Simulator V2 · Underground is here!**
>
> This week we dig down into the forest floor. Learn its layers, who lives in them, and how
> earthworms change it.
>
> 1. Look through the slides: [SLIDES LINK]
> 2. Play V2: https://wormsimulator.com/v2/ (find open ground and press Space to dig down)
> 3. Fill out the form: [FORM LINK]
>
> **Due: Thursday, October 15, at night.** Your votes decide which forest-floor life we add in V3,
> and what worms learn in V4.

---

## Results (filled in after the form closes)
- **Turnout:**
- **Fact check (Q3):**
- **How well the game showed the topic (Q4):**
- **Design vote (Q5):**
- **Camera (Q5b):**
- **Next topic (Q7):**
- **Ideas from last version (Q8):**
- **Write-in themes (new):**
- **Bugs and confusion (Q9):**
- **Fun (Q10a):**

## Decisions
- Ships in V3:
- Topic for V4:
- Camera default:
- Runoffs, vetoes and reasons:

---

## Note for Matt (not for students)
- **Before class:** re-check every fact row against its source page, and find a published source
  for the mushrooms-and-puffballs row or leave it off the slides.
- **Fungi:** the parent spec (section 5) says any fungus shown carries "Look, don't eat." The game
  shows a puffball in the slice (and V1's mushrooms) without that line, so slide 4 says it.
- **Known limits students may notice** (spec section 14.4):
  - Close is only a little closer than Wide on phones.
  - About 4 in 10 digs turn the slice a little (up to 80°) to miss tree trunks.
  - Come up only shows where your worm has room to lie on the forest floor.
  - The leaves round the worm on the surface are a little sparser than in your photos.
  - Q9's first four checkboxes are there to catch these.
- **Q7 has two options**, because the mole and the robin still need Minnesota diet and range
  sources. Update `topics.md` statuses ("on ballot") when the form goes out.
- **Version name:** "Underground" is one word, which `CLAUDE.md` allows when Matt picks it.
