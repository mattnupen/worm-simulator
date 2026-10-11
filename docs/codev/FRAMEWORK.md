# Co-Development Framework: Building Software With Students

A guiding framework for co-developing AI-built games or apps with a class or a large group of students. It holds principles, evidence, strategy options and decision tests. It deliberately leaves out schedules, feature lists and subject content, so it stays valid across projects and as a project changes.

## How to use this document

- **Choose a strategy** (section 3) that fits the project's time budget and goals, and record the choice.
- **Plans come from this framework.** Development plans, forms, ballots and process changes should trace back to the principles here.
- **Check plans against it** using the decision tests (section 5).
- **When a plan conflicts with a principle, stop.** Either change the plan, or deliberately amend the framework and record why in the decision log.
- **What doesn't belong here:** dates, round numbers, roadmaps, subject facts, tool settings. Those live in each project's own files.

Evidence labels: **[Evidence]** means a published study or documented practice supports it. **[Inference]** means it's reasoned from adjacent evidence. Sources are at the end.

---

## 1. Stance

**Students guide development through what they learn.** Students study the subject, design how it should appear in the software, see their designs built, and critique the result. The teacher acts as editor and the AI acts as builder.

**Learning-first.** Software quality matters because it motivates learning, not as a goal of its own. School co-design projects have to choose between learning-oriented and outcome-oriented, and that choice shapes the rest (Iivari & Kinnula 2016). **[Evidence]**

**Level of participation.** Hart's ladder (Hart 1992) has eight rungs, from least to most youth agency:

| Rung | Name | What it looks like |
|---|---|---|
| 1 | Manipulation | Adults use young people to support their own cause and present it as the young people's idea |
| 2 | Decoration | Young people are present to make the project look good, with no role in it |
| 3 | Tokenism | Young people appear to have a voice but have little or no real say |
| 4 | Assigned but informed | Adults assign roles; young people understand the purpose |
| 5 | Consulted and informed | Adults run it; young people advise and learn how their input was used |
| 6 | Adult-initiated, shared decisions | Adults start it; decisions are shared with young people |
| 7 | Youth-initiated and directed | Young people start and run it; adults support |
| 8 | Youth-initiated, shared decisions with adults | Young people start it and choose to share decisions with adults |

- Rungs 1–3 are non-participation. Rungs 4–8 are real participation at increasing levels of youth control.
- Higher isn't automatically better. Hart later cautioned against treating the ladder as a ranking every project must climb. Avoid rungs 1–3 and be honest about which rung you're on (Hart 2008).
- A teacher-initiated, AI-built project can aim for **rung 6**, and should never fall below **rung 5** in any cycle. **[Evidence + Inference]**

**Roles.**
- **Students** are designers and critics once they've learned the content. Otherwise they are informants and testers.
- **Teacher** is editor and product owner. They set constraints, check accuracy, curate and merge ideas, and make the final call in public.
- **AI** is builder. It implements student designs as faithfully as constraints allow.

Druin's full "design partner" role needs about 3–4 children per 2–3 adults over months (Druin 2002), which a single teacher can't provide for a whole class. Strategies A and B below approximate it at scale. **[Evidence + Inference]**

---

## 2. Core principles

### P1. Learn first, then design.
**Why.** In informant design, children were strong informants on fun and feel but couldn't set learning goals for content they hadn't learned yet (Scaife et al. 1997). Learning by Design puts investigation before design, and students learned content as well as or better than comparison students (Kolodner). **[Evidence]**
**Apply.**
- Every design request is preceded by a short learning step on that topic.
- Before content is learned, ask only about experience: fun, confusion, where students got stuck.

**Avoid.** Asking for content designs on topics students haven't studied.

### P2. Students design. The teacher edits.
**Why.**
- Rung 6 means shared decisions.
- Players are "really good at identifying problems… a lot less good at identifying solutions" (Darrah). That finding is about untrained players. Students who have studied the topic and must cite evidence are in a different position. **[Evidence + Inference]**

**Apply.**
- Students propose *what* to add and *how it should work*.
- The teacher checks accuracy, merges similar ideas, sizes ideas to fit one build, and tells the AI to stay faithful to the student design.
- Set constraints up front, such as "one new thing this round" or "must fit one build," so students design within them.

**Avoid.** The teacher or AI quietly redesigning student ideas. Unconstrained asks that can't be built.

### P3. Designs come with evidence.
**Why.** Claim–evidence–reasoning (CER) scaffolds that are faded over time produced stronger independent reasoning in 7th graders (McNeill et al. 2006). When AI writes the code, learning comes from students making and defending decisions, not from voting alone. **[Evidence + Inference from Kafai; Tinterri et al. 2023]**
**Apply.**
- Every content design answers: *what, how do you know, and where did you learn it*.
- Start with sentence starters and remove them over rounds.
- Keep a shared "rules of thumb" list of vetted claims as the content spec the AI builds from.

### P4. Close the loop every cycle.
**Why.**
- Under Hart, students learning how their input was used is the line between tokenism and consultation.
- The TRAck method, tested with 84 children, tracks and acknowledges every idea. It found that a "fair, transparent, and defensible process" increased careful scrutiny (Read et al. 2014).
- Most co-design studies don't describe the loop back to children (Abimbade & Adisa 2023, preprint).
- Supergiant's Hades updates always visibly answered player feedback. **[Evidence]**

**Apply.**
- Each cycle, tell students what they said, what was built, and what wasn't and why.
- Credit groups or class sections, never individual names.
- Show student work in the software itself where possible, such as drawings or "designed by Period 3." This is the most visible proof their input mattered.
- Only ask for input you can act on.

### P5. Votes are input. A named decider decides, in public.
**Why.**
- Open voting has known failure modes: bandwagon effects, position bias, vocal minorities, and the "implicit promise" that the winner gets built (ProdPad).
- Design sprints use a single Decider so decisions don't stall (GV).
- Supergiant read every request and acted on recurring low-vote ideas. **[Evidence]**

**Apply.**
- Curate a short shortlist from student designs.
- Show it without names, in random order, with running totals hidden.
- Use ranked or limited choice, such as top 2, so students face trade-offs.
- Weight groups equally.
- Announce the decision and the reasoning, especially when it isn't the top choice.

### P6. Critique against the design.
**Why.**
- Valve: direct observation is "the best single method," and people can't reliably explain their own behavior (Valve 2009).
- Written peer feedback improves work (g ≈ 0.4). Peer *grading* doesn't (Double et al. 2020).
- Fullerton: judge each build against stable **experience goals** written as feelings, not features. **[Evidence]**

**Apply.**
- After each build, students compare it to the design they chose ("does it work the way we said?") and to the experience goals.
- Ask what happened and how it felt.
- Use kind, specific, helpful feedback norms (EL Education).
- When possible, watch a few students play.

### P7. Build learning into the mechanics.
**Why.**
- When content was built into the core game mechanic instead of added on as a quiz or reward, children learned more in equal time and chose to play about 7× longer (Habgood & Ainsworth 2011).
- Games teach best combined with other instruction, over multiple sessions (Wouters et al. 2013; Sitzmann 2011).
- An immersive world on its own did no better than a strong hands-on curriculum (EcoMUVE). **[Evidence]**

**Apply.**
- Student designs should turn content into something the player experiences or must act on.
- Pair play with the learning step and the critique.

**Avoid.** Content that appears only as text, quizzes or rewards.

### P8. Small increments: one headline change per release.
**Why.**
- Hades shipped one headline addition plus fixes per update.
- Factorio's regular, small updates kept its community engaged.
- AI-written codebases accumulate complexity and regressions with large changes. This evidence is second-hand and directional. **[Evidence, partly weak]**

**Apply.**
- Each release has one student-designed change plus fixes.
- Settle the core interaction before opening content design (Fullerton; Minecraft's "build the first missing piece").

### P9. Bugs are never on the ballot.
**Why.** Minecraft's early development ran on separate bug and feature lists. **[Evidence (practice) + Inference]**
**Apply.** Keep a separate bug list. Fix bugs as a standing obligation.

### P10. Equity of voice.
**Why.**
- About 17% of teens sometimes can't finish homework because of connectivity, and 24% in lower-income homes (Pew).
- Student voice helps most for students otherwise disengaged (Mitra).
- Shy children give brief answers (Scaife et al.), and children defer to adults (Druin).
- Children dislike being unable to draw on a computer, so paper matters (DisCo). **[Evidence]**

**Apply.**
- Weight groups equally.
- Accept paper drawings, photographed in.
- Make anything digital work on a phone.
- Personally invite quiet or non-participating students.
- Know which voices your strategy over- or under-represents (see section 3).

### P11. Light, chosen participation.
**Why.**
- Homework for this age should be short and doable "with little struggle" (Cooper).
- Choice among tasks raised motivation and scores. Completion only trended up (Patall et al. 2010).
- No benchmark exists for voluntary participation at this age. **[Evidence]**

**Apply.**
- Keep tasks short and fixed in shape.
- Offer choice where possible: critique only, or critique plus design.
- Measure participation per group every cycle.

### P12. Child-appropriate input tools.
**Why.**
- Children around 11–12 answer short forms reasonably consistently. They struggle with negative wording and vague quantifiers, and they disengage when bored (Borgers et al.).
- Smiley-face scales work at this age, but repeated use may inflate ratings, so read trends (Read & Horton). **[Evidence]**

**Apply.**
- Keep forms short, positively worded, concrete, and the same every cycle.
- Prefer "I like / I wish," ranking and drawing over long rating grids.

### P13. Guardrails for AI-built software.
**Why.** AI coding speeds early work, then complexity and drift accumulate. Recommended practice: humans set the structure, review changes, and keep scope small. **[Evidence, weak + Inference]**
**Apply.**
- An architecture note the AI follows.
- One change per session.
- Version control with a tag per release.
- A smoke test on the weakest student device.
- Instant rollback to the last release.
- The released version always playable.

### P14. Privacy by design.
**Why.** Users under 13 bring COPPA, FERPA and state student-data law (in Minnesota, § 13.32). Google requires schools to get COPPA consent for Workspace for Education. **[Evidence]**
**Apply.**
- Collect input through school accounts and collect minimal personal data.
- Tell students to keep names and faces out of drawings.
- The software has no accounts, analytics, tracking or AI chat on student input.
- Share only de-identified data with AI tools.
- Get district sign-off and inform families.
- Delete responses at project end.

### P15. Inspect and adapt the process.
**Why.** Online KidsTeam changed its process weekly based on participant experience (Walsh & Foss 2015). **[Evidence]**
**Apply.**
- Periodically review participation, input quality, and whether students notice their impact.
- Change the strategy deliberately and record why.

---

## 3. Participation strategies

All three follow the principles. They differ in **where design happens** and **how much class time they cost**. A project picks one as its default and can switch, or mix, by deliberate decision.

### Strategy A: Async form-led co-design
Everything happens through one recurring form, done as optional homework. Each form has the same sections every cycle:

1. **Learn:** a short lesson on the next topic (slides, video or vetted links) with one or two check questions. (P1)
2. **Critique the current build:** the same short questions every cycle. (P6, P12)
3. **React to classmates' designs:** an anonymized shortlist of the best designs from last cycle, with drawings. Students rank them and say what they'd add or change. This works as both peer critique and vote. (P5)
4. **Design for the next topic:** design questions (*what, how do you know, how it should work*) plus an optional drawing upload. (P2, P3)

This runs as a pipeline: each cycle critiques the last build, chooses the next feature, and collects designs for the one after. It applies Layered Elaboration, where ideas build in layers across iterations and co-design happens asynchronously (Walsh et al. 2010). **[Evidence + Inference]**

**Pros**
- Needs no class time, apart from an optional 1–2 minute announcement to close the loop.
- Scales to large groups, and every participant has an individual voice.
- Drawings capture ideas students can't express in words.
- Teacher time is predictable: review, shortlist and build request each cycle.
- Students see their designs, and their drawings, appear in the build.

**Cons**
- Optional homework means self-selected voices: the most motivated students and those with home access.
- No live discussion, so peer critique and argumentation are thinner, and Learning by Design's strongest routines are missing.
- About one cycle passes between a design and its build.
- The teacher holds more curation power, so transparent reasoning matters more (P5).
- Form fatigue if the form grows. File uploads require school sign-in.

**Best when** class time is scarce, groups are large, and participation is optional.

### Strategy B: In-class design studio
Based on Learning by Design. Once a topic is learned, small groups fill in a short **design card** (*what, evidence and source, how it works, a sketch*). They present it in a **pin-up** for peer critique, then classes choose. After the build, a **gallery walk** or play session compares the result to the cards. (Kolodner; McNeill et al.; Double et al.) **[Evidence]**

**Pros**
- Strongest learning evidence: argumentation, peer feedback and CER all happen live.
- Every student present takes part, which fixes the self-selection problem.
- Groups produce fewer, more developed designs (for example 15–20 cards rather than 90), which are easier to curate.
- Stronger ownership and social energy.

**Cons**
- Costs class time, roughly a class period per design topic.
- Group dynamics: turn-taking and leadership conflicts, and pupils judging quality by different criteria than the teacher (Landoni et al. 2018).
- Needs facilitation and materials.
- Fewer design cycles fit in the same calendar.

**Best when** the project is part of the curriculum, class time is budgeted, and deep content learning is the main goal.

### Strategy C: Teacher-designed, student-tested
The teacher (with the AI) designs features. Students play, report problems and feelings, and vote on a curated shortlist. This is the informant and tester model.

**Pros**
- Fastest and lightest, for both students and teacher.
- Highest control over accuracy and feasibility.
- Well suited to early rounds that set the core feel (P8), or to technical work students can't judge.

**Cons**
- Lowest ownership, around Hart rung 4–5. It risks tokenism if the loop isn't closed.
- Weakest learning mechanism, because students don't design or justify anything.
- Doesn't meet this framework's stance if used as the only strategy.

**Best when** setting the core feel, for technical or infrastructure changes, or as a fallback when participation or time drops.

### Choosing and mixing

| Question | Points to |
|---|---|
| Is there no class time beyond a few minutes? | A |
| Is class time budgeted and deep learning the priority? | B |
| Are we setting core feel or doing technical work? | C |
| Is participation optional and the group large? | A (watch equity) |
| Do we need every student's voice on a big decision? | B, or A plus a short in-class vote |

Common mixes:
- **A as the default, with occasional B sessions** for major topics.
- **C for the first rounds, then A or B** once the core feel is settled.

Record the chosen strategy and any switch in the decision log.

---

## 4. The cycle pattern

Whatever the strategy, each cycle contains these steps. Strategy A runs them in parallel through a pipeline; B runs them in sequence.

1. **Learn** the next topic. (P1)
2. **Design** with evidence and drawings. (P2, P3)
3. **React and decide:** a curated shortlist, ranked, then the decider explains. (P5)
4. **Build:** one headline change plus fixes, with guardrails. (P8, P9, P13)
5. **Play and critique** against the design and the experience goals. (P6)
6. **Close the loop:** what was said, what was built, what wasn't and why, and credit in the build. (P4)
7. **Adapt** the process when needed. (P15)

---

## 5. Decision tests

Before adopting a plan, form, shortlist, feature or process change:

- [ ] **Learn first:** Did students learn the content before designing it? (P1)
- [ ] **Student design:** Does the change come from student designs, with the teacher editing rather than replacing them? (P2)
- [ ] **Evidence:** Do content changes rest on a claim, evidence and a source? (P3)
- [ ] **Loop:** Will students see what happened to their input? (P4)
- [ ] **Decision quality:** Was the shortlist anonymized, shuffled and fairly weighted, and will the reasoning be published? (P5)
- [ ] **Critique:** Will students judge the result against the design and the experience goals? (P6)
- [ ] **Integration:** Is content built into play, not bolted on? (P7)
- [ ] **Size:** Is it one headline change that can be tested and rolled back? (P8, P13)
- [ ] **Equity:** Whose voices does this miss, and is that acceptable this cycle? (P10)
- [ ] **Load:** Is the student task short and stable? (P11, P12)
- [ ] **Privacy:** Does it add data collection, accounts, tracking or outside calls? If so, stop. (P14)

---

## 6. Living artifacts each project maintains

Their contents live in the project, not here:

- **Strategy record:** which strategy (A, B, C or a mix) and why.
- **Experience goals:** a short, stable list.
- **Rules of thumb:** vetted content claims with sources.
- **Idea log:** every design and its status (shortlisted, merged, built, parked), with reasons.
- **Decision log:** shortlists, choices, reasoning and framework amendments.
- **Bug list.**
- **Changelog:** the student-facing "you said, we built."
- **Architecture note** for the AI.
- **Participation record:** per group, per cycle.

---

## 7. Strength of evidence and gaps

- **Strong:** intrinsic integration (Habgood & Ainsworth); games combined with instruction (meta-analyses); faded CER scaffolds; peer feedback versus grading; questionnaire design for children.
- **Moderate or practice-based:** closing the loop; studio practices; voting-bias fixes, which come from product management rather than schools; Learning by Design (developer-reported); Layered Elaboration as async co-design.
- **Weak:** AI-coding risk figures, which are second-hand.
- **Gaps:** no study of co-design with a large group on one evolving product; none with AI-built software; no comparison of async versus in-class co-design for learning; no K-12 evidence that closing the loop raises participation; no data on voting behavior among 11–12-year-olds; no participation benchmarks for optional homework.

Where evidence is missing, measure it in the project and record what you learn.

---

## Sources

- Abimbade & Adisa (2023), review of child co-design papers (preprint): https://preprints.org/manuscript/202308.0550/v1/download
- Borgers et al., questionnaire design for children: https://www.epicentro.iss.it/okkioallasalute/documenti/letteratura_scientifica/Borghers_questionnaires%20children.pdf
- Cooper, homework research (Duke Today, 2006): https://today.duke.edu/2006/03/homework.html
- Darrah, players and problems (MP1st): https://mp1st.com/news/bioware-producer-players-good-identifying-problems-not-solutions
- Double et al. (2020), peer assessment meta-analysis: https://link.springer.com/article/10.1007/s10648-019-09510-3
- Druin (2002), roles of children in technology design: https://drum.lib.umd.edu/bitstream/handle/1903/1028/CS-TR-4058.pdf
- EcoMUVE randomized trial (Harvard): https://clic.gse.harvard.edu/file_url/199
- EL Education, critique protocols: https://eleducation.org
- Factorio Friday Facts #294: https://www.factorio.com/blog/post/fff-294
- Fullerton, *Game Design Workshop* excerpt: https://gamedeveloper.com/design/book-excerpt-game-design-workshop
- Google Workspace for Education FAQ (COPPA): https://knowledge.workspace.google.com/admin/getting-started/editions/google-workspace-for-education-faq
- GV design sprint Decider (Lyssna): https://www.lyssna.com/blog/what-is-a-design-sprint/
- Habgood & Ainsworth (2011), intrinsic integration: https://shura.shu.ac.uk/3556/
- Hades early access (PC Gamer): https://www.pcgamer.com/uk/a-journey-through-early-access-helped-make-hades-a-masterpiece/
- Hart, R. (1992), *Children's Participation: From Tokenism to Citizenship*, UNICEF Innocenti Essays No. 4; fact sheet: https://youthrex.com/wp-content/uploads/2019/05/FACTSHEET-Harts-Ladder.pdf
- Hart, R. (2008), "Stepping back from 'the ladder'," in *Participation and Learning* (Springer)
- Iivari & Kinnula (2016): https://urn.fi/URN:NBN:fi-fe2019040210765
- Kafai, *Minds in Play*: https://www.yasminkafai.com/minds-in-play
- Kolodner, Learning by Design: https://scholar.lib.vt.edu/ejournals/JITE/v39n3/kolodner.html
- Landoni et al. (2018), pupil roles in co-design: https://strathprints.strath.ac.uk/80725/1/Landoni_etal_IJCCI_2018_A_comparative_study_into_how_pupils_can_play_different_roles_in_co_design_activities.pdf
- McNeill et al. (2006), faded CER scaffolds: https://experts.arizona.edu/en/publications/supporting-students-construction-of-scientific-explanations-by-fa/
- Minecraft development lessons (Habrador): https://blog.habrador.com/2017/06/lessons-learned-from-development-of.html
- Minnesota Stat. § 13.32: https://www.revisor.mn.gov/statutes/cite/13.32
- Mitra, student voice: https://pure.psu.edu/en/publications/the-significance-of-students-can-increasing-student-voice-in-scho/
- Patall et al. (2010), homework choice: https://cbmt.franciscan.edu/wp-content/uploads/sites/32/2021/06/Patall-Cooper-_-Wynn-2010_Choice.pdf
- Pew, the homework gap: https://www.pewresearch.org/short-reads/2021/10/01/what-we-know-about-online-learning-and-the-homework-gap-amid-the-pandemic/markdown
- ProdPad, feedback voting bias: https://www.prodpad.com/blog/feedback-voting-bias-in-product-decisions/
- Read et al. (2014), TRAck: https://knowledge.lancashire.ac.uk/id/eprint/13730/
- Read & Horton (2025), Fun Toolkit / Smileyometer: https://knowledge.lancashire.ac.uk/id/eprint/54967/1/54967%20Read%20%26%20Horton%20VOR.pdf
- Scaife et al. (1997), informant design: https://chi1997.acm.org/proceedings/paper/ms.html
- Tinterri et al. (2023), constructionism and game-making review: https://iris.unimore.it/retrieve/36cd7bc3-1dc5-4626-97ca-1331448d42f2/CONSTRUCTIONISM%20AND%20GAME-MAKING_published.pdf
- Valve (GDC 2009), playtesting: https://cdn.fastly.steamstatic.com/apps/valve/2009/GDC2009_ValvesApproachToPlaytesting.pdf
- Walsh et al. (2010), Layered Elaboration: https://mdsoar.org/items/f364f1f8-2403-4ea1-be73-1d3d4fd856d1/full
- Walsh et al. (2012), DisCo: https://mdsoar.org/items/623fa370-a933-494f-8602-87d43363f5bc/full
- Walsh & Foss (2015), Online KidsTeam: https://mdsoar.org/handle/11603/7722
- Wouters et al. (2013) and Sitzmann (2011), via Kapp summary: https://karlkapp.com/?p=4333
- AI coding risks (Ziva, secondary source): https://ziva.sh/blogs/vibe-coding-games
