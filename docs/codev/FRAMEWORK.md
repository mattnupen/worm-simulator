# Co-Development Framework: Building Software With Students

A guiding framework for co-developing an AI-built game or app with a large group of students. It holds the principles, the evidence behind them, and tests for checking any plan. It deliberately leaves out schedules, feature lists and project content, so it stays valid as the project changes.

## How to use this document

- **Plans come from this framework.** Any development plan, round plan, ballot or process change should be traceable to the principles here.
- **Check plans against it.** Before committing to a plan, run it through the decision tests (section 4).
- **When a plan conflicts with a principle, stop.** Either change the plan, or deliberately amend this framework and record why in the decision log. Don't quietly drift.
- **What does not belong here:** dates, round numbers, feature roadmaps, content facts, tool settings or anything else that will change. Those live in the project's plan and log files.

Evidence labels: **[Evidence]** means a published study or documented practice supports it. **[Inference]** means it's reasoned from adjacent evidence. Sources are listed at the end.

---

## 1. Project stance

**Learning-first.** The project exists so students learn: the subject content, plus how software is designed. Game quality matters because it motivates that learning, not as a goal of its own. School co-design projects have to choose between learning-oriented and outcome-oriented, and that choice shapes everything else (Iivari & Kinnula 2016). **[Evidence]** When the two conflict, learning wins.

**Honest level of participation.** Hart's ladder of participation (Hart 1992) has eight rungs, from least to most youth agency:

| Rung | Name | What it looks like |
|---|---|---|
| 1 | Manipulation | Adults use young people to support their own cause and present it as the young people's idea |
| 2 | Decoration | Young people are present to make the project look good, with no role in it |
| 3 | Tokenism | Young people appear to have a voice but have little or no real say |
| 4 | Assigned but informed | Adults assign roles; young people understand the purpose and why they're involved |
| 5 | Consulted and informed | Adults run it; young people give advice and learn how their input was used |
| 6 | Adult-initiated, shared decisions | Adults start it; decisions are shared with young people |
| 7 | Youth-initiated and directed | Young people start and run it; adults support |
| 8 | Youth-initiated, shared decisions with adults | Young people start it and choose to share decisions with adults |

Rungs 1–3 are non-participation. Rungs 4–8 are real participation, at increasing levels of youth control.

Higher is not automatically better. Hart later cautioned against treating the ladder as a strict ranking every project should climb. The right rung depends on the project, and what matters is avoiding rungs 1–3 and being honest about which rung the project is on (Hart 2008).

Because the teacher initiates this project and owns the build, rungs 7–8 don't fit its structure. The target is **rung 6 where possible, and never below rung 5 in any cycle**. **[Evidence + Inference]**

**Realistic roles at scale.** Druin defines four roles children can play in design: user, tester, informant, and design partner. Full design partnership needs about 3–4 children per 2–3 adults and months of sessions (Druin 2002). **[Evidence]** With one teacher and a large group:
- **Every student** is an informant and tester.
- **A small, rotating group** works closer to design partners.
- **The teacher** is product owner and final decider. **[Inference]**

---

## 2. Core principles

### P1. Students own fun and feel. The teacher owns learning goals and accuracy.
**Why.** In informant design, children were strong informants on fun, feedback, sounds and puzzles. They could not set learning goals for content they hadn't learned yet (Scaife et al. 1997). **[Evidence]**
**Apply.**
- Ask students about experience: what was confusing, boring, exciting, or stuck.
- Accuracy of subject content is the teacher's call, checked against vetted sources.
- Teach the content before asking students to propose content-based features.

**Avoid.** Asking students to design content they haven't learned. Letting a popular vote override accuracy.

### P2. Close the loop every cycle.
**Why.** Under Hart's ladder, students learning how their input was used is the line between tokenism and real consultation. The TRAck method, tested with 84 children, tracks, represents and acknowledges every idea, and found that a "fair, transparent, and defensible process" made students scrutinize designs carefully (Read et al. 2014). Most published co-design studies don't describe the loop back to children at all (Abimbade & Adisa 2023, preprint). Supergiant required every Hades update to visibly respond to player feedback. **[Evidence]**
**Apply.**
- Each cycle, tell students what they said, what was built, and what wasn't built and why.
- Keep a log of every idea and its status (considered, merged, built, parked), each with a reason.
- Only ask for input you can actually act on.

**Avoid.** Collecting feedback with no visible result. Unexplained silence about popular ideas.

### P3. Ask about problems, observe behavior, and own the solutions.
**Why.** Players are "really, really good at identifying problems… a lot less good at identifying solutions" (Darrah, former BioWare producer). Valve calls direct observation "the best single method" of playtesting, because "people don't know why they do what they do." Group discussion suffers from anchoring and social pressure, and surveys reduce bias but lose nuance (Valve 2009). **[Evidence]**
**Apply.**
- Ask what happened and how it felt, not what to build.
- Watch a few players play each new version, and note where they get stuck or quit.
- Collect individual written input before any group discussion.
- Turn recurring problems into options. The team designs the solutions.

**Avoid.** Feature wish-list forms. Relying only on self-reported surveys.

### P4. Votes are input. A named decider decides, in public.
**Why.**
- Open voting has documented failures: bandwagon effects, early-mover and position bias, vocal minorities, solution-level requests, and the "implicit promise" that the winner gets built (ProdPad).
- Supergiant read every request and acted on recurring low-vote ideas (Rao, on Hades).
- Design sprints pair voting with a single Decider, because debate otherwise stalls (GV design sprint). **[Evidence]**

**Apply.**
- Curate a short ballot from recurring problems and well-supported proposals.
- Phrase each option as a testable bet: "If we do X, we expect Y to change."
- Randomize option order. Hide running totals.
- Use ranked or limited-budget voting (e.g. top 2, or Buy a Feature, where each student's budget covers only about a third to half of the options) so students face trade-offs.
- The decider announces the choice and the reasoning, especially when it isn't the top vote.

**Avoid.** Open "suggest anything" upvote boards. Binding votes. Running totals visible while voting is open.

### P5. Bugs and must-fixes are never on the ballot.
**Why.** Minecraft's early development ran on two separate lists, bugs and features. Mixing them makes broken things compete with new things for attention. **[Evidence (documented practice) + Inference]**
**Apply.** Keep a separate bug list. Fix bugs alongside every release, as a standing obligation.

### P6. Small increments: one headline change per release.
**Why.**
- Every Hades update carried one headline addition plus feedback fixes.
- Small, frequent releases with a regular update post kept Factorio's community engaged and its team focused.
- AI-assisted codebases accumulate complexity and regressions quickly, especially with large changes (CMU and others, second-hand and directional). **[Evidence, partly weak]**

**Apply.**
- Each release has one change students can point to as theirs, plus fixes.
- If an idea won't fit one release, ship the smallest meaningful slice.

**Avoid.** Bundling several features to satisfy several factions.

### P7. Core feel before content. Judge every build against fixed experience goals.
**Why.**
- Fullerton's playcentric method settles the core mechanic first. It then judges each build against **player experience goals written as feelings, not features**.
- Notch's rule was to play the game as if finished and build the first missing piece. **[Evidence]**

**Apply.**
- Set a small number of experience goals early, keep them stable, and score every build against them.
- Don't open feature voting until the core interaction feels right.
- Goals can change only by deliberate decision, recorded in the log.

**Avoid.** Adding content to a core that doesn't feel good. Goals that are really feature lists.

### P8. Put the learning inside the mechanics, then debrief.
**Why.**
- When content was built into the core game mechanic instead of attached as a quiz or reward, children learned more in equal time and chose to play about 7× longer (Habgood & Ainsworth 2011).
- Meta-analyses show games teach best when combined with other instruction, played over multiple sessions, and played in groups (Wouters et al. 2013; Sitzmann 2011).
- An immersive ecology world beat no strong hands-on curriculum on its own (EcoMUVE). The investigation around the game matters as much as the game. **[Evidence]**

**Apply.**
- Every content idea should become something the player experiences or must act on.
- Use short just-in-time information in the game instead of long front-loaded lectures.
- Pair each cycle with a brief class discussion.

**Avoid.** Content delivered only before or outside play. Content bolted on as quizzes or rewards.

### P9. Make students justify design decisions with evidence.
**Why.**
- When AI writes the code, the constructionist benefit has to come from students *making and defending decisions*. Voting alone mostly removes the learning mechanism. **[Inference from Kafai; Tinterri et al. 2023]**
- Learning by Design gives middle school routines for this. **Pin-ups:** students present a design with evidence for peer critique. **Gallery walks:** students show what happened and what they'll change. **Rules of thumb:** shared claims posted and revised over time. LBD students learned content as well or better than comparison students (Kolodner).
- Claim–evidence–reasoning scaffolds that are **faded over time** produced stronger independent reasoning in 7th graders (McNeill et al. 2006).
- Written peer feedback improves work (g ≈ 0.4). Peer grading does not (Double et al. 2020). **[Evidence]**

**Apply.**
- Content-related proposals come with a claim, evidence and reasoning.
- Start with full sentence frames and remove them over time.
- Keep a shared, revisable "rules of thumb" list as the content spec the AI builds from.
- Teach a feedback norm such as kind, specific and helpful (EL Education). Use peer feedback, never peer grades.

### P10. Design for equity of voice.
**Why.**
- About 17% of teens sometimes can't finish homework because of connectivity, and 24% in lower-income households (Pew). Demanding software raises that barrier.
- Student-voice participation helps most for students who otherwise find little meaning in school (Mitra).
- Shy children give brief answers (Scaife et al.), and students defer to adults (Druin). **[Evidence]**

**Apply.**
- Every student gets at least one in-class channel to give input and vote, independent of home access.
- Draw rotating roles (lead testers, reviewers) at random so quiet students get a turn.
- Weight groups such as class sections equally so one enthusiastic group can't dominate.
- Show ideas without authors' names when deciding.
- Accept paper input, since children dislike being unable to draw digitally (DisCo).
- Personally invite students who aren't participating.

**Avoid.** Decisions made only by at-home volunteers. Popularity contests between named students.

### P11. Make participation light, chosen and visible.
**Why.**
- Homework for this age should be short and achievable "with little struggle" (Cooper).
- Choosing among homework options raised motivation and test scores. Completion only trended up (Patall et al. 2010).
- No benchmark exists for voluntary participation or drop-off at this age. **[Evidence]**

**Apply.**
- Offer a few task types students choose between, such as testing, evidence-based proposals, and making assets or info content.
- Keep each one short.
- Measure participation per group every cycle and react to trends.

**Avoid.** Assuming novelty will sustain participation. One-size-fits-all tasks.

### P12. Use feedback instruments built for children.
**Why.**
- Children around 11–12 answer short self-completion forms reasonably consistently. They struggle with negatively worded items and vague quantifiers, and they satisfice when bored (Borgers et al.).
- The Smileyometer face scale works at this age. Repeated use may inflate ratings, so read trends, not absolute scores (Read & Horton). **[Evidence]**

**Apply.**
- Keep forms short and stable from cycle to cycle so trends are comparable.
- Use positive wording and concrete questions such as "Did you get stuck? Where?"
- Use "I like / I wish" prompts and ranking instead of long rating grids.

**Avoid.** Long forms. Double negatives. Changing questions every cycle.

### P13. Guardrails for AI-built software.
**Why.** AI coding speeds early work, then complexity, bugs and structural drift accumulate. Experienced developers often overestimate the speedup. Recommended practice is for a human to set the structure and system boundaries, review every change, and keep scope small (second-hand, directional). **[Evidence, weak + Inference]**
**Apply.**
- Keep an architecture note the AI must follow.
- Make one change per work session.
- Use version control with a tagged version per release.
- Run a smoke test on the weakest device students will actually use.
- Keep an instant rollback to the previous release.
- Keep the released version playable at all times.

**Avoid.** Large AI rewrites. Releasing untested builds to students. Code no one has reviewed.

### P14. Privacy by design.
**Why.** Middle school users are mostly under 13, so COPPA, FERPA and state student-data law apply. In Minnesota that's § 13.32. Google requires schools to obtain COPPA consent for Workspace for Education. **[Evidence]**
**Apply.**
- Collect input through school-managed accounts.
- Collect the minimum personal data.
- The software has no accounts, analytics, third-party tracking or AI chat on student input.
- Share only de-identified summaries with AI tools.
- Get district sign-off before launch and inform families.
- Delete responses at the end of the project.

**Avoid.** Any feature that sends student data off-device without district approval.

### P15. Inspect and adapt the process itself.
**Why.**
- Online KidsTeam changed its own process every week based on participant experience (Walsh & Foss 2015).
- Layered Elaboration shows co-design can run asynchronously, with ideas built in layers across iterations (Walsh et al. 2010). **[Evidence]**

**Apply.**
- Periodically review what's working in the process: participation, quality of input, and whether students notice their impact.
- Change the process deliberately and record why.

---

## 3. The cycle pattern

Every cycle follows this pattern, whatever its length or schedule:

1. **Frame.** Set a focus or question for the cycle (P8).
2. **Play and observe.** Students use the current version. Some are observed directly (P3).
3. **Gather.** Short individual input on problems and feelings, plus optional evidence-backed proposals (P3, P9, P12).
4. **Decide.** Curate options, vote, and the decider chooses and explains (P4).
5. **Build.** One headline change plus fixes, with guardrails (P5, P6, P13).
6. **Close the loop.** Report what was said, what was built and what wasn't, and update the logs (P2).
7. **Reflect.** Debrief the learning (P8). Occasionally reflect on the process itself (P15).

---

## 4. Decision tests for any plan

Before adopting a plan, ballot, feature or process change, check:

- [ ] **Learning:** Does it serve the learning goals, or at least not undercut them? (Stance)
- [ ] **Ownership:** Are students being asked about things they can judge, with content accuracy kept with the teacher? (P1)
- [ ] **Loop:** Will students see what happened to their input? (P2)
- [ ] **Problem-based:** Did it come from observed or reported problems, not just requested solutions? (P3)
- [ ] **Decision quality:** Was the ballot curated and unbiased, and will the reasoning be published? (P4)
- [ ] **Size:** Is it one headline change, small enough to build, test and roll back? (P6, P13)
- [ ] **Experience goals:** Does it move the build toward the stated experience goals? (P7)
- [ ] **Integration:** Is any content built into play, not bolted on? (P8)
- [ ] **Evidence:** Are content-based changes backed by a claim, evidence and a source? (P9)
- [ ] **Equity:** Could every student have contributed to this decision, regardless of home access or confidence? (P10)
- [ ] **Load:** Does it keep student tasks short and chosen? (P11)
- [ ] **Privacy:** Does it add any data collection, accounts, tracking or outside calls? If so, stop. (P14)

---

## 5. Living artifacts the project should maintain

These are named here, but their contents live in the project, not in this document:

- **Experience goals:** a short, stable list (P7).
- **Content spec, or rules of thumb:** vetted claims with sources, which the AI builds from (P1, P9).
- **Idea log:** every idea with its status and reason (P2).
- **Decision log:** each cycle's options, choice and reasoning, plus any amendments to this framework (P4).
- **Bug list:** separate from ideas (P5).
- **Changelog:** a student-facing "you said, we built" record (P2).
- **Architecture note:** structure and rules the AI must follow (P13).
- **Participation record:** per group, per cycle (P11, P15).

---

## 6. Strength of evidence and known gaps

- **Strong:** Habgood & Ainsworth on intrinsic integration; meta-analyses on games combined with instruction; faded CER scaffolds; peer feedback versus peer grading; children's questionnaire design.
- **Moderate or practice-based:** closing the loop; studio practices from Hades, Minecraft and Factorio; voting-bias mitigations (product management literature, not schools); Learning by Design (developer-reported outcomes).
- **Weak:** AI-coding risk statistics, which are second-hand from a vendor blog.
- **Gaps:** no study of co-design with ~90 children on one evolving product; none involving AI-coded software; no K-12 study showing that closing the loop raises future participation; no data on voting behavior among 11–12-year-olds; no benchmark for voluntary participation rates.

Where evidence is missing, the project should measure for itself and record what it learns.

---

## Sources

- Abimbade & Adisa (2023), review of child co-design papers (preprint): https://preprints.org/manuscript/202308.0550/v1/download
- Borgers et al., questionnaire design for children: https://www.epicentro.iss.it/okkioallasalute/documenti/letteratura_scientifica/Borghers_questionnaires%20children.pdf
- Cooper, homework research (Duke Today, 2006): https://today.duke.edu/2006/03/homework.html
- Darrah, players and problems (MP1st): https://mp1st.com/news/bioware-producer-players-good-identifying-problems-not-solutions
- Double et al. (2020), peer assessment meta-analysis: https://link.springer.com/article/10.1007/s10648-019-09510-3
- Druin (2002), roles of children in technology design: https://drum.lib.umd.edu/bitstream/handle/1903/1028/CS-TR-4058.pdf
- EcoMUVE randomized trial (Harvard): https://clic.gse.harvard.edu/file_url/199
- Factorio Friday Facts #294: https://www.factorio.com/blog/post/fff-294
- Fullerton, *Game Design Workshop* excerpt: https://gamedeveloper.com/design/book-excerpt-game-design-workshop
- Google Workspace for Education FAQ (COPPA): https://knowledge.workspace.google.com/admin/getting-started/editions/google-workspace-for-education-faq
- Habgood & Ainsworth (2011), intrinsic integration: https://shura.shu.ac.uk/3556/
- Hades early access (PC Gamer): https://www.pcgamer.com/uk/a-journey-through-early-access-helped-make-hades-a-masterpiece/
- Hart's ladder (YouthREX fact sheet): https://youthrex.com/wp-content/uploads/2019/05/FACTSHEET-Harts-Ladder.pdf
- Hart, R. (1992), *Children's Participation: From Tokenism to Citizenship*, UNICEF Innocenti Essays No. 4
- Hart, R. (2008), "Stepping back from 'the ladder': reflections on a model of participatory work with children," in *Participation and Learning* (Springer)
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
- Design sprint Decider (Lyssna): https://www.lyssna.com/blog/what-is-a-design-sprint/
- Buy a Feature (IdeaPlan): https://www.ideaplan.io/frameworks/buy-a-feature
- AI coding risks (Ziva, secondary source): https://ziva.sh/blogs/vibe-coding-games
- EL Education critique protocols: https://eleducation.org
