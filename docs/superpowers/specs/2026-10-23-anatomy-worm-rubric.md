# Rubric: the 3D nightcrawler anatomy model (V4 and later)

Matt (2026-10-23): "a high quality accurate 3D model of earthworms … look and feel like a
BioDigital or Zygote 3D model like they have for humans." It is used for lessons and learning
simulations at full detail, and in the game at a lighter level of detail without the insides.

Independent judges score each round of renders against this rubric. Each judge sees only the
renders, the rubric and the anatomy research (`docs/codev/research/anatomy.md`), never the
builder's own opinion. The model is "on par" when **every category scores 8 or more and the
mean is 8.5 or more** from at least two judges, with no open "must fix" item.

The anchor for the top of the scale is the BioDigital Human (human.biodigital.com) and Zygote
Body: clean studio presentation, believable materials, accurate shapes, every system readable on
its own, and nothing that looks broken up close.

## Scale (each category)

| Score | Meaning |
|---|---|
| 10 | Indistinguishable in quality from a BioDigital or Zygote system view |
| 8–9 | Professional medical-visualisation quality; small nits only |
| 6–7 | Good textbook-illustration quality; clearly a model, some wrong or crude parts |
| 4–5 | Recognisable but simplified or game-like; visible errors |
| 1–3 | Placeholder or wrong |

## Categories

1. **Anatomical accuracy.** Every structure a dissection guide shows is present, in the right
   segment, in the right order, at the right relative size, and attached to the right things
   (`anatomy.md` has the segment table). Counts are right: about 150 segments, 8 setae per segment
   from segment 2, 5 pairs of hearts, 3 pairs of seminal vesicles, 2 pairs of seminal receptacles,
   3 pairs of nerves per segment, a pair of nephridia per segment.
2. **Outside form.** Silhouette and proportions of an adult *Lumbricus terrestris*: long and
   slender, round in front, flattened toward the tail; the prostomium; crisp segment furrows; the
   saddle-shaped clitellum; setae that read at close range; male pores on segment 15; dark dorsal
   colour fading to a pale belly and tail.
3. **Materials and shading.** Wet, slightly translucent, living skin (not plastic or clay);
   organs that read as different tissues (muscular gizzard, thin crop, lobed seminal vesicles,
   glossy vessels); colour variation instead of flat fills.
4. **Lighting and presentation.** Studio lighting with soft shadows or occlusion cues and depth,
   a clean neutral background, good framing at every preset view, no aliasing that distracts.
5. **System clarity and layering.** Each system (outside, muscles, gut, blood, nerves,
   reproduction, nephridia) can be shown alone or together, and reads clearly in both; the cutaway
   is clean (cut faces show the body-wall layers); colour follows the usual atlas conventions but
   meaning is never carried by colour alone (labels and names).
6. **Geometry quality.** Smooth surfaces with no visible faceting at the default zoom, no gaps,
   no z-fighting, no organs poking through the body wall or each other, continuous connections
   (vessels join, nerves join the cord, the gut is one tube).
7. **Learning clarity (6th grade).** Labels use simple words, sit next to their part with a
   leader line, are readable (18 px or more), and each part has one plain sentence with a source.
   Menus are real buttons (keyboard and touch).
8. **Game readiness.** A light level of detail without insides exists for the game, with a
   vertex and draw-call cost that fits the Chromebook budget (visual-quality brief: one draw,
   no new render passes), and the full model loads in the lesson without long stalls.

## What a judge returns

For each category: a score, one line on why, and up to three concrete fixes ranked by impact,
each tied to a render ("render 3: the hearts float above the esophagus; they should loop round it
from the dorsal vessel to the ventral vessel"). Then a list of "must fix" items (anything wrong as
science or visibly broken), and an overall verdict: on par with BioDigital, close, or not yet.
