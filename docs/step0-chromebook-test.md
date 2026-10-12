# Chromebook speed test

This checks whether the 3D forest floor runs at 30 fps on a student Chromebook, and which
graphics setting suits it. It takes about 30 seconds.

## Get the game onto the Chromebook

- **Website:** open wormsimulator.com.
- **As a file:** on the Mac, run `npm run verify:build`. This makes `dist/index.html`, one file.
  Copy it to the Chromebook in either of these ways:
  - **USB stick:** copy `index.html` onto it, plug it in, then open it from the Files app.
  - **Google Drive:** upload `index.html`. On the Chromebook, open the Files app, then
    Google Drive, then right-click the file and choose **Open with Chrome**.
    (Opening it on the drive.google.com website shows a preview instead of running it.)

## Open the speed test

- **From the menu (V1 and V2 only):** on the start screen, choose **Speed test**. From V3 on, the
  Start screen has no Speed test button (Matt, 2026-10-12), so use the link.
- **With a link (every version):** add `?speedtest=1` to the end of the address (for example
  `wormsimulator.com/?speedtest=1`) and press Enter. The game opens straight on the speed test.

## Run it

1. Plug the Chromebook in. Battery saver can slow it down.
2. Close other tabs.
3. Click **Start speed test**. Don't touch anything for about 30 seconds, and keep the tab open
   and visible.
4. Read the big **PASS** or **FAIL**.
   - The report also lists the longest pause during the automatic test, and, if it
     happened, how many times the measurement restarted. If it says the restart limit
     was reached, the tab kept losing focus. Keep the tab open and visible, then run
     it again.
   - The **Leaves** line is how many leaves were drawn at the end of the test (the base litter
     plus the close-up detail leaves). It is lower than the graphics setting's full count if the
     test had to drop to the simplest quality level. If the result is FAIL, share the copied
     results with your teacher (paste them into the Claude session).
5. Click **Copy results** and paste them into the Claude session.
6. Click **Use recommended setting** to save the graphics setting the test suggests for this
   Chromebook. It stays saved on this Chromebook, and the screen then says which setting it saved.
7. Click **Back to start**, then **Crawl** to try the worm. Steer with the arrow keys, W A S D,
   or the round joystick pad in the bottom left. Press **Esc** or **P**, or the **Pause**
   button in the top right, to pause.

## Graphics settings

**Graphics** (on the start screen and in the pause menu) has five choices. A change shows at
once and is remembered on this computer. Press **Esc** or choose **Back** to leave the screen.

- **Auto** (the default): starts on High and lowers detail if the game slows down.
- **Low:** fewest leaves, simple light. For slow computers.
- **Medium:** more leaves and soft light effects.
- **High:** lots of leaves and full effects. Best for most school Chromebooks.
- **Ultra:** the most leaves and the sharpest picture. For fast computers.

## Extra checks (optional)

Add these to the end of the address:
- `?fps=1`: show the frame rate and the graphics setting in use (a small tag in the top right)
  on every screen that draws the forest, including the start screen. (The speed test shows
  this tag on its own, without `?fps=1`.)
- `?preset=low` (or `medium`, `high`, `ultra`): use that setting for this visit only, without
  saving it. The speed test then measures that setting. (Without it, the speed test measures High.)

To use more than one, join them with `&`, for example `?speedtest=1&preset=medium`.

## What the quality level means

The report's "Quality level used" is what **Use recommended setting** saves. The recommendation
never goes above the setting that was tested: a test run with `?preset=low` will not recommend
High.

- **0:** High.
- **1 or 2:** Medium.
- **3:** Low.
- **FAIL:** please send the copied results to Matt; this Chromebook may need a simpler forest.
