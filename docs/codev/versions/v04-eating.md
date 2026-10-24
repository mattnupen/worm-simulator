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
  The same re-cut also carries the game menu (PR #53, Matt chose to include it): a top-left tab
  with Mission, Rounds, Settings, About and Pause replaces the Settings screen, the Versions
  pop-up and the Pause card.
  Students who opened V4 before the fix played without these.
- **Hot fix 2 (2026-10-23).** Matt asked for `/v4/` to be re-cut again once all open game work
  except Burrow Board was on `main` (`npm run release -- 4 --emergency-fix`, from `main` at 26a431c):
  1. Start opens both Learn and Play, so students can start playing right away; Vote waits on
     both (PR #58).
  2. The eating film's inside view uses the shared 3D anatomy model. The film's worm is built when
     a student opens the lesson (or the film first plays), not when the game loads.
  3. A "Virtual worm" link, with its own icon, on Start, in the game menu (after Pause) and in the
     film's tool row; the anatomy viewer's controls have icons.
  Rendering changed in the film, so it still needs a check on a student Chromebook (release
  checklist item 5).
- **Hot fix 3 (2026-10-24).** Matt found the game hard to use on a phone, including the Virtual
  worm page with no way back. Re-cut with `npm run release -- 4 --emergency-fix`:
  1. Virtual worm on phones: the menu is a folded sheet at the bottom, a part's card takes its
     place, it opens on the whole worm sized to the screen, and a Home button goes back to the game.
  2. The Start card stops below the game menu's tab instead of sliding under it.
  3. Underground, the layer names keep clear of the hint card, so none is hidden behind it.
  4. Re-cut again the same day (from `main` at 4fbfdb9) so the Virtual worm page has the game
     menu too: Mission (quests and Back to start), Rounds, Settings (Sound, Text size) and About.

## Game choices (recorded, never labelled on screen)

- Every robin catch takes the worm to the nest (`WHOLE_WORM_CHANCE`, src/predators/huntOutcome.ts).
- The grip's energy bar and the robin's pull-and-regrip turns (src/predators/grip.ts).
- Wiggling free from a robin in flight (`nestWiggleChoice`, src/content/text.ts).
- Coming up only where the whole body can lie on open ground (`comeUpChoice`, src/content/text.ts).
- The robin scratches the leaf litter with its feet and digs down a little to reach a worm in the top two layers (`huntDigChoice`, src/content/text.ts; spec revision 4).
