# V4 · Eating

- **Live:** 2026-10-23. **Build:** https://wormsimulator.com/v4/
- The rest of this round's materials (topic, form, slides, results) are still to be added.

## Emergency fixes

- **Hot fix (2026-10-23).** Matt asked for four gameplay fixes and for `/v4/` to be re-cut with
  them (`npm run release -- 4 --emergency-fix`):
  1. At the top of the soil, Space (or the touch button) always comes up. If the spot right there
     has no room for the worm to lie out, it first crawls under the leaves to the nearest open spot.
  2. While the robin carries the worm to its nest, mashing Space (or tapping) makes it wiggle and
     flail, with a chance to wiggle free and drop to the forest floor. Nothing on screen explains it.
  3. The worm crawls up and over rocks and the fallen log. Tree trunks still block it. The robin
     can't grab a worm while it's up on a rock or the log.
  4. Backing up works: on the surface S, the down arrow or the joystick pulled down crawls tail
     first (before, it did nothing), and underground a stuck worm backs up when you point away
     from its head.
  Students who opened V4 before the fix played without these.

## Game choices (recorded, never labelled on screen)

- Every robin catch takes the worm to the nest (`WHOLE_WORM_CHANCE`, src/predators/huntOutcome.ts).
- The grip's energy bar and the robin's pull-and-regrip turns (src/predators/grip.ts).
- Wiggling free from a robin in flight (`nestWiggleChoice`, src/content/text.ts).
- Coming up only where the whole body can lie on open ground (`comeUpChoice`, src/content/text.ts).
