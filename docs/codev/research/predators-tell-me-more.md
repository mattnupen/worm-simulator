<!-- "Tell me more" research for the predators lesson (2026-10-12). Quotes were read through a web reader; check wording on the live pages. -->
# "Tell me more" research: worm eaters (checked 2026-10-12)

How this was checked: every page was opened with WebFetch, which runs pages through a summarising
reader and caps quotes at 125 characters. Quotes are exact excerpts as that reader returned them.
Where a quote is part of a longer sentence it is marked "(excerpt)". curl is blocked by the build
proxy, so no raw-HTML cross-check was possible. **Before class, spot-check wording on the live page.**

Pages that could not be read:
- PMC copy of Ziemba et al. (pmc.ncbi.nlm.nih.gov/articles/PMC4856329): reCAPTCHA wall. Europe PMC
  full text: HTTP 429 rate limit. The same paper was read on journals.plos.org instead.
- nrri.umn.edu/worms (old Worm Watch URL): fetch error. The current UMN Duluth Worm Watch site
  (wormwatch.d.umn.edu) worked.
- greatlakeswormwatch.org: **not** the UMN project (it's a blog with unrelated posts). Don't cite it.
- dnr.state.mn.us/reptiles_amphibians/snakes/redbelly-snake.html: fetch error. The DNR page at
  /reptiles_amphibians/redbellysnake.html worked.
- Maerz et al. 2009 (Conservation Biology) itself: no readable abstract page found. It is cited
  through Scott et al. below, which is stated as such.

---

## A. Salamanders and earthworms (help AND hurt)

**Important caveats**
- The UMN Worm Watch page talks about the **blue-spotted salamander** and "salamanders" in general.
  It does **not** mention red-backed salamanders. Word it as "salamanders", not "red-backed".
- The red-backed salamander studies disagree: Quebec (Scott et al., European worms) found a net
  benefit; Rhode Island (Ziemba et al., Asian jumping worms) found fewer juveniles and males.
  Older New York work (Maerz et al. 2009) linked declines to lost leaf litter. Keep "may" / "in
  some forests".
- Scott et al. 2023: published online 26 Sep 2023; print volume is *Biological Invasions* 26
  (2024): 187–200. Cite as 2023 (online) or 2024 (volume), consistently.

| # | 6th-grade wording | Page title | URL | Publisher | Exact quote | Confidence |
|---|---|---|---|---|---|---|
| A1 | Scientists say worms may help salamanders in some ways and hurt them in others. | Vertebrate Animals \| Great Lakes Worm Watch \| University of Minnesota Duluth | https://wormwatch.d.umn.edu/forest-ecology-and-worms/animals/vertebrate-animals | UMN Great Lakes Worm Watch | "Research is beginning to show that salamanders may be both negatively and positively affected by earthworm invasion." | high |
| A2 | **Help:** Worms are soft, healthy food, and adult salamanders may eat them and have more babies. | same | same | UMN Great Lakes Worm Watch | "For example, the females may benefit by having a nutritious new food sources which allows them to produce more young." | high |
| A3 | **Hurt:** Baby salamanders can't eat worms, and the tiny bugs they eat can drop a lot when worms move in. | same | same | UMN Great Lakes Worm Watch | "However, the young cannot eat earthworms and their major food source, small invertebrates," / "can decline dramatically when earthworms invade." (one sentence, returned in two pieces) | high |
| A4 | **Hurt:** Salamanders have no lungs; they breathe through damp skin, so they need a moist forest floor. | same | same | UMN Great Lakes Worm Watch | "Salamanders do not have lungs and therefore must breathe through their skin, which must be moist for this to happen." | high |
| A5 | **Hurt:** Worms eat the forest floor, so it can dry out, and salamanders lose the damp layer they hide in. | Non-native earthworms increase the abundance and diet quality of a common woodland salamander in its northern range | https://link.springer.com/article/10.1007/s10530-023-03168-3 | Biological Invasions (Scott, Bradley & Bourgault) | "Firstly, earthworms consume and remove the forest floor" (excerpt; the sentence goes on to cite a higher risk of drying out) / "the eastern red-backed salamander relies on the humidity of the forest floor to buffer dry weather conditions" (excerpt) / "the forest floor provides cover for eastern red-backed salamanders during displacements and when foraging" (excerpt) | high |
| A6 | **Hurt:** Fewer leaves can mean fewer small bugs to eat, and scientists think that may shrink salamander numbers. | same | same | Biological Invasions (Scott et al., describing Maerz et al. 2009) | "a reduction of the forest floor coincides with a reduction of soil and litter-dwelling microarthropods" (excerpt) / "Maerz et al. (2009) proposed that this reduction in prey may cause a decline in eastern red-backed salamander populations." | high (that it was proposed) |
| A7 | **Help:** In Quebec forests, more worms went with more salamanders, bigger salamanders, and more food in their bellies. | same | same | Biological Invasions (Scott et al.) | "population density, body size and total prey volume of P. cinereus increased, with earthworm abundance." (excerpt) / "Earthworms, which are soft-bodied and nutritious prey, composed most of the salamander diet at sites with earthworms" (excerpt) / "non-native earthworms have a net beneficial effect on P. cinereus populations in Eastern Canada" (excerpt) | high |
| A8 | **Hurt (other worms):** Where Asian jumping worms moved in, scientists found fewer young salamanders. | Invasive Asian Earthworms Negatively Impact Keystone Terrestrial Salamanders | https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0151591 | PLOS ONE (Ziemba, Hickerson & Anthony 2016) | "Earthworm abundance was negatively associated with juvenile and male salamander abundance" (excerpt) / "Plethodon cinereus population declines have been associated with leaf litter loss following the invasion of several exotic earthworm species" (excerpt) | high (Rhode Island, jumping worms) |

Extra (optional): a 2013 ESA talk abstract by Maerz et al., "A salamander perspective on earthworm
invasions of north temperate forest ecosystem" (https://eco.confex.com/eco/2013/webprogram/Paper43572.html):
"Earthworms are an important prey to many predators including woodland salamanders" (excerpt). Medium
(conference abstract, not peer-reviewed paper).

Suggested panel order: A1 → A2/A7 (help) → A4/A5/A3/A6 (hurt) → A8 (jumping worms, if wanted).

---

## B. Robins

| # | 6th-grade wording | Page title | URL | Publisher | Exact quote | Confidence |
|---|---|---|---|---|---|---|
| B1 | In an experiment, robins found hidden worms by hearing alone, and did worse when they couldn't hear. | Can robins hear worms? - MSU Library \| Montana State University | https://www.lib.montana.edu/acoustic-atlas/acoustic-atlas-blog/posts/can-robins-hear-worms.html | Montana State Univ. Library (Acoustic Atlas) | "found the worms with no problem," / "the birds had significantly less success if they could not use their hearing" | medium (secondary page about Montgomerie & Weatherhead 1997, *Animal Behaviour*; page gives no year) |
| B1 (backup) | same | How Do American Robins Find Worms? Behold the Rich Sensory World of Birds (A. McGlashen, 2026) | https://www.audubon.org/magazine/how-do-american-robins-find-worms-behold-rich-sensory-world-of-birds | Audubon | "But when white noise drowned out other sounds, the birds had less luck finding food." | medium |
| B2 | A worm grips the soil with tiny bristles called setae, so a robin has to tug hard. | Robin: Tugging Out Worms | https://journeynorth.org/tm/robin/tug_out_worms2.html | Journey North | "The worm can grip and anchor itself by stabbing its hair-like bristles, called setae, into the surrounding soil." / "A robin must tug hard to get an earthworm out of the ground." / "The stiff bristles hold so firmly that the worm can break as the robin tugs." | high (wording verified) / medium (education site) |

---

## C. Woodcock

| # | 6th-grade wording | Page title | URL | Publisher | Exact quote | Confidence |
|---|---|---|---|---|---|---|
| C1 | A woodcock's long bill has a bendy tip that can grab a worm underground. | American Woodcock Life History, All About Birds, Cornell Lab of Ornithology | https://www.allaboutbirds.org/guide/American_Woodcock/lifehistory | All About Birds (Cornell Lab) | "They forage by probing the soil with their long bills, which have flexible upper mandibles specialized for capturing and extracting earthworms." | high |
| C2 | Woodcocks rock back and forth as they walk, and the shaking may make worms move. | same | same | All About Birds (Cornell Lab) | "They sometimes rock their bodies backward and forward as they forage, shifting their weight heavily from foot to foot." / "The vibrations from this motion may prompt earthworms to move underground." | high (that Cornell says it); the effect itself is a "may" |

Note: this page gives no earthworm percentage (keep ADW's 50–90% from the existing table).

---

## D. Vibrations: moles, turtles, gulls, worm grunters

Page: "Worm Grunting, Fiddling, and Charming: Humans Unknowingly Mimic a Predator to Harvest Bait",
Kenneth C. Catania, *PLOS ONE* 3(10): e3472 (2008), https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0003472 — publisher short name "PLOS ONE".

| # | 6th-grade wording | Exact quote | Confidence |
|---|---|---|---|
| D1 | Wood turtles and herring gulls shake the ground to make worms come up. | "both wood turtles and herring gulls vibrate the ground to elicit earthworm escapes" (excerpt) | high |
| D2 | In a Florida forest, people "grunt" for bait by rubbing a stake in the ground; the shaking feels like a digging mole, so worms rush out. | "vibrating a wooden stake driven into the soil, a practice called "worm grunting"." (excerpt) / "bait collectors have unknowingly learned to mimic digging moles to flush worms." (excerpt) | high |

Keep the existing caveat: the worm was a native Florida species ("large endemic earthworms
(Diplocardia mississippiensis)") and the mole was "eastern American moles (Scalopus aquaticus)", not
nightcrawlers or star-nosed moles.

---

## E. Other worm eaters

| # | 6th-grade wording | Page title | URL | Publisher | Exact quote | Confidence |
|---|---|---|---|---|---|---|
| E1 | The small redbelly snake lives all over Minnesota, even the far northeast, and eats earthworms and slugs. | Redbelly Snake \| Minnesota DNR | https://www.dnr.state.mn.us/reptiles_amphibians/redbellysnake.html | Minnesota DNR | "The redbelly snake eats insects, earthworms, and slugs." / "It lives throughout Minnesota, including the far northeastern part of the state, which harbors few snake species." / "They grow to 8 to 10 inches." | high |
| E2 | Many ground beetles hunt at night, and earthworms are common prey for many of them. | Ground Beetles (Carabidae) – Wisconsin Horticulture | https://hort.extension.wisc.edu/articles/ground-beetles/ | UW–Madison Extension | "earthworms, and other small soil dwellers are common prey for many ground beetles." (excerpt) / "Many are nocturnal and some are attracted to lights at night." | high |

---

## F. Videos (all URLs confirmed to exist via YouTube's oEmbed endpoint, which returned the title and channel)

Lengths could NOT be checked (YouTube watch pages failed to load; oEmbed gives no duration). Matt
should watch each once for length and suitability before linking from Canvas (the game itself
must not link out).

| Topic | Title | Channel | URL | One line | Note |
|---|---|---|---|---|---|
| 1. Robin | Nature's Tug of War: Bird vs. Worm | NEWS CENTER Maine | https://www.youtube.com/watch?v=suvWIkHZdeo | Local TV nature clip of a bird pulling a worm. | Weakest pick: no Cornell/PBS/BBC robin-hunting video found. Backup: "Male Robin Brings Worms, Removes Fecal Sacs – May 15, 2017", Cornell Lab Bird Cams, https://www.youtube.com/watch?v=tA5E6JIKYCU (nest cam, robin carrying worms; not hunting). Content of the Maine clip not checked. |
| 2. Woodcock | American Woodcock foraging | Cornell Lab of Ornithology | https://www.youtube.com/watch?v=swHtEAEfGXM | A woodcock probing for food; likely shows the rocking walk (unconfirmed). | Strong channel. |
| 3. Star-nosed mole | This star-nosed mole has SUPERPOWERS 👃 \| Mammals - BBC | BBC | https://www.youtube.com/watch?v=GxgYxUVQHoQ | BBC *Mammals* clip of the star nose in action. | Alt: "Is This the World's Weirdest-Looking Killer? \| World's Deadliest", Nat Geo Animals, https://www.youtube.com/watch?v=myh5WjGTc8U ("Killer" framing). |
| 4. Worm grunting | This weird trick will help you summon an army of worms - Kenny Coogan | TED-Ed | https://www.youtube.com/watch?v=RDA64eUoxag | Animated lesson on Florida worm grunting and why worms flee mole-like vibrations. | Also embedded on thekidshouldseethis.com as "Worm grunting: How can thousands of worms be summoned from the earth?". TED-Ed lessons are usually ~5 min; check. |
| 5. Invasive worms | North America's Destructive, Invasive… Earthworms | SciShow | https://www.youtube.com/watch?v=sx4Ssk8IpaE | Explains why northern forests had no worms and how invasive worms change them. | Title says "Destructive": clashes with the game's "changed, not destroyed" framing; teacher could frame it. Alt (Minnesota): "All Minnesota worms are invasive, but which ones do you need to worry about? An expert weighs in", WCCO - CBS Minnesota, https://www.youtube.com/watch?v=uc4WfLa4vsk. Longer talk: "BCW: Dr. Lee Frelich on the Impacts of Earthworms on Forests", Botanical Club of Wisconsin, https://www.youtube.com/watch?v=ogH7KehdH-E (likely too long). No Great Lakes Worm Watch explainer found; their channel has only field-method clips (e.g. "Great Lakes Worm Watch Earthworm Extraction: Step 1"). |
