# Worm Simulator: Version 1 Design

Date: 2026-09-30
Status: Approved in brainstorming, awaiting written-spec review

## 1. Purpose

Students play an invasive earthworm in a northern Minnesota forest. They find food, dodge predators and survive the seasons. The better they do, the more the forest changes. Minnesota's forests grew for about 11,000 years with no earthworms, so every earthworm here is an invader. The player's success and the forest's original community pull in opposite directions, and that tension is the lesson.

**Audience:** 6th graders in Matt's Outdoor Education classes at Ordean, Duluth.
**Class use:** one 15 to 25 minute play block, then a class discussion. One chapter fits about one period.
**Learning goals (ranked equally):**
- **Worms change the whole forest:** less leaf litter, fewer trillium, ferns and seedlings, fewer fungus partners and ground-nesting birds, and more of species like sedge.
- **How a worm senses the world:** skin breathing, light-sensing skin, smell and taste, vibration.

**Framing rule:** the forest is never shown as "destroyed" or "dead." It is a *different* forest with winners and losers. The game says "the forest changed," never "the forest is dying."

## 2. Version 1 scope

**In:** Chapter 1 (leaf-litter worm, 3D forest floor), Chapter 2 (angle worm, side-view underground), the forest change screen with talking neighbors, Worm View, free play after Chapter 2, the full accessibility set in section 7, local save plus save code, single-file build.

**Out (planned later):** Chapter 3 (nightcrawler), Chapter 4 (jumping worm), teacher tools (teacher key, projector mode, discussion prompts), field-lab tie-in (mustard pour), playable native creatures, invasion map / Duluth regional view, remappable keys, separate volume sliders, picture glossary.

## 3. Game design

### 3.1 Camera and controls
- **Forest floor:** 3D, camera behind the worm and following on its own. The player never steers the camera. Areas are small and contained (a log, a leaf pile, a birch patch).
- **Underground:** side view. The worm moves on a 2D plane through a cross-section of soil drawn in 3D.
- Going down a burrow is a smooth camera move between the two views, not a scene change into a different-looking game.
- **Commands (the same everywhere):** Move, Action, Worm View.
  - Keyboard: arrows or WASD, Space = Action, V = Worm View.
  - Touch and trackpad: on-screen joystick plus two large buttons.
  - Gamepad: stick plus two buttons.
  - Switch access and assisted steering: see section 7.
- Action does whatever fits the moment: hide under leaves, dig, leave a cocoon, grab.

### 3.2 Core loop
**Eat → grow → clitellum → cocoons.**
- Food makes the worm longer.
- At full size the clitellum band appears (a real sign of an adult worm), and the worm can leave cocoons with Action.
- **Cocoons are the score.** They become the next chapter's population and drive the forest change (section 4).

### 3.3 Survival
- **Moisture is the only meter.** It's shown as a bar plus a water-drop icon, the word "Moist," and a shape change, never color alone.
  - Sun and dry air drain it.
  - Wet soil, dew and rain refill it.
- **The worm's body shows its condition.** A drying worm looks dull and wrinkled and moves slower. A hurt worm is shorter because it lost segments. There's no health bar.
- **Danger is an event, not a meter.** A shadow, vibration or light gives a warning, the predator strikes, then it leaves. If caught, the worm loses length.
- **Cold is the level itself.** The frost line is visible in the world and moves down over time.
- **Failing:** at minimum length, or when completely dry, the level restarts from the last checkpoint. There's no game-over screen.
- **HUD during play:** the Moisture bar and the cocoon count. Nothing else.

### 3.4 Progression
Worms invade in waves by ecological group, and the chapters follow that real order. After Chapter 2, **free play** opens: any cleared chapter and level can be replayed in any order.

**Chapter 1: Leaf-litter worm (epigeic), 3D forest floor, fall.** Levels are 3 to 5 minutes each.
1. **First bite:** move, eat, grow. Leaf types differ: ash, basswood and aspen grow you fastest, maple next, oak slowest. A sunny gap teaches Moisture.
2. **Robin:** a shadow and hop vibrations warn you. Use Action to hide under leaves.
3. **Follow your nose:** introduces Worm View. A fungus smell trail, visible only in Worm View, leads to food under a log.
4. **Before the frost:** reach your clitellum and leave cocoons before the first hard frost.
→ Forest change screen.

**Chapter 2: Angle worm (endogeic), side-view underground, fall to spring.**
1. **Eat the ground:** dig by eating through soil blocks, leaving tunnels and castings.
2. **The mole:** digging vibrations warn you. Fleeing upward escapes the mole but brings you near the robin.
3. **Frost moves down:** adult angle worms die when frozen, but cocoons survive. You race to leave cocoons deep before the frost line reaches you. This chapter's ending is the adult not surviving, and spring brings the cocoons hatching.
4. **Dark tunnels:** a senses-only level. Worm View is locked on.
→ Forest change screen, then free play unlocks.

### 3.5 Worm View
- A toggle available in every level from Chapter 1 Level 3 on. Senses-only levels lock it on.
- The screen goes dark, and only worm senses show:
  - **Light:** felt brightness, strongest at the head. Shown as a soft glow with a sun-ray shape at its edge.
  - **Smell:** trails to food and fungus. Shown as dotted trails.
  - **Vibration:** robin hops and mole digging. Shown as expanding rings.
- Each sense has its own shape and pattern, so none of them depend on color.

## 4. Forest change and the neighbors

### 4.1 Forest change screen (after each chapter)
- A painted side-view slice of one patch of forest floor, shown years later.
- Between states it changes smoothly: litter thins, trillium, ferns and seedlings thin out, sedge spreads. With reduce motion on, it's a direct before/after swap.
- The number of worms drawn in the slice, and how far the change goes, comes from the cocoons the player left. Better play means a bigger change.

### 4.2 Neighbors row
- 3 to 4 species cards. Each card shows:
  - a painting
  - the common name
  - the word **Native** or **Invasive**
  - an arrow plus the word "more" or "fewer"
  - one spoken line, 8 to 12 words
- Lines play automatically and can be replayed with a 🔊 button.
- Examples (wording final only once a source is attached):
  - Trillium (Native, fewer): "My seeds need the leaf blanket to sprout."
  - Ovenbird (Native, fewer): "Fewer bugs here. I have to search farther."
  - Sedge (Native, more): "Bare ground? More room for me!"
  - Earthworm (Invasive, more).

### 4.3 Forest model
- A small rule-based model, the same every time. Inputs: chapter and total cocoons. Outputs: litter depth (0 to 1), plus a level and trend for each neighbor species.
- The model is explained in plain words on the "How do we know?" screen and labeled **"Game model: real forests change over many years."**

## 5. Science honesty

- All student-facing facts, voice lines and labels live in `src/content/`. Each fact has a source ID that matches an entry in the sources list.
- **The build fails** if any shown fact has no source, or if it's still marked `verify`.
- A **"How do we know?" 📖** button on the change screen lists the sources in plain words.
- Game exaggerations are labeled on the same screen. Example: "Game choice: real worms grow much slower than this."
- Every species label uses the word Native or Invasive, never color alone.
- Any fungus shown always carries **"Look, don't eat."**
- Facts still to source before they can ship:
  - sedge increases where worms invade
  - each predator's diet and range in northern Minnesota
  - mole vibrations driving worms upward (ScienceDaily worm-grunting source listed)
  - angle worm adults dying from freezing while cocoons overwinter (UMN Extension listed)

### Sources (re-check each before classroom use)
- Minnesota DNR: Earthworms: no native earthworms, how they spread
- USFWS: Minnesota's Can of (Invasive) Worms: about 15 invasive species
- UMN Extension: Earthworms: species, life cycles, overwintering
- Great Lakes Worm Watch (UMD): ecological groups (litter, topsoil, deep-burrowing)
- UMN Jumping Worm handbook: life cycle, hatching temperature, spread
- UMN: The global earthworm invasion: effects on plants, songbirds, moose
- Great Lakes Now: Global worming: trillium and leaf litter
- Lawrence et al. 2003: fewer fungus partners on sugar maple roots
- Hess: Photoreceptors in *Lumbricus terrestris*: light-sensing cells
- Zirbes et al. 2011, PLOS ONE: worms follow fungus smells
- ScienceDaily: worm grunters: mole vibrations drive worms up
- Indiana Academy of Science paper; Wikipedia: *Lumbricus terrestris*: foraging, middens, leaf preferences

## 6. Reading, voice and text

- Little or no text during action. Warnings are icons plus sounds.
- Text appears only between levels, in 1 to 2 short sentences at a 6th-grade reading level, and is always read aloud.
- Each level opens with a spoken one-sentence goal, like "Eat leaves. Stay in the shade."
- Read-aloud uses the browser's built-in speech (Web Speech API) with the Chromebook's own voices. Captions highlight each word as it's read. If no voice is available, captions still show.
- Panels: Arial, large black text on light panels, no gray text.

## 7. Accessibility

All items below are in version 1.

- **First-run Accessibility panel:** big buttons, everything read aloud. Settings save with progress and travel in the save code.
- **Switch access:**
  - 1-switch and 2-switch scanning. A highlight cycles a small ring (8 directions, Action, Worm View, Pause) at an adjustable speed.
  - Works with ChromeOS Switch Access (Space/Enter) and gamepad buttons.
- **Assisted steering:** choose a target (food, burrow, shade) and the worm moves there by itself.
- **Color-blind modes:**
  - Settings for red-green (protanopia, deuteranopia) and blue-yellow (tritanopia), plus high contrast. They swap one central color set.
  - The fall forest palette is mostly red, orange, yellow and green, which is the hardest mix for red-green color blindness, so these modes matter here.
- **Meaning is never carried by color alone:** shapes, patterns, words and icons carry every signal.
- **Game speed:** 50% to 100%.
- **Relaxed mode:** longer predator warnings, slower frost, optional timers. The science stays the same.
- **No holding or mashing:** every hold can be tap-to-toggle. No rapid-press inputs.
- **Captions:** all speech is captioned, and important sounds get on-screen cue icons.
- **Voice speed control** and **Mute voice**.
- **Menus are real web elements** (not drawn inside the game), so the ChromeOS screen reader (ChromeVox) and keyboard navigation work, with a visible focus outline.
- **Flash safety:** nothing flashes more than 3 times per second.
- **Motion comfort:** gentle 3D camera, no screen shake. Reduce motion covers camera moves, the forest-change animation and effects.
- **Bigger buttons** option for touch.
- **Pause anywhere.** The game also pauses when the tab is hidden.

## 8. Technical design

### 8.1 Platform and build
- Target: low-end school Chromebooks in Chrome. 30 fps. Keyboard, trackpad, touch, gamepad and switch.
- Vite + TypeScript + Three.js. `vite-plugin-singlefile` packs everything into one `dist/index.html`.
- Asset budget: total file under 8 MB, aiming for 3 to 5 MB. Textures are compressed WebP, packed into the file.
- Shared as a link or as a file. It runs fully offline after loading.
- **No network at runtime.** A Content Security Policy meta tag blocks all outside connections (`connect-src 'none'`, no outside scripts, images or fonts). No accounts, no analytics.

### 8.2 Modules (`src/`)
| Module | Responsibility | Depends on |
|---|---|---|
| `core/` | Game loop (fixed timestep, 30 fps cap), pause, scene switching, game speed | — |
| `input/` | Turns keyboard, touch joystick, gamepad, switch scanning and assisted steering into one command stream: `{ move: Vec2, action, wormView, pause }` | `core` |
| `worm/` | Segment-chain body, growth, Moisture, clitellum, cocoons, damage. Works the same in both views | `core` |
| `surface/` | 3D forest floor: terrain, many leaves drawn in batches, sun and shade zones, follow camera | `render`, `worm` |
| `underground/` | Side-view block soil you can eat through (chunked meshes), tunnels, castings, frost line | `render`, `worm` |
| `creatures/` | Robin and mole using a warn → strike → leave pattern. Designed for adding creatures later | `worm`, `senses` |
| `senses/` | Light, smell and vibration fields, plus the Worm View display | `render` |
| `levels/` | Data-driven level definitions: goal, spawns, timers, checkpoints, voice line IDs | all gameplay |
| `forest/` | Forest model (section 4.3) plus the forest change screen and neighbors | `content`, `render` |
| `content/` | Facts, voice lines, sources, species. Build-time source check | — |
| `ui/` | Web-element menus, HUD, captions, accessibility panel, "How do we know?" screen | `speech`, `save` |
| `speech/` | Web Speech API wrapper, speech queue, rate, word-boundary caption highlighting | — |
| `save/` | Local save, plus save code (compact JSON → base64url + checksum) that includes settings | — |
| `render/` | Three.js setup, painted-naturalist material, color-set swapping, auto quality tiers | — |

Gameplay modules only see commands from `input/`, never raw devices. That's how every input method works in every level.

### 8.3 Painted-naturalist look
- The World of Warcraft painted feel: rich warm light, soft color bands, a subtle brushstroke texture, warm rim light.
- Species are drawn **accurately enough to recognize on a field walk**: trillium has 3 petals and 3 leaves, paper birch has peeling white bark with dark marks, the robin has correct markings.
- Shapes are simplified, not exaggerated.
- **The worm has no eyes.** Its expression comes from body motion, squash-and-stretch and a moving prostomium.
- Most of the look comes from shaders on simple models, with hand-picked painted textures where accuracy matters.

### 8.4 Performance
- **Auto quality:** if fps stays under 30, lower the render resolution, then turn off rim light, then reduce leaf density.
- Test builds show an fps counter.

## 9. Art pipeline (fal.ai)

- Uses Matt's fal.ai account. **Hard cap: $5 total.** The key is read from the `FAL_KEY` environment variable and is never committed or printed.
- Check current fal.ai pricing and pick a low-cost model before the first request.
- Every request is logged in `art/spend-log.md` (date, model, prompt, image count, cost, running total). Stop and ask Matt before any request that would push the total past $5.
- What gets generated:
  - painted textures: birch bark, soil, leaf types, litter
  - neighbor-card species portraits: trillium, ovenbird, sedge, sugar maple, robin, mole, fungus
  - forest-slice paintings
- Every image is checked for species accuracy before use. Rejected images are not used.
- Generated source images live in `art/`. Optimized versions go into the build.

## 10. Testing

- **Unit tests (Vitest):** worm growth and Moisture, forest model outputs, save code round trip including a corrupted code, input mapping including switch scanning, content source check.
- **Browser tests (Playwright):**
  - the built `index.html` loads with the network off and makes zero network requests
  - keyboard-only and switch-scanning playthrough of menus
  - axe-core accessibility scan of menus and panels
  - every level loads and its goal can be completed through scripted input
- **Manual:**
  - Step 0 run by Matt on a real student Chromebook
  - a small student playtest before full class use

## 11. Build order

0. **Chromebook speed test.** A small page with the 3D forest floor, painted material, about 2,000 leaves drawn in batches, a worm and the follow camera, with an on-screen fps counter. Matt opens it on a student Chromebook. **Pass = at least 30 fps.** If it fails, the forest floor also uses the side view, and the art and systems carry over.
1. Core loop, worm, all input methods including switch scanning and assisted steering, save, and Chapter 1 with placeholder art.
2. Underground side view and Chapter 2.
3. Forest change screen, neighbors, content and sources, read-aloud with captions.
4. Complete the accessibility panel: color-blind modes, game speed, relaxed mode, captions, flash and motion settings.
5. Art pass with fal.ai, speed tuning, student playtest.

## 12. Project setup

- Repo: `github.com/mattnupen/worm-simulator` (private). Can be made public later to use GitHub Pages for a shareable student link.
- `.superpowers/` (brainstorm mockups), `node_modules/` and `dist/` are git-ignored.
