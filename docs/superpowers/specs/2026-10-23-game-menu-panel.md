# The game menu: one tab, an icon column, a small card (serves V4, as an emergency fix)

Matt asked for a way to read about the project, try every round and replay the opening (project
thread "Project home page designs", 2026-10-23). After three rounds of mockups he picked **K: one
tab opens just the icons first** on the design canvas
(https://claude.ai/artifact/FC7WCHtqW54fudLj1MxPf1), and answered six design questions the same
day. This spec turns those answers into the build.

Matt's words for the goal: "not take up a lot of space and be clean and simple."

## What it is

One small tab sits at the top left of the screen on Start, while crawling (surface and
underground), while paused, and on Vote. The opening, the nest scene, the lesson and the speed test
keep the whole screen and have no tab.

1. **Closed:** just the tab (a menu icon, 48 px square, cream card, the theme's float shadow).
2. **Tap the tab:** an icon column grows down from it. It has icons only, no words:
   - Mission (flag)
   - Rounds (list)
   - Settings (sliders, the icon Settings uses today)
   - About (an "i" in a circle)
   - a thin line, then **Pause / Resume** (pause bars, which turn into a play triangle while paused)
3. **Tap an icon:** a small card (about 320 px wide, only as tall as its content, scrolls past
   640 px) opens beside the column. Tap the same icon again to hide the card, and keep the column.
   Tap a different icon to switch pages.
4. **Tap the tab again** (it shows an X while open): everything folds back to the tab.

The game keeps running while the menu is open (Matt, Q2). Only the Pause icon stops it.

## The four pages

**Mission** (Matt, Q3: the one-line mission moves in here, so the play screen shows only the tab)
- The round's mission line, the same `Line` the crawl card shows today (`missionStep.short ??
  notice`), with its source as now.
- The three quests in one line each: a mark (a tick, a number, or a lock; never colour alone) plus
  words: "Learn · done", "Play · 4 of 5 minutes", "Vote · after Play". They show progress only;
  the quest buttons stay on Start.
- "Back to start" (it moves here from the Pause card).

**Rounds** (Matt, Q5)
- First line: "Watch the opening again". It follows today's rule: it shows only once the opening
  has been seen this version, or always on the `?opening=1` preview link. Like the replay on Start
  today, it starts the worm over at the bait cup.
- Then the rounds, newest first, as a timeline: a numbered dot, the name, and "Play" (a link to
  its frozen `/vN/`). The round being played says "You're playing this one" instead of a link.
- Future rounds are listed too, with no link: "Round 5 · Coming soon" through "Round 8 · Coming
  soon". There are no names until each round is planned. (V8's planned name, "The Forest Changed",
  could show now; Matt to say.)
- At the bottom: "What changed in each round", a link to `CHANGELOG.md` on GitHub (the repo is
  public), opening in a new tab.

**Settings**
- Sound (On, Off), Text size (Normal, Big, Bigger) and Graphics (Auto, Low, Medium, High,
  Ultra), as real radio buttons. The Graphics choices keep their one-line descriptions, under the
  row, for the picked choice only.
- The same save rules as today: a setting is saved only when the player really picks it.

**About**
- Three short lines, then one link:
  - "You are an earthworm on a Minnesota forest floor. Earthworms here came from Europe and Asia,
    and they change the forest." (`mndnr-earthworms`, already in `src/content/sources.ts`)
  - "6th graders help make this game. Each round they learn a topic, play, and vote on what comes
    next."
  - "No accounts. No tracking."
  - a "Sources" link, which opens the game's sources list.
- All of this text goes in `src/content/` like every other in-game line.

## What it replaces (Matt, Q4)

| Today | After |
|---|---|
| Settings button on Start and Pause, and the Settings screen | Settings page in the menu |
| "Versions" link on Start, and its pop-up (`versionsDialog.ts`) | Rounds page |
| "Watch the opening" button on Start | First line of Rounds (the `?opening=1` preview keeps its button under the title) |
| The Pause card (Resume, Settings, Back to start) | The Pause/Resume icon, plus "Back to start" on Mission |
| Esc or P pauses | Esc closes the open card, then the column (focus goes back to the tab). P does nothing. |
| The one-line mission card while crawling | Mission page |

What stays: Start's quest list and Crawl button, the underground hint card, the robin hunt's
own screens, the lesson and Vote screens, and an automatic pause when the browser tab is
hidden. Today a hidden tab opens the Pause card, and it will now pause the same way the Pause icon
does.

**While paused,** the game freezes as it does today, the Pause icon shows a play triangle, and a
small "Paused" chip with a Resume button sits top centre (bottom centre on a phone), clear of the
menu's card, so a paused game never looks broken.

## Keyboard, touch and screen readers

- The tab, the icons and the card's controls are real `<button>`s, links and radio inputs, in a
  `<nav aria-label="Game menu">`. It is not a modal dialog, because the game keeps going.
- Every icon has a spoken name (`aria-label`) and the same word as a hover tooltip. The open page
  is marked with `aria-current`, plus a border, not colour alone.
- 48 px targets (the HUD rule in `hud.css`), a 4 px focus ring, 18 px+ text at Normal size, and
  everything sized in rem so Text size reaches it.
- The menu comes first on the page, so Tab reaches its tab first. Space and Enter press a focused
  menu button (never the worm's Action), and radio buttons keep the arrows. A mouse or touch press
  on the menu while playing hands the keys straight back to the worm, and so does Esc once the
  menu has folded.
- No motion beyond a short slide (150 ms), and none when `prefers-reduced-motion` is set.

## How it is built

- One new module, `src/ui/gameMenu.ts`, plus `gameMenu.css` on the `theme.css` tokens. It is
  built once at load and stays in the DOM. Opening a page only shows or hides elements, so there
  is no new 3D, nothing compiles, and the perf gates should not move.
- `ROUNDS` in `src/version.ts` gains a small `PLANNED_ROUNDS = 8` (or a list of future names), so
  the future rows come from one place.
- The screens state machine (`src/game/screens.ts`) loses the `graphics` screen. `pause` stays as
  the frozen state (drawn as the chip), and Back to start and the opening's replay now also work
  from play.
- `showStart` drops its Settings, Watch and Versions buttons (`versionsDialog.ts` is deleted);
  `showCrawl` draws no mission card; `settingsMenu.ts` now builds the Settings page's fields.
- Saves: no new save keys. The menu always starts closed.
- The CSP is unchanged: the GitHub and `/vN/` links are plain links that open a new tab.
- Tests: unit tests for the new paused flag and screen transitions, and e2e tests for opening and
  closing the menu, each page, Esc, Pause/Resume, and a phone-sized screen.

## Which version

V4 was frozen on 2026-10-23, the same day. Matt chose to **re-freeze `/v4/` as an emergency fix**
before students start Monday, once he has tried it on the root build, noted in the V4 doc the way
`/v3/` was re-frozen on 2026-10-13.

## Decision tests (FRAMEWORK.md section 5)

- **Size (P8, P13):** this is a fix, not a student-designed headline. It changes menus only, it
  can be rolled back in one revert, and it doesn't compete with the round's headline.
- **Loop (P4):** the Rounds page and the changelog link let students see what each round built
  from their input, any time.
- **Evidence (P3):** the About page's fact keeps its source. No new facts.
- **Load (P11, P12):** the play screen has less on it (no mission card, no Pause card), and every
  page is short.
- **Privacy (P14):** no data, accounts or outside calls are added. The links only open new tabs.
- Learn first, student design, decision quality, critique, integration and equity: not affected,
  because no round content or ballot changes.

## Defaults Claude picked (easy to change)

- Round 8 says "Coming soon" like Rounds 5–7, not its planned name.
- No key opens the menu. Tab reaches the menu's tab first, since it comes first on the page.
